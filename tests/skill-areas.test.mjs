import './ts-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { allSkillIds, allPassiveIds, skillDamageScale, skillRange } = await import('../src/game/skills.ts');
const { SKILL_AREAS, PASSIVE_AREAS, skillArea, projectedAreaRadii } = await import('../src/game/battle/skillAreas.ts');
const { CombatEngine } = await import('../src/game/combat/engine.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const engine = readFileSync(new URL('../src/game/combat/engine.ts', import.meta.url), 'utf8');
const vfx = readFileSync(new URL('../src/game/render/vfx.ts', import.meta.url), 'utf8');

test('액티브 24종과 패시브 9종이 공용 범위 표에 빠짐없이 있다', () => {
  assert.equal(allSkillIds.length, 24); assert.equal(allPassiveIds.length, 9);
  assert.deepEqual(Object.keys(SKILL_AREAS).sort(), [...allSkillIds].sort());
  assert.deepEqual(Object.keys(PASSIVE_AREAS).sort(), [...allPassiveIds].sort());
  for (const id of allSkillIds) for (const level of [1, 10]) {
    const area = skillArea(id, level);
    assert.equal(area.range, skillRange(id, level));
    assert(area.radius >= 0 && area.duration > 0);
  }
});

test('판정 엔진과 VFX가 같은 스킬 범위 규격을 읽는다', () => {
  assert.match(engine, /skillArea\(/);
  assert.match(vfx, /skillArea\(/);
  assert.doesNotMatch(engine, /this\.damage\(92\b|radius: (96|110)\b|effect\.radius \?\? (96|150)\b/);
  assert.doesNotMatch(vfx, /\(effect\.radius \?\? (96|150)\) \* \.86|92 \* \.86/);
});

test('디스트로이 스윙 검기가 전진하는 거리의 적만 차례로 한 번씩 때린다', () => {
  const save = freshSave();
  save.learned = ['destroy']; save.quickSlots = ['destroy', null, null];
  const world = new CombatEngine(save);
  world.critRoll = () => 1;
  world.enemies = [[40, 0], [160, 0], [100, 70], [100, 180], [260, 0]].map(([x, y]) =>
    ({ x, y, hp: 10000, maxHp: 10000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }));
  const enemies = [...world.enemies];
  assert.equal(skillArea('destroy', 1).kind, 'box');
  world.action('destroy');
  world.cooldown.attack = 999;
  assert(enemies.every(enemy => enemy.hp === enemy.maxHp));
  world.update(.16);
  assert(enemies[0].hp < enemies[0].maxHp);
  assert.equal(enemies[1].hp, enemies[1].maxHp);
  world.update(.39);
  assert(enemies.slice(0, 3).every(enemy => enemy.hp < enemy.maxHp));
  assert(enemies.slice(3).every(enemy => enemy.hp === enemy.maxHp));
  const firstDamage = enemies[0].maxHp - enemies[0].hp;
  world.update(.1);
  assert.equal(enemies[0].maxHp - enemies[0].hp, firstDamage);
});

test('와일드 스탬프는 자신 중심 원형이며 레벨마다 반경과 지속시간이 늘어난다', () => {
  const first = skillArea('slam', 1), last = skillArea('slam', 10);
  assert.equal(first.kind, 'circle');
  assert.equal(first.radius, 90);
  assert.equal(last.radius, 126);
  assert.equal(first.duration, .8);
  assert(Math.abs(last.duration - 1.88) < 1e-9);
  const save = freshSave();
  save.learned = ['slam']; save.quickSlots = ['slam', null, null];
  const world = new CombatEngine(save);
  world.enemies = [[85, 0], [-85, 0], [0, 85], [0, -85], [95, 0]].map(([x, y]) =>
    ({ x, y, hp: 10000, maxHp: 10000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }));
  world.action('slam');
  assert(world.enemies.slice(0, 4).every(enemy => enemy.hp < enemy.maxHp));
  assert.equal(world.enemies[4].hp, world.enemies[4].maxHp);
});

test('파워 스트라이크는 선택한 적 한 명만 5.5배로 때리고 타격 자리를 표시한다', () => {
  const save = freshSave();
  save.learned = ['power']; save.quickSlots = ['power', null, null];
  const world = new CombatEngine(save);
  world.critRoll = () => 1;
  world.enemies = [50, 70].map(x =>
    ({ x, y: 0, hp: 10000, maxHp: 10000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }));
  world.action('power');
  assert.equal(skillArea('power', 1).kind, 'single');
  assert(Math.abs(world.enemies[0].maxHp - world.enemies[0].hp - totalStats(save).attack * 5.5 * skillDamageScale(1)) < 1e-6);
  assert.equal(world.enemies[1].hp, world.enemies[1].maxHp);
  assert.equal(world.effects.find(effect => effect.kind === 'power').x, 50);
});

test('세 직업 대표 6종의 표시 반경이 판정 반경과 같다', () => {
  for (const id of ['slash2', 'hell', 'arrowRain', 'pierceShot', 'manaBurst', 'frostNova']) {
    const area = skillArea(id, 1);
    const visualRadius = area.kind === 'projectile' ? area.projectileRadius : area.radius;
    assert(visualRadius > 0, id);
    const projected = projectedAreaRadii(visualRadius);
    assert(Math.abs(projected.x - visualRadius * Math.SQRT2 * .86) < 1e-9, id);
    assert(Math.abs(projected.y - visualRadius * Math.SQRT2 * .43) < 1e-9, id);
  }
  assert.match(vfx, /projectedAreaRadii\(/);
  assert.match(vfx, /drawArrowRain[\s\S]*?skillArea\('arrowRain'/);
  assert.match(vfx, /drawBurst[\s\S]*?skillArea\(/);
  assert.match(vfx, /drawNova[\s\S]*?skillArea\(/);
});

test('투사체 착탄 피드백은 실제 판정 반경을 전달하고 스킬 재시전으로 취급하지 않는다', async () => {
  const save = freshSave();
  save.job = 'archer'; save.learned = ['doubleShot']; save.quickSlots = ['doubleShot', null, null];
  const world = new CombatEngine(save);
  world.enemies = [{ x: 70, y: 0, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.action('doubleShot');
  let impacts = [];
  for (let i = 0; i < 30 && impacts.length === 0; i++) {
    world.update(.05);
    impacts = world.effects.filter(effect => effect.kind === 'impactArea');
  }
  assert(impacts.length > 0);
  assert(impacts.every(effect => effect.radius === skillArea('doubleShot', 1).projectileRadius));
  const { SkillFeedback } = await import('../src/ui/skillFeedback.ts');
  assert.equal(new SkillFeedback().collect(impacts).size, 0);
});

test('패시브 9종 모두 실전 능력치에 반영된다', () => {
  for (const [job, ids] of [['warrior', ['mastery', 'body', 'instinct']], ['archer', ['bowMastery', 'swiftStep', 'hawkSight']], ['mage', ['staffMastery', 'manaCircuit', 'arcaneSense']]]) {
    const save = freshSave(); save.job = job;
    const base = totalStats(save);
    for (const id of ids) {
      save.passives = [id];
      const stats = totalStats(save);
      assert(['attack', 'defense', 'health', 'crit', 'speed'].some(key => stats[key] > base[key]), `${job}: ${id}`);
    }
  }
});

test('다수 몹의 장식 이펙트만 160개로 제한하고 판정 대기는 보존한다', () => {
  const world = new CombatEngine(freshSave());
  world.effects = Array.from({ length: 300 }, (_, index) => ({ x: index, y: 0, kind: 'hit', age: 0, duration: 1, angle: 0 }));
  world.effects.push({ x: 0, y: 0, kind: 'slash2', age: 0, duration: 1, angle: 0, nextHit: .5, level: 1 });
  world.tickEffects(.016);
  const hits = world.effects.filter(effect => effect.kind === 'hit');
  assert.equal(hits.length, 160);
  assert.equal(hits[0].x, 140, '오래된 장식부터 버린다');
  assert(world.effects.some(effect => effect.kind === 'slash2' && effect.nextHit === .5));
});
