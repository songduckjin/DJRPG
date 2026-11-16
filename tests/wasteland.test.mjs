import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { wastelandScene, wastelandLayout, placeWasteland }=await import('../src/game/wasteland.ts');
const { arenaLimits }=await import('../src/game/arena.ts');
test('painted scene dimensions match the approved background asset',()=>{
  const png=readFileSync(new URL('../public/assets/wasteland-scene.png',import.meta.url));assert.equal(png.readUInt32BE(16),wastelandScene.width);assert.equal(png.readUInt32BE(20),wastelandScene.height);
});
test('all three flame glows remain aligned with the moving picture as the viewport changes',()=>{
  for(const [width,height] of [[360,780],[540,914],[320,568]]){
    for(const player of [{x:0,y:0},{x:60,y:-60},{x:-60,y:60},{x:90,y:90},{x:-90,y:-90}]){
      const layout=wastelandLayout(width,height,player);
      const sceneWidth=layout.scaleX*wastelandScene.width,sceneHeight=layout.scaleY*wastelandScene.height;
      assert.equal(layout.fires.length,3);
      assert(Math.abs(layout.fires[0].x-(layout.offsetX+sceneWidth*.5))<1e-8);
      assert(Math.abs(layout.fires[1].y-(layout.offsetY+sceneHeight*.30))<1e-8);
      assert(Math.abs(layout.fires[2].x-(layout.offsetX+sceneWidth*.176))<1e-8);
      assert(layout.fires[0].y>0);
      assert(layout.offsetX<=0 && layout.offsetX+sceneWidth>=width);
      assert(layout.offsetY<=0 && layout.offsetY+sceneHeight>=height);
    }
  }
});
test('player movement pans the painted scene without exposing its edges',()=>{
  for(const [width,height] of [[320,568],[390,844],[540,914]]){
    const center=wastelandLayout(width,height);
    const right=wastelandLayout(width,height,{x:arenaLimits.horizontal/2,y:-arenaLimits.horizontal/2});
    const left=wastelandLayout(width,height,{x:-arenaLimits.horizontal/2,y:arenaLimits.horizontal/2});
    assert(right.offsetX<center.offsetX && left.offsetX>center.offsetX);
    assert(right.offsetX+right.scaleX*wastelandScene.width>=width);
    assert(left.offsetX<=0);
  }
});
test('scene placement keeps the painted layer and procedural props in sync',()=>{
  const view={app:{screen:{width:540,height:914}},floor:{tileScale:{set(x,y){this.x=x;this.y=y;}},tilePosition:{set(x,y){this.x=x;this.y=y;}}},ambientLayer:{position:{set(x,y){this.x=x;this.y=y;}}},terrainLayer:{visible:true}};
  const player={x:40,y:0};placeWasteland(view,player);
  const layout=wastelandLayout(540,914,player);
  assert.equal(view.terrainLayer.visible,false);
  assert.equal(view.floor.tilePosition.x,layout.offsetX);assert.equal(view.floor.tilePosition.y,layout.offsetY);
  assert.equal(view.ambientLayer.position.x,layout.offsetX);assert.equal(view.ambientLayer.position.y,layout.offsetY);
  assert.equal(view.floor.width,540);assert.equal(view.floor.height,914);
});
