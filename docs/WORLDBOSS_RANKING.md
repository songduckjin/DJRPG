# WORLDBOSS_RANKING — 월드 보스 · 랭킹 · 전광판 · 백그라운드 폴링

> **책임**: 월드 보스(공유 HP·1일 3회·서버 재현 전투·순위·우편 보상), 던전/필드 랭킹 표시, 레전드 전광판, 그리고 이 화면들이 쓰는 **백그라운드 폴링 주기**.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 클라이언트 상태·폴링 | `src/game/worldBossLive.ts` (대기 20초 주기, 전투 중 `tick` 2초) |
| 전투 재현·패턴 | `src/game/worldBossRehearsal.ts`·`src/game/worldBossPattern.ts` |
| 화면 | `src/ui/worldBossField.ts`·`src/ui/modals/worldBossModal.ts`·`src/ui/worldBossResult.ts`·`src/ui/worldBossPresentation.ts`·`src/ui/worldBossIntro.ts`·`src/ui/worldBossImpact.ts`·`src/ui/worldBossWeather.ts`·`src/ui/worldBossFooting.ts`·`src/ui/worldBossDefeat.ts` |
| 서버 | `server/world-boss.mjs`·`server/endpoints/world-boss.mjs`·`server/world-boss-schema.mjs`·`functions/api/world-boss.js` |
| 전광판 | `src/game/legendBoard.ts`·`src/ui/legendBar.ts`(30초)·`server/announcements.mjs`·`server/endpoints/market.mjs`(`announcements`) |
| 던전 순위 | `src/game/dungeonLive.ts`(탭 열 때 10초 캐시) — `docs/DUNGEON.md` |

## 불변 규칙

- **공유 HP 1,000만**, KST 05:00 초기화. 계정당 **1일 3회** 도전(`WORLD_BOSS_DAILY_ATTEMPTS` 3), 3회 중 **최고 서버 인정 피해**로 순위·정산한다(합산 아님).
- **서버가 다시 싸운다**: 클라이언트가 보낸 피해를 믿지 않고 고정 장비·회피 서버 시각으로 `replayBoss`를 돌린다. `dodge` 입력도 서버 시간으로 검증한다.
- **보상**: 순위 금화+보물 주머니, 공동 1위 1,500+주머니 1, 마지막 타격 2,000, 참여 보상 1,000G. 모두 **우편 멱등 지급** — 지급 규칙은 `docs/QUEST_ATTENDANCE.md`의 우편 경로를 쓴다.
- **읽기 경로**: `list`는 `quickList`로 읽고, 오늘 row가 있고 정산할 것이 없으면 쓰기 트랜잭션 없이 답한다. 읽기 경로 실패는 503이 아니라 쓰기 트랜잭션으로 폴백하되 인증·세션 오류는 그대로 올린다.
- **게스트**: 연습만. 서버 기록·순위·보상 없음.
- **전광판**: 최근 5분·최대 20줄, 같은 계정 5초 중복 1줄. 줄은 5.5초 보여 주고 화면 대기열 5개 상한.

## 폴링 예산 (Cloudflare 무료 10만 요청/일)

| 무엇 | 현재 주기 | 지침 |
|---|---|---|
| 월드보스 대기 상태 | **40초** (`WORLD_BOSS_REFRESH_MS`), 숨은 탭 정지·복귀/`online` 시 즉시 1회 | 20초에서 40초로 줄였다(작업 245 폴링 절감) |
| 월드보스 전투 `tick` | **2초**(전투 중에만) | 전투 밖에서는 보내지 않는다 |
| 레전드 전광판 | **60초** (`LEGEND_POLL_MS`), 숨은 탭 정지·복귀 1회 | 30초에서 60초로 줄였다 |
| 여정(우편·일일) 요약 | **300초**(탭이 보일 때만) | 120초에서 300초로 줄였다. 수령·거래 응답이 최신 journey를 실어 온다 |
| 유지보수 확인 | **20초**(로그인·사냥 중) | 그대로 |
| 저장 | 10초 점검 + 변경이 있을 때만(`flushIfDirty`) | 변경 없으면 요청 0 — 지킨다 |
| 던전 순위 | 탭 열 때 1회·10초 캐시 | 자동 새로고침 추가 금지 |

- 새 폴링을 넣기 전에 이 표에 주기를 적고, **숨은 탭 정지**와 **같은 응답 재사용(캐시)**을 함께 넣는다.
- 폴링 주기를 줄이는 변경은 게임 체감(보스 HP·순위 갱신)에 영향이 없을 때만 한다.

## 금지

- 클라이언트 피해 합산으로 순위 정하기.
- 폴링을 `setInterval`만으로 두고 `visibilitychange` 정지를 빼기.
- 유료 플랜 전제 기능(예약 실행·장기 로그) 추가.

## 테스트

`node --test tests/world-boss-live.test.mjs tests/world-boss-field.test.mjs tests/world-boss-preview.test.mjs tests/legend-board.test.mjs tests/dungeon-ranking.test.mjs`

## 관련 매뉴얼

`docs/DUNGEON.md` · `docs/QUEST_ATTENDANCE.md` · `docs/MAIL_WAREHOUSE.md` · `docs/SYNC_SAVE.md`
