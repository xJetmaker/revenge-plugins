"use strict";
const isId=value=>typeof value==='string' && /^\d{1,20}$/.test(value);
const compareId=(a,b)=>a.length-b.length || (a<b?-1:a>b?1:0);
const copy=value=>JSON.parse(JSON.stringify(value));
function messageTime(value){const time=typeof value==='number'?value:typeof value==='string'?Date.parse(value):value?.valueOf?.();return Number.isFinite(time) && time>0?time:0;}
function parseChannel(value){const text=String(value || '').trim(),match=/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d+\/(\d+)(?:\/\d+)?\/?$/.exec(text);return isId(text)?text:match?.[1] || null;}
function createPostingController(port){
 const now=port.now || Date.now,setTimer=port.setTimer || setTimeout,clearTimer=port.clearTimer || clearTimeout;
 let state=port.storage.data?copy(port.storage.data):{version:1,accounts:{}};
 if(state.version!==1 || !state.accounts || typeof state.accounts!=='object')throw Error('Posting Shortcuts storage needs review; existing data was preserved');
 let active=true,disposed=false,serial=0;const listeners=new Set(),proofs=new Map(),jobs=new Map(),timers=new Set(),pendingTimers=new Map();
 const emit=()=>{for(const fn of listeners)fn();};
 const uid=()=>{const id=port.getUserId();return isId(id)?id:null;};
 function account(id=uid()){return state.accounts[id] || {shortcuts:[],history:{},pending:null,blockedUntil:0};}
 function commit(id,change){const next=copy(state);next.accounts[id] ||= {shortcuts:[],history:{},pending:null,blockedUntil:0};change(next.accounts[id]);port.storage.data=copy(next);state=next;emit();}
 function validUser(id){return !disposed && active && uid()===id;}
 function gate(channelId){if(disposed || !active)return {ok:false,reason:'App is not active'};if(!uid())return {ok:false,reason:'Sign in to Discord'};return port.gate(channelId);}
 function getShortcut(id){return account().shortcuts.find(item=>item.id===id);}
 function key(user,channel){return user+':'+channel;}
 function info(channelId){
  const user=uid(),a=account(user),g=gate(channelId),p=proofs.get(key(user,channelId)),history=a.history[channelId] || {};
  if(!g.ok)return {kind:'blocked',label:g.reason,history};
  if(a.pending){const kind=a.pending.status==='checking'?'checking':a.pending.status==='sending'?'sending':'review';return {kind,label:kind==='checking'?'Checking…':kind==='sending'?'Sending…':'Review previous attempt',history,pending:a.pending};}
  const cooldown=Math.max(a.blockedUntil || 0,p?.end || 0,history.serverBlockedUntil || 0,now()+Math.max(0,g.nativeMs || 0));
  if(cooldown>now())return {kind:'cooldown',reason:a.blockedUntil>now()?'Discord rate limit':'Slowmode',label:'Wait '+Math.ceil((cooldown-now())/1000)+'s',until:cooldown,history};
  if(g.bypass || g.slowSeconds===0 || (p?.verified && p.slowSeconds===g.slowSeconds))return {kind:'ready',label:'Can send',history};
  return {kind:jobs.has(key(user,channelId))?'checking':'unknown',label:jobs.has(key(user,channelId))?'Checking…':p?.error || 'Check availability',history};
 }
 function save(input){
  const user=uid();if(!user)throw Error('Sign in first');
  const channelId=parseChannel(input.channelId),template=String(input.template || '').trim(),label=String(input.label || '').trim();
  if(!channelId)throw Error('Enter a channel ID or a Discord server-channel link');
  const g=(port.validateChannel || port.gate)(channelId);if(!g.ok)throw Error(g.reason);
  if(!template || template.length>2000)throw Error('Template must contain 1–2,000 characters');
  if(!label || label.length>60)throw Error('Choose a name up to 60 characters');
  const a=account(user);if(input.id && a.pending?.shortcutId===input.id)throw Error('Review the pending attempt before editing');
  if(!input.id && a.shortcuts.length>=50)throw Error('This version supports 50 shortcuts per account');
  if(a.shortcuts.some(s=>s.channelId===channelId && s.id!==input.id))throw Error('A shortcut for this channel already exists; edit that shortcut');
  if(input.id && !a.shortcuts.some(s=>s.id===input.id))throw Error('Shortcut no longer exists');
  const item={id:input.id || 'shortcut-'+now()+'-'+(++serial),channelId,label,template};
  commit(user,next=>{const index=next.shortcuts.findIndex(s=>s.id===item.id);index<0?next.shortcuts.push(item):next.shortcuts.splice(index,1,item);});return item;
 }
 function remove(id){const user=uid();if(account(user).pending?.shortcutId===id)throw Error('Review the pending attempt first');commit(user,a=>{a.shortcuts=a.shortcuts.filter(s=>s.id!==id);});}
 function verify(channelId,callback=()=>{}){
  const user=uid(),g=gate(channelId),k=key(user,channelId);
  if(!g.ok){callback(Error(g.reason));return;}
  const existing=jobs.get(k);if(existing){existing.callbacks.push(callback);return;}
  if(g.slowSeconds===0 || g.bypass || g.nativeMs>0){const p={verified:true,slowSeconds:g.slowSeconds,end:g.bypass?0:now()+Math.max(0,g.nativeMs || 0)};proofs.set(k,p);emit();callback(null,p);return;}
  const job={callbacks:[callback],cancel:null,done:false};jobs.set(k,job);emit();let pages=0,before=null;
  function finish(error,p){if(job.done)return;job.done=true;jobs.delete(k);if(validUser(user)){proofs.set(k,error?{error:String(error.message || error)}:p);emit();}for(const fn of job.callbacks)fn(error,p);}
  job.stop=()=>{job.cancel?.();finish(Error('Availability check cancelled'));};
  function page(){
   if(!validUser(user)){finish(Error('Account or app changed'));return;}
   job.cancel=port.requestHistory(channelId,before,(error,response)=>{
    if(job.done)return;if(!validUser(user)){finish(Error('Account or app changed'));return;}
    if(error){if(Number(error.status)===429){const delay=Number(error.body?.retry_after);if(Number.isFinite(delay)&&delay>0)commit(user,a=>{a.blockedUntil=now()+delay*1000;});}finish(error);return;}
    try{
     const messages=response.messages;if(!Array.isArray(messages))throw Error('Invalid history response');
     pages++;const serverNow=Number.isFinite(response.serverNow)?response.serverNow:now();let oldest=null,oldestAt=Infinity,lastOwnAt=0;
     for(const message of messages){
      if(!isId(message.id) || message.channel_id && message.channel_id!==channelId)throw Error('Invalid channel history');
      const at=messageTime(message.timestamp);if(!at)throw Error('Message timestamps unavailable');
      if(oldest===null || compareId(message.id,oldest)<0)oldest=message.id;oldestAt=Math.min(oldestAt,at);
      if(message.author?.id===user && !message.deleted && (message.type==null || [0,19].includes(message.type)))lastOwnAt=Math.max(lastOwnAt,at);
     }
     if(before && oldest && compareId(oldest,before)>=0)throw Error('History cursor did not advance');
     const slowMs=g.slowSeconds*1000;
     if(lastOwnAt || messages.length<100 || oldestAt<=serverNow-slowMs){
      const end=lastOwnAt?now()+Math.max(0,lastOwnAt+slowMs-serverNow+1000):0;
      finish(null,{verified:true,slowSeconds:g.slowSeconds,end});return;
     }
     if(pages>=3)throw Error('Cannot verify cooldown from recent history; open the channel to review');
     before=oldest;const timer=setTimer(()=>{timers.delete(timer);page();},300);timers.add(timer);
    }catch(error){finish(error || Error('Availability check failed'));}
   });
  }
  page();
 }
 function pending(){return account().pending;}
 function press(id,options={},callback=()=>{}){
  const user=uid(),shortcut=getShortcut(id);if(!shortcut){callback(Error('Shortcut no longer exists'));return;}
  const a=account(user),g=gate(shortcut.channelId);if(!g.ok){callback(Error(g.reason));return;}
  if(a.pending){callback(Error('Review or wait for the previous send first'));return;}
  if(a.blockedUntil>now()){callback(Error('Discord rate limit: wait before sending'));return;}
  const old=a.history[shortcut.channelId];
  if(!options.repeatApproved && old?.lastTemplate===shortcut.template && now()-old.lastTemplateAt<600000){callback(null,{needsRepeatConfirmation:true});return;}
  // A checking intent is persisted too, so rapid taps cannot queue another send.
  commit(user,next=>{next.pending={status:'checking',shortcutId:id,channelId:shortcut.channelId,content:shortcut.template,startedAt:now(),nonce:null};});
  verify(shortcut.channelId,(error,p)=>{
   if(!validUser(user)){if(account(user).pending?.status==='checking')commit(user,next=>{next.pending=null;});callback(Error('Account or app changed'));return;}
   if(error || !p || p.end>now()){
    commit(user,next=>{next.pending=null;});callback(error || Error('Slowmode is still active'));return;
   }
   const current=getShortcut(id),currentGate=gate(shortcut.channelId);
   if(!current || current.template!==shortcut.template || current.channelId!==shortcut.channelId || !currentGate.ok || (!currentGate.bypass && p.slowSeconds!==currentGate.slowSeconds) || currentGate.nativeMs>0 || account(user).blockedUntil>now()){
    commit(user,next=>{next.pending=null;});callback(Error('Availability changed; nothing was sent'));return;
   }
   let nonce;
   try{nonce=String(port.createNonce());if(!isId(nonce))throw Error('Native message nonce unavailable');
    commit(user,next=>{next.pending={status:'sending',shortcutId:id,channelId:shortcut.channelId,content:shortcut.template,startedAt:now(),nonce};});
   }catch(error){if(account(user).pending?.status==='checking')try{commit(user,next=>{next.pending=null;});}catch(_){}callback(error || Error('Could not save send intent'));return;}
   const timer=setTimer(()=>{timers.delete(timer);pendingTimers.delete(key(user,nonce));const p=account(user).pending;if(p?.nonce===nonce && p.status==='sending'){try{commit(user,next=>{next.pending.status='uncertain';next.pending.note='No server confirmation. Open the channel before clearing this attempt.';});}catch(_){port.notify?.('Could not save send status; the previous attempt remains locked until restart and review.');}}},30000);timers.add(timer);pendingTimers.set(key(user,nonce),timer);
   try{
    const result=port.sendNative(shortcut.channelId,shortcut.template,nonce);
    if(result && typeof result.then==='function')result.then(()=>{},error=>onFailure({channelId:shortcut.channelId,messageId:nonce,error}));
    callback(null,{started:true});
   }catch(error){onFailure({channelId:shortcut.channelId,messageId:nonce,error});callback(error || Error('Native send failed'));}
  });
 }
 function onMessage(message,optimistic=false){
  const user=uid();if(optimistic || !user || disposed || message?.author?.id!==user || !isId(message.id) || message.deleted || (message.type!=null && ![0,19].includes(message.type)) || ['SENDING','SEND_FAILED','sending','send_failed'].includes(message.state))return;
  const a=account(user),channelId=message.channel_id;
  if(!a.shortcuts.some(s=>s.channelId===channelId))return;
  const at=messageTime(message.timestamp) || now(),p=a.pending,confirmed=p?.nonce && String(message.nonce)===p.nonce && p.channelId===channelId && message.content===p.content;
  if(confirmed){const timer=pendingTimers.get(key(user,p.nonce));if(timer!=null){clearTimer(timer);timers.delete(timer);pendingTimers.delete(key(user,p.nonce));}}
  commit(user,next=>{const h=next.history[channelId] ||= {};h.lastOwnAt=Math.max(h.lastOwnAt || 0,at);if(confirmed){h.lastTemplateAt=at;h.lastTemplate=p.content;h.lastMessageId=message.id;next.pending=null;}});
  const g=port.gate(channelId);proofs.set(key(user,channelId),{verified:true,slowSeconds:g.slowSeconds,end:g.bypass || !g.slowSeconds?0:now()+g.slowSeconds*1000+1000});
  if(confirmed)port.notify?.('Message sent');emit();
 }
 function onFailure(event){
  const user=uid(),p=account(user).pending;if(!p?.nonce || p.channelId!==event.channelId || String(event.messageId)!==p.nonce)return;
  const timer=pendingTimers.get(key(user,p.nonce));if(timer!=null){clearTimer(timer);timers.delete(timer);pendingTimers.delete(key(user,p.nonce));}
  const error=event.error,delay=Number(error?.body?.retry_after || event.retry_after);
  commit(user,a=>{a.pending.status='uncertain';a.pending.note=String(error?.message || event.reason || 'Native send failed; review the channel before retrying');if(Number.isFinite(delay)&&delay>0)a.blockedUntil=now()+delay*1000;});
 }
 function clearPending(){const user=uid();if(account(user).pending && account(user).pending.status!=='uncertain')throw Error('Wait for confirmation before clearing');commit(user,a=>{a.pending=null;});}
 function invalidate(){for(const job of [...jobs.values()])job.stop();proofs.clear();emit();}
 function setActive(value){active=value;invalidate();}
 function dispose(){disposed=true;active=false;try{invalidate();}finally{for(const timer of timers)clearTimer(timer);timers.clear();pendingTimers.clear();listeners.clear();}}
 // Surviving attempts cannot be silently resent after a restart.
 for(const user of Object.keys(state.accounts))if(state.accounts[user].pending){commit(user,a=>{if(a.pending.status==='checking')a.pending=null;else{a.pending.status='uncertain';a.pending.note='Previous send needs review after restart.';}});}
 return {save,remove,verify,press,onMessage,onFailure,clearPending,info,pending,invalidate,setActive,dispose,refresh:emit,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},list:()=>copy(account().shortcuts),history:channelId=>copy(account().history[channelId] || {})};
}
module.exports={isId,messageTime,parseChannel,createPostingController};
