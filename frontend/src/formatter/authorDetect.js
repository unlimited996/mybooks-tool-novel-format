/**
 * 从小说正文开头识别作者名（宁缺毋滥）。
 *
 * 只在「文件开头若干行、并且还没进入正文」的范围内找显式声明：
 *   - 作者：XXX / 作者:XXX / 著者：XXX
 *   - XXX 著 / XXX 编著 / XXX 原著
 * 找不到规范写法就返回空串，绝不拿书名、章节标题、正文句子去猜。
 */

const MAX_SCAN_CHARS = 8000;
const MAX_SCAN_LINES = 60;
const MAX_AUTHOR_LEN = 24;

const CN_NUM = "[0-9０-９〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬]+";
// 章节/卷首类行：出现即视为正文开始，停止扫描，避免把正文里的「作者：」当成书籍作者
const CHAPTER_LINE = new RegExp(
    `^\\s*(?:第\\s*${CN_NUM}\\s*[章节回卷集部篇幕]|序章|序言|楔子|引子|前言|目录|内容简介|文案|简介)`
);
// 作者名里不该出现的字符（有标点基本就是整句被误抓）
const BAD_AUTHOR_CHARS = /[。，,！？!?；;、<>《》【】()（）"“”'‘’：:/\\|]/;
// 明显不是人名的词
const BAD_AUTHOR_WORDS = /(?:第.{1,6}[章节回卷]|小说|全集|下载|网址|http|www|\.com|\.cn|佚名网|未知)/i;
// 无冒号写法容易把「作者 的话」「作者 简介」误当人名，这里做前缀兜底
const BAD_AUTHOR_PREFIX = /^(?:的话|简介|作品|专栏|声明|寄语|公告|的话说|有话说|的|了|是|在|有)/;

const AUTHOR_PATTERNS = [
    // 作者：XXX / 著者:XXX / 作家：XXX
    // 允许前面有书名或装饰符，例如「书名 作者：某某」「《书名》作者：某某」
    /(?:^|[^A-Za-z0-9])(?:原?作\s*者|著\s*者|作\s*家)\s*[:：]\s*(.+?)\s*$/,
    // 作者 张三 / 著者 阿西莫夫（没有冒号的写法）
    /(?:^|[^A-Za-z0-9])(?:作\s*者|著\s*者)\s+(.{1,20})\s*$/,
    // XXX 著 / XXX 编著 / XXX 原著（整行只有“名字 + 著作方式”）
    /^\s*(.{1,24}?)\s*(?:编著|原著|著)\s*$/,
];

// 作者后面经常跟字数、日期、简介、编辑推荐等元信息，命中即截断
const TRAIL_MARKER = /(?:字数|修改作者|更新时间|更新至|更新时间|更新|文案|内容简介|编辑推荐|推荐语|简介|出版|来源|转载|声明|发帖|发表于|正文|本章|章节|书名|作者|链接|https?:|www\.|于?\s*\d{4}\s*[年\-/]\s*\d{1,2})/;
// 括号里的章节/卷次标记，如「（一）」「（第3章）」；人名里的「（美）」不在此列
const TRAIL_BRACKET = /[（(【\[]\s*(?:第\s*[0-9一二三四五六七八九十百零]+\s*[章节回卷]?|[0-9一二三四五六七八九十百零]{1,4}|全|完)\s*[）)】\]]/;

const WRAPPER_CHARS = new Set(["【", "[", "（", "(", "《", "“", "\"", "'", "】", "]", "）", ")", "》", "”", "’"]);
const stripWrappers = (input) => {
    let start = 0;
    let end = input.length;
    while (start < end && WRAPPER_CHARS.has(input[start])) start += 1;
    while (end > start && WRAPPER_CHARS.has(input[end - 1])) end -= 1;
    return input.slice(start, end);
};

const cleanCandidate = (raw, title = "") => {
    let name = String(raw || "").trim();
    // 先去掉结尾括号别名（此时右括号还在，能配对），再剥外层包裹符
    name = name.replace(/[（(][^）)]{0,24}[）)]\s*$/, "").trim();
    name = stripWrappers(name)
        .replace(/^作\s*者\s*[:：]\s*/, "")
        .replace(/\s*(?:编著|原著|著)\s*$/, "")
        .trim();

    // 截断「字数：xxx」「文案：」「编辑推荐：」这类紧跟作者后面的元信息
    const cut = name.search(TRAIL_MARKER);
    if (cut > 0) name = name.slice(0, cut).trim();

    // 作者名里混进了书名：截到书名之前（如「彭建新红尘三部曲之…」）
    const t = String(title || "").replace(/\s+/g, "");
    if (t && t.length >= 2) {
        const flat = name.replace(/\s+/g, "");
        const at = flat.indexOf(t);
        if (at > 0) name = flat.slice(0, at);
    }

    // 去掉章节/卷次括号（可能在中间，如「风景画（一）书记…」）
    const bracket = name.search(TRAIL_BRACKET);
    if (bracket > 0) name = name.slice(0, bracket).trim();
    // 星号、全角空格、零宽字符不属于人名
    name = name.replace(/[＊*\u3000\u200b-\u200d]/g, "").trim();
    return stripWrappers(name).trim();
};

const isPlausibleAuthor = (name, title) => {
    if (!name) return false;
    if (name.length < 1 || name.length > MAX_AUTHOR_LEN) return false;
    if (BAD_AUTHOR_CHARS.test(name)) return false;
    if (BAD_AUTHOR_WORDS.test(name)) return false;
    if (BAD_AUTHOR_PREFIX.test(name)) return false;
    if (new RegExp(`^第\\s*${CN_NUM}\\s*[章节回卷集部篇幕]`).test(name)) return false;
    if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return false;
    // 书名/作者互相包含，说明抓到的是书名而不是人名（如「作者：乡村乱情」）
    const t = String(title || "").trim();
    if (t) {
        const a = name.replace(/\s+/g, "");
        const b = t.replace(/\s+/g, "");
        if (a && b && (a === b || b.includes(a) || (a.length >= 2 && a.includes(b) && b.length >= 2))) {
            return false;
        }
    }
    return true;
};

export const detectAuthor = (text, title = "") => {
    if (!text) return "";
    const head = text.slice(0, MAX_SCAN_CHARS);
    const lines = head.split(/\r?\n/);

    let scanned = 0;
    for (const line of lines) {
        const value = line.trim();
        if (!value) continue;
        scanned += 1;
        if (scanned > MAX_SCAN_LINES) break;
        // 长行一般是简介/正文；但如果行内明确写了「作者：」，仍要给它一次机会（
        // 常见于「作者：某某 内容简介：…」挤在同一行的情况）
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

export default detectAuthor;
