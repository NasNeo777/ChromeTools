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

  // ---------- 对话（追问）状态 ----------
  // 当前结果对应的上下文，供追问时一起发给后台（文字稿 / 评论 / 元信息 / 模式）
  let curMode = "summary";
  let curTranscript = "";
  let curComments = "";
  let curMeta = {};
  // 对话历史：[{role, content}]，首条 assistant 即本次生成的总结/分析（仅作模型上下文，不在对话区重复渲染）
  let chatHistory = [];
  let chatBusy = false;
  let customTools = [], curCustomTool = null;
  let curSelectionPrompt;
  let closeFunctionMenu = () => {};
  let disposeFunctionMenu = () => {};
  let repositionFunctionMenu = () => {};

  // 各模式的文案：面板标题 / 流式提示 / 末步（DeepSeek）标签。needsComments 表示该模式还需读取评论。
  const MODES = {
    summary:   { title: "总结视频",   gen: "AI 生成中…", step: "AI 生成总结" },
    translate: { title: "翻译字幕",   gen: "AI 翻译中…", step: "AI 翻译字幕" },
    critique:  { title: "分析观点", gen: "AI 分析中…", step: "AI 批判分析" },
    comments:  { title: "结合评论分析",   gen: "AI 分析中…", step: "AI 结合评论分析", needsComments: true }
  };

  // Use page appearance when it is explicit; otherwise follow the OS preference.
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  let currentTheme = "light", themeFrame = 0;
  function detectTheme() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const named = el.getAttribute("data-theme") || el.getAttribute("data-color-mode") || el.getAttribute("theme");
      if (/^(dark|light)$/i.test(named || "")) return named.toLowerCase();
      if (el.hasAttribute("dark") || el.classList.contains("dark")) return "dark";
      if (el.hasAttribute("light") || el.classList.contains("light")) return "light";
    }
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const color = getComputedStyle(el).backgroundColor;
      const rgb = color.match(/^rgba?\(([^)]+)\)/)?.[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (!rgb || rgb.length < 3 || (rgb[3] ?? 1) < 0.9) continue;
      const brightness = rgb.slice(0, 3).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
      return brightness < 128 ? "dark" : "light";
    }
    const scheme = getComputedStyle(document.documentElement).colorScheme;
    if (scheme === "dark" || scheme === "light") return scheme;
    return systemTheme.matches ? "dark" : "light";
  }
  function syncTheme() {
    currentTheme = detectTheme();
    for (const el of document.querySelectorAll("#ds-tool-bar,#ds-function-menu,#ds-result-panel")) {
      if (el.dataset.dsTheme !== currentTheme) el.dataset.dsTheme = currentTheme;
    }
  }
  const themeObserver = new MutationObserver(() => {
    if (!themeFrame) themeFrame = requestAnimationFrame(() => { themeFrame = 0; syncTheme(); });
  });
  for (const el of [document.documentElement, document.body]) if (el) themeObserver.observe(el, {
    attributes: true, attributeFilter: ["class", "style", "dark", "light", "data-theme", "data-color-mode", "theme"]
  });
  systemTheme.addEventListener("change", syncTheme);
  syncTheme();

  // Static inline SVGs inherit currentColor and never depend on remote images.
  function menuButton(label, mode, action) {
    const paths = {
      summary: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5H8Z"/><path d="M14 3v6h6M7 13h10M7 17h7"/>',
      translate: '<path d="M3 5h12M9 3v2M5 5c1 5 4 8 9 10M13 5c-1 5-4 8-9 10M14 21l4-10 4 10M16 17h4"/>',
      critique: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 11l2-2 2 2 2-4"/>',
      comments: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 1-6a8 8 0 0 1-1-4V9a7 7 0 0 1 7-7h4a8 8 0 0 1 8 8Z"/><path d="M7 8h9M7 12h6"/>',
      quiz: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l2 2 4-4M8 16h8"/>',
      custom: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>'
    };
    const button = mkBtn("", action);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) icon.setAttribute(name, value);
    icon.classList.add("ds-menu-icon"); icon.innerHTML = paths[mode] || paths.custom;
    const text = document.createElement("span"); text.className = "ds-menu-label"; text.textContent = label;
    button.append(icon, text);
    return button;
  }

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
    disposeFunctionMenu();

    const bar = document.createElement("div");
    bar.id = "ds-tool-bar";
    bar.className = "ds-tool-bar";
    const launcher = mkBtn("AI 工具箱", () => setMenu(menu.hidden));
    launcher.className = "ds-launcher";
    if (chrome.runtime.getURL) { const mark = document.createElement("img"); mark.src = chrome.runtime.getURL("icons/icon48.png"); mark.alt = ""; mark.width = 20; mark.height = 20; launcher.prepend(mark); }
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "ds-function-menu");
    const menu = document.createElement("div");
    menu.id = "ds-function-menu"; menu.className = "ds-function-menu ds-menu-surface"; menu.hidden = true;
    menu.setAttribute("aria-label", "AI 工具箱功能");
    const caption = document.createElement("div"); caption.className = "ds-menu-caption";
    caption.textContent = adapter.sourceType === "page" ? "当前页面 · 正文阅读" : "当前视频 · 字幕学习";
    menu.append(caption);
    const resume = menuButton("继续查看上次内容", "summary", () => { setMenu(false); openPanel(); });
    resume.id = "ds-resume";
    resume.hidden = true;
    menu.append(resume);
    const actions = adapter.sourceType === "page" ? [["总结网页", "summary"], ["出题自测", "quiz"]] : [["总结视频", "summary"], ["翻译字幕", "translate"], ["分析观点", "critique"], ["结合评论分析", "comments"], ["出题自测", "quiz"]];
    for (const [label, mode] of actions) menu.append(menuButton(label, mode, () => { setMenu(false); onAction(mode); }));
    let positionFrame = 0;
    const events = new AbortController();
    const supportsPopover = typeof menu.showPopover === "function";
    if (supportsPopover) menu.setAttribute("popover", "manual");
    bar.append(launcher);
    let placed = false;
    try { placed = !!(adapter.placeBar && adapter.placeBar(bar)); } catch (e) { placed = false; }
    if (!placed) { bar.classList.add("ds-floating"); document.body.appendChild(bar); }
    // The menu must escape the title/channel stacking contexts and overflow clipping.
    document.body.appendChild(menu);
    syncTheme();
    const contains = target => target instanceof Node && (bar.contains(target) || menu.contains(target));
    function positionMenu() {
      if (menu.hidden) return;
      if (!launcher.isConnected || !menu.isConnected) { disposeFunctionMenu(); return; }
      const anchor = launcher.getBoundingClientRect();
      const margin = 12, gap = 9;
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      if (anchor.bottom <= 0 || anchor.top >= height || anchor.right <= 0 || anchor.left >= width) { setMenu(false); return; }
      const above = Math.max(0, anchor.top - margin - gap);
      const below = Math.max(0, height - anchor.bottom - margin - gap);
      const desiredHeight = Math.min(560, menu.scrollHeight);
      const opensBelow = below >= desiredHeight || below >= above;
      menu.style.maxHeight = Math.min(560, opensBelow ? below : above) + "px";
      const menuWidth = menu.offsetWidth, menuHeight = menu.offsetHeight;
      const aligned = bar.classList.contains("ds-floating") ? anchor.right - menuWidth : anchor.left;
      menu.style.left = Math.max(margin, Math.min(aligned, width - margin - menuWidth)) + "px";
      menu.style.top = (opensBelow ? anchor.bottom + gap : anchor.top - gap - menuHeight) + "px";
      menu.dataset.side = opensBelow ? "bottom" : "top";
    }
    function schedulePosition() {
      if (menu.hidden || positionFrame) return;
      positionFrame = requestAnimationFrame(() => { positionFrame = 0; positionMenu(); });
    }
    function setMenu(open) {
      if (open && (!launcher.isConnected || !menu.isConnected)) return;
      if (open) {
        syncTheme();
        resume.hidden = !panel?.isConnected;
        menu.hidden = false;
        if (supportsPopover && !menu.matches(":popover-open")) menu.showPopover();
        positionMenu();
        if (!menu.hidden) menu.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
      } else {
        if (supportsPopover && menu.matches(":popover-open")) menu.hidePopover();
        menu.hidden = true;
      }
      launcher.setAttribute("aria-expanded", String(!menu.hidden));
    }
    function handleKeys(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); setMenu(false); launcher.focus({ preventScroll: true }); }
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (menu.hidden) return setMenu(true);
        const buttons = [...menu.querySelectorAll("button:not([hidden])")], index = buttons.indexOf(document.activeElement);
        buttons[(index + (ev.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus({ preventScroll: true });
        document.activeElement.scrollIntoView({ block: "nearest" });
      }
    }
    const options = { signal: events.signal };
    for (const surface of [bar, menu]) {
      surface.addEventListener("keydown", handleKeys, options);
      surface.addEventListener("focusout", ev => { if (!contains(ev.relatedTarget)) setMenu(false); }, options);
    }
    document.addEventListener("pointerdown", ev => { if (!bar.isConnected) disposeFunctionMenu(); else if (!contains(ev.target)) setMenu(false); }, options);
    window.addEventListener("scroll", schedulePosition, { capture: true, passive: true, signal: events.signal });
    window.addEventListener("resize", schedulePosition, options);
    window.visualViewport?.addEventListener("resize", schedulePosition, options);
    menu.addEventListener("toggle", ev => {
      if (ev.newState === "closed" && !menu.hidden) { menu.hidden = true; launcher.setAttribute("aria-expanded", "false"); }
    }, options);
    const sizeObserver = new ResizeObserver(schedulePosition);
    sizeObserver.observe(menu); sizeObserver.observe(launcher);
    closeFunctionMenu = () => setMenu(false);
    repositionFunctionMenu = schedulePosition;
    disposeFunctionMenu = () => {
      setMenu(false); events.abort(); sizeObserver.disconnect();
      if (positionFrame) cancelAnimationFrame(positionFrame);
      menu.remove();
      closeFunctionMenu = () => {}; repositionFunctionMenu = () => {}; disposeFunctionMenu = () => {};
    };
    setupLauncherDrag(bar, launcher, events.signal, () => setMenu(false), schedulePosition);
    renderCustomMenu(menu);
  }

  function setupLauncherDrag(bar, launcher, signal, closeMenu, reposition) {
    let drag = null, moved = false, position = null, touched = false;
    const options = { signal };
    launcher.title = "点击打开工具箱，拖动调整位置";
    function place(x, y) {
      bar.classList.add("ds-floating");
      if (bar.parentElement !== document.body) document.body.appendChild(bar);
      const maxX = Math.max(0, innerWidth - bar.offsetWidth - 8);
      const maxY = Math.max(0, innerHeight - bar.offsetHeight - 8);
      const left = Math.max(Math.min(8, maxX), Math.min(x, maxX));
      const top = Math.max(Math.min(8, maxY), Math.min(y, maxY));
      Object.assign(bar.style, { left: left + "px", top: top + "px", right: "auto", bottom: "auto" });
      position = { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 };
      reposition();
    }
    function restore(value) {
      if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
      place(Math.max(0, Math.min(1, value.x)) * Math.max(0, innerWidth - bar.offsetWidth - 8),
        Math.max(0, Math.min(1, value.y)) * Math.max(0, innerHeight - bar.offsetHeight - 8));
    }
    chrome.storage?.local?.get({ launcherPosition: null }).then(data => {
      if (!signal.aborted && !touched) restore(data.launcherPosition);
    }).catch(() => {});
    launcher.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || !ev.isPrimary) return;
      touched = true; moved = false;
      const rect = bar.getBoundingClientRect();
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
      launcher.setPointerCapture(ev.pointerId);
    }, options);
    launcher.addEventListener("pointermove", ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) closeMenu();
      moved = true;
      place(drag.left + dx, drag.top + dy);
      // Reparenting an inline launcher can drop capture; restore it after moving.
      launcher.setPointerCapture(ev.pointerId);
    }, options);
    const finish = ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      if (launcher.hasPointerCapture(ev.pointerId)) launcher.releasePointerCapture(ev.pointerId);
      if (moved && position) chrome.storage?.local?.set({ launcherPosition: position }).catch(() => {});
    };
    launcher.addEventListener("pointerup", finish, options);
    launcher.addEventListener("pointercancel", finish, options);
    launcher.addEventListener("click", ev => {
      if (moved) { moved = false; ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, { capture: true, signal });
    window.addEventListener("resize", () => { if (position) restore(position); }, options);
  }

  function renderCustomMenu(menu = document.getElementById("ds-function-menu")) {
    if (!menu || !adapter) return;
    const old = menu.querySelector(".ds-custom-menu");
    if (old?.contains(document.activeElement)) document.querySelector(".ds-launcher")?.focus();
    old?.remove();
    const tools = AICustomTools.available(customTools, adapter.sourceType);
    if (!tools.length) return;
    const group = document.createElement("div"); group.className = "ds-custom-menu";
    const caption = document.createElement("div"); caption.className = "ds-menu-caption"; caption.textContent = "我的工具"; group.append(caption);
    for (const tool of tools) {
      const button = menuButton(tool.name, "custom", () => { closeFunctionMenu(); onAction("custom", tool); });
      button.dataset.customToolId = tool.id; group.append(button);
    }
    menu.append(group);
    repositionFunctionMenu();
  }
  async function loadCustomTools() {
    if (!chrome.storage?.local) return;
    try { const data = await chrome.storage.local.get({ customTools: [] }); customTools = AICustomTools.list(data.customTools); renderCustomMenu(); }
    catch (error) { console.warn("AI工具箱：读取自定义工具失败", error.message); }
  }
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !changes.customTools) return;
    try { customTools = AICustomTools.list(changes.customTools.newValue || []); renderCustomMenu(); }
    catch (error) { console.warn("AI工具箱：自定义工具配置无效", error.message); }
  });
  loadCustomTools();

  // ---------- 面板 ----------
  function setupPanelDrag(el) {
    const header = el.querySelector(".ds-panel-head");
    let drag = null, position = null;
    header.title = "拖动调整面板位置";
    function place(left, top) {
      if (!el.getClientRects().length) return;
      const rect = el.getBoundingClientRect();
      const maxX = Math.max(0, innerWidth - rect.width - 8);
      const maxY = Math.max(0, innerHeight - rect.height - 8);
      position = {
        left: Math.max(Math.min(8, maxX), Math.min(left, maxX)),
        top: Math.max(Math.min(8, maxY), Math.min(top, maxY))
      };
      Object.assign(el.style, { left: position.left + "px", top: position.top + "px", right: "auto", bottom: "auto" });
    }
    header.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || !ev.isPrimary || ev.target.closest("button")) return;
      const rect = el.getBoundingClientRect();
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
      header.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    header.addEventListener("pointermove", ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      place(drag.left + ev.clientX - drag.x, drag.top + ev.clientY - drag.y);
    });
    const finish = ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      if (header.hasPointerCapture(ev.pointerId)) header.releasePointerCapture(ev.pointerId);
    };
    header.addEventListener("pointerup", finish);
    header.addEventListener("pointercancel", finish);
    header.addEventListener("lostpointercapture", () => { drag = null; });
    const keepInView = () => { if (position) place(position.left, position.top); };
    // Expanding, streaming content and viewport changes can all grow the panel.
    new ResizeObserver(keepInView).observe(el);
    window.addEventListener("resize", keepInView);
  }

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement("div");
    panel.className = "ds-panel";
    panel.id = "ds-result-panel";
    panel.innerHTML = `
      <div class="ds-panel-head">
        <button class="ds-icon-btn" id="ds-collapse" aria-label="收起面板" aria-expanded="true" aria-controls="ds-body ds-chat">
          <svg class="ds-collapse-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="ds-collapse-arrow" d="m16 9-3 3 3 3"/></svg>
          <span class="ds-collapse-label">收起</span>
        </button>
        <div class="ds-panel-heading"><span class="ds-panel-kicker">AI TOOLBOX</span><span class="ds-panel-title">总结视频</span></div>
        <div class="ds-panel-actions">
          <button class="ds-icon-btn" id="ds-copy">复制</button>
          <button class="ds-icon-btn" id="ds-download">下载</button>
          <button class="ds-icon-btn" id="ds-close" aria-label="关闭面板">×</button>
        </div>
      </div>
      <div class="ds-panel-body" id="ds-body"></div>
      <div class="ds-chat" id="ds-chat" style="display:none">
        <div class="ds-chat-thread" id="ds-chat-thread"></div>
        <div class="ds-chat-input-row">
          <textarea id="ds-chat-input" class="ds-chat-input" rows="1"
            placeholder="追问当前内容，AI 会结合原文补充…"></textarea>
          <button class="ds-chat-send" id="ds-chat-send" title="发送（Enter）">↑</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    setupPanelDrag(panel);
    syncTheme();
    panel.querySelector("#ds-collapse").addEventListener("click", () => setPanelCollapsed(!panel.classList.contains("ds-collapsed")));
    panel.querySelector("#ds-close").addEventListener("click", () => (panel.style.display = "none"));
    panel.querySelector("#ds-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(lastSummary || "");
      flash(panel.querySelector("#ds-copy"), "已复制");
    });
    panel.querySelector("#ds-download").addEventListener("click", downloadMd);

    // 对话输入：Enter 发送，Shift+Enter 换行；输入框随内容自适应高度
    const input = panel.querySelector("#ds-chat-input");
    panel.querySelector("#ds-chat-send").addEventListener("click", sendChat);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });
    return panel;
  }

  // ---------- 对话（追问） ----------
  function showChat() { ensurePanel().querySelector("#ds-chat").style.display = "flex"; }
  function hideChat() {
    if (!panel) return;
    const c = panel.querySelector("#ds-chat");
    if (c) { c.style.display = "none"; c.querySelector("#ds-chat-thread").innerHTML = ""; }
    chatHistory = [];
    chatBusy = false;
  }
  function scrollChat() {
    const t = panel && panel.querySelector("#ds-chat-thread");
    if (t) t.scrollTop = t.scrollHeight;
  }
  // 追加一条消息气泡，返回其内容元素（assistant 流式时往里写）
  function appendChatMsg(role) {
    const thread = ensurePanel().querySelector("#ds-chat-thread");
    const row = document.createElement("div");
    row.className = "ds-chat-msg ds-chat-" + role;
    const text = document.createElement("div");
    text.className = "ds-chat-text";
    row.appendChild(text);
    thread.appendChild(row);
    scrollChat();
    return text;
  }

  function sendChat() {
    if (chatBusy) return;
    const input = ensurePanel().querySelector("#ds-chat-input");
    const q = input.value.trim();
    if (!q) return;
    chatBusy = true;
    input.value = "";
    input.style.height = "auto";

    appendChatMsg("user").textContent = q;
    chatHistory.push({ role: "user", content: q });

    const out = appendChatMsg("assistant");
    out.innerHTML = `<span class="ds-mini-spinner"></span>`;
    let answer = "";

    const port = chrome.runtime.connect({ name: "summarize" });
    port.postMessage({
      type: "CHAT", mode: curMode, transcript: curTranscript,
      comments: curComments, meta: curMeta, history: chatHistory, customTool: curCustomTool, selectionPrompt: curSelectionPrompt
    });
    port.onMessage.addListener((m) => {
      if (m.type === "chunk") {
        answer += m.delta;
        out.innerHTML = renderDoc(answer);
        scrollChat();
      } else if (m.type === "done") {
        if (!answer) out.innerHTML = `<span class="ds-chat-empty">（没有更多内容）</span>`;
        chatHistory.push({ role: "assistant", content: answer });
        chatBusy = false;
        port.disconnect();
      } else if (m.type === "error") {
        out.innerHTML = `<span class="ds-error">${escapeHtml(m.error)}</span>`;
        chatBusy = false;
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (chatBusy) {
        if (!answer) out.innerHTML = `<span class="ds-error">连接中断，请重试。</span>`;
        chatBusy = false;
      }
    });
  }

  function body() { return ensurePanel().querySelector("#ds-body"); }
  function setPanelCollapsed(collapsed) {
    panel.classList.toggle("ds-collapsed", collapsed);
    const button = panel.querySelector("#ds-collapse");
    button.querySelector(".ds-collapse-label").textContent = collapsed ? "展开" : "收起";
    button.setAttribute("aria-label", collapsed ? "展开面板" : "收起面板");
    button.setAttribute("aria-expanded", String(!collapsed));
  }
  function openPanel() { ensurePanel(); setPanelCollapsed(false); syncTheme(); panel.style.display = "flex"; }
  function setPanelTitle(t) {
    const title = ensurePanel().querySelector(".ds-panel-title");
    title.textContent = t;
    title.title = t;
  }

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
      `h1,h2,h3{line-height:1.3}h2{color:#31765b}` +
      `.ds-ts{font-size:.85em;font-weight:600;color:#31765b;background:#edf4ef;border-radius:4px;padding:0 5px}` +
      `.ds-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;vertical-align:middle}` +
      `.ds-badge-good{background:#2da44e}.ds-badge-warn{background:#d4a72c}.ds-badge-bad{background:#cf222e}.ds-badge-info{background:#31765b}` +
      `.ds-meter{display:inline-block;vertical-align:middle;width:120px;height:10px;margin:0 6px;border-radius:6px;background:#eceef5;overflow:hidden}` +
      `.ds-meter>span{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#31765b,#31765b)}` +
      `.ds-card{background:#f6f7fb;border-radius:10px;padding:10px 12px;margin:8px 0}` +
      `table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14px}th,td{border:1px solid #e3e6ee;padding:5px 8px;text-align:left}th{background:#edf4ef}` +
      `</style></head><body>\n${renderDoc(lastSummary)}\n</body></html>`;
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + ".html";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build a small document allowlist; generated content cannot load remote assets or execute code.
  function renderDoc(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html).replace(/```html\s*/gi, "").replace(/```/g, "");
    const output = document.createElement("div");
    const allowed = new Set(["H1", "H2", "H3", "P", "UL", "LI", "OL", "STRONG", "EM", "BR", "SPAN", "DIV", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "BLOCKQUOTE", "PRE", "CODE"]);
    const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "FORM"]);
    function clean(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return;
      if (!allowed.has(node.tagName)) { for (const child of node.childNodes) clean(child, parent); return; }
      const el = document.createElement(node.tagName.toLowerCase());
      const classes = [...node.classList].filter(c => /^ds-(?:ts|card|badge(?:-(?:good|warn|bad|info))?|meter)$/.test(c));
      if (classes.length) el.className = classes.join(" ");
      const width = node.style.width;
      if (node.tagName === "SPAN" && /^\d{1,3}(?:\.\d+)?%$/.test(width) && parseFloat(width) <= 100) el.style.width = width;
      for (const child of node.childNodes) clean(child, el);
      parent.append(el);
    }
    for (const child of template.content.childNodes) clean(child, output);
    return output.innerHTML.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, '<span class="ds-ts">$1</span>');
  }

  // ---------- 进度渲染 ----------
  function renderProgress(currentStep, label, meta) {
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
    const scope = meta.sourceType === "selection" ? " · 仅选中文字" + (meta.truncated ? "（已截断至48,000字符）" : "") : "";
    return `<div class="ds-meta">${escapeHtml(meta.title)}${scope}${meta.author ? " · " + escapeHtml(meta.author) : ""}</div>`;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- 流式渲染（节流到每帧一次） ----------
  let rafId = 0;
  function paintStream(done) {
    const tag = done ? "" : `<div class="ds-gen-tag"><span class="ds-mini-spinner"></span> AI 生成中…</div>`;
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

  // ---------- 执行（mode: summary 总结 / translate 翻译 / critique 批判 / comments 结合评论分析） ----------
  let inFlight = false;
  let transcriptCache = null; // { videoId, transcript, meta }，各按钮共用，避免重复抓字幕被限流
  let commentsCache = null;   // { videoId, comments }，结合评论分析按钮复用
  async function onAction(mode, customTool = null, selection = null) {
    // 执行中禁止重复点击：连点会叠加抓取请求，容易把自己打进 B 站风控
    if (inFlight || chatBusy || window.DSPractice.busy) { openPanel(); return; }
    panel?.querySelectorAll("#ds-copy, #ds-download").forEach(b => b.hidden = mode === "quiz");
    if (mode === "quiz") {
      const sourceAdapter = adapter;
      const sourceVideoId = sourceAdapter.getVideoId();
      openPanel(); hideChat(); setPanelTitle(adapter.sourceType === "page" ? "出题自测" : "出题自测");
      panel.querySelectorAll("#ds-copy, #ds-download").forEach(b => b.hidden = true);
      window.DSPractice.mount(body(), {
        videoId: sourceVideoId, url: location.href, sourceType: sourceAdapter.sourceType || "video",
        load: async () => {
          const videoId = sourceAdapter.getVideoId();
          if (adapter !== sourceAdapter) throw new Error("页面已切换，请重新打开出题功能。");
          if (!videoId) throw new Error("请在视频页面使用练习功能。");
          if (videoId !== sourceVideoId) throw new Error("视频已切换，请重新打开出题自测。");
          if (sourceAdapter.cacheTranscript !== false && transcriptCache?.videoId === videoId) return transcriptCache;
          const data = await sourceAdapter.getTranscript(videoId, () => {});
          if (adapter !== sourceAdapter || sourceAdapter.getVideoId() !== sourceVideoId) throw new Error("视频已切换，请重新打开出题自测。");
          if (!data.transcript?.trim()) throw new Error("当前内容没有可用的文字资料。");
          transcriptCache = { ...data, videoId };
          return data;
        }
      });
      return;
    }
    const videoId = selection ? selection.meta.url : adapter.getVideoId();
    if (!videoId) return;
    inFlight = true;
    const L = selection ? { title: "划词总结", gen: "AI 正在理解选中文字…", step: "总结选中文字" } : mode === "custom" ? { title: customTool.name, gen: "AI 正在按你的提示词生成…", step: "生成自定义内容" } : adapter.sourceType === "page" ? { title: "总结网页", gen: "AI 正在整理页面脉络…", step: "AI 理解与总结" } : MODES[mode] || MODES.summary;
    const wantComments = !!L.needsComments;
    lastSummary = "";
    metaLine = "";
    const dataSteps = selection ? ["读取选中文字"] : adapter.steps(); // 抓字幕的前几步
    // 评论模式多一步「读取评论」；末步统一是 DeepSeek 处理
    activeSteps = wantComments ? [...dataSteps, "读取评论", L.step] : [...dataSteps, L.step];
    setPanelTitle(L.title);
    openPanel();
    hideChat();
    renderProgress(1, "正在启动…");

    const fail = (msg) => {
      body().innerHTML = `<div class="ds-error">${escapeHtml(msg)}</div>`;
      inFlight = false;
    };

    // 抓文字稿。同一视频已抓过就复用缓存，不再重复打平台接口（防限流、更快）
    let transcript, meta;
    if (selection) {
      transcript = selection.text;
      meta = selection.meta;
    } else if (adapter.cacheTranscript !== false && transcriptCache && transcriptCache.videoId === videoId) {
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

    // 记下本次结果的上下文，供「追问」时连同发给后台
    curMode = mode; curMeta = { ...meta, url: meta.url || location.href }; curTranscript = transcript; curComments = comments; curCustomTool = customTool;
    curSelectionPrompt = undefined;

    // 末步：后台流式调用 DeepSeek
    renderProgress(activeSteps.length, L.gen, meta);
    const port = chrome.runtime.connect({ name: "summarize" });
    port.postMessage({ type: "START", mode, transcript, comments, meta: curMeta, customToolId: customTool?.id });

    port.onMessage.addListener((m) => {
      if (m.type === "chunk") {
        lastSummary += m.delta;
        scheduleStreamRender(false);
      } else if (m.type === "done") {
        lastTitle = m.meta?.title || lastTitle;
        if (mode === "custom" && m.customTool) curCustomTool = m.customTool;
        if (mode === "selection") curSelectionPrompt = m.selectionPrompt;
        scheduleStreamRender(true);
        // 生成完毕：用本次结果作为对话起点，开放追问
        chatHistory = lastSummary ? [{ role: "assistant", content: lastSummary }] : [];
        showChat();
        inFlight = false;
        port.disconnect();
      } else if (m.type === "error") {
        body().innerHTML = `<div class="ds-error">${escapeHtml(m.error)}</div>`;
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
  const adapters = [];
  let observing = false, scheduled = false;
  function chooseAdapter() {
    scheduled = false;
    const next = adapters.find(a => a.name !== "page" && a.isVideoPage() && a.getVideoId()) || adapters.find(a => a.name === "page" && a.isVideoPage());
    if (next !== adapter) {
      disposeFunctionMenu();
      adapter = next;
      document.getElementById("ds-tool-bar")?.remove();
      transcriptCache = null; commentsCache = null;
    }
    if (adapter) { injectButton(); repositionFunctionMenu(); }
  }
  function register(a) {
    adapters.push(a);
    chooseAdapter();
    if (observing) return;
    observing = true;
    const schedule = () => { if (!scheduled) { scheduled = true; setTimeout(chooseAdapter, 300); } };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
  }

  chrome.runtime.onMessage?.addListener((message, sender) => {
    if (message?.type !== "SELECTION_SUMMARY" || sender.id !== chrome.runtime.id) return;
    const snapshot = message.snapshot;
    if (!snapshot?.text?.trim() || !/^https?:/.test(snapshot.meta?.url || "")) return;
    closeFunctionMenu();
    onAction("selection", null, { text: snapshot.text.slice(0, 48000), meta: { ...snapshot.meta, sourceType: "selection" } });
  });

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
