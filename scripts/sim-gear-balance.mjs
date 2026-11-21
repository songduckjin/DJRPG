/**
 * 작업 255 — 전체 장비 밸런스 시뮬레이션.
 *
 * 전사·궁수·마법사가 같은 층·등급·티어에서 **한 벌(10칸)을 꼈을 때**의 총 능력치와 전투 지표를 계산해
 * Markdown 표로 낸다. PR 본문에 그대로 붙이는 표가 여기서 나온다.
 *
 * 사용: node scripts/sim-gear-balance.mjs [--json]
 *
 * 가정
 *  - 장비 한 벌은 10칸 모두 같은 층·등급·티어의 드롭이라고 본다(비교를 위한 기준선).
 *  - 무기는 그 직업의 무기 목록, 투구·갑옷은 작업 249(PR #254) 이후의 **직업 전용** 능력치 배분을 쓴다.
 *    (그 PR이 없는 `main`에서는 투구·갑옷이 공용 기준값을 쓴다 — `--standalone`으로 그 값도 볼 수 있다.)
 *  - 레벨은 그 층에서 흔한 값(5 + 층×0.6, 최대 30)으로 둔다.
 *  - DPS는 **평타만** 센다(스킬·사거리·직업별 스킬 구성은 세 직업이 달라 여기서는 제외).
 *    `공격 × (1 + min(치명,80)/100 × 0.8) ÷ (0.48 / (1 + 공속/100))` — `world.ts`의 실제 식 그대로다.
 *  - 생존력은 `체력 ÷ (적 타격 - 방어×0.2)` — `enemyHitDamage` 그대로다.
 *  - 종합 전투력은 DPS와 생존력의 기하평균(√(DPS×EHP))이다.
 *
 * 예전(작업 255 이전) 공식도 같은 방식으로 계산해 `before`로 함께 낸다 — 새 공식이 전체 전투력을
 * 얼마나 움직였는지 보려는 것이다(옛 공식에는 직업별 배분이 없어 세 직업이 같다).
 */
import '../tests/ts-loader.mjs';

const items = await import('../src/game/items.ts');
const { freshSave } = await import('../src/game/store.ts');
const { jobs } = await import('../src/game/skills.ts');
const { enemyHitDamage } = await import('../src/game/world.ts');

const { slots, rarityOrder, rarityScales, rarityRanks, baseItems, bowBases, staffBases, gearStats, tierFactor, totalStats } = items;
const FLOORS = [1, 20, 25, 50, 78, 100];
const CRIT_CAP = 80, CRIT_SCALE = .8, ATTACK_INTERVAL = .48;

/** 그 층에서 흔한 레벨 — 시뮬레이션 기준. */
const levelFor = floor => Math.min(30, Math.max(1, Math.round(5 + floor * .6)));

/** 직업별 무기 기본형 이름. */
function weaponBase(job, tier) { return (job === 'archer' ? bowBases : job === 'mage' ? staffBases : baseItems.weapon)[tier]; }

/** 한 벌(10칸) — 주어진 층·등급·티어의 장비를 모두 끼운 세이브. */
function setFor(job, floor, rarity, tier, { standalone = false } = {}) {
  const save = freshSave('male', job);
  save.level = levelFor(floor);
  save.equipment = {};
  for (const slot of slots) {
    // 무기는 직업별, 투구·갑옷은 PR #254 이후 직업 전용(standalone이면 직업을 모르는 공용 장비).
    const gearJob = slot === 'weapon' ? job : (standalone ? undefined : job);
    const name = slot === 'weapon' ? weaponBase(job, tier)
      : slot === 'helmet' || slot === 'armor' ? `시뮬 ${slot} ${tier}` : `시뮬 ${slot} ${tier}`;
    const stats = gearStats(slot, rarity, Math.min(tier, baseItems[slot].length - 1), floor, gearJob, false, () => 0);
    save.equipment[slot] = { id: `${slot}-${job}-${tier}`, name, slot, rarity, stats, plus: 0 };
  }
  return save;
}

/** 예전(작업 255 이전) 공식으로 만든 한 벌 — 비교용. */
function legacySetFor(job, floor, rarity, tier) {
  const save = freshSave('male', job);
  save.level = levelFor(floor);
  save.equipment = {};
  for (const slot of slots) {
    const scale = (1 + Math.floor(floor / 2)) * rarityScales[rarity];
    const primary = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
    const realTier = Math.min(tier, baseItems[slot].length - 1);
    const stats = { [primary]: scale + 1 + Math.ceil(realTier * (slot === 'weapon' ? .6 : .4)) };
    if (rarity !== 'common') stats.health = 3 * scale;
    if (rarityRanks[rarity] >= rarityRanks.rare) stats.crit = scale;
    if (rarityRanks[rarity] >= rarityRanks.unique) stats.speed = scale;
    save.equipment[slot] = { id: `${slot}-${job}-${tier}`, name: weaponBase(job, realTier), slot, rarity, stats, plus: 0 };
  }
  return save;
}

/** 예전 공식 비교용 총 능력치 — 직업 숙련(작업 255) 없이 레벨 기본값 + 장비 합만 센다. */
function legacyTotal(save) {
  const total = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 100 + (save.level - 1) * 12, crit: 2, speed: 0 };
  for (const item of Object.values(save.equipment)) for (const stat of Object.keys(item.stats)) total[stat] += item.stats[stat] ?? 0;
  return total;
}

/** 전투 지표 — `world.ts`의 실제 피해·공격 간격 식. */
function metrics(save, floor, stats = totalStats(save)) {
  const critFactor = 1 + Math.min(CRIT_CAP, Math.max(0, stats.crit)) / 100 * CRIT_SCALE;
  const speedFactor = 1 + Math.max(0, stats.speed) / 100;
  // `world.ts`: 공격 간격 = 0.48 ÷ (1 + 공속/100) → 초당 공격 = (1 + 공속/100) ÷ 0.48.
  const heroDps = stats.attack * critFactor * speedFactor / ATTACK_INTERVAL;
  const mobHit = enemyHitDamage(floor, false, stats.defense);
  const bossHit = enemyHitDamage(floor, true, stats.defense);
  const ehp = stats.health / mobHit;
  const bossEhp = stats.health / bossHit;
  // 생존력은 보스 기준(EHP)으로 잡는다 — 일반 몹은 방어가 적 피해를 넘으면 1 피해가 되어 지표가 폭발한다.
  const rating = Math.sqrt(heroDps * bossEhp);
  return { ...stats, dps: Math.round(heroDps), ehp: Math.round(ehp), bossEhp: Math.round(bossEhp), mobHit, bossHit, rating: Math.round(rating) };
}

const jobNames = { warrior: '전사', archer: '궁수', mage: '마법사' };
const row = (label, m) => `| ${label} | ${m.attack} | ${m.defense} | ${m.health} | ${Math.round(m.crit)}% | ${Math.round(m.speed)}% | ${m.dps.toLocaleString()} | ${m.ehp.toLocaleString()} | ${m.bossEhp.toLocaleString()} | ${m.rating.toLocaleString()} |`;
const HEAD = '| 직업 | 공격 | 방어 | 체력 | 치명 | 공속 | 평타 DPS | 일반몹 EHP | 보스 EHP | 전투력 |\n|---|---|---|---|---|---|---|---|---|---|';

const out = [];
const json = { floors: {} };
for (const floor of FLOORS) {
  json.floors[floor] = {};
  out.push(`\n### ${floor}층 — 레벨 ${levelFor(floor)} · 영원(전설) 등급 · 최고 티어 한 벌`);
  out.push(HEAD);
  let before = null;
  for (const job of jobs) {
    const top = 9;
    const m = metrics(setFor(job, floor, 'legendary', top), floor);
    json.floors[floor][job] = { new: m };
    out.push(row(jobNames[job], m));
    if (!before) before = metrics(legacySetFor(job, floor, 'legendary', top), floor, legacyTotal(legacySetFor(job, floor, 'legendary', top)));
  }
  out.push(row('*(예전 공식)*', before));

  out.push(`\n#### ${floor}층 — 등급 진행(최고 티어) 전투력`);
  out.push('| 등급 | 전사 | 궁수 | 마법사 | 예전 공식 |\n|---|---|---|---|---|');
  for (const rarity of rarityOrder) {
    const ratings = jobs.map(job => metrics(setFor(job, floor, rarity, 9), floor).rating);
    const legacySave = legacySetFor('warrior', floor, rarity, 9);
    const old = metrics(legacySave, floor, legacyTotal(legacySave)).rating;
    json.floors[floor][`rating-${rarity}`] = { warrior: ratings[0], archer: ratings[1], mage: ratings[2], legacy: old };
    out.push(`| ${rarity} | ${ratings[0].toLocaleString()} | ${ratings[1].toLocaleString()} | ${ratings[2].toLocaleString()} | ${old.toLocaleString()} |`);
  }
}

out.push('\n### 50층 · 영원 등급 — 티어 0~9 진행(주 스탯 = 무기 공격, 방어구 방어)');
out.push('| 티어 | 전사 주스탯 | 궁수 주스탯 | 마법사 주스탯 | 전사 전투력 | 궁수 전투력 | 마법사 전투력 | 티어 계수 |\n|---|---|---|---|---|---|---|---|');
json.tiers = {};
for (let tier = 0; tier <= 9; tier++) {
  const mains = jobs.map(job => totalStats(setFor(job, 50, 'legendary', tier)));
  const ratings = jobs.map(job => metrics(setFor(job, 50, 'legendary', tier), 50).rating);
  // 주 스탯은 무기 한 자루의 주 능력치다(부위 공통 계수 확인용).
  const weaponMain = jobs.map(job => {
    const save = setFor(job, 50, 'legendary', tier);
    const stats = save.equipment.weapon.stats;
    return stats.attack ?? stats.defense ?? 0;
  });
  json.tiers[tier] = { factor: tierFactor('weapon', tier), ratings };
  out.push(`| ${tier} | ${weaponMain[0]} | ${weaponMain[1]} | ${weaponMain[2]} | ${ratings[0].toLocaleString()} | ${ratings[1].toLocaleString()} | ${ratings[2].toLocaleString()} | ${tierFactor('weapon', tier).toFixed(3)}× |`);
}

out.push('\n### 50층 · 영원 등급 — 부위별 기여(전사 기준, 티어 9)');
out.push('| 부위 | 공격 | 방어 | 체력 | 치명 | 공속 |\n|---|---|---|---|---|---|');
for (const slot of slots) {
  const stats = gearStats(slot, 'legendary', 9, 50, slot === 'weapon' ? 'warrior' : 'warrior');
  out.push(`| ${slotNames(slot)} | ${stats.attack ?? 0} | ${stats.defense ?? 0} | ${stats.health ?? 0} | ${stats.crit ?? 0} | ${stats.speed ?? 0} |`);
}
function slotNames(slot) { return { weapon: '무기', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지', ring2: '반지' }[slot]; }

out.push('\n### 직업 정체성 — 50층 · 영원 등급 · 최고 티어의 상대값(전사 = 100)');
out.push('| 지표 | 전사 | 궁수 | 마법사 |\n|---|---|---|---|');
const base = json.floors[50];
for (const [label, key] of [['공격', 'attack'], ['방어', 'defense'], ['체력', 'health'], ['치명', 'crit'], ['공속', 'speed'], ['평타 DPS', 'dps'], ['일반몹 EHP', 'ehp'], ['전투력', 'rating']]) {
  const w = base.warrior.new[key];
  out.push(`| ${label} | 100 | ${Math.round(base.archer.new[key] / w * 100)} | ${Math.round(base.mage.new[key] / w * 100)} |`);
}

const text = out.join('\n');
if (process.argv.includes('--json')) console.log(JSON.stringify(json, null, 2));
else console.log(text);
