"use strict";
const {React,ReactNative:RN}=vendetta.metro.common;
let enabled=false,messages=null,users=null,selected=null,actions=null,permissions=null,channels=null,lastStatus='Not used yet';
const unpatches=[],inFlight=new Set(),cooldowns=new Map(),wrapped=new WeakMap();
function notify(message){try{vendetta.ui.toasts.showToast(message);}catch(_){}}
function data(event){
 try{
 const e=event?.nativeEvent || event;
 if((e?.location && e.location!=='message_swipe') || (e?.touches && e.touches.length!==1) || (e?.numberOfPointers && e.numberOfPointers!==1))return null;
 const channelId=e?.channelId || e?.channel_id || selected.getChannelId(),messageId=e?.messageId;
 if(typeof channelId!=='string' || typeof messageId!=='string' || !/^\d{1,20}$/.test(messageId))return null;
 const message=messages.getMessage(channelId,messageId),user=users.getCurrentUser();
 if(channelId!==selected.getChannelId() || !message || !user || message.type===21 || message.deleted || ['SENDING','SEND_FAILED','sending','send_failed'].includes(message.state))return null;
 if(message.author?.id!==user.id){
  const channel=channels?.getChannel(channelId),flag=vendetta.metro.common.constants?.Permissions?.MANAGE_MESSAGES;
  if(!channel || flag==null || !permissions?.can(flag,channel))return null;
 }
 return {channelId,messageId,key:channelId+':'+messageId};
 }catch(_){return null;}
}
function remove(target){
 if(inFlight.has(target.key) || (cooldowns.get(target.key)||0)>Date.now())return;
 inFlight.add(target.key);cooldowns.set(target.key,Date.now()+1500);
 if(cooldowns.size>100)for(const [key,time]of cooldowns)if(time<Date.now())cooldowns.delete(key);
 try{
  lastStatus='Delete sent to Discord';
  const result=actions.deleteMessage(target.channelId,target.messageId,false);
  Promise.resolve(result).catch(error=>{if(enabled){lastStatus='Delete failed: '+String(error?.message || error);notify(lastStatus);}}).finally(()=>inFlight.delete(target.key));
 }catch(error){inFlight.delete(target.key);lastStatus='Delete failed: '+String(error?.message || error);notify(lastStatus);}
}
function wrap(element){
 if(!enabled || !element?.props || typeof element.props.onInitiateReply!=='function' || typeof element.props.onLongPressMessage!=='function')return element;
 const reply=element.props.onInitiateReply;
 let replacement=wrapped.get(reply);
 if(!replacement){
  replacement=function(event,...args){
   if(!enabled)return reply.call(this,event,...args);
   const target=data(event);
   if(target){remove(target);return;}
   return reply.call(this,event,...args);
  };
  wrapped.set(reply,replacement);wrapped.set(replacement,replacement);
 }
 return React.cloneElement(element,{onInitiateReply:replacement});
}
return {
 onLoad(){
  if(enabled)return;
  messages=vendetta.metro.findByProps('getMessage','getMessages');users=vendetta.metro.findByProps('getCurrentUser');selected=vendetta.metro.findByProps('getChannelId','getVoiceChannelId') || vendetta.metro.findByProps('getChannelId');actions=vendetta.metro.findByProps('deleteMessage','sendMessage');
  permissions=vendetta.metro.findByProps('can','computePermissions');channels=vendetta.metro.findByProps('getChannel','getDMFromUserId') || vendetta.metro.findByProps('getChannel');
  if(!messages || !users || !selected || !actions)throw Error('Fast Delete: native message hooks are unavailable');
  enabled=true;
  unpatches.push(vendetta.patcher.after('createElement',React,(_,result)=>wrap(result)));
  const modules=new Set(vendetta.metro.findByPropsAll?.('jsx','jsxs') || []);
  for(const module of modules)for(const key of ['jsx','jsxs','jsxDEV'])if(typeof module[key]==='function')unpatches.push(vendetta.patcher.after(key,module,(_,result)=>wrap(result)));
 },
 onUnload(){enabled=false;for(const undo of unpatches.splice(0))undo();cooldowns.clear();},
 settings(){return React.createElement(RN.ScrollView,{contentContainerStyle:{padding:20}},React.createElement(RN.Text,{style:{color:'#fff',fontSize:22,fontWeight:'700'}},'Fast Delete'),React.createElement(RN.Text,{style:{color:'#c4c6ce',fontSize:16,lineHeight:24,marginTop:16}},'Swipe a message using Discord’s usual swipe-to-reply gesture to delete it directly instead. Text messages and messages with media use the same native swipe.\n\nDeletes your own sent messages, plus other people’s messages when you have Manage Messages permission. Messages you cannot delete keep their normal swipe-to-reply action. Normal taps, holds, double-taps and Media Gestures stay unchanged. No Delete Confirmation is optional.\n\n'+lastStatus+'\n\nVersion 0.1.0'));}
};
