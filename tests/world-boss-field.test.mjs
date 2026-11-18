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

test('manual dodge blocks damage briefly, has a cooldown, and never changes the original save',()=>{
 const save=freshSave('male'),before=JSON.stringify(save),battle=new WorldBossRehearsal(save);
 battle.elapsed=4.45;const hp=battle.world.player.hp;assert(battle.dodge());assert(!battle.dodge());
 for(let i=0;i<4;i++)battle.advance(.05);assert.equal(battle.world.player.hp,hp);assert(battle.dodgeCooldown>0);
 for(let i=0;i<80;i++)battle.advance(.05);assert(battle.dodge());assert.equal(JSON.stringify(save),before);
});

test('detached blade fragment is removed while the connected body and sword stay intact',async()=>{
 const {retainMainBody}=await import('../src/ui/worldBossField.ts');const w=40,h=40,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=10;y<30;y++)for(let x=10;x<30;x++)pixels[(y*w+x)*4+3]=255;
 for(let x=2;x<=10;x++)pixels[(20*w+x)*4+3]=255;
 pixels[(2*w+1)*4+3]=255;retainMainBody(pixels,w,h);
 assert.equal(pixels[(2*w+1)*4+3],0);assert.equal(pixels[(20*w+2)*4+3],255);assert.equal(pixels[(20*w+20)*4+3],255);
});

test('short standing roar pauses combat, starts and ends in the regular idle pose',async()=>{
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const intro=new WorldBossIntro(),battle=new WorldBossRehearsal(freshSave('male'));
 assert.equal(intro.duration,2.7);assert.equal(intro.frame,0);let sawRoar=false;
 for(let i=0;i<53;i++){const dt=intro.advance(.05);if(dt>0)battle.advance(dt);assert(intro.frame===0||(intro.frame>=41&&intro.frame<=47));if(intro.frame>=41)sawRoar=true;}
 assert(sawRoar);assert(intro.active);assert.equal(battle.elapsed,0);assert.equal(battle.damage,0);assert.equal(intro.frame,0);assert(intro.startCue);
 for(let i=0;i<2;i++){const dt=intro.advance(.05);if(dt>0)battle.advance(dt);}
 assert(!intro.active);assert(Math.abs(battle.elapsed-.05)<1e-9);assert.equal(intro.frame,0);
 assert.equal('skip' in intro,false);assert.equal('camera' in intro,false);
});
test('standing roar visibly opens and closes in order with a fixed foot baseline',async()=>{
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const intro=new WorldBossIntro();
 const expected=[[0,0],[.25,41],[.45,43],[.8,44],[1.1,45],[1.3,46],[1.5,47],[1.6,0]];
 for(const [time,frame] of expected){intro.elapsed=time*1.5;assert.equal(intro.frame,frame);assert(Math.abs(intro.footShift-.0218)<.003);}
});

test('slam rocks rise, travel, fall and expire while dust expands and dissipates',async()=>{
 const {slamParticles}=await import('../src/ui/worldBossImpact.ts');
 const early=slamParticles(.1),mid=slamParticles(.35),late=slamParticles(.65);
 assert(early.rocks.length>0);assert(mid.dust.length>0);
 assert(mid.rocks[0].x>early.rocks[0].x);assert(mid.rocks[0].groundY-mid.rocks[0].y>0);
 assert(late.rocks[0].groundY-late.rocks[0].y<mid.rocks[0].groundY-mid.rocks[0].y);
 assert(mid.dust[0].rx>early.dust[0].rx);assert(late.dust[0].alpha<mid.dust[0].alpha);
 assert.deepEqual(slamParticles(1.15),{rocks:[],dust:[]});assert.deepEqual(slamParticles(-1),{rocks:[],dust:[]});
});

test('banner cloth moves below its attachment while stone and poles stay fixed; clouds drift',async()=>{
 const {bannerOffset,cloudCenter}=await import('../src/ui/worldBossWeather.ts');
 assert.deepEqual(bannerOffset(.5,.5,3),{x:0,y:0});assert.deepEqual(bannerOffset(.16,.18,3),{x:0,y:0});
 assert.notDeepEqual(bannerOffset(.17,.29,0),bannerOffset(.17,.29,1));assert.notDeepEqual(bannerOffset(.95,.3,0),bannerOffset(.95,.3,1));
 assert.notEqual(cloudCenter(1,0,480),cloudCenter(1,2,480));
});
