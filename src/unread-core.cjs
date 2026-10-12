"use strict";
const isId=id=>typeof id==='string' && /^\d{1,20}$/.test(id);
const compare=(a,b)=>a.length-b.length || (a<b?-1:a>b?1:0);
function createCounter({channelId,ackId,maxPages=100}){
 if(!isId(channelId)||!isId(ackId))throw Error('Missing read boundary');
 const state={ids:new Set(),before:null,pages:0,done:false};
 state.consume=function(messages){
  if(state.done)throw Error('History already completed');
  if(!Array.isArray(messages))throw Error('Invalid history response');
  state.pages++;
  if(!messages.length){state.done=true;return true;}
  let oldest=null,reached=false;
  for(const message of messages){
   if(!isId(message.id)||(message.channel_id && message.channel_id!==channelId))throw Error('Invalid history message');
   if(oldest===null || compare(message.id,oldest)<0)oldest=message.id;
   if(compare(message.id,ackId)<=0)reached=true;
   else if(!message.deleted && !(typeof message.flags==='number' && (message.flags&64)))state.ids.add(message.id);
  }
  if(state.before && compare(oldest,state.before)>=0)throw Error('History cursor did not advance');
  if(reached || messages.length<100){state.done=true;return true;}
  if(state.pages>=maxPages)throw Error('History limit reached; keeping Discord’s estimate');
  state.before=oldest;return false;
 };
 return state;
}
// Test/CLI convenience adapter. The mobile runtime uses the pure counter and
// direct native callbacks, with no userland Promise or async/await boundary.
function countUnread(options){
 const {request,wait=()=>{},cancelled=()=>false}=options;let counter;
 function page(){
  if(cancelled())throw Error('Cancelled');
  return Promise.resolve(request({channelId:options.channelId,before:counter.before})).then(messages=>{
   if(cancelled())throw Error('Cancelled');
   if(counter.consume(messages))return counter.ids;
   return Promise.resolve(wait(250)).then(page);
  });
 }
 return Promise.resolve().then(()=>{counter=createCounter(options);return page();});
}
module.exports={isId,compare,countUnread,createCounter};
