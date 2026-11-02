/* Independent local persistence keeps long prompts out of sync quotas. */
(function () {
  'use strict';
  let tools = [], editing = null, saving = false;
  const $ = id => document.getElementById(id);
  function status(message, error = false) {
    $('custom-status').textContent = message;
    $('custom-status').className = 'custom-status' + (error ? ' error' : '');
  }
  function editor(tool = null) {
    editing = tool?.id || null;
    $('custom-editor').hidden = false;
    $('custom-name').value = tool?.name || '';
    $('custom-prompt').value = tool?.prompt || '';
    $('custom-scope').value = tool?.scope || 'all';
    $('custom-editor-title').textContent = tool ? '编辑工具' : '新建工具';
    $('custom-name').focus();
    status('');
  }
  function render() {
    const container = $('custom-tool-list'); container.replaceChildren();
    $('custom-count').textContent = `${tools.length} / ${AICustomTools.MAX_TOOLS}`;
    $('custom-add').disabled = saving || tools.length >= AICustomTools.MAX_TOOLS;
    if (!tools.length) {
      const empty = document.createElement('p'); empty.className = 'custom-empty';
      empty.textContent = '把常用提示词变成一个按钮。比如：提炼行动清单、解释难点、改写成文章。'; container.append(empty);
    }
    for (const tool of tools) {
      const row = document.createElement('div'); row.className = 'custom-tool-row';
      const head = document.createElement('div'); head.className = 'custom-tool-head';
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = tool.enabled;
      enabled.setAttribute('aria-label', `启用 ${tool.name}`); enabled.disabled = saving;
      enabled.addEventListener('change', async () => {
        const next = tools.map(t => t.id === tool.id ? { ...t, enabled: enabled.checked } : t);
        await persist(next, '工具状态已更新，页面菜单已同步。');
      });
      const name = document.createElement('strong'); name.textContent = tool.name;
      const scope = document.createElement('span'); scope.className = 'custom-scope-label'; scope.textContent = AICustomTools.scopes[tool.scope];
      head.append(enabled, name, scope);
      const excerpt = document.createElement('p'); excerpt.className = 'custom-excerpt'; excerpt.textContent = tool.prompt;
      const actions = document.createElement('div'); actions.className = 'custom-row-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '编辑'; edit.disabled = saving;
      edit.setAttribute('aria-label', `编辑 ${tool.name}`); edit.addEventListener('click', () => editor(tool));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.disabled = saving;
      remove.setAttribute('aria-label', `删除 ${tool.name}`);
      remove.addEventListener('click', async () => {
        if (await persist(tools.filter(t => t.id !== tool.id), '工具已删除。')) {
          if (editing === tool.id) { editing = null; $('custom-editor').hidden = true; }
        }
      });
      actions.append(edit, remove); row.append(head, excerpt, actions); container.append(row);
    }
  }
  async function persist(next, message) {
    if (saving) return false;
    saving = true; $('custom-save').disabled = true; render();
    try {
      next = AICustomTools.list(next);
      await chrome.storage.local.set({ customTools: next });
      tools = next; status(message); return true;
    } catch (error) { status('保存失败：' + error.message, true); return false; }
    finally { saving = false; $('custom-save').disabled = false; render(); }
  }
  async function saveTool(event) {
    event.preventDefault();
    if (saving) return;
    try {
      const existing = tools.find(t => t.id === editing);
      const tool = AICustomTools.validate({ id: editing || crypto.randomUUID(), name: $('custom-name').value, prompt: $('custom-prompt').value, scope: $('custom-scope').value, enabled: existing?.enabled ?? true });
      const next = editing ? tools.map(t => t.id === editing ? tool : t) : [...tools, tool];
      if (await persist(next, '工具已保存，打开页面的 AI 工具箱即可使用。')) { editing = null; $('custom-editor').hidden = true; }
    } catch (error) { status(error.message, true); }
  }
  async function init() {
    $('custom-add').addEventListener('click', () => editor());
    $('custom-cancel').addEventListener('click', () => { editing = null; $('custom-editor').hidden = true; status(''); });
    $('custom-editor').addEventListener('submit', saveTool);
    try {
      const stored = await chrome.storage.local.get({ customTools: [] });
      tools = AICustomTools.list(stored.customTools); render();
    } catch (error) {
      status('读取自定义工具失败：' + error.message, true);
      // Do not overwrite unreadable data with an empty list.
      $('custom-add').disabled = true;
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
