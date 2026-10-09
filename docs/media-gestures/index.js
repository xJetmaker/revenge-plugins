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
function createGesture({getRect,show,hide,download,setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{}}) {
  const timers=new Set();
  let count=0,starts=new Map(),canceled=false,downloaded=false,active=false,generation=0;
  function clear() {generation++;for(const timer of timers)clearTimer(timer);timers.clear();}
  function abort(reason,touchCount=count) {clear();hide();active=false;canceled=true;onState({count:touchCount,canceled:true,reason});}
  function reset() {clear();hide();count=0;starts.clear();canceled=false;downloaded=false;active=false;onState({count:0});}
  function schedule(delay,token,callback) {
    const timer=setTimer(()=>{
      timers.delete(timer);
      if(token===generation && !canceled && count===2)callback();
    },delay);timers.add(timer);
  }
  function feed(touches) {
    const list=Array.from(touches || []),next=list.length;
    if(!next){reset();return;}
    if(canceled)return;
    if(next>2){abort('Use exactly two fingers',next);return;}
    const rect=getRect();
    if(list.some(t=>!inside(t,rect))){abort('Keep both fingers inside the same media tile',next);return;}
    const ids=new Set(list.map(t=>t.identifier));
    if(ids.size!==next){abort('Touch identifiers are unavailable',next);return;}
    for(const t of list){
      const start=starts.get(t.identifier);
      if(start && Math.hypot(t.pageX-start.x,t.pageY-start.y)>12){abort('Hold still to download');return;}
    }
    if(next<count || [...starts.keys()].some(id=>!ids.has(id))){abort('Keep both fingers down until the download starts');return;}
    for(const t of list)if(!starts.has(t.identifier))starts.set(t.identifier,{x:t.pageX,y:t.pageY});
    if(next===count)return;
    clear();hide();active=false;count=next;onState({count});
    if(next!==2 || downloaded)return;
    const token=generation;
    schedule(450,token,()=>{active=true;show();onState({count,phase:'url'});});
    schedule(1500,token,()=>{downloaded=true;active=true;hide();onState({count,phase:'download'});download();});
  }
  return {feed,cancel:reset,claimed:()=>count===2 && !canceled,active:()=>active};
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
const {mediaFromSource,createGesture,base64,inside}=core;
const {React,RN}= {React:vendetta.metro.common.React,RN:vendetta.metro.common.ReactNative};
const create=React.createElement.bind(React),unpatches=[],instances=new Set(),inFlight=new Set(),controllers=new Set(),touchSessions=new Set(),functionMedia=new Set(),longPressGuards=new WeakMap();
const mediaContext=React.createContext(false);
const videoDiagnostics=new Map();
const videoTrace={calls:0,wrapped:0,touches:0,last:"Open a full-screen video first"};
let enabled=false,downloads=0,videoPatched=false,appStateSubscription=null,menuGuard=false,pressabilityGuard=false;
const notify=message=>{try{vendetta.ui.toasts.showToast(message);}catch(error){vendetta.logger?.warn?.('Media Gestures toast unavailable: '+String(error));}};
function startupError(error) {
  const message=String(error?.message || error);
  try {vendetta.plugin.storage.lastStartupError=message;}catch(_){}
  try {RN.Alert.alert('Media Gestures could not start',message);}catch(_) {
    try {vendetta.ui.alerts.showConfirmationAlert({title:'Media Gestures could not start',content:message,confirmText:'OK',onConfirm:()=>{}});}catch(_) {notify(message);}
  }
}
function native(name) {
  for(const lookup of [()=>globalThis.__turboModuleProxy?.(name),()=>globalThis.nativeModuleProxy?.[name],()=>RN.NativeModules?.[name]]) {
    try {const module=lookup();if(module)return module;}catch(_){}
  }
  return null;
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
function discordDownloader() {
  for(const name of ['MediaManager','DCDMediaManager']) {
    const manager=native(name);
    if(typeof manager?.downloadMediaAsset==='function')return manager;
  }
  try {
    const manager=vendetta.metro.findByProps('downloadMediaAsset');
    if(typeof manager?.downloadMediaAsset==='function')return manager;
  }catch(_){}
  return null;
}
async function download(media,onStatus=()=>{}) {
  const status=(message,problem=false)=>{
    try {vendetta.plugin.storage.lastDownloadStatus=message;}catch(_){}
    onStatus(message);notify(message);
    if(problem)try {RN.Alert.alert('Media Gestures download',message);}catch(_){}
  };
  if(!enabled)return;
  if(inFlight.has(media.key)){onStatus('This attachment is already downloading');return;}
  if(downloads>=2){status('Two downloads are already running. Try again shortly.');return;}
  const manager=discordDownloader(),files=manager?null:fileManager(),save=manager?null:gallery();
  if(!manager && (!files || !save)){status(!files?'Native file writing is unavailable on this Discord build.':'Gallery saving is unavailable on this Discord build.',true);return;}
  inFlight.add(media.key);downloads++;
  let cacheName=null,controller=null,timeout=null;
  try {
    status('Downloading media…');
    if(manager) {
      // Discord's API takes URL + a GIF flag (1 for GIF, 0 otherwise),
      // not a guessed image/video enum. Native saving avoids JS/base64 copies.
      const request=manager.downloadMediaAsset(media.url,media.extension==='gif'?1:0);
      if(!request || typeof request.then!=='function') {
        status('Download handed to Discord. Check Downloads or your gallery.');return;
      }
      const result=await request;
      if(result===false || result===null)throw Error('Discord could not save the media (check storage permission)');
      if(enabled)status(result===true || (typeof result==='string' && result)?'Media saved by Discord':'Discord finished the download request. Check Downloads or your gallery.');
      return;
    }
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
    onStatus('Writing downloaded media…');
    const path=await files.writeFile('cache',cacheName,base64(bytes),'base64');
    if(typeof path!=='string' || !path)throw Error('Native file manager returned no local path');
    const uri=/^(file|content):\/\//.test(path)?path:'file://'+path;
    if(!enabled)throw Error('Plugin was disabled');
    onStatus('Saving media to your gallery…');
    await save(uri,media.video?'video':'photo');
    status('Saved media to your gallery');
  } catch(error) {if(enabled)status('Download failed: '+String(error?.message || error),true);}
  finally {
    clearTimeout(timeout);if(controller)controllers.delete(controller);
    if(cacheName && typeof files?.removeFile==='function')try{await files.removeFile('cache',cacheName);}catch(_){}
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
function ownsMediaHold() {
  return enabled && [...touchSessions].some(session=>session.blocked && session.owned);
}
function patchMenuGuards() {
  // Discord can open its action sheet without forwarding a touch event or
  // an onLongPress prop. Guard the actual sheet entry point for an owned hold.
  try {
    const sheets=vendetta.metro.findByProps('openLazy','hideActionSheet');
    if(typeof sheets?.openLazy==='function') {
      unpatches.push(vendetta.patcher.instead('openLazy',sheets,(args,original)=>{
        if(ownsMediaHold())return;
        return original(...args);
      }));menuGuard=true;
    }
  }catch(error){vendetta.logger?.warn?.('Media Gestures action-sheet guard unavailable: '+String(error));}
  // Patch the prototype so pressables mounted before this plugin are covered too.
  try {
    const module=vendetta.metro.findByName('Pressability');
    const prototype=(module?.default || module)?.prototype;
    if(typeof prototype?._handleLongPress==='function') {
      unpatches.push(vendetta.patcher.instead('_handleLongPress',prototype,(args,original)=>{
        if(blockLongPress(args[0]))return;
        return original(...args);
      }));pressabilityGuard=true;
    }
  }catch(error){vendetta.logger?.warn?.('Media Gestures Pressability guard unavailable: '+String(error));}
}
function blockLongPress(event) {
  if(!enabled)return false;
  const nativeEvent=event?.nativeEvent;
  if(nativeEvent?.touches?.length>1)return true;
  const point=nativeEvent?.touches?.[0] || nativeEvent;
  if(point?.target==null && !Number.isFinite(point?.pageX))return ownsMediaHold();
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
function MediaBox({element,media,layoutStyle}) {
  const nested=React.useContext(mediaContext);
  const ref=React.useRef(null),rect=React.useRef(null),gesture=React.useRef(null),eventVersion=React.useRef(0),alive=React.useRef(true),[visible,setVisible]=React.useState(false),[revision,setRevision]=React.useState(0),[feedback,setFeedback]=React.useState(null);
  const session=React.useRef({blocked:false,owned:false,targets:new Set(),rect:null,releaseTimer:null});
  const resetSession=()=>{clearTimeout(session.current.releaseTimer);session.current.blocked=false;session.current.owned=false;session.current.targets.clear();touchSessions.delete(session.current);};
  const measured=()=>ref.current?.measureInWindow((x,y,width,height)=>{rect.current={x,y,width,height};session.current.rect=rect.current;});
  React.useEffect(()=>{
    if(nested)return;
    const state={clear(){resetSession();eventVersion.current++;gesture.current?.cancel();setVisible(false);setFeedback(null);setRevision(value=>value+1);}};instances.add(state);
    return ()=>{resetSession();alive.current=false;eventVersion.current++;instances.delete(state);gesture.current?.cancel();};
  },[]);
  React.useEffect(()=>{
    if(nested)return;
    resetSession();gesture.current?.cancel();
    gesture.current=createGesture({getRect:()=>rect.current,show:()=>{if(enabled && alive.current)setVisible(true);},hide:()=>{if(alive.current)setVisible(false);},download:()=>download(media,message=>{if(enabled && alive.current)setFeedback(message);}),
      onState:state=>{
        if(!alive.current)return;
        if(!state.count)session.current.owned=false;
        else if(state.count>=2 && !state.canceled)session.current.owned=true;
        if(state.canceled)setFeedback(state.count>=2?state.reason:null);
        else setFeedback(state.count===2?(state.phase==='download'?'Starting download…':state.phase==='url'?'Keep holding to download; lift to only view the URL':'Hold two fingers still…'):null);
      }});
    return ()=>gesture.current?.cancel();
  },[media.key,media.url]);
  const cancel=()=>{resetSession();eventVersion.current++;gesture.current?.cancel();};
  const feed=event=>{
    if(!enabled)return;
    if(media.video){videoTrace.touches++;videoTrace.last="Video received "+(event.nativeEvent?.touches?.length || 0)+" touches";}
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
    if(!enabled || touches.length!==2)return false;
    // Native video surfaces and controls can give fingers different target IDs
    // even inside the same tile. Geometry, not target equality, defines ownership.
    if(rect.current) {
      if(touches.some(t=>!inside(t,rect.current)))return false;
    } else if(touches.some(t=>t.target!==touches[0].target))return false;
    feed(event);return true;
  };
  const {outer,inner}=splitStyle(layoutStyle ?? element.props.style);
  const clone=React.cloneElement(element,{style:inner});
  // There is no hitSlop or message-sized gesture surface: only this media's physical box.
  if(!enabled || nested)return element;
  return create(mediaContext.Provider,{value:true},create(RN.View,{
    ref,collapsable:false,style:outer,onLayout:measured,
    onTouchStart:feed,onTouchMove:feed,onTouchEnd:feed,onTouchCancel:cancel,
    onStartShouldSetResponderCapture:capture,onMoveShouldSetResponderCapture:capture,
    onResponderGrant:event=>{feed(event);return true;},onResponderStart:feed,onResponderEnd:feed,onResponderMove:feed,
    onResponderRelease:feed,onResponderTerminate:cancel,
    onResponderTerminationRequest:()=>!(gesture.current?.claimed()),
  },clone,(visible || feedback)?create(RN.View,{pointerEvents:'none',style:{position:'absolute',top:0,left:0,right:0,zIndex:999,elevation:8,padding:7,backgroundColor:'rgba(15,17,22,0.94)',borderRadius:6}},
    create(RN.Text,{selectable:false,style:{color:'#fff',fontSize:11,lineHeight:15}},visible?media.url+(feedback?"\n"+feedback:""):(feedback || media.url))):null));
}
function wrap(element,source,layoutStyle=element?.props?.style) {
  if(!enabled || !React.isValidElement(element))return element;
  const media=mediaFromSource(source);
  if(!media)return element;
  // Zero-sized or intrinsic-sized views cannot safely become wrapper boxes.
  const style=RN.StyleSheet.flatten(layoutStyle)||{};
  const stretched=style.position==='absolute';
  const width=style.width || style.flex || style.flexGrow || (stretched && style.left!=null && style.right!=null);
  const height=style.height || style.aspectRatio || style.flex || style.flexGrow || (stretched && style.top!=null && style.bottom!=null);
  if(!width || !height)return element;
  return create(MediaBox,{element,media,layoutStyle,key:element.key});
}
function videoSource(props) {
  const source=props?.src || props?.source || props?.videoURI;
  if(!source || Array.isArray(source))return source;
  // Prefer the original video over its poster or converted thumbnail.
  return source.videoURI || source.sourceURI || source;
}
function wrapVideo(element) {
  const props=element?.props;
  if(!props)return element;
  const style=RN.StyleSheet.flatten(props.style)||{};
  const dimensions={};
  if(style.width==null && Number.isFinite(props.width) && props.width>0)dimensions.width=props.width;
  if(style.height==null && Number.isFinite(props.height) && props.height>0)dimensions.height=props.height;
  const media=mediaFromSource(videoSource(props));
  // Only original video attachments: no avatars, posters or camera streams.
  if(!media?.video)return element;
  const original=Object.keys(dimensions).length?React.cloneElement(element,{style:[dimensions,props.style]}):element;
const wrapped=wrap(original,media.url);
  const type=element.type?.displayName || element.type?.name || element.type?.type?.name || (typeof element.type==='string'?element.type:'anonymous');
  videoDiagnostics.set(type,{wrapped:wrapped!==original,props:Object.keys(props).slice(0,16).join(', ')});
  if(videoDiagnostics.size>6)videoDiagnostics.delete(videoDiagnostics.keys().next().value);
  if(wrapped!==original)videoPatched=true;
  return wrapped;
}
function discoverVideos() {
  const candidates=new Set();
  try {
    const module=vendetta.metro.findByName('Video',false);
    if(module){candidates.add(module.default || module.Video || module);}
  }catch(_){}
  for(const name of ['Video','VideoComponent','MediaModalVideo']) {
    try {const component=vendetta.metro.findByName(name);if(component)candidates.add(component.default || component);}catch(_){}
    try {for(const component of vendetta.metro.findByDisplayNameAll?.(name) || [])candidates.add(component);}catch(_){}
  }
  for(const candidate of [...candidates]) {
    if(typeof candidate?.VideoComponent==='function')candidates.add(candidate.VideoComponent);
  }
  for(const component of candidates) {
    if(component===RN.Image)continue;
    if(typeof component==='function' || (component && (typeof component.render==='function' || component.type))) {
      functionMedia.add(component);videoPatched=true;
    }
  }
  videoComponents.clear();for(const candidate of candidates)if(functionMedia.has(candidate))videoComponents.add(candidate);
}
const videoComponents=new Set();
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
function guardVideoPresenter(element) {
  const props=element.props;
  const type=element.type?.displayName || element.type?.name || element.type?.type?.name;
  if(type!=='MediaViewerItemPresenter' || typeof props?.renderMedia!=='function')return element;
  const renderMedia=props.renderMedia;
  // The presenter sizes an animated child internally. Its renderMedia callback
  // receives the actual tile's source and 100%-fill style inside that child.
  // Wrap there, never around the window-sized presenter or overlay controls.
  const guarded=function(...args) {
    const rendered=renderMedia.apply(this,args);
    if(!enabled)return rendered;
    videoTrace.calls++;
    if(!React.isValidElement(rendered)){videoTrace.last='renderMedia returned no React element';return rendered;}
    const tile=args[0],media=mediaFromSource(videoSource(tile));
    if(!media?.video) {
      videoTrace.last='Callback source is not an original video; argument keys: '+Object.keys(tile || {}).slice(0,12).join(', ');
      return rendered;
    }
    // The callback owns the actual media-box layout and original source.
    // A player may instead expose an empty style and a poster-only source.
    // Keep the player's source intact; give only the gesture wrapper the URL.
    const layout=[rendered.props.style,tile.style];
    const wrapped=wrap(rendered,media.url,layout);
    if(wrapped===rendered) {
      const style=RN.StyleSheet.flatten(layout)||{};
      videoTrace.last='Callback ran but layout is missing; style keys: '+Object.keys(style).join(', ');
    } else {videoTrace.wrapped++;videoTrace.last='Video child wrapped; waiting for touch events';}
    return wrapped;
  };
  videoDiagnostics.set('MediaViewerItemPresenter',{status:'callback attached',props:'renderMedia interception installed'});
  return React.cloneElement(element,{renderMedia:guarded});
}
function patchFactories() {
  const holders=new Set([React]);
  try {for(const runtime of vendetta.metro.findByPropsAll?.('jsx','jsxs') || [])holders.add(runtime);}catch(_){}
  let count=0;
  for(const holder of holders)for(const name of ['createElement','jsx','jsxs','jsxDEV']) {
    if(typeof holder?.[name]!=='function')continue;
    try {
      unpatches.push(vendetta.patcher.after(name,holder,(args,result)=>{
        if(!enabled || !React.isValidElement(result))return result;
        const element=guardVideoPresenter(guardLongPress(result));
        if(element.props.renderMedia!==result.props.renderMedia)return element;
        // Match the source of one rendered tile, including full-screen memoized
        // media renderers whose export names differ between Discord builds.
        // Never inspect a whole message's attachment list or pick a poster URL.
        const source=videoSource(element.props);
        if(source && (videoComponents.has(element.type) || mediaFromSource(source)?.video))return wrapVideo(element);
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
  patchMenuGuards();
  if(!patchFactories())throw Error('React element factories are unavailable');
  if(!patchForward(RN.Image) && !patchFunction(RN.Image))throw Error('No supported Image render hook. Image type: '+typeof RN.Image+'; fields: '+Object.keys(RN.Image || {}).join(', '));
  discoverVideos();
  appStateSubscription=RN.AppState?.addEventListener('change',state=>{if(state!=='active')for(const item of instances)item.clear();});
  notify('Media Gestures: hold two fingers for URL; keep holding 1.5 seconds to download. Reload to attach to existing media.');
  try {delete vendetta.plugin.storage.lastStartupError;}catch(_){}
  } catch(error) {onUnload();startupError(error);throw error;}
}
function onUnload() {
  enabled=false;videoTrace.calls=0;videoTrace.wrapped=0;videoTrace.touches=0;videoTrace.last="Open a full-screen video first";videoDiagnostics.clear();menuGuard=false;pressabilityGuard=false;videoComponents.clear();functionMedia.clear();for(const session of touchSessions){clearTimeout(session.releaseTimer);session.blocked=false;}touchSessions.clear();appStateSubscription?.remove();appStateSubscription=null;videoPatched=false;for(const controller of controllers)controller.abort();for(const unpatch of unpatches.splice(0))unpatch();
  for(const item of instances)item.clear();
}
function settings() {
  return create(RN.ScrollView,{contentContainerStyle:{padding:20}},
    create(RN.Text,{style:{color:'#fff',fontSize:20,fontWeight:'600',marginBottom:16}},'Media Gestures'),
    create(RN.Text,{style:{color:'#b8bbc4',fontSize:14,lineHeight:22}},
      'Two fingers: the URL appears after 0.45 seconds. Lift either finger before 1.5 seconds to only view the URL.\n\nKeep both fingers still for 1.5 seconds total to download once. Both must touch the same media tile. Moving cancels.\n\nUses Discord’s native downloader when available; check Downloads or your gallery. At most two requests at once. The CameraRoll fallback has a 32 MB limit. Storage permission may be required.\n\nImage hook: '+(enabled?'active':'inactive')+'\nInline video hook: '+(videoPatched?'active':'not detected (video thumbnails may still work)')+'\nVideo tiles seen: '+(videoDiagnostics.size?[...videoDiagnostics].map(([type,details])=>type+': '+(details.status || (details.wrapped?'wrapped':'missing layout'))+' ['+details.props+']').join('\n'):'none yet — open a video first')+'\nFull-screen callback calls: '+videoTrace.calls+'\nFull-screen children wrapped: '+videoTrace.wrapped+'\nVideo touch events: '+videoTrace.touches+'\nVideo detail: '+videoTrace.last+'\nContext-menu guard: '+(menuGuard?'active':'not detected')+'\nPressability guard: '+(pressabilityGuard?'active':'not detected')+'\nDiscord downloader: '+(discordDownloader()?'available':'not detected')+'\nFile manager: '+(fileManager()?'available':'not detected')+'\nGallery saving: '+(gallery()?'available':'not detected')+'\nLast download: '+(vendetta.plugin.storage.lastDownloadStatus || 'not started')+'\n\nTarget: Revenge 1.11.6 / Discord 347.12. This is a test build: native media rendering and gestures must be verified on your phone.'));
}
return {onLoad,onUnload,settings};

}catch(error){return {onLoad(){const message=String(error?.message || error);try{vendetta.metro.common.ReactNative.Alert.alert('Media Gestures startup error',message);}catch(_){try{vendetta.ui.alerts.showConfirmationAlert({title:'Media Gestures startup error',content:message,confirmText:'OK',onConfirm:()=>{}});}catch(_){}}throw error;},onUnload(){}};}})()