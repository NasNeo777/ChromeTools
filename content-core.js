// content-core.js —— 平台无关的共享层
// 负责：注入按钮 + 结果面板 + 分步进度 + 流式渲染 + 与后台的 Port 通信。
// 各平台（YouTube / 哔哩哔哩）只需实现一个「适配器」并调用 DSSummarizer.register()。
//
// 适配器接口（adapter）：
//   name            : 平台标识（字符串）
//   isVideoPage()   : 当前是否是可处理的视频页
//   getVideoId()    : 返回视频唯一 id（用于去重注入 / SPA 切换重注入）
//   getTranscript(id, report) : async -> { transcript, meta }
//                     report(step, label, meta?) 用于上报分步进度
//   steps(mode)     : 返回该平台的步骤标签数组（最后一步会被替换为 DeepSeek 文案）
//   placeBar(bar)   : 把工具条放到合适位置，放成功返回 true；否则核心层会让它浮动

(function () {
  "use strict";

  if (window.__DS_SUMMARIZER_CORE__) return;
  window.__DS_SUMMARIZER_CORE__ = true;

  let adapter = null;
  let panel = null;
  let lastSummary = "";
  let lastTitle = "";
  let metaLine = "";
  let rafPending = false;
  let activeSteps = [];

  // 各模式的文案：面板标题 / 流式提示 / 末步（DeepSeek）标签。needsComments 表示该模式还需读取评论。
  const MODES = {
    summary:   { title: "📄 视频总结",   gen: "DeepSeek 生成中…", step: "DeepSeek 生成总结" },
    translate: { title: "🌐 原文翻译",   gen: "DeepSeek 翻译中…", step: "DeepSeek 翻译原文" },
    critique:  { title: "🔍 批判性分析", gen: "DeepSeek 分析中…", step: "DeepSeek 批判分析" },
    comments:  { title: "💬 评论印证",   gen: "DeepSeek 分析中…", step: "DeepSeek 结合评论分析", needsComments: true }
  };

  // ---------- 注入按钮 ----------
  function mkBtn(text, onClick) {
    const b = document.createElement("button");
    b.className = "ds-summary-btn";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function injectButton() {
    if (document.getElementById("ds-tool-bar")) return;

    const bar = document.createElement("div");
    bar.id = "ds-tool-bar";
    bar.className = "ds-tool-bar";
    bar.append(
      mkBtn("📝 总结为中文文档", () => onAction("summary")),
      mkBtn("🌐 翻译原文", () => onAction("translate")),
      mkBtn("🔍 批判性分析", () => onAction("critique")),
      mkBtn("💬 评论印证", () => onAction("comments"))
    );

    let placed = false;
    try { placed = !!(adapter.placeBar && adapter.placeBar(bar)); } catch (e) { placed = false; }
    if (!placed) { bar.classList.add("ds-floating"); document.body.appendChild(bar); }
  }

  // ---------- 面板 ----------
  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement("div");
    panel.className = "ds-panel";
    panel.innerHTML = `
      <div class="ds-panel-head">
        <span class="ds-panel-title">📄 视频总结</span>
        <div class="ds-panel-actions">
          <button class="ds-icon-btn" id="ds-copy">复制</button>
          <button class="ds-icon-btn" id="ds-download">下载</button>
          <button class="ds-icon-btn" id="ds-close">✕</button>
        </div>
      </div>
      <div class="ds-panel-body" id="ds-body"></div>`;
    document.body.appendChild(panel);
    panel.querySelector("#ds-close").addEventListener("click", () => (panel.style.display = "none"));
    panel.querySelector("#ds-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(lastSummary || "");
      flash(panel.querySelector("#ds-copy"), "已复制");
    });
    panel.querySelector("#ds-download").addEventListener("click", downloadMd);
    return panel;
  }

  function body() { return ensurePanel().querySelector("#ds-body"); }
  function openPanel() { ensurePanel(); panel.style.display = "flex"; }
  function setPanelTitle(t) { ensurePanel().querySelector(".ds-panel-title").textContent = t; }

  function flash(el, text) {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => (el.textContent = old), 1200);
  }

  function downloadMd() {
    if (!lastSummary) return;
    const title = (lastTitle || "video-summary");
    const doc =
      `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">` +
      `<title>${escapeHtml(title)}</title>` +
      `<style>body{max-width:800px;margin:24px auto;padding:0 16px;` +
      `font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.75;color:#1f2328}` +
      `h1,h2,h3{line-height:1.3}h2{color:#4d6bfe}` +
      `.ds-ts{font-size:.85em;font-weight:600;color:#4d6bfe;background:#eef1ff;border-radius:4px;padding:0 5px}` +
      `.ds-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;vertical-align:middle}` +
      `.ds-badge-good{background:#2da44e}.ds-badge-warn{background:#d4a72c}.ds-badge-bad{background:#cf222e}.ds-badge-info{background:#4d6bfe}` +
      `.ds-meter{display:inline-block;vertical-align:middle;width:120px;height:10px;margin:0 6px;border-radius:6px;background:#eceef5;overflow:hidden}` +
      `.ds-meter>span{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#4d6bfe,#6d3bfe)}` +
      `.ds-card{background:#f6f7fb;border-radius:10px;padding:10px 12px;margin:8px 0}` +
      `table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14px}th,td{border:1px solid #e3e6ee;padding:5px 8px;text-align:left}th{background:#eef1ff}` +
      `</style></head><body>\n${renderDoc(lastSummary)}\n</body></html>`;
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + ".html";
    a.click();
    URL.revokeObjectURL(url);
  }

  // DeepSeek 直接输出 HTML：去掉代码围栏、剥离危险标签/内联事件后直接渲染（不再做 Markdown 转换）
  function renderDoc(html) {
    let s = String(html)
      .replace(/```html\s*/gi, "")
      .replace(/```/g, "")
      .replace(/<\/?(?:script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript:/gi, "");
    // 裸露的 [m:ss] / [h:mm:ss] 时间戳渲染成小标签
    s = s.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, '<span class="ds-ts">$1</span>');
    return s;
  }

  // ---------- 进度渲染 ----------
  function renderProgress(currentStep, label, meta) {
    openPanel();
    if (meta?.title) { lastTitle = meta.title; metaLine = metaHtml(meta); }
    let html = '<div class="ds-steps">';
    activeSteps.forEach((s, i) => {
      const n = i + 1;
      let cls, ic;
      if (n < currentStep) { cls = "done"; ic = "✓"; }
      else if (n === currentStep) { cls = "active"; ic = '<span class="ds-mini-spinner"></span>'; }
      else { cls = "pending"; ic = String(n); }
      html += `<div class="ds-step ${cls}"><span class="ds-step-ic">${ic}</span><span>${s}</span></div>`;
    });
    html += "</div>";
    if (label) html += `<div class="ds-step-label">${escapeHtml(label)}</div>`;
    body().innerHTML = (meta?.title ? metaLine : "") + html;
  }

  function metaHtml(meta) {
    return `<div class="ds-meta">🎬 ${escapeHtml(meta.title)}${meta.author ? " · " + escapeHtml(meta.author) : ""}</div>`;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- 流式渲染（节流到每帧一次） ----------
  let rafId = 0;
  function paintStream(done) {
    const tag = done ? "" : `<div class="ds-gen-tag"><span class="ds-mini-spinner"></span> DeepSeek 生成中…</div>`;
    const el = body();
    el.innerHTML = metaLine + tag + `<div class="ds-doc">${renderDoc(lastSummary)}</div>`;
    el.scrollTop = el.scrollHeight;
  }

  function scheduleStreamRender(done) {
    // 最终（done）渲染必须立即执行，并取消尚未触发的那帧——否则：
    // ① 若此刻有一帧 pending，done 渲染会被 `if (rafPending) return` 吞掉，spinner 卡在“生成中”；
    // ② 那帧若在 done 之后才触发，又会用 done=false 重新画出 spinner。
    if (done) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      rafPending = false;
      paintStream(true);
      return;
    }
    if (rafPending) return;
    rafPending = true;
    rafId = requestAnimationFrame(() => {
      rafPending = false;
      rafId = 0;
      paintStream(false);
    });
  }

  // ---------- 执行（mode: summary 总结 / translate 翻译 / critique 批判 / comments 评论印证） ----------
  let inFlight = false;
  let transcriptCache = null; // { videoId, transcript, meta }，各按钮共用，避免重复抓字幕被限流
  let commentsCache = null;   // { videoId, comments }，评论印证按钮复用
  async function onAction(mode) {
    // 执行中禁止重复点击：连点会叠加抓取请求，容易把自己打进 B 站风控
    if (inFlight) { openPanel(); return; }
    const videoId = adapter.getVideoId();
    if (!videoId) return;
    inFlight = true;
    const L = MODES[mode] || MODES.summary;
    const wantComments = !!L.needsComments;
    lastSummary = "";
    metaLine = "";
    const dataSteps = adapter.steps(); // 抓字幕的前几步
    // 评论模式多一步「读取评论」；末步统一是 DeepSeek 处理
    activeSteps = wantComments ? [...dataSteps, "读取评论", L.step] : [...dataSteps, L.step];
    setPanelTitle(L.title);
    renderProgress(1, "正在启动…");

    const fail = (msg) => {
      body().innerHTML = `<div class="ds-error">⚠ ${escapeHtml(msg)}</div>`;
      inFlight = false;
    };

    // 抓文字稿。同一视频已抓过就复用缓存，不再重复打平台接口（防限流、更快）
    let transcript, meta;
    if (transcriptCache && transcriptCache.videoId === videoId) {
      transcript = transcriptCache.transcript;
      meta = transcriptCache.meta;
      renderProgress(dataSteps.length, "字幕已就绪（复用上次抓取）…", meta);
    } else {
      try {
        const r = await adapter.getTranscript(videoId, (step, label, m) => renderProgress(step, label, m));
        transcript = r.transcript;
        meta = r.meta;
        transcriptCache = { videoId, transcript, meta };
      } catch (e) {
        return fail(e?.message || String(e));
      }
    }

    // 评论模式：再抓评论（同样带缓存）
    let comments = "";
    if (wantComments) {
      const commentStep = dataSteps.length + 1;
      if (typeof adapter.getComments !== "function") {
        return fail("当前平台暂不支持读取评论。");
      }
      if (commentsCache && commentsCache.videoId === videoId) {
        comments = commentsCache.comments;
        renderProgress(commentStep, "评论已就绪（复用上次抓取）…", meta);
      } else {
        try {
          renderProgress(commentStep, "读取评论…", meta);
          comments = await adapter.getComments(videoId, (label) => renderProgress(commentStep, label, meta));
          commentsCache = { videoId, comments };
        } catch (e) {
          return fail(e?.message || String(e));
        }
      }
      if (!comments) {
        return fail("没读到评论：可能评论区已关闭、为空，或接口受限。");
      }
    }

    // 末步：后台流式调用 DeepSeek
    renderProgress(activeSteps.length, L.gen, meta);
    const port = chrome.runtime.connect({ name: "summarize" });
    port.postMessage({ type: "START", mode, transcript, comments, meta });

    port.onMessage.addListener((m) => {
      if (m.type === "chunk") {
        lastSummary += m.delta;
        scheduleStreamRender(false);
      } else if (m.type === "done") {
        lastTitle = m.meta?.title || lastTitle;
        scheduleStreamRender(true);
        inFlight = false;
        port.disconnect();
      } else if (m.type === "error") {
        body().innerHTML = `<div class="ds-error">⚠ ${escapeHtml(m.error)}</div>`;
        inFlight = false;
        port.disconnect();
      }
    });

    port.onDisconnect.addListener(() => {
      inFlight = false;
      if (chrome.runtime.lastError && !lastSummary) {
        body().innerHTML = `<div class="ds-error">连接中断，请刷新页面重试。</div>`;
      }
    });
  }

  // ---------- 注册 + SPA 导航重新注入 ----------
  function register(a) {
    adapter = a;
    let scheduled = false;
    const tryInject = () => {
      scheduled = false;
      if (adapter.isVideoPage() && adapter.getVideoId()) injectButton();
    };
    // 评论区等动态内容会触发大量 mutation，debounce 一下，避免每次都跑选择器拖慢页面
    const schedule = () => { if (!scheduled) { scheduled = true; setTimeout(tryInject, 300); } };
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    tryInject();
  }

  // ---------- 共享小工具，供适配器使用 ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 7000, interval = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v && (v.length === undefined || v.length > 0)) return v;
      await sleep(interval);
    }
    return fn();
  }

  window.DSSummarizer = { register, sleep, waitFor };
})();
