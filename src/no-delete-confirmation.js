"use strict";
const {React,ReactNative:RN}=vendetta.metro.common;
let unpatch=null,modernIntl=null;
let skipped=0,lastStatus='Not used yet';
function report(error){
  lastStatus='Delete failed: '+String(error?.message || error);
  try{RN.Alert.alert('No Delete Confirmation',lastStatus);}catch(_){vendetta.logger?.warn?.(lastStatus);}
}
function deleteTitles(){
  const titles=new Set();
  try{const title=vendetta.metro.common.i18n?.Messages?.DELETE_MESSAGE;if(typeof title==='string' && title)titles.add(title);}catch(_){}
  try{const descriptor=modernIntl?.t?.MWMcg7;if(descriptor!=null){const title=modernIntl.intl.string(descriptor);if(typeof title==='string' && title)titles.add(title);}}catch(_){}
  return titles;
}
function previewMessage(node,depth=0){
  if(depth>6 || !node || typeof node!=='object')return null;
  if(Array.isArray(node)){for(const child of node.slice(0,20)){const message=previewMessage(child,depth+1);if(message)return message;}return null;}
  const message=node.props?.message;
  if(message && typeof message.id==='string' && typeof message.author?.id==='string')return message;
  return previewMessage(node.props?.children,depth+1);
}
function canSkip(options){
  if(!options || typeof options.onConfirm!=='function' || !deleteTitles().has(options.title))return false;
  const message=previewMessage(options.children);
  // Discord already checked permissions before offering this delete prompt.
  // Keep its exact action for both own messages and moderation deletions.
  return !!message;
}
return {
  onLoad(){
    if(unpatch)return;
    const alerts=vendetta.metro.findByProps('show','openLazy');
    modernIntl=vendetta.metro.findByProps('intl','t');
    if(typeof alerts?.show!=='function' || !deleteTitles().size){
      const error=Error('Supported message-delete alert hooks were not found on this Discord build.');report(error);throw error;
    }
    unpatch=vendetta.patcher.instead('show',alerts,(args,original)=>{
      const options=args[0];
      if(!canSkip(options))return original(...args);
      skipped++;lastStatus='Invoked Discord’s delete action';
      try{
        const result=options.onConfirm();
        // Preserve the native callback and its promise; never repeat a failed action.
        if(result && typeof result.then==='function')return result.catch(error=>{report(error);});
        return result;
      }catch(error){report(error);}
    });
  },
  onUnload(){unpatch?.();unpatch=null;modernIntl=null;},
  settings(){return React.createElement(RN.ScrollView,{contentContainerStyle:{padding:20}},
    React.createElement(RN.Text,{style:{color:'#fff',fontSize:22,fontWeight:'700',marginBottom:14}},'No Delete Confirmation'),
    React.createElement(RN.Text,{style:{color:'#c4c6ce',fontSize:16,lineHeight:24}},
      'Choose Delete in a message’s menu to delete immediately, including other people’s messages when you have permission. Uses Discord’s original delete action. Other confirmation dialogs are unchanged.\n\nDisable this plugin to restore the normal prompt.\n\nHook: '+(unpatch?'active':'inactive')+'\nConfirmations skipped this session: '+skipped+'\nLast action: '+lastStatus+'\n\nVersion 0.1.1 · Revenge 1.11.6 / Discord 347.12'));}
};
