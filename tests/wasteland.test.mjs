import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { wastelandScene, wastelandCore, wastelandLayout, placeWasteland }=await import('../src/game/wasteland.ts');
const { arenaLimits }=await import('../src/game/arena.ts');
test('painted scene dimensions match the approved background asset',()=>{
  const png=readFileSync(new URL(`../public${wastelandScene.path}`,import.meta.url));assert.equal(png.readUInt32BE(16),wastelandScene.width);assert.equal(png.readUInt32BE(20),wastelandScene.height);assert.equal(wastelandScene.width,637);assert.equal(wastelandScene.height,1079);
});
test('all three flame glows remain aligned with the moving picture as the viewport changes',()=>{
  for(const [width,height] of [[360,780],[540,914],[320,568]]){
    for(const player of [{x:0,y:0},{x:60,y:-60},{x:-60,y:60},{x:90,y:90},{x:-90,y:-90}]){
      const layout=wastelandLayout(width,height,player);
      const sceneWidth=layout.scaleX*wastelandScene.width,sceneHeight=layout.scaleY*wastelandScene.height;
      assert.equal(layout.fires.length,3);
      assert(Math.abs(layout.fires[0].x-(layout.offsetX+(wastelandCore.x+wastelandCore.width*.5)*layout.scaleX))<1e-8);
      assert(Math.abs(layout.fires[1].y-(layout.offsetY+(wastelandCore.y+wastelandCore.height*.30)*layout.scaleY))<1e-8);
      assert(Math.abs(layout.fires[2].x-(layout.offsetX+(wastelandCore.x+wastelandCore.width*.176)*layout.scaleX))<1e-8);
      assert(layout.fires[0].y>0);
      assert(layout.offsetX<=0 && layout.offsetX+sceneWidth>=width-1e-8);
      assert(layout.offsetY<=0 && layout.offsetY+sceneHeight>=height-1e-8);
    }
  }
});
test('original unzoomed core fits the viewport and added borders preserve camera panning',()=>{
  for(const [width,height] of [[320,568],[390,844],[540,914]]){
    const center=wastelandLayout(width,height);
    const right=wastelandLayout(width,height,{x:arenaLimits.horizontal/2,y:-arenaLimits.horizontal/2});
    const left=wastelandLayout(width,height,{x:-arenaLimits.horizontal/2,y:arenaLimits.horizontal/2});
    assert(Math.abs(center.scaleX*wastelandCore.width-width)<1e-8);assert(Math.abs(center.scaleY*wastelandCore.height-height)<1e-8);
    assert.equal(center.offsetX+wastelandCore.x*center.scaleX,0);assert.equal(center.offsetY+wastelandCore.y*center.scaleY,0);
    assert(right.offsetX<center.offsetX);assert(left.offsetX>center.offsetX);
    assert(right.offsetX+right.scaleX*wastelandScene.width>=width-1e-8);
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
test('at the reference viewport original pixels render 1:1 and both camera axes can move',()=>{
  const center=wastelandLayout(540,914);assert.equal(center.scaleX,1);assert.equal(center.scaleY,1);
  assert.equal(center.offsetX,-48);assert.equal(center.offsetY,-82);
  const down=wastelandLayout(540,914,{x:90,y:90}),up=wastelandLayout(540,914,{x:-90,y:-90});
  assert(down.offsetY<center.offsetY);assert(up.offsetY>center.offsetY);
  for(const layout of [center,down,up]){assert(layout.offsetY<=0);assert(layout.offsetY+1079>=914);}
});
