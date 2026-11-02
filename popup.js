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
    const active = matchActive(tool.match, activeMatch) && (tool.id !== "page-learning" || !isVideoURL(activeMatch));
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <span class="tool-index">${tool.icon}</span><span>${tool.name}</span>
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
  clearTimeout(statusTimer);
  if (ok) statusTimer = setTimeout(() => (el.textContent = ""), 3000);
}

let drafts = {}, selected = "deepseek", statusTimer;
function isVideoURL(url) {
  try { const u = new URL(url); return /(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === "/watch" || /(^|\.)bilibili\.com$/.test(u.hostname) && u.pathname.startsWith("/video/"); } catch { return false; }
}
function stashProfile() {
  drafts[selected] = { ...drafts[selected], apiKey: $("apiKey").value.trim(), model: $("model").value.trim(), baseUrl: $("baseUrl").value.trim() };
}
function renderProvider() {
  const p = AIProviders.providers[selected], values = drafts[selected];
  $("provider").value = selected;
  $("apiKey-label").textContent = p.name + " API Key";
  $("apiKey").value = values.apiKey;
  $("model").value = values.model;
  $("baseUrl").value = values.baseUrl;
  $("model-hint").textContent = selected === "deepseek" ? "deepseek-flash（默认，快速） / deepseek-v4-pro（思考模式）。" + (values.legacyModel ? " 旧模型 ID 已兼容升级，原 ID 已留存。" : "") : "可选建议模型，也可输入服务商提供的其他模型 ID。";
  $("baseUrl").placeholder = p.baseUrl || "https://api.example.com/v1";
  $("provider-docs").hidden = !p.docs;
  if (p.docs) $("provider-docs").href = p.docs;
  $("model-suggestions").replaceChildren(...p.models.map(id => { const o = document.createElement("option"); o.value = id; return o; }));
  $("endpoint-hint").textContent = p.protocol === "anthropic" ? "使用 Claude Messages 协议。" : "使用 OpenAI Chat Completions 兼容协议。";
  document.querySelector(".api-advanced").open = selected === "custom";
}
async function save() {
  stashProfile();
  const current = drafts[selected];
  if (!current.apiKey) return showStatus("请填写 " + AIProviders.providers[selected].name + " API Key", false);
  if (!current.model) return showStatus("请填写模型 ID", false);
  try { AIProviders.endpoint(current.baseUrl, AIProviders.providers[selected].protocol); }
  catch (err) { return showStatus(err.message, false); }
  const data = { provider: selected, providers: drafts };
  // Retain the original field names for existing DeepSeek installs and rollback.
  data.apiKey = drafts.deepseek.apiKey; data.model = drafts.deepseek.model;
  document.querySelectorAll("#tool-list select").forEach(sel => { data[sel.dataset.key] = sel.value; });
  $("save").disabled = true;
  try {
    await chrome.storage.sync.set(data);
    showStatus("设置已保存 · 当前使用 " + AIProviders.providers[selected].name);
  } catch (err) { showStatus("保存失败：" + err.message, false); }
  finally { $("save").disabled = false; }
}
async function init() {
  try {
    const current = await chrome.storage.sync.get(collectDefaults());
    drafts = AIProviders.profiles(current);
    selected = Object.hasOwn(AIProviders.providers, current.provider) ? current.provider : "deepseek";
    $("provider").replaceChildren(...Object.entries(AIProviders.providers).map(([id,p]) => { const o = document.createElement("option"); o.value = id; o.textContent = p.name; return o; }));
    renderProvider();
    $("provider").addEventListener("change", () => { stashProfile(); selected = $("provider").value; renderProvider(); });
    let url = "";
    try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); url = tab?.url || ""; } catch {}
    renderTools(current, url);
    $("save").addEventListener("click", save);
  } catch (err) { showStatus("读取设置失败：" + err.message, false); }
}

document.addEventListener("DOMContentLoaded", init);
