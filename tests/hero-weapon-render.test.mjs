import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero,updateAfterimages}=await import('../src/game/render/entities.ts');
const {freshSave}=await import('../src/game/store.ts');
const {weaponSockets,weaponSocket,heroClass}=await import('../src/game/render/heroSockets.ts');
const {drawSkillVfx,weaponSlashColor}=await import('../src/game/render/vfx.ts');

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

test('two-layer skill slash follows equipped weapon rarity and unarmed white',()=>{
 const samples=[['common',0x9ca3af],['magic',0x60a5fa],['rare',0xfacc15],['epic',0xc084fc],['unique',0xfb923c],['legendary',0xf87171]];
 const widths=[];
 for(const [rarity,color] of samples){
  const save=freshSave();save.equipment.weapon={...item('weapon','두손검'),rarity};
  const strokes=[];const view={effects:{arc(){return {stroke(style){strokes.push(style);}};}}};
  assert.equal(weaponSlashColor({save}),color);
  assert.equal(drawSkillVfx.call(view,{save},{kind:'slash2'},0,0,.5,0,0),true);
  assert.equal(strokes.length,2);assert(strokes.every(style=>style.color===color));
  widths.push(strokes[0].width);
 }
 assert(widths.at(-1)>widths[0]);
 const save=freshSave(),strokes=[];
 const view={effects:{arc(){return {stroke(style){strokes.push(style);}};}}};
 assert.equal(weaponSlashColor({save}),0xffffff);
 drawSkillVfx.call(view,{save},{kind:'slash2'},0,0,.5,0,0);
 assert(strokes.every(style=>style.color===0xffffff));
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