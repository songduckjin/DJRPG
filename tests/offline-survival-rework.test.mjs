/**
 * 방치 사냥 개선 (2026-11-24) — 생존 스탯·사망/부활 손실·층간 형평성·UI 1안.
 *
 * 대장님·송덕진 님 양측 확정 사양(`downloads/djrpg_offline_rework/proposal.md`):
 *  ① 접속·방치 부활 대기 5초(입문 1~4층 면제 0초) — 양쪽이 같은 상수를 쓴다.
 *  ② 방치 처치 수에 체력·방어·회피·피흡·체력회복과 사망 손실을 반영하고, 보스전도 회피·피흡·회복을 본다.
 *  ③ 스킬 위력은 엔진과 한 표(`SKILL_HIT_POWER`)를 쓴다 — 하드코딩 사본 금지(파워 스트라이크 ×5.5).
 *  ④ 층간 형평성 `안 A` — 마리당 금화·경험치를 몹 HP에 비례해 올린다.
 *  ⑤ 「층 선택」 창 1안 — 시간당 처치 수·`★ 최다`·`▼N%`(계산은 `offline.ts`, 그리는 건 `floorModal.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 기념 종일 버프(2026-11-22 공·방·체 +30%)를 끈 시각으로 시계를 고정한다 — 밸런스 값이 흔들리지 않게.
import './patch-buff-off.mjs';

const { freshSave, totalStats } = await import('../src/game/store.ts');
const offline = await import('../src/game/offline.ts');
const formulas = await import('../src/game/battle/formulas.ts');
const { killReward, killGold, MAX_FLOOR } = await import('../src/game/progress.ts');
const { SKILL_HIT_POWER, skills, skillDamageScale } = await import('../src/game/skills.ts');
const { skillCastScale } = await import('../src/game/loadout.ts');
const { effectiveExtraOptions } = await import('../src/game/extraOptions.ts');
const { REVIVE_SECONDS, reviveSeconds, EARLY_REGEN_FLOOR } = await import('../src/game/combat/engine.ts');

/** 시험용 장비 한 벌 — 등급·스탯·추가옵션을 그대로 넣는다(추가옵션은 등급 개수·1~3% 규칙을 지킨다). */
let nextGear = 0;
function item(slot, stats, extraOptions) {
  nextGear += 1;
  const gear = { id: `surv-${slot}-${nextGear}`, name: `시험 ${slot}`, slot, rarity: extraOptions ? 'legendary' : 'common', stats };
  if (extraOptions) gear.extraOptions = extraOptions;
  return gear;
}

/**
 * 그 층에서 사냥하는 캐릭터 — 공격은 장비 하나로, 생존은 체력·방어로 준다.
 * `survival`을 주면 회피·피흡·체력회복 추가옵션을 얹는다(전설 3옵션 × 4부위).
 */
function hunter({ floor = 20, maxFloor = MAX_FLOOR, attack = 300, health = 2_000, defense = 400, survival = false } = {}) {
  const save = freshSave('male', 'warrior');
  save.tutorial = 3; save.level = 17;
  save.floor = floor; save.maxFloor = Math.max(floor, maxFloor); save.floorKills = 0; save.autoClimb = true;
  save.equipment = { weapon: item('weapon', { attack }) };
  if (health || defense) save.equipment.armor = item('armor', { health, defense });
  if (survival) {
    // 회피·피흡·회복을 3%씩 4부위 — 상한(30%·5%·12%) 안에서 실제로 올라간다.
    for (const slot of ['helmet', 'gloves', 'boots', 'necklace']) {
      save.equipment[slot] = item(slot, {}, { evasionPct: 3, lifestealPct: 3, regenPct: 3 });
    }
  }
  save.health = totalStats(save).health;
  return save;
}

test('부활 대기는 접속과 방치가 같은 5초이고, 입문 1~4층은 면제(0초)다', () => {
  assert.equal(REVIVE_SECONDS, 5);
  assert.equal(EARLY_REGEN_FLOOR, 4);
  for (const floor of [1, 2, 3, 4]) assert.equal(reviveSeconds(floor), 0, `${floor}층은 면제`);
  for (const floor of [5, 10, 20]) assert.equal(reviveSeconds(floor), 5, `${floor}층은 5초`);
  // 방치 가동률도 같은 상수를 쓴다 — 5초 대기면 100초 버티는 캐릭터는 100/105만 사냥한다.
  const save = hunter({ floor: 20 });
  const survive = offline.offlineSurviveSeconds(save, 20);
  const uptime = offline.offlineSurvivalUptime(save, 20);
  if (Number.isFinite(survive)) assert(Math.abs(uptime - survive / (survive + REVIVE_SECONDS)) < 1e-12);
  // 1~4층은 대기가 0이라 죽어도 사냥 시간을 잃지 않는다(가동률 1).
  for (const floor of [1, 4]) assert.equal(offline.offlineSurvivalUptime(save, floor), 1, `${floor}층 가동률 1`);
});

test('생존 스탯이 처치 수를 가른다 — 같은 층에서 방어·체력·회피·피흡·회복을 올리면 늘어난다', () => {
  const weak = hunter({ floor: 20, health: 1_200, defense: 250 });
  const tanky = hunter({ floor: 20, health: 3_200, defense: 750 });
  assert(offline.offlineKillsPerMinute(tanky) > offline.offlineKillsPerMinute(weak), '체력·방어가 높으면 더 잡는다');
  const fragile = hunter({ floor: 20, health: 1_200, defense: 250 });
  const evasive = hunter({ floor: 20, health: 1_200, defense: 250, survival: true });
  const extras = effectiveExtraOptions(evasive.equipment);
  assert(extras.evasionPct > 0 && extras.lifestealPct > 0 && extras.regenPct > 0, '추가옵션이 실제로 붙었다');
  assert(offline.offlineDamagePerSecond(evasive, 20) < offline.offlineDamagePerSecond(fragile, 20), '회피는 받는 피해를 줄인다');
  assert(offline.offlineHealPerSecond(evasive, 20) > offline.offlineHealPerSecond(fragile, 20), '피흡·회복은 초당 회복을 늘린다');
  assert(offline.offlineKillsPerMinute(evasive) > offline.offlineKillsPerMinute(fragile), '그래서 처치 수가 는다');
  // 공격력은 그대로 두고 생존만 올렸는데 처치 수가 달라졌다 — 종전에는 공격 DPS만 봤다.
  assert.equal(totalStats(evasive).attack, totalStats(fragile).attack);
});

test('회복이 피해를 넘으면 그 층에서는 죽지 않는다(버티는 초 ∞ · 가동률 1 · 쓰러짐 0)', () => {
  // 체력회복 12%/5초는 초당 2.4% — 피해가 그보다 작으면 순피해가 0 이하다.
  const save = hunter({ floor: 1, health: 4_000, defense: 400 });
  save.equipment.belt = { id: 'regen-cap', name: '회복 시험', slot: 'belt', rarity: 'legendary', stats: {}, extraOptions: { regenPct: 3, evasionPct: 3, lifestealPct: 3 } };
  save.health = totalStats(save).health;
  // 1층은 입문 완화 + 자연회복 1%/초라 어떤 장비든 회복이 피해를 넘는다.
  assert.equal(offline.offlineSurviveSeconds(save, 1), Infinity);
  assert.equal(offline.offlineSurvivalUptime(save, 1), 1);
  assert.equal(offline.offlineDeathsPerHour(save, 1), 0);
  assert.equal(
    offline.offlineKillsPerMinute(save, 1),
    Math.max(1, 60 * Math.min(offline.offlineHeroDps(save) / formulas.enemyMaxHp(1, false), formulas.fieldSpawnRate(1)) * offline.OFFLINE_EFFICIENCY)
  );
  // 쓰러지는 스펙에서는 가동률이 1보다 작고 처치 수가 그만큼 깎인다.
  const dying = hunter({ floor: 20, health: 1_000, defense: 200 });
  assert(Number.isFinite(offline.offlineSurviveSeconds(dying, 20)));
  assert(offline.offlineSurvivalUptime(dying, 20) < 1);
  assert(offline.offlineDeathsPerHour(dying, 20) > 0);
});

test('약한 스펙일수록 더 깎인다 — 같은 20층에서 저스펙 < 표준 < 풀', () => {
  const tiers = [0.6, 1, 1.6].map(scale => offline.killsPerHourAt(
    hunter({ floor: 20, attack: 250 * scale, health: 1_400 * scale, defense: 300 * scale }), 20));
  assert(tiers[0] < tiers[1] && tiers[1] < tiers[2], `저스펙 < 표준 < 풀 (${tiers.join(' < ')})`);
  // 스펙이 좋을수록 덜 깎인다 — 가동률이 1에 가까워진다.
  const uptimes = [0.6, 1, 1.6].map(scale => offline.offlineSurvivalUptime(
    hunter({ floor: 20, attack: 250 * scale, health: 1_400 * scale, defense: 300 * scale }), 20));
  assert(uptimes[0] <= uptimes[1] && uptimes[1] <= uptimes[2], '가동률도 스펙을 따라 오른다');
  // 방치 정산이 실제로 그 값을 쓴다 — 12시간 정산의 처치 수가 스펙 순서와 같다.
  const settle = scale => {
    const save = hunter({ floor: 20, attack: 250 * scale, health: 1_400 * scale, defense: 300 * scale });
    return offline.applyOfflineRewards(save, 43_200)?.kills ?? 0;
  };
  assert(settle(0.6) < settle(1) && settle(1) < settle(1.6), '정산 처치 수도 스펙 순서를 지킨다');
});

test('보스전도 회피·피흡·체력회복을 반영한다 — 받는 피해가 줄고, 승패는 그대로다', () => {
  const plain = hunter({ floor: 20, attack: 320, health: 2_000, defense: 400 });
  const withExtras = hunter({ floor: 20, attack: 320, health: 2_000, defense: 400, survival: true });
  const a = offline.offlineBossBattle(plain, 20);
  const b = offline.offlineBossBattle(withExtras, 20);
  const evasion = effectiveExtraOptions(withExtras.equipment).evasionPct;
  assert(evasion > 0);
  assert(b.bossDps < a.bossDps, '회피만큼 보스에게 덜 맞는다');
  assert(Math.abs(b.bossDps - formulas.enemyHitDamage(20, true, totalStats(withExtras).defense) / offline.BOSS_HIT_INTERVAL * (1 - evasion / 100)) < 1e-9);
  // 회복이 피해보다 크지 않은 보통 스펙에서는 승패·처치 시간이 바뀌지 않는다(밸런스 불변).
  if (a.win && b.win) assert(absClose(a.seconds, b.seconds), '이기는 판의 걸리는 시간은 처치 시간 그대로');
  assert.equal(a.win, b.win, '승패 판정은 그대로(버티는 초만 정확해진다)');
  function absClose(x, y) { return Math.abs(x - y) < 1e-9; }
});

test('스킬 위력은 엔진과 한 표 — 방치도 파워 스트라이크 ×5.5를 쓴다(하드코딩 사본 없음)', () => {
  assert.equal(SKILL_HIT_POWER.power, 5.5, '파워 스트라이크 ×5.5');
  assert.equal(SKILL_HIT_POWER.snipe, 6.5);
  assert.equal(skillCastScale('power', 1), 5.5, '스킬 추천 순위(시전 계수)도 같은 표를 쓴다');
  const save = freshSave('male', 'warrior');
  save.level = 17;
  save.learned = ['power']; save.passives = []; save.skillLevels = { power: 1 }; save.quickSlots = ['power', null, null];
  save.equipment = { weapon: item('weapon', { attack: 300 }) };
  const stats = totalStats(save);
  const basic = stats.attack * formulas.basicAttackPower
    * (1 + Math.min(formulas.CRIT_CHANCE_CAP, Math.max(0, stats.crit)) / 100 * (formulas.critDamageScale(effectiveExtraOptions(save.equipment).critDmgPct) - 1))
    / formulas.attackInterval('warrior', stats.speed);
  const expected = basic + stats.attack * 5.5 * skillDamageScale(1) / skills.power.cooldown;
  assert(Math.abs(offline.offlineHeroDps(save) - expected) < 1e-6, '방치 DPS가 엔진 배율 ×5.5로 계산된다');
  // 사본이 다시 생기지 않게 소스를 직접 본다 — 엔진·방치는 `SKILL_HIT_POWER`를 읽는다.
  const engine = readFileSync(new URL('../src/game/combat/engine.ts', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/game/offline.ts', import.meta.url), 'utf8');
  assert.match(engine, /attack \* SKILL_HIT_POWER\.power \* damageScale/);
  assert.match(source, /SKILL_HIT_POWER\[id\]/);
  assert.doesNotMatch(source, /power:\s*4\b/, '옛 ×4 사본이 남아 있지 않다');
});

test('층간 형평성 안 A — 마리당 보상이 몹 HP를 따라 오르고, 시간당 금화가 깊은 층에서 역전되지 않는다', () => {
  assert.equal(formulas.depthRewardScale(15), 1, '15층이 기준(×1)');
  for (const floor of [1, 10, 15]) assert.equal(formulas.depthRewardScale(floor), 1, `${floor}층은 1배`);
  assert(Math.abs(formulas.depthRewardScale(20) - formulas.enemyMaxHp(20, false) / formulas.enemyMaxHp(15, false)) < 1e-12);
  // 던전 정산 금화는 그대로(필드 계수·층 보상 배율을 곱하지 않는다).
  assert.equal(killGold(20), 23, '던전 정산은 3 + 층');
  assert.equal(killReward({ floor: 20 }, { boss: true }).gold, 70 * 20, '보스 금화 70×층은 그대로');
  for (let floor = 16; floor <= MAX_FLOOR; floor++) {
    assert(killReward({ floor }).gold >= killReward({ floor: floor - 1 }).gold, `${floor}층 마리당 금화가 내려가지 않는다`);
  }
  // 젠 상한에 걸리는 아주 센 캐릭터로 11~20층을 비교 — 시간당 금화가 깊은 층에서 역전되지 않는다.
  const strong = hunter({ floor: 20, attack: 50_000, health: 200_000, defense: 5_000 });
  let previous = 0;
  for (let floor = 11; floor <= MAX_FLOOR; floor++) {
    const perHour = offline.killsPerHourAt(strong, floor) * killReward({ floor }).gold;
    assert(perHour > previous, `${floor}층 금화/시간 ${perHour} > ${previous}`);
    previous = perHour;
  }
});

test('「층 선택」 1안이 읽는 값 — 시간당 처치 수와 최다 층', () => {
  const save = hunter({ floor: 20, attack: 400, health: 2_400, defense: 500 });
  save.floor = 18;
  const best = offline.bestFarmFloor(save);
  assert(best >= 1 && best <= save.maxFloor, '최고 도달 층 이하에서만 고른다');
  for (let floor = 1; floor <= save.maxFloor; floor++) {
    assert(offline.killsPerHourAt(save, floor) <= offline.killsPerHourAt(save, best), `${floor}층이 최다보다 크면 안 된다`);
  }
  assert.equal(offline.killsPerHourAt(save, best), Math.round(offline.offlineKillsPerMinute(save, best) * 60));
  // 잠긴 층은 최다 후보가 아니다 — 최고 층을 좁히면 후보도 줄어든다.
  const narrow = hunter({ floor: 3, maxFloor: 3, attack: 400, health: 2_400, defense: 500 });
  assert(offline.bestFarmFloor(narrow) <= 3);
});
