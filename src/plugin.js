"use strict";
const {mediaFromSource,createGesture,base64}=core;
const {React,RN}= {React:vendetta.metro.common.React,RN:vendetta.metro.common.ReactNative};
const create=React.createElement.bind(React),unpatches=[],instances=new Set(),inFlight=new Set(),controllers=new Set();
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
function MediaBox({element,media}) {
  const ref=React.useRef(null),rect=React.useRef(null),gesture=React.useRef(null),eventVersion=React.useRef(0),alive=React.useRef(true),[visible,setVisible]=React.useState(false),[revision,setRevision]=React.useState(0);
  const measured=()=>ref.current?.measureInWindow((x,y,width,height)=>{rect.current={x,y,width,height};});
  React.useEffect(()=>{
    const state={clear(){eventVersion.current++;gesture.current?.cancel();setVisible(false);setRevision(value=>value+1);}};instances.add(state);
    return ()=>{alive.current=false;eventVersion.current++;instances.delete(state);gesture.current?.cancel();};
  },[]);
  React.useEffect(()=>{
    gesture.current?.cancel();
    gesture.current=createGesture({getRect:()=>rect.current,show:()=>{if(enabled && alive.current)setVisible(true);},hide:()=>{if(alive.current)setVisible(false);},download:()=>download(media)});
    return ()=>gesture.current?.cancel();
  },[media.key,media.url]);
  const cancel=()=>{eventVersion.current++;gesture.current?.cancel();};
  const feed=event=>{
    if(!enabled)return;
    const touches=Array.from(event.nativeEvent?.touches || [],t=>({identifier:t.identifier,pageX:t.pageX,pageY:t.pageY,target:t.target}));
    const version=++eventVersion.current;
    if(!touches.length){gesture.current?.feed([]);return;}
    // Scrolling does not fire onLayout. Remeasure for every touch update; never reuse an old screen rectangle.
    ref.current?.measureInWindow((x,y,width,height)=>{
      if(!alive.current || !enabled || version!==eventVersion.current)return;
      rect.current={x,y,width,height};gesture.current?.feed(touches);
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
    onResponderRelease:cancel,onResponderTerminate:cancel,
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
function onLoad() {
  if(enabled)return;enabled=true;
  try {
  if(!patchForward(RN.Image))throw Error('No supported Image render hook. Image type: '+typeof RN.Image+'; fields: '+Object.keys(RN.Image || {}).join(', '));
  // React Native Video commonly exports a forwardRef. Never guess an array index or an internal save function.
  try {
    const module=vendetta.metro.findByName('Video',false);
    const video=module?.default || module?.Video;
    if(video && video!==RN.Image)videoPatched=patchForward(video);
  }catch(_){}
  appStateSubscription=RN.AppState?.addEventListener('change',state=>{if(state!=='active')for(const item of instances)item.clear();});
  notify('Media Gestures: hold 2 fingers for URL, 3 to save. Reload once to attach to existing media.');
  try {delete vendetta.plugin.storage.lastStartupError;}catch(_){}
  } catch(error) {onUnload();startupError(error);throw error;}
}
function onUnload() {
  enabled=false;appStateSubscription?.remove();appStateSubscription=null;videoPatched=false;for(const controller of controllers)controller.abort();for(const unpatch of unpatches.splice(0))unpatch();
  for(const item of instances)item.clear();
}
function settings() {
  return create(RN.ScrollView,{contentContainerStyle:{padding:20}},
    create(RN.Text,{style:{color:'#fff',fontSize:20,fontWeight:'600',marginBottom:16}},'Media Gestures'),
    create(RN.Text,{style:{color:'#b8bbc4',fontSize:14,lineHeight:22}},
      'Two fingers: hold 0.45 seconds to see the URL, then lift to hide.\n\nThree fingers: hold 0.7 seconds to download once. All fingers must touch the same media tile. Moving cancels.\n\nDownload limit: 32 MB; at most two simultaneous downloads. Gallery permission may be required.\n\nImage hook: '+(enabled?'active':'inactive')+'\nInline video hook: '+(videoPatched?'active':'not detected (video thumbnails may still work)')+'\nFile manager: '+(fileManager()?'available':'not detected')+'\nGallery saving: '+(gallery()?'available':'not detected')+'\n\nTarget: Revenge 1.11.6 / Discord 347.12. This is a test build: native media rendering and gestures must be verified on your phone.'));
}
return {onLoad,onUnload,settings};
