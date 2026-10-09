const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({gallery=true,memo=false,unsupported=false,brokenToast=false,functionImage=false,nativeDownload=false,nativeResult=true,nativeFailure=false,nativeVoid=false,videoShape=null,nativeGestures=false}={}) {
 let active=null,seq=0,clock=0;const timers=new Map(),patches=[],toasts=[],requests=[],files=[],saves=[],removes=[],alerts=[],nativeCalls=[];
 let nestedContext=false;
 const React={createContext:value=>({Provider:"MediaProvider",value}),useContext:()=>nestedContext,createElement:(type,props,...children)=>({type,key:props?.key,props:{...props,children}}),cloneElement:(el,props)=>({...el,props:{...el.props,...props}}),isValidElement:el=>!!el?.props,
  useRef(value){const ref={current:value};active.refs.push(ref);return ref;},useState(value){const index=active.values.length,owner=active;owner.values.push(value);return[value,next=>owner.values[index]=typeof next==='function'?next(owner.values[index]):next];},
  useEffect(fn){active.effects.push(fn);}};
 const camera={saveToCameraRoll:async(uri,options)=>{saves.push({uri,options});return 'content://saved';}};
 const RN={Image:{render:props=>React.createElement('NativeImage',props)},Alert:{alert:(title,message)=>alerts.push({title,message})},View:'View',Text:'Text',ScrollView:'ScrollView',StyleSheet:{flatten:style=>Array.isArray(style)?Object.assign({},...style):style},NativeModules:{NativeFileModule:{writeFile:async(...args)=>{files.push(args);return '/cache/'+args[1];},removeFile:async(...args)=>removes.push(args)},...(gallery?{RNCCameraRoll:camera}:{})}};
 if(nativeDownload)RN.NativeModules.MediaManager={downloadMediaAsset(url,gif){nativeCalls.push({url,gif});if(nativeVoid)return;return nativeFailure?Promise.reject(Error('Storage permission denied')):Promise.resolve(nativeResult);}};
 const jsxRuntime={jsx:(type,props,key)=>({type,key,props}),jsxs:(type,props,key)=>({type,key,props})};
 if(functionImage)RN.Image=Object.assign(function Image(props){return React.createElement('NativeImage',props);},{displayName:'Image',getSize(){},getSizeWithHeaders(){},prefetch(){},prefetchWithMetadata(){},abortPrefetch(){},queryCache(){},resolveAssetSource(){}});
 if(memo)RN.Image={type:RN.Image};if(unsupported)RN.Image={};
 class Video {render(){return React.createElement('NativeVideo',this.props);}}
 const video=videoShape==='class'?Video:videoShape==='memo'?{type:function VideoComponent(){}}:videoShape==='forward'?{render:props=>React.createElement('NativeVideo',props)}:videoShape==='function'?function VideoComponent(){}:null;
 const sheets={opened:[],openLazy(...args){this.opened.push(args);return 'opened';},hideActionSheet(){}};
 class Pressability {_handleLongPress(event){this.calls=(this.calls || 0)+1;this.event=event;return 'long press';}}
 class ManualGesture {
  constructor(){this.handlers={};}runOnJS(value){this.js=value;return this;}
  onTouchesDown(fn){this.handlers.down=fn;return this;}onTouchesMove(fn){this.handlers.move=fn;return this;}onTouchesUp(fn){this.handlers.up=fn;return this;}onTouchesCancelled(fn){this.handlers.cancel=fn;return this;}onFinalize(fn){this.handlers.finalize=fn;return this;}
 }
 const gestureBuilder={Manual:()=>new ManualGesture()},gestureDetector=function GestureDetector(){};
 const vendetta={plugin:{storage:{}},logger:{warn(){}},metro:{common:{React,ReactNative:RN},findByName:(name,defaultExp=true)=>name==='Pressability'?Pressability:name==='Video'?(defaultExp?video:{default:video}):null,findByProps:(...props)=>props.includes('hideActionSheet')?sheets:nativeGestures && props[0]==='Gesture'?{Gesture:gestureBuilder}:nativeGestures && props[0]==='GestureDetector'?{GestureDetector:gestureDetector}:null,findByPropsAll:()=>[jsxRuntime]},ui:{toasts:{showToast:m=>{if(brokenToast)throw Error("toast unavailable");toasts.push(m);}}},patcher:{instead(name,obj,fn){const original=obj[name];obj[name]=function(...args){return fn(args,original.bind(this));};return()=>obj[name]=original;},after(name,obj,fn){const original=obj[name];obj[name]=function(...args){return fn(args,original(...args));};patches.push([obj,name,original]);return()=>obj[name]=original;}}};
 const context={vendetta,console,Uint8Array,AbortController,fetch:async url=>{requests.push(url);return{ok:true,status:200,headers:{get:n=>n==='content-type'?'image/png':null},arrayBuffer:async()=>Uint8Array.from([0,1,2,3]).buffer};},
  setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};
 const plugin=vm.runInNewContext('(vendetta=>'+fs.readFileSync(require.resolve('../docs/media-gestures/index.js'),'utf8')+')(vendetta)',context);
 function mount(id,x=0,jsx=false,extension="png"){
  const props={source:{uri:`https://media.discordapp.net/attachments/100/${id}/image.${extension}?ex=a&hm=b&width=300`},style:{width:100,height:100,marginTop:4}};
  const media=functionImage?(jsx?jsxRuntime.jsx(RN.Image,props):React.createElement(RN.Image,props)):(RN.Image.type || RN.Image).render(props);
  const owner={refs:[],values:[],effects:[],cleanups:[]};active=owner;const rendered=media.type(media.props),view=rendered.type==="MediaProvider"?rendered.props.children[0]:rendered;
  let currentX=x;owner.refs[0].current={measureInWindow:fn=>fn(currentX,0,100,100)};
  for(const effect of owner.effects){const cleanup=effect();if(cleanup)owner.cleanups.push(cleanup);}
  return{view,owner,scrollTo(value){currentX=value;},event(points){return {nativeEvent:{touches:points.map((point,i)=>({identifier:i+1,target:42,pageX:point,pageY:10}))}};}};
 }
 async function tick(ms){clock+=ms;for(let i=0;i<15;i++){for(const[id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}await Promise.resolve();}}
 function mountWrapped(element,x=0){
  const owner={refs:[],values:[],effects:[],cleanups:[]};active=owner;
  const rendered=element.type(element.props),child=rendered.props.children[0],view=child.type===gestureDetector?child.props.children[0]:child;
  owner.refs[0].current={measureInWindow:fn=>fn(x,0,100,100)};
  for(const effect of owner.effects){const cleanup=effect();if(cleanup)owner.cleanups.push(cleanup);}
  return {view,owner,nativeGesture:child.type===gestureDetector?child.props.gesture:null,event:points=>({nativeEvent:{touches:points.map((pageX,i)=>({identifier:i+1,target:42,pageX,pageY:10}))}})};
 }
 return {plugin,RN,video,mountWrapped,renderNested(element){nestedContext=true;active={refs:[],values:[],effects:[]};try{return element.type(element.props);}finally{nestedContext=false;}},mountVideo(props,x=0,type=video){const element=React.createElement(type,props),owner={refs:[],values:[],effects:[],cleanups:[]};active=owner;const rendered=element.type(element.props),child=rendered.props.children[0],view=child.type===gestureDetector?child.props.children[0]:child;owner.refs[0].current={measureInWindow:fn=>fn(x,0,100,100)};for(const effect of owner.effects)effect();return {view,owner,nativeGesture:child.type===gestureDetector?child.props.gesture:null,event:points=>({nativeEvent:{touches:points.map((pageX,i)=>({identifier:i+1,target:42,pageX,pageY:10}))}})};},sheets,Pressability,storage:vendetta.plugin.storage,React,jsxRuntime,mount,tick,timers,nativeCalls,toasts,requests,files,saves,removes,alerts};
}
test('packaged plugin downloads the touched batch item once and cleans up its temporary media',async()=>{
 const f=fixture();f.plugin.onLoad();const a=f.mount(101),b=f.mount(102,200);
 b.view.props.onTouchStart(b.event([210,220]));await f.tick(1500);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0],'https://cdn.discordapp.com/attachments/100/102/image.png?ex=a&hm=b');
 assert.equal(f.saves.length,1);assert.equal(f.saves[0].options.type,'photo');assert.equal(f.files[0][3],'base64');assert.equal(f.removes.length,1);
 b.view.props.onTouchMove(b.event([210,220]));await f.tick(1500);assert.equal(f.requests.length,1);
 f.plugin.onUnload();assert.equal(f.timers.size,0);assert.equal(b.owner.values[0],false);
});
test('packaged tooltip has no copy action, remeasures after scrolling and hides on release',async()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);tile.scrollTo(200);
 tile.view.props.onTouchStart(tile.event([210,220]));await f.tick(450);assert.equal(tile.owner.values[0],true);assert.equal(f.requests.length,0);
 tile.view.props.onTouchEnd(tile.event([]));assert.equal(tile.owner.values[0],false);f.plugin.onUnload();
});
test('missing native gallery support gives an error without fetching or falsely reporting a save',async()=>{
 const f=fixture({gallery:false});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20]));await f.tick(1500);assert.equal(f.requests.length,0);assert.equal(f.saves.length,0);
 assert.ok(f.toasts.some(m=>m.includes('unavailable')));f.plugin.onUnload();
});
test('neighbouring tiles are never substituted and disabling cancels pending gestures',async()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,130]));await f.tick(1500);assert.equal(f.requests.length,0);
 tile.view.props.onTouchEnd(tile.event([]));tile.view.props.onTouchStart(tile.event([10,20]));f.plugin.onUnload();await f.tick(1500);assert.equal(f.requests.length,0);
});

test('memo-wrapped Image supports startup and media gestures',async()=>{
 const f=fixture({memo:true});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20]));await f.tick(450);assert.equal(tile.owner.values[0],true);f.plugin.onUnload();
});
test('unsupported Image displays an actionable startup error and cleans up',()=>{
 const f=fixture({unsupported:true});assert.throws(()=>f.plugin.onLoad(),/No supported Image render hook/);
 assert.equal(f.alerts.length,1);assert.match(f.alerts[0].message,/Image type/);assert.equal(f.timers.size,0);
});
test('toast failure does not disable otherwise working media gestures',async()=>{
 const f=fixture({brokenToast:true});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20]));await f.tick(450);assert.equal(tile.owner.values[0],true);f.plugin.onUnload();
});

test('function Image supports both React and JSX factories without changing its identity',async()=>{
 const f=fixture({functionImage:true}),image=f.RN.Image,originalCreate=f.React.createElement,originalJsx=f.jsxRuntime.jsx;
 f.plugin.onLoad();assert.equal(f.RN.Image,image);assert.equal(typeof image.prefetch,'function');
 for(const jsx of [false,true]) {
  const tile=f.mount(102,200,jsx);
  assert.equal(tile.view.props.children[0].type,image);
  tile.view.props.onTouchStart(tile.event([210,220]));await f.tick(1500);
  assert.equal(f.requests.at(-1),'https://cdn.discordapp.com/attachments/100/102/image.png?ex=a&hm=b');
 }
 const props={source:{uri:'https://cdn.discordapp.com/avatars/100/a.png'},style:{width:100,height:100}};
 assert.equal(f.React.createElement(image,props).type,image);
 assert.equal(f.jsxRuntime.jsxs('Other',props).type,'Other');
 const ref={current:null},attachment={source:{uri:'https://cdn.discordapp.com/attachments/100/101/a.png'},style:{width:100,height:100},ref};
 const wrapped=f.React.createElement(image,attachment);
 assert.equal(wrapped.props.element.props.ref,ref);
 assert.equal(f.React.createElement(wrapped.type,wrapped.props).type,wrapped.type);
 f.plugin.onUnload();assert.equal(f.React.createElement,originalCreate);assert.equal(f.jsxRuntime.jsx,originalJsx);
 assert.equal(f.React.createElement(image,attachment).type,image);
});

test('one-finger menu works, multi-finger holds suppress stale ancestor long presses until release',async()=>{
 const f=fixture({functionImage:true});f.plugin.onLoad();let menus=0;
 const parent=f.jsxRuntime.jsx('Pressable',{onLongPress(){menus++;return 'menu';}});
 const tile=f.mount(101),single=tile.event([10]);
 tile.view.props.onTouchStart(single);
 assert.equal(parent.props.onLongPress(single),'menu');assert.equal(menus,1);
 tile.view.props.onTouchStart(tile.event([10,20]));
 parent.props.onLongPress(single);assert.equal(menus,1);
 await f.tick(450);assert.equal(tile.owner.values[0],true);
 tile.view.props.onTouchEnd(tile.event([10]));parent.props.onLongPress(single);assert.equal(menus,1);
 tile.view.props.onTouchEnd(tile.event([]));parent.props.onLongPress(single);assert.equal(menus,1);
 await f.tick(0);parent.props.onLongPress(single);assert.equal(menus,2);
 tile.view.props.onTouchStart(tile.event([10,20]));parent.props.onLongPress(single);assert.equal(menus,2);
 await f.tick(1500);assert.equal(f.requests.length,1);
 f.plugin.onUnload();parent.props.onLongPress(single);assert.equal(menus,3);
});
test('menu suppression stays within the touched media and honors multi-touch callback events',()=>{
 const f=fixture();f.plugin.onLoad();let menus=0;
 const parent=f.React.createElement('Pressable',{onLongPress(){menus++;}}),tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20]));
 parent.props.onLongPress({nativeEvent:{target:99,pageX:210,pageY:10,touches:[{target:99,pageX:210,pageY:10}]}});
 assert.equal(menus,1);
 parent.props.onLongPress({nativeEvent:{touches:[{},{}]}});assert.equal(menus,1);
 f.plugin.onUnload();
});

test('longer two-finger hold continues past URL display and downloads once with visible feedback',async()=>{
 const f=fixture({functionImage:true});f.plugin.onLoad();const tile=f.mount(102,200);
 tile.view.props.onResponderGrant(tile.event([210,220]));await f.tick(450);
 assert.equal(tile.owner.values[0],true);
 tile.view.props.onResponderStart(tile.event([210,220]));
 assert.equal(tile.owner.values[0],true);assert.match(tile.owner.values[2],/Keep holding/);
 await f.tick(1500);assert.equal(f.requests.length,1);assert.equal(f.saves.length,1);
 assert.equal(f.storage.lastDownloadStatus,'Saved media to your gallery');
 assert.equal(tile.owner.values[2],'Saved media to your gallery');
 tile.view.props.onResponderEnd(tile.event([210,220]));await f.tick(1500);assert.equal(f.requests.length,1);
 tile.view.props.onResponderEnd(tile.event([]));assert.equal(tile.owner.values[2],null);
 f.plugin.onUnload();
});
test('download cancellation explains why no download starts, while neighbours stay untouched',async()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onResponderStart(tile.event([10,130]));await f.tick(1500);
 assert.match(tile.owner.values[2],/inside the same media tile/);assert.equal(f.requests.length,0);
 f.plugin.onUnload();
});
test('missing gallery support is visible even when toasts are broken',async()=>{
 const f=fixture({gallery:false,brokenToast:true});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
 assert.equal(f.alerts.length,1);assert.match(f.alerts[0].message,/Gallery saving is unavailable/);
 assert.match(tile.owner.values[2],/Gallery saving is unavailable/);
 assert.equal(f.requests.length,0);assert.equal(f.storage.lastDownloadStatus,f.alerts[0].message);
 f.plugin.onUnload();
});

test('action-sheet entry point cannot interrupt an owned two-finger hold, even with no event',async()=>{
 const f=fixture({functionImage:true}),original=f.sheets.openLazy;
 f.plugin.onLoad();const tile=f.mount(102,200);
 assert.equal(f.sheets.openLazy('normal','message-menu',{}),'opened');
 tile.view.props.onResponderStart(tile.event([210,220]));
 assert.equal(f.sheets.openLazy('lazy','message-menu',{}),undefined);
 assert.equal(f.sheets.opened.length,1);
 await f.tick(1500);assert.equal(f.saves.length,1);
 tile.view.props.onResponderEnd(tile.event([210,220]));
 f.sheets.openLazy('lazy','message-menu',{});assert.equal(f.sheets.opened.length,1);
 tile.view.props.onResponderEnd(tile.event([]));await f.tick(0);
 assert.equal(f.sheets.openLazy('normal','message-menu',{}),'opened');
 assert.equal(f.sheets.opened.length,2);
 f.plugin.onUnload();assert.equal(f.sheets.openLazy,original);
});
test('pre-existing Pressability instances retain single-finger long presses but block media holds',async()=>{
 const f=fixture(),pressable=new f.Pressability(),original=f.Pressability.prototype._handleLongPress;
 f.plugin.onLoad();const tile=f.mount(101),event=tile.event([10]);
 assert.equal(pressable._handleLongPress(event),'long press');assert.equal(pressable.calls,1);
 tile.view.props.onResponderStart(tile.event([10,20]));
 assert.equal(pressable._handleLongPress(event),undefined);
 assert.equal(pressable._handleLongPress(),undefined);assert.equal(pressable.calls,1);
 await f.tick(1500);assert.equal(f.saves.length,1);
 f.plugin.onUnload();assert.equal(f.Pressability.prototype._handleLongPress,original);
 assert.equal(pressable._handleLongPress(event),'long press');assert.equal(pressable.calls,2);
});
test('touches split between tiles do not globally block action sheets',()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onResponderStart(tile.event([10,130]));
 assert.equal(f.sheets.openLazy('normal','message-menu',{}),'opened');
 assert.equal(f.sheets.opened.length,1);f.plugin.onUnload();
});

test('Discord native downloader saves selected batch media without CameraRoll, fetch or base64 copies',async()=>{
 const f=fixture({gallery:false,nativeDownload:true});f.plugin.onLoad();const tile=f.mount(102,200);
 tile.view.props.onResponderStart(tile.event([210,220]));await f.tick(450);assert.equal(f.nativeCalls.length,0);
 await f.tick(1050);assert.equal(f.nativeCalls.length,1);
 assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/102/image.png?ex=a&hm=b');assert.equal(f.nativeCalls[0].gif,0);
 assert.equal(f.requests.length,0);assert.equal(f.files.length,0);assert.equal(f.storage.lastDownloadStatus,'Media saved by Discord');
 tile.view.props.onResponderMove(tile.event([210,220]));await f.tick(1500);assert.equal(f.nativeCalls.length,1);f.plugin.onUnload();
});
test('GIF uses Discord GIF flag; video keeps flag zero and original video URL',async()=>{
 for(const [extension,flag] of [['gif',1],['mp4',0]]) {
  const f=fixture({gallery:false,nativeDownload:true});f.plugin.onLoad();const tile=f.mount(102,0,false,extension);
  tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
  assert.equal(f.nativeCalls[0].gif,flag);assert.match(f.nativeCalls[0].url,new RegExp('image\\.'+extension));f.plugin.onUnload();
 }
});
test('Discord download rejection or false result reports failure rather than claiming success',async()=>{
 for(const options of [{nativeFailure:true},{nativeResult:false}]) {
  const f=fixture({gallery:false,nativeDownload:true,...options});f.plugin.onLoad();const tile=f.mount(101);
  tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
  assert.match(f.storage.lastDownloadStatus,/Download failed/);assert.equal(f.alerts.length,1);
  assert.equal(f.requests.length,0);f.plugin.onUnload();
 }
});
test('void native bridge reports a handoff without claiming a confirmed save',async()=>{
 const f=fixture({gallery:false,nativeDownload:true,nativeVoid:true});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
 assert.match(f.storage.lastDownloadStatus,/handed to Discord/);assert.equal(f.alerts.length,0);f.plugin.onUnload();
});

test('class-based video tiles use src.videoURI and separate dimensions, preserving controls and refs',async()=>{
 const f=fixture({videoShape:'class',nativeDownload:true,gallery:false});f.plugin.onLoad();const ref={current:null},onPress=()=>{},onLoad=()=>{};
 const uri='https://media.discordapp.net/attachments/100/202/movie.mp4?ex=a&hm=b&format=jpeg&width=100';
 const tile=f.mountVideo({src:{uri:'https://cdn.discordapp.com/attachments/100/202/poster.jpg',videoURI:uri},width:100,height:100,paused:true,ref,onPress,onLoad},200);
 const clone=tile.view.props.children[0];assert.equal(clone.type,f.video);assert.equal(clone.props.ref,ref);assert.equal(clone.props.onPress,onPress);assert.equal(clone.props.onLoad,onLoad);assert.equal(clone.props.paused,true);
 tile.view.props.onResponderStart(tile.event([210,220]));await f.tick(450);assert.equal(tile.owner.values[0],true);await f.tick(1050);
 assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/202/movie.mp4?ex=a&hm=b');assert.equal(f.nativeCalls.length,1);f.plugin.onUnload();
});
test('function, memo and forward-ref video components are intercepted without calling them outside React',async()=>{
 for(const videoShape of ['function','memo','forward']) {
  const f=fixture({videoShape,nativeDownload:true});f.plugin.onLoad();const tile=f.mountVideo({source:{uri:'https://cdn.discordapp.com/attachments/100/203/a.webm'},style:{width:100,height:100}});
  tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/203/a.webm');f.plugin.onUnload();
 }
});
test('video poster-only and external sources are skipped, and nested media wrappers cannot duplicate downloads',()=>{
 const f=fixture({videoShape:'class',functionImage:true});f.plugin.onLoad();
 for(const src of [{uri:'https://cdn.discordapp.com/attachments/100/202/poster.jpg'},{videoURI:'https://example.com/a.mp4',uri:'https://cdn.discordapp.com/attachments/100/202/poster.jpg'}])assert.equal(f.React.createElement(f.video,{src,width:100,height:100}).type,f.video);
 const original=f.React.createElement(f.RN.Image,{source:{uri:'https://cdn.discordapp.com/attachments/100/202/a.mp4'},style:{width:100,height:100}});
 assert.equal(f.renderNested(original),original.props.element);f.plugin.onUnload();
});

test('full-screen video with anonymous memo export and absolute-fill layout uses its own original URL',async()=>{
 const f=fixture({nativeDownload:true}),fullscreen={type:function FullscreenMedia(){}};f.plugin.onLoad();
 const source={uri:'https://cdn.discordapp.com/attachments/100/302/poster.jpg',videoURI:'https://media.discordapp.net/attachments/100/302/movie.mp4?ex=a&hm=b&format=jpeg'};
 const tile=f.mountVideo({source,style:{position:'absolute',top:0,left:0,right:0,bottom:0},paused:false},200,fullscreen);
 assert.equal(tile.view.props.children[0].type,fullscreen);
 const event=tile.event([210,220]);event.nativeEvent.touches[1].target=43;
 tile.view.props.onLayout();assert.equal(tile.view.props.onStartShouldSetResponderCapture(event),true);
 assert.equal(tile.view.props.onResponderGrant(event),true);
 await f.tick(450);assert.equal(tile.owner.values[0],true);await f.tick(1050);
 assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/302/movie.mp4?ex=a&hm=b');assert.equal(f.nativeCalls.length,1);
 f.plugin.onUnload();
});
test('unknown video renderers with direct per-tile sources are covered without widening batch hitboxes',async()=>{
 const f=fixture({nativeDownload:true});f.plugin.onLoad();function UnnamedVideo(){}
 const tile=f.mountVideo({source:{uri:'https://cdn.discordapp.com/attachments/100/303/b.mp4'},style:{width:100,height:100}},200,UnnamedVideo);
 tile.view.props.onLayout();assert.equal(tile.view.props.onStartShouldSetResponderCapture(tile.event([210,310])),false);
 tile.view.props.onResponderStart(tile.event([210,310]));await f.tick(1500);assert.equal(f.nativeCalls.length,0);f.plugin.onUnload();
});

test('full-screen presenter wraps renderMedia inside its actual sized child even with cached JSX factory',async()=>{
 const f=fixture({nativeDownload:true}),cachedJSX=f.jsxRuntime.jsx;f.plugin.onLoad();
 function MediaViewerItemPresenter(){}
 const source={uri:'https://cdn.discordapp.com/attachments/100/402/poster.jpg',videoURI:'https://media.discordapp.net/attachments/100/402/movie.mp4?ex=a&hm=b'};
 const callback=function(props){assert.equal(this.tag,'receiver');return cachedJSX('ActualVideoRenderer',{source:props.source,paused:false});};
 const presenter=f.React.createElement(MediaViewerItemPresenter,{source,renderMedia:callback,windowWidth:400,windowHeight:800});
 assert.equal(presenter.type,MediaViewerItemPresenter);assert.notEqual(presenter.props.renderMedia,callback);assert.equal(presenter.props.style,undefined);
 const media=presenter.props.renderMedia.call({tag:'receiver'},{source,style:{position:'absolute',width:'100%',height:'100%'}});
 assert.notEqual(media.type,'ActualVideoRenderer');assert.equal(media.props.element.props.paused,false);
 const rendered=f.renderNested(media);assert.equal(rendered,media.props.element);
 const tile=f.mountWrapped(media);
 tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
 assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/402/movie.mp4?ex=a&hm=b');f.plugin.onUnload();
 const after=presenter.props.renderMedia.call({tag:'receiver'},{source,style:{width:'100%',height:'100%'}});assert.equal(after.type,'ActualVideoRenderer');
});
test('presenter callback uses each rendered tile source and does not pick from whole batch arrays',()=>{
 const f=fixture(),cached=f.jsxRuntime.jsx;f.plugin.onLoad();function MediaViewerItemPresenter(){}
 const callback=props=>cached('VideoRenderer',{source:props.source});
 const presenter=f.React.createElement(MediaViewerItemPresenter,{source:[],renderMedia:callback,windowWidth:400,windowHeight:800});
 for(const id of [501,502]) {
  const source={videoURI:`https://cdn.discordapp.com/attachments/100/${id}/movie.mp4`};
  const result=presenter.props.renderMedia({source,style:{width:'100%',height:'100%'}});
  assert.equal(result.props.media.key,`attachments/100/${id}/movie.mp4`);
 }
 const props={source:[{uri:'https://cdn.discordapp.com/attachments/100/501/movie.mp4'},{uri:'https://cdn.discordapp.com/attachments/100/502/movie.mp4'}],style:{width:'100%',height:'100%'}};
 assert.equal(presenter.props.renderMedia(props).type,'VideoRenderer');f.plugin.onUnload();
});

test('presenter callback layout and video URL override empty style and poster metadata only for gestures',async()=>{
 const f=fixture({nativeDownload:true}),cached=f.jsxRuntime.jsx;f.plugin.onLoad();function MediaViewerItemPresenter(){}
 const poster={uri:'https://cdn.discordapp.com/attachments/100/602/poster.jpg'};
 const callback=()=>cached('VideoRenderer',{source:poster,style:{},paused:false});
 const presenter=f.React.createElement(MediaViewerItemPresenter,{source:{},renderMedia:callback});
 const media=presenter.props.renderMedia({source:{videoURI:'https://cdn.discordapp.com/attachments/100/602/movie.mp4'},style:{width:'100%',height:'100%'}});
 assert.equal(media.props.media.url,'https://cdn.discordapp.com/attachments/100/602/movie.mp4');
 assert.equal(media.props.element.props.source,poster);assert.deepEqual(media.props.element.props.style,{});
 const tile=f.mountWrapped(media);tile.view.props.onResponderStart(tile.event([10,20]));await f.tick(1500);
 assert.equal(f.nativeCalls.length,1);assert.equal(f.nativeCalls[0].url,media.props.media.url);f.plugin.onUnload();
});

test('native video gestures work with zero ordinary React touch events and preserve single-finger input',async()=>{
 const f=fixture({nativeGestures:true,nativeDownload:true}),cached=f.jsxRuntime.jsx;f.plugin.onLoad();function MediaViewerItemPresenter(){}
 const source={videoURI:'https://cdn.discordapp.com/attachments/100/702/movie.mp4'};
 const presenter=f.React.createElement(MediaViewerItemPresenter,{source,renderMedia:props=>cached('Player',{source:props.source})});
 const media=presenter.props.renderMedia({source,style:{width:'100%',height:'100%'}}),tile=f.mountWrapped(media);
 assert.ok(tile.nativeGesture);assert.equal(tile.nativeGesture.js,true);
 let begins=0,activations=0,ends=0;const manager={begin(){begins++;},activate(){activations++;},end(){ends++;},fail(){}};
 const point=id=>({id,absoluteX:10*id,absoluteY:10});
 tile.nativeGesture.handlers.down({allTouches:[point(1)],changedTouches:[point(1)]},manager);await f.tick(450);
 assert.equal(activations,0);assert.equal(tile.owner.values[0],false);assert.equal(f.nativeCalls.length,0);
 tile.nativeGesture.handlers.down({allTouches:[point(1),point(2)],changedTouches:[point(2)]},manager);
 await f.tick(450);assert.equal(tile.owner.values[0],true);assert.ok(activations>0);
 await f.tick(1050);assert.equal(f.nativeCalls.length,1);assert.equal(f.nativeCalls[0].url,'https://cdn.discordapp.com/attachments/100/702/movie.mp4');
 tile.nativeGesture.handlers.up({allTouches:[point(1),point(2)],changedTouches:[point(2)]},manager);
 tile.nativeGesture.handlers.up({allTouches:[point(1)],changedTouches:[point(1)]},manager);
 assert.equal(ends,1);assert.equal(begins,1);f.plugin.onUnload();assert.equal(f.timers.size,0);
});
test('native video input rejects cross-tile touches and cancels when a finger lifts early',async()=>{
 const f=fixture({nativeGestures:true,nativeDownload:true});f.plugin.onLoad();
 const media=f.React.createElement('VideoPlayer',{source:{uri:'https://cdn.discordapp.com/attachments/100/703/a.mp4'},style:{width:100,height:100}}),tile=f.mountWrapped(media);
 let failures=0;const manager={begin(){},activate(){},end(){},fail(){failures++;}};
 tile.nativeGesture.handlers.down({allTouches:[{id:1,absoluteX:10,absoluteY:10},{id:2,absoluteX:110,absoluteY:10}]},manager);
 await f.tick(1500);assert.equal(f.nativeCalls.length,0);assert.equal(failures,1);
 tile.nativeGesture.handlers.cancel();
 const allTouches=[{id:1,absoluteX:10,absoluteY:10},{id:2,absoluteX:20,absoluteY:10}];
 tile.nativeGesture.handlers.down({allTouches},manager);await f.tick(450);
 tile.nativeGesture.handlers.up({allTouches,changedTouches:[allTouches[1]]},manager);await f.tick(1500);
 assert.equal(f.nativeCalls.length,0);f.plugin.onUnload();
});
