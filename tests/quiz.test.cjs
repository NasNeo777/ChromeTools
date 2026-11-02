const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Q = require('../quiz-shared.js');
const AIProviders = require('../providers.js');
const config = { difficulty: 'medium', count: 3, types: ['choice', 'short', 'blank'] };
const fixture = { questions: [
  { type: 'choice', prompt: '缓存的主要作用是什么？', options: ['减少重复读取', '增加读取次数', '删除字幕', '改变视频'], answer: 'A', rubric: ['减少重复读取'], explanation: '缓存复用读取结果。', evidence: '[00:12] 缓存减少重复读取。' },
  { type: 'short', prompt: '对比缓存与重复请求的区别。', answer: '缓存复用已有结果，重复请求重新获取。', rubric: ['复用已有结果', '重新获取'], explanation: '减少重复开销。', evidence: '[00:12] 缓存减少重复读取。' },
  { type: 'blank', prompt: '缓存可以减少____读取。', answer: '重复', rubric: ['重复'], explanation: '复用结果。', evidence: '[00:12] 缓存减少重复读取。' }
] };
const quiz = Q.paper(fixture, config);
test('fixed difficulty and config bounds', () => {
  assert.equal(Q.difficulties.hard, '应用验算/代码判错');
  for (const c of [{...config,difficulty:'custom'}, {...config,count:2}, {...config,count:13}, {...config,types:[]}, {...config,types:['choice','choice']}]) assert.throws(() => Q.config(c));
});
test('paper contract rejects missing answer, invalid choices and omitted types', () => {
  assert.equal(quiz.questions.length, 3);
  for (const mutate of [q=>q.questions.pop(),q=>q.questions[0].answer='E',q=>q.questions[1].rubric=[],q=>q.questions[2].prompt='没有空缺',q=>q.questions[2].type='short']) {
    const bad = structuredClone(fixture); mutate(bad); assert.throws(() => Q.paper(bad,config));
  }
});
test('local scoring handles blank and choice; subjective answers need grading', () => {
  assert.equal(Q.localGrade(quiz.questions[0],'A').score,10);
  assert.equal(Q.localGrade(quiz.questions[0],'B').score,0);
  assert.equal(Q.localGrade(quiz.questions[1],'  ').score,0);
  assert.equal(Q.localGrade(quiz.questions[2],'重复'),null);
});
test('grade validation rejects missing, duplicate, nonnumeric and out-of-range scores', () => {
  const valid = quiz.questions.map(q=>({id:q.id,score:7.35,feedback:'部分正确'}));
  assert.equal(Q.grades({results:valid},quiz.questions)[0].score,7.4);
  for (const results of [valid.slice(1),[valid[0],valid[0],valid[2]],valid.map(r=>({...r,score:11})),valid.map(r=>({...r,score:'10'})),valid.map(r=>({...r,score:NaN}))]) assert.throws(()=>Q.grades({results},quiz.questions));
});
test('export escapes generated content and separates paper from answer key', () => {
  const custom = structuredClone(quiz); custom.questions[1].answer='ANSWER_SECRET'; custom.questions[0].prompt='<script>alert("x")</script>';
  const paper = Q.exportHTML(custom,{title:'<img src=x onerror=alert(1)>',url:'https://www.youtube.com/watch?v=test'});
  const key = Q.exportHTML(custom,{title:'test'},true);
  assert.ok(!paper.includes('ANSWER_SECRET')); assert.ok(!paper.includes('<script>')); assert.ok(paper.includes('&lt;script&gt;')); assert.ok(key.includes('ANSWER_SECRET')); assert.ok(paper.includes('@media print'));
});
test('JSON parsing supports fences and reports malformed output', () => {
  assert.deepEqual(Q.parse('```json\n{"questions":[]}\n```'),{questions:[]}); assert.throws(()=>Q.parse('{'));
});
function worker(response, settings={apiKey:'test'}) {
  let connect, calls=[];
  const context = vm.createContext({DSQuiz:Q, AIProviders, URL, AbortController, TextDecoder, setTimeout, clearTimeout,
    importScripts(){}, chrome:{storage:{sync:{get:async()=>settings}},runtime:{onConnect:{addListener:fn=>connect=fn},onMessage:{addListener(){}}}},
    fetch:async(url,init)=>{calls.push(JSON.parse(init.body)); let sent=false; return {ok:true,body:{getReader:()=>({cancel:async()=>{},read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(response)}}]})+'\n\ndata: [DONE]\n\n')})})}};}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),context);
  return {calls, request:msg=>new Promise(resolve=>{let handler;connect({name:'summarize',onDisconnect:{addListener(){},removeListener(){}},onMessage:{addListener:fn=>handler=fn},postMessage:m=>{if(m.type!=='quiz-progress')resolve(m)}});handler(msg);})};
}
test('worker generates validated paper with fixed difficulty instructions',async()=>{
  const w=worker(fixture); const r=await w.request({type:'QUIZ_GENERATE',config,transcript:'缓存减少重复读取。'});
  assert.equal(r.type,'quiz-result');assert.equal(r.quiz.questions.length,3);assert.ok(w.calls[0].messages[0].content.includes('中等=理解对比'));
});
test('worker merges local grades with subjective grades and rejects bad responses',async()=>{
  const w=worker({results:[{id:2,score:8,feedback:'缺少重新获取的对比'}]});
  const r=await w.request({type:'QUIZ_GRADE',quiz,answers:['A','复用已有结果',''],transcript:'缓存减少重复读取。'});
  assert.equal(r.type,'quiz-grade');assert.deepEqual(r.results.map(r=>r.score),[10,8,0]);
  assert.equal(JSON.parse(w.calls[0].messages[1].content).questions.length,1);
  const bad=worker({results:[]});assert.equal((await bad.request({type:'QUIZ_GRADE',quiz,answers:['A','答案',''],transcript:'字幕'})).type,'error');
});
test('worker fails cleanly without credentials or transcript',async()=>{
  assert.equal((await worker(fixture,{}).request({type:'QUIZ_GENERATE',config,transcript:'字幕'})).type,'error');
  assert.equal((await worker(fixture).request({type:'QUIZ_GENERATE',config,transcript:''})).type,'error');
});
test('all-local grading does not call the AI',async()=>{
  const w=worker({});const r=await w.request({type:'QUIZ_GRADE',quiz,answers:['A','',''],transcript:'字幕'});
  assert.equal(r.type,'quiz-grade');assert.deepEqual(r.results.map(r=>r.score),[10,0,0]);assert.equal(w.calls.length,0);
});

