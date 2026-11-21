# 작업 260 · 설계서 PR-5 — 여정 분리(`/api/journey`) + 우편·거래소 `pendingMarket` 잠금 해소

> 설계서 `work/djrpg_domain_split_plan.md` PR-5(C-3 · S-5 · S-7) 구현입니다.
> **이 PR은 준비만 합니다 — `main` 병합·운영 배포는 하지 않았습니다**(사용자 지시).

## 왜

- `server/endpoints/market.mjs` 한 핸들러가 거래소와 여정(`journey-list`·`journey-*`)을 함께 받아, 거래소 배포·부하·장애가 우편 수령으로 그대로 번졌습니다.
- 클라이언트는 여정을 `sync.mutate`로 보내고 대기를 `pendingMarket`에 실었습니다. 그래서 **거래소 요청 결과를 확인하지 못하면 우편 `받기`·`모두 받기`까지 잠겼고**(사용자 제보 `#20869`·`#20887`·`#20915`), 가방 40칸 초과로 저장이 거절되면 `flush()`가 계속 실패해 두 도메인이 함께 막혔습니다.
- 여정 멱등 응답이 **거래소 요청 표**(`djrpg_market_requests`)에 적혀 도메인 경계가 어긋나 있었습니다.

## 바뀐 것

### 서버
| 파일 | 내용 |
|---|---|
| `server/endpoints/journey.mjs` (신규) | 여정 전용 입구. `journey-list`/`list` → `snapshot`, `journey-*` → `mutate`, 그 외 `400 INVALID_ACTION`. `versionGuard`·`assertSessionId`·`no-store`·`Server-Timing`/`logRequest`는 다른 API와 같습니다. 미리보기 호스트 판정(`isPreviewHost`/`isProductionHost`)도 동일 규칙으로 넘깁니다. |
| `api/journey.mjs` · `functions/api/journey.js` (신규) | Vercel·테스트 어댑터 / Cloudflare Pages Function 어댑터(기존 패턴 그대로). |
| `server/journey-requests.mjs` (신규) | 멱등 표 `djrpg_journey_requests`의 DDL·읽기·영수증 **단일 소유자**. 읽을 때는 한 릴리스 동안 `djrpg_market_requests`도 함께 봅니다(구번들·`/api/market` 경로가 남긴 같은 요청도 중복 지급 없음). |
| `server/journey.mjs` | 영수증을 새 표에 쓰고, 재확인은 새 표 → 거래소 표 순서. 배치 안에서 `djrpg_journey` 상태를 먼저 읽도록 순서만 정리(동작 불변). |
| `server/database.mjs` | `schema()` 문장 배열에 DDL 1줄(본문은 `journey-requests.mjs`). **구조 개편 없음** — DB 분할 PR(PR-4)과 겹치는 부분은 이 한 줄입니다. |
| `server/endpoints/market.mjs` | `journey-*` 라우팅을 **한 릴리스 병행 유지**(폐지 주석 명시). 다음 릴리스에서 이 두 줄과 `journey` import를 지웁니다. |
| `server/account-delete.mjs` · `server/season.mjs` | 새 표를 탈퇴·시즌 초기화 대상에 등록(계정 id가 들어가는 표라 남기면 안 됩니다). |
| `scripts/migrate-turso-db.mjs` | 이관 목록 + `OPTIONAL_TABLES` 등록(예전 공용 DB에는 없는 표라 옵션). |

### 클라이언트
- `src/game/journey.ts`
  - `sync.mutate` 대신 **자기 `requestId`·`revision`·`progress`** 로 `/api/journey`를 직접 호출합니다(10초 타임아웃, 응답 유실은 같은 본문 3회).
  - 대기는 `sync.pendingJourney` — 거래소 `pendingMarket`과 분리. 결과 미확인은 `journey.retry()`가 **같은 `requestId`** 로 재확인합니다.
  - `load()`의 `sync.locked`·`sync.pendingMarket` 가드를 제거했습니다(읽기 전용이라 거래소 대기 중에도 목록이 갱신돼야 합니다).
  - 4xx·`DB_UNAVAILABLE`/`DB_NOT_CONFIGURED`는 확정 거절이라 대기를 지우고, 코드 없는 5xx·타임아웃만 대기를 남깁니다.
  - `409 SAVE_CONFLICT`는 `sync.reloadLatest(true)`로 조용히 최신 세이브에 맞춘 뒤 다시 시도하게 안내합니다.
- `src/game/sync.ts`
  - `pendingJourney`·`beginJourney()`/`finishJourney()`/`journeySnapshot()`/`applyJourneyResult()` 추가.
  - `flush()` → `saveNow(ignoreTradePending)`: 여정이 저장을 먼저 정리할 때는 거래소·창고의 **대기**에 막히지 않습니다(`pendingSave`가 남아 있을 때만 결과를 먼저 확정).
  - `trading`·`resetForCharacterSwitch`·`reloadLatest`에 여정 대기 포함(캐릭터 전환 시 옛 revision이 새 캐릭터로 가면 409가 나기 때문).
- `src/ui/interface.ts`
  - 모달 열기 잠금을 `modalBlocked(market, kind)` 한 곳으로: 거래소 대기는 **거래소 창만** 막고(그 창의 `거래 결과 다시 확인`이 유일한 해제 경로), 여정 대기는 어떤 창도 막지 않습니다.
- `src/ui/modals/utilityModal.ts` — `수령 결과 다시 확인`(여정) / `거래 결과 다시 확인`(거래소)을 분리하고, 거래소 대기 중에도 "우편·보상 수령은 그대로 이용할 수 있습니다"로 안내를 바꿨습니다.
- `src/ui/modals/charactersModal.ts` — 전환 가드 문구에 우편·보상 대기 사유를 추가.

## 동작 계약(요약)

| 상황 | 이전 | 이후 |
|---|---|---|
| 거래소 결과 미확인(`pendingMarket`) | 우편 `받기`·`모두 받기` 잠김, 우편함 밖 모든 모달 잠김 | **우편 수령 그대로 가능**, 모달도 열림(거래소 대기는 거래소 창만 잠금) |
| 여정 결과 미확인 | `pendingMarket`에 섞여 거래소까지 잠금 | 우편함에 `수령 결과 다시 확인`만, 거래소·창고·모달 비잠금 |
| 여정 요청 중 저장 실패 | `flush` 실패가 거래소·우편 전체 잠금 | 여정 대기만 남고 `수령 결과 다시 확인`으로 재확인 |
| 구번들이 `/api/market`으로 보낸 여정 요청 | — | 한 릴리스 동안 그대로 처리 + 거래소 표 영수증도 읽음 |

## 검증

- `npx tsc --noEmit` ✅ / `npm run build` ✅(생성물 `version.generated.mjs`·`admin-updates.json`은 배포 빌드가 만들므로 커밋하지 않음)
- 신규 테스트
  - `tests/journey-endpoint.test.mjs` (3): 405/503/401·no-store, `list`↔`journey-list` 동일, 수령 → 같은 `requestId` 재전송 시 보상 1회·응답 동일, 영수증이 **여정 표에만**, `400 INVALID_ACTION`, `/api/market` 구경로 호환, 세션 교체 401.
  - `tests/journey-split.test.mjs` (7): 거래소 대기 중에도 `/api/journey` 수령 성공·`pendingMarket` 보존, 여정 대기가 거래소·창고를 막지 않음·조회 비잠금, `applyJourneyResult` 반영/대기 해제/`trading`/캐릭터 전환 정리, 503은 대기 해제·코드 없는 5xx는 유지 후 `retry()`가 같은 `requestId`, fetch 실패 3회 동일 `requestId`, `modalBlocked` 규칙, 저장 대기 정리.
- 기존 테스트 갱신: `tests/journey.test.mjs`(영수증 표 이름 + 구 표 응답 재사용), `tests/journey-ui.test.mjs`(여정 자기 경로·대기 분리·거래소 대기 중 우편 버튼 활성), `tests/account-delete.test.mjs`(새 표 시드).
- 관련 19개 파일 **227건 전부 통과**(`journey*`·`sync`·`modal-ui`·`character-switch`·`item-protection-ui`·`bag-limit-recovery`·`concurrency`·`functions-adapter`·`characters`·`account-delete`·`season-reset`·`migrate-turso-db`·`warehouse-*`·`market*`).
- 전체 152개 테스트 파일 실행 결과 실패 **6건**은 `origin/main`(9829aea)과 동일한 기존 실패입니다 — `costume-field-render` 2·`dungeon-248` 1·`hero-art` 1·`offline-auto-salvage` 1·`skillbook-server` 1.

## 남은 일 / 주의

1. **다음 릴리스**: `server/endpoints/market.mjs`의 `journey-list`·`journey-*` 라우팅과 `journey.mjs` import 삭제, `journey-requests.mjs`의 `legacyJourneyRequestRead` 제거(그 뒤 표 `djrpg_market_requests`에는 거래소 응답만 남음).
2. **PR-4(서버 DB 분할·표 등록부 단일화)와의 접점**: `server/database.mjs`에 DDL 1줄, `server/account-delete.mjs`·`server/season.mjs`·`scripts/migrate-turso-db.mjs`에 표 이름 1줄씩입니다. PR-4가 이관·탈퇴·초기화 목록을 `server/tables.mjs` 등록부로 파생할 때 `djrpg_journey_requests`를 함께 넣어야 합니다(누락하면 이관 시 "이관 목록에 없는 DJRPG 테이블"로 중단됩니다 — 지금은 이 PR이 직접 목록에 넣어 통과).
3. **우편 수령과 거래소 대기의 순서**: 결과 미확인 거래가 남은 상태에서 우편을 받으면 `revision`이 올라가, 그 거래를 나중에 다시 보낼 때 (서버가 적용하지 못한 경우) 409가 날 수 있습니다. 서버는 영수증을 먼저 확인하므로 **이미 적용된 거래는 409 없이 그대로 응답**하고, 적용되지 못한 거래만 409 → 여정이 최신 세이브로 조용히 재동기화합니다. 완전히 없애려면 서버에서 도메인별 revision을 나눠야 하며 이는 설계서 PR-8(읽기 역전) 범위입니다.
4. `/workspace/work/DJRPG-journey-split` worktree는 유지합니다.
