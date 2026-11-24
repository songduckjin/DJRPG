import { Assets } from 'pixi.js';
import { mountAmbientScene } from './ambientScene';
import type { GameView } from './render';
import { wastelandScene, wastelandCore, wastelandFireAnchors } from './wastelandGeometry';
import { castleScene, zoneOf, type FloorZone } from './floorTheme';
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

/**
 * 성 안(21~40층) 장면 배치 — 배경 1장(`castleScene`)을 화면에 꽉 채우고 아주 살짝만 흔든다.
 *
 * 구역이 달라져도 **같은 그림**이고, 불빛 좌표·색만 구역 표(`floorTheme.ts` `zone.fires`)에서 온다.
 * 그래서 4개 구역(성문/회랑·예배당/지하 감옥·수문/왕좌)을 오갈 때 그림을 다시 받지 않는다.
 */
export function castleLayoutFor(zone: FloorZone) {
  return (width: number, height: number, player = { x: 0, y: 0 }) => {
    const scale = Math.max(width / castleScene.width, height / castleScene.height);
    const sceneWidth = castleScene.width * scale, sceneHeight = castleScene.height * scale;
    const baseX = (width - sceneWidth) / 2, baseY = (height - sceneHeight) / 2;
    // 성 안은 카메라 이동 폭을 좁게 둔다 — 문·제단 같은 구조물이 화면 밖으로 밀리지 않게.
    const offsetX = Math.max(width - sceneWidth, Math.min(0, baseX - (player.x - player.y) * .18));
    const offsetY = Math.max(height - sceneHeight, Math.min(0, baseY - (player.x + player.y) * .09));
    const emberScale = Math.min(width / 540, height / 914);
    return {
      scaleX: scale, scaleY: scale, offsetX, offsetY,
      fires: zone.fires.map(fire => ({
        x: offsetX + fire.x * sceneWidth, y: offsetY + fire.y * sceneHeight,
        radius: emberScale * fire.radius, color: zone.ember
      }))
    };
  };
}

/** 이 층에 맞는 장면으로 갈아 끼운다 — 이미 그 장면이면 아무 일도 하지 않는다. */
export function mountFieldScene(view: GameView, floor: number): void {
  const zone = zoneOf(floor);
  if (!view.textures) return;
  if (!zone) {
    // 황무지 장면 텍스처는 `mountWasteland`가 받아 `textures.floor`에 둔다(부팅 전이면 아직 없다).
    if (!view.textures.floor) return;
    mountAmbientScene(view, 'wasteland', view.textures.floor, wastelandLayout, { deform: true, anchors: wastelandFireAnchors });
    return;
  }
  mountAmbientScene(view, `castle-${zone.id}`, view.textures.castle, castleLayoutFor(zone));
}

export async function mountWasteland(view: GameView, onReady?: () => void): Promise<void> {
  let texture;
  try { texture = await Assets.load(wastelandScene.path); }
  catch (error) { throw new Error(`그래픽 리소스 ${wastelandScene.path} 로딩 실패: ${error instanceof Error ? error.message : String(error)}`); }
  texture.source.scaleMode = 'linear'; view.floor.texture = texture; view.textures.floor = texture;
  placeWasteland(view);
  mountAmbientScene(view, 'wasteland', texture, wastelandLayout, { deform: true, anchors: wastelandFireAnchors });
  onReady?.();
}

/**
 * 장면 배치 — 매 프레임 불린다. 21층+면 성 안 배경으로 갈아 끼우고, 아래층이면 황무지로 돌아온다.
 * (층 선택으로 20↔21층을 오갈 때 그림이 바뀌는 유일한 지점이다.)
 */
export function placeFieldScene(view: GameView, player = { x: 0, y: 0 }, floor = 1): void {
  view.wastelandPlayer = { x: player.x, y: player.y };
  const zone = zoneOf(floor);
  mountFieldScene(view, floor);
  const { width, height } = view.app.screen;
  const layout = (zone ? castleLayoutFor(zone) : wastelandLayout)(width, height, player);
  view.floor.width = width; view.floor.height = height;
  view.floor.tileScale.set(layout.scaleX, layout.scaleY);
  view.floor.tilePosition.set(layout.offsetX, layout.offsetY);
  view.ambientLayer.position.set(layout.offsetX, layout.offsetY);
  view.terrainLayer.visible = false;
}

/** 황무지 배치 — 부팅과 20층 이하에서 쓴다(종전 이름 유지). */
export function placeWasteland(view: GameView, player = { x: 0, y: 0 }): void {
  placeFieldScene(view, player, 1);
}
