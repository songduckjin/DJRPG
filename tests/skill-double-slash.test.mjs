import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import './ts-loader.mjs';

const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');
const { skills, skillDamageScale, slash2Hits, slash2SecondHit, slash2SwingSeconds, slash2TotalPower } = await import('../src/game/skills.ts');
const { slash2SwingMotion } = await import('../src/game/render/heroMotion.ts');

function saveWithSlash2() {
  const save = freshSave();
  save.learned = ['slash2'];
  save.quickSlots = ['slash2', null, null];
  return save;
}

/** 한 마리(또는 여럿)만 세워 두고 스킬을 한 번 쓴 월드. 평타·자동 시전은 쿨다운으로 막는다. */
function castWorld(enemies = 1) {
  const save = saveWithSlash2();
  const world = new World(save);
  world.spawnTimer = 999;
  world.cooldown.attack = 999;
  world.enemies = Array.from({ length: enemies }, (_, index) => ({
    x: 50 + index * 8, y: 0, hp: 1_000_000, maxHp: 1_000_000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0
  }));
  world.action('slash2');
  return { world, save, enemies: world.enemies };
}

const popups = world => world.effects.filter(effect => effect.kind === 'hit');

test('1번 스킬은 이단참으로 표시되고 스킬 ID는 기존 세이브 호환을 위해 slash2 그대로다', () => {
  const skill = skills.slash2;
  assert.equal(skill.id, 'slash2');
  assert.equal(skill.name, '이단참');
  assert.equal(skill.level, 2, '해금 레벨은 그대로');
  assert.match(skill.power, /1\.1/);
  assert.match(skill.power, /2연격/);
  assert.match(skill.description, /두 번/);
  assert.match(skill.description, /되받아/);
  assert.equal(slash2Hits.length, 2);
  assert.deepEqual(slash2Hits.map(hit => hit.at), [0, .18], '1타 0초, 2타 0.18초');
  assert.equal(slash2SecondHit, .18);
  assert(Math.abs(slash2TotalPower - 2.2) < 1e-9, '두 타 합은 기존 단타 2.15배와 견줄 만한 2.2배');
});

test('이단참은 0초·0.18초에 두 번 따로 판정하고 데미지 팝업도 두 번 뜬다', () => {
  const { world, save, enemies } = castWorld();
  const enemy = enemies[0];
  const attack = totalStats(save).attack;
  const perHit = attack * skillDamageScale(1) * slash2Hits[0].power;
  let popupCount = 0;
  let firstDelta = 0;
  const startHp = enemy.hp;

  // 발동 프레임 — 1타가 바로 들어간다.
  world.update(.016);
  firstDelta = startHp - enemy.hp;
  assert(Math.abs(firstDelta - perHit) < 1e-6, `1타는 공격력 ×1.1(${perHit})만큼 깎는다`);
  assert.equal(popups(world).length, 1, '1타에 데미지 팝업이 한 번 뜬다');
  popupCount = 1;
  const effect = world.effects.find(entry => entry.kind === 'slash2');
  assert(effect, '검기 이펙트가 살아 있다');
  assert.equal(effect.hits, 1);
  assert.equal(effect.nextHit, slash2SecondHit, '2타는 0.18초 뒤로 예약된다');

  // 2타 전까지는 더 맞지 않는다.
  world.update(.1);
  assert.equal(popups(world).length, popupCount, '2타 전에는 추가 판정이 없다');
  assert.equal(effect.hits, 1);

  // 0.18초를 넘기면 2타가 들어간다.
  const beforeSecond = enemy.hp;
  world.update(.08);
  const secondDelta = beforeSecond - enemy.hp;
  assert(secondDelta > 0, '2타가 들어간다');
  assert(Math.abs(secondDelta - perHit) < 1e-6, '2타도 공격력 ×1.1로 따로 계산한다');
  assert.equal(popups(world).length, 2, '2타에 데미지 팝업이 한 번 더 뜬다 — 합계 2회');
  assert.equal(effect.hits, 2);
  assert.equal(effect.nextHit, undefined, '두 타가 끝나면 예약이 비워진다');

  // 합계는 기존 단타(2.15배)와 사실상 같다.
  const total = startHp - enemy.hp;
  assert(Math.abs(total - attack * skillDamageScale(1) * slash2TotalPower) < 1e-6);
  assert(total / attack > 2.15 && total / attack < 2.3, `합계 ${total / attack}배`);
});

test('이단참은 사거리 안의 모든 적을 두 번씩 때린다(타마다 판정을 다시 잰다)', () => {
  const { world } = castWorld(3);
  world.update(.016);
  world.update(.2);
  const hitKinds = world.effects.filter(effect => effect.kind === 'hit');
  assert.equal(hitKinds.length, 6, '적 3마리 × 2타');
  for (const enemy of world.enemies) assert(enemy.hp < enemy.maxHp);
  assert(world.effects.find(effect => effect.kind === 'slash2').hits === 2);
});

test('이단참 모션은 공격 시트를 정방향(1타) → 역방향(2타)으로 두 번 재생한다', () => {
  const { world } = castWorld();
  assert.equal(world.attackCombo, 'double');
  assert.equal(world.attackPose, slash2SwingSeconds, '두 스윙이 끝날 때까지 공격 모션을 유지한다');
  assert(slash2SwingSeconds > .32, '기본 공격(0.32초)보다 길다');

  const frames = [.44, .38, .32, .28, .26, .22, .13, .06, 0].map(remaining => slash2SwingMotion(remaining).frame);
  assert.deepEqual(frames.slice(0, 5), [0, 1, 2, 3, 3], '1타는 0→3 으로 나가고 2타는 3에서 시작한다');
  assert(frames[6] < frames[4], '2타는 프레임을 되감아 되받아 베기가 보인다');
  assert.equal(frames.at(-1), 0);

  const firstPulse = slash2SwingMotion(.35).pulse;
  const secondPulse = slash2SwingMotion(.13).pulse;
  assert(firstPulse > .9 && secondPulse > .9, '스윙마다 한 번씩 몸이 앞으로 실린다');
  assert(slash2SwingMotion(.44).pulse < 1e-9);
  assert(slash2SwingMotion(0).pulse < 1e-9);
  assert.equal(slash2SwingMotion(.44).swing, 0);
  assert.equal(slash2SwingMotion(.13).swing, 1);

  // 직업·평타가 이단참 뒤에 오면 다시 단일 스윙으로 돌아간다.
  world.cooldown.attack = 0;
  world.action('attack');
  assert.equal(world.attackCombo, 'single');
  assert.equal(world.attackPose, .32);
});

test('이단참 이중 초승달 검기 에셋이 배포 경로에 있다(불변 캐시 회피용 새 파일명)', () => {
  const path = 'public/assets/fx_slash2_dual.png';
  assert(existsSync(path), `${path} 가 있어야 한다`);
  assert(statSync(path).size > 2_000, '빈 파일이 아니다');
});
