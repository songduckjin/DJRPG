import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {WorldBossPreview,bossPose,framePosition}=await import('../src/ui/worldBossPreview.ts');
const {renderWorldBoss}=await import('../src/ui/modals/worldBossModal.ts');
const {freshSave}=await import('../src/game/store.ts');
test('boss idle slash and slam stay within their separate sprite rows and impact follows warning',()=>{
 for(let t=0;t<36;t+=.01){const p=bossPose(t);assert(p.frame>=0&&p.frame<32);if(p.motion==='idle')assert(p.frame<8);if(p.motion==='attack')assert(p.frame>=8&&p.frame<16);if(p.motion==='slam')assert(p.frame>=16);}
 assert.equal(bossPose(9).impact,false);assert.equal(bossPose(10.8).impact,true);assert.equal(bossPose(12).motion,'idle');
 assert.equal(framePosition(0),'0% 0%');assert.equal(framePosition(31),'100% 100%');
});
test('preview duration is 60 seconds and rendering cancels its animation on close without touching a save',()=>{
 const oldRaf=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;let frame,canceled=false;
 globalThis.requestAnimationFrame=cb=>{frame=cb;return 7;};globalThis.cancelAnimationFrame=id=>{canceled=id===7;};
 try{
  const preview=new WorldBossPreview();preview.start(performance.now()-61000);assert.equal(preview.elapsed(),60);
  const children=new Map();const stage={isConnected:true,dataset:{},classList:{toggle(){}},querySelector(key){if(!children.has(key))children.set(key,{style:{}});return children.get(key);}};
  preview.animate(stage,100);frame();assert.equal(preview.damage,6000);assert.match(children.get('.wb-session-status').textContent,/연습 종료/);
  preview.dispose();assert(canceled);preview.start(100);assert.equal(preview.damage,0);assert.equal(preview.elapsed(1100),1);
 }finally{globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;}
});
test('world boss modal displays an explicit rehearsal and uses each gender portrait without changing progress',()=>{
 const old=globalThis.document;
 function element(){const queries=new Map();return {children:[],style:{},className:'',setAttribute(){},append(...nodes){this.children.push(...nodes);},querySelector(key){if(!queries.has(key))queries.set(key,element());return queries.get(key);}};}
 globalThis.document={createElement:element};
 try{for(const gender of ['male','female']){
  const save=freshSave(gender),before=JSON.stringify(save),worldBoss=new WorldBossPreview();let stage;
  worldBoss.animate=el=>{stage=el;};const ui={world:{save},worldBoss,renderModal(){}},dialog=element();renderWorldBoss(ui,dialog);
  const body=dialog.children[0];assert.match(body.innerHTML,/참여 횟수와 보상은 소모되지/);assert.match(body.querySelector('.wb-hero').src,new RegExp(gender));assert(stage);assert.equal(JSON.stringify(save),before);
  const panel=body.children[1],button=panel.children[0];assert.equal(button.textContent,'60초 전투 연습');
 }}finally{globalThis.document=old;}
});
