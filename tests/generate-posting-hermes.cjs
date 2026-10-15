const fs=require('node:fs'),path=require('node:path');
const out=process.argv[2];if(!out)throw Error('Provide output script path');
const source=fs.readFileSync(path.join(__dirname,'../docs/posting-shortcuts/index.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'hermes-posting.fixture.js'),'utf8');
fs.writeFileSync(out,fixture.replace('__POSTING_BUNDLE__',JSON.stringify(source)));console.log('Generated '+out);
