import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { coverModeNote, estimateCanvas, frameMs, partPlan, pose, type CoverMode, type Gear, type Motion, type Weapon, walkFrames } from './model';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = byId<HTMLDivElement>('stage');
const frameInput = byId<HTMLInputElement>('frame');
const frameValue = byId<HTMLOutputElement>('frame-value');
const playButton = byId<HTMLButtonElement>('play');
const weaponInput = byId<HTMLSelectElement>('weapon');
const motionInput = byId<HTMLSelectElement>('skill');
const coverInput = byId<HTMLSelectElement>('cover');
const flipInput = byId<HTMLInputElement>('flip');
const anchorsInput = byId<HTMLInputElement>('anchors');
const bodyInput = byId<HTMLInputElement>('body');
const armorInput = byId<HTMLInputElement>('armor');
const helmetInput = byId<HTMLInputElement>('helmet');
const extrasInput = byId<HTMLInputElement>('extras');
const metrics = byId<HTMLParagraphElement>('metrics');

const app = new Application();
await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
host.appendChild(app.canvas);

const files = {
  head: 'head',
  headHelmed: 'head_helmed',
  torso: 'torso',
  torsoArmored: 'torso_armored',
  armor: 'armor',
  helmet: 'helmet',
  arm: 'arm',
  legs: 'legs',
  sword: 'sword',
  greatsword: 'greatsword'
} as const;
type Name = keyof typeof files;
const entries = await Promise.all(Object.entries(files).map(async ([key, file]) =>
  [key, await Assets.load<Texture>(`/tools/costume-viewer/assets/${file}.svg`)] as const));
const textures = Object.fromEntries(entries) as Record<Name, Texture>;
const sprite = (name: Name) => {
  const item = new Sprite(textures[name]);
  item.anchor.set(.5, 1);
  return item;
};

const root = new Container();
const figure = new Container();
const cape = new Graphics().poly([-33,-150,-54,-14,-9,-18,-16,-145]).fill(0x49364e);
const legs = sprite('legs');
const boots = new Graphics().rect(-37,-14,28,13).rect(9,-14,28,13).fill(0x403c4a);
const torso = sprite('torso');
const armorLayer = sprite('armor');
const head = sprite('head');
const helmetLayer = sprite('helmet');
const backArm = sprite('arm');
const frontArm = sprite('arm');
const sword = sprite('sword');
const greatsword = sprite('greatsword');
const weaponAnchor = new Container();
const footMark = new Graphics().circle(0,0,5).fill(0xffc55d);
const handMark = new Graphics().circle(0,0,5).fill(0x53e6da);
const effect = new Graphics().circle(0,0,82).stroke({ color: 0xb5a4ff, width: 3 });
weaponAnchor.addChild(sword, greatsword);
figure.addChild(cape, backArm, legs, boots, torso, armorLayer, head, helmetLayer, frontArm, weaponAnchor, handMark, footMark, effect);
root.addChild(figure);
app.stage.addChild(root);

let frame = 0;
let playing = true;
let elapsed = 0;
const render = () => {
  const weapon = weaponInput.value as Weapon;
  const motion = motionInput.value as Motion;
  const mode = coverInput.value as CoverMode;
  const gear: Gear = { armor: armorInput.checked, helmet: helmetInput.checked };
  const plan = partPlan(gear, mode);
  const p = pose(frame, weapon, motion);
  root.position.set(app.screen.width / 2, Math.min(app.screen.height - 40, app.screen.height * .85));
  figure.scale.x = flipInput.checked ? -1 : 1;
  const torsoY = p.torso.y + 45;
  torso.position.set(p.torso.x, torsoY);
  torso.texture = textures[plan.torso.variant === 'armored' ? 'torsoArmored' : 'torso'];
  armorLayer.position.set(p.torso.x, p.torso.y + 34);
  head.position.set(p.torso.x, torsoY);
  head.texture = textures[plan.head.variant === 'helmed' ? 'headHelmed' : 'head'];
  helmetLayer.position.set(p.torso.x, torsoY);
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
  const body = bodyInput.checked;
  torso.visible = plan.torso.visible && body;
  head.visible = plan.head.visible && body;
  frontArm.visible = backArm.visible = legs.visible = body;
  armorLayer.visible = plan.armor.visible;
  helmetLayer.visible = plan.helmet.visible;
  weaponAnchor.visible = body;
  cape.visible = boots.visible = extrasInput.checked;
  handMark.visible = footMark.visible = anchorsInput.checked;
  effect.visible = p.effect > 0;
  effect.alpha = p.effect;
  frameInput.value = String(frame);
  frameValue.value = String(frame);
  const bounds = estimateCanvas(weapon);
  metrics.textContent = `발 피벗 (0,0) · 손 앵커 (${p.hand.x.toFixed(1)}, ${p.hand.y.toFixed(1)}) · 최대 동작 추정 캔버스 ${bounds.width}×${bounds.height}px · ${coverModeNote(mode, gear)}`;
};

playButton.onclick = () => { playing = !playing; playButton.textContent = playing ? '일시정지' : '재생'; };
frameInput.oninput = () => { playing = false; playButton.textContent = '재생'; frame = Number(frameInput.value); render(); };
for (const input of [weaponInput,motionInput,coverInput,flipInput,anchorsInput,bodyInput,armorInput,helmetInput,extrasInput]) input.onchange = render;
app.ticker.add(ticker => {
  if (!playing) return;
  elapsed += ticker.deltaMS;
  if (elapsed < frameMs) return;
  frame = (frame + Math.floor(elapsed / frameMs)) % walkFrames;
  elapsed %= frameMs;
  render();
});
render();
