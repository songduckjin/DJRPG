import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {captureLootGround,projectLootGround}=await import('../src/game/lootGround.ts');
const {wastelandLayout}=await import('../src/game/wasteland.ts');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('resting gold and equipment follow the exact same ground pixels as both camera axes pan',()=>{
 const screen={width:540,height:914},start={x:0,y:0},point={x:320,y:470},anchor=captureLootGround(point,screen,start);
 for(const player of [{x:80,y:-30},{x:-90,y:-90},{x:90,y:90}]){
 const drawn=projectLootGround(anchor,screen,player),a=wastelandLayout(540,914,start),b=wastelandLayout(540,914,player);
 near(drawn.x-point.x,b.offsetX-a.offsetX);near(drawn.y-point.y,b.offsetY-a.offsetY);
 const sameStone=captureLootGround(drawn,screen,player);near(sameStone.x,anchor.x);near(sameStone.y,anchor.y);
 }
});
test('a floor-anchored drop stays fixed while camera is clamped at the scene edge',()=>{
 const screen={width:390,height:844},anchor=captureLootGround({x:190,y:400},screen,{x:0,y:0});
 const a=projectLootGround(anchor,screen,{x:10000,y:0}),b=projectLootGround(anchor,screen,{x:20000,y:0});
 near(a.x,b.x);near(a.y,b.y);
});
test('resize and stationary redraw preserve the same ground coordinate for icon and shadow',()=>{
 const player={x:40,y:-20},original={width:540,height:914},point={x:250,y:430},anchor=captureLootGround(point,original,player);
 const same=projectLootGround(anchor,original,player);near(same.x,point.x);near(same.y,point.y);
 for(const screen of [{width:320,height:568},{width:390,height:844}]){
 const p=projectLootGround(anchor,screen,player),again=captureLootGround(p,screen,player);near(again.x,anchor.x);near(again.y,anchor.y);
 }
});
