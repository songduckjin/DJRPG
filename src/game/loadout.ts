import type { Save } from './store';
import { jobOrDefault, skillDamageScale, skillDuration, skillOrderFor, skills, type Job, type SkillId } from './skills';
export type QuickSlots = [SkillId | null, SkillId | null, SkillId | null];
export function normalizeQuickSlots(raw: unknown, learned: SkillId[], job: Job = 'warrior'): QuickSlots {
  const slots: QuickSlots = [null, null, null], used = new Set<SkillId>(), order = skillOrderFor(job);
  if (Array.isArray(raw)) for (let index = 0; index < 3; index++) {
    const id = raw[index];
    if (order.includes(id) && learned.includes(id) && !used.has(id)) { slots[index] = id; used.add(id); }
  }
  return slots;
}
export function availableSkills(save: Save): SkillId[] { return skillOrderFor(jobOrDefault(save.job)).filter(id => save.learned.includes(id) && !save.quickSlots.includes(id)); }
export function equipSkill(save: Save, id: SkillId, slot: number): { ok: boolean; message: string } {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, message: '장착할 스킬 원을 선택하세요.' };
  if (!save.learned.includes(id)) return { ok: false, message: '먼저 스킬 트리에서 SP를 투자해 습득해야 합니다.' };
  if (save.quickSlots.includes(id)) return { ok: false, message: '이미 장착된 스킬입니다.' };
  save.quickSlots[slot] = id;
  return { ok: true, message: '스킬을 장착했습니다.' };
}
export function unequipSkill(save: Save, id: SkillId): { ok: boolean; message: string } {
  const slot = save.quickSlots.indexOf(id);
  if (slot < 0) return { ok: false, message: '장착되지 않은 스킬입니다.' };
  save.quickSlots[slot] = null;
  return { ok: true, message: `${slot + 1}번 스킬 원에서 해제했습니다.` };
}

/**
 * 직업별 추천 장착 우선순위(작업 240).
 *
 * 앞자리일수록 그 직업에서 효율이 좋은 스킬이다 — 광폭 버프 1개를 1번 원에 고정하고, 나머지 두 원은
 * 고위력·광역·연타 공격 스킬로 채운다. 목록에 없는 스킬(다른 직업)은 추천 대상이 아니다.
 */
export const recommendedLoadouts: Record<Job, { buff: SkillId; attacks: SkillId[] }> = {
  // 전사: 블러드 레이지(공격·공속·이속) + 회전참격(360° 광역) + 파워 스트라이크(최고 위력 단일)
  warrior: { buff: 'warcry', attacks: ['hell', 'power', 'destroy', 'crushing', 'spin', 'slam', 'slash2'] },
  // 궁수: 호크아이 + 폭풍 연사(6발 연타) + 애로우 레인(광역 화살비)
  archer: { buff: 'hawkEye', attacks: ['stormVolley', 'arrowRain', 'snipe', 'pierceShot', 'multiShot', 'iceArrow', 'doubleShot'] },
  // 마법사: 아케인 실드 + 아르카나 오버로드(주변 비전 폭풍) + 메테오 스트라이크(최고 위력)
  mage: { buff: 'arcaneShield', attacks: ['arcaneOverlord', 'meteorStrike', 'manaBurst', 'chainLightning', 'fireBolt', 'iceBolt', 'frostNova'] }
};

/** 세이브의 스킬 레벨(1~30). `store.ts`를 런타임으로 부르지 않으려고 같은 정규화만 여기서 한다(store가 이 모듈을 import한다). */
function savedSkillLevel(save: Save, id: SkillId): number {
  const raw = save.skillLevels[id];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
}

/**
 * 보유한 액티브 스킬만 추천 순서로 늘어놓는다(최대 3칸) — 습득하지 않은 스킬과 다른 직업 스킬은 절대 들어가지 않는다.
 *
 * 순위는 **실제 초당 딜량**이다(작업 245) — 한 번 시전의 총 계수(`skillCastScale`)에 전투와 같은 스킬 레벨
 * 위력 배율(`skillDamageScale` = 1 + (레벨-1)×10%)을 곱하고 쿨타임으로 나눈다. 그래서 같은 스킬이라도
 * 오래 강화한 쪽이 위로 올라온다(예: 위력 +70% Lv.8 `iceBolt` 1.7×1.7/7 = 0.413 > 위력 +30% Lv.4
 * `manaBurst` 2.5×1.3/10 = 0.325). 동점일 때만 직업별 표(`recommendedLoadouts`)의 순서를 쓴다.
 * 1번 원은 직업 버프를 고정하고, 2·3번 원이 이 DPS 순서를 받는다.
 */
export function recommendedSkillOrder(save: Save): SkillId[] {
  const job = jobOrDefault(save.job);
  const table = recommendedLoadouts[job];
  const own = skillOrderFor(job);
  const learned = new Set(save.learned.filter(id => own.includes(id)));
  const ranked = table.attacks
    .map((id, rank) => ({ id, rank }))
    .filter(entry => learned.has(entry.id))
    .map(entry => ({ id: entry.id, rank: entry.rank, dps: skillDps(save, entry.id) }))
    .sort((a, b) => b.dps - a.dps || a.rank - b.rank)
    .map(entry => entry.id);
  return learned.has(table.buff) ? [table.buff, ...ranked] : ranked;
}
/**
 * 한 번 시전의 총 계수(기본 배율 × 타수) — `world.ts`의 판정 계수 그대로다(작업 245).
 *
 * 지속 시간 동안 되풀이되는 타격(`hell`·`spin`·`arrowRain`)과 두 번 들어가는 일격(`slash2`·`slam`)은
 * `skillDuration`·타격 간격으로 타수를 세어 더한다. 여러 적을 맞히는 스킬이라도 계수는 **한 대상** 기준이다.
 * `fireBolt`는 여러 발로 나뉘어도 합계가 ×2.0 그대로라 나누지 않는다(작업 216).
 */
export function skillCastScale(id: SkillId, level = 1): number {
  const lv = Math.max(1, Math.floor(level));
  const duration = skillDuration(id, lv);
  // 다음 타격 시각부터 일정 간격으로 지속 시간 전까지 때리는 스킬의 타수.
  const repeats = (first: number, step: number) => (duration > first ? Math.floor((duration - first) / step) + 1 : 0);
  switch (id) {
    case 'slash2': return 1.1 * 2;                          // 정방향·되받아 2연격
    case 'slam': return 2.2 + (duration > .45 ? .55 : 0);   // 발동 + 0.45초 뒤 추가 타
    case 'power': return 4;
    case 'destroy': return 2.7;
    case 'hell': return 3.2 + .6 * repeats(.4, .4);         // 360° 회전 베기 + 되풀이 타격
    case 'crushing': return 3.4;                            // 10연타 합계
    case 'spin': return 1.65 + .65 * repeats(.45, .45);
    case 'warcry': return 0;                                // 버프 — 공격 계수 없음
    case 'doubleShot': return 1.35 * 2;
    case 'multiShot': return .95 * 5;
    case 'pierceShot': return 2.6;
    case 'iceArrow': return 1.9;
    case 'hawkEye': return 0;
    case 'snipe': return 4.3;
    case 'stormVolley': return .8 * 6;
    case 'arrowRain': return .85 * repeats(.12, .4);
    case 'fireBolt': return 2;                              // 여러 발 합계 ×2.0
    case 'iceBolt': return 1.7;
    case 'chainLightning': return 1.25;
    case 'manaBurst': return 2.5;
    case 'frostNova': return 1.5;
    case 'arcaneShield': return 0;
    case 'meteorStrike': return 3.6;
    case 'arcaneOverlord': return 3;
    default: return 0;
  }
}
/** 초당 딜량 — 시전 계수 × 스킬 레벨 위력 배율 ÷ 쿨타임(버프는 0). */
export function skillDps(save: Save, id: SkillId): number {
  const level = savedSkillLevel(save, id);
  return skillCastScale(id, level) * skillDamageScale(level) / Math.max(1, skills[id].cooldown);
}

export type AutoLoadoutResult = { changed: boolean; equipped: SkillId[]; message: string };

/**
 * `추천 자동 장착`(작업 240 · 4단계 스킬 트리 A안) — 습득한 액티브의 초당 피해 상위 3개를 퀵슬롯에 채운다.
 * **이미 꽂힌 추천 스킬은 그 원 그대로 두고**(손으로 맞춘 자리를 흔들지 않는다), 남은 추천은
 * **빈 원 → 추천 밖 스킬이 있는 원** 순서로 넣는다. 토스트에는 바꿔 낀 원만 요약한다(`2번 원 → 블러드 레이지`).
 * 습득이 없거나 추천 조합이 이미 다 꽂혀 있으면(순서가 달라도) 세이브를 건드리지 않고 `changed: false`.
 */
export function autoEquipRecommendedSkills(save: Save): AutoLoadoutResult {
  const order = recommendedSkillOrder(save).slice(0, 3);
  if (!order.length) return { changed: false, equipped: [], message: '습득한 액티브 스킬이 없습니다. 스킬 트리에서 SP를 투자해 습득하면 추천 장착을 쓸 수 있습니다.' };
  const before: QuickSlots = [...save.quickSlots], recommended = new Set(order), next: QuickSlots = [null, null, null];
  for (let slot = 0; slot < 3; slot++) { const id = before[slot]; if (id && recommended.has(id) && !next.includes(id)) next[slot] = id; }
  const held = (slot: number) => before[slot] !== null;
  const targets = [0, 1, 2].filter(slot => !held(slot)).concat([0, 1, 2].filter(slot => held(slot) && !recommended.has(before[slot]!)));
  const changes: string[] = [];
  order.filter(id => !next.includes(id)).forEach((id, index) => {
    const slot = targets[index];
    if (slot === undefined) return;
    next[slot] = id;
    if (held(slot)) changes.push(`${slot + 1}번 원 → ${skills[id].name}`);
  });
  save.quickSlots = next;
  const changed = next.some((id, slot) => id !== before[slot]);
  if (!changed) return { changed, equipped: order, message: `이미 추천 조합이 장착되어 있습니다: ${order.map(id => skills[id].name).join(' · ')}` };
  const filled = next.filter(id => id !== null).length, spare = filled < 3 ? ` · 남은 ${3 - filled}개 원은 비웁니다` : '';
  return { changed, equipped: next.filter((id): id is SkillId => id !== null), message: [`추천 조합 ${filled}개 장착 완료`, ...changes].join(' · ') + spare };
}
