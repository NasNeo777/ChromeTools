const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}});const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('https://reading.example/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>缓存与一致性 · 阅读示例</title><style>body{margin:0;background:#f4f6f4;color:#2c3830;font:16px/1.9 system-ui}article{max-width:680px;margin:90px auto;padding:0 32px}h1{font-size:32px;line-height:1.4;letter-spacing:-.04em}.secret{display:none}</style></head><body><nav>NAV_SECRET</nav><article><h1>缓存，让每一次读取更轻。</h1><p>缓存会复用已经获取的结果，减少相同资源的重复请求。对于视频字幕，切换学习模式时可以复用同一份文本，避免重复下载。读取速度会更快，也能降低接口调用次数。</p><h2>理解效率与一致性的取舍</h2><p>缓存中的数据可能过期，所以需要明确失效条件。当视频、页面地址或内容发生变化时，应该重新读取数据。在普通网页上，每次总结前重新提取正文，可以减少陈旧内容带来的误解。</p><p class="secret">HIDDEN_SECRET</p><form><input value="INPUT_SECRET"><textarea>FORM_SECRET</textarea></form></article><footer>FOOTER_SECRET</footer></body></html>`}));
  await page.goto('https://reading.example/article');
  await page.evaluate(()=>{
   window.requests=[];
   window.chrome={runtime:{connect(){const handlers=[],disconnect=[];return{onMessage:{addListener:fn=>handlers.push(fn)},onDisconnect:{addListener:fn=>disconnect.push(fn)},disconnect(){},postMessage(msg){requests.push(msg);setTimeout(()=>{
    if(msg.type==='START'){handlers.forEach(fn=>{fn({type:'chunk',delta:'<h2>页面核心观点</h2><p>缓存通过复用结果减少重复请求，需要处理失效。</p>'});fn({type:'done',meta:msg.meta});});}
    if(msg.type==='QUIZ_GENERATE'){const questions=Array.from({length:msg.config.count},(_,i)=>{const type=msg.config.types[i%msg.config.types.length];return{type,prompt:type==='blank'?'缓存通过复用结果减少____请求。':'说明缓存与重新读取的差异。',options:type==='choice'?['减少重复请求','删除内容','改变标题','改变网络协议']:[],answer:type==='choice'?'A':'重复',explanation:'缓存复用已有数据。',rubric:['复用已有数据'],evidence:'缓存会复用已经获取的结果，减少相同资源的重复请求。'};});handlers.forEach(fn=>fn({type:'quiz-result',quiz:{config:msg.config,questions}}));}
   },30);}}}}};
  });
  await page.evaluate(data=>{chrome.runtime.getURL=()=>data;},'data:image/png;base64,'+fs.readFileSync('icons/icon48.png').toString('base64'));
  await page.addStyleTag({path:path.resolve('content.css')});
  for(const f of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js','content-youtube.js','content-bilibili.js','content-page.js'])await page.addScriptTag({path:path.resolve(f)});
  assert.equal(await page.locator('#ds-tool-bar').count(),1);assert.equal(await page.locator('#ds-tool-bar button:visible').count(),1);
  const launcher=page.getByRole('button',{name:'AI 工具箱',exact:true});
  await launcher.click();assert.equal(await page.locator('#ds-function-menu button:visible').count(),2);assert.equal(await launcher.getAttribute('aria-expanded'),'true');
  fs.mkdirSync('screenshots/toolbox',{recursive:true});await page.screenshot({path:'screenshots/toolbox/page-menu.png',animations:'disabled'});
  await page.keyboard.press('Escape');assert.equal(await launcher.getAttribute('aria-expanded'),'false');
  await launcher.click();await page.getByRole('button',{name:'理解页面',exact:true}).click();await page.waitForSelector('.ds-doc');
  let request=await page.evaluate(()=>requests.at(-1));assert.equal(request.meta.sourceType,'page');assert.ok(request.transcript.includes('缓存会复用'),JSON.stringify(request));
  for(const secret of ['NAV_SECRET','HIDDEN_SECRET','INPUT_SECRET','FORM_SECRET','FOOTER_SECRET','AI TOOLBOX'])assert.ok(!request.transcript.includes(secret),secret);
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='更新后的正文内容：每次总结都会重新读取。';document.querySelector('article').append(p);});
  await launcher.click();await page.getByRole('button',{name:'理解页面',exact:true}).click();await page.waitForFunction(()=>requests.length===2);assert.ok((await page.evaluate(()=>requests.at(-1).transcript)).includes('更新后的正文内容'));
  await page.waitForSelector('.ds-doc');await launcher.click();await page.getByRole('button',{name:'页面出题',exact:true}).click();
  await page.getByText('为这篇内容，出一份试卷。',{exact:true}).waitFor();await page.selectOption('#ds-quiz-count','3');await page.click('#ds-quiz-generate');await page.waitForSelector('.ds-question');
  request=await page.evaluate(()=>requests.at(-1));assert.equal(request.type,'QUIZ_GENERATE');assert.equal(request.meta.sourceType,'page');assert.equal(await page.locator('.ds-question').count(),3);
  await page.locator('#ds-close').click();await page.evaluate(()=>document.querySelectorAll('nav,form,footer').forEach(el=>el.style.visibility='hidden'));await launcher.click();await page.screenshot({path:'screenshots/toolbox/page-menu.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#ds-function-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
  assert.deepEqual(errors,[]);console.log('Webpage UI passed: one-button menu, keyboard dismissal, text extraction, private/hidden text exclusion, fresh content, summary and quiz.');
  // Test platform recognition after loading all adapters, including non-video routes and SPA changes.
  for(const [url,count] of [['https://www.youtube.com/watch?v=abc',5],['https://www.bilibili.com/video/BVabc',5],['https://www.youtube.com/',2]]){
   const p=await browser.newPage();await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body><main>阅读内容</main></body></html>'}));await p.goto(url);
   await p.evaluate(()=>{window.chrome={runtime:{}}});
   for(const f of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js','content-youtube.js','content-bilibili.js','content-page.js'])await p.addScriptTag({path:path.resolve(f)});
   await p.getByRole('button',{name:'AI 工具箱',exact:true}).click();assert.equal(await p.locator('#ds-function-menu button:visible').count(),count);
   if(count===5){await p.evaluate(()=>{history.pushState({},'', '/');document.body.append(document.createElement('p'));});await p.waitForTimeout(350);await p.getByRole('button',{name:'AI 工具箱',exact:true}).click();assert.equal(await p.locator('#ds-function-menu button:visible').count(),2);}
   await p.close();
  }
  console.log('Platform recognition passed: YouTube, Bilibili, ordinary pages and SPA fallback retain the correct functions.');
  const popup=await browser.newPage({viewport:{width:420,height:1000}});
  await popup.route('https://extension.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1);return r.fulfill({path:path.resolve(name),contentType:name.endsWith('.png')?'image/png':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});});
  await popup.addInitScript(()=>{window.saved={apiKey:'legacy-test-key',model:'deepseek-reasoner',style:'brief',language:'English'};window.chrome={runtime:{},storage:{local:{get:async()=>({customTools:[]}),set:async()=>{}},sync:{get:async defaults=>({...defaults,...window.saved}),set:async data=>{window.saved={...window.saved,...data}}}},tabs:{query:async()=>[{url:'https://reading.example/article'}]}}});
  await popup.goto('https://extension.test/popup.html');await popup.waitForSelector('#provider option',{state:'attached'});assert.equal(await popup.inputValue('#apiKey'),'legacy-test-key');assert.equal(await popup.inputValue('#model'),'deepseek-v4-pro');assert.equal(await popup.inputValue('#opt-style'),'brief');
  await popup.selectOption('#provider','kimi');await popup.fill('#apiKey','kimi-test-key');await popup.fill('#model','kimi-test-model');
  await popup.selectOption('#provider','claude');await popup.fill('#apiKey','claude-test-key');await popup.fill('#model','claude-test-model');
  await popup.selectOption('#provider','kimi');assert.equal(await popup.inputValue('#apiKey'),'kimi-test-key');
  await popup.click('#save');await popup.getByRole('status').filter({hasText:'设置已保存'}).waitFor();
  const saved=await popup.evaluate(()=>window.saved);assert.equal(saved.apiKey,'legacy-test-key');assert.equal(saved.model,'deepseek-v4-pro');assert.equal(saved.providers.deepseek.legacyModel,'deepseek-reasoner');assert.equal(saved.providers.claude.apiKey,'claude-test-key');assert.equal(saved.providers.kimi.model,'kimi-test-model');assert.equal(saved.provider,'kimi');assert.equal(saved.style,'brief');
  await popup.selectOption('#provider','deepseek');assert.equal(await popup.inputValue('#apiKey'),'legacy-test-key');await popup.fill('#apiKey','');await popup.screenshot({path:'screenshots/toolbox/settings.png',fullPage:true});
  console.log('Provider settings UI passed: legacy migration, draft switching, separate keys, models and preference preservation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
