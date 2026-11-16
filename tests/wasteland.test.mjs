import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { wastelandScene, wastelandLayout, placeWasteland }=await import('../src/game/wasteland.ts');
test('painted scene dimensions match the approved background asset',()=>{
  const png=readFileSync(new URL('../public/assets/wasteland-scene.png',import.meta.url));assert.equal(png.readUInt32BE(16),wastelandScene.width);assert.equal(png.readUInt32BE(20),wastelandScene.height);
});
test('all three flame glows remain aligned with the picture as the viewport changes',()=>{
  for(const [width,height] of [[360,780],[540,914],[320,568]]){
    const layout=wastelandLayout(width,height);assert.equal(layout.fires.length,3);assert.equal(layout.fires[0].x,width*.5);assert.equal(layout.fires[1].y,height*.30);assert.equal(layout.fires[2].x,width*.176);
    assert.equal(layout.scaleX*wastelandScene.width,width);assert.equal(layout.scaleY*wastelandScene.height,height);
  }
});
test('scene placement cancels scrolling/repetition and hides duplicate procedural props',()=>{
  const view={app:{screen:{width:540,height:914}},floor:{tileScale:{set(x,y){this.x=x;this.y=y;}},tilePosition:{set(x,y){this.x=x;this.y=y;}}},terrainLayer:{visible:true}};
  placeWasteland(view);assert.equal(view.terrainLayer.visible,false);assert.equal(view.floor.tilePosition.x,0);assert.equal(view.floor.tilePosition.y,0);assert.equal(view.floor.width,540);assert.equal(view.floor.height,914);
});
