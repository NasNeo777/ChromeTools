const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1180,height:960}});
  const store={local:{customTools:[]},sync:{apiKey:'existing-test-key',model:'deepseek-flash',style:'brief',language:'中文'}};
  await context.exposeBinding('testReadStorage',(_,area,defaults)=>Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,store[area][key]??fallback])));
  await context.exposeBinding('testWriteStorage',async(_,area,data)=>{
   const changes={};for(const [key,value]of Object.entries(data)){changes[key]={oldValue:store[area][key],newValue:value};store[area][key]=value;}
   await Promise.all(context.pages().map(p=>p.evaluate(({changes,area})=>window.storageListeners?.forEach(fn=>fn(changes,area)),{changes,area})));
  });
  await context.addInitScript(()=>{
   window.storageListeners=[];window.sentMessages=[];
   const area=name=>({get:defaults=>window.testReadStorage(name,defaults),set:data=>window.testWriteStorage(name,data)});
   window.chrome={storage:{local:area('local'),sync:area('sync'),onChanged:{addListener:fn=>storageListeners.push(fn)}},tabs:{query:async()=>[{url:'https://custom-reading.test/article'}]},runtime:{connect(){const listeners=[];return{onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener(){}},disconnect(){},async postMessage(msg){sentMessages.push(msg);setTimeout(async()=>{
    const stored=await chrome.storage.local.get({customTools:[]});const tool=stored.customTools.find(t=>t.id===msg.customToolId);
    const html=msg.type==='CHAT'?'<p>第一步：先确认条件，再制定计划。</p>':'<h2>行动清单</h2><p>先确认条件，再逐步实践。</p><div class="ds-meter"><span style="width:70%"></span></div><pre><code>&lt;example&gt;</code></pre><img src="https://never.test/leak" onerror="window.unsafe=1"><svg onload="window.unsafe=1"></svg><script>window.unsafe=1</script>';
    listeners.forEach(fn=>{fn({type:'chunk',delta:html});fn({type:'done',meta:msg.meta,customTool:tool});});
   },30);}}}}};
  });
  await context.route('https://custom-extension.test/**',r=>{const file=new URL(r.request().url()).pathname.slice(1);return r.fulfill({path:path.resolve(file),contentType:file.endsWith('.png')?'image/png':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});});
  await context.route('https://custom-reading.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><title>学习行动 · 页面示例</title></head><body style="font:16px/1.9 system-ui;background:#f5f7f6;color:#25352b"><article style="max-width:650px;margin:100px auto"><h1>把理解变成行动</h1><p>理解知识之后，需要将它转化为具体行动。先确认应用场景和前提条件，再设计可验证的小步骤，并在每一步之后记录结果。通过这种方式，可以对照最初的假设检验学习效果，及时发现遗漏，形成下一轮改进。</p></article></body></html>'}));
  const popup=await context.newPage();const errors=[];popup.on('pageerror',e=>errors.push(e.message));await popup.goto('https://custom-extension.test/popup.html');await popup.waitForSelector('#custom-add:enabled');
  await popup.click('#custom-add');await popup.click('#custom-save');await popup.getByRole('status').filter({hasText:'按钮名称请填写'}).waitFor();
  await popup.fill('#custom-name','行动清单');await popup.fill('#custom-prompt','理解当前内容，提炼三项可执行的行动。每项写明前提条件和验证方式。');await popup.click('#custom-save');await popup.waitForSelector('#custom-editor[hidden]',{state:'attached'});assert.equal(store.local.customTools.length,1);assert.equal(store.sync.apiKey,'existing-test-key');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://custom-reading.test/article');await page.addStyleTag({path:path.resolve('content.css')});
  for(const file of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js','content-page.js'])await page.addScriptTag({path:path.resolve(file)});
  const launcher=page.getByRole('button',{name:'AI 工具箱',exact:true});await launcher.click();await page.getByRole('button',{name:'行动清单',exact:true}).waitFor();assert.equal(await page.locator('#ds-function-menu button:visible').count(),3);
  await page.getByRole('button',{name:'行动清单',exact:true}).click();await page.waitForSelector('.ds-doc');
  const sent=await page.evaluate(()=>sentMessages[0]);assert.equal(sent.mode,'custom');assert.equal(sent.customToolId,store.local.customTools[0].id);assert.ok(sent.transcript.includes('理解知识之后'));assert.equal(sent.meta.sourceType,'page');
  assert.equal(await page.locator('.ds-panel-title').innerText(),'行动清单');assert.equal(await page.locator('.ds-doc img,.ds-doc script,.ds-doc svg').count(),0);assert.equal(await page.evaluate(()=>window.unsafe),undefined);assert.equal(await page.locator('.ds-doc .ds-meter span').evaluate(el=>el.style.width),'70%');assert.equal(await page.locator('.ds-doc code').innerText(),'<example>');
  await page.fill('#ds-chat-input','展开第一步');await page.click('#ds-chat-send');await page.getByText('第一步：先确认条件，再制定计划。',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>sentMessages.at(-1))).customTool.name,'行动清单');
  const download=page.waitForEvent('download');await page.click('#ds-download');assert.match((await download).suggestedFilename(),/\.html$/);
  await popup.getByRole('button',{name:'编辑 行动清单',exact:true}).click();await popup.fill('#custom-name','结构化改写');await popup.fill('#custom-prompt','保留原意，改写为步骤文档。'+'内容'.repeat(4500));await popup.click('#custom-save');await popup.waitForSelector('#custom-editor[hidden]',{state:'attached'});assert.ok(store.local.customTools[0].prompt.length>8000);
  await launcher.click();await page.getByRole('button',{name:'结构化改写',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'行动清单',exact:true}).count(),0);
  await popup.getByRole('checkbox',{name:'启用 结构化改写',exact:true}).uncheck();await page.waitForFunction(()=>!document.querySelector('[data-custom-tool-id]'));await popup.getByRole('checkbox',{name:'启用 结构化改写',exact:true}).check();await page.waitForSelector('[data-custom-tool-id]',{state:'attached'});
  await popup.getByRole('button',{name:'编辑 结构化改写',exact:true}).click();await popup.selectOption('#custom-scope','video');await popup.click('#custom-save');await popup.waitForSelector('#custom-editor[hidden]',{state:'attached'});await page.waitForFunction(()=>!document.querySelector('[data-custom-tool-id]'));
  await popup.getByRole('button',{name:'编辑 结构化改写',exact:true}).click();await popup.selectOption('#custom-scope','all');await popup.fill('#custom-prompt','理解原文，生成结构清晰的步骤文档，标明每步的前提与验证方式。');await popup.click('#custom-save');await popup.waitForSelector('#custom-editor[hidden]',{state:'attached'});await page.waitForSelector('[data-custom-tool-id]',{state:'attached'});
  // An edited/deleted tool does not alter the prompt snapshot for the generated conversation.
  assert.equal((await page.evaluate(()=>sentMessages.find(m=>m.type==='CHAT'))).customTool.name,'行动清单');
  fs.mkdirSync('screenshots/toolbox',{recursive:true});await popup.locator('.custom-module').screenshot({path:'screenshots/toolbox/custom-tools.png',animations:'disabled'});
  await page.click('#ds-close');if(await launcher.getAttribute('aria-expanded')==='false')await launcher.click();await page.screenshot({path:'screenshots/toolbox/custom-menu.png',animations:'disabled'});
  await popup.getByRole('button',{name:'删除 结构化改写',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-custom-tool-id]'));assert.equal(store.local.customTools.length,0);assert.equal(await page.getByRole('button',{name:'理解页面',exact:true}).count(),1);assert.equal(store.sync.apiKey,'existing-test-key');
  assert.deepEqual(errors,[]);
  console.log('Custom tools UI passed: validation, independent saving, long prompts, live menu updates, generation, safe document rendering, chat, export, editing, disabling, scope and deletion.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
