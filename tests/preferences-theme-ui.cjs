const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000},colorScheme:'light',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://reading.example/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>偏好与主题测试</title><article style="padding:80px">阅读与学习测试页面</article>'}));
  await page.goto('https://reading.example/');
  async function inject(target,slow=false){
   await target.evaluate(slow=>{
    window.quizRequests=[];
    window.chrome={storage:{local:{get:async defaults=>{
     const stored=JSON.parse(localStorage.getItem('settings')||'{}');
     if(slow&&'quizPreferences' in defaults)await new Promise(resolve=>window.resolvePreferences=resolve);
     return {...defaults,...stored};
    },set:async data=>localStorage.setItem('settings',JSON.stringify({...JSON.parse(localStorage.getItem('settings')||'{}'),...data}))}},runtime:{connect(){return{onMessage:{addListener(){}},onDisconnect:{addListener(){}},postMessage(message){quizRequests.push(message);},disconnect(){}}}}};
   },slow);
   await target.addStyleTag({path:path.resolve('content.css')});
   for(const f of ['custom-tools.js','quiz-shared.js','quiz-content.js','content-core.js'])await target.addScriptTag({path:path.resolve(f)});
   await target.evaluate(()=>DSSummarizer.register({name:'fixture',sourceType:'video',isVideoPage:()=>true,getVideoId:()=>location.href,steps:()=>[],getTranscript:async()=>({transcript:'测试片段',meta:{title:'测试'}})}));
  }
  async function openQuiz(target){await target.getByRole('button',{name:'AI 工具箱',exact:true}).click();await target.getByRole('button',{name:'出题自测',exact:true}).click();await target.locator('#ds-quiz-count').waitFor();}
  async function configIs(target,difficulty,count,types){
   await target.waitForFunction(({difficulty,count,types})=>document.querySelector(`[data-difficulty="${difficulty}"]`)?.getAttribute('aria-pressed')==='true'&&document.querySelector('#ds-quiz-count')?.value===count&&JSON.stringify([...document.querySelectorAll('[data-type]:checked')].map(el=>el.dataset.type))===JSON.stringify(types),{difficulty,count,types});
  }
  await inject(page);await openQuiz(page);
  await page.locator('[data-difficulty=hard]').click();await page.selectOption('#ds-quiz-count','10');await page.uncheck('[data-type=short]');await page.uncheck('[data-type=blank]');
  await page.waitForFunction(()=>{const saved=JSON.parse(localStorage.getItem('settings')||'{}').quizPreferences;return saved?.difficulty==='hard'&&saved.count===10&&saved.types.join()==='choice';});
  await page.reload();await inject(page);await openQuiz(page);await configIs(page,'hard','10',['choice']);
  const other=await context.newPage();await other.goto('https://reading.example/another');await inject(other);await openQuiz(other);await configIs(other,'hard','10',['choice']);await other.close();
  // A slow storage read must not overwrite a new in-page selection.
  await page.reload();await inject(page,true);await openQuiz(page);await page.locator('[data-difficulty=easy]').click();await page.selectOption('#ds-quiz-count','4');await page.evaluate(()=>resolvePreferences());
  await configIs(page,'easy','4',['choice','short','blank']);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('settings')).quizPreferences.count===4);
  // Invalid temporary state must not replace the last valid settings.
  for(const type of ['choice','short','blank'])await page.uncheck(`[data-type=${type}]`);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('settings')).quizPreferences.types.join()==='blank');
  await page.reload();await inject(page);await openQuiz(page);await configIs(page,'easy','4',['blank']);
  // Corrupted settings fall back to usable defaults.
  await page.evaluate(()=>localStorage.setItem('settings',JSON.stringify({quizPreferences:{difficulty:'bogus',count:999,types:['bad']}})));
  await page.reload();await inject(page);await openQuiz(page);await configIs(page,'medium','6',['choice','short','blank']);
  // Late host styles must not change our text fills or menu icon colors.
  await page.addStyleTag({content:'body span{color:white;-webkit-text-fill-color:white;text-shadow:0 0 3px white}'});
  async function themeIs(theme){
   await page.waitForFunction(theme=>['ds-tool-bar','ds-function-menu','ds-result-panel'].every(id=>document.getElementById(id)?.dataset.dsTheme===theme),theme);
   const checks=await page.evaluate(()=>{
    const lum=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
    const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
    return ['#ds-result-panel .ds-panel-title','#ds-result-panel .ds-panel-kicker','#ds-result-panel .ds-difficulty button strong','#ds-result-panel .ds-difficulty button span','#ds-quiz-count','#ds-quiz-generate','#ds-function-menu .ds-menu-caption','#ds-function-menu .ds-menu-label'].map(selector=>{
     const el=document.querySelector(selector),css=getComputedStyle(el);let bg=el;
     while(bg.parentElement&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
     const a=lum(rgb(css.color)),b=lum(rgb(getComputedStyle(bg).backgroundColor));
     return {selector,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fill:css.webkitTextFillColor,color:css.color};
    });
   });
   for(const check of checks){assert.ok(check.contrast>=4.5,JSON.stringify(check));assert.equal(check.fill,check.color,check.selector);}
  }
  await page.getByRole('button',{name:'AI 工具箱',exact:true}).click();
  assert.equal(await page.locator('#ds-function-menu .ds-menu-icon').count(),5);
  for(const icon of await page.locator('.ds-menu-icon').all())assert.equal(await icon.getAttribute('aria-hidden'),'true');
  await themeIs('light');
  await page.evaluate(()=>document.documentElement.setAttribute('dark',''));await themeIs('dark');
  const screenshotDir='/tmp/ai-toolbox-preferences-theme';fs.mkdirSync(screenshotDir,{recursive:true});
  await page.screenshot({path:screenshotDir+'/dark.png',animations:'disabled'});
  await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>{document.documentElement.removeAttribute('dark');document.body.style.backgroundColor='#fff';});await themeIs('light');
  await page.screenshot({path:screenshotDir+'/light.png',animations:'disabled'});
  await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>document.body.style.backgroundColor='#141414');await themeIs('dark');
  await page.evaluate(()=>document.body.style.backgroundColor='');await themeIs('light');
  await page.emulateMedia({colorScheme:'dark'});await themeIs('dark');
  // Starting immediately must wait for preferences before choosing request options.
  await page.evaluate(()=>localStorage.setItem('settings',JSON.stringify({quizPreferences:{difficulty:'hard',count:10,types:['choice']}})));
  await page.reload();await inject(page,true);await openQuiz(page);
  await page.click('#ds-quiz-generate');assert.equal(await page.evaluate(()=>quizRequests.length),0);
  await page.evaluate(()=>resolvePreferences());
  await page.waitForFunction(()=>quizRequests.some(r=>r.type==='QUIZ_GENERATE'));
  const request=await page.evaluate(()=>quizRequests[0]);assert.equal(request.config.difficulty,'hard');assert.equal(request.config.count,10);assert.deepEqual(request.config.types,['choice']);
  assert.deepEqual(errors,[]);
  console.log('Preferences/theme UI passed: reload and new-page persistence, async read race, empty/corrupt preferences, menu icons, page/system theme switching and text contrast. Screenshots: '+screenshotDir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
