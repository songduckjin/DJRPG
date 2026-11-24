import { Graphics, MeshPlane, UPDATE_PRIORITY, type Texture, type Ticker } from 'pixi.js';
import type { GameView } from './render';
import { AmbientDeformation, fireEmbers, fireFlicker } from './ambientMotion';

/** 구역 불빛 하나 — 좌표는 그 장면 이미지 기준 0~1 비율이다. */
export type SceneFire = { x: number; y: number; radius: number; color?: number };
export type SceneLayout = (width: number, height: number, player?: { x: number; y: number }) => {
  scaleX: number; scaleY: number; offsetX: number; offsetY: number;
  fires: SceneFire[];
};
export type AmbientSceneOptions = {
  /** 황무지의 풀·불 흔들림(그림이 황무지 전용 좌표계다) — 성 안 장면은 끈다. */
  deform?: boolean;
  /** 불 주변 변형 좌표(0~1) — `deform`일 때만 쓴다. */
  anchors?: { x: number; y: number }[];
};

/**
 * 장면(배경 1장 + 불씨)을 한 번에 하나만 붙인다.
 *
 * 1~20층은 잿빛 황무지, 21~40층은 흑요석 성채다(층 테마 `floorTheme.ts`). 층이 구역 경계나 20→21층을
 * 넘으면 **키가 바뀌고** 이 함수가 이전 장면을 버린 뒤 새 장면을 같은 `view.ambientLayer` 에 다시 짓는다.
 * 그림 파일을 갈아 끼우는 게 아니라 같은 컨테이너의 자식만 바꾸므로 레이어 순서·카메라 이동은 그대로다.
 * 구역이 바뀌어도 배경은 1장이다 — 조명·안개·불씨 색만 바뀐다.
 */
const mounted = new Map<GameView, { key: string; dispose: () => void }>();
export function mountAmbientScene(
  view: GameView, key: string, texture: Texture, layout: SceneLayout, options: AmbientSceneOptions = {}
): void {
  const current = mounted.get(view);
  if (current?.key === key) return;
  current?.dispose();
  const mesh = new MeshPlane({ texture, verticesX: 97, verticesY: 165 });
  mesh.label = `animated-scene-${key}`; mesh.eventMode = 'none';
  const sparks = new Graphics(); sparks.label = `scene-embers-${key}`; sparks.eventMode = 'none';
  const buffer = mesh.geometry.getBuffer('aPosition');
  const deformation = options.deform
    ? new AmbientDeformation(buffer.data as Float32Array, texture.width, texture.height, options.anchors ?? [])
    : undefined;
  view.ambientLayer.addChild(mesh, sparks);
  // 처음 붙일 때만 무대에 올린다 — 배경 바로 위, 액터 아래다. 장면이 바뀌어도 레이어는 그대로다.
  if (view.ambientLayer.parent !== view.app.stage) {
    const index = view.app.stage.getChildIndex(view.floor);
    view.app.stage.addChildAt(view.ambientLayer, index + 1);
  }
  // Reuse the exact painted pixels; no duplicate grass sprites or replaced background image.
  view.floor.visible = false;
  const preference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  let time = 0, pending = 0, wasReduced = false;
  const update = (ticker: Ticker) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const { width, height } = view.app.screen;
    const scene = layout(width, height, view.wastelandPlayer);
    const sx = scene.scaleX, sy = scene.scaleY;
    mesh.scale.set(sx, sy);
    view.ambientLayer.position.set(scene.offsetX, scene.offsetY);
    if (preference?.matches) {
      if (!wasReduced) { deformation?.apply(0, false); buffer.update(); sparks.clear(); }
      wasReduced = true; return;
    }
    wasReduced = false;
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    time += dt; pending += dt;
    if (pending < 1 / 30) return;
    pending %= 1 / 30;
    deformation?.apply(time); buffer.update(); sparks.clear();
    scene.fires.forEach((fire, fireIndex) => {
      const x = fire.x - scene.offsetX, y = fire.y - scene.offsetY;
      const flicker = fireFlicker(fireIndex, time);
      const color = fire.color ?? 0xffa447;
      for (let ring = 3; ring > 0; ring--) {
        sparks.ellipse(x, y, fire.radius * ring * .2 * flicker, fire.radius * ring * .12 * flicker)
          .fill({ color, alpha: .009 });
      }
      for (const ember of fireEmbers(fireIndex, time)) {
        sparks.circle(x + ember.x * sx, y + ember.y * sy, Math.max(.35, ember.radius * Math.min(sx, sy)))
          .fill({ color, alpha: ember.alpha });
      }
    });
  };
  const dispose = () => {
    view.app.ticker.remove(update);
    view.ambientLayer.removeChild(mesh, sparks);
    mesh.destroy(); sparks.destroy();
    if (mounted.get(view)?.key === key) mounted.delete(view);
  };
  mounted.set(view, { key, dispose });
  update({ deltaMS: 1000 / 30 } as Ticker);
  view.app.ticker.add(update, undefined, UPDATE_PRIORITY.NORMAL + 1);
  view.app.stage.once('destroyed', () => { dispose(); mounted.delete(view); });
}
