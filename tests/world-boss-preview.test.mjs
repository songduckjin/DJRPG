import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {WorldBossPreview,bossPose,framePosition,frameSheet,footShift,BOSS_SHEETS,preloadBossSheets}=await import('../src/ui/worldBossPreview.ts');
const {renderWorldBoss}=await import('../src/ui/modals/worldBossModal.ts');
const {freshSave}=await import('../src/game/store.ts');
test('boss idle slash and slam stay within their separate sprite rows and impact follows warning',()=>{
 for(let t=0;t<36;t+=.01){const p=bossPose(t);assert(p.frame>=0&&p.frame<40);if(p.motion==='idle')assert(p.frame<8);if(p.motion==='attack')assert(p.frame>=8&&p.frame<16);if(p.motion==='slam')assert(p.frame>=16);}
 assert.equal(bossPose(9).impact,false);assert.equal(bossPose(9.95).impact,true);assert.equal(bossPose(12).motion,'idle');
 assert.equal(framePosition(0),'0% 0%');assert.equal(framePosition(31),'100% 100%');
});
test('preview duration is 60 seconds and rendering cancels its animation on close without touching a save',()=>{
 const oldRaf=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;let frame,canceled=false;
 globalThis.requestAnimationFrame=cb=>{frame=cb;return 7;};globalThis.cancelAnimationFrame=id=>{canceled=id===7;};
 try{
  const preview=new WorldBossPreview();preview.start(performance.now()-61000);assert.equal(preview.elapsed(),60);
  const children=new Map();const stage={isConnected:true,dataset:{},classList:{toggle(){}},querySelector(key){if(!children.has(key))children.set(key,{style:{setProperty(){}}});return children.get(key);}};
  preview.animate(stage,100);frame();assert.equal(preview.damage,6000);assert.match(children.get('.wb-session-status').textContent,/연습 종료/);
  preview.dispose();assert(canceled);preview.start(100);assert.equal(preview.damage,0);assert.equal(preview.elapsed(1100),1);
 }finally{globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;}
});
test('intro shows the static combat portrait and challenge guide instead of combat, without save mutation',()=>{
 const old=globalThis.document;
 function element(){return {children:[],style:{},className:'',handlers:{},classList:{add(){}},setAttribute(){},addEventListener(type,run){this.handlers[type]=run;},append(...nodes){this.children.push(...nodes);}};}
 globalThis.document={createElement:element};
 try{for(const gender of ['male','female']){
 const save=freshSave(gender),before=JSON.stringify(save),worldBoss=new WorldBossPreview(),ui={world:{save},worldBoss,renderModal(){},open(value){this.closed=value===null;}},dialog=element();renderWorldBoss(ui,dialog);
 const body=dialog.children[0];assert.match(body.innerHTML,/wb-intro-combat/);assert(!body.innerHTML.includes('wb-hero'));assert(!body.innerHTML.includes('wb-session'));
 const details=body.children[0],panel=details.children.at(-1);const exit=details.children[0].children[1];assert.equal(exit.textContent,'나가기');exit.handlers.click({preventDefault(){},stopPropagation(){}});assert(ui.closed);assert.match(panel.children[0].innerHTML,/계정당 하루 3회/);assert.equal(panel.children.at(-1).textContent,'도전하기');assert.equal(JSON.stringify(save),before);
 }}finally{globalThis.document=old;}
});

test('high resolution sheets switch at eight-frame boundaries without sampling neighboring motions',()=>{
 assert.equal(BOSS_SHEETS.length,5);
 for(let frame=0;frame<40;frame++){
  assert.equal(frameSheet(frame),BOSS_SHEETS[Math.floor(frame/8)]);
  assert(Math.abs(footShift(frame))<.15);
  const [x,y]=framePosition(frame).split(' ').map(parseFloat);assert(x>=0&&x<=100);assert(y===0||y===100);
 }
 assert.equal(framePosition(8),'0% 0%');assert.equal(framePosition(15),'100% 100%');
});

test('sheet preloading deduplicates requests and allows a failed sheet to retry',()=>{
 const old=globalThis.Image,images=[];globalThis.Image=class{constructor(){images.push(this);}};
 try{
  preloadBossSheets();preloadBossSheets();assert.equal(images.length,5);
  images[1].onerror();preloadBossSheets();assert.equal(images.length,6);
  for(const image of images)image.onload();preloadBossSheets();assert.equal(images.length,6);
 }finally{globalThis.Image=old;}
});

test('slam accelerates through the downswing and its impact matches damage timing',async()=>{
 const {SLAM_HIT_PHASE}=await import('../src/game/worldBossRehearsal.ts');
 const {slamImpactAge}=await import('../src/ui/worldBossPreview.ts');
 assert(bossPose(9.64).frame<24);assert(bossPose(9.92).frame>=24);assert(bossPose(SLAM_HIT_PHASE+.01).impact);
 assert.equal(slamImpactAge(SLAM_HIT_PHASE-.01),null);assert(slamImpactAge(SLAM_HIT_PHASE+.2)>0);assert.equal(slamImpactAge(11.2),null);assert.equal(bossPose(10.81).motion,'idle');
});
