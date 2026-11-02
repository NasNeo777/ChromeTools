// Run with Playwright available via NODE_PATH, or PLAYWRIGHT_MODULE pointing to it.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    async function action(page,name) { await page.getByRole('button',{name:'AI 工具箱',exact:true}).click(); await page.getByRole('button',{name,exact:true}).click(); }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', err => { errors.push(err.message); console.error('UI error:', err.message); });
    await page.setContent('<html lang="zh-CN"><body style="margin:0;background:#f1f3f2"><main style="padding:80px;font:24px system-ui;color:#69746d">视频学习 · 预览环境</main></body></html>');
    await page.addStyleTag({path:path.resolve('content.css')});
    await page.evaluate(() => {
      window.testRequests=[]; window.testDisconnect=false; window.testGradeFail=false; window.testLoadFail=false;
      window.chrome={runtime:{connect(){const listeners=[],disconnect=[];return {onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener:fn=>disconnect.push(fn)},disconnect(){},postMessage(msg){window.testRequests.push(msg);setTimeout(()=>{
        if(window.testDisconnect){window.testDisconnect=false;disconnect.forEach(fn=>fn());return;}
        if(msg.type==='START'){listeners.forEach(fn=>{fn({type:'chunk',delta:'<h2>缓存的用途</h2><p>减少重复读取。</p>'});fn({type:'done',meta:msg.meta});});return;}
        if(window.testGradeFail&&msg.type==='QUIZ_GRADE'){window.testGradeFail=false;listeners.forEach(fn=>fn({type:'error',error:'模拟服务暂不可用，请重试。'}));return;}
        const questions=Array.from({length:msg.config?.count||3},(_,i)=>{const type=(msg.config?.types||['choice','short','blank'])[i%(msg.config?.types.length||3)];return {id:i+1,type,prompt:type==='blank'?'缓存通过复用结果来减少____读取。':type==='short'?'对比使用缓存与每次重新获取字幕，在请求次数和结果时效性上有什么区别？':'同一视频切换分析模式时，复用字幕缓存的主要作用是什么？',options:type==='choice'?['减少重复读取与接口请求','让视频播放速度翻倍','改变原视频中的字幕','生成与内容无关的答案']:[],answer:type==='choice'?'A':'减少重复读取；缓存需要失效策略。',rubric:['说明复用结果','指出更新与失效的条件'],explanation:'缓存避免相同资源的重复请求，但要在视频或内容变化时失效。',evidence:'[02:18] 同一视频的字幕会缓存，切换模式不重复抓取。',points:10};});
        const response=msg.type==='QUIZ_GENERATE'?{type:'quiz-result',quiz:{questions,config:msg.config}}:{type:'quiz-grade',results:msg.quiz.questions.map((q,i)=>({id:q.id,score:!msg.answers[i]?0:q.type==='choice'?(msg.answers[i]==='A'?10:0):7,feedback:msg.answers[i]?'理解了复用机制，可进一步说明缓存失效的条件。':'未作答。'}))};listeners.forEach(fn=>fn(response));
      },100);}}}}};
    });
    for(const file of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js'])await page.addScriptTag({path:path.resolve(file)});
    await page.evaluate(()=>DSSummarizer.register({isVideoPage:()=>true,getVideoId:()=> 'test-video',placeBar:bar=>{document.body.append(bar);return true;},steps:()=>['读取字幕'],getTranscript:async()=>{if(window.testLoadFail){window.testLoadFail=false;throw Error('没有可用字幕');}return {transcript:'[02:18] 同一视频的字幕会缓存，切换模式不重复抓取。',meta:{title:'缓存如何减少重复请求 · 视频学习示例'}};}}));
    await action(page,'出题自测');
    await page.locator('[data-difficulty=easy]').click();
    await page.selectOption('#ds-quiz-count','3');
    await page.evaluate(()=>window.testLoadFail=true);
    await page.click('#ds-quiz-generate');
    await page.getByRole('alert').filter({hasText:'没有可用字幕'}).waitFor();
    await page.click('#ds-quiz-generate');
    await page.waitForSelector('.ds-question');
    assert.equal(await page.locator('.ds-question').count(),3);
    assert.equal(await page.locator('#ds-copy').isVisible(),false);
    await page.check('input[name="ds-question-0"][value="A"]');
    await page.fill('#ds-answer-1','缓存复用旧结果，重复请求会重新读取。');
    await page.fill('#ds-answer-2','重复');
    assert.match(await page.locator('#ds-answered').innerText(),/3 \/ 3/);
    // Returning to the same practice keeps the draft and source context.
    await action(page,'总结视频');
    await page.waitForSelector('.ds-doc');
    assert.equal(await page.locator('#ds-copy').isVisible(),true);
    await action(page,'出题自测');
    assert.equal(await page.inputValue('#ds-answer-1'),'缓存复用旧结果，重复请求会重新读取。');
    await page.evaluate(()=>window.testGradeFail=true);
    await page.click('#ds-quiz-submit');
    await page.getByRole('alert').filter({hasText:'模拟服务暂不可用'}).waitFor();
    assert.equal(await page.inputValue('#ds-answer-2'),'重复');
    await page.click('#ds-quiz-submit');
    await page.waitForSelector('.ds-score');
    assert.match(await page.locator('.ds-score').innerText(),/24/);
    assert.equal(await page.locator('.ds-feedback').count(),3);
    fs.mkdirSync('screenshots/practice',{recursive:true});
    await page.screenshot({path:'screenshots/practice/graded-desktop.png'});
    const download=page.waitForEvent('download');await page.click('#ds-export-answers');const file=await download;
    assert.match(file.suggestedFilename(),/-答案.html$/);
    const stream=await file.createReadStream();let output='';for await(const chunk of stream)output+=chunk;
    assert.ok(output.includes('参考答案'));assert.ok(output.includes('02:18'));
    await page.click('#ds-quiz-retry');
    await page.evaluate(()=>window.testDisconnect=true);
    await page.click('#ds-quiz-submit');
    await page.getByRole('alert').filter({hasText:'连接中断'}).waitFor();
    assert.equal(await page.inputValue('#ds-answer-2'),'重复');
    await action(page,'出题自测');
    await page.click('#ds-quiz-reset');
    await page.screenshot({path:'screenshots/practice/setup-desktop.png'});
    await page.locator('.ds-panel').screenshot({path:'screenshots/practice/preview.png'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'screenshots/practice/setup-mobile.png'});
    assert.equal(await page.locator('.ds-panel').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.equal(await page.locator('#ds-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
    await page.screenshot({path:'screenshots/practice/setup-dark.png'});
    assert.deepEqual(errors,[]);
    console.log('Practice UI passed: generation, subtitle error, draft retention, grading retry, disconnect, exports, narrow layout, dark and reduced-motion rendering.');
    // Popup can render its settings with only the extension API mocked.
    const popup=await browser.newPage({viewport:{width:420,height:950}});
    await popup.route('**/*', route=>{
      const filename=new URL(route.request().url()).pathname.slice(1)||'popup.html';
      if(!['popup.html','popup.css','popup.js','tools.js','providers.js','custom-tools.js','custom-tools-editor.js','icons/icon128.png'].includes(filename))return route.abort();
      return route.fulfill({path:path.resolve(filename),contentType:filename.endsWith('.png')?'image/png':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html'});
    });
    await popup.addInitScript(()=>{window.chrome={runtime:{},storage:{local:{get:async()=>({customTools:[]}),set:async()=>{}},sync:{get:async d=>d,set:async(d)=>{window.savedSettings=d;}}},tabs:{query:async()=>[{url:'https://www.youtube.com/watch?v=test'}]}}});
    await popup.goto('https://extension-preview.local/popup.html');
    await popup.waitForSelector('.card-head');await popup.screenshot({path:'screenshots/practice/settings.png'});
    await popup.click('#save');assert.match(await popup.locator('#status').innerText(),/请填写/);
    await popup.fill('#apiKey','test-placeholder');await popup.click('#save');assert.match(await popup.locator('#status').innerText(),/已保存/);
    console.log('Popup UI passed: settings rendering, empty validation and save feedback.');
  } finally { await browser.close(); }
})().catch(err=>{console.error(err);process.exitCode=1;});
