const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../providers.js');
const messages=[{role:'system',content:'规则'},{role:'user',content:'正文'}];
function settings(id){return {provider:id,providers:{[id]:{apiKey:`key-${id}`,baseUrl:P.providers[id].baseUrl||'https://gateway.example/v1',model:P.providers[id].model||'my-model'}}};}
test('legacy DeepSeek config migrates without dropping original values',()=>{
 const old={apiKey:'old-key',model:'deepseek-reasoner',style:'brief',language:'English'};
 const profiles=P.profiles(old);assert.equal(profiles.deepseek.apiKey,'old-key');assert.equal(profiles.deepseek.model,'deepseek-v4-pro');assert.equal(profiles.deepseek.legacyModel,'deepseek-reasoner');assert.equal(old.model,'deepseek-reasoner');
 assert.equal(P.resolve(old).style,'brief');assert.equal(old.apiKey,'old-key');
 assert.equal(P.profiles({providers:{deepseek:{apiKey:'new-key',model:'new-model'}},...old}).deepseek.apiKey,'new-key');
});
test('provider selection isolates credentials and uses expected endpoints',()=>{
 for(const id of ['deepseek','kimi','mimo','openai','custom']){
  const req=P.request(messages,settings(id),.3);assert.match(req.url,/\/chat\/completions$/);assert.equal(req.headers.Authorization,`Bearer key-${id}`);assert.equal(req.body.stream,true);assert.equal(req.body.messages,messages);
 }
 const req=P.request(messages,settings('claude'),.3);assert.equal(req.url,'https://api.anthropic.com/v1/messages');assert.equal(req.headers['x-api-key'],'key-claude');assert.equal(req.headers['anthropic-version'],'2023-06-01');assert.equal(req.headers.Authorization,undefined);assert.equal(req.body.system,'规则');assert.deepEqual(req.body.messages,[messages[1]]);assert.equal(req.body.max_tokens,8192);
 const profiles=P.profiles({apiKey:'legacy'});profiles.openai.apiKey='openai-only';assert.equal(P.resolve({provider:'openai',providers:profiles}).apiKey,'openai-only');assert.equal(profiles.deepseek.apiKey,'legacy');
});
test('model sampling does not break reasoning providers',()=>{
 for(const id of ['kimi','mimo','openai','claude']) assert.equal(P.request(messages,settings(id),.2).body.temperature,undefined);
 assert.equal(P.request(messages,{apiKey:'key',model:'deepseek-reasoner'},.3).body.temperature,undefined);
});
test('API address normalization and validation',()=>{
 assert.equal(P.endpoint('https://api.openai.com/v1/chat/completions/','openai'),'https://api.openai.com/v1/chat/completions');
 assert.equal(P.endpoint('https://api.anthropic.com/v1/messages','anthropic'),'https://api.anthropic.com/v1/messages');
 for(const value of ['http://api.example.com','javascript:alert(1)','https://key@api.example.com','https://api.example.com/?key=secret','https://api.example.com/#secret','garbage'])assert.throws(()=>P.endpoint(value,'openai'));
 assert.throws(()=>P.request(messages,{},.2));
});
test('SSE text deltas, reasoning filtering, errors and truncation',()=>{
 assert.equal(P.event({choices:[{delta:{content:'结果'}}]}),'结果');
 assert.equal(P.event({type:'content_block_delta',delta:{type:'text_delta',text:'答案'}}),'答案');
 assert.equal(P.event({type:'content_block_delta',delta:{type:'thinking_delta',thinking:'隐藏推理'}}),'');
 assert.equal(P.event({choices:[{delta:{reasoning_content:'隐藏推理'}}]}),'');
 for(const data of [{type:'error',error:{message:'overloaded'}},{choices:[{finish_reason:'length'}]},{type:'message_delta',delta:{stop_reason:'max_tokens'}}])assert.throws(()=>P.event(data));
});

test('DeepSeek current models, legacy aliases and explicit thinking modes',()=>{
 assert.deepEqual(P.providers.deepseek.models,['deepseek-flash','deepseek-v4-pro']);
 assert.equal(P.resolve({apiKey:'key'}).model,'deepseek-flash');
 const flash=P.request(messages,{apiKey:'key',model:'deepseek-chat'},.3);
 assert.equal(flash.body.model,'deepseek-flash');assert.equal(flash.body.thinking.type,'disabled');assert.equal(flash.body.temperature,.3);
 const pro=P.request(messages,{apiKey:'key',model:'deepseek-reasoner'},.3);
 assert.equal(pro.body.model,'deepseek-v4-pro');assert.equal(pro.body.thinking.type,'enabled');assert.equal(pro.body.temperature,undefined);
 const custom=P.resolve({providers:{deepseek:{apiKey:'key',model:'custom-deepseek-id',baseUrl:'https://gateway.example/v1'}}});assert.equal(custom.model,'custom-deepseek-id');
});
