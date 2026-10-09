const {test}=require('node:test'),assert=require('node:assert/strict'),{mediaFromSource,createGesture,base64}=require('../src/core.cjs');
const source=id=>({uri:`https://media.discordapp.net/attachments/100/${id}/photo.png?ex=abc&is=def&hm=ghi&width=400&height=300&format=webp`});
function fixture(){let seq=0,clock=0,shown=0,hidden=0,saved=0;let rect={x:0,y:0,width:100,height:100};const timers=new Map();
 const g=createGesture({getRect:()=>rect,show:()=>shown++,hide:()=>hidden++,download:()=>saved++,setTimer:(fn,delay)=>{const id=++seq;timers.set(id,{fn,due:clock+delay});return id;},clearTimer:id=>timers.delete(id)});
 return {g,timers,tick(ms){clock+=ms;for(const[id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}},set rect(value){rect=value;},get shown(){return shown;},get saved(){return saved;},get hidden(){return hidden;}};
}
const t=(id,x=10,y=10)=>({identifier:id,pageX:x,pageY:y});
test('each batch item maps to its own source, retaining signature and removing thumbnail transforms',()=>{
 const a=mediaFromSource(source(101)),b=mediaFromSource(source(102));assert.notEqual(a.key,b.key);
 assert.equal(b.url,'https://cdn.discordapp.com/attachments/100/102/photo.png?ex=abc&is=def&hm=ghi');
 assert.equal(mediaFromSource([source(101),source(102)]),null);
});
test('video thumbnail resolves to original video, never to a JPEG conversion',()=>{
 const m=mediaFromSource({uri:'https://media.discordapp.net/attachments/100/201/video.mp4?ex=a&format=jpeg&width=400'});
 assert.equal(m.video,true);assert.equal(m.url,'https://cdn.discordapp.com/attachments/100/201/video.mp4?ex=a');
});
test('unsupported, malformed and external sources fail closed',()=>{
 for(const uri of ['https://evil.com/a.png','file:///tmp/a.png','https://cdn.discordapp.com.evil.com/attachments/1/2/a.png','http://cdn.discordapp.com/attachments/1/2/a.png','https://cdn.discordapp.com/avatars/1/a.png','https://cdn.discordapp.com/attachments/1/2/a.exe'])assert.equal(mediaFromSource({uri}),null);
 assert.equal(mediaFromSource([]),null);assert.equal(mediaFromSource(123),null);
});
test('one finger stays untouched; two show URL at 450 ms and one finger keeps URL visible',()=>{
 const f=fixture();f.g.feed([t(1)]);assert.equal(f.timers.size,0);assert.equal(f.g.claimed(),false);
 f.g.feed([t(1),t(2,20)]);f.tick(449);assert.equal(f.shown,0);f.tick(1);assert.equal(f.shown,1);assert.equal(f.saved,0);
 f.g.feed([t(1)]);f.tick(1500);assert.equal(f.saved,0);assert.equal(f.g.active(),true);f.g.feed([]);assert.equal(f.timers.size,0);
});
test('reading has no time limit; returning a second finger downloads exactly once',()=>{
 const f=fixture(),points=[t(1),t(2,20)];f.g.feed(points);f.tick(450);assert.equal(f.shown,1);
 f.tick(60000);assert.equal(f.saved,0);
 f.g.feed([t(1)]);const hidden=f.hidden;f.tick(60000);
 assert.equal(f.g.active(),true);assert.equal(f.g.claimed(),true);assert.equal(f.hidden,hidden);assert.equal(f.saved,0);
 f.g.feed([t(1),t(9,20)]);assert.equal(f.saved,1);
 f.g.feed([t(1)]);f.g.feed(points);f.tick(5000);assert.equal(f.saved,1);
 f.g.feed([]);assert.equal(f.g.active(),false);
});
test('lifting before the URL appears or moving the anchor cancels without saving',()=>{
 const f=fixture();f.g.feed([t(1),t(2,20)]);f.tick(449);f.g.feed([t(1)]);f.g.feed([t(1),t(2,20)]);f.tick(1000);assert.equal(f.shown,0);assert.equal(f.saved,0);
 f.g.feed([]);f.g.feed([t(1),t(2,20)]);f.tick(450);f.g.feed([t(1)]);f.g.feed([t(1,30)]);f.g.feed([t(1,30),t(2,20)]);assert.equal(f.saved,0);assert.equal(f.g.active(),false);
});
test('returning finger must stay in the same tile and preserve the anchor',()=>{
 for(const points of [[t(1),t(9,100)],[t(3),t(9,20)]]){
  const f=fixture();f.g.feed([t(1),t(2,20)]);f.tick(450);f.g.feed([t(1)]);f.g.feed(points);assert.equal(f.saved,0);assert.equal(f.g.active(),false);
 }
});
test('third finger cancels rather than downloading or restarting on release',()=>{
 const f=fixture();f.g.feed([t(1),t(2,20)]);f.tick(450);f.g.feed([t(1),t(2,20),t(3,30)]);
 f.tick(1500);assert.equal(f.saved,0);f.g.feed([t(1),t(2,20)]);f.tick(1500);assert.equal(f.saved,0);
 f.g.feed([]);f.g.feed([t(1),t(2,20)]);f.tick(450);f.g.feed([t(1)]);f.g.feed([t(1),t(2,20)]);assert.equal(f.saved,1);
});
test('batch neighbours and tile edges cancel instead of selecting another attachment',()=>{
 const f=fixture();f.g.feed([t(1),t(2,100)]);f.tick(1500);assert.equal(f.shown,0);assert.equal(f.saved,0);
 f.g.feed([]);f.g.feed([t(1),t(2,150)]);f.tick(1500);assert.equal(f.saved,0);
});
test('movement, replacement fingers and extra fingers cannot trigger a save',()=>{
 for(const points of [[t(1,30),t(2,20)],[t(1),t(4,20)],[t(1),t(2,20),t(3,30)]]){
  const f=fixture();f.g.feed([t(1),t(2,20)]);f.g.feed(points);f.tick(1500);assert.equal(f.saved,0);
 }
});
test('remeasured scrolling bounds are used, and termination cancels pending timers',()=>{
 const f=fixture();f.rect={x:0,y:200,width:100,height:100};f.g.feed([t(1,10,210),t(2,20,210)]);f.tick(450);assert.equal(f.shown,1);
 f.g.cancel();f.tick(1500);assert.equal(f.saved,0);assert.equal(f.timers.size,0);
});
test('base64 encoding matches Node for binary media and padding boundaries',()=>{
 for(const count of [0,1,2,3,7,16384,32769]){const bytes=Uint8Array.from({length:count},(_,i)=>i%256);assert.equal(base64(bytes),Buffer.from(bytes).toString('base64'));}
});

test('either finger can anchor the URL; releasing both requires a fresh hold',()=>{
 const f=fixture();f.g.feed([t(1),t(2,20)]);f.tick(450);f.g.feed([t(2,20)]);f.tick(60000);assert.equal(f.g.active(),true);
 f.g.feed([t(2,20),t(7,30)]);assert.equal(f.saved,1);f.g.feed([]);
 f.g.feed([t(2,20),t(7,30)]);assert.equal(f.saved,1);f.tick(450);f.g.feed([t(7,30)]);f.g.feed([t(7,30),t(9,40)]);assert.equal(f.saved,2);
});
