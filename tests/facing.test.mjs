import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { enemyFacing }=await import('../src/game/facing.ts');
test('left-facing original monster art is flipped when approaching a target on screen-right',()=>{
  assert.equal(enemyFacing({x:-100,y:0},{x:0,y:0}),-1);
  assert.equal(enemyFacing({x:0,y:100},{x:0,y:0}),-1);
});
test('target on screen-left keeps the source facing direction',()=>{
  assert.equal(enemyFacing({x:100,y:0},{x:0,y:0}),1);
  assert.equal(enemyFacing({x:0,y:-100},{x:0,y:0}),1);
});
test('isometric diagonal alignment preserves the previous direction to avoid flicker',()=>{
  assert.equal(enemyFacing({x:100,y:100},{x:0,y:0},-1),-1);
  assert.equal(enemyFacing({x:100,y:103},{x:0,y:0},1),1);
});
