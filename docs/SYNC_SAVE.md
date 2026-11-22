# SYNC_SAVE — 세이브 · 동기화 · 재접속 · 무결성 가드

> **책임**: 세이브를 서버에 보내는 유일한 경로(`SaveSync`), 서버 저장 검증(`writeSave`/`reconcileItems`/`save-guard`), 충돌·세션·버전 오류 복구, 네트워크 끊김 안내, 캐릭터 전환 가드. 아이템 규칙 자체는 `docs/INVENTORY_GEAR.md`, 계정·세션은 `docs/AUTH_CHARACTER.md`.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 저장 큐·재시도·충돌·거래/창고 락 | `src/game/sync.ts`(`SaveSync`·`queueSave`·`flush`·`flushIfDirty`·`mutate`·`transferWarehouse`·`handleError`·`resetForCharacterSwitch`) |
| 끊김 문구·판정·재시도 | `src/ui/reconnect.ts`(`offlineError`·`isNetworkOffline`·`retryNetwork`·`ReconnectNotice`) |
| 저장 시점 | `src/main.ts`(10초 `flushIfDirty`·`online`·`visibilitychange`)·`src/ui/interface.ts`(`onSave`) |
| 저장/거래 API | `server/endpoints/account.mjs`(`action:'save'`)·`server/database.mjs`(`writeSave`·`assertRevision`·`reconcileItems`·`identity`) |
| 저장 상한 | `server/save-guard.mjs`(`rewardBudget`·`clampSaveProgress`·`itemWithinBounds`·`elapsedSince`) |
| 세이브 스키마 | `src/game/store.ts`(`Save`·`parseSave`·`MAX_FLOOR`·`freshSave`) |
| 버전 | `src/game/appVersion.ts`·`server/app-version.mjs`·`server/http.mjs`(`versionGuard`) |

## 저장 한 경로

```
world/save 변경 → world.onChange → Interface.onSave → sync.queueSave() (1초 디바운스)
→ sync.flush() → POST /api/account {action:'save', requestId}
→ assertRevision → reconcileItems → writeSave(revision+1) → 응답 revision 반영 → onSaved
```

- **변경이 없으면 보내지 않는다**: `flushIfDirty`는 `dirty`일 때만 요청. 10초 점검이 저장 요청을 만들지 않게 한다.
- **`requestId` 멱등**: 저장은 `djrpg_save_requests`, 거래는 `djrpg_market_requests`, 창고는 `djrpg_warehouse_requests`. 결과가 불확실하면 **새 ID가 아니라 같은 ID로 재확인**한다.

## 서버 계약 (바꾸지 않는다)

- `assertRevision`: `revision` 불일치 → `409 SAVE_CONFLICT`.
- `reconcileItems`: 이번에 처음 보이는 아이템만 개수·능력치 상한 검사(기존 보유는 소유 기록만 채움). 소유자·캐릭터 슬롯·`identity`(이름·슬롯·등급·kind·skillId·5스탯) 불일치 → `409 ITEM_CONFLICT`. 삭제 아이템은 `consumed`.
- **보물 주머니 개봉 금화는 소모 수로 인정한다(2026-11-22)**: 주머니는 클라이언트가 까고 결과를 저장으로 보내므로, `reconcileItems`가 **직전 세이브의 주머니 중 이번 저장에 없고 소유 위치가 `inventory`(또는 기록 없음)인 것 × `POUCH_MAX_GOLD`(5,000G)** 를 `pouchGold`로 돌려주고, `action:'save'`가 그 값을 `writeSave(..., { goldCredit })`로 넘긴다. 한 번에 열기로 금화가 한 저장 창에 몰려도(30개 = 최대 150,000G) 사냥 시간 기준 금화 상한에 잘리지 않는다. 창고·거래소로 옮긴 주머니(위치 `warehouse`·`market`)와 이미 `consumed`인 주머니는 세지 않으므로 꺼내 되풀이 청구할 수 없다.
- `writeSave`: `revision+1`, 금화는 `shared_gold`로 분리, `bossKills`/`playSeconds`는 최대값, `equipmentCollection`은 `부위:번호:등급` 합집합(810).
- `save-guard`: `rewardBudget`(경과 시간·층 기준 킬/보스/경험치/금화/강화석/아이템 상한)·`clampSaveProgress`(넘친 값만 자름)·`itemWithinBounds`(`rollItem` 공식 ×2.5)·`elapsedSince`(최대 12시간).
- **40칸 저장 차단은 `reconcileItems` 한 곳**. 이미 넘긴 세이브는 "현재 개수 이하 유지"만 허용하고, 수령 경로가 각각 `BAG_FULL`로 먼저 막는다.
- **세이브 한도**: `version === 1`, JSON ≤1MB, 장비 슬롯 10, 금화 ≤9,000,000,000,000. `parseSave`의 전방 호환(옛 세이브 마이그레이션)을 깨지 않는다.

## 오류 복구 (`sync.handleError`)

| 응답 | 처리 |
|---|---|
| `401 SESSION_REPLACED`·`INVALID_TOKEN` | `endSession`: 저장 중단·토큰 삭제·로그인 복귀 |
| `409 SAVE_CONFLICT` | 저장 일시정지 + 새로고침 안내(자동 재저장 금지) |
| `409 ITEM_CONFLICT`·`CHARACTER_CONFLICT` | `reloadLatest`로 최신 세이브 재로드, 10초 내 재충돌은 `stopConflictLoop` |
| `426 VERSION_OUTDATED` | `stopForOutdatedVersion` → 번들당 1회 `reloadForNewVersion` |
| 네트워크 끊김(`Failed to fetch` 등) | `offlineError()` → `ReconnectNotice`(`게임에 접속 중입니다…`), 3초마다 재전송, 20초 뒤 `다시 시도` |

- **5xx 구분**: `DB_UNAVAILABLE`·`DB_NOT_CONFIGURED`는 트랜잭션 진입 전 거절이므로 `pendingMarket`을 풀고 문구를 그대로 보여 준다. 응답 유실·코드 없는 5xx는 결과를 모르므로 `pendingMarket`을 남겨 같은 `requestId`로 재확인한다.
- **저장 실패를 성공으로 표시하지 않는다**: 토스트·배지·문서 기록 모두 실제 응답 기준.

## 캐릭터 전환 가드

- 거래 중이면 전환 금지: `sync.trading`(`beginSwitch`/`endSwitch`) → 아니면 `CHARACTER_CONFLICT`.
- 전환 뒤 `resetForCharacterSwitch()`로 `pendingMarket`·선택·펼친 상세를 정리하고, `slotAtStart`가 다른 응답은 버린다(옛 캐릭터 세이브가 화면을 덮지 않게).
- 전환 직후 방치 정산: `selectCharacter`가 남긴 `idle_claim_<slot>` 초를 `save`의 `elapsedSeconds`에 합산한다(합산하지 않으면 보상이 0초가 된다).
- **`pendingMarket`을 전환 응답에서 지우지 않는다** — `Interface.open`이 모달을 닫지 못한다.

## 여정(우편·보상) 전용 입구 `/api/journey`(작업 260 · 설계서 PR-5)

`Journey.act` → `sync.beginJourney()`(진행 중 저장만 기다리고, 결과 미확인 저장은 같은 `requestId`로 확정 — 거래소·창고의 **대기**는 막지 않는다) → `sync.pendingJourney`에 `requestId`·`revision`·`progress` 고정 → `/api/journey`(10초 타임아웃·응답 유실은 같은 본문 3회) → `server/endpoints/journey.mjs` → `journey.mutate`가 `assertRevision` → `reconcileItems` → `writeSave` + 영수증(`djrpg_journey_requests`, 읽을 때는 한 릴리스 동안 `djrpg_market_requests`도 확인) → `sync.applyJourneyResult`가 세이브·revision을 반영하고 대기를 푼다. 4xx는 확정 거절이라 대기를 지우고, `DB_UNAVAILABLE`·`DB_NOT_CONFIGURED` 5xx도 지운다. 코드 없는 5xx·타임아웃은 결과 미확인이라 `수령 결과 다시 확인`이 같은 `requestId`로 재확인한다. `pendingJourney`는 거래소·창고·모달 열기를 막지 않고, 모달 잠금(`modalBlocked`)은 거래소 대기일 때 **거래소 창만** 막는다. `/api/market`의 `journey-*` 라우팅은 구번들 호환으로 한 릴리스 유지 후 삭제한다. 표 `djrpg_journey_requests`는 등록부(`server/tables.mjs`)에 `onDelete: delete`·`onSeason: purge`·`migrate: optional`로 등록되어 탈퇴·시즌·이관이 함께 따른다.

## 금지

- `localStorage`에 세이브 저장(허용: `djrpg.auth.token`·`djrpg_preferences`만).
- 새 `requestId`로 같은 작업 재시도, `revision`을 클라이언트에서 올리기.
- `reconcileItems`·`writeSave`·`assertSession` 시그니처·에러 코드 변경.
- 저장 요청을 늘리는 폴링 추가(`docs/WORLDBOSS_RANKING.md`의 폴링 예산 참고).

## 테스트

`node --test tests/sync.test.mjs tests/reconnect.test.mjs tests/save-guard.test.mjs tests/concurrency.test.mjs tests/idle-save-budget.test.mjs tests/bag-limit-recovery.test.mjs tests/app-version.test.mjs tests/character-switch.test.mjs tests/multi-character-market.test.mjs tests/pouch-open-all.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md` · `docs/AUTH_CHARACTER.md` · `docs/MARKET.md` · `docs/MAIL_WAREHOUSE.md` · `docs/TURSO_DB_GUIDE.md`
