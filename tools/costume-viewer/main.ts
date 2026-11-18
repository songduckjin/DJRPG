import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { estimateCanvas, frameMs, pose, type Motion, type Weapon, walkFrames } from './model';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = byId<HTMLDivElement>('stage');
const frameInput = byId<HTMLInputElement>('frame');
const frameValue = byId<HTMLOutputElement>('frame-value');
const playButton = byId<HTMLButtonElement>('play');
const weaponInput = byId<HTMLSelectElement>('weapon');
const motionInput = byId<HTMLSelectElement>('skill');
const flipInput = byId<HTMLInputElement>('flip');
const anchorsInput = byId<HTMLInputElement>('anchors');
const bodyInput = byId<HTMLInputElement>('body');
const gearInput = byId<HTMLInputElement>('gear');
const extrasInput = byId<HTMLInputElement>('extras');
const metrics = byId<HTMLParagraphElement>('metrics');

const app = new Application();
await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
host.appendChild(app.canvas);

const names = ['torso','arm','legs','armor','sword','greatsword'] as const;
type Name = typeof names[number];
const entries = await Promise.all(names.map(async name => [name, await Assets.load<Texture>(`/tools/costume-viewer/assets/${name}.svg`)] as const));
const textures = Object.fromEntries(entries) as Record<Name, Texture>;
const sprite = (name: Name, x: number, y: number) => {
  const item = new Sprite(textures[name]);
  item.anchor.set(.5, 1);
  item.position.set(x, y);
  return item;
};

const root = new Container();
const figure = new Container();
const cape = new Graphics().poly([-33,-150,-54,-14,-9,-18,-16,-145]).fill(0x49364e);
const legs = sprite('legs', 0, 0);
const boots = new Graphics().rect(-37,-14,28,13).rect(9,-14,28,13).fill(0x403c4a);
const torso = sprite('torso', 0, -31);
const armor = sprite('armor', 0, -45);
const backArm = sprite('arm', -24, -59);
const frontArm = sprite('arm', 24, -59);
const helmet = new Graphics().poly([-26,-154,-18,-175,19,-175,28,-154,18,-147,-18,-147]).fill(0x707c85);
const sword = sprite('sword', 0, 0);
const greatsword = sprite('greatsword', 0, 0);
const weaponAnchor = new Container();
const footMark = new Graphics().circle(0,0,5).fill(0xffc55d);
const handMark = new Graphics().circle(0,0,5).fill(0x53e6da);
const effect = new Graphics().circle(0,0,82).stroke({ color: 0xb5a4ff, width: 3 });
weaponAnchor.addChild(sword, greatsword);
figure.addChild(cape, backArm, legs, boots, torso, armor, frontArm, helmet, weaponAnchor, handMark, footMark, effect);
root.addChild(figure);
app.stage.addChild(root);

let frame = 0;
let playing = true;
let elapsed = 0;
const render = () => {
  const weapon = weaponInput.value as Weapon;
  const motion = motionInput.value as Motion;
  const p = pose(frame, weapon, motion);
  root.position.set(app.screen.width / 2, Math.min(app.screen.height - 40, app.screen.height * .85));
  figure.scale.x = flipInput.checked ? -1 : 1;
  torso.position.set(p.torso.x, p.torso.y + 45);
  armor.position.copyFrom(torso.position);
  frontArm.position.set(p.arm.x, p.arm.y + 35);
  frontArm.rotation = p.arm.rotation;
  backArm.position.set(-p.arm.x, p.arm.y + 35);
  backArm.rotation = -p.arm.rotation;
  legs.position.set(p.legs.x, p.legs.y);
  legs.rotation = p.legs.rotation;
  weaponAnchor.position.set(p.hand.x, p.hand.y);
  weaponAnchor.rotation = p.weaponRotation;
  sword.visible = weapon === 'one';
  greatsword.visible = weapon === 'great';
  handMark.position.copyFrom(weaponAnchor.position);
  torso.visible = frontArm.visible = backArm.visible = legs.visible = bodyInput.checked;
  armor.visible = weaponAnchor.visible = gearInput.checked;
  cape.visible = boots.visible = helmet.visible = extrasInput.checked;
  handMark.visible = footMark.visible = anchorsInput.checked;
  effect.visible = p.effect > 0;
  effect.alpha = p.effect;
  frameInput.value = String(frame);
  frameValue.value = String(frame);
  const bounds = estimateCanvas(weapon);
  metrics.textContent = `발 피벗 (0,0) · 손 앵커 (${p.hand.x.toFixed(1)}, ${p.hand.y.toFixed(1)}) · 최대 동작 추정 캔버스 ${bounds.width}×${bounds.height}px · 갑옷 1세트 재사용`;
};

playButton.onclick = () => { playing = !playing; playButton.textContent = playing ? '일시정지' : '재생'; };
frameInput.oninput = () => { playing = false; playButton.textContent = '재생'; frame = Number(frameInput.value); render(); };
for (const input of [weaponInput,motionInput,flipInput,anchorsInput,bodyInput,gearInput,extrasInput]) input.onchange = render;
app.ticker.add(ticker => {
  if (!playing) return;
  elapsed += ticker.deltaMS;
  if (elapsed < frameMs) return;
  frame = (frame + Math.floor(elapsed / frameMs)) % walkFrames;
  elapsed %= frameMs;
  render();
});
render();
