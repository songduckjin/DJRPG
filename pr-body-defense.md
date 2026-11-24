## [머지·배포 보류] 무한 방어전 — 능동 교전 최종안 구현

던전 모달의 첫 화면을 **던전 허브**로 확장하고, 신규 모드 **무한 방어전**을 양측 최종 확정 사양대로 구현했습니다.
**이 PR은 머지·운영 배포하지 않습니다** — 운영 반영은 송덕진 님 측과 조율한 뒤 진행합니다(사용자 지시: 모아서 배포).

- 설계·시안: `downloads/djrpg_defense_dungeon/design.md`, `01_lobby.png` · `02_battle_active.png` · `03_ranking.png`
- 매뉴얼: `docs/DEFENSE.md` (신규)

### 양측 최종 확정 사양 반영

| # | 사양 | 구현 |
|---|---|---|
| 1 | 모드 이름 **무한 방어전** | 허브 카드·로비 제목·aria·패치 문구 |
| 2 | 진입 UI = **던전 허브**(기존 던전 모달 첫 화면) 2카드 | `renderDungeonHub` — `끝없는 던전` / `무한 방어전`. 기존 끝없는 던전 화면·동작·검증 경로는 **그대로**(카드로 들어가고 `‹ 던전`으로 허브 복귀) |
| 3 | **성벽 제거** + 능동 이동/교전 + HP 0 종료(30분 상한) | 성벽 오브젝트·`방어선` HP 막대 없음. 캐릭터는 하단(69%)에서 출발해 위에서 내려오는 가장 가까운 적에게 **위·대각선으로 직접 걸어가** 사거리 안에서 자동 평타·스킬. 적은 화면 2%에서 곧게 내려와 53% 방어선에서 멈춘다. 판은 캐릭터 HP 0(또는 1,800초)에서 종료 |
| 4 | 3웨이브 = 1스테이지, 5스테이지마다 보스, 무한 | `defenseWaveSizes` — 보스 스테이지 1웨이브 = 보스 1 + 미니언 4, 3웨이브 마지막은 정예(체력 ×2). 스테이지 상한 999는 표시·검증용 |
| 5 | 실패 시 보상 유지 | `claimDefenseRewards` — 사망·시간 종료 모두 그때까지의 금화·경험치·아이템 지급 |
| 6 | 필드 드랍 함수 **직접 참조** | `itemDropChance()` · `rollItem()` · `rollStatBookDrop('hunt')` 호출만. 드랍률 상수 복사 0건 → PR #347(÷10) 자동 반영. 테스트가 소스에서 직접 검사 |
| 7 | 보상 상한 = `min(20, 1+⌊(s-1)/2⌋)` | 서버 `rewardBudget`/`MAX_FLOOR=20` 계약 **무변경**, 39스테이지 이후 20층 값 포화. 랭킹 스테이지만 상승 |
| 8 | D1 테이블·마이그레이션·API·3단계 방어 | `djrpg_defense_records`·`djrpg_defense_attempts`(등록부·기본 스키마·이관·탈퇴·시즌 등록), `POST /api/defense`(list/start/submit), 게스트 제외·상위 10명+내 순위·동점은 먼저 도달자. 검증: ① 물리적 최소 시간(스폰 하한×0.75, 체력 합/최대 DPS 천장×0.9) ② 요약 형식·스텝/시간·처치 범위·체력·digest ③ 2분(7,200스텝) 이하 판은 같은 시드 고정 스텝 리플레이(스테이지 ±1·처치 ±12%). 세이브 `defenseStage`는 **검증 기록 +1**까지만 저장 |

### 주요 파일

- 신규: `src/game/dungeon/defenseBattle.ts`(DOM-free 전투·고정 스텝), `src/game/defenseProgress.ts`, `src/game/defenseLive.ts`, `src/ui/defenseField.ts`, `src/ui/defenseLobby.ts`, `src/ui/modals/defenseLobby.ts`, `src/styles/defense.css`, `server/defense.mjs`, `server/defense-schema.mjs`, `server/defense-verify.mjs`, `server/endpoints/defense.mjs`, `functions/api/defense.js`
- 수정: `src/game/store.ts`(Save 2필드·parseSave·freshSave), `src/game/combat/engine.ts`(캐릭터 경계 훅 `clampHeroPoint` — 기본 동작 불변), `src/ui/{interface,modalRegistry,dungeonLobby,modals/dungeonModal}.ts`, `src/main.ts`, `server/{tables,save-guard,save-seed}.mjs`, `server/db/{schema,save,accounts}.mjs`, `server/market.mjs`
- 테스트: `tests/defense-battle|defense-verify|defense-save-cap|defense-ranking.test.mjs`(신규) + `table-registry`·`architecture-boundaries`·`account-delete`·`combat-field-split` 정책 목록 보정(새 표 2개·서버 클로저 1파일)
- 문서: `docs/DEFENSE.md`(신규)·`docs/DUNGEON.md`(별도 모드 한 줄)·`docs/CODE_MAP.md`·`docs/TASK.md`

### 검증

- `npx tsc --noEmit` ✅ / `npx vite build` ✅ (`index-*.js` 894.30kB)
- 신규 테스트: `defense-battle` 9/9 · `defense-verify` 6/6 · `defense-save-cap` 5/5 · `defense-ranking` 3/3
- 전체 `node --test tests/*.test.mjs` **1,599건**: 실패는 전부 `origin/main` 기준선과 **같은 이름**입니다
  (이 체크아웃에 `public/assets/**`·`public/*.json`이 없어 생기는 기존 실패). 청크별 실패 이름 차집합 **신규 실패 0**
  (chunk1~8을 `origin/main` 트리와 대조). `upgrade-badge`의 `강화(+)·등급도 itemPower로…`는 기준선에서도
  200회 중 24~26회 실패하는 **기존 플레이크**로 확인했습니다.
- 서버 검증 실측: 1레벨 세이브의 실제 판(2스테이지·5,2xx스텝)을 `start` 시드로 리플레이해 `verified=true`,
  `digestMatch=true`, `stepDelta=0`. 30스테이지·1초 주장은 `DEFENSE_TOO_FAST`(required 19,141초)로 거부,
  거부된 판은 순위 표에 남지 않음.

### 프리뷰 실화면 (390×844)

- 프리뷰: https://feat-infinite-defense-dungeo.djrpg.pages.dev (`version.json` `33bd56f06a43`, Cloudflare Pages pass)
- 허브: `downloads/djrpg_defense_dungeon/preview-lobby.png`
- 로비: `downloads/djrpg_defense_dungeon/preview-defense-lobby.png`
- 전투(성벽 없음·캐릭터 이동 교전): `downloads/djrpg_defense_dungeon/preview-battle.png` · `preview-battle-active.png`
- 랭킹(실제 검증 제출 1건): `downloads/djrpg_defense_dungeon/preview-ranking.png`
- 실측·확인 항목은 PR 검수 댓글에 정리했습니다.

> ⚠️ **머지·배포 보류**: 이 PR은 리뷰·프리뷰 검수까지만입니다. 운영 반영(점검 ON → 배포 → 정상화 확인 → 점검 OFF)은
> 송덕진 님 측 확인 뒤 별도로 진행합니다. `PR #347`(드랍률 ÷10)과 같은 배포에 묶을지도 그때 정합니다.
