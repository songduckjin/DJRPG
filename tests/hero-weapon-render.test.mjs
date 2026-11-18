import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero,updateAfterimages}=await import('../src/game/render/entities.ts');
const {heroAppearance}=await import('../src/game/appearance.ts');
const {freshSave}=await import('../src/game/store.ts');
const {wearableEquipmentImage}=await import('../src/game/items.ts');
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

for(const gender of ['male','female'])test(`${gender}: integrated armor and helmet body has one socket weapon in idle and walk`,()=>{
 for(const moving of [false,true])for(const attackPose of [0,.08,.16,.24,.32]){
  const save=freshSave(gender);save.equipment={weapon:item('weapon','낡은 두손검'),helmet:item('helmet','철제 바시넷'),armor:item('armor','사슬 갑옷'),gloves:item('gloves','강철 건틀릿'),boots:item('boots','기사의 사바톤')};
  const before=JSON.stringify(save.equipment),appearance=heroAppearance(save),gearTextures=new Map();
  const weaponArt=wearableEquipmentImage(save.equipment.weapon);gearTextures.set(`${weaponArt.path}:${weaponArt.frame}`,Texture.EMPTY);
  const layer=new Container(),hero=new Sprite(Texture.EMPTY);layer.addChild(hero);
  const view={hero,heroLayer:layer,heroGear:new Map(),gearTextures,gearLoading:new Set(),lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[appearance.idle]:Texture.EMPTY},animations:{[appearance.walk]:Array(8).fill(Texture.EMPTY),[appearance.attack]:Array(4).fill(Texture.EMPTY)},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}},glow:{circle(){return {fill(){}};}}};
  const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0},activeMove:{x:moving?1:0,y:0},attackPose,effects:[]};
  drawHero.call(view,world,100,100,0);
  assert.equal(layer.children.length,2);
  assert.deepEqual([...view.heroGear.keys()],['weapon']);
  const sprite=view.heroGear.get('weapon').sprite;
  assert.equal(view.heroGear.get('weapon').path,`${weaponArt.path}:${weaponArt.frame}`);
  assert.equal(sprite.visible,moving||attackPose===0);
  assert(Number.isFinite(sprite.width)&&Number.isFinite(sprite.height)&&Number.isFinite(sprite.rotation));
  assert(Number.isFinite(sprite.position.x)&&Number.isFinite(sprite.position.y));
  assert.equal(JSON.stringify(save.equipment),before);
  if(!moving&&attackPose===0){
   const oldWeapon=view.heroGear.get('weapon').path;
   save.equipment.weapon=item('weapon','바스타드 소드');
   const replacement=wearableEquipmentImage(save.equipment.weapon);gearTextures.set(`${replacement.path}:${replacement.frame}`,Texture.EMPTY);
   drawHero.call(view,world,100,100,0);
   assert.notEqual(view.heroGear.get('weapon').path,oldWeapon,'weapon swap replaces the socket art');
   assert.equal(view.heroGear.get('weapon').path,`${replacement.path}:${replacement.frame}`);
   assert.equal(layer.children.length,2);
   save.equipment.weapon=undefined;
   drawHero.call(view,world,100,100,0);
   assert.equal(view.heroGear.size,0);
   assert.equal(layer.children.length,1);
  }
  layer.destroy({children:true});
 }
});

for(const gender of ['male','female'])test(`${gender}: unarmored sword uses the existing swordless body in idle and walk`,()=>{
 for(const helmet of [false,true]){
  const save=freshSave(gender);save.equipment.weapon=item('weapon','두손검');
  if(helmet)save.equipment.helmet=item('helmet','철제 바시넷');
  const swordless=heroAppearance({...save,equipment:{...save.equipment,weapon:undefined}});
  const armed=heroAppearance(save);
  assert.notEqual(swordless.idle,armed.idle);
  const weaponArt=wearableEquipmentImage(save.equipment.weapon),gearTextures=new Map([[`${weaponArt.path}:${weaponArt.frame}`,Texture.EMPTY]]);
  const layer=new Container(),hero=new Sprite(Texture.EMPTY);layer.addChild(hero);
  const view={hero,heroLayer:layer,heroGear:new Map(),gearTextures,gearLoading:new Set(),lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[swordless.idle]:Texture.EMPTY},animations:{[swordless.walk]:Array(8).fill(Texture.EMPTY),[armed.attack]:Array(4).fill(Texture.EMPTY)},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}},glow:{circle(){return {fill(){}};}}};
  const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0},activeMove:{x:0,y:0},attackPose:0,effects:[]};
  drawHero.call(view,world,100,100,0);
  assert.equal(view.heroGear.get('weapon').sprite.visible,true);
  world.activeMove.x=1;drawHero.call(view,world,100,100,0);
  assert.equal(view.heroGear.get('weapon').sprite.visible,true);
  world.activeMove.x=0;world.attackPose=.16;drawHero.call(view,world,100,100,0);
  assert.equal(view.heroGear.get('weapon').sprite.visible,false);
  layer.destroy({children:true});
 }
});
