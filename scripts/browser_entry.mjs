// 浏览器端打包入口：把排版算法和作者识别挂到 window.NovelFmt
import { formatNovelText, splitInlineChapterTitles, reorderChaptersByTitle } from "../frontend/src/formatter/novelUtils.js";
import { detectAuthor } from "../frontend/src/formatter/authorDetect.js";

export { formatNovelText, splitInlineChapterTitles, reorderChaptersByTitle, detectAuthor };
