const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({modern=false,missing=false}={}){
 const shown=[],errors=[],patches=[];let user={id:'100'};
 const alerts={show(...args){shown.push(args);return 'normal prompt';},openLazy(){}};
 const original=alerts.show;
 const native={Alert:{alert:(title,message)=>errors.push({title,message})},Text:'Text',ScrollView:'ScrollView'};
 const users={getCurrentUser:()=>user};
 const vendetta={metro:{common:{i18n:modern?{}:{Messages:{DELETE_MESSAGE:'Delete Message'}},ReactNative:native,React:{createElement:(type,props,...children)=>({type,props:{...props,children}})}},findByProps:(...props)=>missing?null:props[0]==='show'?alerts:props[0]==='getCurrentUser'?users:props[0]==='intl'?{t:{MWMcg7:'delete-title'},intl:{string:key=>key==='delete-title'?'UsuĹ„ wiadomoĹ›Ä‡':null}}:null},logger:{warn(){}},patcher:{instead(key,obj,handler){const orig=obj[key];patches.push(key);obj[key]=function(...args){return handler(args,orig.bind(this));};return()=>obj[key]=orig;}}};
 const bundle=fs.readFileSync(require.resolve('../docs/no-delete-confirmation/index.js'),'utf8');
 const plugin=vm.runInNewContext('(vendetta=>'+bundle+')(vendetta)',{vendetta,console});
 const options=(onConfirm=()=>{},title=modern?'UsuĹ„ wiadomoĹ›Ä‡':'Delete Message',author='100')=>({title,body:'Confirm deletion?',children:{type:'MessagePreview',props:{message:{id:'200',channel_id:'300',author:{id:author}}}},onConfirm});
 return {plugin,alerts,shown,errors,patches,original,options,setUser(value){user=value;},vendetta};
}
test('own-message Delete invokes the exact native callback once without opening a prompt',()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 const options=f.options(function(){assert.equal(this,options);calls++;return 'native deletion';});
 assert.equal(f.alerts.show(options),'native deletion');assert.equal(calls,1);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
test('modern localized title resolves via intl descriptors',()=>{
 const f=fixture({modern:true});f.plugin.onLoad();let calls=0;f.alerts.show(f.options(()=>calls++));assert.equal(calls,1);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
test('unrelated alerts and deleting another userâ€™s message keep the original confirmation',()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 for(const options of [f.options(()=>calls++,'Delete Channel'),{title:'Delete Message',onConfirm:()=>calls++}]){
  assert.equal(f.alerts.show(options,'extra argument'),'normal prompt');
 }
 assert.equal(calls,0);assert.equal(f.shown.length,2);assert.equal(f.shown[0][1],'extra argument');f.plugin.onUnload();
});
test('missing callback keeps the prompt; current-user lookup is not required for native deletion',()=>{
 const f=fixture();f.plugin.onLoad();const options=f.options();options.onConfirm=null;
 assert.equal(f.alerts.show(options),'normal prompt');f.setUser(null);let calls=0;f.alerts.show(f.options(()=>calls++));assert.equal(calls,1);f.plugin.onUnload();
});
test('nested preview children work without inspecting message text',()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;const options=f.options(()=>calls++);
 options.children={props:{children:[null,{props:{children:[options.children]}}]}};
 f.alerts.show(options);assert.equal(calls,1);f.plugin.onUnload();
});
test('promise callbacks are awaited and rejection is reported without repeating deletion',async()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 const result=await f.alerts.show(f.options(()=>{calls++;return Promise.resolve('deleted');}));assert.equal(result,'deleted');
 await f.alerts.show(f.options(()=>{calls++;return Promise.reject(Error('Forbidden'));}));
 assert.equal(calls,2);assert.match(f.errors[0].message,/Forbidden/);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
test('synchronous failure reports the error without opening or retrying the action',()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 f.alerts.show(f.options(()=>{calls++;throw Error('Offline');}));assert.equal(calls,1);assert.match(f.errors[0].message,/Offline/);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
test('unloading restores Discordâ€™s prompt and repeated loading does not stack patches',()=>{
 const f=fixture();f.plugin.onLoad();f.plugin.onLoad();assert.equal(f.patches.length,1);f.plugin.onUnload();assert.equal(f.alerts.show,f.original);
 let calls=0;assert.equal(f.alerts.show(f.options(()=>calls++)),'normal prompt');assert.equal(calls,0);f.plugin.onLoad();f.alerts.show(f.options(()=>calls++));assert.equal(calls,1);f.plugin.onUnload();
});
test('unsupported builds report a startup failure without patching alerts',()=>{
 const f=fixture({missing:true});assert.throws(()=>f.plugin.onLoad(),/hooks were not found/);assert.equal(f.alerts.show,f.original);assert.equal(f.errors.length,1);f.plugin.onUnload();
});

test('moderation deletion invokes the original callback once for another author',()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 const options=f.options(function(){assert.equal(this,options);calls++;return 'moderation deletion';},'Delete Message','999');
 assert.equal(f.alerts.show(options),'moderation deletion');assert.equal(calls,1);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
test('permission failure from Discord is reported without retrying or bypassing it',async()=>{
 const f=fixture();f.plugin.onLoad();let calls=0;
 await f.alerts.show(f.options(()=>{calls++;return Promise.reject(Error('Missing Permissions'));},'Delete Message','999'));
 assert.equal(calls,1);assert.match(f.errors[0].message,/Missing Permissions/);assert.equal(f.shown.length,0);f.plugin.onUnload();
});
