const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');
test('single right-click action captures text, source and truncation and targets the top-frame panel',async()=>{
 let install,click;const menus=[],sent=[],badges=[];
 const chrome={runtime:{onInstalled:{addListener:f=>install=f},onConnect:{addListener(){}},onMessage:{addListener(){}}},
  contextMenus:{removeAll:cb=>cb(),create:m=>menus.push(m),onClicked:{addListener:f=>click=f}},
  tabs:{sendMessage:async(...args)=>sent.push(args)},action:{setBadgeText:async x=>badges.push(x),setTitle:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),{chrome,importScripts(){},console});
 install();assert.equal(menus.length,1);assert.equal(menus[0].title,'AI 总结');assert.equal(menus[0].contexts.join(), 'selection');
 await click({menuItemId:'other',selectionText:'ignored'},{id:9});assert.equal(sent.length,0);
 await click({menuItemId:'ai-selection-summary',selectionText:'  '},{id:9});assert.equal(sent.length,0);
 await click({menuItemId:'ai-selection-summary',selectionText:'x'.repeat(48001),pageUrl:'https://a.test',frameUrl:'https://frame.test'},{id:9,title:'page title'});
 assert.equal(sent.length,1);const [tabId,message,options]=sent[0];assert.equal(tabId,9);assert.equal(options.frameId,0);
 assert.equal(message.snapshot.text.length,48000);assert.equal(message.snapshot.meta.truncated,true);assert.equal(message.snapshot.meta.url,'https://frame.test');assert.equal(message.snapshot.meta.title,'https://frame.test');assert.equal(badges.at(-1).text,'');
});
