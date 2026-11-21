/**
 * `Interface`가 나눠 쓰는 타입들 (PR-4 구조 분리) — 팝업 이름과 화면 보기 상태의 이름표만 모아 둔다.
 *
 * 여기에는 **값이 없다**. 팝업마다 무엇을 그리는지는 `modalRegistry.ts`의 `MODALS` 표가, 공통 창틀은
 * `modalChrome.ts`가, 입력 배선은 `interfaceControls.ts`가 맡는다. 이 파일은 그 셋과 `Interface`가
 * 같은 이름을 쓰게 하는 자리다.
 */

/** 게임에서 열리는 팝업 전부 — `Interface.open()`이 받는 이름이자 `MODALS` 표의 키다. */
export type Modal =
  | 'dungeon'
  | 'worldBoss'
  | 'equipment'
  | 'skills'
  | 'account'
  | 'floor'
  | 'offline'
  | 'market'
  | 'salvage'
  | 'codex'
  | 'characters'
  | 'createCharacter'
  | 'warehouse'
  | 'settings'
  | 'mail'
  | 'rewards'
  | 'achievements'
  | 'shop';

/** 가방 필터(작업 136) — `내 정보` 창의 `장비 전체/무기/방어구/장신구` 탭. */
export type BagFilter = 'all' | 'weapon' | 'armor' | 'accessory';

/** 스킬 창 탭(작업 240) — `전체`는 패시브 3종을 스킬북·기본기보다 위에 두고 모두 보여 준다. */
export type SkillFilter = 'all' | 'active' | 'passive';
