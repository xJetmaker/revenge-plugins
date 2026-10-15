"use strict";
function createDepthController(port){
 const now=port.now || Date.now,setTimer=port.setTimer || setTimeout,clearTimer=port.clearTimer || clearTimeout;
 const validId=id=>typeof id==='string' && /^\d{1,20}$/.test(id),compare=(a,b)=>a.length-b.length || (a<b?-1:a>b?1:0);
 const entries=new Map(),listeners=new Set(),pauses=new Map();let active=true,disposed=false,user=null,wanted=[],queue=[],job=null,timer=null,generation=0;
 function emit(){for(const fn of listeners)fn();}
 function usable(){return !disposed && active && validId(user) && user===port.getUserId();}
 function schedule(fn,delay){if(timer!=null)clearTimer(timer);timer=setTimer(()=>{timer=null;fn();},delay);}
 function cancel(){generation++;if(timer!=null)clearTimer(timer);timer=null;const old=job;job=null;if(old){old.done=true;old.cancel?.();}queue=[];}
 function view(channelId){
  const entry=entries.get(channelId);if(!usable() || !entry)return {kind:'unknown',label:'Messages since yours: Unknown'};
  if(entry.kind==='checking')return {kind:'checking',label:'Messages since yours: Checking…'};
  if(entry.kind==='ready')return {kind:'ready',count:entry.count,ownId:entry.ownId,checkedAt:entry.checkedAt,label:entry.count+' message'+(entry.count===1?'':'s')+' since yours'};
  if(entry.kind==='none')return {kind:'none',checkedAt:entry.checkedAt,label:'No message from you found in this channel'};
  return {kind:'unknown',label:'Messages since yours: Unknown',note:entry.note};
 }
 function decode(message,channelId){
  if(!validId(message?.id) || message.channel_id && message.channel_id!==channelId)throw Error('Invalid channel history');
  if(message.deleted || (Number(message.flags) & 64) || ['SENDING','SEND_FAILED','sending','send_failed'].includes(message.state))return null;
  const regular=message.type==null || [0,19].includes(message.type);
  if(regular && !validId(message.author?.id))throw Error('Message authors unavailable');
  return {id:message.id,own:regular && message.author?.id===user};
 }
 function calculate(entry){
  let ownId=null;for(const record of entry.records.values())if(record.own && (!ownId || compare(record.id,ownId)>0))ownId=record.id;
  if(!ownId){if(entry.endReached){entry.kind='none';entry.ownId=null;entry.count=null;entry.checkedAt=now();return true;}return false;}
  if(!entry.endReached && (!entry.floor || compare(ownId,entry.floor)<0))return false;
  let count=0;for(const id of entry.records.keys())if(compare(id,ownId)>0)count++;
  entry.kind='ready';entry.ownId=ownId;entry.count=count;entry.checkedAt=now();return true;
 }
 function unknown(entry,note){entry.kind='unknown';entry.note=note;entry.ownId=null;entry.count=null;}
 function readable(id){try{return !!port.canRead(id);}catch(_){return false;}}
 function pump(){
  if(!usable() || job || !queue.length)return;
  const channelId=queue.shift(),entry=entries.get(channelId),token=generation;if(!entry){pump();return;}
  if((pauses.get(user) || 0)>now()){unknown(entry,'Discord rate limited the history check; refresh later.');for(const id of queue){const waiting=entries.get(id);if(waiting)unknown(waiting,'Discord rate limited the history check; refresh later.');}queue=[];emit();return;}
  if(!readable(channelId)){unknown(entry,'History is unavailable for this channel.');emit();schedule(pump,300);return;}
  const current=job={channelId,entry,token,done:false,cancel:null,events:[],before:null,pages:0};entry.kind='checking';emit();
  function currentJob(){return !current.done && job===current && token===generation && usable();}
  function finish(error){
   if(!currentJob())return;current.done=true;job=null;if(error)current.cancel?.();
   if(error){unknown(entry,String(error.message || error));if(Number(error.status)===429){const delay=Number(error.body?.retry_after);pauses.set(user,now()+((Number.isFinite(delay)&&delay>0)?delay:60)*1000);for(const id of queue){const waiting=entries.get(id);if(waiting)unknown(waiting,'Discord rate limited the history check; refresh later.');}queue=[];}}
   emit();if(queue.length)schedule(pump,300);
  }
  function page(){
   if(!currentJob())return;if(!readable(channelId)){finish(Error('History access changed; refresh later.'));return;}
   try{current.cancel=port.requestHistory(channelId,current.before,(error,response)=>{
    if(!currentJob())return;if(error){finish(error);return;}if(!readable(channelId)){finish(Error('History access changed; refresh later.'));return;}
    try{
     const messages=response?.messages;if(!Array.isArray(messages))throw Error('History response unavailable');
     let oldest=null;
     for(const message of messages){
      if(!validId(message?.id) || current.before && compare(message.id,current.before)>=0)throw Error('History cursor did not advance');
      if(oldest===null || compare(message.id,oldest)<0)oldest=message.id;
      if(!entry.maxSeen || compare(message.id,entry.maxSeen)>0)entry.maxSeen=message.id;
      const record=decode(message,channelId);if(record && !entry.deleted.has(record.id))entry.records.set(record.id,record);
     }
     current.pages++;if(oldest && (!entry.floor || compare(oldest,entry.floor)<0))entry.floor=oldest;entry.endReached=messages.length<100;
     for(const event of current.events){if(event.record){if(!entry.deleted.has(event.record.id))entry.records.set(event.record.id,event.record);}else for(const id of event.ids)entry.records.delete(id);}
     if(entry.records.size>2000)throw Error('Too many live messages to verify; refresh later.');
     if(calculate(entry)){finish();return;}
     if(current.pages>=10)throw Error('Your latest message was not found within 1,000 recent messages.');
     current.before=oldest;schedule(page,300);
    }catch(error){finish(error || Error('History could not be verified'));}
   });}catch(error){finish(error || Error('History request failed'));}
  }
  current.fail=finish;page();
 }
 function watch(ids){
  cancel();user=port.getUserId();wanted=[...new Set(ids.filter(validId))].slice(0,6);entries.clear();
  if(usable())for(const id of wanted)entries.set(id,{kind:'checking',records:new Map(),deleted:new Set(),endReached:false});
  queue=[...entries.keys()];emit();if(queue.length)schedule(pump,250);
 }
 function invalidate(){watch(wanted);}
 function onCreate(message,optimistic=false){
  if(!usable() || optimistic)return;const channelId=message?.channel_id,entry=entries.get(channelId);if(!entry)return;
  let record;try{record=decode(message,channelId);}catch(_){if(job?.channelId===channelId)job.fail(Error('A message event could not be verified; refresh status.'));else{unknown(entry,'A message event could not be verified; refresh status.');emit();}return;}if(!record || entry.deleted.has(record.id))return;
  const newest=!entry.maxSeen || compare(record.id,entry.maxSeen)>=0;if(newest)entry.maxSeen=record.id;
  if(job?.channelId===channelId){if(job.events.length<2000)job.events.push({record});else job.fail(Error('Too many live events; refresh status.'));return;}
  if(entry.kind==='unknown' && record.own && newest){entry.records=new Map([[record.id,record]]);entry.deleted=new Set([...entry.deleted].filter(id=>compare(id,record.id)>0));entry.floor=record.id;entry.endReached=false;calculate(entry);emit();return;}
  if(!['ready','none'].includes(entry.kind))return;
  entry.records.set(record.id,record);if(entry.records.size>2000){unknown(entry,'Too many live messages; refresh status.');emit();return;}
  calculate(entry);emit();
 }
 function onDelete(event){
  if(!usable() || event?.local || event?.optimistic)return;
  const channelId=event?.channelId || event?.channel_id,entry=entries.get(channelId),raw=event?.ids || event?.messageIds || [event?.id || event?.messageId];
  if(!entry || !Array.isArray(raw))return;const ids=raw.filter(validId);if(!ids.length)return;for(const id of ids){if(entry.deleted.size>=2000 && !entry.deleted.has(id)){if(job?.channelId===channelId)job.fail(Error('Too many delete events; refresh status.'));else{unknown(entry,'Too many delete events; refresh status.');emit();}return;}entry.deleted.add(id);}
  if(job?.channelId===channelId){if(job.events.length<2000)job.events.push({ids});else job.fail(Error('Too many live events; refresh status.'));return;}
  if(!['ready','none'].includes(entry.kind))return;
  for(const id of ids)entry.records.delete(id);
  if(!calculate(entry)){entry.kind='checking';entry.records.clear();entry.floor=null;entry.endReached=false;if(!queue.includes(channelId))queue.unshift(channelId);if(!job)schedule(pump,250);}emit();
 }
 function setActive(value){active=!!value;watch(wanted);}
 function dispose(){disposed=true;cancel();entries.clear();listeners.clear();}
 return {watch,invalidate,onCreate,onDelete,setActive,dispose,view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
module.exports={createDepthController};
