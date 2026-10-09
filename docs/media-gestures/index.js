(()=>{try{const core=(()=>{"use strict";
// Only the source of ONE rendered media element is used. Never a message's attachments[0].
function mediaFromSource(source) {
  const sources = Array.isArray(source) ? source : [source];
  const choices = [];
  for (const item of sources) {
    const uri = typeof item === 'string' ? item : item?.uri;
    if (typeof uri !== 'string') return null;
    // Avoid reliance on URL, which is incomplete in some React Native builds.
    const match = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/(attachments\/\d+\/\d+\/[^?#]+)(?:\?([^#]*))?$/i.exec(uri);
    if (!match) return null;
    const path = match[2], extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
    if (!['png','jpg','jpeg','gif','webp','avif','mp4','mov','webm'].includes(extension)) return null;
    // Keep signed ex/is/hm parameters; strip only thumbnail transforms.
    const query = (match[3] || '').split('&').filter(part => part && !/^(width|height|format|quality)=/i.test(part)).join('&');
    const url = 'https://cdn.discordapp.com/' + path + (query ? '?' + query : '');
    const key = path;
    if (choices.length && choices[0].key !== key) return null;
    let filename;
    try { filename = decodeURIComponent(path.split('/').pop()); } catch (_) { return null; }
    filename = filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
    choices.push({key,url,filename,video:['mp4','mov','webm'].includes(extension),extension});
  }
  return choices[0] || null;
}
function inside(point, rect) {
  return rect && rect.width > 0 && rect.height > 0 &&
    Number.isFinite(point.pageX) && Number.isFinite(point.pageY) &&
    point.pageX >= rect.x && point.pageX < rect.x + rect.width &&
    point.pageY >= rect.y && point.pageY < rect.y + rect.height;
}
function createGesture({getRect,show,hide,download,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let timer=null, count=0, starts=new Map(), canceled=false, downloaded=false, active=false, generation=0;
  function clear() { generation++; if(timer!==null)clearTimer(timer);timer=null; }
  function abort() { clear(); hide(); active=false; canceled=true; }
  function reset() { clear(); hide();count=0;starts.clear();canceled=false;downloaded=false;active=false; }
  function feed(touches) {
    const list=Array.from(touches || []), next=list.length;
    if(next===0) { reset();return; }
    if(canceled)return;
    const rect=getRect();
    if(next>3 || list.some(t=>!inside(t,rect))) { abort();return; }
    const ids=new Set(list.map(t=>t.identifier));
    if(ids.size!==next) { abort();return; }
    for(const t of list) {
      const start=starts.get(t.identifier);
      if(start && Math.hypot(t.pageX-start.x,t.pageY-start.y)>12) { abort();return; }
    }
    // A lifted/replaced finger ends the gesture. Do not turn a three-finger release into a URL gesture.
    if(next<count || [...starts.keys()].some(id=>!ids.has(id))) { abort();return; }
    for(const t of list)if(!starts.has(t.identifier))starts.set(t.identifier,{x:t.pageX,y:t.pageY});
    if(next===count)return;
    clear();hide();active=false;count=next;
    if(next<2 || downloaded)return;
    const expected=next, token=generation;
    timer=setTimer(()=>{
      timer=null;
      if(token!==generation || canceled || count!==expected)return;
      active=true;
      if(expected===2)show();
      else {downloaded=true;download();}
    },next===2?450:700);
  }
  return {feed,cancel:reset,claimed:()=>count>=2 && !canceled,active:()=>active};
}
function base64(bytes) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks=[];let chunk='';
  for(let i=0;i<bytes.length;i+=3) {
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2],n=(a<<16)|((b||0)<<8)|(c||0);
    chunk+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<bytes.length?alphabet[(n>>>6)&63]:'=')+(i+2<bytes.length?alphabet[n&63]:'=');
    if(chunk.length>=16384){chunks.push(chunk);chunk='';}
  }
  if(chunk)chunks.push(chunk);return chunks.join('');
}
return {mediaFromSource,inside,createGesture,base64};
})();
"use strict";
const {mediaFromSource,createGesture,base64}=core;
const {React,RN}= {React:vendetta.metro.common.React,RN:vendetta.metro.common.ReactNative};
const create=React.createElement.bind(React),unpatches=[],instances=new Set(),inFlight=new Set(),controllers=new Set(),touchSessions=new Set(),functionMedia=new Set(),longPressGuards=new WeakMap();
let enabled=false,downloads=0,videoPatched=false,appStateSubscription=null;
const notify=message=>{try{vendetta.ui.toasts.showToast(message);}catch(error){vendetta.logger?.warn?.('Media Gestures toast unavailable: '+String(error));}};
function startupError(error) {
  const message=String(error?.message || error);
  try {vendetta.plugin.storage.lastStartupError=message;}catch(_){}
  try {RN.Alert.alert('Media Gestures could not start',message);}catch(_) {
    try {vendetta.ui.alerts.showConfirmationAlert({title:'Media Gestures could not start',content:message,confirmText:'OK',onConfirm:()=>{}});}catch(_) {notify(message);}
  }
}
function native(name) {
  try {return RN.NativeModules?.[name] || globalThis.nativeModuleProxy?.[name] || globalThis.__turboModuleProxy?.(name);} catch(_){return null;}
}
function fileManager() {
  return ['NativeFileModule','RTNFileManager','DCDFileManager'].map(native).find(m=>typeof m?.writeFile==='function');
}
function gallery() {
  const camera=native('RNCCameraRoll');
  if(typeof camera?.saveToCameraRoll==='function') return (uri,type)=>camera.saveToCameraRoll(uri,{type,album:'Revenge'});
  let api;
  try {api=vendetta.metro.findByProps('getPhotos','save');}catch(_){}
  if(typeof api?.save==='function')return (uri,type)=>api.save(uri,{type,album:'Revenge'});
  return null;
}
async function download(media) {
  if(!enabled || inFlight.has(media.key))return;
  if(downloads>=2){notify('Two downloads are already running. Try again shortly.');return;}
  const files=fileManager(),save=gallery();
  if(!files || !save){notify('Media Gestures: gallery saving is unavailable on this build.');return;}
  inFlight.add(media.key);downloads++;
  let cacheName=null,controller=null,timeout=null;
  try {
    notify('Downloading '+media.filename);
    if(typeof AbortController==='function'){controller=new AbortController();controllers.add(controller);timeout=setTimeout(()=>controller.abort(),45000);}
    const response=await fetch(media.url,controller?{signal:controller.signal}:{});
    if(!response.ok)throw Error('HTTP '+response.status+' (the attachment link may have expired)');
    const max=32*1024*1024;
    if(Number(response.headers?.get?.('content-length'))>max)throw Error('File exceeds the 32 MB limit for this first build');
    const contentType=(response.headers?.get?.('content-type') || '').toLowerCase();
    if(contentType && !/^(image\/|video\/|application\/octet-stream)/.test(contentType))throw Error('Server did not return media');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>max)throw Error('File exceeds the 32 MB limit for this first build');
    if(!enabled)throw Error('Plugin was disabled');
    cacheName='revenge-media-gestures/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+media.filename;
    const path=await files.writeFile('cache',cacheName,base64(bytes),'base64');
    if(typeof path!=='string' || !path)throw Error('Native file manager returned no local path');
    const uri=/^(file|content):\/\//.test(path)?path:'file://'+path;
    if(!enabled)throw Error('Plugin was disabled');
    await save(uri,media.video?'video':'photo');
    notify('Saved '+media.filename+' to your gallery');
  } catch(error) {if(enabled)notify('Download failed: '+String(error?.message || error));}
  finally {
    clearTimeout(timeout);if(controller)controllers.delete(controller);
    if(cacheName && typeof files.removeFile==='function')try{await files.removeFile('cache',cacheName);}catch(_){}
    inFlight.delete(media.key);downloads--;
  }
}
// View layout properties move to the wrapper; the original media fills that same box.
const layoutKeys=new Set(('width height minWidth minHeight maxWidth maxHeight aspectRatio flex flexGrow flexShrink flexBasis alignSelf margin marginHorizontal marginVertical marginTop marginBottom marginLeft marginRight marginStart marginEnd position top left right bottom start end zIndex transform opacity').split(' '));
function splitStyle(style) {
  const flat=RN.StyleSheet.flatten(style)||{},outer={},inner={};
  for(const key of Object.keys(flat))(layoutKeys.has(key)?outer:inner)[key]=flat[key];
  return {outer,inner:[inner,{position:'absolute',top:0,left:0,width:'100%',height:'100%'}]};
}
function blockLongPress(event) {
  if(!enabled)return false;
  const nativeEvent=event?.nativeEvent;
  if(nativeEvent?.touches?.length>1)return true;
  const point=nativeEvent?.touches?.[0] || nativeEvent;
  return [...touchSessions].some(session=>session.blocked && (
    (point?.target!=null && session.targets.has(point.target)) ||
    (session.rect && point?.pageX>=session.rect.x && point.pageX<session.rect.x+session.rect.width &&
      point?.pageY>=session.rect.y && point.pageY<session.rect.y+session.rect.height)));
}
function guardLongPress(element) {
  const callback=element?.props?.onLongPress;
  if(typeof callback!=='function')return element;
  let guarded=longPressGuards.get(callback);
  if(!guarded) {
    guarded=function(...args){if(!blockLongPress(args[0]))return callback.apply(this,args);};
    longPressGuards.set(callback,guarded);longPressGuards.set(guarded,guarded);
  }
  return React.cloneElement(element,{onLongPress:guarded});
}
function MediaBox({element,media}) {
  const ref=React.useRef(null),rect=React.useRef(null),gesture=React.useRef(null),eventVersion=React.useRef(0),alive=React.useRef(true),[visible,setVisible]=React.useState(false),[revision,setRevision]=React.useState(0);
  const session=React.useRef({blocked:false,targets:new Set(),rect:null,releaseTimer:null});
  const resetSession=()=>{clearTimeout(session.current.releaseTimer);session.current.blocked=false;session.current.targets.clear();touchSessions.delete(session.current);};
  const measured=()=>ref.current?.measureInWindow((x,y,width,height)=>{rect.current={x,y,width,height};session.current.rect=rect.current;});
  React.useEffect(()=>{
    const state={clear(){resetSession();eventVersion.current++;gesture.current?.cancel();setVisible(false);setRevision(value=>value+1);}};instances.add(state);
    return ()=>{resetSession();alive.current=false;eventVersion.current++;instances.delete(state);gesture.current?.cancel();};
  },[]);
  React.useEffect(()=>{
    resetSession();gesture.current?.cancel();
    gesture.current=createGesture({getRect:()=>rect.current,show:()=>{if(enabled && alive.current)setVisible(true);},hide:()=>{if(alive.current)setVisible(false);},download:()=>download(media)});
    return ()=>gesture.current?.cancel();
  },[media.key,media.url]);
  const cancel=()=>{resetSession();eventVersion.current++;gesture.current?.cancel();};
  const feed=event=>{
    if(!enabled)return;
    const touches=Array.from(event.nativeEvent?.touches || [],t=>({identifier:t.identifier,pageX:t.pageX,pageY:t.pageY,target:t.target}));
    // Latch suppression as soon as a second finger arrives, before asynchronous measurement.
    clearTimeout(session.current.releaseTimer);
    if(touches.length>1) {
      session.current.blocked=true;touchSessions.add(session.current);
      for(const touch of touches)session.current.targets.add(touch.target);
    }
    if(session.current.blocked && touches.length)event.stopPropagation?.();
    const version=++eventVersion.current;
    if(!touches.length){
      gesture.current?.feed([]);
      // Keep the latch through release callbacks in this dispatch, then reset.
      session.current.releaseTimer=setTimeout(resetSession,0);return;
    }
    // Scrolling does not fire onLayout. Remeasure for every touch update; never reuse an old screen rectangle.
    ref.current?.measureInWindow((x,y,width,height)=>{
      if(!alive.current || !enabled || version!==eventVersion.current)return;
      rect.current={x,y,width,height};session.current.rect=rect.current;gesture.current?.feed(touches);
    });
  };
  const capture=event=>{
    const touches=event.nativeEvent?.touches || [];
    if(!enabled || touches.length<2 || touches.length>3)return false;
    if(touches.some(t=>t.target!==touches[0].target))return false;
    feed(event);return true;
  };
  const {outer,inner}=splitStyle(element.props.style);
  const clone=React.cloneElement(element,{style:inner});
  // There is no hitSlop or message-sized gesture surface: only this media's physical box.
  if(!enabled)return element;
  return create(RN.View,{
    ref,collapsable:false,style:outer,onLayout:measured,
    onTouchStart:feed,onTouchMove:feed,onTouchEnd:feed,onTouchCancel:cancel,
    onStartShouldSetResponderCapture:capture,onMoveShouldSetResponderCapture:capture,
    onResponderGrant:feed,onResponderMove:feed,
    onResponderRelease:feed,onResponderTerminate:cancel,
    onResponderTerminationRequest:()=>!(gesture.current?.claimed()),
  },clone,visible?create(RN.View,{pointerEvents:'none',style:{position:'absolute',top:0,left:0,right:0,zIndex:999,elevation:8,padding:7,backgroundColor:'rgba(15,17,22,0.94)',borderRadius:6}},
    create(RN.Text,{selectable:false,style:{color:'#fff',fontSize:11,lineHeight:15}},media.url)):null);
}
function wrap(element,source) {
  if(!enabled || !React.isValidElement(element))return element;
  const media=mediaFromSource(source);
  if(!media)return element;
  // Zero-sized or intrinsic-sized views cannot safely become wrapper boxes.
  const style=RN.StyleSheet.flatten(element.props.style)||{};
  if(!(style.width || style.flex || style.flexGrow) || !(style.height || style.aspectRatio || style.flex || style.flexGrow))return element;
  return create(MediaBox,{element,media,key:element.key});
}
function patchForward(component) {
  const seen=new Set();
  // Image may be memo(forwardRef(...)); the outer memo has .type, not .render.
  while(component && typeof component.render!=='function') {
    if(seen.has(component))return false;seen.add(component);
    component=component.type || component.default;
  }
  if(typeof component?.render!=='function')return false;
  unpatches.push(vendetta.patcher.after('render',component,(args,element)=>wrap(element,args[0]?.source)));
  return true;
}
// Function components have no mutable render method. Intercept their elements,
// preserving the original component, refs and React's hook execution.
function patchFactories() {
  const holders=new Set([React]);
  try {for(const runtime of vendetta.metro.findByPropsAll?.('jsx','jsxs') || [])holders.add(runtime);}catch(_){}
  let count=0;
  for(const holder of holders)for(const name of ['createElement','jsx','jsxs','jsxDEV']) {
    if(typeof holder?.[name]!=='function')continue;
    try {
      unpatches.push(vendetta.patcher.after(name,holder,(args,result)=>{
        if(!enabled || !React.isValidElement(result))return result;
        const element=guardLongPress(result);
        return functionMedia.has(element.type)?wrap(element,element.props?.source):element;
      }));count++;
    }catch(_){}
  }
  return count>0;
}
function patchFunction(component) {
  if(typeof component!=='function')return false;
  functionMedia.add(component);return true;
}
function onLoad() {
  if(enabled)return;enabled=true;
  try {
  if(!patchFactories())throw Error('React element factories are unavailable');
  if(!patchForward(RN.Image) && !patchFunction(RN.Image))throw Error('No supported Image render hook. Image type: '+typeof RN.Image+'; fields: '+Object.keys(RN.Image || {}).join(', '));
  // React Native Video commonly exports a forwardRef. Never guess an array index or an internal save function.
  try {
    const module=vendetta.metro.findByName('Video',false);
    const video=module?.default || module?.Video;
    if(video && video!==RN.Image)videoPatched=patchForward(video) || patchFunction(video);
  }catch(_){}
  appStateSubscription=RN.AppState?.addEventListener('change',state=>{if(state!=='active')for(const item of instances)item.clear();});
  notify('Media Gestures: hold 2 fingers for URL, 3 to save. Reload once to attach to existing media.');
  try {delete vendetta.plugin.storage.lastStartupError;}catch(_){}
  } catch(error) {onUnload();startupError(error);throw error;}
}
function onUnload() {
  enabled=false;functionMedia.clear();for(const session of touchSessions){clearTimeout(session.releaseTimer);session.blocked=false;}touchSessions.clear();appStateSubscription?.remove();appStateSubscription=null;videoPatched=false;for(const controller of controllers)controller.abort();for(const unpatch of unpatches.splice(0))unpatch();
  for(const item of instances)item.clear();
}
function settings() {
  return create(RN.ScrollView,{contentContainerStyle:{padding:20}},
    create(RN.Text,{style:{color:'#fff',fontSize:20,fontWeight:'600',marginBottom:16}},'Media Gestures'),
    create(RN.Text,{style:{color:'#b8bbc4',fontSize:14,lineHeight:22}},
      'Two fingers: hold 0.45 seconds to see the URL, then lift to hide.\n\nThree fingers: hold 0.7 seconds to download once. All fingers must touch the same media tile. Moving cancels.\n\nDownload limit: 32 MB; at most two simultaneous downloads. Gallery permission may be required.\n\nImage hook: '+(enabled?'active':'inactive')+'\nInline video hook: '+(videoPatched?'active':'not detected (video thumbnails may still work)')+'\nFile manager: '+(fileManager()?'available':'not detected')+'\nGallery saving: '+(gallery()?'available':'not detected')+'\n\nTarget: Revenge 1.11.6 / Discord 347.12. This is a test build: native media rendering and gestures must be verified on your phone.'));
}
return {onLoad,onUnload,settings};

}catch(error){return {onLoad(){const message=String(error?.message || error);try{vendetta.metro.common.ReactNative.Alert.alert('Media Gestures startup error',message);}catch(_){try{vendetta.ui.alerts.showConfirmationAlert({title:'Media Gestures startup error',content:message,confirmText:'OK',onConfirm:()=>{}});}catch(_){}}throw error;},onUnload(){}};}})()