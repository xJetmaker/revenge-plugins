"use strict";
const {isId,compare,countUnread}=unreadCore;
const {React,ReactNative:RN}=vendetta.metro.common;
let read=null,selected=null,http=null,httpMode="native",dispatcher=null,originalCount=null,originalEstimated=null;
let enabled=false,foreground=true,session=null,revision=0,refreshTimer=null,appState=null,lastStatus='Not counted yet',transportStatus='No history request yet';
const unpatches=[],subscriptions=[],waiters=new Set();
function ack(channelId){return read.getTrackedAckMessageId?.(channelId) || read.ackMessageId?.(channelId);}
function valid(s){return enabled && s===session && s.revision===revision && selected.getChannelId()===s.channelId && ack(s.channelId)===s.ackId;}
function invalidate(){revision++;session=null;for(const item of waiters){clearTimeout(item.timer);item.resolve();}waiters.clear();}
function wait(ms){return new Promise(resolve=>{const item={resolve,timer:null};item.timer=setTimeout(()=>{waiters.delete(item);resolve();},ms);waiters.add(item);});}
function emit(){if(enabled)read.emitChange?.();}
function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshTimer=null;if(enabled){const id=selected.getChannelId();read.getUnreadCount(id);emit();}},0);}
function requestHistory(url,query,s){
 return new Promise((resolve,reject)=>{
  let settled=false,callbackSeen=false,requestForm='URL string';
  const path=url+'?limit=100'+(query.before?'&before='+query.before:'');
  const item={timer:null,resolve:()=>fail(Error('Cancelled'))};
  function close(){settled=true;clearTimeout(item.timer);waiters.delete(item);}
  function fail(reason){
   if(settled)return;close();
   // Native bridges can throw undefined/null. Never treat a falsey throw as success.
   reject(reason || Error('History hook threw '+String(reason)+' using '+requestForm));
  }
  function response(result,source){
   if(settled || result==null)return;
   if(result.hasErr){fail(result.err || Error('History request failed'));return;}
   if(typeof result!=='object')return;
   transportStatus=requestForm+'; response via '+source+'; fields: '+Object.keys(result).slice(0,8).join(', ');
   close();resolve(result);
  }
  const callback=result=>{callbackSeen=true;response(result,'callback');};
  function watch(result){
   if(!settled)transportStatus=requestForm+'; returned '+(result && typeof result.then==='function'?'promise':typeof result)+'; callback '+(callbackSeen?'received':'pending');
   if(result && typeof result.then==='function')result.then(value=>response(value,'promise'),fail);
   else response(result,'return value');
  }
  item.timer=setTimeout(()=>fail(Error('History request timed out without a response')),30000);waiters.add(item);
  try{
   // HTTPUtils.makeRequest explicitly accepts URL strings. Put pagination in
   // the URL, rather than relying on a bridge to accept an options object.
   watch(http.get(path,callback));
  }catch(error){
   if(!settled && !callbackSeen && httpMode!=='legacy' && !error?.status && (error==null || error instanceof TypeError || error?.name==='TypeError')){
    requestForm='request object fallback';
    try{watch(http.get({url,query,retries:0,timeout:25000},callback));}catch(fallbackError){fail(fallbackError);}
   }else fail(error);
  }
  if(!valid(s))item.resolve();
 });
}
function ensure(channelId,nativeCount){
 if(!enabled || !foreground || channelId!==selected.getChannelId())return null;
 const boundary=ack(channelId);
 if(!isId(channelId)||!isId(boundary)||nativeCount<=0){if(session)invalidate();return null;}
 if(session && (session.channelId!==channelId || session.ackId!==boundary))invalidate();
 if(session){if(!session.error || Date.now()<session.retryAt)return session;invalidate();}
 if(!originalEstimated(channelId))return null;
 const s=session={channelId,ackId:boundary,revision,ids:null,journal:new Map(),error:false,retryAt:0};
 lastStatus='Counting missing message history…';
 countUnread({channelId,ackId:boundary,cancelled:()=>!valid(s),wait,request:async({channelId,before})=>{
   const query={limit:100};if(before)query.before=before;
   // Discord's authenticated HTTP wrapper handles account access; no token lookup.
   const url='/channels/'+channelId+'/messages';
   const result=await requestHistory(url,query,s);
   if(result.status && (result.status<200 || result.status>=300))throw Object.assign(Error('History HTTP '+result.status),{status:result.status,body:result.body});
   return result.body;
 }}).then(ids=>{
   if(!valid(s))return;
   for(const [id,present] of s.journal)present?ids.add(id):ids.delete(id);
   s.ids=ids;s.journal.clear();lastStatus='Exact count: '+ids.size;emit();
 }).catch(error=>{
   if(!valid(s))return;
   s.error=true;const retry=Number(error?.body?.retry_after);
   s.retryAt=Date.now()+Math.max(30000,Number.isFinite(retry)?retry*1000:0);
   lastStatus=String(error?.message || error || 'History request failed')+'; Discord’s count is unchanged';
 });
 return s;
}
function onMessage(event,present){
 const s=session;if(!s || !valid(s))return;
 const message=event.message || event,channelId=event.channelId || event.channel_id || message.channel_id;
 if(channelId!==s.channelId)return;
 const ids=event.ids || [event.id || message.id];
 for(const id of ids)if(isId(id) && compare(id,s.ackId)>0){
   const include=present && !message.deleted && !(typeof message.flags==='number' && (message.flags&64));
   if(s.ids)include?s.ids.add(id):s.ids.delete(id);else s.journal.set(id,include);
 }
 if(s.ids){lastStatus='Exact count: '+s.ids.size;schedule();}
}
return {
 onLoad(){
  if(enabled)return;
  read=vendetta.metro.findByProps('getUnreadCount','isEstimated');
  selected=vendetta.metro.findByProps('getChannelId','getVoiceChannelId') || vendetta.metro.findByProps('getChannelId');
  const utils=vendetta.metro.findByProps('HTTP','getAPIBaseURL','setRequestPatch');
  http=typeof utils?.get==='function'?utils:utils?.HTTP;httpMode=typeof utils?.get==='function'?'HTTPUtils.get':'HTTPUtils.HTTP';
  if(typeof http?.get!=='function'){http=vendetta.metro.findByProps('get','post','del');httpMode='get/post/del';}
  if(typeof http?.get!=='function'){http=vendetta.metro.findByProps('get','post','put','patch','delete');httpMode='legacy';}
  dispatcher=vendetta.metro.common.FluxDispatcher;
  if(!read || typeof read.emitChange!=='function' || !(read.getTrackedAckMessageId || read.ackMessageId) || !selected || typeof http?.get!=='function' || !dispatcher?.subscribe)throw Error('Exact Unread: required read-state/history hooks are unavailable');
  originalCount=read.getUnreadCount.bind(read);originalEstimated=read.isEstimated.bind(read);foreground=!['background','inactive'].includes(RN.AppState?.currentState);enabled=true;
  unpatches.push(vendetta.patcher.instead('getUnreadCount',read,([id],original)=>{const n=original(id),s=ensure(id,n);return s?.ids && valid(s)?s.ids.size:n;}));
  unpatches.push(vendetta.patcher.instead('isEstimated',read,([id],original)=>session?.ids && session.channelId===id && valid(session)?false:original(id)));
  const handlers={MESSAGE_CREATE:e=>onMessage(e,true),MESSAGE_DELETE:e=>onMessage(e,false),MESSAGE_DELETE_BULK:e=>onMessage(e,false),CHANNEL_SELECT:()=>{invalidate();schedule();},MESSAGE_ACK:()=>schedule(),MESSAGE_ACKED:()=>schedule(),CONNECTION_OPEN:()=>{invalidate();schedule();},LOGOUT:()=>{invalidate();schedule();}};
  for(const [type,fn]of Object.entries(handlers)){dispatcher.subscribe(type,fn);subscriptions.push([type,fn]);}
  appState=RN.AppState?.addEventListener('change',state=>{foreground=state==='active';invalidate();if(foreground)schedule();});schedule();
 },
 onUnload(){enabled=false;clearTimeout(refreshTimer);refreshTimer=null;invalidate();appState?.remove();appState=null;for(const [type,fn]of subscriptions.splice(0))dispatcher.unsubscribe(type,fn);for(const undo of unpatches.splice(0))undo();},
 settings(){return React.createElement(RN.ScrollView,{contentContainerStyle:{padding:20}},React.createElement(RN.Text,{style:{color:'#fff',fontSize:22,fontWeight:'700'}},'Exact Unread'),React.createElement(RN.Text,{style:{color:'#c4c6ce',fontSize:16,lineHeight:24,marginTop:16}},'Shows the real unread message count in the current channel. Missing history is counted after Discord’s tracked read marker. New and deleted messages refresh the count.\n\nDiscord’s original indicator stays visible until counting finishes. Counts only the channel you are viewing; no background scanning.\n\n'+lastStatus+'\nHistory hook: '+httpMode+'\nTransport: '+transportStatus+'\n\nVersion 0.1.3 · Build EU-013-URL'));}
};
