import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero,updateAfterimages}=await import('../src/game/render/entities.ts');
const {heroAppearance}=await import('../src/game/appearance.ts');
const {freshSave}=await import('../src/game/store.ts');
const {wearableEquipmentImage}=await import('../src/game/items.ts');

const item=(slot,name)=>({id:slot,slot,name,rarity:'common',stats:{}});
const visibleSlots=['weapon','helmet','armor','gloves','boots'];

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

for(const gender of ['male','female'])test(`${gender}: unique helmet, armor, gloves, boots and weapon art stays visible in idle, walk and attack`,()=>{
 for(const moving of [false,true])for(const attackPose of [0,.08,.16,.24,.32]){
  const save=freshSave(gender);save.equipment={weapon:item('weapon','낡은 두손검'),helmet:item('helmet','철제 바시넷'),armor:item('armor','사슬 갑옷'),gloves:item('gloves','강철 건틀릿'),boots:item('boots','기사의 사바톤')};
  const before=JSON.stringify(save.equipment),appearance=heroAppearance({...save,equipment:{...save.equipment,helmet:undefined,armor:undefined}}),gearTextures=new Map();
  for(const equipped of Object.values(save.equipment)){const art=wearableEquipmentImage(equipped);gearTextures.set(`${art.path}:${art.frame}`,Texture.EMPTY);}
  const layer=new Container(),hero=new Sprite(Texture.EMPTY);layer.addChild(hero);
  const view={hero,heroLayer:layer,heroGear:new Map(),gearTextures,gearLoading:new Set(),lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[appearance.idle]:Texture.EMPTY},animations:{[appearance.walk]:Array(8).fill(Texture.EMPTY),[appearance.attack]:Array(4).fill(Texture.EMPTY)},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}},glow:{circle(){return {fill(){}};}}};
  const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0},activeMove:{x:moving?1:0,y:0},attackPose,effects:[]};
  drawHero.call(view,world,100,100,0);
  assert.equal(layer.children.length,visibleSlots.length+1);
  assert.deepEqual([...view.heroGear.keys()].sort(),visibleSlots.slice().sort());
  for(const slot of visibleSlots){const art=wearableEquipmentImage(save.equipment[slot]);assert.equal(view.heroGear.get(slot).path,`${art.path}:${art.frame}`);}
  for(const slot of visibleSlots){const sprite=view.heroGear.get(slot).sprite;assert(Number.isFinite(sprite.width)&&Number.isFinite(sprite.height));assert(Number.isFinite(sprite.position.x)&&Number.isFinite(sprite.position.y));}
  if(!moving&&attackPose>0){assert(Number.isFinite(view.heroGear.get('weapon').sprite.rotation));}
  assert.equal(JSON.stringify(save.equipment),before);
  if(!moving&&attackPose===0){
   const oldHelmet=view.heroGear.get('helmet').path;
   save.equipment.helmet=item('helmet','기사 헬름');
   const replacement=wearableEquipmentImage(save.equipment.helmet);gearTextures.set(`${replacement.path}:${replacement.frame}`,Texture.EMPTY);
   drawHero.call(view,world,100,100,0);
   assert.notEqual(view.heroGear.get('helmet').path,oldHelmet,'helmet swap replaces the displayed item art');
   assert.equal(view.heroGear.get('helmet').path,`${replacement.path}:${replacement.frame}`);
   assert.equal(layer.children.length,visibleSlots.length+1);
  }
  layer.destroy({children:true});
 }
});
