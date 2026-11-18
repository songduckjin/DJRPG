import './ts-loader.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {CanvasMeshFallbackPipe}=await import('../src/game/pixiSetup.ts');
const {MeshPlane,Texture}=await import('pixi.js');
test('Canvas fallback submits a textured mesh as a drawable quad without a GPU mesh pipe',()=>{
 let quad;const batch={addToBatch(value){quad=value;value._batcher={checkAndUpdateTexture:()=>true,updateElement(){}};}};
 const renderer={uid:901,_roundPixels:0,renderPipes:{batch}};
 const pipe=new CanvasMeshFallbackPipe(renderer),mesh=new MeshPlane({texture:Texture.WHITE,verticesX:3,verticesY:3});
 pipe.addRenderable(mesh,{});assert.equal(quad.packAsQuad,true);assert.equal(quad.texture,Texture.WHITE);assert(quad.bounds.maxX>quad.bounds.minX);assert.equal(pipe.validateRenderable(mesh),false);
 mesh.destroy();pipe.destroy();
});
