var NovelFmt = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // scripts/browser_entry.mjs
  var browser_entry_exports = {};
  __export(browser_entry_exports, {
    detectAuthor: () => detectAuthor,
    formatNovelText: () => formatNovelText,
    reorderChaptersByTitle: () => reorderChaptersByTitle,
    splitInlineChapterTitles: () => splitInlineChapterTitles
  });

  // frontend/src/formatter/textUtils.js
  var normalizeNewlines = (text) => text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
  var splitTextIntoLines = (text, options = {}) => {
    if (!text) {
      return [];
    }
    const normalized = normalizeNewlines(text);
    let lines = normalized.split("\n");
    if (options.removeEmptyLines) {
      lines = lines.filter(Boolean);
    }
    return lines;
  };
  var cleanLines = (text, shouldTrim = false) => splitTextIntoLines(text).filter((line) => line.trim()).map((line) => shouldTrim ? line.trim() : line);
  var splitCNParagraph = (text) => {
    const paragraphCNSplitRegex = /(如下：(?!\n)|[^\n“”][。；！？]”?\b(?=[A-Za-z_･]{2,11}：[^\n“])|(?:\w」?；)(?=[^\n“”：；]{14})|(?<=\w：“[^\n“”]{1,39}[。！？—…]”)(?=[^\n“”：；]{1,39}：“)|(?:[^\n【】]】)(?=【\w{1,7}：)|(?:\w[：；。！？]{1,2}[”]?)(?=[第其][一二三四五六七八九][，、]|[一二三四五六七八九][则来是者]?[，、]|[①-⓿][^\n]|（[^\n（）]{17,29}[。！？…]）\n)|(?:[^\n“”][。！？—…]”)(?:[一-龥]{1,14}[说道]。)?(?=“[^\n“”])|(?<=[^\n]{4})(?:[^\n]{24}[。！？—…][』”’】］）]?)(?=[^\n]{29})(?<![。！？—…]\w{1,4}[！？…]{1,2})(?![、，。：；！？—…]|(?<=(\w{1,3})……)\2|(?<=[—…”])[^“”。：；！？—…]{1,14}[。：；！？—…]|(?<=……)(?:[等略]|以?及|的[^的确士])|(?<=[』”’】］）])[的地]))(?<!“[^\n”]{1,34}|‘[^\n’]{1,34}|「[^\n」]{1,34}|『[^\n』]{1,34}|（[^\n）]{1,34}|【[^\n】]{1,34}|［[^\n］]{1,34})(?![^\n“]{0,34}”|[^\n‘]{0,34}’|[^\n「]{0,34}」|[^\n『]{0,34}』|[^\n（]{0,34}）|[^\n【]{0,34}】|[^\n［]{0,34}］)/g;
    return text.replace(paragraphCNSplitRegex, "$1\n");
  };
  var splitEnglishParagraph = async (text) => Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), (s) => s.segment.trim()).filter(Boolean).join("\n");
  var splitParagraph = async (text, method = "cn") => {
    switch (method) {
      case "cn":
        return splitCNParagraph(text);
      case "en":
        return await splitEnglishParagraph(text);
    }
  };
  var toHalfWidth = (text) => text.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248));
  var filterLines = (text, filters, options = {}) => {
    const { exact = false, maxLen } = options;
    const list = (Array.isArray(filters) ? filters : filters.split(/[\n,]/)).map((w) => w.trim()).filter(Boolean);
    const exactSet = exact ? new Set(list) : void 0;
    const hasMaxLen = typeof maxLen === "number" && maxLen > 0;
    return splitTextIntoLines(text).filter((line) => {
      if (hasMaxLen && line.trim().length > maxLen) return true;
      if (exactSet) return !exactSet.has(line.trim());
      return !list.some((f) => line.includes(f));
    }).join("\n");
  };
  var dedupeAdjacentLines = (lines) => {
    if (lines.length === 0) return lines;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i].trim();
      const prev = i > 0 ? lines[i - 1].trim() : "";
      if (i === 0 || cur !== prev) out.push(lines[i]);
    }
    return out;
  };
  var SENTENCE_PUNCT_ONLY = /^[？！。…，、；：?!.,;:]+$/u;
  var isSeparatorBar = (s) => {
    const t = s.trim();
    return t.length >= 3 && /^[^\p{L}\p{N}\s]+$/u.test(t) && !SENTENCE_PUNCT_ONLY.test(t) && !/[\p{Emoji_Presentation}️]/u.test(t);
  };
  var compressNewlinesRegexCache = /* @__PURE__ */ new Map();
  var compressNewlines = (text, maxConsecutive = 2) => {
    if (maxConsecutive < 1) return text.replace(/\n+/g, "\n");
    let re = compressNewlinesRegexCache.get(maxConsecutive);
    if (!re) {
      re = new RegExp(`\\n{${maxConsecutive + 1},}`, "g");
      compressNewlinesRegexCache.set(maxConsecutive, re);
    }
    return text.replace(re, "\n".repeat(maxConsecutive));
  };
  var escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // frontend/src/formatter/regex.js
  var punctuationEndRegex = /(?:[。？！…”"」\]】)）※]|\.{3,}|-{3,}|—{3,}|={3,}|＝{3,})$/;
  var specialLineStartRegex = /^(?:[【「\[“"◆※].*|-{3,}|—{3,}|={3,}|＝{3,}|第.*[章节卷])$/;
  var pureNumberRegex = /^\d+$/;
  var numberStartRegex = /^\d+/;
  var numberEndRegex = /\d$/;
  var chapterTitleRegex = (
    // 回 的否定预查扩充:回到/回头/回来/回去/回了/回过 等常见句首动词短语在
    // 「数字+回」结构下曾被误判为章节标题(如「三回头看」),导致 reorder 把正文
    // 行当章节移位。
    // 裸标记词(序章/前言/正文/番外…)必须带边界预查:不锚定时任何以这些词
    // 开头的正文句("前言不搭后语"、"正文开始了")都被当标题,reorder 把该句
    // 及其后内容整段搬到文末。允许紧跟:行尾/空白/标点/括号/编号。
    // [上中下][部册]册 → [上中下][部册]:旧写法要求字面 "上部册",真实的
    // 上册/下部 反而永不匹配。
    // 复合形态显式收编:番外篇/正文卷 是起点式 TXT 导出的标准标题前缀
    // ("正文卷 第一章 …"),裸词加边界预查时漏掉它们会让这些标题失识别;
    // 预查类含「第」,容纳 "番外第三章" 直接相连的写法。
    // 「番外之」单列(不走边界预查):番外之一/番外之婚后生活 是晋江/起点的
    // 高频番外标题形态 —— 之 不能进共享预查类(否则 "序章之后，…" 这类散文
    // 也会命中),只对 番外 开例外。
    // [上中下][部册] 的预查窄到 行尾/空白/冒号:真实卷头是 "上册"/"下册 xxx",
    // 共享宽预查会把硬折行首的 "中部，丘陵…"/"上册第3页写道" 误判成标题,
    // reorder 会把其后整块正文搬到文末。
    /^(?:(?:序章|序言|引子|前言|卷首语|扉页|楔子|正文卷?|终章|后记|附录|尾声|番外篇?)(?=$|[\s：:，,、．.·\-—（(【\[「《0-9零一二三四五六七八九十第])|番外之|[上中下][部册](?=$|[\s：:])|第?\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|幕(?![前后布])|回(?![合访忆顾应答音到头来去了过])|部(?![分赛游])|篇(?!张))).*/
  );
  var CHAPTER_MARKERS = "\u7AE0\u8282\u5377\u96C6\u5E55\u56DE\u90E8\u7BC7";
  var numberTitleRegex = /^[ 　\t]{0,4}\d{1,5}([：:,.， 、_—\-]|【.{1,30}】).{0,30}$/;
  var chapterPattern = /^(第?\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}章)(.*)$/;
  var novelSectionHeaderRegex = /^(?:作者|(?:内容|作品)?简介|创作|标签)[:：]?/u;
  var CHAPTER_TITLE_MAX_LEN = 40;
  var chapterHeadRegex = /^第\s*[〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬\d]{1,10}\s*([章节卷集幕回部篇])/;
  var sentenceEndRegex = /[。.]$/;
  var innerCommaRegex = /[，,]/;
  var sectionLabelRegex = /^(?:序章|楔子|正文|终章|末章|后记|後记|尾声|番外|引子|[序前]言|卷首语|扉页|跋)/u;
  var detectChapterUnit = (lines) => {
    var _a;
    const tally = /* @__PURE__ */ new Map();
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || [...t].length > CHAPTER_TITLE_MAX_LEN) continue;
      const head = t.match(chapterHeadRegex);
      if (!head) continue;
      if (sentenceEndRegex.test(t) && innerCommaRegex.test(t.slice(0, -1))) continue;
      tally.set(head[1], ((_a = tally.get(head[1])) != null ? _a : 0) + 1);
    }
    let unit = null;
    let max = 0;
    for (const [m, n] of tally) {
      if (n > max) {
        unit = m;
        max = n;
      }
    }
    return unit;
  };
  var isChapterTitleLine = (line, unit) => {
    const t = line.trim();
    if (!t) return false;
    if ([...t].length > CHAPTER_TITLE_MAX_LEN) return false;
    if (!chapterTitleRegex.test(t) && !numberTitleRegex.test(t)) return false;
    const head = t.match(chapterHeadRegex);
    if (!head && sentenceEndRegex.test(t) && !sectionLabelRegex.test(t)) return false;
    if (head && head[1] !== "\u7AE0" && sentenceEndRegex.test(t) && innerCommaRegex.test(t.slice(0, -1)) && head[1] !== unit) return false;
    return true;
  };

  // frontend/src/formatter/novelUtils.js
  var isTitleLine = isChapterTitleLine;
  var chapterMarker = (s) => {
    const m = s.match(/第\s*[〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬\d]+\s*([章节卷集幕回部篇])/);
    return m ? m[1] : null;
  };
  var stripOrderPrefix = (s) => s.replace(/^(?:chapter|ch)\.?\s*(?:\d+|[ivxlcdm]+)\s*[.、:：\-]?\s*/i, "").replace(/^\s*(?:\d+|[ivxlcdm]+)\s*[.、．:：\-)\]】]?\s*/i, "").trim().toLowerCase();
  var isSameChapter = (a, b) => {
    const ta = a.trim();
    const tb = b.trim();
    if (ta === tb) return true;
    const oa = extractChapterOrder(ta);
    const ob = extractChapterOrder(tb);
    if (oa === null || ob === null || oa !== ob) return false;
    const ma = chapterMarker(ta);
    const mb = chapterMarker(tb);
    if (ma !== mb) return false;
    if (ma !== null) return true;
    return stripOrderPrefix(ta) === stripOrderPrefix(tb);
  };
  var chineseNumeralToNumber = (input) => {
    var _a;
    const map = {
      \u96F6: 0,
      "\u3007": 0,
      \u4E00: 1,
      \u4E8C: 2,
      \u4E24: 2,
      \u4E09: 3,
      \u56DB: 4,
      \u4E94: 5,
      \u516D: 6,
      \u4E03: 7,
      \u516B: 8,
      \u4E5D: 9,
      \u58F9: 1,
      \u8D30: 2,
      \u53C1: 3,
      \u8086: 4,
      \u4F0D: 5,
      \u9646: 6,
      \u67D2: 7,
      \u634C: 8,
      \u7396: 9
    };
    const unit = { \u5341: 10, \u62FE: 10, \u767E: 100, \u4F70: 100, \u5343: 1e3, \u4EDF: 1e3 };
    const chars = [...input];
    if (chars.length > 1 && chars.every((ch) => map[ch] !== void 0 || /\d/.test(ch))) {
      let v = 0;
      for (const ch of chars) v = v * 10 + ((_a = map[ch]) != null ? _a : Number(ch));
      return v;
    }
    let total = 0;
    let section = 0;
    let current = 0;
    let has = false;
    for (const ch of input) {
      if (map[ch] !== void 0) {
        current = current + map[ch];
        has = true;
      } else if (unit[ch] !== void 0) {
        if (current === 0) current = 1;
        section += current * unit[ch];
        current = 0;
        has = true;
      } else if (ch === "\u4E07" || ch === "\u842C") {
        section += current;
        if (section === 0) section = 1;
        total += section * 1e4;
        section = 0;
        current = 0;
        has = true;
      } else if (/\d/.test(ch)) {
        current = current * 10 + Number(ch);
        has = true;
      }
    }
    if (!has) return null;
    return total + section + current;
  };
  var romanToInt = (s) => {
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1e3 };
    let res = 0;
    let has = false;
    const up = s.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const val = map[up[i]];
      if (!val) continue;
      has = true;
      const next = i + 1 < up.length ? map[up[i + 1]] || 0 : 0;
      if (val < next) {
        res += next - val;
        i++;
      } else {
        res += val;
      }
    }
    return has ? res : null;
  };
  var extractChapterOrder = (title) => {
    const m = title.match(/第([〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬\d]+)\s*[章节卷集幕回部篇]/);
    if (m) {
      const cn = chineseNumeralToNumber(m[1]);
      if (cn !== null) return cn;
    }
    const en = title.match(/\b(?:chapter|ch)\.?\s*(\d+)\b/i);
    if (en) return parseInt(en[1], 10);
    const roman = title.match(/\b(?:chapter|ch)\.?\s*([ivxlcdm]+)\b/i);
    if (roman) {
      const r = romanToInt(roman[1]);
      if (r !== null) return r;
    }
    if (/^\s*(?:序章|序言|引子|前言|卷首语|扉页|楔子|终章|后记|附录|尾声|番外)/.test(title)) return null;
    const anyNum = title.match(/\d+/);
    if (anyNum) return parseInt(anyNum[0], 10);
    return null;
  };
  var reorderChaptersByTitle = (text) => {
    var _a;
    const lines = splitTextIntoLines(text || "");
    const unit = detectChapterUnit(lines);
    const chapters = [];
    let current = null;
    const preface = [];
    for (const line of lines) {
      if (isTitleLine(line, unit)) {
        if (current) chapters.push(current);
        const order = (_a = extractChapterOrder(line)) != null ? _a : null;
        current = { title: line, content: [line], order, idx: chapters.length };
      } else {
        if (!current) preface.push(line);
        else current.content.push(line);
      }
    }
    if (current) chapters.push(current);
    if (chapters.length === 0) {
      return { output: text, chapters: 0 };
    }
    const withIndex = chapters.map((c, i) => ({ ...c, i }));
    const firstNumbered = chapters.findIndex((c) => c.order !== null);
    const rank = (c) => c.order !== null ? 1 : firstNumbered === -1 || c.i < firstNumbered ? 0 : 2;
    withIndex.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1 && a.order !== b.order) return a.order - b.order;
      return a.i - b.i;
    });
    const parts = [];
    if (preface.length) parts.push(preface.join("\n"));
    for (const ch of withIndex) parts.push(ch.content.join("\n"));
    const out = compressNewlines(parts.join("\n\n"), 2);
    return { output: out, chapters: chapters.length };
  };
  var splitInlineChapterTitles = (text) => {
    return splitTextIntoLines(text).map((line) => {
      const trimmedLine = line.trim();
      const match = trimmedLine.match(chapterPattern);
      if (match) {
        const chapterTitle = match[1].trim();
        const restContent = match[2].trim();
        if (restContent.includes(")") || restContent.includes("\uFF09")) {
          return `${chapterTitle} ${restContent.replace(/[)）]/, "$&\n\n")}`;
        } else {
          const firstSpaceIndex = restContent.indexOf(" ");
          if (firstSpaceIndex !== -1) {
            return `${chapterTitle} ${restContent.substring(0, firstSpaceIndex)}

${restContent.substring(firstSpaceIndex + 1).trim()}`;
          } else if (restContent.length > 30) {
            return `${chapterTitle}

${restContent}`;
          } else {
            return `${chapterTitle} ${restContent}`;
          }
        }
      }
      return line;
    }).join("\n");
  };
  var removeLineEndNumbers = (text, minLen = 10) => {
    return splitTextIntoLines(text).map((line) => line.length >= minLen ? line.replace(/\d+$/, "") : line).join("\n");
  };
  var stripNovelArtifacts = (text) => {
    return text.replace(/[\uE000-\uF8FF\uFFFD]/g, " ").replace(/&nbsp;?/g, " ").replace(/Added Url/g, "").replace(/【待续】/g, "");
  };
  var AD_CUES = [
    /请牢记收藏|记住本站|加入收藏|收藏本页|请大家收藏[：:]/,
    /最快更新请?浏览器|最新最快无防盗|无防盗免费找书/,
    /免费找书|加书可加|找书群\s*[：:]?\d{5,}|本书首发/,
    /关注下方【?\s*QQ ?群|复制下方【?\s*QQ ?群号|复制下面群号|群号加入群聊|一键加群|搜索群号|加全订群|抽奖方式[：:]?\S{0,6}群[（(]?群号[：:]/,
    /(?:中转群|小说群|读书群|交流群|粉丝群|广告群|全订群|订阅群|新群|二群|三群)\s*[：:]?\s*\d{5,}/,
    /联系(?:管理|群管|管理员)?\s*(?:QQ|qq)\s*\d{5,}/,
    /如不慎该资源侵犯了您的权益|侵犯了您的权益|版权归所有|本作品仅供读者|文本仅供|仅供个人学习|请在下载后\d+\s*小时|请观看完毕后删除|24小时[內内]?(?:以)?内[除删]/,
    /每月更新\d+|每日更新\d+|日更\d+\s*[+＋]|全网小说资源|小说源共享|资源每日更新/,
    /从此告别书荒|告[，,]?别书荒/,
    /请购买正版书籍|购买正版谢谢合作|支持订阅正版|感谢对作者的支持|拒绝盗版|如果觉得本书不错/,
    /本书由【[^】]{1,12}】整理/,
    /(?:正在)?转码中|转码中[，,]?请稍后再试/,
    // 网址只吃 URL 安全字符：写成 [^\s，。]{4,} 会把紧跟其后的正文（"https://众人循着方向…"）
    // 一起吞进"广告跨度"，导致后面的判据误判。
    /(?:https?:\/\/|www\.)[A-Za-z0-9._\-\/:?&%#=~+@]{4,}/i,
    /笔趣阁|全文字阅读|txt下载|TXT下载|电子书下载/,
    /资源来自于网络|来自网络，仅作|学习交流使用|学习和试读|更多精彩|请访问|最新章节\W{0,3}请?访问/,
    // 旧 stripNovelArtifacts 里"整块拼齐才命中"的多行水印的残余碎片线索：那几条正则
    // 已删，这些片段必须在这里单独站得住（否则 "本群免费提取全网平台资源" 之类会留下半截）
    /怠惰小说下载器|DownloadAllContent|免费提取全网|全网平台资源|私聊群主|整理[,]?请勿/,
    // 群号行的三种排版：号码在括号内、用破折号引出括号外、或混进混淆字符里
    // 【月漪免费外群1号】——176132292 / 【千寻新免费满文件小说2群：960126270】
    // 【灵梦免费外群6号】——l/-i*/…梦/-首*发830907958
    // 判据取"群"后 30 字内出现 7 位以上连续数字：正文里的电话号码极少与「群」同现，
    // 而作者的打赏鸣谢行（非常感谢【书友160827132928773】的300起点币打赏。）没有「群」，
    // 不该被当成站点广告删掉。
    /群[^\n]{0,30}\d{7,}/,
    // 站方"温馨提醒"话术与引流括号群名
    /合理安排阅读时间|杜绝沉迷网络|尽在【[^】]{0,14}群】/
  ];
  var AD_CUE_SOURCES = AD_CUES.map((re) => `(?:${re.source})`).join("|");
  var AD_CUE_UNION = new RegExp(AD_CUE_SOURCES, "i");
  var AD_CUE_UNION_G = new RegExp(AD_CUE_SOURCES, "gi");
  var AD_SITE_BRANDS = ["\u523A\u732C\u732B", "\u83E0\u841D\u5305", "\u98DE\u5362", "\u98DE\u6CF8", "\u70B9\u5A18", "\u5C11\u5E74\u68A6", "\u606F\u58E4", "\u6B21\u5143\u59EC", "\u7B14\u8DA3\u9601", "\u7EB5\u6A2A", "\u664B\u6C5F", "17k", "18k", "\u8D77\u70B9", "\u756A\u8304", "\u4E03\u732B", "\u641C\u4E66\u5427", "sxsy"];
  var AD_PREFIX_RESIDUE = /全网|资源|学习|试读|正版|盗版|版权|书荒|转码|防盗|浏览|输入|网址|http|群|收藏|请访问|更多精彩|更新\d/;
  var AD_SYMBOL_HEAD = /^[\s=\-—─═_*#~|]{3,}/;
  var AD_PROSE_TAIL = /[。！？…”』」]$/;
  var adPrefixTrailsInOpenBracket = (s) => {
    const open = Math.max(s.lastIndexOf("\u3010"), s.lastIndexOf("\u300A"), s.lastIndexOf("\uFF08"), s.lastIndexOf("("));
    const close = Math.max(s.lastIndexOf("\u3011"), s.lastIndexOf("\u300B"), s.lastIndexOf("\uFF09"), s.lastIndexOf(")"));
    return open > close;
  };
  var AD_MARKETING = /群|收藏|网址|http|www|\.com|\.cn|全网|资源|首发|笔阁|正版|盗版|版权|书荒|转码|更新|下载|访问|试读|牢记|域名|本站/;
  var adCjkLen = (s) => (s.match(/[一-鿿぀-ヿ]/g) || []).length;
  var adContentLen = (s) => (s.match(/[一-鿿぀-ヿA-Za-z0-9]/g) || []).length;
  var adBrandCount = (s) => {
    const low = s.toLowerCase();
    return AD_SITE_BRANDS.reduce((n, b) => n + (low.includes(b.toLowerCase()) ? 1 : 0), 0);
  };
  var AD_HTML_TAG = /<[^>\n]{1,400}>?/g;
  function adInsideHtmlTag(line, at) {
    AD_HTML_TAG.lastIndex = 0;
    let m;
    while ((m = AD_HTML_TAG.exec(line)) !== null) {
      if (m.index <= at && at < m.index + m[0].length) return true;
      if (m.index > at) break;
    }
    return false;
  }
  var HTML_BLOCK_TAG = /<\/?(?:p|div|br)(?=>|[/\s])[^>\n]{0,120}>/gi;
  var HTML_INLINE_TAG = /<\/?(?:font|span|em|strong|small|center|u|i|b)(?=>|[/\s])[^>\n]{0,120}>/gi;
  var collapseHtmlLayoutTags = (text) => text.replace(HTML_BLOCK_TAG, "\n\n").replace(HTML_INLINE_TAG, "");
  var stripAdLines = (text) => {
    const out = [];
    for (const rawLine of splitTextIntoLines(text)) {
      const line = rawLine.trim();
      if (!line || !AD_CUE_UNION.test(line)) {
        out.push(rawLine);
        continue;
      }
      let cut = -1;
      for (const re of AD_CUES) {
        const m = re.exec(line);
        if (m && m.index >= 0 && (cut === -1 || m.index < cut)) cut = m.index;
      }
      if (cut === -1) {
        if (adBrandCount(line) >= 2 && line.length > 12) continue;
        out.push(rawLine);
        continue;
      }
      if (adInsideHtmlTag(line, cut)) {
        out.push(rawLine);
        continue;
      }
      if (AD_SYMBOL_HEAD.test(line)) continue;
      const prefix = line.slice(0, cut).trim();
      const tail = line.slice(cut);
      const prefixClean = !!prefix && !adPrefixTrailsInOpenBracket(prefix) && !AD_PREFIX_RESIDUE.test(prefix) && adBrandCount(prefix) <= 1;
      if (!prefixClean) continue;
      const tailIsAdRun = tail.length <= 80 && !/[。！？]/.test(tail);
      if (!tailIsAdRun) {
        const residue = line.slice(cut).replace(AD_CUE_UNION_G, " ");
        if (adCjkLen(residue) >= 8 && !AD_MARKETING.test(residue)) out.push(rawLine);
        continue;
      }
      if (adContentLen(prefix) >= 6 || AD_PROSE_TAIL.test(prefix) && adContentLen(prefix) >= 1) out.push(prefix);
    }
    return out.join("\n");
  };
  var collapseDuplicateChapterTitles = (lines) => {
    const unit = detectChapterUnit(lines);
    const nonEmpty = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim());
    const drop = /* @__PURE__ */ new Set();
    const dropRange = (from, to, except) => {
      for (let k = from; k <= to; k++) {
        if (k !== except) drop.add(k);
      }
    };
    let p = 0;
    while (p < nonEmpty.length) {
      if (!isTitleLine(nonEmpty[p].l, unit)) {
        p += 1;
        continue;
      }
      let keepIdx = nonEmpty[p].i;
      let keepText = nonEmpty[p].l;
      let q = p;
      for (; ; ) {
        let nextPos = null;
        if (q + 1 < nonEmpty.length && isTitleLine(nonEmpty[q + 1].l, unit) && isSameChapter(keepText, nonEmpty[q + 1].l)) {
          nextPos = q + 1;
        } else if (q + 2 < nonEmpty.length && !isTitleLine(nonEmpty[q + 1].l, unit) && isTitleLine(nonEmpty[q + 2].l, unit) && isSameChapter(keepText, nonEmpty[q + 2].l)) {
          nextPos = q + 2;
        }
        if (nextPos === null) break;
        const next = nonEmpty[nextPos];
        if (next.l.trim().length > keepText.trim().length) {
          dropRange(keepIdx, next.i, next.i);
          keepIdx = next.i;
          keepText = next.l;
        } else {
          dropRange(keepIdx + 1, next.i, keepIdx);
        }
        q = nextPos;
      }
      p = q + 1;
    }
    return lines.filter((_, i) => !drop.has(i));
  };
  var formatNovelText = async (text, opts) => {
    let processedInput = normalizeNewlines(text);
    processedInput = stripNovelArtifacts(processedInput);
    processedInput = toHalfWidth(processedInput);
    processedInput = collapseHtmlLayoutTags(processedInput);
    processedInput = stripAdLines(processedInput);
    processedInput = processedInput.replace(new RegExp(`([${CHAPTER_MARKERS}])[\u3001\uFF1A:]`, "g"), "$1 ").replace(/([\u4e00-\u9fa5]) {2,}([\u4e00-\u9fa5])/g, (match, g1, g2) => {
      return CHAPTER_MARKERS.includes(g1) ? match : g1 + " " + g2;
    });
    if (opts.enableChapterSplit) {
      processedInput = splitInlineChapterTitles(processedInput);
    }
    if (opts.filterText) {
      processedInput = filterLines(processedInput, opts.filterText, { maxLen: opts.maxFilterLineLength });
    }
    if (opts.enableLineEndNumbers) {
      processedInput = removeLineEndNumbers(processedInput, 10);
    }
    if (opts.enableParagraphSplit) {
      processedInput = await splitParagraph(processedInput);
    }
    let lines;
    if (opts.smartLineBreak) {
      lines = cleanLines(processedInput, opts.enableTrim);
    } else {
      lines = splitTextIntoLines(processedInput);
      if (opts.enableTrim) {
        lines = lines.map((line) => line.trim());
      }
    }
    const prepared = opts.mergeDuplicateChapterTitles ? collapseDuplicateChapterTitles(lines) : lines;
    const processedLines = opts.removeDuplicateLines ? dedupeAdjacentLines(prepared) : prepared;
    const chapterUnit = detectChapterUnit(processedLines);
    if (opts.smartLineBreak) {
      const result = [];
      const specialStartRegex = opts.specialStart ? new RegExp(`^${escapeRegExp(opts.specialStart)}`) : null;
      for (let i = 0; i < processedLines.length; i++) {
        const currentLine = processedLines[i];
        if (currentLine.startsWith("\u5206\u5377\u9605\u8BFB") && currentLine.length <= 10) {
          result.push("\n\n");
          continue;
        }
        if (isSeparatorBar(currentLine)) {
          result.push("\n\n");
          continue;
        }
        const previousLine = i > 0 ? processedLines[i - 1].trim() : "";
        const isChapterOrNumber = isTitleLine(currentLine, chapterUnit) || pureNumberRegex.test(currentLine);
        const isSpecialStart = novelSectionHeaderRegex.test(currentLine) || (specialStartRegex == null ? void 0 : specialStartRegex.test(currentLine.trim())) || opts.specialStart && previousLine.startsWith(opts.specialStart);
        const startsWithSpecialChar = specialLineStartRegex.test(currentLine) || numberStartRegex.test(currentLine);
        const prevEndsWithPunctuation = punctuationEndRegex.test(previousLine) || numberEndRegex.test(previousLine) || isSeparatorBar(previousLine);
        if (isChapterOrNumber) {
          result.push("\n\n" + currentLine + (opts.enableIndent ? "\n\n\u3000\u3000" : "\n\n"));
        } else if (isSpecialStart) {
          result.push("\n\n" + currentLine);
        } else if (startsWithSpecialChar || prevEndsWithPunctuation) {
          result.push(opts.enableIndent ? "\n\n\u3000\u3000" + currentLine : "\n\n" + currentLine);
        } else {
          result.push(currentLine);
        }
      }
      processedInput = result.join("");
      processedInput = processedInput.replace(/\n{2,}　　\n{2,}　　/g, "\n\n\u3000\u3000").replace(/\n{2,}　　\n{2,}/g, "\n\n");
      processedInput = compressNewlines(processedInput, 2).trim();
    } else {
      const kept = processedLines.filter((l) => !isSeparatorBar(l));
      processedInput = kept.join("\n");
      processedInput = compressNewlines(processedInput, 1).trim();
    }
    return processedInput;
  };

  // frontend/src/formatter/authorDetect.js
  var MAX_SCAN_CHARS = 8e3;
  var MAX_SCAN_LINES = 60;
  var MAX_AUTHOR_LEN = 24;
  var CN_NUM = "[0-9\uFF10-\uFF19\u3007\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u4E07\u4E24\u58F9\u8D30\u53C1\u8086\u4F0D\u9646\u67D2\u634C\u7396\u62FE\u4F70\u4EDF\u842C]+";
  var CHAPTER_LINE = new RegExp(
    `^\\s*(?:\u7B2C\\s*${CN_NUM}\\s*[\u7AE0\u8282\u56DE\u5377\u96C6\u90E8\u7BC7\u5E55]|\u5E8F\u7AE0|\u5E8F\u8A00|\u6954\u5B50|\u5F15\u5B50|\u524D\u8A00|\u76EE\u5F55|\u5185\u5BB9\u7B80\u4ECB|\u6587\u6848|\u7B80\u4ECB)`
  );
  var BAD_AUTHOR_CHARS = /[。，,！？!?；;、<>《》【】()（）"“”'‘’：:/\\|]/;
  var BAD_AUTHOR_WORDS = /(?:第.{1,6}[章节回卷]|小说|全集|下载|网址|http|www|\.com|\.cn|佚名网|未知)/i;
  var BAD_AUTHOR_PREFIX = /^(?:的话|简介|作品|专栏|声明|寄语|公告|的话说|有话说|的|了|是|在|有)/;
  var AUTHOR_PATTERNS = [
    // 作者：XXX / 著者:XXX / 作家：XXX
    // 允许前面有书名或装饰符，例如「书名 作者：某某」「《书名》作者：某某」
    /(?:^|[^A-Za-z0-9])(?:原?作\s*者|著\s*者|作\s*家)\s*[:：]\s*(.+?)\s*$/,
    // 作者 张三 / 著者 阿西莫夫（没有冒号的写法）
    /(?:^|[^A-Za-z0-9])(?:作\s*者|著\s*者)\s+(.{1,20})\s*$/,
    // XXX 著 / XXX 编著 / XXX 原著（整行只有“名字 + 著作方式”）
    /^\s*(.{1,24}?)\s*(?:编著|原著|著)\s*$/
  ];
  var TRAIL_MARKER = /(?:字数|修改作者|更新时间|更新至|更新时间|更新|文案|内容简介|编辑推荐|推荐语|简介|出版|来源|转载|声明|发帖|发表于|正文|本章|章节|书名|作者|链接|https?:|www\.|于?\s*\d{4}\s*[年\-/]\s*\d{1,2})/;
  var TRAIL_BRACKET = /[（(【\[]\s*(?:第\s*[0-9一二三四五六七八九十百零]+\s*[章节回卷]?|[0-9一二三四五六七八九十百零]{1,4}|全|完)\s*[）)】\]]/;
  var WRAPPER_CHARS = /* @__PURE__ */ new Set(["\u3010", "[", "\uFF08", "(", "\u300A", "\u201C", '"', "'", "\u3011", "]", "\uFF09", ")", "\u300B", "\u201D", "\u2019"]);
  var stripWrappers = (input) => {
    let start = 0;
    let end = input.length;
    while (start < end && WRAPPER_CHARS.has(input[start])) start += 1;
    while (end > start && WRAPPER_CHARS.has(input[end - 1])) end -= 1;
    return input.slice(start, end);
  };
  var cleanCandidate = (raw, title = "") => {
    let name = String(raw || "").trim();
    name = name.replace(/[（(][^）)]{0,24}[）)]\s*$/, "").trim();
    name = stripWrappers(name).replace(/^作\s*者\s*[:：]\s*/, "").replace(/\s*(?:编著|原著|著)\s*$/, "").trim();
    const cut = name.search(TRAIL_MARKER);
    if (cut > 0) name = name.slice(0, cut).trim();
    const t = String(title || "").replace(/\s+/g, "");
    if (t && t.length >= 2) {
      const flat = name.replace(/\s+/g, "");
      const at = flat.indexOf(t);
      if (at > 0) name = flat.slice(0, at);
    }
    const bracket = name.search(TRAIL_BRACKET);
    if (bracket > 0) name = name.slice(0, bracket).trim();
    name = name.replace(/[＊*\u3000\u200b-\u200d]/g, "").trim();
    return stripWrappers(name).trim();
  };
  var isPlausibleAuthor = (name, title) => {
    if (!name) return false;
    if (name.length < 1 || name.length > MAX_AUTHOR_LEN) return false;
    if (BAD_AUTHOR_CHARS.test(name)) return false;
    if (BAD_AUTHOR_WORDS.test(name)) return false;
    if (BAD_AUTHOR_PREFIX.test(name)) return false;
    if (new RegExp(`^\u7B2C\\s*${CN_NUM}\\s*[\u7AE0\u8282\u56DE\u5377\u96C6\u90E8\u7BC7\u5E55]`).test(name)) return false;
    if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return false;
    const t = String(title || "").trim();
    if (t) {
      const a = name.replace(/\s+/g, "");
      const b = t.replace(/\s+/g, "");
      if (a && b && (a === b || b.includes(a) || a.length >= 2 && a.includes(b) && b.length >= 2)) {
        return false;
      }
    }
    return true;
  };
  var detectAuthor = (text, title = "") => {
    if (!text) return "";
    const head = text.slice(0, MAX_SCAN_CHARS);
    const lines = head.split(/\r?\n/);
    let scanned = 0;
    for (const line of lines) {
      const value = line.trim();
      if (!value) continue;
      scanned += 1;
      if (scanned > MAX_SCAN_LINES) break;
      if (value.length > 60 && !/(?:作\s*者|著\s*者|作\s*家)\s*[:：]/.test(value)) continue;
      for (const pattern of AUTHOR_PATTERNS) {
        const matched = value.match(pattern);
        if (!matched) continue;
        const candidate = cleanCandidate(matched[1], title);
        if (isPlausibleAuthor(candidate, title)) return candidate;
      }
    }
    return "";
  };
  return __toCommonJS(browser_entry_exports);
})();
