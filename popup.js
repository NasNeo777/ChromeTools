// popup.js —— 工具箱首页逻辑：渲染工具卡片 + 读写设置

const $ = (id) => document.getElementById(id);

// 汇总所有需要读取/保存的字段及其默认值
function collectDefaults() {
  const defaults = { ...window.DS_GLOBAL_DEFAULTS };
  for (const tool of window.DS_TOOLS) {
    for (const opt of tool.options || []) defaults[opt.key] = opt.default;
  }
  return defaults;
}

// 渲染工具卡片
function renderTools(current, activeMatch) {
  const wrap = $("tool-list");
  wrap.innerHTML = "";
  for (const tool of window.DS_TOOLS) {
    const active = matchActive(tool.match, activeMatch);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <span>${tool.icon}</span><span>${tool.name}</span>
        <span class="badge ${active ? "on" : "off"}">${active ? "当前页可用" : "在指定页生效"}</span>
      </div>
      <div class="card-desc">${tool.desc}</div>
    `;
    for (const opt of tool.options || []) {
      const label = document.createElement("label");
      label.textContent = opt.label;
      label.setAttribute("for", `opt-${opt.key}`);
      const sel = document.createElement("select");
      sel.id = `opt-${opt.key}`;
      sel.dataset.key = opt.key;
      for (const c of opt.choices) {
        const o = document.createElement("option");
        o.value = c.value;
        o.textContent = c.label;
        sel.appendChild(o);
      }
      sel.value = current[opt.key] ?? opt.default;
      card.appendChild(label);
      card.appendChild(sel);
    }
    wrap.appendChild(card);
  }
}

// 简易判断工具是否在当前标签页生效
function matchActive(pattern, url) {
  if (!url) return false;
  if (pattern === "<all_urls>") return /^https?:/.test(url);
  // 把 chrome match pattern 转成正则
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
  return re.test(url);
}

function showStatus(msg, ok = true) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => (el.textContent = ""), 2000);
}

function save() {
  const data = {
    apiKey: $("apiKey").value.trim(),
    model: $("model").value
  };
  document.querySelectorAll("#tool-list select").forEach((sel) => {
    data[sel.dataset.key] = sel.value;
  });
  if (!data.apiKey) {
    showStatus("请填写 DeepSeek API Key", false);
    return;
  }
  chrome.storage.sync.set(data, () => showStatus("✓ 已保存"));
}

async function init() {
  const defaults = collectDefaults();
  const current = await chrome.storage.sync.get(defaults);
  $("apiKey").value = current.apiKey || "";
  $("model").value = current.model || "deepseek-chat";

  // 取当前标签页 URL，用于判断工具是否可用
  let url = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab?.url || "";
  } catch (e) {}

  renderTools(current, url);
  $("save").addEventListener("click", save);
}

document.addEventListener("DOMContentLoaded", init);
