# MAIL_WAREHOUSE — 우편함 · 공용창고

> **책임**: 우편함(운영 우편·보상 우편의 보관·읽음·수령·삭제)과 공용창고(계정 공용 40칸, 보관/꺼내기). 지급 규칙은 `docs/QUEST_ATTENDANCE.md`, 아이템 규칙은 `docs/INVENTORY_GEAR.md`.

## 핵심 파일

| 구역 | 파일 |
|---|---|
| 우편 데이터·수령 | `server/journey-state.mjs`(`state.mail`·`grant*`·`advanceJourney`)·`server/journey.mjs`(`snapshot`·`mutate`) |
| 우편 화면 | `src/ui/modals/utilityModal.ts`(우편/보상 탭)·`src/game/journey.ts` |
| 창고 서버 | `server/endpoints/warehouse.mjs`·`functions/api/warehouse.js`·`api/warehouse.mjs` |
| 창고 화면·상태 | `src/ui/modals/warehouseModal.ts`(`renderWarehouse`·`warehouseState`·`stacksOf`·`compareWarehouseItems`) |
| 창고 요청·잠금 | `src/game/sync.ts`(`transferWarehouse`·`pendingWarehouse`·`scheduleWarehouseRecovery`) |
| 스타일 | `src/styles/modals.css`(`.warehouse-*`·`.bag-grid`) |

## 우편함 규칙

- 우편은 **계정 단위**(`djrpg_journey` JSON). 필드: `id`·`title`·`sender`·`body`·`createdAt`·`expiresAt`·`gold`·`books`·`pouches`·`diamonds`·`claimedAt`·`read`.
- **만료**: `expiresAt`이 지나면 목록에 `expired:true`로만 보이고 수령할 수 없다. `null`은 무기한.
- **수령은 원자적**: `journey-claim`(kind `mail`)이 지급 + 수령 기록을 한 번에 저장하고, 두 번째 요청은 `409 NOT_AVAILABLE`. 가방 40칸 초과면 `BAG_FULL`로 막고 수령 기록을 남기지 않는다.
- **지급 이력은 `state.notices`**: 우편함만 보고 판단하면 수령·삭제 뒤 같은 우편이 다시 붙는다. 계정당 1회 우편은 반드시 `notices`와 함께 본다.
- **운영 우편 문구·보상은 서버 상수**: `UPDATE_NOTICE_*`·`APOLOGY_MAIL_*`·`PATCH_REWARD_*`·다이아 4,000 지급 등은 `journey-state.mjs`의 상수 한 곳에서 고친다. 운영 호스트에만 지급하고 미리보기·테스트 지급은 넣지 않는다.
- **기간이 있는 지급**: `PATCH_REWARD_ID`(`patch-balance-v2-20261122`, 밸런스·UI 개편 감사 보상 — 보물 주머니 5개)는 `PATCH_REWARD_FROM`(2026-11-22 02:00 KST)~`PATCH_REWARD_UNTIL`(2026-11-23 05:00 KST) 사이에 처음 들어온 계정에만 붙고, 수령 만료는 지급일부터 7일(`PATCH_REWARD_DAYS`)이다. 그 구간이 지난 뒤에 만든 계정은 받지 않는다 — 테스트가 우편함 개수를 셀 때는 `tests/frozen-clock.mjs`로 시각을 지급 전에 묶는다.

## 공용창고 규칙

- **창고 40칸**(`WAREHOUSE_LIMIT`), 한 요청 최대 40개(`BATCH_LIMIT`).
- **한 트랜잭션·전부 아니면 전무**: `itemIds` 배열이면 소유권·가득 참이 하나라도 걸리면 통째로 409. 단건 `itemId`는 예전 응답·에러 코드 그대로.
- **왕복 최소화**(작업 253): 소유권·창고 행을 `IN (...)` 1회로 읽어 `Map` 검증, 쓰기는 `INSERT` 다중 VALUES + `UPDATE … IN (...)` 2개. 40개 보관이 DB 왕복 47회 → 5회. **아이템마다 질의하는 루프를 다시 넣지 않는다.**
- **응답에 결과 동봉**: `moved`(옮긴 id)·`items`(옮긴 뒤 창고 목록)·`save` — 화면이 `list`를 다시 부르지 않는다.
- **멱등**: `requestId`(16~80자) + `djrpg_warehouse_requests`. 결과가 불확실하면 새 ID가 아니라 **같은 ID로 재확인**한다.
- **캐릭터 가드**: `characterSlot`이 현재 슬롯과 다르면 `409 CHARACTER_CONFLICT`. 창고는 계정 공용이지만 소유권은 캐릭터별이다.
- **화면**: 공용창고·내 가방 두 그리드가 같은 정렬 비교자를 쓴다. 이동 중에는 헤더·상세 버튼을 `disabled` + `보관 중…`/`꺼내는 중…`으로 잠그고, `finally`에서 `busy`를 푼다. 보낼 변경이 없으면 `flush()` 왕복을 생략한다.

## 금지

- 창고 이동에서 `flush()`를 무조건 먼저 부르기(요청 2배).
- 우편 수령 기록을 클라이언트에서 쓰기, `BAG_FULL`인데 수령 처리하기.
- 창고 표(`djrpg_warehouse`)와 아이템 소유권 표를 서로 다른 트랜잭션으로 고치기.

## 테스트

`node --test tests/warehouse-grid.test.mjs tests/characters.test.mjs tests/journey.test.mjs tests/journey-ui.test.mjs tests/bag-limit-recovery.test.mjs tests/sync.test.mjs tests/treasure-pouch.test.mjs`

## 관련 매뉴얼

`docs/QUEST_ATTENDANCE.md` · `docs/INVENTORY_GEAR.md` · `docs/MARKET.md` · `docs/SYNC_SAVE.md` · `docs/TURSO_DB_GUIDE.md`
