import { Graphics, MeshPlane, UPDATE_PRIORITY, type Texture, type Ticker } from 'pixi.js';
import type { GameView } from './render';
import { AmbientDeformation, fireEmbers, fireFlicker } from './ambientMotion';
import { wastelandFireAnchors } from './wasteland';

const mounted = new WeakSet<GameView>();
type SceneLayout = (width: number, height: number, player?: { x: number; y: number }) => {
  scaleX: number; scaleY: number; offsetX: number; offsetY: number;
  fires: { x: number; y: number; radius: number }[];
};
export function mountAmbientScene(view: GameView, texture: Texture, layout: SceneLayout): void {
  if (mounted.has(view)) return;
  const mesh = new MeshPlane({ texture, verticesX: 97, verticesY: 165 });
  mesh.label = 'animated-wasteland'; mesh.eventMode = 'none';
  const sparks = new Graphics(); sparks.label = 'campfire-embers'; sparks.eventMode = 'none';
  const buffer = mesh.geometry.getBuffer('aPosition');
  const deformation = new AmbientDeformation(buffer.data as Float32Array, texture.width, texture.height, wastelandFireAnchors);
  const index = view.app.stage.getChildIndex(view.floor);
  view.ambientLayer.addChild(mesh, sparks);
  view.app.stage.addChildAt(view.ambientLayer, index + 1);
  // Reuse the exact painted pixels; no duplicate grass sprites or replaced background image.
  view.floor.visible = false; mounted.add(view);
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
      if (!wasReduced) { deformation.apply(0, false); buffer.update(); sparks.clear(); }
      wasReduced = true; return;
    }
    wasReduced = false;
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    time += dt; pending += dt;
    if (pending < 1 / 30) return;
    pending %= 1 / 30;
    deformation.apply(time); buffer.update(); sparks.clear();
    scene.fires.forEach((fire, fireIndex) => {
      const x = fire.x - scene.offsetX, y = fire.y - scene.offsetY;
      const flicker = fireFlicker(fireIndex, time);
      for (let ring = 3; ring > 0; ring--) {
        sparks.ellipse(x, y, fire.radius * ring * .2 * flicker, fire.radius * ring * .12 * flicker)
          .fill({ color: 0xffa447, alpha: .009 });
      }
      for (const ember of fireEmbers(fireIndex, time)) {
        sparks.circle(x + ember.x * sx, y + ember.y * sy, Math.max(.35, ember.radius * Math.min(sx, sy)))
          .fill({ color: 0xffbc62, alpha: ember.alpha });
      }
    });
  };
  update({ deltaMS: 1000 / 30 } as Ticker);
  view.app.ticker.add(update, undefined, UPDATE_PRIORITY.NORMAL + 1);
  view.app.stage.once('destroyed', () => { view.app.ticker.remove(update); mounted.delete(view); });
}
