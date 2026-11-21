# QUEST_ATTENDANCE — 여정 · 데일리 퀘스트 · 업적 · (향후) 출석·이벤트 보상

> **책임**: 우편함 안의 일일/주간 퀘스트, 업적(마일스톤), 수령 처리와 기간 경계. 우편 자체의 보관·수령 UI는 `docs/MAIL_WAREHOUSE.md`. 지급되는 보상 아이템 규칙은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 기간·퀘스트·업적 정의, 보상 지급 | `server/journey-state.mjs` (`periods`·`advanceJourney`·`dailyTasks`·`weeklyTasks`·`milestones`·`achievementReward`·`completionRewards`) |
| 수령/읽음/삭제·원자 저장 | `server/journey.mjs`(`snapshot`·`mutate`)·`server/endpoints/market.mjs`(`journey-list`·`journey-*`) |
| 클라이언트 | `src/game/journey.ts`(`Journey.load`·`act`)·`src/ui/modals/utilityModal.ts`(우편·보상·업적 탭) |
| 계측 훅 | `server/journey.mjs`(`recordJourneyMetric`) — 처치·던전·거래·월드보스 |
| 경계 계산 | `server/journey-state.mjs` `periods()` — **KST 05:00을 하루 시작**으로 UTC를 밀어 주간은 월요일 리셋 |

## 불변 규칙

- **기간**: 일일 = KST 05:00 리셋, 주간 = 월요일 05:00 KST. 기간 키가 바뀌면 진행도만 새로 시작하고 **미수령 보상은 우편에 남는다**(만료 전까지).
- **수령은 한 번**: 수령 기록은 `djrpg_journey` 상태에 남기고 `mutate`는 원자 저장(수령 기록 + 세이브 지급). 같은 요청을 다시 보내면 `409 NOT_AVAILABLE`.
- **보상 형태**: 금화·스킬북·보물 주머니. 업적은 금화 사다리 + 후반 보물 주머니(스킬북 0). 일일/주간 완료 보상은 보물 주머니.
- **가방 40칸**: `journey-claim`이 가방 초과면 `BAG_FULL`로 막는다. 지급 전에 개수를 확인하고, 실패 시 수령 기록을 남기지 않는다.
- **업적 마일스톤**: 처치 `[1000,5000,15000,30000,60000,120000,250000]`, 거래 `1·5·15·30·50·100회`, 도감 810칸, 스킬 강화 합. 수치는 `journey-state.mjs` 한 곳.
- **계정당 1회 공지 우편**: `state.notices`에 지급 이력을 남겨 수령·삭제·만료 뒤에도 다시 붙지 않게 한다. 만료 시각을 넘겨 처음 접속한 계정에는 지급하지 않는다.
- **미리보기 전용 지급 금지**: 운영 호스트(`djrpg.pages.dev`)에는 테스트 우편·테스트 보상을 넣지 않는다(작업 252에서 제거됨).
- **재조회 금지**: 보상 수령 뒤 `journey.load()`를 다시 부르지 않는다 — 응답에 최신 `journey`가 실려 온다.

## (설계 자리) 주간·월간 출석 · 이벤트 보상

- **자리**: `server/journey-state.mjs` `periods()`에 `monthly`(매월 1일 05:00 KST) 키를 더하고, `journeyView`에 `attendance` 블록(`days`·`claimed`·`streak`)을 추가한다. 화면은 `src/ui/modals/utilityModal.ts`의 보상 탭에 `출석` 하위 탭으로 들어간다.
- **보상 지급 규칙**: 출석 보상은 **서버가 지급을 소유**한다 — `journey-state.mjs`의 지급 함수가 `state.attendance.claimed`에 날짜 키를 적고, 가방이 차면 `BAG_FULL`로 막는 대신 **우편(`djrpg_journey` mail)으로 보내** 다음 접속에 받게 한다. 연속 출석 보너스는 기간 키와 `streak`로만 계산하고 클라이언트 값을 믿지 않는다.
- **이벤트 보상**도 같은 경로(서버 지급 + 우편)를 쓴다. 지급 이력은 `state.notices` 형식으로 남겨 중복 지급을 막는다.

## 금지

- 클라이언트에서 보상을 만들거나 수령 기록을 쓰기.
- 기간 경계를 UTC 자정으로 바꾸기(사용자가 보는 하루는 KST 05:00 시작).
- 업적/퀘스트 수치를 문서와 코드에 따로 적기 — 코드(`journey-state.mjs`)가 기준.

## 테스트

`node --test tests/journey.test.mjs tests/journey-ui.test.mjs tests/journey-metrics.test.mjs tests/achievements.test.mjs tests/season-reset.test.mjs tests/bag-limit-recovery.test.mjs`

## 관련 매뉴얼

`docs/MAIL_WAREHOUSE.md` · `docs/INVENTORY_GEAR.md` · `docs/WORLDBOSS_RANKING.md` · `docs/SYNC_SAVE.md`
