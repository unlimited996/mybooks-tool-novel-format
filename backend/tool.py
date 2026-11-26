"""小说排版整理 —— MyBooks Toolbox 工具后端入口。

排版算法本身在浏览器端运行（`frontend/src/formatter` 打包成 `frontend/lib/novel.js`），
这个后端只负责三件事：把书库里的 TXT 读出来给前端、把排版结果写回书库、以及调用宿主的
OpenCC 做繁简转换。对应 manifest.json 里声明的 4 个 `api_routes`：

    GET  books    书籍列表（搜索 / 分页，只带排版界面用得到的字段）
    GET  text     读取单本书的 TXT 全文（自动识别 BOM / UTF-8 / GB18030 / Big5）
    POST save     用排版结果覆盖原 TXT，并按需更新作者、追加「精校」标签
    POST convert  纯文本繁简转换

书库读走 Core API（`self.api.calibre`），TXT 章节索引重建复用宿主的 ExtractService；
所有方法都用 `@AsyncService.register_function` 包裹，确保 `self.db` / `self.session`
在当前调用里可用（与内置工具一致）。
"""
import codecs
import json
import logging
import os
import tempfile
from functools import partial

from tornado.ioloop import IOLoop

from webserver.i18n import _
from webserver.services import AsyncService
from webserver.handlers.base import BaseHandler, js, auth, is_admin
from webserver.toolbox.base_tool import BaseTool

TOOL_ID = "novel_format"

# 覆盖成功后追加的标记标签：下一批排版会自动跳过带此标签的书，避免重复校正
REVISED_TAG = "精校"

# 单本上限：排版结果要在浏览器内存里跑，100MB 纯文本已远超正常网文体量；
# 与主程序 novel_format 接口保持一致，避免 40–100MB 的大部头被无故拒绝。
MAX_TEXT_BYTES = 100 * 1024 * 1024
# 编码识别只需要样本，整本参与评分反而慢
ENCODING_SAMPLE_BYTES = 64 * 1024
# 全文解码后允许的替换字符占比；超过说明编码选错了，宁可跳过也不写回乱码
MAX_BAD_RATIO = 0.002
# 覆盖兜底：排版结果不足原文字符数的 10% 时视为异常（例如误传了预览片段）
MIN_CONTENT_RATIO = 0.1
# 繁简转换单次上限：纯 Python OpenCC 逐词匹配，超大文本会长时间占住请求线程
MAX_CONVERT_CHARS = 8 * 1024 * 1024
CONVERT_DIRECTIONS = ("t2s", "s2t")
# 作者名长度上限：再长基本就是误提取的整句
MAX_AUTHOR_LEN = 40

# 判断"是不是像样的中文"用的常用字；乱码/错编码解码后命中数会非常低。
# 繁简两套都要有：否则 Big5 繁体正文在评分时会被 GB18030 解出的乱码反超。
_COMMON_HANZI = frozenset(
    "的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家"
    "可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情"
    "己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身"
    "者被高已亲其进此话常与活正感"
    "的一是了我不人在他有這個上們來到時大地為子中你說生國年著就那和要她出也得裡後自以會家"
    "可下而過天去能對小多然於心學麼之都好看起發當沒成只如事把還用第樣道想作種開美總從無情"
    "己面最女但現前些所同日手又行意動方期它頭經長兒回位分愛老因很給名法間斯知世什兩次使身"
    "者被高已親其進此話常與活正感"
)


class NovelFormatError(Exception):
    """带错误码的业务异常；HTTP handler 会把它转成前端认识的 `{"err": code}`。"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


async def _in_thread(func, *args, **kwargs):
    """把纯 CPU 的同步任务（如 OpenCC 转换）挪到通用线程池，避免卡住 Tornado 主线程。"""
    return await IOLoop.current().run_in_executor(None, partial(func, *args, **kwargs))


def _as_int(value, default: int = 0) -> int:
    """宽松转 int：布尔值和非法值直接当默认值，避免 True 被当成 book_id=1。"""
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clean_author(value) -> str:
    """校验前端传来的作者名，不合法一律返回空串（宁缺毋滥）。"""
    if not isinstance(value, str):
        return ""
    author = value.strip().strip("\"'“”‘’")
    if not author or len(author) > MAX_AUTHOR_LEN:
        return ""
    if any(ch in author for ch in "\r\n\t"):
        return ""
    return author


def _score_text(text: str) -> int:
    """常用字命中数减去替换字符惩罚；只用于挑编码，不做正文校验。"""
    hits = sum(1 for ch in text if ch in _COMMON_HANZI)
    return hits - text.count("\ufffd") * 5


def _decode_txt(raw: bytes):
    """把 TXT 原始字节解码成文本，返回 `(text, encoding)`。

    BOM → 严格 UTF-8 → （少量坏字节）容错 UTF-8 → GB18030/Big5 候选评分。
    两种候选都解不出像样中文时抛 `decode_failed`，避免把乱码写回书库。
    """
    if raw.startswith(codecs.BOM_UTF8):
        return raw[len(codecs.BOM_UTF8):].decode("utf-8", errors="replace"), "utf-8"
    if raw.startswith(codecs.BOM_UTF16_LE):
        return raw[2:].decode("utf-16-le", errors="replace"), "utf-16"
    if raw.startswith(codecs.BOM_UTF16_BE):
        return raw[2:].decode("utf-16-be", errors="replace"), "utf-16"

    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass

    # 少量坏字节（截断、混入个别非 UTF-8 片段）不应该让整本改按 GBK 解码
    text = raw.decode("utf-8", errors="replace")
    if text and text.count("\ufffd") / len(text) < 0.005:
        return text, "utf-8"

    sample = raw[:ENCODING_SAMPLE_BYTES]
    scores = {}
    for encoding in ("gb18030", "big5"):
        try:
            scores[encoding] = _score_text(sample.decode(encoding, errors="replace"))
        except LookupError:
            continue
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if not ranked or ranked[0][1] < 20:
        raise NovelFormatError("decode_failed", _("无法识别文本编码，已跳过本书"))
    best_encoding, best_score = ranked[0]
    # 两种候选都像中文且得分接近时，说明无法可靠判断；跳过比写错编码安全
    if len(ranked) > 1 and best_score < ranked[1][1] * 1.5:
        raise NovelFormatError("decode_failed", _("无法可靠识别文本编码，已跳过本书"))

    try:
        text = raw.decode(best_encoding)
    except UnicodeDecodeError:
        text = raw.decode(best_encoding, errors="replace")
        if text.count("\ufffd") / max(1, len(text)) > MAX_BAD_RATIO:
            raise NovelFormatError("decode_failed", _("文本编码无法完整识别，已跳过本书"))
    return text, best_encoding


def _encode_content(content: str, wanted: str):
    """按原文件编码写回；目标编码装不下转换后的字符时退回 UTF-8。"""
    wanted = (wanted or "utf-8").strip() or "utf-8"
    for encoding in (wanted, "utf-8"):
        try:
            return content.encode(encoding), encoding
        except (LookupError, UnicodeEncodeError):
            continue
    return content.encode("utf-8", errors="replace"), "utf-8"


class NovelFormat(BaseTool):
    service_item_name = "小说排版整理"

    @staticmethod
    def info():
        return {
            "tool_id": TOOL_ID,
            "name": "小说排版整理",
            "description": "批量把 TXT 小说按段落/章节重新排版并覆盖回书库，可选追加「精校」标签",
            "revision": "0.1.0",
            "author": "unlimited996",
            "publish_date": "2026-11-25",
            "repo_url": "https://github.com/unlimited996/mybooks-tool-novel-format",
        }

    # -- 内部工具 --

    def _txt_path(self, book_id: int) -> str:
        try:
            path = self.api.calibre.format_abspath(book_id, "TXT")
        except Exception:
            path = None
        if not path or not os.path.isfile(path):
            raise NovelFormatError("format.not_supported", _("该书籍没有 TXT 格式，无法排版整理"))
        return path

    # -- 书籍列表 --

    @AsyncService.register_function
    def list_books(self, page: int = 1, num: int = 50, search: str = "", desc: bool = True) -> dict:
        query = (search or "").strip()
        ids = self.api.calibre.search_ids(query) if query else self.api.calibre.all_book_ids()
        ids = sorted(ids, reverse=bool(desc))
        total = len(ids)

        num = max(1, min(int(num or 50), 500))
        page = max(1, int(page or 1))
        start = (page - 1) * num
        page_ids = ids[start:start + num]

        # get_data_as_dict 会为每本书构造完整元数据（O(全库)），翻页很伤；
        # get_field_map 只读本页需要的字段，耗时只和 page_ids 数量相关。
        titles = author_map = tag_map = format_map = {}
        if page_ids:
            titles = self.api.calibre.get_field_map("title", page_ids)
            author_map = self.api.calibre.get_field_map("authors", page_ids)
            tag_map = self.api.calibre.get_field_map("tags", page_ids)
            format_map = self.api.calibre.get_field_map("formats", page_ids)

        items = []
        for book_id in page_ids:
            formats = [str(fmt).upper() for fmt in (format_map.get(book_id) or [])]
            items.append({
                "id": book_id,
                "title": titles.get(book_id) or "",
                "author": ", ".join(author_map.get(book_id) or []),
                "tags": list(tag_map.get(book_id) or []),
                "files": [{"format": fmt} for fmt in formats],
                "has_txt": "TXT" in formats,
            })
        return {"items": items, "total": total, "page": page, "num": num}

    # -- 读取原文 --

    @AsyncService.register_function
    def get_text(self, book_id: int) -> dict:
        path = self._txt_path(book_id)
        size = os.path.getsize(path)
        if size > MAX_TEXT_BYTES:
            raise NovelFormatError(
                "text.too_large",
                _("文件超过 %(size)s MB，暂不支持排版整理")
                % {"size": MAX_TEXT_BYTES // (1024 * 1024)},
            )
        with open(path, "rb") as stream:
            text, encoding = _decode_txt(stream.read())

        try:
            title = self.api.calibre.get_metadata(book_id).title or ""
        except Exception:
            title = ""
        return {
            "id": book_id,
            "title": title,
            "content": text,
            "encoding": encoding,
            "size": size,
        }

    # -- 覆盖原文 --

    @AsyncService.register_function
    def save_text(
        self,
        book_id: int,
        content: str,
        encoding: str = "utf-8",
        author: str = "",
        expected_size=0,
        source_chars=0,
        tag: bool = True,
    ) -> dict:
        if not isinstance(content, str) or not content.strip():
            raise NovelFormatError("params.content.empty", _("排版结果为空，已取消覆盖"))

        path = self._txt_path(book_id)
        # 乐观并发校验：前端读到的文件在覆盖前又被改过（另一个标签页/外部工具）时拒绝写入
        expected_size = _as_int(expected_size)
        if expected_size and expected_size != os.path.getsize(path):
            raise NovelFormatError("text.changed", _("原文件在读取后已发生变化，请重新打开本书后再覆盖"))
        # 长度兜底：避免把预览片段、异常中断的结果当成全文覆盖
        source_chars = _as_int(source_chars)
        if source_chars and len(content) < source_chars * MIN_CONTENT_RATIO:
            raise NovelFormatError("content.too_short", _("排版结果明显短于原文，已阻止覆盖"))

        author = _clean_author(author)
        payload, used_encoding = _encode_content(content, encoding)

        fd, tmp_path = tempfile.mkstemp(suffix=".txt", prefix="novel_format_")
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(payload)
            self.api.calibre.add_format(book_id, "TXT", tmp_path, replace=True)
        except NovelFormatError:
            raise
        except Exception as exc:
            logging.error("[novel_format] save book %s failed: %s", book_id, exc)
            raise NovelFormatError("internal", _("覆盖失败：%s") % str(exc)) from exc
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        # 旧索引里的 start/end 是上一份文件的字节偏移，必须强制重算，否则阅读器跳章会错位
        try:
            from webserver.services.extract import ExtractService

            txt_path = self.api.calibre.format_abspath(book_id, "TXT")
            if txt_path:
                ExtractService().preheat_txt_content(book_id, txt_path, force=True)
        except Exception as exc:
            logging.warning("[novel_format] preheat txt content failed for %s: %s", book_id, exc)

        # 作者与「精校」标签一次性写回，避免两次元数据写入触发两次目录整理
        applied_author = ""
        tagged = False
        if tag or author:
            try:
                mi = self.api.calibre.get_metadata(book_id)
                tags = [str(item) for item in (mi.tags or [])]
                add_tag = bool(tag) and REVISED_TAG not in tags
                change_author = bool(author) and list(mi.authors or []) != [author]
                if add_tag or change_author:
                    if add_tag:
                        mi.tags = tags + [REVISED_TAG]
                    if change_author:
                        mi.authors = [author]
                        mi.author_sort = author
                    self.api.calibre.set_metadata(book_id, mi, force_changes=True)
                    tagged = add_tag
                    applied_author = author if change_author else ""
            except Exception as exc:
                # 元数据写入失败不影响正文已覆盖的结果，如实记日志即可
                logging.warning("[novel_format] update metadata failed for %s: %s", book_id, exc)

        return {
            "id": book_id,
            "size": len(payload),
            "encoding": used_encoding,
            "tagged": tagged,
            "author": applied_author,
        }

    # -- 繁简转换 --

    @AsyncService.register_function
    def convert(self, text: str, direction: str) -> dict:
        if not isinstance(text, str) or not text:
            raise NovelFormatError("params.text.empty", _("转换内容为空"))
        direction = (direction or "").strip()
        if direction not in CONVERT_DIRECTIONS:
            raise NovelFormatError("params.direction.invalid", _("不支持的转换方向"))
        if len(text) > MAX_CONVERT_CHARS:
            raise NovelFormatError("text.too_large", _("文本过大，请关闭繁简转换后重试"))

        try:
            from webserver.toolbox.chinese_converter.opencc_engine import OpenCC
        except Exception as exc:
            logging.error("[novel_format] OpenCC unavailable: %s", exc)
            raise NovelFormatError("internal", _("当前 MyBooks 版本不支持繁简转换")) from exc
        try:
            return {"text": OpenCC(direction).convert(text)}
        except Exception as exc:
            logging.error("[novel_format] convert failed (%s): %s", direction, exc)
            raise NovelFormatError("internal", _("繁简转换失败：%s") % str(exc)) from exc


# ---------------------------------------------------------------------------
# HTTP handlers（manifest.json 的 api_routes 声明，见该文件）


class BooksHandler(BaseHandler):
    @js
    @auth
    async def get(self):
        try:
            # 只读书库，走宿主的只读线程池，不占 ioloop
            data = await self.run_calibre_read_async(
                NovelFormat().list_books,
                page=self.get_argument("page", "1"),
                num=self.get_argument("num", "50"),
                search=self.get_argument("search", ""),
                desc=self.get_argument("desc", "true").lower() != "false",
            )
        except (TypeError, ValueError):
            return {"err": "params.invalid", "msg": _("分页参数不合法")}
        return {"err": "ok", "data": data}


class TextHandler(BaseHandler):
    @js
    @auth
    async def get(self):
        book_id = _as_int(self.get_argument("book_id", ""))
        if book_id <= 0:
            return {"err": "params.invalid", "msg": _("缺少或非法的 book_id")}
        try:
            data = await self.run_calibre_read_async(NovelFormat().get_text, book_id)
        except NovelFormatError as err:
            return {"err": err.code, "msg": str(err)}
        return {"err": "ok", "data": data}


class SaveHandler(BaseHandler):
    @js
    @is_admin
    async def post(self):
        try:
            body = json.loads(self.request.body or b"{}")
            if not isinstance(body, dict):
                raise ValueError("request body must be an object")
        except (TypeError, ValueError):
            return {"err": "params.invalid", "msg": _("请求体不是合法 JSON")}

        book_id = _as_int(body.get("book_id"))
        if book_id <= 0:
            return {"err": "params.invalid", "msg": _("缺少或非法的 book_id")}
        try:
            # 写操作走宿主的 calibre 写线程池（持 db_lock），避免和其它写入互相插队
            data = await self.run_calibre_async(
                NovelFormat().save_text,
                book_id,
                body.get("content"),
                encoding=body.get("encoding") or "utf-8",
                author=body.get("author") or "",
                expected_size=body.get("expected_size") or 0,
                source_chars=body.get("source_chars") or 0,
                tag=body.get("tag") is not False,
            )
        except NovelFormatError as err:
            return {"err": err.code, "msg": str(err)}
        return {"err": "ok", "msg": _("已覆盖原文件"), "data": data}


class ConvertHandler(BaseHandler):
    @js
    @auth
    async def post(self):
        try:
            body = json.loads(self.request.body or b"{}")
            if not isinstance(body, dict):
                raise ValueError("request body must be an object")
        except (TypeError, ValueError):
            return {"err": "params.invalid", "msg": _("请求体不是合法 JSON")}
        try:
            # 纯 CPU、不碰书库，放进通用线程池即可
            data = await _in_thread(NovelFormat().convert, body.get("text"), body.get("direction"))
        except NovelFormatError as err:
            return {"err": err.code, "msg": str(err)}
        return {"err": "ok", "data": data}
