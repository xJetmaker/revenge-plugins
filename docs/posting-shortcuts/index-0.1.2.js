(()=>{const postingCore=(()=>{"use strict";
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
 function replaceTemplates(value,expectedUser=uid()){
  const user=uid();if(!user || user!==expectedUser)throw Error('Account changed; reopen the template editor');
  if(disposed || !active)throw Error('App is not active');
  const template=String(value || '').trim(),a=account(user);
  if(!template || template.length>2000)throw Error('Template must contain 1–2,000 characters');
  if(a.pending)throw Error('Review or wait for the previous send before changing all templates');
  if(!a.shortcuts.length)throw Error('Add a shortcut first');
  const count=a.shortcuts.length;
  commit(user,next=>{next.shortcuts=next.shortcuts.map(item=>({...item,template}));});return count;
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
 return {save,replaceTemplates,remove,verify,press,onMessage,onFailure,clearPending,info,pending,invalidate,setActive,dispose,refresh:emit,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},list:()=>copy(account().shortcuts),history:channelId=>copy(account().history[channelId] || {})};
}
return {isId,messageTime,parseChannel,createPostingController};
})();
"use strict";
const {React,ReactNative:RN}=vendetta.metro.common;
const {createPostingController,parseChannel}=postingCore;
const h=React.createElement.bind(React);
let controller=null,enabled=false,foreground=true,users,channels,guilds,permissions,connection,slow,slowUtils,actions,nonce,http,selected,dispatcher,appState,unregister=null;
const subscriptions=[],requests=new Set();
function toast(message){try{vendetta.ui.toasts.showToast(String(message));}catch(_){}}
function safe(fn){try{return fn();}catch(error){toast(error?.message || error || 'Action failed');}}
function currentUser(){return users?.getCurrentUser();}
function describe(id){const channel=channels?.getChannel(id),guild=guilds?.getGuild(channel?.guild_id || channel?.getGuildId?.());return {channel,guild,title:(guild?.name || 'Server')+' · #'+(channel?.name || id)};}
function gate(channelId,checkConnection=true){
 try{
  if(!enabled || !foreground)return {ok:false,reason:'App is not active'};
  if(checkConnection && (!connection || !connection.isConnected()))return {ok:false,reason:'Discord is disconnected'};
  const channel=channels.getChannel(channelId),P=vendetta.metro.common.constants?.Permissions;
  if(!channel || !(channel.guild_id || channel.getGuildId?.()))return {ok:false,reason:'Choose an accessible server channel'};
  if(![0,5,10,11,12].includes(channel.type))return {ok:false,reason:'Choose a text channel or an existing thread'};
  const sendFlag=[10,11,12].includes(channel.type)?P?.SEND_MESSAGES_IN_THREADS:P?.SEND_MESSAGES;
  if(P?.VIEW_CHANNEL==null || sendFlag==null || !permissions.can(P.VIEW_CHANNEL,channel) || !permissions.can(sendFlag,channel))return {ok:false,reason:'You cannot send in this channel'};
  if(channel.isArchived?.() || channel.threadMetadata?.archived || channel.thread_metadata?.archived)return {ok:false,reason:'Thread is archived; open it in Discord first'};
  const seconds=Number(channel.rateLimitPerUser ?? channel.rate_limit_per_user);
  if(!Number.isFinite(seconds) || seconds<0)return {ok:false,reason:'Slowmode metadata unavailable; open the channel first'};
  const bypass=!!slowUtils?.canBypassSlowmode(channel),nativeMs=Math.max(0,Number(slow?.getSlowmodeCooldownGuess(channelId,0)) || 0);
  return {ok:true,slowSeconds:seconds,bypass,nativeMs};
 }catch(_){return {ok:false,reason:'Availability could not be checked'};}
}
function requestHistory(channelId,before,callback){
 let done=false,form='URL';const request={cancel:()=>finish(Error('History check cancelled'))};requests.add(request);
 const timer=setTimeout(()=>finish(Error('Availability check timed out')),20000);
 function finish(error,value){if(done)return;done=true;clearTimeout(timer);requests.delete(request);callback(error,value);}
 function receive(result){
  if(done || result==null)return;
  try{
   if(result.hasErr){const error=Error(result.err?.message || 'History request failed');error.status=result.status || result.err?.status;error.body=result.body || result.err?.body;if(result.retryAfter && !error.body?.retry_after)error.body={retry_after:Number(result.retryAfter)};finish(error);return;}
   if(typeof result!=='object')return;
   if(result.status && (result.status<200 || result.status>=300)){finish(Object.assign(Error('History HTTP '+result.status),{status:result.status,body:result.body}));return;}
   let messages=result.body;
   if(!Array.isArray(messages)){const text=typeof messages==='string'?messages:result.text;if(typeof text==='string')try{messages=JSON.parse(text);}catch(_){}}
   if(!Array.isArray(messages)){finish(Error('History response unavailable'));return;}
   const stamp=result.headers?.date || result.headers?.Date,serverNow=typeof stamp==='string'?Date.parse(stamp):NaN;
   finish(null,{messages,serverNow});
  }catch(error){finish(error || Error('History check failed'));}
 }
 function watch(result){if(result && typeof result.then==='function')result.then(receive,error=>finish(error || Error('History request failed')));else receive(result);}
 const url='/channels/'+channelId+'/messages',query={limit:100};if(before)query.before=before;
 try{watch(http.get(url+'?limit=100'+(before?'&before='+before:''),receive));}
 catch(error){if(!done && (error==null || error?.name==='TypeError') && !error?.status){form='object';try{watch(http.get({url,query,retries:0,timeout:15000},receive));}catch(error){finish(error || Error('History hook failed ('+form+')'));}}else finish(error || Error('History hook failed'));}
 return request.cancel;
}
function sendNative(channelId,content,messageNonce){
 return actions.sendMessage(channelId,{content,tts:false,invalidEmojis:[],validNonShortcutEmojis:[]},false,{nonce:messageNonce,allowedMentions:{parse:[],users:[],roles:[],replied_user:false}});
}
function openChannel(id){
 const channel=channels.getChannel(id);if(!channel)throw Error('Channel unavailable');
 const route=vendetta.metro.findByProps('transitionToGuild');
 if(typeof route?.transitionToGuild==='function')return route.transitionToGuild(channel.guild_id || channel.getGuildId(),id);
 return vendetta.metro.common.url.openDeeplink('discord://discord.com/channels/'+(channel.guild_id || channel.getGuildId())+'/'+id);
}
function openDashboard(){
 const root=vendetta.metro.findByProps('getRootNavigationRef')?.getRootNavigationRef();
 if(!root?.navigate)throw Error('Open Posting Shortcuts through its plugin settings');
 RN.Keyboard?.dismiss();root.navigate('BUNNY_CUSTOM_PAGE',{title:'Posting Shortcuts',render:Dashboard});
}
const color={bg:'#17181c',card:'#22242b',input:'#1b1d23',line:'#363944',text:'#f3f4f7',muted:'#afb3c2',accent:'#a49aff',green:'#82d6ad',red:'#ffa6a6'};
function text(value,style={}){return h(RN.Text,{style:{color:color.text,fontSize:15,lineHeight:22,...style}},value);}
function button(label,onPress,disabled=false,kind='secondary'){
 return h(RN.Pressable,{onPress,disabled,accessibilityRole:'button',accessibilityLabel:label,style:{paddingVertical:11,paddingHorizontal:15,borderRadius:12,backgroundColor:disabled?'#30323a':kind==='primary'?'#7062cf':color.line,opacity:disabled?0.55:1,marginRight:8,marginTop:8}},text(label,{fontWeight:'600',fontSize:14}));
}
function field(label,value,onChange,props={}){return h(RN.View,{style:{marginTop:14}},text(label,{fontSize:12,color:color.muted,marginBottom:5}),h(RN.TextInput,{value,onChangeText:onChange,placeholderTextColor:'#777d8e',style:{backgroundColor:color.input,borderColor:color.line,borderWidth:1,borderRadius:10,padding:12,color:color.text,fontSize:15,minHeight:44},...props}));}
function duration(ms){const seconds=Math.max(0,Math.ceil(ms/1000)),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);return hours?hours+':'+String(minutes%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):minutes+':'+String(seconds%60).padStart(2,'0');}
function dateLabel(value){if(!value)return 'Never sent through this shortcut';const ago=Math.max(0,Math.floor((Date.now()-value)/60000));return new Date(value).toLocaleString()+' · '+(ago<1?'just now':ago<60?ago+'m ago':Math.floor(ago/60)+'h ago');}
function Dashboard(){
 const checks=React.useRef(0),[,rerender]=React.useState(0),[refreshToken,setRefreshToken]=React.useState(0),[form,setForm]=React.useState(null),[search,setSearch]=React.useState(''),[page,setPage]=React.useState(0),[notice,setNotice]=React.useState('');
 const focused=vendetta.metro.common.NavigationNative?.useIsFocused?.() ?? true;
 const user=currentUser(),userId=user?.id,list=controller?.list() || [],filtered=list.filter(s=>(s.label+' '+describe(s.channelId).title).toLowerCase().includes(search.toLowerCase())),visible=filtered.slice(page*6,page*6+6);
 React.useEffect(()=>{if(!controller)return;return controller.subscribe(()=>rerender(x=>x+1));},[]);
 const ticking=visible.some(item=>controller?.info(item.channelId).kind==='cooldown') || !!controller?.pending();
 React.useEffect(()=>{if(!enabled || !foreground || !focused)return;const timer=setInterval(()=>rerender(x=>x+1),ticking?1000:60000);return()=>clearInterval(timer);},[focused,foreground,ticking]);
 React.useEffect(()=>{setForm(null);setNotice('');setSearch('');setPage(0);},[userId]);
 React.useEffect(()=>{const last=Math.max(0,Math.ceil(filtered.length/6)-1);if(page>last)setPage(last);},[filtered.length,page]);
 const visibleKey=visible.map(s=>s.channelId).join(',');
 React.useEffect(()=>{const generation=++checks.current;let index=0;function next(){if(generation!==checks.current || !enabled || !foreground || !focused || index>=visible.length)return;const item=visible[index++];controller.verify(item.channelId,()=>next());}next();return()=>{checks.current++;};},[visibleKey,userId,focused,foreground,refreshToken]);
 function edit(item){setNotice('');setForm(item?{...item}:{id:null,label:'',channelId:selected?.getChannelId() || '',template:list[list.length-1]?.template || ''});}
 function editAll(){setNotice('');setForm({mode:'all',userId,template:list.length && list.every(item=>item.template===list[0].template)?list[0].template:''});}
 function send(item,repeatApproved=false){safe(()=>controller.press(item.id,{repeatApproved},(error,result)=>{
  if(error){setNotice(error.message || String(error));return;}
  if(result?.needsRepeatConfirmation){RN.Alert.alert('Send this template again?',describe(item.channelId).title+'\n\nThe same template was confirmed here less than 10 minutes ago.',[{text:'Cancel',style:'cancel'},{text:'Send again',onPress:()=>send(item,true)}]);return;}
  if(result?.started)setNotice('');
 }));}
 function review(){const p=controller.pending();if(!p)return;RN.Alert.alert('Review the previous send',p.note || 'No confirmed result yet.',[{text:'Keep locked',style:'cancel'},{text:'Open channel',onPress:()=>safe(()=>openChannel(p.channelId))},{text:'I checked — clear lock',style:'destructive',onPress:()=>safe(()=>{controller.clearPending();setNotice('Lock cleared. Nothing was resent.');})}]);}
 const children=[h(RN.View,{key:'header',style:{marginBottom:20}},text('Posting Shortcuts',{fontSize:27,lineHeight:34,fontWeight:'700'}),text(user?'Sending as '+(user.globalName || user.username || userId):'Sign in to Discord',{color:color.muted,marginTop:5}),text('One tap sends one template to its saved channel.',{fontSize:13,color:color.muted,marginTop:10}),h(RN.View,{style:{flexDirection:'row',flexWrap:'wrap'}},button('Add shortcut',()=>edit(null),!enabled,'primary'),button('Change all templates',editAll,!enabled || !list.length || !!controller?.pending()),button('Refresh status',()=>{checks.current++;controller?.invalidate();setRefreshToken(x=>x+1);},!enabled))),
  notice?text(notice,{color:color.accent,marginBottom:14}):null];
 const pending=controller?.pending();if(pending)children.push(h(RN.View,{key:'pending',style:{backgroundColor:'#342c24',padding:15,borderRadius:14,marginBottom:16}},text(pending.status==='checking'?'Checking before sending…':pending.status==='sending'?'Sending — waiting for confirmation':'Previous attempt needs review',{fontWeight:'600'}),text(describe(pending.channelId).title,{color:color.muted,fontSize:13}),button('Review attempt',review,pending.status==='sending' || pending.status==='checking')));
 if(form?.mode==='all'){
  children.push(h(RN.View,{key:'bulk-editor',style:{backgroundColor:color.card,borderRadius:18,padding:16,marginBottom:18}},text('Change all templates',{fontSize:19,fontWeight:'700'}),
   text('Replace the message in all '+list.length+' shortcuts for this account, including shortcuts on other pages. Names, channels and send history stay the same.',{color:color.muted,fontSize:13,marginTop:8}),
   field('NEW MESSAGE FOR EVERY SHORTCUT',form.template,value=>setForm({...form,template:value}),{multiline:true,maxLength:2000,placeholder:'New message for every shortcut',textAlignVertical:'top',style:{backgroundColor:color.input,borderWidth:1,borderColor:color.line,borderRadius:10,color:color.text,fontSize:15,padding:12,minHeight:130}}),
   text(form.template.length+'/2000',{fontSize:12,color:color.muted,marginTop:6}),
   h(RN.View,{style:{flexDirection:'row',flexWrap:'wrap'}},button('Apply to all shortcuts',()=>safe(()=>{const count=controller.replaceTemplates(form.template,form.userId);setForm(null);setNotice('Updated templates in '+count+' shortcuts.');RN.Keyboard?.dismiss();}),!enabled || !form.template.trim() || !!controller?.pending(),'primary'),button('Cancel',()=>setForm(null)))));
 }else if(form){
  const channelId=parseChannel(form.channelId),destination=channelId?describe(channelId):null;
  children.push(h(RN.View,{key:'editor',style:{backgroundColor:color.card,borderRadius:18,padding:16,marginBottom:18}},text(form.id?'Edit shortcut':'New shortcut',{fontSize:19,fontWeight:'700'}),
   field('NAME',form.label,value=>setForm({...form,label:value}),{maxLength:60,placeholder:'My DM request channel'}),
   field('CHANNEL ID OR SERVER-CHANNEL LINK',form.channelId,value=>setForm({...form,channelId:value}),{autoCapitalize:'none',autoCorrect:false,placeholder:'Paste channel link or ID'}),
   button('Use currently open channel',()=>{const id=selected?.getChannelId();setForm({...form,channelId:id || '',label:form.label || channels?.getChannel(id)?.name || ''});}),
   destination?text(destination.title,{fontSize:13,color:color.accent,marginTop:10}):null,
   field('MESSAGE TEMPLATE',form.template,value=>setForm({...form,template:value}),{multiline:true,maxLength:2000,textAlignVertical:'top',style:{backgroundColor:color.input,borderWidth:1,borderColor:color.line,borderRadius:10,color:color.text,fontSize:15,padding:12,minHeight:130}}),
   text(form.template.length+'/2000 · Mentions will not ping',{fontSize:12,color:color.muted,marginTop:6}),
   h(RN.View,{style:{flexDirection:'row'}},button('Save shortcut',()=>safe(()=>{controller.save(form);setForm(null);setNotice('Shortcut saved on this phone.');RN.Keyboard?.dismiss();}),!enabled,'primary'),button('Cancel',()=>setForm(null)))));
 }
 children.push(field('FIND A SHORTCUT',search,value=>{setSearch(value);setPage(0);},{placeholder:'Server, channel, or shortcut name'}));
 // Hermes eval does not isolate captured for-of bindings; callback parameters own each card.
 visible.forEach(item=>{const status=controller.info(item.channelId),ready=status.kind==='ready',history=controller.history(item.channelId),destination=describe(item.channelId);
  children.push(h(RN.View,{key:item.id,style:{backgroundColor:color.card,borderWidth:1,borderColor:color.line,borderRadius:17,padding:16,marginTop:14}},
   text(item.label,{fontWeight:'700',fontSize:18}),text(destination.title,{fontSize:13,color:color.accent,marginTop:3}),text(item.template,{color:'#d6d8e1',marginTop:12}),
   text(status.kind==='cooldown'?status.reason+' · '+duration(status.until-Date.now())+' left':status.label,{color:ready?color.green:color.muted,fontWeight:'600',marginTop:13}),
   text('Last template: '+dateLabel(history.lastTemplateAt),{fontSize:12,lineHeight:18,color:color.muted,marginTop:5}),
   h(RN.View,{style:{flexDirection:'row',flexWrap:'wrap'}},button(ready?'Send template':status.kind==='unknown'?'Check & send':'Send template',()=>send(item),!enabled || !['ready','unknown'].includes(status.kind),'primary'),button('Open',()=>safe(()=>openChannel(item.channelId))),button('Edit',()=>edit(item),!!pending),button('Remove',()=>safe(()=>{controller.remove(item.id);setNotice('Shortcut removed.');}),!!pending))));
 });
 if(!list.length)children.push(text('Save a channel and a template to get started. You can also open this dashboard with /postingshortcuts.',{color:color.muted,marginTop:20}));
 if(filtered.length>6)children.push(h(RN.View,{key:'pages',style:{flexDirection:'row',alignItems:'center',marginTop:16}},button('Previous',()=>setPage(page-1),page===0),text((page+1)+' / '+Math.ceil(filtered.length/6)),button('Next',()=>setPage(page+1),(page+1)*6>=filtered.length)));
 children.push(text('Saved locally for this account. No scheduled sends or automatic repeats.\nPosting Shortcuts 0.1.2',{fontSize:12,lineHeight:18,color:'#838a9c',marginTop:25,marginBottom:30}));
 return h(RN.ScrollView,{style:{backgroundColor:color.bg,flex:1},contentContainerStyle:{padding:18,paddingBottom:30},keyboardShouldPersistTaps:'handled'},...children);
}
return {
 onLoad(){
  if(enabled)return;
  const metro=vendetta.metro;
  users=metro.findByStoreName?.('UserStore') || metro.findByProps('getCurrentUser');channels=metro.findByStoreName?.('ChannelStore') || metro.findByProps('getChannel','getDMFromUserId') || metro.findByProps('getChannel');guilds=metro.findByStoreName?.('GuildStore') || metro.findByProps('getGuild','getGuilds');permissions=metro.findByStoreName?.('PermissionStore') || metro.findByProps('can','computePermissions');
  connection=metro.findByStoreName?.('GatewayConnectionStore') || metro.findByProps('isConnected','isTryingToConnect','getSocket');slow=metro.findByProps('getSlowmodeCooldownGuess','isChannelOnCooldown');slowUtils=metro.findByProps('canBypassSlowmode','getSlowmodeDescription');
  actions=metro.findByProps('deleteMessage','sendMessage') || metro.findByProps('sendMessage','receiveMessage');nonce=metro.findByProps('createNonce');selected=metro.findByProps('getChannelId','getVoiceChannelId') || metro.findByProps('getChannelId');dispatcher=metro.common.FluxDispatcher;
  const utils=metro.findByProps('HTTP','getAPIBaseURL','setRequestPatch');http=typeof utils?.get==='function'?utils:utils?.HTTP;
  if(!http?.get)http=metro.findByProps('get','post','del') || metro.findByProps('get','post','put','patch','delete');
  const required=[['current account',users?.getCurrentUser],['channels',channels?.getChannel],['permissions',permissions?.can],['gateway connection',connection?.isConnected],['native send',actions?.sendMessage],['message nonce',nonce?.createNonce],['selected channel',selected?.getChannelId],['message events',dispatcher?.subscribe],['history HTTP',http?.get]],missing=required.filter(item=>typeof item[1]!=='function').map(item=>item[0]);
  if(missing.length){const message='Unavailable native hooks: '+missing.join(', ');RN.Alert?.alert('Posting Shortcuts could not start',message);throw Error('Posting Shortcuts: '+message);}
  foreground=!['background','inactive'].includes(RN.AppState?.currentState);enabled=true;
  controller=createPostingController({storage:vendetta.plugin.storage,getUserId:()=>currentUser()?.id,getChannel:id=>channels.getChannel(id),validateChannel:id=>gate(id,false),gate,requestHistory,sendNative,createNonce:()=>nonce.createNonce(),notify:toast});controller.setActive(foreground);
  const handlers={MESSAGE_CREATE:event=>safe(()=>controller.onMessage(event.message || event,!!event.optimistic)),MESSAGE_SEND_FAILED:event=>safe(()=>controller.onFailure(event)),MESSAGE_SEND_FAILED_AUTOMOD:event=>safe(()=>controller.onFailure({channelId:event.messageData?.message?.channelId,messageId:event.messageData?.message?.nonce,reason:event.errorResponseBody?.message || 'Discord blocked the message'})),CHANNEL_UPDATES:()=>controller.invalidate(),CONNECTION_OPEN:()=>controller.invalidate(),CONNECTION_CLOSED:()=>controller.invalidate(),CURRENT_USER_UPDATE:()=>controller.invalidate(),LOGOUT:()=>controller.invalidate(),SLOWMODE_SET_COOLDOWN:()=>controller.refresh(),SLOWMODE_RESET_COOLDOWN:()=>controller.refresh()};
  for(const [type,fn]of Object.entries(handlers)){dispatcher.subscribe(type,fn);subscriptions.push([type,fn]);}
  appState=RN.AppState?.addEventListener('change',state=>{foreground=state==='active';controller.setActive(foreground);});
  try{unregister=vendetta.commands?.registerCommand({name:'postingshortcuts',description:'Open your saved channel templates',options:[],execute(){safe(openDashboard);return undefined;}});}catch(_){toast('Open Posting Shortcuts through plugin settings');}
 },
 onUnload(){enabled=false;const cleanup=[()=>unregister?.(),()=>appState?.remove(),()=>controller?.dispose(),...[...requests].map(request=>()=>request.cancel()),...subscriptions.splice(0).map(([type,fn])=>()=>dispatcher.unsubscribe(type,fn))];for(const stop of cleanup)try{stop();}catch(_){}unregister=null;appState=null;},
 settings:Dashboard
};

})()