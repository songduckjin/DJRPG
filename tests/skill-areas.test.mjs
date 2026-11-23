import './ts-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { allSkillIds, allPassiveIds, skillDamageScale, skillRange } = await import('../src/game/skills.ts');
const { SKILL_AREAS, PASSIVE_AREAS, skillArea, iceArrowSlow, multiShotPattern, projectedAreaRadii } = await import('../src/game/battle/skillAreas.ts');
const { CombatEngine } = await import('../src/game/combat/engine.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const engine = readFileSync(new URL('../src/game/combat/engine.ts', import.meta.url), 'utf8');
const vfx = readFileSync(new URL('../src/game/render/vfx.ts', import.meta.url), 'utf8');
class FixedCombat extends CombatEngine { tickEnemies(_dt) {} }
const dummy = (x, y = 0) => ({ x, y, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });

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

test('더블 샷은 두 화살이 동시에 출발해 같은 적에게 두 번 피해를 준다', () => {
  const save = freshSave('male', 'archer'); save.learned = ['doubleShot']; save.quickSlots = ['doubleShot', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1; world.enemies = [dummy(160)];
  world.action('doubleShot'); world.cooldown.attack = 999;
  const shots = world.effects.filter(effect => effect.kind === 'shot');
  assert.equal(shots.length, 2);
  assert.equal(shots[0].age, shots[1].age);
  assert.equal(shots[0].duration, shots[1].duration);
  world.update(.25);
  assert(Math.abs(world.enemies[0].maxHp - world.enemies[0].hp - totalStats(save).attack * 1.35 * 2) < 1e-6);
});

test('궁수 화살은 움직이는 적을 추적하지 않고 발사 방향으로 직진한다', () => {
  const save = freshSave('female', 'archer'); save.learned = ['doubleShot']; save.quickSlots = ['doubleShot', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const enemy = dummy(160); world.enemies = [enemy];
  world.action('doubleShot'); world.cooldown.attack = 999;
  const shots = world.effects.filter(effect => effect.kind === 'shot');
  assert.equal(shots.length, 2);
  assert(shots.every(effect => effect.aim === undefined && effect.tx === 160 && effect.ty === 0));
  enemy.x = 300; enemy.y = 120;
  world.update(.08);
  assert(shots.every(effect => effect.tx === 160 && effect.ty === 0));
  world.update(.2);
  assert.equal(enemy.hp, enemy.maxHp);
});

test('멀티 샷 다섯 화살은 최대 사거리까지 관통하고 적마다 한 번만 때린다', () => {
  const save = freshSave('male', 'archer'); save.learned = ['multiShot']; save.quickSlots = ['multiShot', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1;
  world.enemies = [dummy(80), dummy(170), dummy(245), dummy(170, 150), dummy(270)];
  const enemies = [...world.enemies];
  world.action('multiShot'); world.cooldown.attack = 999;
  const shots = world.effects.filter(effect => effect.kind === 'shot');
  assert.equal(shots.length, 5);
  assert(shots.every(effect => effect.piercing && Math.hypot(effect.tx - effect.x, effect.ty - effect.y) === skillArea('multiShot', 1).range));
  world.update(.35);
  for (const enemy of enemies.slice(0, 3)) assert(Math.abs(enemy.maxHp - enemy.hp - totalStats(save).attack * .95) < 1e-6);
  assert(enemies.slice(3).every(enemy => enemy.hp === enemy.maxHp));
});

test('멀티 샷은 레벨이 오르면 화살 수와 부채꼴 폭이 넓어지고 모두 관통한다', () => {
  assert.deepEqual([1, 4, 7, 10].map(level => multiShotPattern(level).count), [5, 7, 9, 11]);
  assert(multiShotPattern(10).halfArc > multiShotPattern(1).halfArc);
  const save = freshSave('female', 'archer'); save.learned = ['multiShot'];
  save.quickSlots = ['multiShot', null, null]; save.skillLevels.multiShot = 10;
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const center = dummy(160), edge = dummy(180 * Math.cos(.7), 180 * Math.sin(.7));
  world.enemies = [center, edge];
  world.action('multiShot'); world.cooldown.attack = 999;
  const shots = world.effects.filter(effect => effect.kind === 'shot');
  assert.equal(shots.length, 11);
  assert(shots.every(effect => effect.piercing && effect.hitEnemies === shots[0].hitEnemies));
  const angles = shots.map(effect => effect.angle);
  assert(Math.abs(angles[0] + .7) < 1e-9);
  assert(Math.abs(angles.at(-1) - .7) < 1e-9);
  assert(shots.every(effect => Math.abs(Math.hypot(effect.tx - effect.x, effect.ty - effect.y) - skillArea('multiShot', 10).range) < 1e-9));
  world.update(.4);
  const expected = totalStats(save).attack * .95 * skillDamageScale(10);
  assert(Math.abs(center.maxHp - center.hp - expected) < 1e-6);
  assert(Math.abs(edge.maxHp - edge.hp - expected) < 1e-6);
});

test('저격 일격은 빨간 조준 표시 뒤 단일 대상에게 강한 한 발을 쏜다', () => {
  const save = freshSave('female', 'archer'); save.learned = ['snipe']; save.quickSlots = ['snipe', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const target = dummy(160), other = dummy(160, 70); world.enemies = [target, other];
  world.action('snipe'); world.cooldown.attack = 999;
  const mark = world.effects.find(effect => effect.kind === 'snipeMark');
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(mark && shot && shot.variant === 'snipe' && shot.launch > 0);
  assert.equal(mark.x, shot.tx); assert.equal(mark.y, shot.ty);
  world.update(.2);
  assert.equal(target.hp, target.maxHp);
  world.update(.3);
  assert(Math.abs(target.maxHp - target.hp - totalStats(save).attack * 6.5 * 1.8) < 1e-6);
  assert.equal(other.hp, other.maxHp);
  assert(world.effects.some(effect => effect.kind === 'hit' && effect.crit));
});

test('폭풍 연사는 한 발씩 발사하고 처치 뒤 남은 화살을 다음 적에게 보낸다', () => {
  const save = freshSave('male', 'archer'); save.learned = ['stormVolley']; save.quickSlots = ['stormVolley', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const first = dummy(120), next = dummy(200); first.hp = 1;
  world.enemies = [first, next];
  world.action('stormVolley'); world.cooldown.attack = 999;
  const shots = () => world.effects.filter(effect => effect.kind === 'shot' && effect.source === 'stormVolley');
  assert.equal(shots().length, 1);
  assert.equal(shots()[0].tx, first.x);
  world.update(.14);
  assert(!world.enemies.includes(first));
  assert.equal(shots().length, 0);
  world.update(.05);
  assert.equal(shots().length, 1);
  assert.equal(shots()[0].tx, next.x);
  for (let index = 0; index < 4; index++) world.update(.18);
  assert.equal(world.effects.find(effect => effect.kind === 'volleyCast')?.hits, 6);
});

test('애로우 레인은 레벨에 따라 타격 반경과 지속 시간이 커진다', () => {
  const first = skillArea('arrowRain', 1), last = skillArea('arrowRain', 10);
  assert.equal(first.radius, 92); assert.equal(last.radius, 146);
  assert.equal(first.duration, 3.2); assert(last.duration > 4);
  const save = freshSave('female', 'archer'); save.learned = ['arrowRain'];
  save.quickSlots = ['arrowRain', null, null]; save.skillLevels.arrowRain = 10;
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const center = dummy(160), inside = dummy(160, 140), outside = dummy(160, 155);
  world.enemies = [center, inside, outside];
  world.action('arrowRain'); world.cooldown.attack = 999;
  const rain = world.effects.find(effect => effect.kind === 'rain');
  assert.equal(rain.radius, 146); assert.equal(rain.duration, last.duration);
  world.update(.2);
  assert(inside.hp < inside.maxHp);
  assert.equal(outside.hp, outside.maxHp);
});

test('빙결 화살 한 발은 착탄 반경의 주변 적도 둔화하고 레벨에 따라 더 오래 느리게 한다', () => {
  assert.deepEqual(iceArrowSlow(1), { duration: 2.4, speedScale: .55 });
  const strong = iceArrowSlow(10);
  assert(Math.abs(strong.duration - 4.02) < 1e-9);
  assert(Math.abs(strong.speedScale - .28) < 1e-9);
  const save = freshSave('female', 'archer'); save.learned = ['iceArrow'];
  save.quickSlots = ['iceArrow', null, null]; save.skillLevels.iceArrow = 10;
  const world = new FixedCombat(save); world.critRoll = () => 1;
  const center = dummy(160), inside = dummy(180, 70), outside = dummy(160, 85);
  world.enemies = [center, inside, outside];
  world.action('iceArrow'); world.cooldown.attack = 999;
  assert.equal(world.effects.filter(effect => effect.kind === 'shot').length, 1);
  world.update(.3);
  assert(center.hp < center.maxHp);
  assert.equal(inside.hp, inside.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(center.slow, strong.duration);
  assert.equal(inside.slow, strong.duration);
  assert.equal(inside.slowScale, strong.speedScale);
  assert.equal(outside.slow, 0);
  assert(world.effects.some(effect => effect.kind === 'iceBurst' && effect.radius === 80));
});

test('관통 사격은 사거리 끝까지 좁게 뻗어 최대 네 적을 차례로 때린다', () => {
  const save = freshSave('male', 'archer'); save.learned = ['pierceShot']; save.quickSlots = ['pierceShot', null, null];
  const world = new FixedCombat(save); world.critRoll = () => 1;
  world.enemies = [dummy(50), dummy(110), dummy(180), dummy(260), dummy(290), dummy(120, 40)];
  const enemies = [...world.enemies];
  world.action('pierceShot'); world.cooldown.attack = 999;
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(shot.piercing);
  assert.equal(Math.hypot(shot.tx - shot.x, shot.ty - shot.y), skillArea('pierceShot', 1).range);
  world.update(.35);
  assert(enemies.slice(0, 4).every(enemy => enemy.hp < enemy.maxHp));
  assert(enemies.slice(4).every(enemy => enemy.hp === enemy.maxHp));
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
