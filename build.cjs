const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=path.join(__dirname,'docs','media-gestures');fs.mkdirSync(out,{recursive:true});
const core=fs.readFileSync(path.join(__dirname,'src/core.cjs'),'utf8').replace('module.exports={mediaFromSource,inside,createGesture,base64};','return {mediaFromSource,inside,createGesture,base64};');
const plugin=fs.readFileSync(path.join(__dirname,'src/plugin.js'),'utf8');
const bundle='(()=>{const core=(()=>{'+core+'})();\n'+plugin+'\n})()';
new Function('vendetta','return '+bundle);fs.writeFileSync(path.join(out,'index.js'),bundle);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({name:'Media Gestures',description:'Hold two fingers on one attachment to see its URL; hold three to save it. No copy action.',authors:[{name:'Custom plugins'}],main:'index.js',hash:crypto.createHash('sha256').update(bundle).digest('hex'),vendetta:{icon:'ImageIcon'}},null,2));
console.log('Built docs/media-gestures (classic Revenge / Vendetta-compatible).');
