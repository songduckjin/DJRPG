// 백로그 2번 — 장비 추가옵션 `치명타 피해량`(critDmgPct).
//
// 덕진 님 확정 스펙: ① `critDmgPct` 1~3% ② 합산 상한 +15% ③ 전투력 가중치 1.2
// ④ `치명타 확률`(critPct)과 `치명타 피해량`(critDmgPct)을 이름·표기로 갈라 적는다
// ⑤ 스탯 계산·전투 공식·상세 스탯·장비 상세·거래소·서버 검증(save-guard)까지 한 값으로 이어진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
// 기념 종일 버프(2026-11-22 공·방·체 +30%)를 끈 시계로 고정한다 — 전투력·DPS 스냅샷이 흔들리지 않게.
import './patch-buff-off.mjs';

const extra = await import('../src/game/extraOptions.ts');
const items = await import('../src/game/items.ts');
const store = await import('../src/game/store.ts');
const worldModule = await import('../src/game/world.ts');
const offline = await import('../src/game/offline.ts');
const { statSheet } = await import('../src/game/statSheet.ts');
const formulas = await import('../src/game/battle/formulas.ts');
const serverExtra = await import('../server/extra-options.mjs');
const guard = await import('../server/save-guard.mjs');

const { freshSave, totalStats } = store;
const { World } = worldModule;

/** 전설 장비 하나 — 전설은 추가옵션 3개가 규칙이라 늘 세 키를 채운다. */
const legendary = (id, slot, options) => ({ id, name: `시험용 ${slot}`, slot, rarity: 'legendary', stats: {}, extraOptions: options });
/** 치명타 피해량 3% + 나머지 두 키(값이 피해에 끼어들지 않는 것). */
const critDmgGear = (id, slot) => legendary(id, slot, { critDmgPct: 3, attackPct: 1, speedPct: 1 });
const slotsOf = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2'];

// ── 1. 키·이름·범위 ─────────────────────────────────────────────────────────
test('추가옵션 풀 맨 뒤에 `critDmgPct`가 붙고, 이름은 `치명타 피해량` · `critPct`는 `치명타 확률`이다', () => {
  assert.deepEqual([...extra.extraOptionKeys], [
    'regenPct', 'bonusDmgPct', 'lifestealPct', 'attackPct', 'critPct',
    'defensePct', 'healthPct', 'evasionPct', 'speedPct', 'cdrPct', 'critDmgPct'
  ], '맨 뒤에 덧붙여야 저장된 옛 장비의 옵션이 바뀌지 않는다');
  assert.equal(extra.extraOptionNames.critDmgPct, '치명타 피해량');
  assert.equal(extra.extraOptionNames.critPct, '치명타 확률', '기존 치명타는 확률이다');
  assert.notEqual(extra.extraOptionNames.critPct, extra.extraOptionNames.critDmgPct);
  assert.deepEqual(extra.extraOptionRange('critDmgPct'), { min: 1, max: 3 });
});

test('`critDmgPct`는 1~3% 정수로 뽑히고 서버 사본도 같은 옵션을 계산한다', () => {
  let seen = 0;
  for (const rarity of ['epic', 'unique', 'legendary']) {
    for (let index = 0; index < 80; index++) {
      const id = crypto.randomUUID();
      const mine = extra.deriveExtraOptions(rarity, id);
      assert.deepEqual(serverExtra.deriveExtraOptions(rarity, id), mine, `${rarity} ${id}`);
      const value = mine.critDmgPct;
      if (value !== undefined) { seen++; assert(Number.isInteger(value) && value >= 1 && value <= 3, `critDmgPct=${value}는 1~3 정수`); }
    }
  }
  assert(seen > 0, '풀에 실제로 들어 있다');
});

// ── 2. 합산 상한 +15% ───────────────────────────────────────────────────────
test('합산 상한은 +15% — 10부위를 3%씩 채운 30%도 전투 값은 15%다', () => {
  assert.equal(extra.EXTRA_CRIT_DMG_CAP, 15);
  assert.equal(guard.EXTRA_CRIT_DMG_CAP, 15, '서버 사본도 같은 상한');
  assert.equal(formulas.CRIT_DAMAGE_BONUS_CAP, 15, '배수식의 단일 기준도 같은 값');
  const save = freshSave();
  save.equipment = Object.fromEntries(slotsOf.map(slot => [slot, critDmgGear(`cap-${slot}`, slot)]));
  assert.equal(extra.extraOptionTotals(save.equipment).critDmgPct, 30, '원래 합은 30%');
  assert.equal(extra.effectiveExtraOptions(save.equipment).critDmgPct, 15, '전투 값은 15%에서 자른다');
  assert.equal(extra.extraCritDamageScale(save.equipment), 1.95);
});

// ── 3. 전투 공식 ────────────────────────────────────────────────────────────
test('치명타 한 방은 1.8배 + 치명타 피해량만큼 들어가고, 확률 판정은 그대로다', () => {
  const swing = (equipment, critRoll) => {
    const save = freshSave(); save.level = 30; save.equipment = equipment;
    const world = new World(save);
    world.spawnTimer = 999; world.cooldown.attack = 999;
    world.critRoll = critRoll;
    const enemy = world.enemies[0];
    enemy.x = 10; enemy.y = 0; enemy.hp = enemy.maxHp = 1e9;
    world.damage(120, 1000, 0, Math.PI, 0, 0, world.player, 1);
    return enemy.maxHp - enemy.hp;
  };
  const force = () => 0, never = () => 1;          // critRoll 0 = 항상 치명타, 1 = 절대 아님
  assert.ok(Math.abs(swing({}, force) - 1000 * 1.8) < 1e-6, '장비가 없으면 1.8배');
  assert.ok(Math.abs(swing({ weapon: critDmgGear('w', 'weapon') }, force) - 1000 * 1.83) < 1e-6, '+3%면 1.83배');
  assert.ok(Math.abs(swing({ weapon: critDmgGear('w', 'weapon') }, never) - 1000) < 1e-6, '치명타가 아니면 배수는 없다');
  const capped = Object.fromEntries(slotsOf.map(slot => [slot, critDmgGear(`cap-${slot}`, slot)]));
  assert.ok(Math.abs(swing(capped, force) - 1000 * 1.95) < 1e-6, '상한 15%면 1.95배');
});

test('방치 정산(DPS)도 같은 치명타 배수를 쓴다', () => {
  const bare = freshSave(); bare.level = 30; bare.equipment = {};
  // 에픽은 추가옵션 1개 — 치명타 피해량만 달아 공격력·공속은 그대로 둔다.
  const geared = freshSave(); geared.level = 30;
  geared.equipment = { weapon: { id: 'w', name: '시험용 검', slot: 'weapon', rarity: 'epic', stats: {}, extraOptions: { critDmgPct: 3 } } };
  const base = offline.offlineHeroDps(bare);
  const withCritDamage = offline.offlineHeroDps(geared);
  const crit = Math.min(formulas.CRIT_CHANCE_CAP, Math.max(0, totalStats(geared).crit)) / 100;
  const expected = base * (1 + crit * (1.83 - 1)) / (1 + crit * (1.8 - 1));
  assert.ok(Math.abs(withCritDamage - expected) < Math.max(1e-6, expected * 1e-6), `${withCritDamage} vs ${expected}`);
});

// ── 4. 화면: 상세 스탯·장비 상세 ────────────────────────────────────────────
test('상세 스탯의 `치명타 피해`는 180% + 장비 몫으로 오르고 상한을 적는다', () => {
  const row = equipment => {
    const save = freshSave(); save.level = 5; save.equipment = equipment;
    const sheet = statSheet(save, { currentHp: 100, attackInterval: worldModule.cooldowns.attack });
    return sheet.groups.flatMap(group => group.rows).find(cell => cell.key === 'critDamage');
  };
  assert.equal(row({}).value, '180%');
  assert.equal(row({}).note, undefined, '장비 몫이 없으면 설명도 없다');
  assert.equal(row({ weapon: critDmgGear('w', 'weapon') }).value, '183%');
  assert.equal(row({ weapon: critDmgGear('w', 'weapon') }).note, '장비 +3%');
  const capped = Object.fromEntries(slotsOf.map(slot => [slot, critDmgGear(`cap-${slot}`, slot)]));
  assert.equal(row(capped).value, '195%');
  assert.equal(row(capped).note, '장비 +15% · 상한');
});

test('장비 상세·거래소가 쓰는 옵션 줄은 `치명타 확률 +N%`와 `치명타 피해량 +N%`로 갈린다', () => {
  const item = legendary('line-1', 'weapon', { critPct: 2, critDmgPct: 3, attackPct: 1 });
  const lines = extra.extraOptionLines(item);
  assert.ok(lines.includes('✨ 치명타 확률 +2%'), lines.join(' / '));
  assert.ok(lines.includes('✨ 치명타 피해량 +3%'), lines.join(' / '));
  assert.ok(!lines.some(line => line === '✨ 치명타 +2%'), '옛 이름(치명타)은 남기지 않는다');
  // 내 정보(장비창 머리)의 `치명타` 칸도 확률임을 이름으로 밝힌다.
  assert.equal(items.statNames.crit, '치명타 확률');
});

// ── 5. 전투력 가중치 ────────────────────────────────────────────────────────
test('전투력에서 1%당 1.2 — 치명타 확률(2.5)보다 낮다', () => {
  const power = options => extra.extraOptionPower({ id: 'p', rarity: 'epic', extraOptions: options });
  assert.equal(power({ critDmgPct: 2 }), 2.4);
  assert.equal(power({ critPct: 2 }), 5);
  assert(power({ critDmgPct: 3 }) < power({ critPct: 3 }), '확률이 100%가 아니면 피해량이 덜 값어치 있다');
});

// ── 6. 서버 검증 ────────────────────────────────────────────────────────────
test('서버 save-guard는 새 키를 받아들이고 범위 밖 값·개수 초과는 거부한다', () => {
  assert.equal(serverExtra.extraOptionsWithin({ rarity: 'legendary', extraOptions: { critDmgPct: 3, critPct: 2, attackPct: 1 } }), true);
  assert.equal(serverExtra.extraOptionsWithin({ rarity: 'legendary', extraOptions: { critDmgPct: 4, critPct: 2, attackPct: 1 } }), false, '4%는 범위 밖');
  assert.equal(serverExtra.extraOptionsWithin({ rarity: 'legendary', extraOptions: { critDmgPct: 0, critPct: 2, attackPct: 1 } }), false, '0%는 범위 밖');
  assert.equal(serverExtra.extraOptionsWithin({ rarity: 'epic', extraOptions: { critDmgPct: 2 } }), true);
  // 정상 드롭은 능력치 상한 검사도 통과한다.
  const item = { id: 'guard-1', name: '시험용 검', slot: 'weapon', rarity: 'epic', stats: { attack: 4 }, extraOptions: { critDmgPct: 3 } };
  assert.equal(guard.itemWithinBounds(item, 1), true);
});
