import type { GameView } from './render';
export const wastelandScene = { path: '/assets/wasteland-scene.png', width: 964, height: 1632 };
// Flame centers measured on the approved painted scene, not the old procedural props.
const fires = [[.5, .044], [.813, .30], [.176, .694]] as const;
export function wastelandLayout(width: number, height: number) {
  return { scaleX: width / wastelandScene.width, scaleY: height / wastelandScene.height,
    fires: fires.map(([u, v]) => ({ x: u * width, y: v * height, radius: Math.min(width / 540, height / 914) * 38 })) };
}
export async function mountWasteland(view: GameView): Promise<void> {
  const [{ Assets }, { mountAmbientScene }] = await Promise.all([import('pixi.js'), import('./ambientScene')]);
  const texture = await Assets.load(wastelandScene.path);
  texture.source.scaleMode = 'linear'; view.floor.texture = texture; view.textures.floor = texture;
  placeWasteland(view);
  mountAmbientScene(view, texture, wastelandLayout);
}
export function placeWasteland(view: GameView): void {
  const { width, height } = view.app.screen, layout = wastelandLayout(width, height);
  view.floor.width = width; view.floor.height = height;
  view.floor.tileScale.set(layout.scaleX, layout.scaleY); view.floor.tilePosition.set(0, 0);
  view.terrainLayer.visible = false;
}
