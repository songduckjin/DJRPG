import { Assets } from 'pixi.js';
import { mountAmbientScene } from './ambientScene';
import type { GameView } from './render';
import { wastelandScene, wastelandCore, wastelandFireAnchors } from './wastelandGeometry';
export { wastelandScene, wastelandCore, originalScenePoint, wastelandFireAnchors } from './wastelandGeometry';
export function wastelandLayout(width: number, height: number, player = { x: 0, y: 0 }) {
  // Fit the ORIGINAL core to the viewport, then reveal added scenery when the camera pans.
  // At a 540x914 viewport every core pixel is 1:1; the image itself is never zoomed 1.18x.
  const scaleX=width/wastelandCore.width,scaleY=height/wastelandCore.height;
  const sceneWidth=wastelandScene.width*scaleX,sceneHeight=wastelandScene.height*scaleY;
  const offsetX=Math.max(width-sceneWidth,Math.min(0,-wastelandCore.x*scaleX-(player.x-player.y)*.86*.25));
  const offsetY=Math.max(height-sceneHeight,Math.min(0,-wastelandCore.y*scaleY-(player.x+player.y)*.43*.15));
  return {scaleX,scaleY,offsetX,offsetY,
    fires:wastelandFireAnchors.map(({x,y})=>({x:offsetX+x*sceneWidth,y:offsetY+y*sceneHeight,radius:Math.min(width/540,height/914)*38}))};
}
export async function mountWasteland(view: GameView, onReady?: () => void): Promise<void> {
  let texture;
  try { texture = await Assets.load(wastelandScene.path); }
  catch (error) { throw new Error(`그래픽 리소스 ${wastelandScene.path} 로딩 실패: ${error instanceof Error ? error.message : String(error)}`); }
  texture.source.scaleMode = 'linear'; view.floor.texture = texture; view.textures.floor = texture;
  placeWasteland(view);
  mountAmbientScene(view, texture, wastelandLayout);
  onReady?.();
}
export function placeWasteland(view: GameView, player = { x: 0, y: 0 }): void {
  view.wastelandPlayer = { x: player.x, y: player.y };
  const { width, height } = view.app.screen, layout = wastelandLayout(width, height, player);
  view.floor.width = width; view.floor.height = height;
  view.floor.tileScale.set(layout.scaleX, layout.scaleY);
  view.floor.tilePosition.set(layout.offsetX, layout.offsetY);
  view.ambientLayer.position.set(layout.offsetX, layout.offsetY);
  view.terrainLayer.visible = false;
}
