const {test}=require('node:test'),assert=require('node:assert/strict'),{countUnread,compare}=require('../src/unread-core.cjs');
const msg=id=>({id:String(id),channel_id:'10'});
test('snowflakes use exact comparison and history paginates to the read boundary',async()=>{
 assert.ok(compare('999999999999999999','1000000000000000000')<0);assert.ok(compare('1000000000000000001','1000000000000000000')>0);
 const calls=[];const ids=await countUnread({channelId:'10',ackId:'150',request:async q=>{calls.push(q);return Array.from({length:100},(_,i)=>msg((calls.length===1?300:200)-i));}});assert.equal(ids.size,150);assert.equal(calls[1].before,'201');assert.equal(ids.has('150'),false);
});
test('duplicates, deleted and ephemeral messages do not inflate the count',async()=>{const ids=await countUnread({channelId:'10',ackId:'1',request:async()=>[msg(4),msg(4),{...msg(3),deleted:true},{...msg(2),flags:64}]});assert.deepEqual([...ids],['4']);});
test('bad history, stalled pagination and incomplete counts fail without claiming accuracy',async()=>{
 await assert.rejects(countUnread({channelId:'10',ackId:'1',request:async()=>[{id:'5',channel_id:'11'}]}),/Invalid/);
 const request=async()=>Array.from({length:100},(_,i)=>msg(200-i));await assert.rejects(countUnread({channelId:'10',ackId:'1',request}),/cursor/);await assert.rejects(countUnread({channelId:'10',ackId:'1',request,maxPages:1}),/limit/);
 let cancel=false;await assert.rejects(countUnread({channelId:'10',ackId:'1',cancelled:()=>cancel,request:async()=>{cancel=true;return [msg(2)];}}),/Cancelled/);
});
