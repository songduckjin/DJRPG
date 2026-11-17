import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import './ts-loader.mjs';
const {drawHero}=await import('../src/game/render/entities.ts');
const {heroAppearance}=await import('../src/game/appearance.ts');
const {freshSave,equipmentImage}=await import('../src/game/store.ts');
for(const gender of ['male','female'])test(`${gender}: idle walk and attack draw the integrated sword without a floating inventory weapon`,()=>{
 for(const helmet of [false,true])for(const armor of [false,true])for(const moving of [false,true])for(const attackPose of [0,.16]){
  const save=freshSave(gender);save.equipment={weapon:{id:'sword',slot:'weapon',name:'낡은 두손검',rarity:'common',stats:{attack:5}}};
  if(helmet)save.equipment.helmet={id:'helmet',slot:'helmet',name:'철제 바시넷',rarity:'common',stats:{}};
  if(armor)save.equipment.armor={id:'armor',slot:'armor',name:'사슬 갑옷',rarity:'common',stats:{}};
  const before=JSON.stringify(save.equipment),appearance=heroAppearance(save),layer=new Container(),old=new Sprite(Texture.EMPTY);layer.addChild(old);
  const gearTextures=new Map();for(const item of Object.values(save.equipment)){const art=equipmentImage(item);gearTextures.set(`${art.path}:${art.frame}`,Texture.EMPTY);}
  const view={hero:{texture:Texture.EMPTY,anchor:{y:0}},heroLayer:layer,heroGear:new Map([['weapon',{path:'old-weapon',sprite:old}]]),gearTextures,gearLoading:new Set(),lastHeroWorld:{x:0,y:0},heroWalkDistance:0,textures:{[appearance.idle]:Texture.EMPTY},animations:{[appearance.walk]:Array(8).fill(Texture.EMPTY),[appearance.attack]:Array(4).fill(Texture.EMPTY)},app:{screen:{height:800}},ground:{ellipse(){return {fill(){}};}}};
  const world={save,player:{x:0,y:0,facingSide:1,facing:0,hit:0,berserk:0},activeMove:{x:moving?1:0,y:0},attackPose,effects:[]};
  drawHero.call(view,world,100,100,0);
  assert.equal(view.heroGear.has('weapon'),false);assert.equal(old.destroyed,true);assert.equal(view.gearLoading.size,0);assert.equal(JSON.stringify(save.equipment),before);
  if(armor)assert(view.heroGear.has('armor'));
  layer.destroy({children:true});
 }
});
