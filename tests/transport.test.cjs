const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');
const AICustomTools=require('../custom-tools.js');
const AIProviders=require('../providers.js');const DSQuiz=require('../quiz-shared.js');
function run(provider,events,message={type:'START',transcript:'正文说明缓存可以减少重复读取。',meta:{title:'缓存',sourceType:'page'}},customTools=[]){
 let listener,request;const output=[];
 const profile={apiKey:`fake-${provider}`,model:AIProviders.providers[provider].model,baseUrl:AIProviders.providers[provider].baseUrl};
 const context=vm.createContext({AIProviders,DSQuiz,AICustomTools,URL,AbortController,TextDecoder,setTimeout,clearTimeout,importScripts(){},
  chrome:{storage:{local:{get:async()=>({customTools})},sync:{get:async()=>({provider,providers:{[provider]:profile}})}},runtime:{onConnect:{addListener:fn=>listener=fn},onMessage:{addListener(){}}}},
  fetch:async(url,init)=>{request={url,headers:init.headers,body:JSON.parse(init.body)};const bytes=new TextEncoder().encode(events);let offset=0;return{ok:true,body:{getReader:()=>({read:async()=>{if(offset>=bytes.length)return{done:true};const value=bytes.slice(offset,offset+7);offset+=7;return{done:false,value}},cancel:async()=>{},releaseLock(){}})}}}
 });
 vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),context);
 return new Promise(resolve=>{
  let receive;listener({name:'summarize',onMessage:{addListener:fn=>receive=fn},postMessage:event=>{output.push(event);if(event.type==='done'||event.type==='error')resolve({output,request})}});receive(message);
 });
}
const openai='data: '+JSON.stringify({choices:[{delta:{content:'<p>缓存复用已有结果。</p>'}}]})+'\r\n\r\ndata: [DONE]';
const native='event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'thinking_delta',thinking:'不应该显示'}})+'\n\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'<p>缓存复用已有结果。</p>'}})+'\n\ndata: {"type":"message_stop"}\n';
test('each provider streams Chinese through split UTF-8 chunks',async()=>{
 for(const provider of ['deepseek','kimi','mimo','openai','claude']){
  const {request,output}=await run(provider,provider==='claude'?native:openai);
  assert.equal(output.at(-1).type,'done',JSON.stringify(output));assert.equal(output.filter(m=>m.type==='chunk').map(m=>m.delta).join(''),'<p>缓存复用已有结果。</p>');
  assert.ok((request.body.system||request.body.messages[0].content).includes('网页阅读'));
  if(provider==='claude'){assert.equal(request.headers['x-api-key'],'fake-claude');assert.equal(request.body.messages[0].role,'user');}
  else assert.equal(request.headers.Authorization,`Bearer fake-${provider}`);
 }
});
test('provider errors, malformed streams and truncated responses never report success',async()=>{
 for(const events of ['data: {"error":{"message":"rate limit"}}\n','data: not-json\n','data: '+JSON.stringify({choices:[{delta:{content:'部分输出'},finish_reason:'length'}]})+'\n','data: '+JSON.stringify({choices:[{delta:{content:'连接中断'}}]})+'\n']){
  const {output}=await run('openai',events);assert.equal(output.at(-1).type,'error');assert.ok(!output.some(x=>x.type==='done'));
 }
});
test('video summary, translation, critique and comment prompts remain distinct',async()=>{
 for(const [mode,needle]of [['summary','笔记整理'],['translate','字幕翻译'],['critique','批判'],['comments','评论']]){
  const {request,output}=await run('deepseek',openai,{type:'START',mode,transcript:'[00:12] 缓存减少重复读取。',comments:'评论样本',meta:{title:'视频'}});
  assert.equal(output.at(-1).type,'done');assert.ok(request.body.messages[0].content.includes(needle),mode);
  if(mode==='comments')assert.ok(request.body.messages[1].content.includes('评论样本'));
 }
});

const customTool={id:'actions',name:'行动清单',prompt:'给出带前提条件的三步行动清单。',scope:'page',enabled:true};
test('custom generation resolves saved tool and sends source as separate data',async()=>{
 const message={type:'START',mode:'custom',customToolId:'actions',transcript:'当前页面正文',meta:{title:'标题',url:'https://example.test/article',sourceType:'page'}};
 const {request,output}=await run('deepseek',openai,message,[customTool]);
 assert.equal(output.at(-1).type,'done');assert.equal(output.at(-1).customTool.prompt,customTool.prompt);
 assert.ok(request.body.messages[0].content.includes(customTool.prompt));
 const data=JSON.parse(request.body.messages[1].content);assert.equal(data.content,'当前页面正文');assert.equal(data.title,'标题');
 for(const tools of [[],[{...customTool,enabled:false}],[{...customTool,scope:'video'}]]){
  const r=await run('deepseek',openai,message,tools);assert.equal(r.output.at(-1).type,'error');assert.equal(r.request,undefined);
 }
});
test('custom follow-up retains task snapshot without requiring tool to still exist',async()=>{
 const r=await run('claude',native,{type:'CHAT',mode:'custom',customTool,transcript:'原文',meta:{sourceType:'page'},history:[{role:'assistant',content:'三步清单'},{role:'user',content:'展开第一步'}]});
 assert.equal(r.output.at(-1).type,'done');assert.ok(r.request.body.system.includes(customTool.prompt));assert.equal(r.request.body.messages.at(-1).content,'展开第一步');
});
