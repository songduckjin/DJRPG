/**
 * 스킬 포인트(SP) 회계 — 4단계 스킬 트리(2026-11-22 송덕진 님 확정 스펙, 파트 A).
 *
 * 규칙은 이 파일 **한 곳**이 갖고, 화면(`skillTree.ts`·`ui/modals/skillModal.ts`)과 서버 검증
 * (`server/save-guard.mjs`)이 같은 식을 쓴다 — 두 곳에 적으면 값이 갈린다.
 *
 *   · 캐릭터 레벨당 SP 3 : **Lv.1부터 3pt**, 레벨업마다 +3pt(Lv.30 = 90pt). 새 캐릭터가 첫 스킬을
 *     **Lv.1로 무료 습득**해도 3pt가 비도록 `SP_FIRST_RANK`(1)를 총량에 더한다.
 *   · `스킬의 서`(영구 스킬포인트 북, 사용자 지시 `#23788`)는 레벨과 무관하게 **영구 SP +1**, 최대 30권.
 *   · 모든 스킬 Lv.10까지, **랭크 하나에 SP 1**(습득한 Lv.1도 1pt). 만렙 30 + 책 30권 = 120pt > 110pt(전부 Lv.10).
 *
 * import는 `skills.ts` 하나뿐이다 — 서버(Cloudflare Pages Functions·Node 타입 스트리핑)가 이 모듈을 그대로
 * 읽어야 해서, 확장자 없는 import를 쓰는 `statBooks.ts`를 부르지 않고 스킬의 서 수치를 여기서 직접 센다.
 */
import { MAX_SKILL_LEVEL } from './skills.ts';

/** 레벨 하나당 SP. */
export const SP_PER_LEVEL = 3;
/** 첫 스킬 1랭크(무료 지급)를 상쇄하는 몫. */
export const SP_FIRST_RANK = 1;
/** 랭크 상한 — 스킬 최대 레벨과 같은 값이어야 한다. */
export const SP_MAX_RANK = MAX_SKILL_LEVEL;
/** `스킬의 서` 한 권이 주는 SP. */
export const SP_BOOK_PER = 1;
/** `스킬의 서` 캐릭터당 사용 상한 — 다른 영구 스탯북 3종(30권)과 같다. */
export const SP_BOOK_LIMIT = 30;

/** SP와 랭크만 읽는 최소 모양 — 세이브 전체(`Save`)를 요구하지 않아 서버에서도 쓸 수 있다. */
export type SpSave = {
  level?: number;
  learned?: readonly string[];
  passives?: readonly string[];
  skillLevels?: Record<string, number | undefined>;
  /** 영구 스탯북 사용 권수 — 이 중 `skill`(스킬의 서)만 SP에 더한다. */
  statBooks?: { skill?: number } & Record<string, unknown>;
};

/** 세이브에 남은 `스킬의 서` 사용 권수(0~30). 값이 없거나 깨진 옛 세이브는 0부터 센다. */
export function spBookCount(save: SpSave | undefined): number {
  const raw = Number(save?.statBooks?.skill);
  return Number.isFinite(raw) ? Math.max(0, Math.min(SP_BOOK_LIMIT, Math.floor(raw))) : 0;
}

/** `스킬의 서`로 늘어난 SP 총량(권수 × 1). */
export function spBookBonus(save: SpSave | undefined): number {
  return spBookCount(save) * SP_BOOK_PER;
}

/** 그 레벨에서 지금까지 받은 SP 총량(쓴 것은 빼지 않는다) — 레벨 몫. */
export function spTotal(level: number): number {
  const lv = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return lv * SP_PER_LEVEL + SP_FIRST_RANK;
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

/** 세이브 한 벌의 SP 장부 — 총량(레벨 몫 + 스킬의 서)·사용·가용. */
export function spLedger(save: SpSave): SpLedger {
  const total = spTotal(save.level ?? 1) + spBookBonus(save), spent = spSpent(save);
  return { total, spent, available: Math.max(0, total - spent) };
}
