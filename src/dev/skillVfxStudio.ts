/** 개발 서버 전용. 실제 전투 판정·렌더러를 재사용하고 계정·저장에는 연결하지 않는다. */
import { CombatEngine } from '../game/combat/engine';
import { GameView } from '../game/render';
import { preferences } from '../game/preferences';
import { starterWeaponName } from '../game/items';
import { freshSave, type Gender } from '../game/store';
import { skillOrderFor, skillRange, skills, type Job, type SkillId } from '../game/skills';
import type { Enemy } from '../game/battle/types';

const select = (id: string): HTMLSelectElement => document.querySelector<HTMLSelectElement>(`#${id}`)!;
const skillSelect = select('skill');
const jobSelect = select('job');
function populateSkills(): void {
  skillSelect.replaceChildren();
  for (const id of skillOrderFor(jobSelect.value as Job)) skillSelect.add(new Option(skills[id].name, id));
}
populateSkills();
const status = document.querySelector<HTMLElement>('#status')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const replayButton = document.querySelector<HTMLButtonElement>('#replay')!;

// 몬스터를 고정해야 같은 기술을 같은 구도로 비교할 수 있다.
class StudioCombat extends CombatEngine {
  protected override tickEnemies(_dt: number): void {}
}

function preview(): StudioCombat {
  const id = skillSelect.value as SkillId;
  const job = jobSelect.value as Job;
  const level = Number(select('level').value);
  const count = Number(select('targets').value);
  const gender = select('gender').value as Gender;
  const save = freshSave(gender, job);
  save.equipment.weapon = { id: crypto.randomUUID(), name: starterWeaponName(job), slot: 'weapon', rarity: 'common', stats: { attack: 4 }, plus: 0 };
  save.learned = [...skillOrderFor(job)];
  save.skillLevels = { ...save.skillLevels, [id]: level };
  save.quickSlots = [id, null, null];
  const world = new StudioCombat(save);
  world.cooldown.attack = Infinity; // 자동 평타가 스킬 연출을 덮지 않도록 한다.
  world.enemies = Array.from({ length: count }, (_, index): Enemy => {
    const angle = index === 0 ? 0 : (index - 1) * Math.PI * 2 / Math.max(1, count - 1);
    const radius = index === 0 ? 48 : 94;
    const ranged = job !== 'warrior' && id !== 'frostNova' && id !== 'arcaneOverlord';
    const baseX = job === 'mage' ? Math.min(130, skillRange(id, level) * .55) : Math.min(190, skillRange(id, level) * .7);
    return { x: ranged ? baseX + (index === 0 ? 0 : 30 + Math.cos(angle) * 18) : Math.cos(angle) * radius,
      y: ranged ? (index === 0 ? 0 : Math.sin(angle) * 54) : Math.sin(angle) * radius,
      hp: 1_000_000, maxHp: 1_000_000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  });
  world.action(id);
  save.quickSlots = [null, null, null]; // 반복 재생까지 선택한 기술 한 번만 실행한다.
  return world;
}

const view = new GameView();
let world: StudioCombat;
let last = 0;
let elapsed = 0;
let frames = 0;
let fpsClock = 0;
let fps = 0;

function replay(): void {
  world = preview();
  elapsed = 0;
  status.textContent = `${skills[skillSelect.value as SkillId].name} · ${stage.clientWidth}×${stage.clientHeight} · ${fps} FPS`;
}

async function start(): Promise<void> {
  await view.mount(stage, (loaded, total) => { status.textContent = `리소스 ${loaded}/${total}`; });
  preferences.shake = false;
  replay();
  replayButton.onclick = replay;
  jobSelect.onchange = () => { populateSkills(); replay(); };
  for (const id of ['skill', 'level', 'targets', 'gender']) select(id).onchange = replay;
  select('quality').onchange = () => { preferences.effects = select('quality').value === 'low' ? 'low' : 'full'; replay(); };
  requestAnimationFrame(function frame(now) {
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    elapsed += dt;
    fpsClock += dt;
    frames++;
    if (fpsClock >= 1) { fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; status.textContent = `${skills[skillSelect.value as SkillId].name} · ${stage.clientWidth}×${stage.clientHeight} · ${fps} FPS`; }
    if (elapsed > 2.5) replay();
    world.update(dt);
    view.draw(world, now / 1000);
    requestAnimationFrame(frame);
  });
}

start().catch(error => { status.textContent = `미리보기 로딩 실패: ${error instanceof Error ? error.message : String(error)}`; });
