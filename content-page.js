/* On ordinary pages, extract rendered article text only when the user asks. */
(function () {
  'use strict';
  const OMIT = 'script,style,noscript,template,svg,canvas,iframe,video,audio,nav,aside,footer,form,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],#ds-tool-bar,.ds-function-menu,.ds-panel';
  function extract(node, limit = 240000) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const visible = new WeakMap();
    function isVisible(el) {
      if (!el || el === document.documentElement) return true;
      if (visible.has(el)) return visible.get(el);
      const style = getComputedStyle(el);
      const ok = style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' && isVisible(el.parentElement);
      visible.set(el, ok); return ok;
    }
    const pieces = []; let length = 0, text;
    while ((text = walker.nextNode())) {
      const parent = text.parentElement;
      if (!parent || parent.closest(OMIT) || !isVisible(parent)) continue;
      const value = text.textContent.replace(/[\t \u00a0]+/g, ' ').trim();
      if (!value) continue;
      pieces.push(value); length += value.length + 1;
      if (length >= limit) break;
    }
    return pieces.join('\n');
  }
  async function getTranscript(id, report) {
    report(1, '正在读取页面正文…');
    const candidates = [...document.querySelectorAll('article,main,[role="main"]')].filter(el => !el.closest('.ds-panel,#ds-tool-bar'));
    let text = '';
    for (const node of candidates) { const candidate = extract(node); if (candidate.length > text.length) text = candidate; }
    if (text.length < 160) text = extract(document.body);
    if (text.length < 80) throw new Error('当前页面没有足够的可读正文。请等待内容加载，或打开文章详情页后再试。');
    const truncated = text.length > 48000;
    text = text.slice(0,48000) + (truncated ? '\n（正文过长：仅提供前48,000字符，后续内容未读取。）' : '');
    const meta = { title: document.title || location.hostname, author: location.hostname, url: location.href, sourceType: 'page', truncated };
    report(2, truncated ? '已提取正文前48,000字符' : '页面正文已就绪', meta);
    return { transcript: text, meta };
  }
  window.DSSummarizer.register({
    name: 'page', sourceType: 'page', cacheTranscript: false,
    isVideoPage: () => /^https?:$/.test(location.protocol),
    getVideoId: () => location.href,
    getTranscript,
    steps: () => ['识别页面内容', '提取可读正文']
  });
})();
