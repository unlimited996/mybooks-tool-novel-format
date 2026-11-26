# mybooks-tool-novel-format

MyBooks「工具箱」里的小说排版整理工具。界面按图书管理的习惯做：搜索、分页、跨页勾选，
点「开始排版」后弹出排版弹窗，逐本处理并覆盖回书库。

排版算法在浏览器端运行，书库读写由工具自己的后端接口完成（走 MyBooks Core API），
不依赖主程序里额外的 `/api/novel_format/*` 路由。

## 功能

- 书籍列表：搜索（支持 calibre 语法）、分页（20/50/100/200）、封面/标签/格式展示
- 勾选：跨页保留、按 id 去重、全选本页、一键清空
- 弹窗：原文/结果只读预览（各限 5 万字）、排版选项、繁简转换、章节分割/重排、
  自动覆盖、自动识别作者、覆盖/跳过/完成、批次进度与日志
- 最小化：弹窗可收起到悬浮条，排版/覆盖在后台继续
- 内存与响应：排版跑在 Web Worker（每本一个，结束即终止），每本之间停 200ms、每 10 本额外停 800ms
- 覆盖成功后追加「精校」标签（只追加，不清空原有标签），下一批自动跳过已校正的书

## 后端接口

`manifest.json` 的 `api_routes` 声明了 4 个接口，前端通过
`MyBooksToolBridge.fetch(<path>)` 调用（实际地址为
`/api/toolbox/tool/novel_format/<path>`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `books?page=&num=&search=&desc=` | 书籍列表（id/标题/作者/标签/格式） |
| GET | `text?book_id=` | 读取 TXT 全文；自动识别 BOM / UTF-8 / GB18030 / Big5 |
| POST | `save` | 覆盖 TXT（`content`/`encoding`/`expected_size`/`source_chars`/`author`/`tag`） |
| POST | `convert` | 繁简转换（复用宿主的 OpenCC 引擎） |

`save` 会校验 `expected_size` 与当前文件大小一致、结果长度不低于原文的 10%，避免文件已变化
或误传预览片段时覆盖；成功后用宿主 `ExtractService` 强制重建 TXT 章节索引，并按 `tag`
决定是否追加「精校」标签。`save` 仅管理员可用，其余读接口登录即可。

耗时操作不占用 Tornado 主线程：列表/读取走宿主只读线程池（`run_calibre_read_async`），
覆盖走 calibre 写线程池（`run_calibre_async`），繁简转换走通用线程池。

## 依赖

- MyBooks v4.7.0+（Core API 1.5.0）
- 内置工具箱 `chinese_converter`（繁简转换）；缺少时该选项会返回明确错误

## 目录

```
manifest.json
backend/tool.py              # BaseTool 入口 + 4 个 api_routes handler
frontend/index.html          # 书表 + 排版弹窗（原生 JS）
frontend/lib/novel.js        # 浏览器版排版算法（由 frontend/src/formatter 打包）
frontend/lib/novel-worker.js # Web Worker 版排版算法
frontend/src/formatter/      # 算法源码（novelUtils / textUtils / regex / authorDetect）
scripts/browser_entry.mjs    # 打包入口
scripts/worker_entry.mjs     # Worker 打包入口
scripts/build-browser.sh     # 重新生成 frontend/lib/novel*.js
```

## 开发 / 打包

```bash
bash scripts/build-browser.sh     # 改了算法后重新打包
npm install -g mybooks-tools-builder
mytool validate .
mytool build                      # dist/novel_format-<version>.zip
```

## 安装

1. 系统设置 → 高级配置项 → 打开工具开发者模式
2. 系统管理 → 工具箱 → 上传 zip
3. 重启 MyBooks 服务
