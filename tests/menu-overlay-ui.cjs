const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const native of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:1900px;background:#f4f6f4;font:16px/1.8 system-ui;color:#26372c}.metadata{position:relative;top:220px;margin-left:24px;width:850px;height:110px;overflow:hidden;transform:translateZ(0);z-index:0}.cover{position:fixed;left:0;top:330px;width:1150px;height:440px;background:#edf0ee;z-index:9999;padding:24px;box-sizing:border-box}h1{font-size:24px;margin:0}#outside{position:fixed;right:20px;top:20px}</style></head><body><section class="metadata"><div id="above-the-fold"><div id="title"><h1>视频内容与学习 · 菜单层级验证</h1></div></div></section><div class="cover">频道信息、操作栏与视频简介区域</div><button id="outside">页面其他操作</button></body></html>`);
      await page.evaluate(useNative => {
        if (!useNative) Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: undefined, configurable: true });
        window.changeHandlers = [];
        window.chrome = { storage: { local: { get: async () => ({ customTools: [] }) }, onChanged: { addListener: fn => changeHandlers.push(fn) } }, runtime: {} };
      }, native);
      await page.addStyleTag({ path: path.resolve('content.css') });
      for (const file of ['custom-tools.js', 'quiz-shared.js', 'quiz-content.js', 'content-core.js', 'content-youtube.js']) await page.addScriptTag({ path: path.resolve(file) });
      // The real YouTube placement adapter is used; the fixture only supplies its URL.
      await page.evaluate(() => DSSummarizer.register({ name: 'fixture', isVideoPage: () => true, getVideoId: () => 'video', placeBar: bar => { document.querySelector('#above-the-fold').append(bar); return true; }, steps: () => [] }));
      const launcher = page.getByRole('button', { name: 'AI 工具箱', exact: true });
      await launcher.click();
      const menu = page.locator('#ds-function-menu');
      assert.equal(await menu.evaluate(el => el.parentElement === document.body), true);
      assert.equal(await menu.locator('button').count(), 5);
      if (native) assert.equal(await menu.evaluate(el => el.matches(':popover-open')), true);
      async function checkHitTargets() {
        const hit = await menu.locator('button').evaluateAll(buttons => buttons.map(button => {
          const r = button.getBoundingClientRect();
          if (r.bottom > innerHeight || r.top < 0) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return button === hit || button.contains(hit);
        }));
        assert.ok(hit.every(Boolean), JSON.stringify(hit));
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await checkHitTargets();
      await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.textContent), '翻译原文');
      await page.keyboard.press('Escape'); assert.equal(await launcher.getAttribute('aria-expanded'), 'false'); assert.equal(await launcher.evaluate(el => el === document.activeElement), true);
      await launcher.click(); await page.locator('#outside').click(); assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
      await launcher.click();
      await page.evaluate(() => scrollTo(0, 80));
      await page.waitForFunction(() => { const menu = document.querySelector('#ds-function-menu'), button = document.querySelector('.ds-launcher').getBoundingClientRect(), r = menu.getBoundingClientRect(); return Math.abs(r.top - button.bottom - 9) < 2; });
      await checkHitTargets();
      await page.evaluate(() => scrollTo(0, 600)); await page.waitForFunction(() => document.querySelector('#ds-function-menu').hidden);
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => { document.querySelector('.metadata').style.top = '780px'; });
      await launcher.click(); assert.equal(await menu.getAttribute('data-side'), 'top'); await checkHitTargets();
      if (native) { fs.mkdirSync('screenshots/toolbox', { recursive: true }); await page.screenshot({ path: 'screenshots/toolbox/youtube-menu-fixed.png', animations: 'disabled' }); }
      await page.setViewportSize({ width: 390, height: 640 });
      await page.evaluate(() => { document.querySelector('.metadata').style.top = '470px'; dispatchEvent(new Event('resize')); });
      if (await launcher.getAttribute('aria-expanded') === 'false') await launcher.click();
      const tools = Array.from({ length: 20 }, (_, i) => ({ id: 'tool-' + i, name: '自定义工具 ' + i, prompt: '理解当前原文', scope: 'all', enabled: true }));
      await page.evaluate(customTools => changeHandlers.forEach(fn => fn({ customTools: { newValue: customTools } }, 'local')), tools);
      await page.waitForFunction(() => { const r = document.querySelector('#ds-function-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
      assert.equal(await menu.evaluate(el => el.scrollHeight > el.clientHeight), true);
      // Removing the inline launcher must also remove the detached/top-layer menu.
      await page.evaluate(() => document.querySelector('#ds-tool-bar').remove());
      await page.waitForFunction(() => document.querySelectorAll('#ds-function-menu').length === 1 && document.querySelector('#ds-function-menu').hidden && document.querySelector('#ds-tool-bar'));
      assert.deepEqual(errors, []);
      console.log(`Menu overlay passed (${native ? 'native top layer' : 'fallback'}): stacking/clipping, hit targets, scroll, flip, keyboard, outside dismissal, narrow layout, long menus and reinjection cleanup.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
