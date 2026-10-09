"use strict";
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
module.exports={mediaFromSource,inside,createGesture,base64};
