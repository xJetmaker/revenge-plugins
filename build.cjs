const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=path.join(__dirname,'docs','media-gestures');fs.mkdirSync(out,{recursive:true});
const core=fs.readFileSync(path.join(__dirname,'src/core.cjs'),'utf8').replace(/\r\n/g,'\n').replace('module.exports={mediaFromSource,inside,createGesture,base64};','return {mediaFromSource,inside,createGesture,base64};');
const plugin=fs.readFileSync(path.join(__dirname,'src/plugin.js'),'utf8').replace(/\r\n/g,'\n');
const recovery="catch(error){return {onLoad(){const message=String(error?.message || error);try{vendetta.metro.common.ReactNative.Alert.alert('Media Gestures startup error',message);}catch(_){try{vendetta.ui.alerts.showConfirmationAlert({title:'Media Gestures startup error',content:message,confirmText:'OK',onConfirm:()=>{}});}catch(_){}}throw error;},onUnload(){}};}";
const bundle='(()=>{try{const core=(()=>{'+core+'})();\n'+plugin+'\n}'+recovery+'})()';
new Function('vendetta','return '+bundle);fs.writeFileSync(path.join(out,'index.js'),bundle);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({name:'Media Gestures',version:'0.1.13',description:'Hold two fingers on one attachment to see its URL; lift one finger to keep reading, then return it to save. No copy action.',authors:[{name:'Custom plugins'}],main:'index.js',hash:crypto.createHash('sha256').update(bundle).digest('hex'),vendetta:{icon:'ImageIcon'}},null,2));
console.log('Built docs/media-gestures (classic Revenge / Vendetta-compatible).');

const deleteOut=path.join(__dirname,'docs','no-delete-confirmation');fs.mkdirSync(deleteOut,{recursive:true});
const deleteSource=fs.readFileSync(path.join(__dirname,'src/no-delete-confirmation.js'),'utf8').replace(/\r\n/g,'\n');
const deleteBundle='(()=>{'+deleteSource+'\n})()';new Function('vendetta','return '+deleteBundle);
fs.writeFileSync(path.join(deleteOut,'index.js'),deleteBundle);
fs.writeFileSync(path.join(deleteOut,'manifest.json'),JSON.stringify({name:'No Delete Confirmation',version:'0.1.1',description:'Delete messages immediately from the message menu, including moderation deletions, using Discord’s original action.',authors:[{name:'Custom plugins'}],main:'index.js',hash:crypto.createHash('sha256').update(deleteBundle).digest('hex'),vendetta:{icon:'ic_message_delete'}},null,2));
console.log('Built docs/no-delete-confirmation (classic Revenge / Vendetta-compatible).');

for(const spec of [{id:'exact-unread',name:'Exact Unread',description:'Shows complete unread counts for the current channel and updates on new/deleted messages.',icon:'ic_message_24px'}, {id:'fast-delete',name:'Fast Delete',description:'Replaces swipe-to-reply with direct deletion for messages you can delete.',icon:'ic_message_delete'}]){
 const dir=path.join(__dirname,'docs',spec.id);fs.mkdirSync(dir,{recursive:true});
 let source=fs.readFileSync(path.join(__dirname,'src',spec.id+'.js'),'utf8').replace(/\r\n/g,'\n');
 if(spec.id==='exact-unread'){
  const counting=fs.readFileSync(path.join(__dirname,'src/unread-core.cjs'),'utf8').replace(/\r\n/g,'\n'),cut=counting.indexOf('// Test/CLI convenience adapter.');
  if(cut<0)throw Error('Unread counter split marker missing');
  const mobileCore=counting.slice(0,cut)+'return {isId,compare,createCounter};';
  source='const unreadCore=(()=>{'+mobileCore+'})();\n'+source;
 }
 const version=spec.id==='exact-unread'?'0.1.4':'0.1.1',main=spec.id==='exact-unread'?'index-'+version+'.js':'index.js';
 const built='(()=>{'+source+'\n})()';new Function('vendetta','return '+built);fs.writeFileSync(path.join(dir,'index.js'),built);if(main!=='index.js')fs.writeFileSync(path.join(dir,main),built);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({name:spec.name,version,description:spec.description,authors:[{name:'Custom plugins'}],main,hash:crypto.createHash('sha256').update(built).digest('hex'),vendetta:{icon:spec.icon}},null,2));
 console.log('Built docs/'+spec.id);
}

{
 const dir=path.join(__dirname,'docs','posting-shortcuts');fs.mkdirSync(dir,{recursive:true});
 const core=fs.readFileSync(path.join(__dirname,'src/posting-core.cjs'),'utf8').replace(/\r\n/g,'\n').replace('module.exports={isId,messageTime,parseChannel,createPostingController};','return {isId,messageTime,parseChannel,createPostingController};');
 const source=fs.readFileSync(path.join(__dirname,'src/posting-shortcuts.js'),'utf8').replace(/\r\n/g,'\n');
 const built='(()=>{const postingCore=(()=>{'+core+'})();\n'+source+'\n})()';new Function('vendetta','return '+built);
 const main='index-0.1.4.js';fs.writeFileSync(path.join(dir,main),built);fs.writeFileSync(path.join(dir,'index.js'),built);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({name:'Posting Shortcuts',version:'0.1.4',description:'Manually triggered channel templates with confirmed-send history and cooldown checks. One tap, one channel.',authors:[{name:'Custom plugins'}],main,hash:crypto.createHash('sha256').update(built).digest('hex'),vendetta:{icon:'ic_message_24px'}},null,2));
 console.log('Built docs/posting-shortcuts');
}
