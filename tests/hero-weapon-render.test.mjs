import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero,updateAfterimages}=await import('../src/game/render/entities.ts');
const {heroAppearance}=await import('../src/game/appearance.ts');
const {freshSave}=await import('../src/game/store.ts');

const item=(slot,name)=>({id:slot,slot,name,rarity:'common',stats:{}});
const inventoryOnlySlots=['offhand','armor','gloves','belt','boots','necklace','ring1','ring2'];

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

for(const gender of ['male','female'])test(`${gender}: the body sprite carries every equipped slot without an inventory sticker`,()=>{
 for(const helmet of [false,true])for(const armor of [false,true])for(const moving of [false,true])for(const attackPose of [0,.16]){
  const save=freshSave(gender);save.equipment={weapon:item('weapon','낡은 두손검')};
  if(helmet)save.equipment.helmet=item('helmet','철제 바시넷');
  if(armor)save.equipment.armor=item('armor','사슬 갑옷');
  for(const slot of inventoryOnlySlots)if(slot!=='armor'||armor)save.equipment[slot]=item(slot,slot);
  const before=JSON.stringify(save.equipment),appearance=heroAppearance(save);
  const layer=new Container(),hero=new Sprite(Texture.EMPTY);layer.addChild(hero);
  const view={hero,heroLayer:layer,lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[appearance.idle]:Texture.EMPTY},animations:{[appearance.walk]:Array(8).fill(Texture.EMPTY),[appearance.attack]:Array(4).fill(Texture.EMPTY)},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}},glow:{circle(){return {fill(){}};}}};
  const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0},activeMove:{x:moving?1:0,y:0},attackPose,effects:[]};
  drawHero.call(view,world,100,100,0);
  assert.equal(layer.children.length,1,'only the hero sprite belongs on the hero layer');
  assert.equal(layer.children[0],hero);
  assert.equal(JSON.stringify(save.equipment),before);
  layer.destroy({children:true});
 }
});
