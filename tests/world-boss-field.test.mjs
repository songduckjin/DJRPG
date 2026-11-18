import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {WorldBossRehearsal}=await import('../src/game/worldBossRehearsal.ts');
const {freshSave}=await import('../src/game/store.ts');
const {pauseMainForBoss}=await import('../src/ui/worldBossField.ts');
const {renderBossRanking,renderBossRewards}=await import('../src/ui/modals/worldBossModal.ts');
const {topTen,myRewardTier}=await import('../src/ui/worldBossPresentation.ts');
for(const gender of ['male','female'])test(`${gender}: dedicated battle uses real attacks and equipped skill effects on a deep copy only`,()=>{
 const save=freshSave(gender);save.learned=['spin','warcry','hell'];save.quickSlots=['spin','warcry','hell'];const before=JSON.stringify(save);
 const battle=new WorldBossRehearsal(save);battle.advance(.05);
 assert.equal(battle.boss.x,0);assert.equal(battle.boss.y,0);
 assert(battle.damage>0);assert(battle.world.attackPose>0);assert.deepEqual(battle.world.save.quickSlots,save.quickSlots);
 for(const kind of ['slash','spin','warcry','hell'])assert(battle.world.effects.some(e=>e.kind===kind),kind);
 for(let i=0;i<1500;i++)battle.advance(.05);assert(battle.finished);assert(battle.elapsed<=60);assert.equal(battle.world.enemies.length,1);assert.equal(battle.world.drops.length,0);
 assert.equal(JSON.stringify(save),before);
});
test('leaving boss battle restores the original ticker once but never clears a synchronization pause',()=>{
 let stopped=0,started=0;const ui={world:{paused:false,attackHeld:true},market:{sync:{locked:false,conflicted:false}},suspendMainField(){stopped++;return()=>started++;}};
 const restore=pauseMainForBoss(ui);assert(ui.world.paused);assert.equal(ui.world.attackHeld,false);assert.equal(stopped,1);
 ui.market.sync.locked=true;restore();restore();assert(ui.world.paused);assert.equal(started,1);
 ui.market.sync.locked=false;ui.world.paused=false;const again=pauseMainForBoss(ui);again();assert.equal(ui.world.paused,false);
});
function node(){const el={children:[],className:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);}};el.classList={add(c){el.className+=' '+c;}};return el;}
test('ranking shows ten entries and my rank below, including a rank outside the top ten',()=>{
 const old=globalThis.document;globalThis.document={createElement:node};
 try{
 const standing={top:Array.from({length:15},(_,i)=>({rank:i+1,name:`전사${i+1}`,damage:1000-i})),mine:{rank:22,name:'나',damage:100}};
 assert.equal(topTen(standing).length,10);const parent=node();renderBossRanking(parent,standing);assert.equal(parent.children[0].children.length,10);assert.equal(parent.children[1].className,'wb-my-rank');assert.match(parent.children[1].children[1].textContent,/22위/);
 const pending=node();renderBossRanking(pending);assert.equal(pending.children[0].children.length,10);assert.equal(pending.children[1].children[1].textContent,'집계 대기');
 }finally{globalThis.document=old;}
});
test('reward brackets highlight exactly my tier and show last hit and shared kill bonuses separately',()=>{
 const old=globalThis.document;globalThis.document={createElement:node};
 try{
 assert.equal(myRewardTier(1),'first');assert.equal(myRewardTier(3),'podium');assert.equal(myRewardTier(10),'top-ten');assert.equal(myRewardTier(11),'top-fifty');assert.equal(myRewardTier(50),'top-fifty');assert.equal(myRewardTier(51),'top-hundred');assert.equal(myRewardTier(100),'top-hundred');assert.equal(myRewardTier(101),'participation');assert.equal(myRewardTier(999),'participation');assert.equal(myRewardTier(undefined),undefined);
 const parent=node();renderBossRewards(parent,5);const rows=parent.children[1].children;
 assert.equal(rows.filter(r=>r.className.includes('is-mine')).length,1);assert.equal(rows.find(r=>r.className.includes('is-mine')).children[0].textContent,'4~10위');
 for(const [rank,label] of [[50,'11~50위'],[100,'51~100위'],[101,'101위 이하 공통']]){const out=node();renderBossRewards(out,rank);const mine=out.children[1].children.filter(r=>r.className.includes('is-mine'));assert.equal(mine.length,1);assert.equal(mine[0].children[0].textContent,label);}
 assert(rows.some(r=>r.children[0].textContent==='마지막 타격 보상'));assert(rows.some(r=>r.children[0].textContent==='공동 처치 보상'));
 }finally{globalThis.document=old;}
});
