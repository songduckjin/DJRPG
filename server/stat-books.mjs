// 영구 스탯북 3종의 **서버 쪽 단일 목록** (파트 B, 2026-11-22).
//
// Cloudflare Pages Functions는 `server/*.mjs`를 그대로 실행하므로 `src/game/statBooks.ts`(TypeScript)를
// 실행 시 import할 수 없다. 그래서 같은 값을 여기 한 번만 적고, 클라이언트의 `STAT_BOOKS`와
// **키·이름·상승량·상한이 모두 같은지**를 `tests/statbook-server.test.mjs`가 검사한다.
// 책을 더하거나 수치를 바꾸면 `src/game/statBooks.ts`와 이 파일을 함께 고친다.
//
// 스킬북(33종)은 파트 B에서 **전면 폐지**되어 이 파일에서도 사라졌다 — 서버는 더 이상 어떤 스킬북
// `skillId`도 저장·지급하지 않는다(`server/skill-ids.mjs` 삭제).

/** 종류별 정의 — 클라이언트 `STAT_BOOKS` 사본. `stat`은 클라이언트 `Stat` 이름과 같다. */
export const STAT_BOOKS = {
  attack: { name: '공격의 서', stat: 'attack', perBook: 5, max: 30 },
  defense: { name: '방어의 서', stat: 'defense', perBook: 3, max: 30 },
  health: { name: '체력의 서', stat: 'health', perBook: 30, max: 30 }
};
export const STAT_BOOK_IDS = Object.keys(STAT_BOOKS);
export const STAT_BOOK_ID_SET = new Set(STAT_BOOK_IDS);

/** 이 값이 스탯북 종류인가. */
export function isStatBookKind(value) { return typeof value === 'string' && STAT_BOOK_ID_SET.has(value); }

/** 저장된 아이템이 그 종류의 이름과 맞는 스탯북인가 — `itemValid`의 검사. */
export function statBookValid(item) {
  return Boolean(item) && item.kind === 'statbook' && item.slot === 'statbook' && isStatBookKind(item.book);
}

/**
 * 가방 40칸에 세는 아이템인가 (파트 B).
 *
 * **장비·영구 스탯북·보물 주머니 모두 1개 = 1칸**이다. 스킬북이 폐지되면서 \"내 직업 책은 칸을 쓰지
 * 않는다\"(작업 253)는 예외도 사라졌다. 클라이언트 `src/game/bagCapacity.ts`의 `countedInBag`과 같은 규칙이다.
 */
export function countedInBag(item) {
  return Boolean(item) && typeof item === 'object';
}
