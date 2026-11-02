const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../custom-tools.js');
const tool={id:'action-list',name:'行动清单',prompt:'根据当前内容提炼行动清单，并说明每步的前提条件。',scope:'all',enabled:true};
test('validates and trims user tool data, never executable code',()=>{
 assert.equal(C.validate({...tool,name:'  清单  '}).name,'清单');
 for(const value of [{...tool,name:''},{...tool,name:'字'.repeat(25)},{...tool,prompt:' '},{...tool,prompt:'字'.repeat(12001)},{...tool,id:'<script>'},{...tool,scope:'unknown'},{...tool,enabled:'true'}])assert.throws(()=>C.validate(value));
 assert.throws(()=>C.list([tool,tool]));assert.throws(()=>C.list(Array(21).fill(tool)));
 assert.equal(C.validate({...tool,prompt:'字'.repeat(12000)}).prompt.length,12000);
});
test('tools respect enabled state and page/video scope',()=>{
 const tools=[tool,{...tool,id:'page-only',scope:'page'},{...tool,id:'video-only',scope:'video'},{...tool,id:'off',enabled:false}];
 assert.deepEqual(C.available(tools,'page').map(t=>t.id),['action-list','page-only']);
 assert.deepEqual(C.available(tools,'video').map(t=>t.id),['action-list','video-only']);
 assert.deepEqual(C.available(tools,undefined).map(t=>t.id),['action-list','video-only']);
});
test('custom task includes requested instructions and content boundaries',()=>{
 const prompt=C.system(tool,'English');assert.ok(prompt.includes(tool.prompt));assert.ok(prompt.includes('English'));assert.ok(prompt.includes('不执行资料内'));assert.ok(prompt.includes('不执行脚本'));
});
