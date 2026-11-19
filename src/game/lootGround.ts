import {wastelandLayout,wastelandScene} from './wasteland';
type Point={x:number;y:number};
type Viewport={width:number;height:number};
/** Texture coordinates stay attached to the same stone as the background pans/clamps/resizes. */
export function captureLootGround(point:Point,viewport:Viewport,player:Point):Point {
  const layout=wastelandLayout(viewport.width,viewport.height,player);
  return {x:(point.x-layout.offsetX)/(wastelandScene.width*layout.scaleX),y:(point.y-layout.offsetY)/(wastelandScene.height*layout.scaleY)};
}
export function projectLootGround(anchor:Point,viewport:Viewport,player:Point):Point {
  const layout=wastelandLayout(viewport.width,viewport.height,player);
  return {x:layout.offsetX+anchor.x*wastelandScene.width*layout.scaleX,y:layout.offsetY+anchor.y*wastelandScene.height*layout.scaleY};
}
