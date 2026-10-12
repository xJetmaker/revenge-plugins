var timerSequence=0,timers=new Map();function setTimeout(fn,ms){timers.set(++timerSequence,fn);return timerSequence;}function clearTimeout(id){timers.delete(id);}
var read={getUnreadCount:function(){return 30;},isEstimated:function(){return true;},getTrackedAckMessageId:function(){return '150';},emitChange:function(){}};
var selected={getChannelId:function(){return '10';},getVoiceChannelId:function(){}};
var callbacks=[],paths=[];var http={get:function(path,callback){paths.push(path);callbacks.push(callback);return{then:function(fn){fn(undefined);}};}};
var handlers={};
var vendetta={metro:{common:{React:{createElement:function(type,props){return Array.prototype.slice.call(arguments,2);}},ReactNative:{},FluxDispatcher:{subscribe:function(type,fn){handlers[type]=fn;},unsubscribe:function(type){delete handlers[type];}}},findByProps:function(key){return key==='HTTP'?{HTTP:http,getAPIBaseURL:function(){},setRequestPatch:function(){},get:http.get}:key==='getUnreadCount'?read:key==='getChannelId'?selected:key==='get'?http:null;}},patcher:{instead:function(key,obj,handler){var original=obj[key];obj[key]=function(){return handler(Array.prototype.slice.call(arguments),original.bind(obj));};return function(){obj[key]=original;};}}};
Promise=function(){throw new Error('Userland Promise construction is disabled');};
function check(condition,label){if(!condition)throw new Error(label);}
function reply(messages){return{hasErr:false,ok:true,headers:{},body:messages,text:'',status:200,retryAfter:0};}
var plugin=(0,eval)(__PLUGIN_SOURCE__)(vendetta);
plugin.onLoad();check(read.getUnreadCount('10')===30,'native count before response');
callbacks[0](reply(Array.from({length:100},function(_,i){return{id:String(300-i),channel_id:'10'};})));
check(read.getUnreadCount('10')===30,'partial count must stay hidden');
Array.from(timers).forEach(function(pair){timers.delete(pair[0]);pair[1]();});
check(paths[1]==='/channels/10/messages?limit=100&before=201','pagination cursor');
callbacks[1](reply(Array.from({length:100},function(_,i){return{id:String(200-i),channel_id:'10'};})));
check(read.getUnreadCount('10')===150,'full count 150');check(read.isEstimated('10')===false,'no plus after completion');
handlers.MESSAGE_CREATE({message:{id:'301',channel_id:'10'}});check(read.getUnreadCount('10')===151,'new message');
handlers.MESSAGE_DELETE({id:'200',channelId:'10'});check(read.getUnreadCount('10')===150,'deleted message');
handlers.MESSAGE_DELETE_BULK({ids:['199','198'],channelId:'10'});check(read.getUnreadCount('10')===148,'bulk deletion');
plugin.onUnload();check(read.getUnreadCount('10')===30,'native count restored');check(timers.size===0,'timers cleaned up');
print('HERMES PASS: callback-only pagination 150, create 151, delete 150, bulk delete 148, unload clean; no userland Promise');
