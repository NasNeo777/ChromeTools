// Regression: host/player styles must not turn the panel title white on light chrome.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent('<html lang="zh-CN"><head><meta charset="utf-8"></head><body class="bili-video-page"><main style="padding:70px;font:24px system-ui;color:#53645a">视频学习 · 样式兼容验证</main></body></html>');
    await page.addStyleTag({ path: path.resolve('content.css') });
    await page.evaluate(() => {
      window.chrome = { runtime: { connect() { return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage() {}, disconnect() {} }; } } };
    });
    for (const file of ['custom-tools.js', 'quiz-shared.js', 'quiz-content.js', 'content-core.js']) await page.addScriptTag({ path: path.resolve(file) });
    await page.evaluate(() => DSSummarizer.register({ name: 'bilibili', isVideoPage: () => true, getVideoId: () => 'header-fixture', steps: () => ['读取字幕'], getTranscript: async () => ({ transcript: '[00:12] 缓存复用读取结果。', meta: { title: '缓存机制 · 界面验证' } }) }));
    await page.getByRole('button', { name: 'AI 工具箱', exact: true }).click();
    await page.getByRole('button', { name: '视频练习', exact: true }).click();
    // Loaded AFTER extension styles to emulate late-injected site/player CSS.
    await page.addStyleTag({ content: '.bili-video-page span {color:white} .bili-video-page .ds-panel-title {color:white;-webkit-text-fill-color:white;text-shadow:0 0 2px white} .bili-video-page button {color:white} .bili-video-page .ds-panel-kicker {color:white}' });
    async function checkHeader(expected) {
      const values = await page.locator('.ds-panel-title').evaluate(el => {
        const css = getComputedStyle(el), header = getComputedStyle(el.closest('.ds-panel-head')), panel = getComputedStyle(el.closest('.ds-panel'));
        const rgb = s => s.match(/[\d.]+/g).map(Number);
        const background = rgb(header.backgroundColor), base = rgb(panel.backgroundColor), alpha = background[3] ?? 1;
        const effective = background.slice(0, 3).map((v, i) => v * alpha + base[i] * (1 - alpha));
        const lum = channels => channels.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const a = lum(rgb(css.color)), b = lum(effective);
        return { color: css.color, fill: css.webkitTextFillColor, shadow: css.textShadow, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
      assert.equal(values.color, expected); assert.equal(values.fill, expected); assert.equal(values.shadow, 'none'); assert.ok(values.contrast >= 4.5, JSON.stringify(values));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#ds-close')).color === getComputedStyle(document.querySelector('.ds-panel-kicker')).color);
      const muted = await page.locator('.ds-panel-kicker').evaluate(el => getComputedStyle(el).color);
      assert.equal(await page.locator('#ds-close').evaluate(el => getComputedStyle(el).color), muted);
      assert.notEqual(muted, 'rgb(255, 255, 255)');
    }
    await checkHeader('rgb(37, 45, 41)');
    await page.click('#ds-quiz-generate'); await page.waitForSelector('.ds-practice-loading'); await checkHeader('rgb(37, 45, 41)');
    fs.mkdirSync('screenshots/toolbox', { recursive: true });
    await page.locator('.ds-panel').screenshot({ path: 'screenshots/toolbox/panel-header-light.png', animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'dark' }); await checkHeader('rgb(227, 234, 229)');
    await page.locator('.ds-panel').screenshot({ path: 'screenshots/toolbox/panel-header-dark.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.ds-panel-title').evaluate(el => { el.textContent = '把当前内容整理为学习笔记并提炼可验证的行动清单'; });
    const fits = await page.evaluate(() => { const title = document.querySelector('.ds-panel-title').getBoundingClientRect(), actions = document.querySelector('.ds-panel-actions').getBoundingClientRect(), panel = document.querySelector('.ds-panel').getBoundingClientRect(); return title.right <= actions.left && panel.left >= 0 && panel.right <= innerWidth; });
    assert.equal(fits, true); await checkHeader('rgb(227, 234, 229)');
    // Verify specificity using a second late host stylesheet in light mode as well.
    await page.emulateMedia({ colorScheme: 'light' }); await checkHeader('rgb(37, 45, 41)');
    console.log('Panel header passed: late host CSS, explicit text/fill colors, contrast, loading state, dark mode and long titles on narrow screens.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
