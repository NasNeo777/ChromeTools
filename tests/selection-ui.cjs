const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const inline of [false,true]){
   const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://reading.example/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>阅读测试</title><div id="anchor" style="margin:80px">标题入口</div><article><p id="excerpt">To be, or not to be.</p><p>UNSELECTED_PRIVATE_TEXT</p></article>'}));
   await page.goto('https://reading.example/');
   const inject=async()=>{
    await page.evaluate(()=>{
     window.requests=[];
     window.chrome={storage:{local:{get:async defaults=>({...defaults,...JSON.parse(localStorage.getItem('settings')||'{}')}),set:async value=>localStorage.setItem('settings',JSON.stringify({...JSON.parse(localStorage.getItem('settings')||'{}'),...value}))}},runtime:{id:'test-id',onMessage:{addListener:fn=>window.receiveSelection=fn},connect(){const handlers=[];return{onMessage:{addListener:fn=>handlers.push(fn)},onDisconnect:{addListener(){}},disconnect(){},postMessage(msg){requests.push(msg);setTimeout(()=>handlers.forEach(fn=>{fn({type:'chunk',delta:msg.type==='CHAT'?'<p>继续解释。</p>':'<p>关于生存与抉择的思考。</p>'});fn({type:'done',meta:msg.meta});}),20);}}}}};
    });
    await page.addStyleTag({path:path.resolve('content.css')});
    for(const f of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js'])await page.addScriptTag({path:path.resolve(f)});
    if(inline)await page.evaluate(()=>DSSummarizer.register({name:'inline-test',sourceType:'video',isVideoPage:()=>true,getVideoId:()=>location.href,steps:()=>[],getTranscript:()=>{throw Error('must not fetch full transcript');},placeBar:bar=>{document.querySelector('#anchor').append(bar);return true;}}));
    else await page.addScriptTag({path:path.resolve('content-page.js')});
    await page.locator('.ds-launcher').waitFor();
   };
   await inject();
   await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#excerpt'));getSelection().removeAllRanges();getSelection().addRange(r);receiveSelection({type:'SELECTION_SUMMARY',snapshot:{text:getSelection().toString(),meta:{url:location.href,title:document.title}}},{id:'test-id'});});
   await page.locator('.ds-doc').waitFor();
   let req=await page.evaluate(()=>requests[0]);assert.equal(req.mode,'selection');assert.equal(req.transcript,'To be, or not to be.');
   await page.locator('#ds-chat-input').fill('解释一下');await page.locator('#ds-chat-send').click();
   await page.waitForFunction(()=>document.querySelector('.ds-chat-assistant')?.textContent.includes('继续解释'));
   req=await page.evaluate(()=>requests.at(-1));assert.equal(req.type,'CHAT');assert.equal(req.mode,'selection');assert.equal(req.transcript,'To be, or not to be.');
   await page.locator('#ds-close').click();
   const launcher=page.locator('.ds-launcher');const rect=await launcher.boundingBox();
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(400,350,{steps:12});await page.mouse.up();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('settings')||'{}').launcherPosition);
   assert.equal(await launcher.getAttribute('aria-expanded'),'false');
   const moved=await launcher.boundingBox();assert.ok(Math.abs(moved.x-rect.x)>20);
   await launcher.click();assert.equal(await launcher.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');
   await page.reload();await inject();
   await page.waitForFunction(()=>parseFloat(document.querySelector('#ds-tool-bar').style.left)>0);
   const restored=await launcher.boundingBox();assert.ok(Math.abs(restored.x-moved.x)<2);assert.ok(Math.abs(restored.y-moved.y)<2);
   await page.setViewportSize({width:320,height:400});
   await page.waitForFunction(()=>{const r=document.querySelector('.ds-launcher').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Selection UI passed: excerpt-only summary, follow-up, floating and inline drag, no accidental menu, position persistence and viewport bounds.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
