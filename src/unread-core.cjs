"use strict";
const isId=id=>typeof id==='string' && /^\d{1,20}$/.test(id);
const compare=(a,b)=>a.length-b.length || (a<b?-1:a>b?1:0);
async function countUnread({channelId,ackId,request,wait=async()=>{},cancelled=()=>false,maxPages=100}){
 if(!isId(channelId)||!isId(ackId))throw Error('Missing read boundary');
 const ids=new Set();let before=null;
 for(let page=0;page<maxPages;page++){
  if(cancelled())throw Error('Cancelled');
  const messages=await request({channelId,before});
  if(cancelled())throw Error('Cancelled');
  if(!Array.isArray(messages))throw Error('Invalid history response');
  if(!messages.length)return ids;
  let oldest=null,reached=false;
  for(const message of messages){
   if(!isId(message.id)||(message.channel_id && message.channel_id!==channelId))throw Error('Invalid history message');
   if(oldest===null || compare(message.id,oldest)<0)oldest=message.id;
   if(compare(message.id,ackId)<=0)reached=true;
   else if(!message.deleted && !(typeof message.flags==='number' && (message.flags&64)))ids.add(message.id);
  }
  if(before && compare(oldest,before)>=0)throw Error('History cursor did not advance');
  if(reached || messages.length<100)return ids;
  before=oldest;if(page+1<maxPages)await wait(250);
 }
 throw Error('History limit reached; keeping Discord’s estimate');
}
module.exports={isId,compare,countUnread};
