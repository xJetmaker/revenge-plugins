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
function canReplace(channelId){
 try{const channel=channels?.getChannel(channelId),flag=vendetta.metro.common.constants?.Permissions?.READ_MESSAGE_HISTORY;
 return typeof actions?.deleteMessage==='function' && !!channel && flag!=null && !!permissions?.can(flag,channel);}catch(_){return false;}
}
function deleteNative(channelId,messageId){return actions.deleteMessage(channelId,messageId,false);}
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
 const pending=controller?.pending();if(pending)children.push(h(RN.View,{key:'pending',style:{backgroundColor:'#342c24',padding:15,borderRadius:14,marginBottom:16}},text(pending.status==='checking'?'Checking before sending…':pending.status==='sending'?'Sending — waiting for confirmation':pending.status==='deleting'?'New message sent — deleting previous message':'Previous attempt needs review',{fontWeight:'600'}),text(describe(pending.channelId).title,{color:color.muted,fontSize:13}),button('Review attempt',review,pending.status!=='uncertain')));
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
   h(RN.View,{style:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16}},text('Replace my last message',{fontWeight:'600'}),h(RN.Switch,{value:!!form.replaceLast,onValueChange:value=>setForm({...form,replaceLast:value}),disabled:!enabled,accessibilityLabel:'Replace my last message',trackColor:{false:color.line,true:'#7062cf'}})),
   text('After the new message is confirmed, delete your latest previous message in this channel, including one sent manually.',{fontSize:12,lineHeight:18,color:color.muted,marginTop:4}),
   h(RN.View,{style:{flexDirection:'row'}},button('Save shortcut',()=>safe(()=>{controller.save(form);setForm(null);setNotice('Shortcut saved on this phone.');RN.Keyboard?.dismiss();}),!enabled,'primary'),button('Cancel',()=>setForm(null)))));
 }
 children.push(field('FIND A SHORTCUT',search,value=>{setSearch(value);setPage(0);},{placeholder:'Server, channel, or shortcut name'}));
 // Hermes eval does not isolate captured for-of bindings; callback parameters own each card.
 visible.forEach(item=>{const status=controller.info(item.channelId),ready=status.kind==='ready',history=controller.history(item.channelId),destination=describe(item.channelId);
  children.push(h(RN.View,{key:item.id,style:{backgroundColor:color.card,borderWidth:1,borderColor:color.line,borderRadius:17,padding:16,marginTop:14}},
   text(item.label,{fontWeight:'700',fontSize:18}),text(destination.title,{fontSize:13,color:color.accent,marginTop:3}),text(item.template,{color:'#d6d8e1',marginTop:12}),
   text(status.kind==='cooldown'?status.reason+' · '+duration(status.until-Date.now())+' left':status.label,{color:ready?color.green:color.muted,fontWeight:'600',marginTop:13}),
   text('Last template: '+dateLabel(history.lastTemplateAt),{fontSize:12,lineHeight:18,color:color.muted,marginTop:5}),
   item.replaceLast?text('Replace my last message · On',{fontSize:12,color:color.accent,marginTop:5}):null,
   history.replacement?text(history.replacement.note,{fontSize:12,lineHeight:18,color:history.replacement.status==='failed'?color.red:color.muted,marginTop:5}):null,
   h(RN.View,{style:{flexDirection:'row',flexWrap:'wrap'}},button(status.kind==='unknown'?(item.replaceLast?'Check & replace':'Check & send'):(item.replaceLast?'Send & replace':'Send template'),()=>send(item),!enabled || !['ready','unknown'].includes(status.kind),'primary'),button('Open',()=>safe(()=>openChannel(item.channelId))),button('Edit',()=>edit(item),!!pending),button('Remove',()=>safe(()=>{controller.remove(item.id);setNotice('Shortcut removed.');}),!!pending))));
 });
 if(!list.length)children.push(text('Save a channel and a template to get started. You can also open this dashboard with /postingshortcuts.',{color:color.muted,marginTop:20}));
 if(filtered.length>6)children.push(h(RN.View,{key:'pages',style:{flexDirection:'row',alignItems:'center',marginTop:16}},button('Previous',()=>setPage(page-1),page===0),text((page+1)+' / '+Math.ceil(filtered.length/6)),button('Next',()=>setPage(page+1),(page+1)*6>=filtered.length)));
 children.push(text('Saved locally for this account. No scheduled sends or automatic repeats.\nPosting Shortcuts 0.1.3',{fontSize:12,lineHeight:18,color:'#838a9c',marginTop:25,marginBottom:30}));
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
  controller=createPostingController({storage:vendetta.plugin.storage,getUserId:()=>currentUser()?.id,getChannel:id=>channels.getChannel(id),validateChannel:id=>gate(id,false),gate,requestHistory,sendNative,deleteNative,canReplace,createNonce:()=>nonce.createNonce(),notify:toast});controller.setActive(foreground);
  const handlers={MESSAGE_DELETE:event=>safe(()=>controller.onDelete(event)),MESSAGE_DELETE_BULK:event=>safe(()=>controller.onDelete(event)),MESSAGE_CREATE:event=>safe(()=>controller.onMessage(event.message || event,!!event.optimistic)),MESSAGE_SEND_FAILED:event=>safe(()=>controller.onFailure(event)),MESSAGE_SEND_FAILED_AUTOMOD:event=>safe(()=>controller.onFailure({channelId:event.messageData?.message?.channelId,messageId:event.messageData?.message?.nonce,reason:event.errorResponseBody?.message || 'Discord blocked the message'})),CHANNEL_UPDATES:()=>controller.invalidate(),CONNECTION_OPEN:()=>controller.invalidate(),CONNECTION_CLOSED:()=>controller.invalidate(),CURRENT_USER_UPDATE:()=>controller.invalidate(),LOGOUT:()=>controller.invalidate(),SLOWMODE_SET_COOLDOWN:()=>controller.refresh(),SLOWMODE_RESET_COOLDOWN:()=>controller.refresh()};
  for(const [type,fn]of Object.entries(handlers)){dispatcher.subscribe(type,fn);subscriptions.push([type,fn]);}
  appState=RN.AppState?.addEventListener('change',state=>{foreground=state==='active';controller.setActive(foreground);});
  try{unregister=vendetta.commands?.registerCommand({name:'postingshortcuts',description:'Open your saved channel templates',options:[],execute(){safe(openDashboard);return undefined;}});}catch(_){toast('Open Posting Shortcuts through plugin settings');}
 },
 onUnload(){enabled=false;const cleanup=[()=>unregister?.(),()=>appState?.remove(),()=>controller?.dispose(),...[...requests].map(request=>()=>request.cancel()),...subscriptions.splice(0).map(([type,fn])=>()=>dispatcher.unsubscribe(type,fn))];for(const stop of cleanup)try{stop();}catch(_){}unregister=null;appState=null;},
 settings:Dashboard
};
