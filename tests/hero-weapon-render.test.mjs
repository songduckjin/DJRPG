import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero}=await import('../src/game/render/entities.ts');
const {heroAppearance}=await import('../src/game/appearance.ts');
const {freshSave}=await import('../src/game/store.ts');

const item=(slot,name)=>({id:slot,slot,name,rarity:'common',stats:{}});
const inventoryOnlySlots=['offhand','armor','gloves','belt','boots','necklace','ring1','ring2'];

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
