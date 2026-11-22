// 방치(오프라인) 보상의 자동 분해 (작업 254).
//
// 사용자 확정(2026-11-21): "방치자동분해적용" — 방치하는 동안 떨어진 장비도 접속 사냥·던전과 **같은 규칙**
// (`inventory.ts` `autoSalvageRecovered`)으로 그 자리에서 금화·강화석이 되고, 가방에는 들어가지 않는다.
// 보호 규칙(스킬북·보물 주머니·잠금·등급 초과·`+N` 초과·빈 슬롯·더 좋은 장비)도 그대로다.
//
// 여기서는 정산 결과(`reward.salvaged`)와 세이브(금화·강화석·가방·`salvageCount`)가 함께 맞는지,
// 그리고 서버 저장 상한(`server/save-guard.mjs` `rewardBudget`)을 넘지 않는지 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { applyOfflineRewards } = await import('../src/game/offline.ts');
const { salvageGold, salvageStones, isEquipment, canWield } = await import('../src/game/items.ts');
const { rewardBudget, MAX_OFFLINE_SECONDS } = await import('../server/save-guard.mjs');
const { autoSalvageBlock } = await import('../src/game/inventory.ts');

/** 같은 수열을 다시 만들어 두 정산을 나란히 비교하기 위한 시드 난수. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

/** 모든 부위를 아주 강한 장비로 채운 세이브 — 떨어진 장비는 '더 좋은 장비'도 '빈 슬롯'도 아니라 분해된다. */
function decked() {
  const save = freshSave();
  save.tutorial = 1;
  save.autoClimb = false; // 보스전 없이 순수 사냥만 — 금화·처치 수를 그대로 셀 수 있다.
  for (const slot of ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2']) {
    save.equipment[slot] = { id: `worn-${slot}`, name: `worn-${slot}`, slot, rarity: 'common', stats: { attack: 5000 } };
  }
  return save;
}

/** 한 번 정산하고, 계산에 필요한 값을 모아 돌려준다. */
function settle(save, options) {
  const before = { gold: save.gold, stones: save.stones };
  const reward = applyOfflineRewards(save, 43_200, options);
  return { reward, before, save };
}

test('방치 정산도 자동 분해를 적용한다 — 분해된 장비는 가방에 없고 금화·강화석으로 정산된다(작업 254)', () => {
  const original = Math.random;
  try {
    Math.random = seeded(20261121);
    const off = settle(decked());
    Math.random = seeded(20261121);
    const on = settle(decked(), { autoSalvage: 'epic', autoSalvagePlus: 4 });

    assert(off.reward.kills > 10_000, `12시간이면 만 마리 넘게 잡는다 (${off.reward.kills})`);
    assert(on.reward.salvaged.count > 0, '설정 등급 이하 장비가 자동 분해됐다');
    // 같은 난수 수열이므로 **떨어진 개수는 같다** — 켠 쪽은 분해된 만큼이 가방 대신 금화·강화석이 된다.
    // (12시간이면 가방 40칸을 넘겨 못 줍는 드롭도 생기므로 `items + salvaged + missed`로 견준다.)
    const offTotal = off.reward.items.length + off.reward.missedDrops;
    assert.equal(offTotal, on.reward.items.length + on.reward.salvaged.count + on.reward.missedDrops,
      '분해된 장비는 가방에 들어가지 않고, 나머지는 그대로 들어온다');
    // 분해한 장비가 가방에 남아 있지 않다(개수 = 분해 몫만큼 정확히 줄었다).
    assert.equal(on.save.bag.length, on.reward.items.length);
    // 금화·강화석 정산이 `reward.salvaged`와 세이브에 같은 값으로 반영된다(보스전이 없어 deaths 0).
    assert.equal(on.reward.deaths, 0);
    assert.equal(on.save.gold, on.before.gold + on.reward.gold + on.reward.salvaged.gold);
    assert.equal(on.save.stones, on.before.stones + on.reward.salvaged.stones);
    // 분해 1벌 = `salvageCount` 1회(일일·주간 `장비 분해` 미션 근거).
    assert.equal(on.save.salvageCount, on.reward.salvaged.count);
    assert.equal(off.save.salvageCount, 0, '자동 분해가 꺼져 있으면 분해 횟수도 늘지 않는다');
    // 꺼진 쪽은 떨어진 것을 전부 가방에 넣는다.
    assert.equal(off.save.bag.length, off.reward.items.length);
    // 강화석은 등급표(`salvageStones`)의 합과 같다 — 0보다 크고, 최대 5개/벌을 넘지 않는다.
    assert(on.reward.salvaged.stones > 0 && on.reward.salvaged.stones <= on.reward.salvaged.count * 5);
    assert(on.reward.salvaged.gold > 0 && on.reward.salvaged.gold <= on.reward.salvaged.count * salvageGold.legendary);
    assert(salvageStones.common >= 1);
  } finally { Math.random = original; }
});

test('자동 분해를 켜도 보호 규칙은 방치에서도 그대로 — 빈 슬롯 장비·소모품은 분해되지 않는다(작업 254 · 파트 B)', () => {
  const original = Math.random;
  try {
    // 장비를 하나도 안 입은 세이브: **입을 수 있는** 장비는 '빈 슬롯' 보호 대상이라 가방에 남는다.
    // 다른 직업 무기(작업 204 교차 드롭)는 원래 보호 대상이 아니라 분해된다 — 같은 시드로 자동 분해를
    // 끈 정산과 비교해 정확히 그 몫만 분해됐는지 본다(작업 255 장비 목록 확대 뒤에도 흔들리지 않게).
    Math.random = seeded(777);
    const baseline = freshSave(); baseline.tutorial = 1; baseline.autoClimb = false;
    const all = applyOfflineRewards(baseline, 43_200, {});
    const unwearable = all.items.filter(item => isEquipment(item) && !canWield(item, 'warrior'));
    Math.random = seeded(777);
    const bare = freshSave(); bare.tutorial = 1; bare.autoClimb = false;
    const reward = applyOfflineRewards(bare, 43_200, { autoSalvage: 'unique', autoSalvagePlus: 7 });
    assert(reward.items.length > 0, '드롭은 있었다');
    // 가방이 차면 못 줍는 드롭이 생기므로, 분해된 수는 **떨어진 전체 − 가방에 든 몫 − 놓친 몫**으로 센다.
    const totalDrops = all.items.length + all.missedDrops;
    assert.equal(reward.salvaged.count, totalDrops - reward.items.length - reward.missedDrops,
      '(가방에 든 몫 + 분해 몫 + 놓친 몫) = 떨어진 전체');
    assert(reward.salvaged.count >= unwearable.length, '입을 수 없는(다른 직업) 장비는 모두 분해된다');
    assert(reward.items.every(item => !isEquipment(item) || canWield(item, 'warrior')), '빈 슬롯에 입을 장비는 분해하지 않는다');

    // 파트 B: 스킬북이 폐지되어 드롭은 장비 하나 — 영구 스탯북·보물 주머니 같은 소모품은
    // 어떤 경우에도 자동 분해 대상이 아니다(`inventory.ts`의 `autoSalvageBlock`).
    for (const consumable of [
      { id: 'b1', name: '공격의 서', slot: 'statbook', rarity: 'unique', kind: 'statbook', book: 'attack', stats: {} },
      { id: 'p1', name: '무작위 보물 주머니', slot: 'pouch', rarity: 'unique', kind: 'pouch', stats: {} }
    ]) assert.equal(autoSalvageBlock(freshSave(), consumable, 'legendary'), consumable.slot === 'statbook' ? 'statbook' : 'pouch', `${consumable.slot}는 분해 보호`);
  } finally { Math.random = original; }
});

test('방치 자동 분해로 늘어난 금화·강화석은 서버 저장 상한 안에 있다(작업 254)', () => {
  const original = Math.random;
  try {
    Math.random = seeded(4242);
    const save = decked();
    const previous = { gold: save.gold, stones: save.stones, kills: 0, bossKills: 0, maxFloor: 1, floor: 1 };
    const { reward, before } = settle(save, { autoSalvage: 'epic', autoSalvagePlus: 4 });
    const budget = rewardBudget(previous, MAX_OFFLINE_SECONDS, 1);
    // 서버는 `previous + 상한`까지만 인정한다 — 정산으로 늘어난 금화·강화석이 그 안이어야 클램프로 깎이지 않는다.
    assert(reward.salvaged.count > 0, '분해가 있었던 표본이다');
    assert.equal(save.gold - before.gold, reward.gold + reward.salvaged.gold);
    assert(save.gold <= before.gold + budget.gold, `금화 ${save.gold - before.gold} ≤ 상한 ${budget.gold}`);
    assert.equal(save.stones - before.stones, reward.salvaged.stones);
    assert(save.stones <= before.stones + budget.stones, `강화석 ${save.stones - before.stones} ≤ 상한 ${budget.stones}`);
  } finally { Math.random = original; }
});

test('보상 팝업은 분해된 개수와 금화·강화석을 함께 보여 준다(작업 254)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/ui/modals/offlineModal.ts', import.meta.url), 'utf8');
  assert.match(source, /reward\.salvaged\?\.count > 0/, '분해가 있을 때만 한 줄을 더한다');
  assert.match(source, /자동 분해 \$\{reward\.salvaged\.count\}개/, '분해 개수');
  assert.match(source, /goldMarkup\(reward\.salvaged\.gold\)/, '획득 금화');
  assert.match(source, /강화석 \$\{reward\.salvaged\.stones/, '획득 강화석');
});
