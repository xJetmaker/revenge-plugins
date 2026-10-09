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
fs.writeFileSync(path.join(deleteOut,'manifest.json'),JSON.stringify({name:'No Delete Confirmation',version:'0.1.0',description:'Delete your own messages immediately from the message menu, using Discord’s original delete action.',authors:[{name:'Custom plugins'}],main:'index.js',hash:crypto.createHash('sha256').update(deleteBundle).digest('hex'),vendetta:{icon:'ic_message_delete'}},null,2));
console.log('Built docs/no-delete-confirmation (classic Revenge / Vendetta-compatible).');
