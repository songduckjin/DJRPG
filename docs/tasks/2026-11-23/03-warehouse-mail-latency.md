# [코덱스 지시서 3] 창고·우편·보상 받기 체감 딜레이 개선

> 2026-11-23 덕진 님 PC Codex 전용 상세 작업지시서. 공통 실행 규칙은 `AGENTS.md`, 진행 현황은 `docs/TASK.md`를 따른다.

## [코덱스 지시서 3] 창고·우편·보상 받기 체감 딜레이 개선

사용자 지시(2026-11-23 KST): "창고 우편 보상 받기 시스템이 딜래이가 많이 느껴지더라"

**지금 상태(확인함, `origin/main` `237f2bc` 기준 — 행 번호는 이동할 수 있으니 이름으로 찾는다)**
- `src/ui/modals/utilityModal.ts` 143행: 업적 `모두 받기`가 `for (const id of ids) await journey.act('journey-claim',{kind:'achievements',id})` — **건마다 직렬 요청**이라 미수령이 많을수록 몇 초씩 늘어진다. 같은 파일에서 우편(88행)·일일/주간(128행) `모두 받기`는 이미 `id:'all'` **한 번**이다.
- 서버는 `id:'all'`을 이미 받는다 — `server/journey.mjs` `mutate`가 `journey-claim`에서 `input.id==='all'`이면 그 분류의 수령 가능분 전체를 `selected`로 한 번에 지급한다. 따라서 **새 서버 액션 없이 클라이언트를 `id:'all'` 한 번으로 바꾸는 것이 우선**이고, 서버는 `all` 응답의 `selected`·메시지·멱등 영수증(`server/journey-requests.mjs`의 `djrpg_journey_requests`)이 여러 건을 정확히 담는지 테스트로 고정한다.
- 우편 수령 때마다 `loadShop(ui)` **전체 재조회**(88·109행)를 기다리고, `journey.act` 뒤 `journeySnapshot()` 전체 스냅샷을 다시 읽는다.
- `server/endpoints/journey.mjs`·`server/endpoints/warehouse.mjs`는 `assertSessionId` 세션 검증을 **본문 트랜잭션 앞의 별도 DB 왕복**으로 두고 있다(창고는 작업 258에서 읽기를 `tx.batch`로 묶었지만 세션 검증·여정 스냅샷 재조회는 남아 있다).
- `src/ui/modals/warehouseModal.ts`는 이동 중 `state.busy`로 창의 버튼을 통째로 잠근다(작업 250·253이 busy 해제·선택 일괄 이동까지 손댄 상태 — **그 동작을 되돌리지 않는다**).

**요구사항**
1. **업적 `모두 받기` 직렬 루프 제거** — `kind:'achievements', id:'all'` **1회 요청**으로 바꾸고, 응답 뒤 목록을 다시 그린다. 실패·부분 실패(가방 가득 등)는 지금처럼 `journey.error` 안내로 남긴다.
2. **불필요한 전체 재조회 제거** — 우편 수령 뒤 `loadShop` 전체 재호출을 없애고, 응답에 담긴 변경분(금화·다이아·가방·포션)만 상태에 반영한다. `journeySnapshot` 전체 재조회는 응답이 이미 담은 값으로 대체할 수 있는지 확인해 줄인다.
3. **서버 왕복 최소화** — `assertSessionId`를 본문 트랜잭션과 **같은 왕복**(`tx.batch`/`transaction` 첫 문장)으로 합친다. 창고(`warehouse.mjs`)·여정(`journey.mjs`) 양쪽에서 요청 1회당 DB 왕복 수를 세어 before/after를 기록한다.
4. **부분 잠금·즉시 반영** — 창고 이동과 우편/보상 수령에서 창 전체를 오래 잠그지 말고, 누른 버튼/칸만 `…중` 표시하며 응답 즉시 로컬 상태를 반영한다(낙관적 반영). **단, 중복 수령·복사를 막는 서버 멱등성(`requestId` 영수증)·트랜잭션 가드·`assertRevision` 저장 개정 검사는 반드시 유지**하고, 실패하면 화면을 원래 상태로 되돌린다.
5. **측정** — 업적 미수령 10건 `모두 받기`, 우편 1통 수령, 창고 10칸 이동 각각의 요청 수·DB 왕복·체감 시간(ms)을 before/after로 PR 본문에 적는다.
6. **테스트**: 신규 `tests/journey-claim-all.test.mjs` — ㉠ 업적 `모두 받기`가 fetch 1회(`id:'all'`)만 호출 ㉡ 중복 수령 0건·두 번째 요청은 0건 지급 ㉢ 수령 뒤 `loadShop` 호출 0회 ㉣ 가방 가득 시 건너뛴 건이 목록에 남음. 서버 회귀 `tests/journey.test.mjs`(업적 `all` 1회 지급·영수증 멱등), `tests/warehouse-grid.test.mjs`(부분 잠금·즉시 반영·실패 시 원복), `tests/sync.test.mjs`(저장 개정·`requestId` 멱등 유지).
