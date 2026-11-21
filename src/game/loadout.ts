import type { Save } from './store';
import { jobOrDefault, skillDamageScale, skillOrderFor, skills, type Job, type SkillId } from './skills';
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
  if (!save.learned.includes(id)) return { ok: false, message: '먼저 스킬북으로 습득해야 합니다.' };
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
 * 순위 점수는 그 직업 표의 앞자리부터 10·9·8…이고, 여기에 **실제 전투와 같은 스킬 레벨 피해 배율**
 * (`skillDamageScale` = 1 + (레벨-1)×10%)을 곱한다. 그래서 오래 강화한 아래 순위 스킬이 1레벨 상위 스킬을
 * 앞지를 수 있다(레벨 21이면 3.0배). 같은 점수면 표 순서를 지킨다.
 */
export function recommendedSkillOrder(save: Save): SkillId[] {
  const job = jobOrDefault(save.job);
  const table = recommendedLoadouts[job];
  const own = skillOrderFor(job);
  const learned = new Set(save.learned.filter(id => own.includes(id)));
  const ranked = table.attacks
    .map((id, rank) => ({ id, rank }))
    .filter(entry => learned.has(entry.id))
    .map(entry => ({ id: entry.id, rank: entry.rank, score: (10 - entry.rank) * skillDamageScale(savedSkillLevel(save, entry.id)) }))
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map(entry => entry.id);
  return learned.has(table.buff) ? [table.buff, ...ranked] : ranked;
}

export type AutoLoadoutResult = { changed: boolean; equipped: SkillId[]; message: string };

/**
 * `추천 자동 장착`(작업 240) — 보유한 액티브 스킬로 3칸을 추천 조합으로 다시 채운다.
 *
 * 3개 미만이면 보유한 만큼만 앞 칸부터 채우고 남은 칸은 `null`, 하나도 없으면 세이브를 건드리지 않고
 * 안내만 돌려준다. 이미 같은 조합(같은 순서)이면 `changed: false`.
 */
export function autoEquipRecommendedSkills(save: Save): AutoLoadoutResult {
  const order = recommendedSkillOrder(save).slice(0, 3);
  if (!order.length) return { changed: false, equipped: [], message: '보유한 액티브 스킬이 없습니다. 스킬북으로 스킬을 습득하면 추천 장착을 쓸 수 있습니다.' };
  const before = save.quickSlots.join(',');
  save.quickSlots = [order[0] ?? null, order[1] ?? null, order[2] ?? null];
  const changed = save.quickSlots.join(',') !== before;
  const names = order.map(id => skills[id].name).join(' · ');
  const filled = order.length < 3 ? ` — 보유한 ${order.length}개만 채우고 남은 칸은 비웁니다` : '';
  return {
    changed,
    equipped: order,
    message: changed ? `추천 조합으로 장착했습니다: ${names}${filled}` : `이미 추천 조합이 장착되어 있습니다: ${names}${filled}`
  };
}
