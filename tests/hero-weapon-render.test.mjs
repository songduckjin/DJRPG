import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture,Rectangle} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero,updateAfterimages}=await import('../src/game/render/entities.ts');
const {freshSave}=await import('../src/game/store.ts');
const {weaponSockets,weaponSocket,heroClass}=await import('../src/game/render/heroSockets.ts');
const {drawSkillVfx,drawDragon,weaponSlashColor,slashTint}=await import('../src/game/render/vfx.ts');

const item=(slot,name)=>({id:slot,slot,name,rarity:'common',stats:{}});

test('weapon sockets cover both genders and eight walk frames',()=>{
 for(const gender of ['male','female']){
  const save=freshSave(gender),classId=heroClass(save);
  assert.equal(classId,'warrior');
  assert.equal(weaponSockets[classId][gender].walk.length,8);
  for(const frame of Array.from({length:8},(_,index)=>index)){
   const socket=weaponSocket(classId,gender,'walk',frame);
   for(const value of Object.values(socket))assert(Number.isFinite(value));
   assert(socket.u>=0&&socket.u<=1&&socket.v>=0&&socket.v<=1);
  }
  assert.equal(weaponSocket(classId,gender,'walk',8),weaponSocket(classId,gender,'walk',0));
  assert.equal(weaponSocket(classId,gender,'idle',7),weaponSockets[classId][gender].idle);
 }
});

test('이단참(skill 1) draws two mirrored silver crescents and a gold ground shockwave as add-blended sprites',()=>{
 const texture=(width,height)=>new Texture({source:Texture.EMPTY.source,frame:new Rectangle(0,0,width,height)});
 const cast=(rarity,age=.1,screenAngle=.4)=>{
  const save=freshSave();
  if(rarity)save.equipment.weapon={...item('weapon','두손검'),rarity};
  const skillVfx=new Container();
  const view={save,skillVfx,vfxSprites:new Map(),textures:{fxSlash2Dual:texture(512,122),fxSlash2Ground:texture(384,131)},effects:{arc(){throw new Error('이단참은 코드 선 대신 스프라이트로 그린다');}}};
  assert.equal(drawSkillVfx.call(view,{save},{kind:'slash2',age,duration:.55},100,200,Math.min(1,age/.55),screenAngle,0),true);
  const [first,back,shock]=view.vfxSprites.get([...view.vfxSprites.keys()][0]);
  return {first,back,shock,save,skillVfx};
 };
 const mid=cast('rare',.25);
 assert.equal(mid.skillVfx.children.length,3,'정방향·되받아 검기 두 장 + 지면 충격파');
 assert.deepEqual(mid.skillVfx.children.map(child=>child.blendMode),['add','add','add'],'all layers use add blending');
 assert.equal(mid.first.rotation,.4-1.15,'the first crescent crosses the swing direction');
 assert.equal(mid.back.rotation,.4+.55,'the backhand crescent crosses the first');
 assert(mid.back.scale.x<0,'the backhand crescent is mirrored left-to-right');
 assert.equal(mid.shock.rotation,0,'the ground shockwave stays flat on the floor');
 assert(mid.first.alpha>.9,'the first crescent is brightest mid swing');
 assert(cast('rare',0).first.alpha<1e-9,'the first crescent starts invisible');
 assert(cast('rare',.55).first.alpha<1e-9,'the first crescent is gone by the end');
 assert(cast('rare',.02).back.alpha<1e-9,'the backhand waits for the second hit');
 assert(cast('rare',.3).back.alpha>.8,'the backhand is bright after the 0.18s hit');
 assert(mid.shock.scale.y<mid.shock.scale.x,'the shockwave is squashed onto the ground plane');
 const common=cast('common',.1).first,legendary=cast('legendary',.1).first;
 assert(Math.abs(legendary.scale.x)>Math.abs(common.scale.x),'a higher weapon rarity sweeps wider');
 const bare=cast(null,.1);
 assert.equal(bare.first.tint,0xffffff,'unarmed keeps the approved silver and gold colours');
 assert.equal(bare.save.equipment.weapon,undefined);
 assert.equal(weaponSlashColor({save:bare.save}),0xffffff);
 assert.equal(slashTint({save:bare.save}),0xffffff);
 const tinted=cast('legendary',.1).first.tint;
 assert.notEqual(tinted,0xffffff,'an equipped weapon leaves a faint rarity tint');
 for(const shift of [16,8,0])assert((tinted>>shift&255)>200,'the tint only leans the silver colour, it does not repaint it');
 const colours=[['common',0x9ca3af],['magic',0x60a5fa],['rare',0xfacc15],['epic',0xc084fc],['unique',0xfb923c],['legendary',0xf87171]];
 for(const [rarity,color] of colours){const save=freshSave();save.equipment.weapon={...item('weapon','두손검'),rarity};assert.equal(weaponSlashColor({save}),color);}
});

test('only skills leave afterimages, the basic attack does not',()=>{
 const hero=new Sprite(Texture.EMPTY);
 const view={hero,ghosts:new Container(),afterimages:[],ghostEmissions:new WeakMap(),heroLayer:{scale:{x:1,y:1},rotation:0}};
 const effect=kind=>({kind,x:0,y:0,age:0,duration:.3,angle:0,nextHit:0,power:1,level:1});
 const project=(x,y)=>[x,y];
 const basic={effects:[effect('slash'),effect('slash2')],player:{x:0,y:0,facing:0}};
 updateAfterimages.call(view,basic,project,.016);
 assert.equal(view.afterimages.length,0,'기본 공격은 잔상을 남기지 않는다');
 const skill={effects:[effect('spin')],player:{x:0,y:0,facing:0}};
 updateAfterimages.call(view,skill,project,.016);
 assert.equal(view.afterimages.length,1,'스킬은 잔상을 남긴다');
 view.ghosts.destroy({children:true});
 hero.destroy();
});

test('skill 2 circles the blue dragon at a slow, heavy pace on a lit floor',()=>{
 const texture=(width,height)=>new Texture({source:Texture.EMPTY.source,frame:new Rectangle(0,0,width,height)});
 const head=texture(160,138),body=texture(128,57);
 const skillVfx=new Container(),dragonBack=new Container(),floor=[];
 const view={app:{screen:{width:390,height:844}},textures:{fxDragonHead:head,fxDragonBody:body},skillVfx,dragonBack,vfxSprites:new Map(),
  glow:{ellipse(){return {fill(){floor.push('glow');}};}},ground:{ellipse(){return {stroke(){floor.push('ring');}};}}};
 const effect={kind:'spin',level:4,age:0,duration:1,angle:0,x:0,y:0};
 view.drawDragon=(...args)=>drawDragon.call(view,...args);
 const draw=(age,progress)=>{effect.age=age;drawSkillVfx.call(view,{save:freshSave()},{...effect},195,520,progress,0,0);return view.vfxSprites.get([...view.vfxSprites.keys()].at(-1));};
 const sprites=draw(0,.1);
 assert.equal(sprites.length,13,'level 4 dragon is a head plus twelve body segments');
 assert.equal(sprites[0].texture,head);
 assert(sprites.slice(1).every(sprite=>sprite.texture===body));
 assert(sprites.every(sprite=>sprite.blendMode==='add'),'the blue dragon is drawn additively on black');
 const slow=draw(.1,0)[0].rotation-draw(0,0)[0].rotation;
 const fast=Math.PI*2*.1/1.1;
 assert(Math.abs(slow-Math.PI*2*.1/2.4)<1e-6,'one revolution now takes 2.4 seconds');
 assert(slow<fast*.5,'the dragon circles at less than half its old speed');
 assert.equal(floor.filter(entry=>entry==='glow').length>0,true,'a blue floor light burns under the circling dragon');
 assert.equal(floor.filter(entry=>entry==='ring').length>0,true,'the swirl throws blue rings onto the ground');
 skillVfx.destroy({children:true});dragonBack.destroy({children:true});
});

for (const gender of ['male', 'female']) test(`${gender}: field keeps the generated pilot sheet for every equipment set without drawing a second weapon`, () => {
 const save=freshSave(gender);
 save.equipment={weapon:item('weapon','낡은 두손검'),helmet:item('helmet','철제 바시넷'),armor:item('armor','사슬 갑옷'),gloves:item('gloves','강철 건틀릿'),boots:item('boots','기사의 사바톤')};
 const before=JSON.stringify(save.equipment);
 const idleKey=gender==='female'?'pilotFemale':'pilotMale';
 const walkKey=gender==='female'?'pilotFemaleWalk':'pilotMaleWalk';
 const attackKey=gender==='female'?'pilotFemaleAttack':'pilotMaleAttack';
 const idle=Texture.EMPTY,walk=Array.from({length:8},()=>new Texture({source:Texture.EMPTY.source})),attack=Array.from({length:4},()=>new Texture({source:Texture.EMPTY.source}));
 const layer=new Container(),hero=new Sprite(Texture.EMPTY);layer.addChild(hero);
 const view={hero,heroLayer:layer,heroGear:new Map(),gearTextures:new Map(),gearLoading:new Set(),lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[idleKey]:idle},animations:{[walkKey]:walk,[attackKey]:attack},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}},glow:{circle(){return {fill(){}};}},armorFrame:()=>undefined,prefetchBody:()=>{},lastBodyTier:'',swordlessBodyFrame:()=>undefined,weaponPart:()=>undefined,prefetchWeapon:()=>{},lastWeaponTier:0,heroWeapon:undefined};
 const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0,berserkLevel:0},activeMove:{x:0,y:0},attackPose:0,effects:[]};
 drawHero.call(view,world,100,100,0);
 assert.equal(hero.texture,idle,'idle uses the matching gender pilot image');
 assert.equal(view.heroGear.size,0,'baked-in greatsword is not overdrawn from equipment art');
 assert.equal(layer.children.length,1);
 world.activeMove.x=1;world.player.x=1;drawHero.call(view,world,100,100,.1);
 assert.equal(hero.texture,walk[0],'walk selects a pilot walk cell');
 world.activeMove.x=0;world.attackPose=.16;drawHero.call(view,world,100,100,.2);
 assert.equal(hero.texture,attack[2],'attack selects one of the four approved key poses');
 assert.equal(view.heroGear.size,0);
 assert.equal(JSON.stringify(save.equipment),before,'equipment ownership and stats stay unchanged');
 layer.destroy({children:true});
});
