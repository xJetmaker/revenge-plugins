const fs=require('node:fs'),path=require('node:path');
const out=process.argv[2];if(!out)throw Error('Provide an output script path');
const bundle=fs.readFileSync(path.join(__dirname,'../docs/exact-unread/index.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'hermes-unread.fixture.js'),'utf8');
fs.writeFileSync(out,fixture.replace('__PLUGIN_SOURCE__',JSON.stringify('vendetta=>{return '+bundle+'}')));
console.log('Generated Hermes smoke script: '+path.resolve(out));
