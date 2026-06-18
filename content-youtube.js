// content-youtube.js —— YouTube 适配器
// 在 watch 页同源环境抓取文字稿（带 Cookie，最可靠），交给 content-core.js。

(function () {
  "use strict";

  const { sleep, waitFor } = window.DSSummarizer;

  function getVideoId() {
    return new URLSearchParams(location.search).get("v");
  }

  // ---------- 抓取文字稿 ----------
  function extractJsonAfter(html, marker) {
    const idx = html.indexOf(marker);
    if (idx === -1) return null;
    let i = html.indexOf("{", idx);
    if (i === -1) return null;
    let depth = 0, inStr = false, esc = false;
    const start = i;
    for (; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") { if (--depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; } } }
      }
    }
    return null;
  }

  async function innertubePlayer(videoId, html) {
    const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    const cver =
      (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] ||
      (html.match(/"clientVersion":"([^"]+)"/) || [])[1] ||
      "2.20240101.00.00";
    if (!key) return { tracks: null, meta: {} };
    const resp = await fetch(`/youtubei/v1/player?key=${key}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: "WEB", clientVersion: cver, hl: "en" } }
      })
    });
    const data = await resp.json().catch(() => ({}));
    return {
      tracks: data?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
      meta: { title: data?.videoDetails?.title || "", author: data?.videoDetails?.author || "" }
    };
  }

  // watch 页 HTML 缓存：getTranscript 与 getComments 共用，少抓一次
  let htmlCache = null; // { videoId, html }
  async function getWatchHtml(videoId) {
    if (htmlCache && htmlCache.videoId === videoId) return htmlCache.html;
    const html = await (await fetch(`/watch?v=${videoId}&hl=en`, { credentials: "include" })).text();
    htmlCache = { videoId, html };
    return html;
  }

  async function getTranscript(videoId, report) {
    report(1, "读取视频信息…");
    const html = await getWatchHtml(videoId);

    report(2, "解析字幕轨道…");
    const player = extractJsonAfter(html, "ytInitialPlayerResponse =");
    let tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    let meta = {
      title: player?.videoDetails?.title || "",
      author: player?.videoDetails?.author || ""
    };

    // 兜底：用 InnerTube player API 再取一次
    if (!tracks || !tracks.length) {
      report(2, "解析字幕轨道（尝试 InnerTube 接口）…");
      const r = await innertubePlayer(videoId, html);
      if (r.tracks && r.tracks.length) {
        tracks = r.tracks;
        if (!meta.title && r.meta) meta = r.meta;
      }
    }

    if (!tracks || !tracks.length) {
      throw new Error("没拿到字幕轨道。若是会员/年龄限制/直播视频可能无法获取；或先在播放器点开 CC 字幕后重试。");
    }

    const pick =
      tracks.find((t) => /^en/.test(t.languageCode) && t.kind !== "asr") ||
      tracks.find((t) => /^en/.test(t.languageCode)) ||
      tracks.find((t) => t.kind !== "asr") ||
      tracks[0];

    const langName = pick.name?.simpleText || pick.name?.runs?.[0]?.text || pick.languageCode || "";
    report(3, `下载文字稿（轨道：${langName}${pick.kind === "asr" ? " · 自动生成" : ""}）…`, meta);

    let { transcript } = await downloadTrack(pick.baseUrl);

    // timedtext 被 pot token 门禁返回空时，改用页面“显示转写”面板抓取
    if (!transcript) {
      report(3, "字幕接口受限，改用页面转写面板…", meta);
      transcript = await getTranscriptViaPanel();
    }

    if (!transcript) {
      throw new Error(
        "无法获取文字稿：YouTube 字幕接口被限制(pot token)，且未找到“显示转写/Show transcript”面板。" +
        "请手动点开视频下方「…更多」→「显示转写」，确认有转写后再试。"
      );
    }

    report(3, `文字稿就绪：${transcript.length} 字，准备交给 DeepSeek…`, meta);
    return { transcript, meta };
  }

  // 字幕/转写按钮：匹配“转写文稿 / Show transcript / 显示转写”等，排除“关闭/close”
  function findTranscriptButton() {
    const isOpenLabel = (s) =>
      /transcript|转写|轉錄|文字稿|字幕记录|字幕記錄/i.test(s) && !/关闭|關閉|close|隐藏|隱藏|hide/i.test(s);
    const btns = [...document.querySelectorAll("button, [role='button']")];
    // 1) 优先 aria-label 精确匹配（新版 chip 按钮 aria-label="转写文稿"）
    let b = btns.find((x) => isOpenLabel((x.getAttribute("aria-label") || "").trim()));
    if (b) return b;
    // 2) 描述区的转写 section
    const sec = document.querySelector("ytd-video-description-transcript-section-renderer");
    if (sec) { const sb = sec.querySelector("button"); if (sb) return sb; }
    // 3) 按可见文本兜底
    b = btns.find((x) => isOpenLabel((x.textContent || "").trim()) && x.getBoundingClientRect().width > 0);
    return b || null;
  }

  // 读取转写片段：兼容新版(transcript-segment-view-model) 与旧版(ytd-transcript-segment-renderer)
  function readTranscriptSegments() {
    let segs = [...document.querySelectorAll("transcript-segment-view-model")];
    if (!segs.length) segs = [...document.querySelectorAll("ytd-transcript-segment-renderer")];
    return segs;
  }

  function segmentText(seg) {
    const span = seg.querySelector("span.ytAttributedStringHost");
    if (span) return span.textContent.trim();
    const old = seg.querySelector(".segment-text, yt-formatted-string.segment-text");
    if (old) return old.textContent.trim();
    // 兜底：去掉开头时间戳（"0:00" 或 "1分钟9秒钟"）
    return (seg.textContent || "")
      .replace(/^\s*\d+:\d+\s*/, "")
      .replace(/^\s*\d+\s*(秒钟|分钟|小时)[\s\d秒钟分小时]*/, "")
      .trim();
  }

  async function getTranscriptViaPanel() {
    // 已经有内容就直接读
    if (readTranscriptSegments().length) {
      return collectSegments();
    }
    // 展开描述区，露出“转写文稿”入口
    const expand = document.querySelector("#expand, tp-yt-paper-button#expand, #description #expand");
    if (expand) { try { expand.click(); } catch (e) {} await sleep(400); }

    let btn = findTranscriptButton();
    if (!btn) { await sleep(500); btn = findTranscriptButton(); }
    if (!btn) return "";
    try { btn.click(); } catch (e) {}

    const segs = await waitFor(() => {
      const s = readTranscriptSegments();
      return s.length ? s : null;
    }, 8000);
    if (!segs || !segs.length) return "";
    return collectSegments();
  }

  function segmentTimestamp(seg) {
    const ts = seg.querySelector(
      ".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, .ytd-transcript-segment-renderer .segment-timestamp"
    );
    return ts ? ts.textContent.trim() : "";
  }

  // 保留时间戳，按行输出：每行 "[m:ss] 文本"
  function collectSegments() {
    const rows = readTranscriptSegments()
      .map((s) => ({ time: segmentTimestamp(s), text: segmentText(s).replace(/\s+/g, " ").trim() }))
      .filter((r) => r.text);
    if (!rows.length) return "";
    return rows.map((r) => (r.time ? `[${r.time}] ${r.text}` : r.text)).join("\n");
  }

  // 依次尝试多种字幕格式，取第一个有内容的
  async function downloadTrack(baseUrl) {
    const clean = baseUrl.replace(/&fmt=[^&]*/g, "");
    const variants = [clean + "&fmt=json3", clean + "&fmt=srv3", clean + "&fmt=vtt", clean];
    const lens = [];
    for (const url of variants) {
      try {
        const resp = await fetch(url, { credentials: "include" });
        const text = await resp.text();
        lens.push(`${resp.status}:${text.length}`);
        const t = parseTimedText(text);
        if (t) return { transcript: t, debug: lens.join(", ") };
      } catch (e) {
        lens.push("err");
      }
    }
    return { transcript: "", debug: lens.join(", ") };
  }

  function fmtTime(ms) {
    const s = Math.floor((ms || 0) / 1000);
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
  }

  function parseTimedText(text) {
    text = (text || "").trim();
    if (!text) return "";
    if (text[0] === "{") {
      try {
        const data = JSON.parse(text);
        const lines = (data.events || [])
          .map((ev) => {
            const t = (ev.segs || []).map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
            return t ? `[${fmtTime(ev.tStartMs)}] ${t}` : "";
          })
          .filter(Boolean);
        return lines.join("\n");
      } catch (e) { /* 落到 XML 解析 */ }
    }
    // XML / VTT：去时间轴、去标签、反转义
    const stripped = text
      .replace(/^WEBVTT[\s\S]*?\n\n/i, "")
      .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3} --> [^\n]+/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#160;/g, " ");
    return stripped.replace(/\s+/g, " ").trim();
  }

  // ---------- 读取评论（InnerTube /next，兼容新旧两种评论结构） ----------
  function deepFind(obj, test, depth) {
    if (depth === undefined) depth = 0;
    if (!obj || typeof obj !== "object" || depth > 30) return null;
    if (test(obj)) return obj;
    for (const k in obj) {
      const r = deepFind(obj[k], test, depth + 1);
      if (r) return r;
    }
    return null;
  }

  async function getComments(videoId, report) {
    report("读取页面…");
    const html = await getWatchHtml(videoId);
    const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    const cver =
      (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] ||
      (html.match(/"clientVersion":"([^"]+)"/) || [])[1] ||
      "2.20240101.00.00";
    const initData = extractJsonAfter(html, "ytInitialData =");
    if (!key || !initData) return "";

    // 找评论区的 continuation token
    const sec = deepFind(initData, (o) => o.itemSectionRenderer && o.itemSectionRenderer.sectionIdentifier === "comment-item-section");
    const contItem = sec && deepFind(sec, (o) => o.continuationItemRenderer);
    const token = contItem?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (!token) return "";

    report("读取评论…");
    const resp = await fetch(`/youtubei/v1/next?key=${key}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: cver, hl: "en" } }, continuation: token })
    });
    const j = await resp.json().catch(() => ({}));

    const rows = [];
    // 新结构：评论实体在 frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload
    const muts = j?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
    for (const m of muts) {
      const p = m?.payload?.commentEntityPayload;
      const text = p?.properties?.content?.content;
      if (!text) continue;
      const likes = p?.toolbar?.likeCountNotliked || "";
      rows.push(`[赞${likes || 0}] ${text.replace(/\s+/g, " ").trim()}`);
    }
    // 旧结构：commentThreadRenderer → commentRenderer
    if (!rows.length) {
      const items = [];
      (function walk(o, d) {
        if (!o || typeof o !== "object" || d > 30) return;
        if (o.commentRenderer) items.push(o.commentRenderer);
        for (const k in o) walk(o[k], d + 1);
      })(j, 0);
      for (const c of items) {
        const text = (c?.contentText?.runs || []).map((r) => r.text).join("");
        if (!text) continue;
        const likes = c?.voteCount?.simpleText || "";
        rows.push(`[赞${likes || 0}] ${text.replace(/\s+/g, " ").trim()}`);
      }
    }

    if (!rows.length) return "";
    const top = rows.slice(0, 50);
    return `（以下为该视频的评论，方括号内为点赞数）\n` + top.join("\n");
  }

  // ---------- 工具条放置 ----------
  function placeBar(bar) {
    const host =
      document.querySelector("#above-the-fold #title") ||
      document.querySelector("ytd-watch-metadata");
    if (!host) return false;
    host.parentElement.insertBefore(bar, host.nextSibling);
    return true;
  }

  window.DSSummarizer.register({
    name: "youtube",
    isVideoPage: () => location.pathname === "/watch",
    getVideoId,
    getTranscript,
    getComments,
    placeBar,
    steps: () => ["读取视频信息", "解析字幕轨道", "下载文字稿"]
  });
})();
