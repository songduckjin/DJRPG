import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { ambientInfluence, ambientOffset, AmbientDeformation, grassPatches, fireFlicker, fireEmbers }=await import('../src/game/ambientMotion.ts');
const { wastelandLayout, wastelandFireAnchors }=await import('../src/game/wasteland.ts');
const fires=wastelandFireAnchors;
function geometry(){const points=[];for(let y=0;y<165;y++)for(let x=0;x<97;x++)points.push(x*964/96,y*1632/164);return new Float32Array(points);}
test('scene edges, clear ground, main rocks and all vegetation roots remain anchored',()=>{
  for(const [u,v] of [[0,.5],[1,.5],[.5,0],[.5,1],[.5,.45],[.4,.3],[.48,.15],[.03,.08],[.93,.08]])assert.equal(ambientInfluence(u,v,fires),undefined,`${u},${v}`);
  for(const [x,root] of grassPatches)assert.equal(ambientInfluence(x,root,fires),undefined,`root ${x},${root}`);
  for(const fire of fires)assert.equal(ambientInfluence(fire.x,fire.y,fires),undefined);
});
test('grass tips sway slowly while fire tips flutter faster, with bounded source-pixel displacement',()=>{
  const [x,root,,height]=grassPatches[0],grass=ambientInfluence(x,root-height*.7,fires);
  const fire=ambientInfluence(fires[1].x,fires[1].y-.024,fires);assert.equal(grass.kind,'grass');assert.equal(fire.kind,'fire');
  assert.notDeepEqual(ambientOffset(grass,1),ambientOffset(grass,2));assert.notDeepEqual(ambientOffset(fire,1),ambientOffset(fire,1.05));
  for(const influence of [grass,fire])for(let step=0;step<1000;step++){
    const offset=ambientOffset(influence,step*.07);assert(Math.abs(offset.x)<=(influence.kind==='grass'?13:5.1));assert(Math.abs(offset.y)<=(influence.kind==='grass'?.45:4.5));
  }
  assert.deepEqual(ambientOffset(grass,1,false),{x:0,y:0});
});
test('deformation changes only a small cached subset and never accumulates movement or damages the source coordinates',()=>{
  const positions=geometry(),original=positions.slice(),motion=new AmbientDeformation(positions,964,1632,fires);
  assert(motion.animatedVertices>100);assert(motion.animatedVertices<positions.length/2*.15);
  motion.apply(1.25);const first=positions.slice();assert.notDeepEqual(first,original);
  motion.apply(20);motion.apply(1.25);assert.deepEqual(positions,first);
  let untouched=0;for(let index=0;index<positions.length;index+=2)if(positions[index]===original[index]&&positions[index+1]===original[index+1])untouched++;
  assert(untouched>positions.length/2*.85);
  motion.apply(0,false);assert.deepEqual(positions,original);
});
test('equal animation time has equal coordinates regardless of update frequency',()=>{
  const slow=geometry(),fast=geometry(),a=new AmbientDeformation(slow,964,1632,fires),b=new AmbientDeformation(fast,964,1632,fires);
  for(let frame=1;frame<=30;frame++)a.apply(frame/30);
  for(let frame=1;frame<=60;frame++)b.apply(frame/60);
  assert.deepEqual(slow,fast);
});
test('light flicker is asynchronous and embers stay bounded with finite lifetimes',()=>{
  assert.notEqual(fireFlicker(0,1),fireFlicker(1,1));
  for(let t=0;t<10;t+=.1)for(let index=0;index<3;index++){
    const light=fireFlicker(index,t);assert(light>=.76&&light<=1.08);
    const particles=fireEmbers(index,t);assert.equal(particles.length,3);
    for(const p of particles){assert(Math.abs(p.x)<=6);assert(p.y>=-40&&p.y<=0);assert(p.alpha>=0&&p.alpha<=.65);assert(p.radius>=.3&&p.radius<=2.1);}
  }
});
test('Pixi scene integration keeps layers below actors, resizes, honors reduced motion, mounts once and removes its ticker',async()=>{
  const { Container, Sprite, Texture, TextureSource, PlaneGeometry }=await import('pixi.js');
  const { mountAmbientScene }=await import('../src/game/ambientScene.ts');
  const previous=globalThis.matchMedia,preference={matches:false};globalThis.matchMedia=()=>preference;
  const texture=new Texture({source:new TextureSource({width:964,height:1632})}),stage=new Container(),floor=new Sprite(texture),glow=new Container(),actors=new Container(),updates=new Set();
  stage.addChild(floor,glow,actors);
  const view={floor,ambientLayer:new Container(),wastelandPlayer:{x:0,y:0},app:{stage,screen:{width:540,height:914},ticker:{add(fn){updates.add(fn);},remove(fn){updates.delete(fn);}}}};
  try{
    mountAmbientScene(view,texture,wastelandLayout);mountAmbientScene(view,texture,wastelandLayout);assert.equal(stage.children.length,4);assert.equal(updates.size,1);assert.equal(floor.visible,false);
    const [mesh,sparks]=view.ambientLayer.children;assert.equal(stage.children[1],view.ambientLayer);assert.equal(mesh.label,'animated-wasteland');assert.equal(sparks.label,'campfire-embers');assert.equal(stage.children[3],actors);assert.equal(mesh.scale.x,wastelandLayout(540,914).scaleX);
    view.app.screen={width:360,height:780};view.wastelandPlayer={x:40,y:0};for(const update of updates)update({deltaMS:34});
    const moved=wastelandLayout(360,780,view.wastelandPlayer);
    assert.equal(mesh.scale.x,moved.scaleX);assert.equal(mesh.scale.y,moved.scaleY);assert.equal(view.ambientLayer.position.x,moved.offsetX);assert.equal(view.ambientLayer.position.y,moved.offsetY);
    preference.matches=true;for(const update of updates)update({deltaMS:34});
    const pristine=new PlaneGeometry({width:964,height:1632,verticesX:97,verticesY:165});assert.deepEqual(mesh.geometry.getBuffer('aPosition').data,pristine.getBuffer('aPosition').data);pristine.destroy();
    assert.equal(mesh.eventMode,'none');assert.equal(sparks.eventMode,'none');stage.destroy({children:true});assert.equal(updates.size,0);
  }finally{if(!stage.destroyed)stage.destroy({children:true});texture.destroy(true);globalThis.matchMedia=previous;}
});

test('each grass patch has visible screen-space travel on the actual mesh at mobile sizes',()=>{
  const positions=geometry(),original=positions.slice(),motion=new AmbientDeformation(positions,964,1632,fires);
  const leaves=grassPatches.map(([x,root,,height])=>(Math.round((root-height*.75)*164)*97+Math.round(x*96))*2);
  const min=leaves.map(()=>Infinity),max=leaves.map(()=>-Infinity);
  for(let frame=0;frame<=180;frame++){
    motion.apply(frame/30);
    leaves.forEach((index,patch)=>{const travel=positions[index]-original[index];min[patch]=Math.min(min[patch],travel);max[patch]=Math.max(max[patch],travel);});
  }
  for(const [width,height] of [[320,680],[390,844],[540,914]]){
    const scale=wastelandLayout(width,height).scaleX;
    leaves.forEach((_,patch)=>{const pixels=(max[patch]-min[patch])*scale;assert(pixels>=3,`grass ${patch} only moves ${pixels}px at width ${width}`);assert(pixels<=12,`grass ${patch} moves too far`);});
  }
});
test('stronger grass wind does not invert triangles or tear the background mesh',()=>{
  const positions=geometry(),motion=new AmbientDeformation(positions,964,1632,fires);
  const area=(a,b,c)=>(positions[b]-positions[a])*(positions[c+1]-positions[a+1])-(positions[b+1]-positions[a+1])*(positions[c]-positions[a]);
  for(let frame=0;frame<=90;frame++){
    motion.apply(frame/15);
    for(let row=0;row<164;row++)for(let column=0;column<96;column++){
      const a=(row*97+column)*2,b=a+2,c=a+97*2,d=c+2;
      assert(area(a,b,c)>0);assert(area(b,d,c)>0);
    }
  }
});
