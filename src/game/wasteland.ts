import type { GameView } from './render';
export const wastelandScene = { path: '/assets/wasteland-scene-gravel-v2.png', width: 637, height: 1079 };
// Flame centers measured on the approved painted scene, not the old procedural props.
const fires = [[.501, .077], [.758, .322], [.220, .668]] as const;
export const wastelandFireAnchors = fires.map(([x, y]) => ({ x, y }));
// Fit the approved whole image; no extra overscan enlargement.
const zoom = 1;
export function wastelandLayout(width: number, height: number, player = { x: 0, y: 0 }) {
  const sceneWidth = width * zoom, sceneHeight = height * zoom;
  const offsetX = Math.max(width - sceneWidth, Math.min(0, (width - sceneWidth) / 2 - (player.x - player.y) * .86 * .25));
  // At 1x, clamping anchors the background; fire and grass animation stay independent.
  const offsetY = Math.max(height - sceneHeight, Math.min(0, -height * .02 - (player.x + player.y) * .43 * .15));
  return { scaleX: sceneWidth / wastelandScene.width, scaleY: sceneHeight / wastelandScene.height, offsetX, offsetY,
    fires: fires.map(([u, v]) => ({ x: offsetX + u * sceneWidth, y: offsetY + v * sceneHeight,
      radius: Math.min(sceneWidth / 540, sceneHeight / 914) * 38 })) };
}
export async function mountWasteland(view: GameView, onReady?: () => void): Promise<void> {
  const [{ Assets }, { mountAmbientScene }] = await Promise.all([import('pixi.js'), import('./ambientScene')]);
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
