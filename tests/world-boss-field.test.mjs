import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {WorldBossRehearsal}=await import('../src/game/worldBossRehearsal.ts');
const {freshSave}=await import('../src/game/store.ts');
const {pauseMainForBoss}=await import('../src/ui/worldBossField.ts');
const {renderBossRanking,renderBossRewards}=await import('../src/ui/modals/worldBossModal.ts');
const {topTen,myRewardTier}=await import('../src/ui/worldBossPresentation.ts');
for(const gender of ['male','female'])test(`${gender}: dedicated battle uses real attacks and equipped skill effects on a deep copy only`,()=>{
 const save=freshSave(gender);save.equipment={weapon:{id:'wb-weapon-'+gender,name:'낡은 두손검',slot:'weapon',rarity:'common',stats:{attack:4}}};save.learned=['spin','warcry','hell'];save.quickSlots=['spin','warcry','hell'];const before=JSON.stringify(save);
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
 assert.equal(rows.find(r=>r.children[0].textContent==='1위').children[1].textContent,'10,000 금화 · 보물 주머니 4개');assert(!rows.some(r=>r.children[0].textContent==='도전 참여 보상'));
 assert(rows.some(r=>r.children[0].textContent==='마지막 타격 보상'));assert(rows.some(r=>r.children[0].textContent==='공동 처치 보상'));
 }finally{globalThis.document=old;}
});

test('manual dodge blocks damage briefly, has a cooldown, and never changes the original save',()=>{
 const save=freshSave('male'),before=JSON.stringify(save),battle=new WorldBossRehearsal(save);
 battle.elapsed=2.9;const hp=battle.world.player.hp;assert(battle.dodge());assert(!battle.dodge());
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
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const startSave=freshSave('male');startSave.equipment={weapon:{id:'wb-intro-weapon',name:'낡은 두손검',slot:'weapon',rarity:'common',stats:{attack:4}}};
 const intro=new WorldBossIntro(),battle=new WorldBossRehearsal(startSave);
 assert.equal(intro.roarDuration,2.7);assert.equal(intro.duration,3.8);assert.equal(intro.frame,0);let sawRoar=false;
 for(let i=0;i<75;i++){const dt=intro.advance(.05);if(dt>0)battle.advance(dt);assert(intro.frame<8||(intro.frame>=43&&intro.frame<=49));if(intro.frame>=43)sawRoar=true;}
 assert(sawRoar);assert(intro.active);assert.equal(battle.elapsed,0);assert.equal(battle.damage,0);assert(intro.frame<8);assert(intro.startCue);
 for(let i=0;i<2;i++){const dt=intro.advance(.05);if(dt>0)battle.advance(dt);}
 assert(!intro.active);assert(Math.abs(battle.elapsed-.05)<1e-9);assert(intro.frame<8);
 assert.equal('skip' in intro,false);assert.equal('camera' in intro,false);
});
test('standing roar visibly opens and closes in order with a fixed foot baseline',async()=>{
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const intro=new WorldBossIntro();
 const expected=[[0,0],[.25,43],[.45,45],[.8,46],[1.1,47],[1.3,48],[1.5,49],[1.6,0]];
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

test('result window includes exactly the preceding nine ranks and mine, with top-ten boundary handled',async()=>{
 const {resultRankWindow,exampleBossStanding}=await import('../src/ui/worldBossResult.ts');const standing=exampleBossStanding(),before=JSON.stringify(standing);
 const rows=resultRankWindow(standing);assert.deepEqual(rows.map(r=>r.rank),[14,15,16,17,18,19,20,21,22,23]);assert.equal(rows[9].entry,standing.mine);assert(rows.every(r=>r.entry));
 assert.deepEqual(resultRankWindow({top:[],mine:{rank:11,name:'나',damage:1}}).map(r=>r.rank),[2,3,4,5,6,7,8,9,10,11]);
 assert.deepEqual(resultRankWindow({top:[],mine:{rank:10,name:'나',damage:1}}).map(r=>r.rank),[1,2,3,4,5,6,7,8,9,10]);
 assert(resultRankWindow().every(r=>r.entry===undefined));assert.equal(JSON.stringify(standing),before);
});
test('result keeps retry and exit at bottom and exposes rank animation only as a labeled example',async()=>{
 const {renderBossResult}=await import('../src/ui/worldBossResult.ts');const old=globalThis.document;let retried=0,left=0;
 const create=()=>({children:[],className:'',attrs:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attrs[k]=v;}});
 globalThis.document={createElement:create};
 try{const parent=create();renderBossResult(parent,undefined,123,{retry:()=>retried++,leave:()=>left++});let card=parent.children[0];
 const buttons=card.children.at(-1).children;assert.deepEqual(buttons.map(b=>b.textContent),['다시 도전하기','나가기']);buttons[0].onclick();buttons[1].onclick();assert.equal(retried,1);assert.equal(left,1);
 const demo=card.children.find(c=>c.className==='wb-result-demo');assert.match(demo.textContent,/예시/);demo.onclick();card=parent.children[0];assert.match(card.children[1].textContent,/실제 순위나 보상이 아닙니다/);
 const window=card.children.find(c=>c.className.includes('wb-result-window'));assert.match(window.className,/is-descending/);const target=window.children[0].children[1];assert.equal(target.children.length,10);assert.match(target.children[9].children[0].className,/wb-result-displaced/);assert.equal(target.children[9].children[0].children[1].textContent,'예시 전사 24');assert.equal(target.children[9].children[0].children[0].textContent,'23위');assert.match(target.children[9].children[1].className,/is-mine/);
 }finally{globalThis.document=old;}
});

test('combat stays completely idle while the start text appears and fades, then starts as it vanishes',async()=>{
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const startSave=freshSave('male');startSave.equipment={weapon:{id:'wb-intro-weapon',name:'낡은 두손검',slot:'weapon',rarity:'common',stats:{attack:4}}};
 const intro=new WorldBossIntro(),battle=new WorldBossRehearsal(startSave);
 while(intro.elapsed<3.75-1e-9){const combat=intro.advance(.05);if(combat>0)battle.advance(combat);}
 assert(intro.startCue);assert(intro.cueOpacity>0&&intro.cueOpacity<.2);assert.equal(battle.elapsed,0);assert.equal(battle.damage,0);assert.equal(battle.world.effects.length,0);
 const remaining=intro.duration-intro.elapsed;const combat=intro.advance(remaining);if(combat>1e-9)battle.advance(combat);
 assert.equal(intro.startCue,false);assert.equal(intro.cueOpacity,0);assert.equal(battle.elapsed,0);
 const first=intro.advance(.05);battle.advance(first);assert.equal(battle.elapsed,.05);assert(battle.damage>0);
});

test('boss schedule uses normals three seconds apart and three slams with recovery gaps',async()=>{
 const {bossAttacks,bossHitsBetween,SLAM_TIMES}=await import('../src/game/worldBossPattern.ts');
 assert.deepEqual(bossAttacks.filter(a=>a.kind==='slam').map(a=>a.hit),[15,30,45]);
 assert.deepEqual(bossAttacks.filter(a=>a.kind==='attack').map(a=>a.hit),[3,6,9,12,17.55,20.55,23.55,26.55,32.55,35.55,38.55,41.55,47.55,50.55,53.55,56.55,59.55]);
 for(const s of SLAM_TIMES)assert(bossAttacks.every(a=>a.kind!=='attack'||a.end<=s-1||a.start>=s+2));
 assert.equal(bossHitsBetween(14.95,15.001)[0].kind,'slam');assert.equal(bossHitsBetween(15.001,15.05).length,0);
});
test('standing in contact causes no hidden engine damage between scheduled boss attacks',async()=>{
 const {bossHitsBetween}=await import('../src/game/worldBossPattern.ts');const battle=new WorldBossRehearsal(freshSave('male'));battle.world.player.hp=100000;
 let hits=0;for(let i=0;i<1201&&!battle.finished;i++){
  const before=battle.elapsed,hp=battle.world.player.hp;battle.world.player.x=0;battle.world.player.y=0;battle.advance(.05);
  const due=bossHitsBetween(before,battle.elapsed);if(due.length){assert(battle.world.player.hp<hp);hits++;}else assert.equal(battle.world.player.hp,hp);
 }
 assert.equal(hits,20);assert(battle.finished);
});

test('slam recovery and both bridge frames keep both soles at the exact idle contacts',async()=>{
 const {bossFootContacts,plantedBossVertex,plantedBossShift}=await import('../src/ui/worldBossFooting.ts');
 const target=bossFootContacts[0];
 for(const frame of [32,33,34,35,36,37,40,41,38,39,0,1,2,3,4,5,6,7]){
  for(let foot=0;foot<2;foot++){
   const [x,y]=bossFootContacts[frame][foot],p=plantedBossVertex(frame,x,y);
   assert(Math.abs(p.x-target[foot][0])<1e-9,`${frame}: horizontal sole contact`);
   assert(Math.abs(p.y-target[foot][1])<1e-9,`${frame}: vertical sole contact`);
  }
  assert.deepEqual(plantedBossVertex(frame,.5,.3),{x:.5,y:.3});assert.equal(plantedBossShift(frame,0),.97-target[0][1]);
 }
 assert.deepEqual(plantedBossVertex(12,.4,.8),{x:.4,y:.8});
});

test('the rendered 24 by 32 mesh interpolation also preserves the planted foot contacts',async()=>{
 const {bossFootContacts,plantedBossVertex}=await import('../src/ui/worldBossFooting.ts');
 for(const frame of [37,40,41,38,39,0])for(let f=0;f<2;f++){
  const [x,y]=bossFootContacts[frame][f],col=Math.floor(x*23),row=Math.floor(y*31),u=x*23-col,v=y*31-row;
  const corners=[[col/23,row/31],[(col+1)/23,row/31],[col/23,(row+1)/31],[(col+1)/23,(row+1)/31]].map(([a,b])=>plantedBossVertex(frame,a,b));
  const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  const out={x:corners.reduce((s,p,i)=>s+p.x*weights[i],0),y:corners.reduce((s,p,i)=>s+p.y*weights[i],0)};
  assert(Math.abs(out.x-bossFootContacts[0][f][0])*400<.1);assert(Math.abs(out.y-bossFootContacts[0][f][1])*400<.1);
 }
});

test('fixed boot silhouettes use full shared pixels at both soles and keep the upper body unmasked',async()=>{
 const {bootMaskWeight}=await import('../src/ui/worldBossFooting.ts');
 for(const [x,y] of [[.33,.92],[.4,.948],[.47,.91],[.71,.91],[.8,.93],[.89,.92]])assert.equal(bootMaskWeight(x,y),1);
 assert.equal(bootMaskWeight(.4,.7),0);assert.equal(bootMaskWeight(.1,.92),0);assert.equal(bootMaskWeight(.6,.9),0);
});
test('idle breathing continues after roar through the entire start-text hold',async()=>{
 const {WorldBossIntro}=await import('../src/ui/worldBossIntro.ts');const intro=new WorldBossIntro(),frames=new Set();
 for(let t=2.7;t<3.8;t+=.05){intro.elapsed=t;frames.add(intro.frame);assert(intro.frame<8);}
 assert(frames.size>=5);assert(intro.idleCarry>1);
});

test('defeat starts only for a confirmed kill, plays all eight poses once, then notice, then result',async()=>{
 const {WorldBossDefeat}=await import('../src/ui/worldBossDefeat.ts');const defeat=new WorldBossDefeat();
 for(let i=0;i<200;i++){assert.equal(defeat.start(false),false);defeat.advance(.05);}assert.equal(defeat.elapsed,0);assert.equal(defeat.finished,false);assert.equal(defeat.notice,false);
 assert.equal(defeat.start(true),true);const frames=new Set([defeat.frame]);let noticed=false;
 for(let i=0;i<100;i++){
  const elapsed=defeat.elapsed;assert.equal(defeat.start(true),false);assert.equal(defeat.elapsed,elapsed);defeat.advance(.05);frames.add(defeat.frame);
  if(defeat.notice){noticed=true;assert.equal(defeat.frame,7);assert.equal(defeat.finished,false);assert(defeat.noticeOpacity>=0&&defeat.noticeOpacity<=1);}
  if(defeat.finished)break;
 }
 assert.deepEqual([...frames],[0,1,2,3,4,5,6,7]);assert(noticed);assert(defeat.finished);assert.equal(defeat.notice,false);
});
test('sword planting impact is delayed until contact and dies out before the notice',async()=>{
 const {WorldBossDefeat,defeatFrameOffset}=await import('../src/ui/worldBossDefeat.ts');const defeat=new WorldBossDefeat();defeat.start(true);
 for(let i=0;i<8;i++)defeat.advance(.05);assert.equal(defeat.impactAge,null);
 defeat.advance(.05);defeat.advance(.05);assert(defeat.impactAge>=0);assert(defeat.frame>=2);
 for(let i=0;i<40;i++)defeat.advance(.05);assert.equal(defeat.impactAge,null);assert(defeat.notice);
 for(let frame=0;frame<8;frame++){const shift=defeatFrameOffset(frame);assert(Math.abs(shift.x)<.02);assert(shift.y>0&&shift.y<.04);}
});
test('defeat integration waits before results and uses background art loading without changing existing motion rows',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/ui/worldBossField.ts',import.meta.url),'utf8');
 assert(source.includes('defeat.start(data.killed&&data.hp===0)'));
 assert(source.includes('(!defeat.started||defeat.finished)'));
 assert(source.includes('보스를 처치하였습니다.'));assert(source.includes('void Assets.load<Texture>(BOSS_DEFEAT_SHEET)'));
 const {BOSS_SHEETS,BOSS_FRAME_COUNT}=await import('../src/ui/worldBossPreview.ts');assert.equal(BOSS_FRAME_COUNT,42);assert.equal(BOSS_SHEETS.length,6);
 const art=readFileSync(new URL('../public/assets/world-boss/valkaron-defeat-hd-v1.png',import.meta.url));assert.equal(art.readUInt32BE(0),0x89504e47);assert(art.readUInt32BE(16)>=1536);assert(art.readUInt32BE(20)>=768);assert.equal(art[25],6);
});

test('slam warning flashes around the strike point only during each one-second windup',async()=>{
 const {slamWarning}=await import('../src/ui/worldBossImpact.ts');
 for(const hit of [15,30,45]){
  assert.equal(slamWarning(hit-1.01),null);assert(slamWarning(hit-1));
  const bright=slamWarning(hit-.75),dim=slamWarning(hit-.875);assert(bright.ringAlpha>dim.ringAlpha);assert(bright.fillAlpha>dim.fillAlpha);
  assert.equal(bright.radiusX,dim.radiusX);assert.equal(bright.radiusY,dim.radiusY);
  assert.equal(slamWarning(hit),null);assert.equal(slamWarning(hit+.5),null);
  assert.equal(slamWarning(hit-.75,true).ringAlpha,slamWarning(hit-.875,true).ringAlpha);
 }
 assert.equal(slamWarning(3),null);assert.equal(slamWarning(60),null);
 const {drawSlamWarning}=await import('../src/ui/worldBossField.ts');const calls=[];
 const layer={ellipse(...args){calls.push(args);return this;},fill(){return this;},stroke(){return this;}};
 drawSlamWarning(layer,100,200,14.2);assert.equal(calls.length,3);for(const args of calls)assert.deepEqual(args,[100,200,115,46]);
 calls.length=0;drawSlamWarning(layer,100,200,15);assert.equal(calls.length,0);
});
