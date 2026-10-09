const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({gallery=true}={}) {
 let active=null,seq=0,clock=0;const timers=new Map(),patches=[],toasts=[],requests=[],files=[],saves=[],removes=[];
 const React={createElement:(type,props,...children)=>({type,key:props?.key,props:{...props,children}}),cloneElement:(el,props)=>({...el,props:{...el.props,...props}}),isValidElement:el=>!!el?.props,
  useRef(value){const ref={current:value};active.refs.push(ref);return ref;},useState(value){const index=active.values.length,owner=active;owner.values.push(value);return[value,next=>owner.values[index]=typeof next==='function'?next(owner.values[index]):next];},
  useEffect(fn){active.effects.push(fn);}};
 const camera={saveToCameraRoll:async(uri,options)=>{saves.push({uri,options});return 'content://saved';}};
 const RN={Image:{render:props=>React.createElement('NativeImage',props)},View:'View',Text:'Text',ScrollView:'ScrollView',StyleSheet:{flatten:style=>Array.isArray(style)?Object.assign({},...style):style},NativeModules:{NativeFileModule:{writeFile:async(...args)=>{files.push(args);return '/cache/'+args[1];},removeFile:async(...args)=>removes.push(args)},...(gallery?{RNCCameraRoll:camera}:{})}};
 const vendetta={metro:{common:{React,ReactNative:RN},findByName:()=>null,findByProps:()=>null},ui:{toasts:{showToast:m=>toasts.push(m)}},patcher:{after(name,obj,fn){const original=obj[name];obj[name]=function(...args){return fn(args,original(...args));};patches.push([obj,name,original]);return()=>obj[name]=original;}}};
 const context={vendetta,console,Uint8Array,AbortController,fetch:async url=>{requests.push(url);return{ok:true,status:200,headers:{get:n=>n==='content-type'?'image/png':null},arrayBuffer:async()=>Uint8Array.from([0,1,2,3]).buffer};},
  setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};
 const plugin=vm.runInNewContext('(vendetta=>'+fs.readFileSync(require.resolve('../docs/media-gestures/index.js'),'utf8')+')(vendetta)',context);
 function mount(id,x=0){
  const media=RN.Image.render({source:{uri:`https://media.discordapp.net/attachments/100/${id}/image.png?ex=a&hm=b&width=300`},style:{width:100,height:100,marginTop:4}});
  const owner={refs:[],values:[],effects:[],cleanups:[]};active=owner;const view=media.type(media.props);
  let currentX=x;owner.refs[0].current={measureInWindow:fn=>fn(currentX,0,100,100)};
  for(const effect of owner.effects){const cleanup=effect();if(cleanup)owner.cleanups.push(cleanup);}
  return{view,owner,scrollTo(value){currentX=value;},event(points){return {nativeEvent:{touches:points.map((point,i)=>({identifier:i+1,target:42,pageX:point,pageY:10}))}};}};
 }
 async function tick(ms){clock+=ms;for(let i=0;i<15;i++){for(const[id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}await Promise.resolve();}}
 return {plugin,RN,mount,tick,timers,toasts,requests,files,saves,removes};
}
test('packaged plugin downloads the touched batch item once and cleans up its temporary media',async()=>{
 const f=fixture();f.plugin.onLoad();const a=f.mount(101),b=f.mount(102,200);
 b.view.props.onTouchStart(b.event([210,220,230]));await f.tick(700);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0],'https://cdn.discordapp.com/attachments/100/102/image.png?ex=a&hm=b');
 assert.equal(f.saves.length,1);assert.equal(f.saves[0].options.type,'photo');assert.equal(f.files[0][3],'base64');assert.equal(f.removes.length,1);
 b.view.props.onTouchMove(b.event([210,220,230]));await f.tick(700);assert.equal(f.requests.length,1);
 f.plugin.onUnload();assert.equal(f.timers.size,0);assert.equal(b.owner.values[0],false);
});
test('packaged tooltip has no copy action, remeasures after scrolling and hides on release',async()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);tile.scrollTo(200);
 tile.view.props.onTouchStart(tile.event([210,220]));await f.tick(450);assert.equal(tile.owner.values[0],true);assert.equal(f.requests.length,0);
 tile.view.props.onTouchEnd(tile.event([]));assert.equal(tile.owner.values[0],false);f.plugin.onUnload();
});
test('missing native gallery support gives an error without fetching or falsely reporting a save',async()=>{
 const f=fixture({gallery:false});f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20,30]));await f.tick(700);assert.equal(f.requests.length,0);assert.equal(f.saves.length,0);
 assert.ok(f.toasts.some(m=>m.includes('unavailable')));f.plugin.onUnload();
});
test('neighbouring tiles are never substituted and disabling cancels pending gestures',async()=>{
 const f=fixture();f.plugin.onLoad();const tile=f.mount(101);
 tile.view.props.onTouchStart(tile.event([10,20,130]));await f.tick(700);assert.equal(f.requests.length,0);
 tile.view.props.onTouchEnd(tile.event([]));tile.view.props.onTouchStart(tile.event([10,20,30]));f.plugin.onUnload();await f.tick(700);assert.equal(f.requests.length,0);
});
