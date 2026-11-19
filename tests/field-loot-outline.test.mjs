import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {lootSilhouette}=await import('../src/game/render/lootOutline.ts');
test('dark item pixels produce full grade-colour edges instead of multiplied black edges',()=>{
 const source=new Uint8ClampedArray([5,3,2,255,0,0,0,128,255,255,255,0]),before=source.slice();
 const edge=lootSilhouette(source,0x2f7bff);
 assert.deepEqual([...edge],[47,123,255,255,47,123,255,128,47,123,255,0]);assert.deepEqual(source,before);
});
test('all dungeon grade inks preserve silhouette alpha including transparent holes',()=>{
 const source=new Uint8ClampedArray([0,0,0,0,10,10,10,70,220,210,200,255]);
 for(const ink of [0xcdd6e0,0x2f7bff,0xffd400,0xa855f7,0xff8a00,0xff2d2d]){
 const result=lootSilhouette(source,ink);assert.deepEqual([result[3],result[7],result[11]],[0,70,255]);
 assert.deepEqual([...result.slice(4,7)],[(ink>>16)&255,(ink>>8)&255,ink&255]);
 }
});
