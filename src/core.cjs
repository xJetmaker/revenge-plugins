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
  let timer=null, count=0, starts=new Map(), canceled=false, downloaded=false, active=false, generation=0;
  function clear() { generation++; if(timer!==null)clearTimer(timer);timer=null; }
  function abort(reason,touchCount=count) { clear(); hide(); active=false; canceled=true;onState({count:touchCount,canceled:true,reason}); }
  function reset() { clear(); hide();count=0;starts.clear();canceled=false;downloaded=false;active=false;onState({count:0}); }
  function feed(touches) {
    const list=Array.from(touches || []), next=list.length;
    if(next===0) { reset();return; }
    if(canceled)return;
    const rect=getRect();
    if(next>3) {abort('Use exactly three fingers to download',next);return;}
    if(list.some(t=>!inside(t,rect))) {abort('Keep every finger inside the same media tile',next);return;}
    const ids=new Set(list.map(t=>t.identifier));
    if(ids.size!==next) { abort('Touch identifiers are unavailable',next);return; }
    for(const t of list) {
      const start=starts.get(t.identifier);
      if(start && Math.hypot(t.pageX-start.x,t.pageY-start.y)>12) { abort('Hold still to download');return; }
    }
    // A lifted/replaced finger ends the gesture. Do not turn a three-finger release into a URL gesture.
    if(next<count || [...starts.keys()].some(id=>!ids.has(id))) { abort('Keep all three fingers down until the download starts');return; }
    for(const t of list)if(!starts.has(t.identifier))starts.set(t.identifier,{x:t.pageX,y:t.pageY});
    if(next===count)return;
    clear();hide();active=false;count=next;onState({count});
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
module.exports={mediaFromSource,inside,createGesture,base64};
