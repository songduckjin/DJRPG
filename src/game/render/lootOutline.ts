import {Texture} from 'pixi.js';
/** Grade is a solid alpha silhouette, not RGB multiplication of a dark item. */
export function lootSilhouette(source:Uint8ClampedArray,ink:number):Uint8ClampedArray {
  const mask=new Uint8ClampedArray(source.length);
  for(let i=0;i<source.length;i+=4){mask[i]=(ink>>16)&255;mask[i+1]=(ink>>8)&255;mask[i+2]=ink&255;mask[i+3]=source[i+3];}
  return mask;
}
export const LOOT_OUTLINE_PAD=16;
export function createLootOutline(texture:Texture,ink:number,size:number):{outline:Texture;halo:Texture} {
  const resolution=2,pad=LOOT_OUTLINE_PAD,extent=(size+pad*2)*resolution;
  const mask=document.createElement('canvas');mask.width=mask.height=size*resolution;
  const maskContext=mask.getContext('2d',{willReadFrequently:true})!;
  const frame=texture.frame;
  maskContext.drawImage(texture.source.resource as CanvasImageSource,frame.x,frame.y,frame.width,frame.height,0,0,mask.width,mask.height);
  const pixels=maskContext.getImageData(0,0,mask.width,mask.height);pixels.data.set(lootSilhouette(pixels.data,ink));maskContext.putImageData(pixels,0,0);
  const outline=document.createElement('canvas');outline.width=outline.height=extent;
  const context=outline.getContext('2d')!;context.scale(resolution,resolution);
  // Four one-pixel offsets follow the icon, including transparent holes, like the dungeon CSS.
  for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]])context.drawImage(mask,pad+x,pad+y,size,size);
  const halo=document.createElement('canvas');halo.width=halo.height=extent;
  const glow=halo.getContext('2d')!;glow.shadowColor=`#${ink.toString(16).padStart(6,'0')}`;glow.shadowBlur=8*resolution;
  glow.drawImage(outline,0,0);
  return {outline:Texture.from(outline),halo:Texture.from(halo)};
}
