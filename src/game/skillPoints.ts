/**
 * 스킬 포인트(SP) 회계 — 4단계 스킬 트리(2026-11-22 송덕진 님 확정 스펙, 파트 A).
 *
 * 규칙은 이 파일 **한 곳**이 갖고, 화면(`skillTree.ts`·`ui/modals/skillModal.ts`)과 서버 검증
 * (`server/save-guard.mjs`)이 같은 식을 쓴다 — 두 곳에 적으면 값이 갈린다.
 *
 *   · 캐릭터 레벨당 SP 3 : Lv.1은 0pt, 레벨업마다 +3pt.
 *   · 새 캐릭터는 그 직업의 첫 액티브 스킬을 **Lv.1로 무료 습득**한 채 시작한다(`store.ts` `freshSave`).
 *     그 무료 1랭크를 상쇄하려고 `SP_FIRST_RANK`(1)를 총량에 더한다 — 그래서 Lv.1의 가용 SP는 0이다.
 *   · 모든 스킬 Lv.10까지, **랭크 하나에 SP 1**(습득한 Lv.1도 1pt).
 *   · 만렙 30: 29 × 3 + 1 = 88pt. 11종을 모두 Lv.10(110pt)으로 올릴 수 없어 빌드를 골라야 한다.
 *
 * import는 `skills.ts` 하나뿐이다(그 파일도 순수하다) — Cloudflare Pages Functions가 이 모듈을
 * 그대로 번들에 넣을 수 있어야 하기 때문이다.
 */
import { MAX_SKILL_LEVEL } from './skills.ts';

/** 레벨 하나당 SP. */
export const SP_PER_LEVEL = 3;
/** 첫 스킬 1랭크(무료 지급)를 상쇄하는 몫. */
export const SP_FIRST_RANK = 1;
/** 랭크 상한 — 스킬 최대 레벨과 같은 값이어야 한다. */
export const SP_MAX_RANK = MAX_SKILL_LEVEL;

/** SP와 랭크만 읽는 최소 모양 — 세이브 전체(`Save`)를 요구하지 않아 서버에서도 쓸 수 있다. */
export type SpSave = {
  level?: number;
  learned?: readonly string[];
  passives?: readonly string[];
  skillLevels?: Record<string, number | undefined>;
};

/** 그 레벨에서 지금까지 받은 SP 총량(쓴 것은 빼지 않는다). */
export function spTotal(level: number): number {
  const lv = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return (lv - 1) * SP_PER_LEVEL + SP_FIRST_RANK;
}

/** 습득한 스킬의 랭크 합 — 랭크 하나가 SP 하나다(미습득은 0, 1~10 밖의 값은 위아래로 자른다). */
export function spSpent(save: SpSave): number {
  const levels = save.skillLevels ?? {};
  const ids = new Set([...(save.learned ?? []), ...(save.passives ?? [])]);
  let spent = 0;
  for (const id of ids) {
    const raw = levels[id];
    const rank = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1;
    spent += Math.max(1, Math.min(SP_MAX_RANK, rank));
  }
  return spent;
}

export type SpLedger = { total: number; spent: number; available: number };

/** 세이브 한 벌의 SP 장부 — 총량·사용·가용. */
export function spLedger(save: SpSave): SpLedger {
  const total = spTotal(save.level ?? 1), spent = spSpent(save);
  return { total, spent, available: Math.max(0, total - spent) };
}
