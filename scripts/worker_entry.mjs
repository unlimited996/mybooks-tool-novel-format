// Web Worker 入口：把排版算法放到后台线程，避免大文本把工具页面卡死
import { formatNovelText, splitInlineChapterTitles, reorderChaptersByTitle } from "../frontend/src/formatter/novelUtils.js";

self.onmessage = async function (event) {
    var data = event.data || {};
    try {
        var result;
        if (data.op === "split") result = splitInlineChapterTitles(data.text || "");
        else if (data.op === "reorder") result = reorderChaptersByTitle(data.text || "");
        else result = await formatNovelText(data.text || "", data.options || {});
        self.postMessage({ id: data.id, ok: true, result: result });
    } catch (err) {
        self.postMessage({ id: data.id, ok: false, error: String((err && err.message) || err) });
    }
};
