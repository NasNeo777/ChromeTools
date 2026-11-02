const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ screen: { width: 1440, height: 900 }, viewport: { width: 220, height: 600 } });
    await context.route('https://popup-layout.test/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ path: path.resolve(name), contentType: name.endsWith('.png') ? 'image/png' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    });
    await context.addInitScript(() => {
      window.chrome = { runtime: {}, storage: { sync: { get: async defaults => defaults, set: async () => {} }, local: { get: async () => ({ customTools: [] }), set: async () => {} } }, tabs: { query: async () => [{ url: 'https://www.youtube.com/watch?v=test' }] } };
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://popup-layout.test/popup.html'); await page.waitForSelector('.card-head');
    // Chrome determines the real popup width from this intrinsic layout, not its tiny initial viewport.
    assert.equal(await page.locator('html').evaluate(el => el.getBoundingClientRect().width), 680);
    assert.equal(await page.locator('body').evaluate(el => el.getBoundingClientRect().width), 680);
    await page.setViewportSize({ width: 680, height: 600 });
    const layout = await page.evaluate(() => {
      const api = document.querySelector('#api-settings').getBoundingClientRect(), tools = document.querySelector('#tool-list').getBoundingClientRect(), save = document.querySelector('#save').getBoundingClientRect();
      return { columns: Math.abs(api.top - tools.top) < 1 && api.right < tools.left, saveVisible: save.top >= 0 && save.bottom <= innerHeight, noOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(layout, { columns: true, saveVisible: true, noOverflow: true });
    await page.click('#custom-add'); await page.fill('#custom-name', '提炼行动清单'); await page.fill('#custom-prompt', '理解原文，提炼可以执行的步骤。');
    assert.equal(await page.locator('#save').evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), true);
    await page.click('#custom-cancel'); await page.evaluate(() => document.querySelector('.section').scrollTop = 0);
    fs.mkdirSync('screenshots/toolbox', { recursive: true });
    await page.screenshot({ path: 'screenshots/toolbox/settings-wide.png' });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: 'screenshots/toolbox/settings-wide-dark.png' });
    assert.deepEqual(errors, []); await context.close();
    const narrow = await browser.newContext({ screen: { width: 390, height: 844 }, viewport: { width: 390, height: 844 } });
    await narrow.route('https://popup-layout.test/**', route => { const name = new URL(route.request().url()).pathname.slice(1); return route.fulfill({ path: path.resolve(name), contentType: name.endsWith('.png') ? 'image/png' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }); });
    await narrow.addInitScript(() => { window.chrome = { runtime: {}, storage: { sync: { get: async defaults => defaults }, local: { get: async () => ({ customTools: [] }) } }, tabs: { query: async () => [] } }; });
    const small = await narrow.newPage(); await small.goto('https://popup-layout.test/popup.html'); await small.waitForSelector('.card-head');
    assert.equal(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await small.locator('html').evaluate(el => el.getBoundingClientRect().width), 390);
    console.log('Popup layout passed: 680px intrinsic width, two columns, fixed visible save actions, scrolling editor, dark mode and narrow-screen fallback.');
    await narrow.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
