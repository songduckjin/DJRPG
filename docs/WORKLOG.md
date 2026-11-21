## 2026-11-21 · fks3997 작업 253 — 판매 등록 그리드 줄 간격 · 내 직업 스킬북 가방 40칸 제외 · 공용창고 N+1 제거·이동 중 표시 (미리보기)

- **요청**(사용자 제보·지시 11-21): "판매등록창왜이러냐"(제보 사진 — 판매 등록 물품 줄 사이가 세로로 크게 벌어짐) → "가방에 내 직업 스킬북 수량도 더하지 말라(별개로 빼라)" → "공용창고 선택 꺼내기 너무 느리다.." → "로딩인지 모르겠음".
- **① 판매 등록 줄 간격**(`src/styles/market.css`): `.market-register .market-register-grid`가 `flex: 1 1 auto`로 모달 높이를 채우는데 CSS Grid 기본값(`align-content: stretch`)이 자동 행을 늘려 4줄이 화면 높이만큼 벌어졌다 → **`align-content: start`** 한 줄 추가(행은 내용 높이만 쓰고 위에서부터 쌓인다). `grid-auto-rows`는 넣지 않았다(필요 없고 브라우저 차이만 늘린다).
- **② 내 직업 스킬북 40칸 제외**(`src/game/bagCapacity.ts`·`server/skill-ids.mjs`의 `countedInBag`): 내 직업 스킬북(`isSkillBook(item) && skillBookJob(item) === jobOrDefault(job)`)만 `false`, **장비·타직업 스킬북·보물 주머니는 그대로 1개=1칸**. 직업을 알 수 없는 책은 칸을 쓴다. 가방 툴팁(`가방 N/40 · 장비·타직업 스킬북·보물 주머니를 1개씩 셉니다(내 직업 스킬북 제외)`)·창고 카운트 툴팁·주석도 같은 규칙으로 맞췄다. 서버 40칸 검사(`reconcileItems`·우편 수령·창고·거래소)는 모두 이 함수를 쓰므로 함께 적용된다.
- **③ 공용창고 일괄 이동 N+1 제거**(`server/endpoints/warehouse.mjs`): `deposit`/`withdraw`가 아이템마다 `await tx.execute`로 소유 기록(꺼내기는 창고+소유 기록)을 읽어 10개면 10회 원격 DB 왕복 → **`IN (...)` 1회 조회 + `Map` 검증**으로 바꾸고, 쓰기도 **보관: `INSERT`(다중 VALUES) 1 + `UPDATE ... IN (...)` 2**, **꺼내기: `DELETE` 1 + `UPDATE ... IN (...)` 2**로 묶었다(창고 잔여 칸 조회도 루프 전 1회). 단건 요청도 같은 경로라 결과·에러 코드·문구는 그대로다.
- **④ 이동 중 표시**(`src/ui/modals/warehouseModal.ts`·`src/styles/modals.css`): 옮기는 동안(`state.busy.size > 0`) 헤더 `선택 보관`/`선택 꺼내기`와 상세 바 `보관하기`/`꺼내기` 버튼이 **`disabled`** 되고 문구가 **`보관 중…`/`꺼내는 중…`** 으로 바뀐다(성공·실패 모두 `finally`의 repaint로 원복), 커서는 `progress`.
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과(배포 CSS `index-*.css`에 `align-content:start` 포함), 신규/갱신 테스트 — `tests/market-bundle-ui.test.mjs`(그리드 `align-content: start` 회귀), `tests/bag-capacity`·`tests/bag-job-books`(내 직업 책 제외·서버/클라 동일), `tests/warehouse-grid`(N+1 정적 검사 + 이동 중 `disabled`·`보관 중…`/`꺼내는 중…`), `tests/auto-salvage`·`dungeon-rewards`·`field-loot`·`market`·`offline`(40칸 규칙 변화 반영). 전체 1,135건 중 **1,042 통과**, 실패 93건은 전부 이 sparse 체크아웃에 `public/assets/**`·`public/boot-recovery.js`가 없어 생기는 파일 검사 90건 + 종전부터 실패하던 `costume-field-render` 2건·`skillbook-server`(hell 이름) 1건이다.
- **배포**: `main` 병합·운영 배포 **없음**(사용자 지시 "지금 수정하는 것들은 미리보기에 해놓고 덕진이가 배포할 때 같이 배포해 줘"). `2694df9` 위에 `d3d511f`(그리드)·`2cf44cb`(40칸)·`cadf935`(창고 N+1)·`1fd5b34`(이동 중 표시)를 `preview/gravel-background-fks3997`에 푸시 → 미리보기 `version.json` **`1fd5b3496bec`**(`builtAt 2026-11-21T05:41:22Z`) — 배포 CSS(`index-DP5BlFDH.css`)에 `.market-register .market-register-grid{…align-content:start}`, 배포 JS(`index-BNVtIJqU.js`)에 `보관 중…`·`꺼내는 중…`·`장비·타직업 스킬북·보물 주머니를 1개씩 셉니다(내 직업 스킬북 제외)` 확인(`Workers Builds: djrpg` 실패 체크는 main에서도 계속 실패하는 상시 체크) 확인. 나중에 `main`에 옮길 때는 위 네 커밋만 cherry-pick하면 된다(미리보기 전용 코드와 섞이지 않게 파일을 나눠 두었다).
## 2026-11-21 · fks3997 작업 251 — 가방 스킬북 `합성`(타직업 5권 → 내 직업 1권)·자동 합성, [미리보기 전용] 보물 주머니 버리기·40칸 초과 개봉·타직업 스킬북 테스트 우편 (미리보기)

- **요청**(사용자 확정 11-21): 12:14 "가방에 합성버튼추가해서 타직업스킬북 5개당 내직업 랜덤1개로 합성가능 합성버튼누르면 작은팝업추가되고 5개합성모션넣고 랜덤으로 한개뜨게할꺼데 … 5권 배열하고 가운데로모여서 빛나면서 터지는모션넣고 허물벗고 새책이등장하는모션" → 12:20 "빈칸 5칸 표시·`자동 합성`·합성 가능한 수만큼 한꺼번에 결과 나열" → 12:24 "(미리보기 테스트 주머니 100개 때문에) 가방이 40칸을 넘어 아무것도 못 한다" → 12:26 "미리보기에만 추가하고 스킬북도 30개 우편으로" → 12:29 "보물 주머니 버리기도 미리보기 전용, 절대(운영) 배포 금지". **모두 미리보기 반영만**이며 `main` 병합·운영 배포는 하지 않았다.
- **합성 규칙**(`src/game/skillSynth.ts` 신규): 재료는 가방의 **타직업 전용·미잠금 스킬북**만(내 직업 책은 스킬 창에서 쓴다). 5권을 소모해 내 직업 스킬북 1권을 만들고(비용 없음), 결과는 **내 직업 11종(액티브 8 + 패시브 3) 1/11**. `자동 합성`은 `Math.floor(재료/5)`회를 한 번에 돌려 `5×N` 소모 → `N`권 획득(예: 12권 → 10권 소모·2권 획득·2권 잔여). 가방은 **5칸 줄고 1칸 늘어 순감 -4칸**이라 40칸 상한·서버 `reconcileItems`("지금 개수 이하 유지" 허용) 모두 안전하다.
- **왜 `rollSkillBookFor`를 새로 만들었나**: 브리프에는 `rollSkillBook(save.floor, 내 직업)`이 내 직업 1/11을 준다고 적혀 있었지만, 실제 `rollSkillBook`은 인자를 무시하고 `dropJob()`으로 **직업을 1/3 먼저** 뽑는다(33종 1/33). 그대로 쓰면 "내 직업 책"이 나오지 않으므로 `src/game/items.ts`에 `rollSkillBookFor(job)`(그 직업 11종 1/11)을 더했고, 기존 드롭·우편 확률은 건드리지 않았다(`rollSkillBook`은 `skillBookItem` 한 곳으로 이름 생성만 공유).
- **가방·팝업**: `equipModal.ts` 바닥줄 `일괄 분해` 왼쪽 `합성`(타직업 미잠금 책이 5권 미만이면 비활성·title 안내). `src/ui/modals/synthModal.ts`(신규)가 작은 창을 `ui.root`에 한 겹으로 얹는다(주머니 개봉 창과 같은 방식, 장비창이 닫히면 함께 닫힘) — 위에 **빈칸 5칸 상시**, 아래에 재료 목록(누르면 칸에 들어가고 다시 누르면 빠짐), `자동 채우기`, `합성하기 (N/5)`, `자동 합성 (N회)`, `닫기`. 결과는 `stackSynthBooks`로 같은 책을 `×N`으로 묶어 한 화면에 나열.
- **연출**(0.9초, `SYNTH_GATHER_MS` 280 · `SYNTH_BURST_MS` 560 · `SYNTH_RESULT_MS` 620 · `SYNTH_MOTION_MS` 900): ① 5권이 **가운데 칸 중앙으로 수렴** — 책마다 실제 화면 거리를 재어 `--synth-dx`로 넘겨 화면 크기와 무관하게 겹친다 ② 중앙에서 Canvas 흰빛(`createPouchLight`)이 고조 ③ 0.56초 **섬광 + 허물(종이) 조각 12개가 회전·확산**하며 벗겨짐 ④ 0.62초 새 책 등장(결과가 여럿이면 40ms 시차) ⑤ 0.9초 버튼 잠금 해제. 세이브 차감은 **누르는 순간 한 번**, 연출 중에는 이미 지운 5권 그림을 칸에 그대로 세워 둔다(`renderSlots(chosen)` — 이 부분이 처음에 비어 버려 테스트로 잡고 고쳤다). `prefers-reduced-motion`이면 연출 없이 즉시 결과.
- **[미리보기 전용 · main 운영 배포 금지] 보물 주머니 버리기**: `src/game/previewOnly.ts`(신규) `isPreviewClient()`가 `preview`가 들어간 호스트이면서 `djrpg.pages.dev`가 아닐 때만 true(서버 `season.mjs` `isPreviewHost`와 같은 규칙). 가방 주머니 상세와 개봉 창 양쪽에 `버리기`(1개 즉시)·`모두 버리기`(한 번 더 눌러 `정말 모두 버리기 (N개)` 확인). 운영 호스트에서는 버튼 요소가 아예 만들어지지 않는다. 로직은 `pouch.ts`의 `discardPouch`·`discardAllPouches`.
- **40칸 초과 개봉 허용**: `openPouch`에 실제로 들어 있던 `equipmentCount > 40` 차단(주석은 허용이라고 적혀 있었다)을 제거했다. 주머니 1개 → 결과 1개(또는 금화)라 칸이 **늘지 않으므로**(-1 또는 0) 45칸 세이브도 열어 줄여 나갈 수 있다. 기존 `tests/treasure-pouch`의 "40칸을 넘으면 열지 않는다" 기대를 새 규칙으로 바꿨다.
- **[미리보기 전용] 타직업 스킬북 테스트 우편**: `server/journey-state.mjs`의 `PREVIEW_POUCH_MAIL_*` 바로 옆에 `PREVIEW_SKILLBOOK_MAIL_*`(`preview-skillbook-test-1~3`, 통당 10권 = 30권)를 따로 두고 미리보기 호스트에서만 계정당 1회 지급·운영에서는 삭제. 우편은 `bookJobCycle`(내 직업을 뺀 두 직업)을 실어 보내고 `journey.mjs` `rewards()`가 그 순서로 책을 만든다 — **필드가 없는 기존 우편은 지금처럼 33종 균등**(계약 불변). 가방 40칸 때문에 1통씩 받아 2회 합성하고 비운 뒤 다음 통을 받는 흐름을 우편 본문에 적었다. 나중에 `main`으로 올릴 때 **이 함수·`previewOnly.ts`·버리기/테스트 우편 호출부만 지우면** 합성은 그대로 남는다.
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과(이 체크아웃은 `public/assets`가 sparse 제외라 이웃 워크트리 자산을 잠시 심볼릭 링크해 `verify-item-art`까지 통과시키고 원복 — 번들 `index-DrcqP3Pm.js` 788,901B). 신규 `tests/skillbook-synth.test.mjs` **15/15**(재료 필터·5권 미만 차단·5권→1권·내 직업 11종 1/11·12권→자동 2회·잠금/내 직업 책 거절·**45칸 세이브에서 5권 제거+1권 생성이 서버 `reconcileItems` 통과·소유 기록 생성**·40칸 초과 개봉·버리기·팝업/자동 채우기/자동 합성 결과·연출 중 5권 유지·CSS 규칙), `treasure-pouch` 23/23, `journey` 23/23(테스트 우편 지급·운영 미지급·수령한 10권이 전부 타직업 책), 관련 묶음 100건 중 99 통과. 전체 1,126건 중 **1,033 통과**, 실패 93건은 ① 이 체크아웃에 `public/assets/**`가 없어 생기는 ENOENT 92건 ② `origin/preview`에서도 같은 기존 `skillbook-server`(`hell` 이름 `헬 파이어 소드` vs `회전참격`) 1건뿐이다.
- **미리보기 배포**: `origin preview/gravel-background-fks3997` `50e59fb`(작업 250) 위로 `9c14107`·`a180160`(등록 문서)·**`c2cff4b`**, `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` = `c2cff4b41843`(`builtAt` 2026-11-21T04:03:06Z)·루트 200. 배포 번들 `assets/index-DrcqP3Pm.js`에 `synth-window`·`자동 합성`·`자동 채우기`·`합성하기`·`가방의 타직업 스킬북`·`모두 버리기`·`버리기`·`synth-husk`, CSS `assets/index-CDBCZXe-.css`에 `.synth-window`·`.synth-husk`·`.synth-flash`·`.synth-result-item`·`.pouch-window-discard`·`.synth-open` 포함 실측, `/api/market` 401 JSON(함수 정상 응답). 이어지는 문서 커밋이 같은 코드로 재배포되어 `version.json` 해시가 문서 커밋이 된다.
- **남은 것**: 폰 실기 확인(연출 속도·5칸 배치·자동 합성 결과 스크롤)은 사용자 몫. **`main` 병합·운영 배포 금지**(사용자 지시 — 버리기·테스트 우편은 미리보기 전용).

## 2026-11-21 · fks3997 작업 250 — 공용창고 다중 선택 하단 상세 바 이동·이동 로딩 단축 (미리보기)

- **요청**: 사용자 제보 "공용창고에 물품 옮길 때 로딩이 너무 길고 템 비활성화된 채로 변화 없음" + 확정 2건 — ① 여러 개를 골랐을 때 아래 상세 바 버튼도 `선택 꺼내기 (N)`/`선택 보관 (N)`으로 동작 ② 이동 로딩 단축·`is-busy` 잠금 방지. 사용자 지시는 **미리보기 반영만**(`main` 병합 금지).
- **선행 동기화**: 직전 작업 249(`dc5d72f`) 푸시를 15초 간격으로 확인한 뒤 그 위에 `work/250-warehouse-fix` 워크트리를 만들었다(`work/djrpg-bundle-market` 무변경). `warehouseModal.ts`는 248 이후 그대로였고 `sync.ts`는 249의 `effect` 타입 필드만 달라 그 위에 작업했다.
- **하단 상세 바 다중 선택**(`src/ui/modals/warehouseModal.ts` `paintDetail`): `pickIds`로 그 쪽 선택 아이템 수를 세어 2개 이상이면 라벨을 `선택 보관 (N)`/`선택 꺼내기 (N)`으로 바꾸고, 클릭 시 마지막으로 탭한 1개가 아니라 선택한 칸의 모든 id를 **한 요청**으로 보낸다(1개·스택 한 칸이면 예전 `보관하기 (N)`/`꺼내기 (N)`). 상세 메타에 `선택 N개`를 덧붙이고 버튼 `title`로 함께 옮긴다는 것을 밝힌다. 40칸 상한은 **옮길 개수 전체**로 계산해 창고는 `창고 수 + N > 40`, 가방은 `가방 수 + N > 40`이면 잠근다(예전에는 상세 바가 가방 40칸을 보지 않았다).
- **선택 정리**: 일괄 버튼이 누르는 순간 선택을 지우던 것을 없애고 `move()`의 **성공** 뒤에 그 쪽 선택을 비운다 — 실패하면 골라 둔 칸이 남아 바로 다시 누를 수 있다. 응답 뒤 `ui.renderStatus()`·`renderBagBadge()`·`repaint()`를 그 자리에서 불러 그리드가 바로 갱신되고, `paint()`의 기존 정리 로직이 더 이상 목록에 없는 칸의 선택·상세를 버린다.
- **로딩·잠금**(`src/game/sync.ts` `transferWarehouse`): ① `dirty`·`pendingSave`·`pending`·진행 중 `active`가 모두 없으면 `flush()` 저장 왕복을 **건너뛰고** `/api/warehouse` 한 번만 보낸다(서버는 그 revision의 세이브 위에 적용하므로 dirty일 때만 먼저 저장) ② 실패 재시도를 10초 타임아웃 × 3회(최대 30초)에서 **6초 타임아웃 × 2회(최초+재확인 1회)**로 줄이고, 결과 미확인(`pendingWarehouse`)은 기존 `scheduleWarehouseRecovery`(2초→30초 백오프)가 화면 밖에서 같은 `requestId`로 확인한다 — 화면이 30초씩 얼지 않는다 ③ `finally`에서 `locked`를 풀고 `state.busy`를 비워 칸이 영구히 흐려지지 않는다.
- **재열기 안전장치**: `renderWarehouse` 첫머리에서 `state.busy.clear()` — 응답을 잃어 `is-busy`가 남은 채 창고를 다시 열어도 모든 칸을 다시 누를 수 있고, `onWarehouseRecovered`가 부르는 `loadWarehouse` 경로에서도 잠금이 함께 풀린다.
- **검증**: `npx tsc --noEmit` 통과, `tests/warehouse-grid.test.mjs` **11/11**(신규 3건 — 다중 선택 상세 바가 `선택 보관/꺼내기`로 전부 이동·실패 시 선택 유지·이동 중 그 칸만 잠기고 응답 세이브로 즉시 갱신·재열기 잠금 해제), `tests/sync.test.mjs` **24/24**(신규 3건 — clean이면 `/api/warehouse` 1회·dirty면 저장 후 이동·6초 타임아웃 2회 후 `pendingWarehouse` 유지와 잠금 해제).
- **미리보기 배포 확인**: `git push origin HEAD:preview/gravel-background-fks3997` (`7ec61c0`→**`29095b1`**, 249의 추가 푸시 위로 rebase). `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` = `29095b1a0007`(`builtAt` 2026-11-21T03:46:57Z) HTTP 200·루트 200, 배포 번들 `assets/index-aiZGyF-k.js`(777,444B)에 상세 바 라벨 `선택 ${…"꺼내기":"보관"} (${…})`·`가방이 가득 차 꺼낼 수 없습니다`·`한꺼번에`·`연결이 회복되면 자동으로 다시 확인합니다`·`6e3`(6초 타임아웃)·`this.dirty||this.pendingSave||this.pending||this.active`(저장 왕복 생략) 포함, 옛 `attempt===2`·`자동으로 다시 확인하고 있습니다` 0건 실측. 전체 `node --test tests/*.test.mjs` 1,116건 중 1,023 통과·93 실패는 같은 커밋(`dc5d72f`) 기준선(1,110건 중 1,017·93)과 동일한 기존 실패(`public/assets/**`·`public/boot-recovery.js` 없는 sparse 체크아웃), `vite build` 성공(778kB). **인게임 실기 확인은 사용자 몫.**

## 2026-11-21 · fks3997 작업 248 — 가방 40칸 통일(스킬북·보물 주머니 포함)·우편 차단 + 던전 공격력 정상화·5% 드롭·보스 2개·10층 등급표·보상창 등급색 + 거래소 헤더·인덱스 탭·간편/상세 보기·판매 등록 칸 정리 (미리보기)

- **요청**: ① 사용자 확정 "안되 스킬북 보물주머니도 가방 40개에 포함하고 그 이상 받아지면 안 되고 가방 꽉 차거나 넘어가면 우편도 안 받아져야 해" ② 끝없는 던전 몹·보스 공격력 정상화(최대 체력 5%/8% 상한 제거·`enemyHitDamage(층×2)`) ③ 던전 보상창 등급색·이름 앞 등급·장비 먼저/스킬북 아래 ④ 던전 일반 몹 드롭 5% 고정·보스 확정 2개·10층 구간별 등급 확률 ⑤ 거래소 `간편 보기/상세 보기` 토글 ⑥ 거래소 헤더(제목 왼쪽·금화는 닫기 왼쪽)·인덱스 탭 ⑦ 판매 등록 칸 정사각형화. 모두 **미리보기 반영만**(`main` 병합 금지).
- **가방 40칸 통일**: `src/game/bagCapacity.ts`·`server/skill-ids.mjs`의 `countedInBag`을 "가방 안의 모든 아이템 1개=1칸"으로(내 직업·타직업 스킬북, 보물 주머니, 장비 구분 없음). 창고 꺼내기(`server/endpoints/warehouse.mjs`)가 스킬북·주머니를 검사 없이 꽂던 버그를 고쳐 40개면 `409 BAG_FULL`. 우편·보상 수령(`server/journey.mjs`)은 `books`+`pouches`가 자리를 넘으면 `409 BAG_FULL`(문구 "가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요."), `모두 받기`는 자리 없는 아이템 우편만 건너뛰고 금화/다이아만 있는 우편은 정상 수령·남은 우편은 미수령 유지, 일일·주간 완료·업적 보상도 같은 검사.
- **이미 40개를 넘긴 세이브**: 미리보기 주머니 100개 우편을 받은 계정이나 예전 규칙으로 내 직업 책을 쌓은 계정이 저장 거부로 잠기지 않도록 `server/database.mjs` `reconcileItems`의 40칸 검사를 **"지금 개수 이하를 유지하는 저장은 허용, 늘리는 저장만 차단"**으로 바꿨다(`Math.max(40, before 개수)`). `inventoryOwnerQuery`의 구식 필터는 앞단 검사에서 뺐다(최종 판정은 `before`를 아는 `reconcileItems` 한 곳).
- **드롭·방치·던전**: `world.ts` 드롭은 흡수 **직전**에 자리를 다시 확인해 같은 프레임에 여러 개가 흡수돼 42개가 되던 구멍을 막았고(만석 안내 문구 "아이템을 분해하거나 공용창고에 보관하세요"), `offline.ts`·`dungeonRewards.ts`는 `canStoreItem` 하나로 같은 규칙. 보물 주머니 개봉(`pouch.ts`)은 주머니 1개 소모+결과 1개라 칸이 늘지 않아 40칸에서도 허용, 40개 초과 세이브만 정리 안내와 함께 막는다.
- **던전 공격력 정상화**(`src/ui/dungeonBattle.ts`): `Math.min(피해, 최대 체력의 0.5%/0.8%)` 상한 삭제, `dungeonHitDamage(층, 보스, 방어, 정예) = enemyHitDamage(층×2, …) × (정예?2:1)` — 3층=필드 6층, 10층=필드 20층 공격력. 서버 검증(`server/dungeon-verify.mjs`)은 `runDungeonBattle`을 그대로 다시 돌리므로 피해 식이 한 곳뿐이고, `tests/dungeon-248`이 서버가 자체 피해 식을 갖지 않음을 고정한다. 그 영향으로 맨몸 1레벨은 2층부터 버티지 못해 순위·검증 테스트의 시험 캐릭터를 장비를 갖춘 세이브로 바꿨다.
- **던전 드롭·등급**: `DUNGEON_DROP_CHANCE_{BASE,STEP,MAX}` = .05/0/.05(모든 층 5%), `BOSS_ITEM_DROPS` 5→**2**, `src/game/items.ts`에 `dungeonRarityTier(층)=floor((층−1)/10)`·`DUNGEON_RARITY_TIERS`·`DUNGEON_BOSS_RARITY_TIERS`(0구간 = 지금 던전 10층 값: 일반 전설 0.25%·레어 2.4%·매직 15%, 보스 2.2%/14.9%/54%)·`dungeonRarityFor`·`rollDungeonItem` — 구간마다 전설·레어·매직 몫이 커지고(7구간에서 4.1%/22%/51%), 던전 몹·보스 아이템이 이 표를 쓴다.
- **던전 보상창**(`src/ui/dungeonRewardMarkup.ts`·`styles/dungeon.css`): 아이템 목록에 여섯 등급 색(`.dungeon-result-items li.rarity-*`, 목록의 기본 색이 등급색을 덮던 문제 수정)·이름 앞 `[등급]`(`.dungeon-result-grade`)·**장비 먼저 → 스킬북 아래**(같은 책 `×N` 묶음). 보스 안내 문구도 확정 드롭 2개로.
- **거래소 UI**(`src/ui/modals/marketModal.ts`·`styles/market.css`): 제목 `황야의 거래소`를 모달 머리 왼쪽에, 보유 금화를 닫기(×) 바로 왼쪽에(히어로 블록 제거), 5탭을 제목 바로 아래 **인덱스 탭**(`.market-index-tabs`·`.market-index-tab`, `role=tab`/`aria-selected`, 수령함 빨간 점 유지). 판매 중 탭에 사용자가 준 아이콘 두 장으로 `간편 보기/상세 보기` 토글(`localStorage` `djrpg.market.listingView`, `aria-pressed`) — 상세는 기존 카드 그대로, 간편은 아이콘(등급 테두리·`+N`·추천 화살표)+이름+가격+구매 1줄이고 카드를 누르면 그 매물의 상세(비교·구매 확정)가 아래에 펼쳐진다. 판매 등록 칸은 가방과 같은 정사각형 아이콘 칸으로(이름 글자 제거·툴팁만, 직업 배지 좌상단 2/3·`+N` 좌하단 3/2·추천 화살표 우상단 9px 고정·`×N` 우하단 절대 위치).
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과, 전체 `node --test tests/*.test.mjs` 1,117건 중 실패는 기존 `costume-field-render` 2·`skillbook-server`(`hell`) 1과 확률 플레이크 1(`world-movement` 평타 치명타). 신규 `tests/bag-mail-cap` 6/6·`dungeon-248` 6/6·`market-view-toggle` 5/5, 갱신 `bag-capacity`·`bag-job-books`·`treasure-pouch`·`market`·`journey`·`journey-ui`·`warehouse-grid`·`dungeon-rewards`·`dungeon-battle`·`dungeon-verify`·`dungeon-ranking`·`item-protection-ui`·`upgrade-badge`·`market-inbox-ui`·`offline`·`auto-salvage`·`field-loot`·`extra-options`.
- **미리보기 배포**: `preview/gravel-background-fks3997` `094778c` → `4e04eaf` → `19c6919` → **`551e576`**(마지막은 여정 40칸 검사가 `bag` 없는 세이브에서도 안전하도록 한 줄 보강), `version.json` `551e576daefb`(2026-11-21T03:01:46Z = 12:01 KST)·루트 200, 번들 `assets/index-DNcPbXQV.js`(773,660B)·CSS `assets/index-Bor7m3nx.css`(128,662B)에 위 표시 문자열·등급표 값·`const _g=2`·`=.05,0,.05` 포함, `/assets/icons/market-view-{compact,detail}.png` 200. **`main` 병합·운영 배포는 하지 않았다**(사용자 지시). 모바일 실기 확인은 사용자 몫.
- **남은 것**: 같은 파일(`marketModal.ts`·`market.css`)을 고치는 `[작업 249]`(묶음 등록·전체/개당 구매)가 `[-]`로 등록돼 있어, 그 작업은 이 커밋 위로 rebase해 진행해야 한다.

## 2026-11-21 · fks3997 작업 245 — 등반·강등·보스 도전 규칙, 스킬 추천/자동 강화/`+` 선택 팝업, 공용창고 정렬, 아이템 생성 허용치 40 (미리보기)

- **요청**: ① 자동 등반은 강등당했을 때만 꺼지게 ② 강등돼도 `⚔ 보스 도전` 유지·누르면 최고층 보스 ③ 자동 등반 중이면 아래층에서도 목표를 채울 때마다 한 층 등반 ④ 스킬 추천 2·3번 원은 실제 초당 딜량 순 ⑤ 스킬북 `자동 강화` 버튼 ⑥ 빈 스킬 원(`+`)은 장착 가능한 스킬만 고르는 팝업 ⑦ 공용창고 부위별·전투력순 정렬 ⑧ `ITEMS_FLOOR` 40. 사용자 지시는 **미리보기 반영만**(`main` 병합 금지).
- **선행 동기화**: 미리보기 브랜치가 `origin/main`보다 22커밋 뒤져 있었다(작업 222~244 미반영). 얕은 클론이라 `git fetch --deepen`으로 이력을 채운 뒤 `origin/main`(`a4bf0de`)을 미리보기 위로 병합했고, 충돌 27파일은 모두 main 쪽이 상위집합임을 파일 단위 diff로 확인해 main을 기준으로 풀었다(미리보기는 대공사 내용을 이미 main으로 올린 뒤였다). `tests/world-movement.test.mjs`의 자동 병합 중복 5건은 main 판으로 정리.
- **등반·강등**(`src/game/world.ts`): `MOB_CAP` 강등 블록에만 `save.autoClimb = false` + `적이 너무 많아 N층으로 내려갑니다. 자동 등반이 중단됩니다.`. 일반·정예 몹 사망 분기에서 자동 등반을 끄던 줄을 없애 10골드·부활·자동 등반 유지를 보스전과 같게 맞췄다. `kill()`의 `!bossFloor()` 분기에서 `autoClimb && floorKills >= floorKillTarget`이면 `floor++`·진행도 0·필드 정리·`${floor}층 진입`(꺼져 있으면 기존처럼 0으로만). `offline.ts` 정산 루프에도 같은 규칙(`autoClimb && floor < maxFloor` → 목표마다 한 층, 최고층에서 보스전).
- **보스 도전**: `bossRetryReady`에서 `bossFloor()` 제한을 빼 `bossRetryAvailable && maxFloor < MAX_FLOOR`. `challengeBoss()`가 아래층이면 `travelToFloor(maxFloor)`로 올라간 뒤 소환. HUD 버튼 aria-label도 "최고층 N층 보스"로.
- **스킬 추천**(`src/game/loadout.ts`): `skillCastScale(id, level)`(시전 총 계수 — slash2 2.2·slam 2.75·power 4·spin/hell/arrowRain은 지속 중 되풀이 타격까지)·`skillDps(save, id)`를 더하고, `recommendedSkillOrder`의 점수(`10 - rank`)를 **DPS × `skillDamageScale`** 내림차순으로 바꿨다(동점은 직업 표 순서). 예: Lv.8 iceBolt 1.7×1.7/7=0.413 > Lv.4 manaBurst 2.5×1.3/10=0.325.
- **자동 강화**(`src/ui/skillBooks.ts` `useAllReadySkillBooks` + `skillModal.skillTopBar` 버튼): 내 직업(`(skillBookJob(item) ?? mine) === mine`) 스킬북만, `skillBookStatus(...).ready`인 동안 반복 사용(권수 충분하면 연속 레벨업). 타직업 책·권수 부족·최대 레벨 제외, `body` 패시브로 최대 체력이 오르면 현재 체력도 함께 올림. 동기화 중에는 안내 후 종료.
- **`+` 선택 팝업**(`src/ui/skillLoadout.ts` `openSkillPicker`·`closeSkillPicker` + `styles/modals.css`): 전체 스킬 창 대신 장착 가능한 스킬만. 1번 원은 버프 1순위, 2·3번 원은 공격 스킬 DPS 순 + 맨 위 `추천` 배지, 줄 클릭 = 즉시 장착·닫힘, 닫기/바깥 누름 지원.
- **공용창고 정렬**(`src/ui/modals/warehouseModal.ts` `compareWarehouseItems`): 칸을 부위(`slots`) → 전투력 내림차순 → 등급 → 강화(+N) → 이름 순으로. 보물 주머니·스킬북은 부위 뒤, 가방 쪽 그리드도 같은 함수를 쓴다.
- **서버 허용치**(`server/save-guard.mjs`): `ITEMS_FLOOR` 8→40(가방 40칸과 동일, 초당 0.5개는 그대로).
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과(번들 `index-C9T7QLoR.js`). 전체 `npm test` 1,074건 중 **1,071 통과** — 실패 3건은 `origin/main` `a4bf0de`에서도 그대로 실패하는 기존 `costume-field-render` 2·`skillbook-server` 1(로컬 기준선 실측). 신규 `tests/climb-rules` 5/5·`skill-picker` 7/7·`skill-auto-upgrade` 6/6·`item-mint-budget` 3/3, 갱신 `world-movement` 27/27·`offline` 6/6·`offline-climb`·`skill-auto-loadout` 10/10·`skill-ui` 12/12·`warehouse-grid` 8/8.

- **미리보기 배포**: `preview/gravel-background-fks3997` 푸시 `262f072d350e`(2026-11-21 10:31 KST 빌드). `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` HTTP 200 · `version` `262f072d350e` · 루트 200, 배포 번들(`assets/index-DqyO72YC.js`)에 `자동 강화`·`skill-auto-upgrade`·`skill-picker`·`is-recommended`·`자동 등반이 중단됩니다`·`자동 등반은 계속됩니다`·`⚔ 보스 도전` 확인. **`main` 병합·운영 배포는 하지 않았다**(사용자 지시). 모바일 실기 확인은 사용자 몫.
## 2026-11-21 · songduckjin 작업 244 — 궁수·마법사 사거리 소폭 상향(330/180 · 285/160)

- **요청**: 사용자 "그리고 궁수 법사 사거리 조금씩늘려줘"(08:28 KST). 09:00 API 복구 전까지 구현·검증·운영 배포.
- **수치**: `src/game/world.ts` — 궁수 `archerAttackRange` 280→**330**·`archerStopRange` 150→**180**, 마법사 `mageAttackRange` 240→**285**·`mageStopRange` 130→**160**. 전사 90·사거리 순서(궁수 > 마법사 > 전사)·`사거리 > 정지 거리`(평타의 약 55%)는 그대로다. 궁수는 마법사의 약 116%, 마법사는 전사의 약 3.2배로 두 원거리 직업의 체감 차등도 유지했다.
- **실제 체감은 정지 거리**: `update`는 `pursuing = distance >= stopRange`로만 이동을 정하고, 이동 중(`activeMove`≠0)에는 `action`이 공격을 막는다(작업 157부터의 규칙). 그래서 "서서 쏘는 거리"는 정지 거리이고, 150→180·130→160이 실제 상향 폭이다. 사거리는 `distance <= attackRange`일 때 평타를 내보내는 게이트와 사거리 밖 조준점으로 쓰인다.
- **스킬 사거리 동반 상향**(`src/game/skills.ts`): 평타만 멀어지면 Lv.1 스킬(더블 샷 232·멀티 샷 226)이 평타보다 짧아져 "평타는 닿는데 스킬은 닿지 않는 자리"가 생긴다 → **날아가는 원거리 공격 스킬 12종의 `range`를 약 15% 올렸다**. 더블 샷 265·멀티 샷 260·관통 사격 305·빙결 화살 270·저격 일격 340·폭풍 연사 285·애로우 레인 295·파이어 볼트 260·아이스 볼트 270·체인 라이트닝 275·마력 폭발 250·메테오 스트라이크 285. 저격(340)은 새 평타(330)보다 멀리 닿고, 자기 몸 중심 기술·버프(프로스트 노바 150·아르카나 오버로드 210·호크아이 200·아케인 실드 120)는 `range`가 곧 효과 반경이라 손대지 않았다.
- **탄환 수명**: `shoot`의 수명은 `max(.05, 거리 / 속도)`라 사거리가 늘어도 화살·구슬이 도착 전에 사라지지 않는다(속도는 궁수 평타 820·마법사 760 그대로, 변경 없음). 테스트가 `duration ≈ 거리/속도`를 직접 확인한다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/range.test.mjs` **7/7**(확정 수치·정지 거리 비율·궁수 170/마법사 150 서서 쏘기·사거리 끝 320/275 탄환 도착과 수명·이동 중 무공격 규칙·평타보다 짧은 스킬의 동작·스킬 사거리 표), `tests/archer.test.mjs` 확정 수치 갱신(궁수 330/180·마법사 285/160), `node --test tests/{archer,mage,world-movement,field-spawn}.test.mjs` 59/59, 전체 `tests/*.test.mjs` **1,050건 중 1,046 통과**(실패 4건은 작업 243 시점과 동일한 기존 건 — `costume-field-render` 2·`hero-art` 1·`skillbook-server` 1), `npm run build` 통과. 배포 번들에 `330·180·285·160`과 스킬 사거리 값 포함 확인.
- **머지·배포**: [PR #248](https://github.com/songduckjin/DJRPG/pull/248) 스쿼시 `bb43102c389f`(Cloudflare Pages SUCCESS), 운영 `djrpg.pages.dev` `version.json` `bb43102c389f`(`builtAt` 2026-11-20T23:49:53Z = 08:49 KST)·루트 200. 배포 번들 `assets/index-DmAoBMxa.js`(761,456B)에서 `Ai=330,p2=180,Ci=285,m2=160`과 스킬 사거리(`snipe` 340·`pierceShot` 305·`arrowRain` 295·`stormVolley`/`meteorStrike` 285·`doubleShot`/`fireBolt` 260·`iceArrow`/`iceBolt` 270·`manaBurst` 250) 실측 확인.
- **남은 것**: 폰 실기에서 궁수·마법사가 서서 쏘는 거리와 화살·구슬 도착 연출 확인(운영 `/api/*`가 08:51 KST에도 405 — 무료 한도 초기화 뒤 로그인 가능).

## 2026-11-21 · songduckjin 작업 242 — 09시까지 서버 점검 중 안내(로그인 배너 + 405 안내)

- **요청**: 사용자 "9시까지 점검중이라고 표시해줘"(07:51 KST). Cloudflare Pages 무료 플랜 **일일 요청 한도 소진**으로 `/api/*`가 빈 본문 **405**(정적 폴백)를 돌려주고, UTC 자정 = **09:00 KST**에 한도가 다시 열린다.
- **증상**: 로그인 화면이 `response.json()` 실패로 **"서버 응답 형식이 올바르지 않습니다. API 배포를 확인하세요."** 를 빨갛게 띄웠다(이용자에게는 고장으로만 보임). 08:00 KST 실측 `POST /api/account` → 405·본문 0바이트, `version.json`은 200(`c3195acc2081`).
- **점검 배너**(`src/ui/login.ts`·`src/styles/login.css`): `MAINTENANCE_UNTIL = Date.parse('2026-11-21T09:00:00+09:00')`, `inMaintenance(now?)`, `maintenanceBannerMarkup(now?)`. 로그인 패널의 제목·부제 아래·탭 위에 `.maintenance-banner`(`🛠️ 서버 점검 안내` / `오늘 오전 9시까지 서버 점검 중입니다. 9시 이후 정상 이용 가능합니다.`) — 어두운 갈색 그라데이션 + 왼쪽 주황 띠 3px, 700px 이하 화면에서는 여백·글자 크기를 줄인다. **시각으로만 판단**하므로 09:00이 지나면 **배너를 내리는 코드·타이머 없이** 화면에서 사라진다(추가 배포 불필요).
- **API 폴백 안내**(`accountRequest`): `response.status === 405` 또는 본문이 JSON이 아니면 빨간 개발자용 문구 대신 **"현재 서버 점검 중입니다. 오전 9시 이후 다시 이용해 주세요."** 를 `login-error.is-notice`(주황 `#f3cd93`) 톤으로. 점검 시각이 지난 뒤 같은 상황이면 "현재 서버 점검 중입니다. 잠시 후 다시 이용해 주세요."(9시를 더 이상 말하지 않음). `NoticeError` 표시는 `fail()`이 그대로 읽어 색만 바꾼다 — 정상 응답·진짜 서버 오류(`400` JSON) 문구는 덮지 않는다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/login-maintenance.test.mjs` **7/7**(09:00 경계·배너 문자열/자동 소멸·안내 문구·빈 405·HTML 본문·정상/진짜 오류 비간섭·CSS 규칙), `npm run build` 통과(`NODE_OPTIONS=--max-old-space-size=1400`).
- **실브라우저 검수**: 브랜치 프리뷰(`feat-242-maintenance-notice.djrpg.pages.dev`, `4c14b0c91ad9`)와 **운영**(390×844, 실제 빌드 번들·CSS)에서 배너 표시 확인. 운영에서는 브라우저에 남은 토큰의 자동 복원이 405를 받아 아래 alert에 주황 점검 문구가 함께 떴다. 검수 이미지 `downloads/djrpg_maintenance_notice_v1.png`(운영)·`downloads/djrpg_maintenance_notice_preview_v1.png`(프리뷰).
- **머지·배포**: [PR #244](https://github.com/songduckjin/DJRPG/pull/244) 스쿼시 `c37ad1628245`, 운영 `version.json` `c37ad1628245`(`builtAt` 2026-11-20T23:02:18Z = 08:03 KST)·루트 200. 배포 번들 `assets/index-BwqtjNXz.js`에 배너 클래스·세 안내 문구, CSS `assets/index-Be2jMXp2.css`에 `.maintenance-banner{…border-left:3px solid #e8a94e…}`·`.login-error.is-notice{color:#f3cd93}` 확인.
- **남은 것**: 사용자 폰에서 로그인 화면 실기 확인. **09:00 KST 이후 배너·9시 안내는 자동으로 사라지고**, API 한도가 초기화되면 평소처럼 로그인된다. 한도가 계속 막히면 "잠시 후 다시" 안내만 남는다(원인은 Cloudflare 무료 플랜 하루 10만 요청 소진 — 유료 전환이나 Functions 요청 절감이 근본 대책).

## 2026-11-21 · songduckjin 작업 241 — 가방·공용창고·거래소 업그레이드 초록 화살표(`▲`)

- **요청**: "내가 장착한템보다 좋은템들은 초록색 화살표 위로 표시 시안보여줘" → A안(`downloads/upgrade_arrow/opt_a.jpg`) 확정. 가방·공용창고·거래소 **전부**에서, 내 직업이 낄 수 있는 장비 중 지금 낀 것보다 좋은 것의 **아이콘 상자 우측 상단**에 초록 화살표.
- **판정은 한 곳**(`src/game/items.ts` `isUpgradeForHero(save,item)`): ① `isEquipment`(스킬북·보물 주머니 제외) ② `canWield(item, jobOrDefault(save.job))` — 타 직업 전용 무기(활·지팡이·대검)는 절대 표시하지 않는다(방어구·장신구는 세 직업 공용) ③ `itemPower` 비교 — **반지는 두 칸 중 약한 쪽(또는 빈 칸)**과 견주고, 나머지 부위는 빈 칸이면 `true`, 같은 부위를 끼고 있으면 더 강해야 `true`(같으면 바꿔도 이득이 없어 표시 안 함). `itemPower`가 [작업 238]의 추가옵션 몫(`extraOptionPower`)까지 더하므로 옵션이 좋은 템도 제대로 올라온다.
- **그림도 한 곳**(`src/ui/upgradeBadge.ts` — `upgradeArrowMarkup`·`upgradeArrowNode`·`appendUpgradeArrow`): 색 `#34eb6e`, 어두운 `text-shadow` 외곽선, `position:absolute; top:2px; right:2px`, `pointer-events:none`. 좌상단 타직업 배지·우하단 `+N`과 겹치지 않게 우측 상단만 쓰고, 잠금 배지가 같이 있는 칸은 `.bag-item.has-upgrade .bag-lock-badge`가 잠금만 아래로 내린다.
- **적용 3곳**: ① 내 정보 가방(`equipModal.ts` `renderInventory`) ② 공용창고(`warehouseModal.ts` `paintGrid` — **창고·내 가방 양쪽**, 접속 캐릭터 기준) ③ 거래소(`marketModal.ts` `icon(item, save?)` — 판매 중·거래 완료·내 거래 목록, 수령함, 판매 등록 칸. `최근 거래` 탭과 구매 비교 패널은 이미 성사된 기록/비교표라 제외).
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/upgrade-badge.test.mjs` **8/8**(빈 슬롯·같은/약한/강한 장비·타직업 무기 3종 제외·스킬북/주머니 제외·반지 두 칸 약한 쪽 비교·빈 반지 칸·등급 가중·세 화면 배선·CSS 좌표), 전체 `node --test tests/*.test.mjs` **992건 중 989 통과**(실패 3건은 `06bbf92`에서도 동일한 기존 건 — `costume-field-render` 2·`skillbook-server` 1), `npm run build` 통과(이 컨테이너는 RAM 3.5GB·데이터 상한 2GB라 `NODE_OPTIONS=--max-old-space-size=1400`이 필요했다).
- **실브라우저 검수**: 브랜치 프리뷰에 검수용 페이지를 잠시 올려 **실제 빌드 번들·실제 CSS**로 390×844에서 네 화면을 캡처했다(`/api/*`만 가짜 응답 — 계정·가방 8종·창고 4종·거래소 5건·수령함 2건). 업그레이드 3종(심연의 뿔투구·불멸의 각반·군주의 반지)에만 화살표가 떴고 **같은 방어력 투구·더 약한 장비·궁수/마법사 전용 무기·스킬북에는 뜨지 않았다**. 창고(패왕의 성검·미스릴 아머)·거래소(용살자의 대검·성기사 풀플레이트·낡은 부츠=빈 신발 칸)·수령함(불멸의 왕관·천 장갑=빈 장갑 칸)도 같았다. 검수 페이지는 확인 뒤 삭제(레포에 남기지 않음). 검수 이미지 `downloads/djrpg_upgrade_arrow_v1.png`.
- **번호 조정**: 등록 시점 최신은 236이었으나 그 사이 237(사과 보상 우편)·238(추가옵션)·239(다캐릭터 거래소)·240(스킬 추천 장착)이 먼저 올라와 **241**로 정리했다(이 때문에 PR #239는 닫고 #241로 다시 올렸고, 브랜치 이름만 `feat/240-upgrade-arrow`로 남아 있다).
- **머지·배포**: [PR #241](https://github.com/songduckjin/DJRPG/pull/241) 스쿼시 `caccb0daa02c`. 운영 `djrpg.pages.dev` `version.json` `caccb0daa02c`(`builtAt 2026-11-20T18:24:23.070Z`)·루트 200, 배포 번들 `assets/index-DpKhMUkD.js`에 `.upgrade-arrow`, `assets/index-B8qoA91C.css`에 `.upgrade-arrow{…top:2px;right:2px…color:#34eb6e…}`·`.market-icon{…position:relative…}` 포함 실측.
- **남은 것**: 사용자 실기 확인(가방·공용창고·거래소에서 실제 사냥 템에 화살표가 뜨는지, 크기·가독성).

## 2026-11-21 · songduckjin 작업 240 — 스킬창 `추천 자동 장착` + 패시브 스킬 노출 개선

- **요청**: 사용자 제보 "패시브 스킬 스킬 창에 안 나오는 현상 있는거같아" + 요청 "보유 스킬 추천 자동 장착". 두 가지를 한 작업으로 처리했다.
- **왜 안 보였나**: `skillModal.ts`의 화면 순서가 `스킬북 → 기본 공격 → 장착 중 → 액티브 8종 → **패시브 3종**` 이라, 390px 폰에서 패시브 카드는 스크롤을 한참 내려야 나왔다(실측: 수정 전 패시브 영역 y≈1,700px). 누락은 아니었고 **맨 아래**였는데, 사용자에게는 "안 나온다"로 보였다.
- **패시브 노출**(`src/ui/modals/skillModal.ts`·`src/styles/modals.css`): 화면 순서를 **패시브 3종 → 액티브(기본 공격·장착 중·8종) → 스킬북**으로 바꿨다. 상단에 `전체 / 액티브 / 패시브` 탭을 두어(기본 `전체`) 한 종류만 볼 수 있고, `전체`에서도 패시브가 스킬북·기본기보다 위라 어떤 상태에서도 놓치지 않는다. 머리글 `패시브 스킬 · N/3 습득` + 안내 `패시브는 장착 없이 습득하면 항상 적용됩니다.` 추가. 탭 상태는 **보기 상태**라 창을 닫으면 `전체`로 돌아간다(`ui.skillFilter`·`ui/modalDefaults.ts`) — 기기에 저장하지 않는다.
- **추천 자동 장착**(`src/game/loadout.ts`): `autoEquipRecommendedSkills(save) → { changed, equipped, message }`. ① `save.learned` 중 **그 직업 액티브만** 대상(미습득·다른 직업 스킬 제외 — 퀵슬롯은 원래도 그 직업 스킬만 인정한다) ② 직업별 순위 표 `recommendedLoadouts` = 핵심 광폭 버프 1개 + 고위력·광역·연타 2개 — 전사 `warcry`→`hell`·`power`·`destroy`·`crushing`·`spin`·`slam`·`slash2`, 궁수 `hawkEye`→`stormVolley`·`arrowRain`·`snipe`·`pierceShot`·`multiShot`·`iceArrow`·`doubleShot`, 마법사 `arcaneShield`→`arcaneOverlord`·`meteorStrike`·`manaBurst`·`chainLightning`·`fireBolt`·`iceBolt`·`frostNova` ③ 순위 점수(앞자리 10·9·8…)에 **실제 전투와 같은 `skillDamageScale(level)`**(1 + (레벨-1)×10%)을 곱한다 — 오래 강화한 아래 순위 스킬이 위로 올라온다(레벨 21 = 3.0배, `slash2`가 `destroy`를 앞지르는 것을 테스트로 고정) ④ 3개 미만이면 채운 만큼만 앞 칸에 넣고 나머지는 `null`, 0개면 세이브를 건드리지 않고 안내만(`보유한 액티브 스킬이 없습니다…`) ⑤ 같은 조합(같은 순서)이면 `changed: false` — 불필요한 저장을 만들지 않는다.
- **버튼 동작**: 상단 `.skill-auto-equip`을 누르면 다른 스킬 조작과 같은 잠금 가드(`world.paused`·`market.busy`·`sync.locked`)를 거쳐 `autoEquipRecommendedSkills` → `world.onChange()`(저장·HUD·스킬창 재렌더) → `ui.message()` 토스트. 토스트 문구 예: `추천 조합으로 장착했습니다: 블러드 레이지 · 파워 스트라이크 · 디스트로이 스윙`.
- **순환 참조 회피**: `store.ts`가 `loadout.ts`를 import하므로 `loadout.ts`에서 `store.ts`의 `skillLevel`을 런타임으로 부르면 순환이 된다 — 스킬 레벨은 `save.skillLevels[id]`를 직접 읽는 `savedSkillLevel`로 처리했다(정규화 규칙은 `skillLevel`과 같다).
- **CSS 클래스 함정(검수에서 잡음)**: DOM은 `passive-skill-card`인데 처음 CSS를 `.skill-passive-card`로 적어 규칙이 안 먹었고(`getComputedStyle`이 `normal`), 카드 안 `미습득 (스킬북 파밍 필요)`가 `필/요`로 단어 중간에서 끊겼다. `.passive-skill-card, .skill-passive-hint { word-break: keep-all; overflow-wrap: break-word }`로 고쳐 단어 단위로만 접히게 했다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/skill-auto-loadout.test.mjs` **10/10**(직업별 3칸·미습득/타직업 제외·3개 미만·0개·레벨 가산점·같은 조합·패시브 3종 순서·탭·버튼 잠금/실행·CSS 규칙), 관련 회귀(`skill-ui`·`loadout`·`skill-progression`·`bag-job-books`·`modal-ui`·`character-card-actions`) **48/48**, 전체 `node --test tests/*.test.mjs` **996건 중 993 통과**(실패 3건 = `costume-field-render` 2·`skillbook-server` 1 — `origin/main` 7115b7d 워크트리에서도 동일), `npm run build` 통과(이 환경 메모리 부족으로 `vite:reporter`·`prepareOutDir`가 간헐 OOM — `NODE_OPTIONS=--max-old-space-size=1536`으로 재시도해 통과).
- **실브라우저 검수**(Playwright chromium, 390×844, 실제 빌드 번들 + `/api/account` 가짜 응답 서버): 스킬창을 열면 상단 `추천 자동 장착` 버튼(132×34)·`전체/액티브/패시브` 탭이 한 줄에 들어가고, **패시브 3종이 y 303~508px(화면 844px) 안**에 모두 보인다. 버튼을 누르면 3칸이 `warcry·power·destroy`로 채워지고 '장착 중' 그룹·HUD가 함께 갱신되며 토스트가 `추천 조합으로 장착했습니다: 블러드 레이지 · 파워 스트라이크 · 디스트로이 스윙`. `패시브` 탭은 3종만, `액티브` 탭은 8종+기본기만 그린다. 검수 이미지 `downloads/djrpg_skill_modal_auto_passive_v1.png`·`downloads/djrpg_skill_modal_auto_passive_equipped_v1.png`·`downloads/djrpg_skill_modal_auto_passive_tab_v1.png`.
- **번호·머지**: 등록 시점 최신은 237이었으나 그 사이 238(장비 추가옵션, PR #233)·239(다캐릭터 거래소, PR #236)가 먼저 머지되어 **240**으로 올렸다. 238로 올렸던 PR은 닫고 [PR #240](https://github.com/songduckjin/DJRPG/pull/240)으로 다시 만들었으며, 브랜치 `feat/240-skill-auto-loadout`은 API 권한 제한으로 원격 삭제가 안 되어 남아 있다(코드 영향 없음). 스쿼시 병합 `37ba7c29382c`, 운영 `djrpg.pages.dev` `version.json` `37ba7c29382c`(`builtAt` 2026-11-20T18:12:39Z)·루트 200, 배포 번들 `assets/index-B2FPSmIE.js`에 `추천 자동 장착`·`이미 추천 조합이 장착되어 있습니다`·`보유한 액티브 스킬이 없습니다`·`패시브 스킬 · `·`skill-top-bar`·`skill-auto-equip`·`skill-filter-tab` 각 1건, CSS `assets/index-CCm6t6RJ.css`에 `.skill-filter-tab[aria-selected=true]`·`.passive-skill-card,.skill-passive-hint{word-break:keep-all…}`·`.skill-passive-section` 확인.
- **당시 운영 장애(이 작업과 무관)**: 배포 직후 `djrpg.pages.dev`의 `/api/*`가 전부 405(`/api/account`·`/api/market`·`/api/dungeon`·`/api/world-boss`·`/api/journey`)로 Functions가 서비스되지 않아 운영 로그인 실측은 하지 못했다. 작업 239 기록(17:58)에도 같은 405가 남아 있고 `Workers Builds: djrpg`는 `main`에서부터 계속 실패다 — 클라이언트 전용 변경이라 이 장애와는 별개다.

## 2026-11-21 · songduckjin 작업 239 — 다캐릭터(1·2·3번) 거래소 오류 전수 점검·수정

- **요청**: "내가 가진 다른캐릭들도 거래소 사용할때 오류 없게 만들어줘". 거래소는 **계정 공용**(매물·내 거래·수령함·판매 한도·골드)이고 가방·착용·소유권은 **캐릭터별**이라, 2·3번 캐릭터로 갈아탄 뒤 등록·취소·구매·수령·조회가 어떤 경계에서 깨지는지 서버·클라이언트를 함께 점검했다.
- **서버는 대부분 정상이었다(실제 libSQL DB로 확인)**: ① 1번 캐릭터가 올린 매물을 2번 캐릭터로 취소→수령→저장→재등록 ② 2번 캐릭터가 산 물품을 2번 가방으로만 수령(1번 저장과 섞이지 않음) ③ 판매대금은 계정 공용이라 어느 캐릭터로 받아도 같은 금화 ④ 낡은 `characterSlot`/`revision`은 `CHARACTER_CONFLICT`/`SAVE_CONFLICT` ⑤ 다른 캐릭터의 진행 세이브를 들고 온 요청은 `ITEM_CONFLICT`로 막히고 서버 세이브는 그대로 — 전부 통과했다(신규 `tests/multi-character-market.test.mjs` 6건). `djrpg_character_item_owners`는 등록 시 `slot=0`(거래소 보관), 수령 시 **현재 접속한 캐릭터**로 이관되고, 창고도 예치 `0`/인출 현재 슬롯으로 같은 규칙을 지킨다.
- **실제 결함 ①(가장 큼) — 전환 중에 날아간 거래·창고 응답이 새 캐릭터 화면을 덮었다**: `SaveSync.mutate`/`transferWarehouse`는 응답의 `save`·`revision`을 무조건 `this.save`에 덮는다. 응답을 기다리는 사이 캐릭터를 바꾸면 **옛 캐릭터의 세이브가 새 캐릭터 화면에 남고** `this.revision`도 옛 값으로 되돌아가, 다음 자동 저장이 `409 SAVE_CONFLICT` → "다른 탭이나 기기에서 진행 상황이 변경되었습니다" 전체 잠금으로 끝났다. 요청을 시작할 때의 `characterSlot`을 기억해 두고(`slotAtStart`), 응답 시점에 슬롯이 달라졌으면 **세이브·revision을 적용하지 않고** 거래 대기만 풀며 "캐릭터가 바뀌어 이전 거래 결과를 화면에 반영하지 않았습니다"로 알린다.
- **실제 결함 ② — 전환하는 동안 자동 저장이 revision 경계를 넘었다**: `selectCharacter`는 revision을 +1 하는데, 전환 중에도 사냥이 계속돌아(`world.paused=false`) 처치→`queueSave`→전환 직전 revision으로 저장이 나가 `SAVE_CONFLICT`가 될 수 있었다. `sync.beginSwitch()`가 예약 저장을 취소하고 사냥을 멈추며(`onPause(true)`), `queueSave`는 전환 중에는 예약하지 않는다. 전환이 끝나면(`finally`) `endSwitch()`가 다시 돌린다.
- **실제 결함 ③ — 거래 대기(`pendingMarket`)가 전환 뒤에도 남았다**: `Interface.open`은 `pendingMarket`이 있으면 **모달조차 닫지 않아**, 전환 후 캐릭터 창이 그대로 남고 거래소 버튼도 계속 잠겼으며 '거래 결과 다시 확인'은 옛 revision으로 나가 409가 됐다. `applyCharacterSwitch`가 `sync.resetForCharacterSwitch()`(대기·저장 스냅샷·창고 복구 타이머·dirty 정리)를 부르고, 전환 전에는 `sync.trading`(진행 중 거래·대기)이면 **전환을 막고** 무엇을 먼저 하면 되는지(`거래 결과 다시 확인`) 알린다.
- **실제 결함 ④ — 이전 캐릭터의 거래소 등록 선택·시세가 남았다**: `Market.resetForCharacterSwitch`가 등록 탭에서 고른 아이템·입력 가격·최근 거래가·펼친 상세·오류 문구만 버리고, **계정 공용 데이터(`Market.data` — 수령함·판매 한도·내 거래)는 유지**한다(비우면 수령함 배지가 사라진다).
- **문구**: ① 계정 공용이라 **다른 캐릭터로 올린 내 매물**도 `OWN_LISTING`으로 막히는데 "본인 매물은 구매할 수 없습니다"는 캐릭터를 바꿔 쓰는 계정에 오해를 줬다 → "내 계정이 등록한 매물입니다(다른 캐릭터로 올린 매물 포함). 등록을 취소하면 수령함에서 받을 수 있습니다." ② 캐릭터 소유 충돌 `ITEM_CONFLICT`에 "그 캐릭터로 접속해 사용하세요"·"1번 캐릭터로 한 번 저장한 뒤 다시 시도하세요" 안내 ③ 단건 수령 문구에 받은 캐릭터 이름(`알파2의 가방으로 받았습니다`) — 어느 캐릭터로 들어갔는지 화면에서 바로 확인된다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/multi-character-market.test.mjs` **7/7**(1번→2번 전환 후 등록·취소·구매·수령·재등록·판매대금 전 구간 + 낡은 슬롯·revision 거절), `tests/character-switch.test.mjs` **10/10**(전환 시 대기 정리·경합 응답이 새 세이브를 덮지 않음·전환 중 저장 중단·거래소 선택 초기화 4건 추가), 관련 11파일 **135건** 통과, 전체 `node --test tests/*.test.mjs` **997건 중 994 통과**(실패 3건은 `main`에서도 같은 `costume-field-render` 2·`skillbook-server` 1), `npm run build` 통과.
- **머지·배포**: [PR #236](https://github.com/songduckjin/DJRPG/pull/236) 스쿼시 `88c078ac8872`(Cloudflare Pages 체크 SUCCESS, `main`이 `ab16fd4`(작업 238)로 앞서 있어 리베이스 — `docs/WORKLOG.md` 충돌만 두 기록을 모두 남겨 해결). 운영 `https://djrpg.pages.dev/version.json` = `88c078ac8872`(`builtAt` 2026-11-20T17:58:36.886Z`, 루트 200)로 반영 확인. 배포 번들 `assets/index-DJE1X5Fw.js`(754,850B)에 `beginSwitch`·`endSwitch`·`resetForCharacterSwitch`·`resetView`·`캐릭터가 바뀌어 이전 거래 결과를 화면에 반영하지 않았습니다`·`거래 결과를 확인하지 못한 요청이 있습니다`·`캐릭터를 바꿔 주세요`가 들어간 것을 실측했다.
- **확인하지 못한 것(기존 장애)**: 이 시각 운영 `https://djrpg.pages.dev/api/*`가 **전부 405(본문 없음)**이고 `GET /api/account`는 SPA HTML 폴백을 돌려준다 — 이 배포에 Pages Functions가 붙어 있지 않다. 로그인 화면에도 `서버 응답 형식이 올바르지 않습니다. API 배포를 확인하세요.`가 뜬다. 11-20 12:03~17:54 프리뷰 배포를 포함해 확인한 모든 배포가 같아 **이번 변경이 원인이 아니며**, 같은 장애를 작업 238이 먼저 보고했다. 그래서 서버 문구(`OWN_LISTING`·`ITEM_CONFLICT`·수령 안내)는 운영에서 실측하지 못했고 테스트로만 확인했다. Cloudflare Pages 프로젝트 설정(Functions 포함 여부·빌드 구성)은 보관함에 Cloudflare 자격 증명이 없어 대시보드에서 확인해야 한다.
- **남는 것**: 폰 실기에서 2·3번 캐릭터로 거래소를 쓰는 확인은 사용자 몫이다(특히 전환 직후 등록 탭·수령함). 캐릭터별 소유권 기록이 없는 아주 오래된 아이템은 2·3번 캐릭터에서 `ITEM_CONFLICT`로 막히는데(1번에서 한 번 저장하면 기록이 채워진다) 운영 계정에서 실제로 나오는지 확인하지 못했다.

## 2026-11-21 · songduckjin 작업 238 — 에픽·유니크·전설 장비 추가옵션(보조 옵션) 시스템

- **요청**: 사용자 확정 스펙 — 에픽 1 · 유니크 2 · 전설 3개(일반·매직·레어 0), 9종(체력회복력·추가 데미지·피흡·공격력·치명타·방어력·체력·회피율·공격속도) 1~3%, 한 아이템 안 중복 없음. **새로 드롭되는 장비뿐 아니라 이미 지급된 에픽·유니크·전설 장비(가방·장착·공용창고·거래소)에도** 임의의 옵션이 붙어야 한다(DB 전수 수작업 없이).
- **결정적 배정(`src/game/extraOptions.ts` 신규)**: 옵션을 저장값이 아니라 **아이템 `id`의 FNV-1a 해시 → mulberry32**로 뽑는다. 같은 id면 로드·가방·장착·창고·거래소·서버 어디서 계산해도 같은 1/2/3개가 나오므로, 기존 장비에 `migrateItem`(세이브 파싱)만 거치면 옵션이 붙고 플레이어 화면·서버 계산이 어긋나지 않는다. 풀 순서(`extraOptionKeys`)와 해시·값 범위는 **바꾸면 기존 장비 옵션이 통째로 달라지므로** QUICK_PATCH 금지 항목에 적었다. `extraOptionsFor`는 저장값이 규칙(개수·허용 키·1~3 정수)에 맞으면 그것을, 없거나 어긋나면 id로 다시 뽑는다. 새 드롭(`rollEquipment`)은 같은 함수로 옵션을 달고 나온다.
- **스탯·전투력**: `totalStats`가 `attackPct`·`defensePct`·`healthPct`를 **모든 보정이 끝난 최종값**에 곱하고 `critPct`·`speedPct`를 기존 `치명`·`공속` %에 더한다. `itemPower`에 `extraOptionPower`(1%당 1~3점 가중)를 더해 **자동 장착·`▲ 업그레이드`(`salvageUpgrades`)·분해 보호**가 옵션까지 비교한다. 등급 1단계(+2)를 뒤집지 않을 만큼의 가중치다.
- **전투(`world.ts` — 던전·월드보스 연습도 같은 `World`를 쓴다)**: ① **회피율**은 적이 때릴 순간(피격 주기 0.85초에 한 번) `random()`으로 굴려 성공하면 피해를 통째로 무시하고 `회피` 라벨을 띄운다 — 합산 **상한 30%**, 프레임마다 굴리지 않아 연속 회피로 무적이 되지 않는다. ② **체력회복력**은 **5초마다** 최대 체력의 N%(합산 상한 12%) — 체력이 가득이면 타이머를 비운다. ③ **피흡**은 가한 피해의 N%(합산 상한 15%, 한 타격당 최대 체력의 4%). ④ **추가 데미지**는 최종 피해에 N%. 회복은 `+N` 초록, 회피는 `회피` 파랑 라벨(`render/vfx.ts` — `Effect.kind='heal'/'evade'`는 그림 없이 라벨만, `skillFeedback`은 스킬 버튼을 깜빡이지 않는다). **월드보스 연습**의 회피는 세션 시드(`seededRandom(0x5eed)`)로 고정해, 서버 `replayBoss`가 같은 클래스를 다시 돌려도 같은 순서의 회피를 본다.
- **서버**: `server/extra-options.mjs`(신규)가 클라이언트와 **같은 식**을 순수 JS로 갖는다(`save-guard.mjs`는 ts 로더 없이 도는 스크립트가 쓰므로 TS를 import할 수 없다 — 상수 사본처럼 테스트가 두 구현을 id별로 대조). `reconcileItems`·`endpoints/warehouse.mjs`가 저장·보관·꺼내기 때 `normalizeExtraOptions`로 **id에서 다시 계산해 덮어쓴다** — 클라이언트가 값을 조작해도 남지 않고, `ITEM_CONFLICT` 교착도 없다(`identity`/`sameItemBody`는 옵션을 보지 않는다). `itemValid`·`itemWithinBounds`·`extraOptionsWithin`은 등급별 개수·허용 키 9종·1~3 정수를 검사한다.
- **화면**: 가방·장착 hover 상세(`itemDetail`·`equippedDetail`)와 공용창고 상세에 `✨ 체력회복력 +2%` 1~3줄, 거래소 목록에 `market-options item-extra` 한 줄, `내 정보` 스탯 표 아래 `✨ 회피율 6% · 피흡 3% …`(상한 적용 값). CSS는 `.item-extra`(보랏빛)·`.equipment-info-extras`·`.warehouse-extra`.
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과(TSC + `verify-item-art` + vite, 753.21 kB). 신규 `tests/extra-options.test.mjs` **19/19** — ① 등급별 개수·9종 1~3%·중복 없음·결정성·서버 식 일치 ② 기존 세이브(장착·가방) 자동 부여·저장값 유지/재계산·새 드롭 ③ % 스탯 최종값 곱·치명·공속 합산·상한 30/12/15 ④ 전투력·자동 장착 ⑤ 추가 데미지·피흡(4% 상한)·회피 성공/실패·5초 회복 실전 동작 ⑥ 월드보스 연습 재현성 ⑦ `save-guard` 통과/거부 ⑧ 임시 DB 왕복에서 서버가 조작값을 덮어씀 ⑨ 상세 화면 `✨` 줄 ⑩ 같은 시드의 던전 5층 보스 클리어가 추가 데미지로 더 빨라짐. 전체 `node --test tests/*.test.mjs` **1003건 중 1000 통과**(4묶음 실행) — 실패 3건(`costume-field-render` 남/여·`skillbook-server` `hell` 이름)은 `06bbf92`(main)·`b78d14e`에서도 동일하게 재현되는 기존 실패다.
- **배포**: [PR #233](https://github.com/songduckjin/DJRPG/pull/233) 스쿼시 `1cf9f7a6f8d0`(Cloudflare Pages 체크 SUCCESS — `Workers Builds: djrpg`는 이 저장소 상시 실패). 도중 `main`이 237(사과 우편)로 앞서가 TASK.md를 최신 `main` 기준으로 리베이스했다. 운영 `https://djrpg.pages.dev/version.json` = `1cf9f7a6f8d0`(`builtAt 2026-11-20T17:43:04.007Z`), 루트 200, 배포 번들 `assets/index-DFR7fgUL.js`(753,005B)에 `extraOptions`·`체력회복력`·`회피율`·`lifestealPct`·`item-extra`·`equipment-info-extras` 포함 확인.
- **남는 것**: ① `치명타`(`critPct`)는 기존 `치명` 스탯처럼 **표시 전용**이다 — 전투에 크리티컬 판정 자체가 없다(넣으려면 던전 리플레이·밸런스 계약을 함께 손대는 별도 작업). ② 값 범위(1~3%)·상한(회피 30%·회복 12%/5초·피흡 15%·타격당 4%)은 확정 스펙 안에서 정한 밸런스 보충값이라, 실기에서 회피·피흡이 과하면 `effectiveExtraOptions` 상한만 조정하면 된다. ③ iOS 실기에서 옵션 줄 표시·실제 회피/회복 연출 확인은 사용자 몫.

## 2026-11-21 · songduckjin 작업 237 — 서버 연결 불안정(503) 사과 보상 우편(무작위 보물 주머니 5개)

- **요청**: 503 서버 연결 불안정 장애를 겪은 이용자에게 사과 보상. 사용자 말 "서버 불안정 보상 주자 꾸러미상자인가 그 템 5개"(2026-11-21 01:10 KST) — 그 템은 `무작위 보물 주머니`다.
- **구현**(`server/journey-state.mjs`): 기존 공지 우편(`SEASON_NOTICE_ID`·`UPDATE_NOTICE_ID`·`DIAMOND_MAIL_ID`)의 `state.notices` + `state.mail` 중복 체크 패턴을 그대로 따랐다. `APOLOGY_MAIL_ID = 'apology-db-20261120'` · `APOLOGY_MAIL_UNTIL = Date.UTC(2026, 11, 4, 15, 0, 0)`(2026-12-05 00:00 KST, 2주) · `APOLOGY_MAIL_POUCHES = 5` · `grantApologyMail(state, now)`를 더하고 `advanceJourney`가 `grantSeasonNotice` 다음에 부른다.
- **우편 내용**: 제목 `서버 연결 불안정 사과 보상` · 발신 `운영팀` · 본문 `서버 연결 불안정으로 이용에 불편을 드려 죄송합니다. 사과의 마음을 담아 무작위 보물 주머니 5개를 보내드립니다.` · `gold 0` · `books 0` · `pouches 5` · `claimedAt null` · `read false` · `expiresAt` = 14일 뒤. 만료 시각을 넘겨 **처음** 접속한 계정에는 붙이지 않고(`UPDATE_NOTICE_UNTIL` 방식), 지급 이력을 `state.notices`에 남겨 수령·삭제·만료 뒤에도 다시 붙지 않는다.
- **수령 경로는 그대로**: `journey-claim`(`kind:'mail'`) → `server/journey.mjs` `rewards()`가 `pouches` 수만큼 `pouchItem(uuid)`를 가방에 넣는다(`slot:'pouch'`, 장비 40칸 미포함, `djrpg_item_owners`에 `inventory`로 기록). 별도 API·클라이언트 변경 없음 — 우편함 UI는 `pouches`를 이미 표시·수령한다.
- **테스트**(`tests/journey.test.mjs` 신규 2건): ① `서버 연결 불안정 사과 보상 우편은 계정마다 한 번만, 수령·삭제·만료 뒤에도 다시 붙지 않는다` — 제목·발신·본문·`pouches 5`·`gold 0`·`expiresAt`·`notices` 1회 기록, 재실행 중복 없음, 우편 삭제 뒤 재지급 없음, 만료 시각(`APOLOGY_MAIL_UNTIL`)에 처음 접속한 계정 미지급 ② `사과 보상 우편 수령으로 무작위 보물 주머니 5개가 한 번만 들어가고 재조회에 중복 지급되지 않는다` — 가방 주머니 5개(이름 `무작위 보물 주머니`·`kind:'pouch'`·서로 다른 id)·금화 불변·스킬북 0·`djrpg_item_owners` 5행·두 번째 수령 `NOT_AVAILABLE`·재조회에도 5개 유지. 기존 단언(우편 4통 → 5통, `notices` 순서, `tests/season-reset.test.mjs` 주머니 1 → 6개)을 함께 맞췄다.
- **검증**: `npx tsc --noEmit` 통과 · `node scripts/verify-item-art.mjs` 통과 · `npm run build` 통과 · `node --test tests/*.test.mjs` **986건 중 983 통과**(실패 3건은 `origin/main` `fe53231` 워크트리에서 그대로 재현되는 기존 실패 `costume-field-render` 남/여 2건·`skillbook-server` 1건). 리베이스 전 기준선은 965건 중 962 통과로 같은 3건이다.
- **번호**: 처음 **작업 235**로 등록하고 브랜치를 올렸으나, 그 사이 `main`에 **작업 235(방치 등반, PR #226)**·**작업 236(장착 칸 비율, PR #228)**이 먼저 병합되어 `docs/TASK.md`가 충돌했다. **237**로 다시 등록하고 `feat/237-apology-mail`로 rebase한 뒤 새 PR을 열었다(원 브랜치 `feat/235-apology-mail`은 푸시 실패로 원격에 남지 않았다).
- **배포**: [PR #231](https://github.com/songduckjin/DJRPG/pull/231) — Cloudflare Pages 체크 SUCCESS(`Workers Builds: djrpg`는 이 저장소 상시 실패) → 스쿼시 병합 `7115b7d4e9af`(2026-11-20T17:14:24Z). 운영 `https://djrpg.pages.dev/version.json` = `7115b7d4e9af`(`builtAt 2026-11-20T17:14:49.012Z`)·루트 200.
- **운영 실측**(새 게스트 계정 `POST /api/account {action:'guest'}` → `POST /api/market {action:'journey-list'}`): 우편함 4통 중 `apology-db-20261120` · `서버 연결 불안정 사과 보상` · `gold 0` · `books 0` · `pouches 5` · `expiresAt 1796396400000`(2026-12-05 00:00 KST) 확인 — 배포된 서버 코드가 실제로 이 우편을 내려준다. 수령(가방에 주머니 5개)은 게스트가 `GUEST_READ_ONLY`라 운영에서 확인할 수 없어 로컬 통합 테스트로만 검증했다.

## 2026-11-21 · songduckjin 작업 236 — 장착 10칸 아이콘이 가로로 늘어나던 문제(1:1 정비율 복구)

- **요청**: 실기 스크린샷(`attachments/2026-11-21/IMG_1144-59eabbefb7084c15a7310901ef745e04.jpg`, iOS Safari·`djrpg.pages.dev`)에서 `내 정보` 장착 5×2칸 아이콘이 가로로 늘어나(찌그러져) 보임 — "중간쯤 장착한 템들 너무 늘려트려져 보여 비율 조정해서 보여줘". 확정 시안 A안(`downloads/equip_slot_fix/opt_a_compact.jpg`): **칸 높이는 그대로 두고 아이콘만 1:1 정비율로**.
- **원인**: [작업 228]이 모바일 가방 노출을 위해 칸을 `.equipment-slot{aspect-ratio:auto;height:48px}`로 납작하게 만들면서 아이콘이 `width:100%;height:0;flex:1 1 auto`로 **칸 폭을 그대로 채우게** 되어 있었다. 장비 그림은 5칸 아틀라스(`item-art/*.png` 870×290, 한 칸 174×290)이고 배경이 `background-size:500% 100%`라, 390px 화면의 칸 상자(약 70×33)에 한 칸이 그대로 그려져 **가로로 1.6~3배** 늘어났다(`<img>` 아이콘은 `object-fit:contain` 덕에 무사 — 아틀라스 `span`은 `object-fit`이 안 듣는다).
- **칸 구조**(`src/styles/modals.css`): `.equipment-slot`의 `display:flex`를 **grid 두 줄**(`minmax(0,1fr)` 아이콘 · `auto` 라벨)로 바꿔 아이콘 영역 높이를 확정했다(퍼센트 높이가 흔들리지 않는다). `.slot-icon`은 `width/height:auto` + `max-width/max-height:100%` + `object-fit:contain`으로 상자 안에서만 줄고, `.slot-part`는 `grid-row:2`. 모바일 칸 높이(48/46px)·가방 최소 135px·테두리·라벨은 그대로.
- **아틀라스 아이콘**: `src/ui/slotArtStyle.ts`(신규) `slotAtlasStyle`이 `background-size`·`background-position`(퍼센트)과 그 상자의 `aspect-ratio`를 인라인으로 준다. 파일마다 **내용 상자**(물건이 든 부분)를 `scripts/build-item-art-trim.py`(신규)가 아틀라스 19장의 5칸 합집합으로 재서 `src/ui/itemArtTrim.generated.ts`(신규)로 만든다. 칸 경계에 닿은 변은 2px 물려 이웃 칸이 1~2px 비치는 것과 `290-h=0`으로 퍼센트가 깨지는 것을 함께 막는다.
- **왜 칸 전체 프레임(174:290)만 맞추지 않았나**: 그림은 안 늘어나지만 칸 안 여백이 30~55%라 투구가 20×33px로 너무 작아 보인다(첫 시도가 이랬다). 승인 시안처럼 칸을 채우려면 물건이 있는 상자만 그려야 한다 — 다른 물건과의 상대 크기는 원본 그대로다(반지는 크게, 활은 가늘게).
- **퍼센트 식**: `p_x=(frame·174+x)/(870−w)`, `p_y=y/(290−h)`, `size=(870/w, 290/h)·100%`. 배경 퍼센트가 `p·(상자−그림)`이라 상자 픽셀 크기가 약분돼 칸 크기와 무관하게 성립한다.
- **잡은 실수 두 건(테스트가 잡음)**: ① 배경 크기를 `174/w`(칸 폭 기준)로 잡아 다섯 칸이 한 칸에 겹쳐 보였다 → 아틀라스 전체 폭 `870/w`로 고치고, **배경 계산을 역산해 한 프레임의 내용 상자만 보이는지** 검사하는 테스트를 넣었다. ② 위치 분모를 `174−w`로 써 퍼센트가 2011%까지 튀었다 → `870−w`.
- **검증**: `npx tsc --noEmit`, 신규 `tests/equipment-slot-aspect.test.mjs` **10/10**(CSS 규칙·칸 높이 유지·아틀라스 규격 870×290·내용 상자 표 유효 범위·퍼센트 역산), 전체 959건 중 **956 통과**(실패 3건은 `origin/main` 워크트리에서도 동일한 기존 실패 — `costume-field-render` 2·`skillbook-server` 1), `npm run build` 통과(이 환경 메모리 부족으로 간헐 OOM → 재시도 통과, CI 빌드도 성공).
- **실브라우저 검수**: 프리뷰 배포(실제 컴파일 CSS·실제 아틀라스)에서 390×844·375×667 iframe을 실측 — 칸 70.4×48.0 / 68.2×46.0 그대로, 투구 27.3×32.6(비율 0.837 = 원본 0.838)·갑옷 26.9×32.6·장갑 28.7×32.6·신발 26.7×32.6·문장 25.1×32.6·목걸이 21.5×32.6·반지 32.4×32.6(0.993)·활 6.6×32.6(0.202), 빈 칸 `<img>` 32.6×32.6, **아이콘 비율 최대오차 0.000·라벨 겹침 0·상자 넘침 0**, 가방 영역 413.3px(390)/275.4px(375) 유지, 내용 상자 표와 그림 픽셀 대조 8종 전부 일치. 검수 이미지 `downloads/djrpg_equip_slot_aspect_v1.png`.
- **번호·머지**: `main`에 이미 231(유니크·전설 발광 강화, PR #225)이 등록되어 **236**으로 올렸고, 그 사이 `main`이 두 번 더 앞서가 TASK.md가 충돌해 최신 `main`(8104b0c) 기준으로 다시 올렸다(대체한 PR #224는 닫음). [PR #228](https://github.com/songduckjin/DJRPG/pull/228) 스쿼시 `9279bbbc8c8d`.
- **배포**: 운영 `https://djrpg.pages.dev/version.json` = `9279bbbc8c8d`(`builtAt 2026-11-20T17:02:42Z`), 배포 CSS `assets/index-B3ZOKGYE.css`에 `.equipment-slot{--slot-art-ratio:…;display:grid;grid-template-rows:minmax(0,1fr) auto;…}`·`.slot-icon{…object-fit:contain}`·모바일 `height:48px`/`46px`·`min-height:135px`, 배포 번들 `assets/index-DIsjnvO1.js`에 `aspect-ratio:${…}`·`helmet_0` 포함 확인. 로그인 화면 정상 로드(`Failed to fetch dynamically imported module` 없음).
- **남는 것**: iOS 실기(사용자 계정으로 10칸을 채운 화면) 확인은 사용자 몫이다. **가방 칸**(`.bag-item .item-icon.atlas-icon`)은 정사각 칸에 배경을 늘려 그려 검 모양이 세로로 늘어나 보이는 같은 문제가 남아 있다 — 이번 요청 범위(장착 10칸) 밖이라 손대지 않았다.
## 2026-11-21 · songduckjin 작업 235 — 방치(오프라인) 중에도 층 보스를 잡아 자동으로 층이 오른다

- **요청**: 사용자 "방치 해도 층수가 올라가도록 해줘 / 보스도전 따로 하지않아도 / 보스나와서 / 층수올라가게 / **켜놓고 보는사람과 방치하는사람 똑같아야돼**". 접속해서 켜 두면 목표 처치 수를 채울 때 보스가 저절로 나와 층이 오르는데(`world.ts` `kill()`·`update()`), 오프라인 정산(`offline.ts`)은 처치 수·보스 몫 금화/경험치만 더하고 `floor`·`maxFloor`는 건드리지 않아 방치하면 그 층에서 멈춰 있었다.
- **`offlineBossBattle(save, floor)`**(신규): 지금 스펙으로 그 층 보스를 **죽지 않고** 잡을 수 있는지 판정한다. 내 DPS = 평타(`공격력 × 1.6 / cooldowns.attack / (1 + 공속/100)`) + 퀵슬롯 스킬(`skillBurst` 위력 × `skillDamageScale(레벨)` / 쿨타임, 24종 표) × 버프 가동률(`warcry`·`hawkEye`·`arcaneShield`의 `berserkAttackScale × berserkSpeedScale`을 지속/쿨타임만큼). 보스 HP는 `enemyMaxHp(floor, true)`, 보스 피해는 `enemyHitDamage(floor, true, 방어)`를 **0.85초에 한 번**(`world.ts`가 맞은 뒤 `player.hit = .85`)으로 보고, 보스가 걸어 들어오는 2초와 여유 10%(`BOSS_SAFETY_MARGIN .9`)를 둔다. 이기면 걸리는 시간은 처치 시간, 지면 쓰러지기까지의 시간이다.
- **`applyOfflineRewards` 정산 루프**: 초 단위 남은 시간을 `world.ts`와 같은 순서로 나눠 쓴다 — ① 자동 등반이 켜져 있고 최고 도달 층(`floor >= maxFloor`)이면 목표까지 채우고 ② 보스전 ③ 이기면 보스 금화 `70×층`·경험치 `(9+층)×6`·보스 드롭(`itemDropChance(floor, true)`)·`bossKills+1`·`floor+1`·`maxFloor` 갱신(상한 `MAX_FLOOR`)·`floorKills = 0`·`bossRetryFloor = 0` ④ 지면 10골드를 잃고 `floorKills = 0`으로 1마리부터 다시 잡는다(`autoClimb` 유지·`bossRetryFloor = floor` 기록 — 다시 켜도 `⚔ 보스 도전`이 산다). 층이 바뀔 때마다 분당 처치 수(`offlineKillsPerMinute`)를 다시 계산하고 `addExperience`도 구간마다 불러 레벨업이 다음 층 판정에 반영된다. 남은 시간이 보스전보다 짧으면 보상도 층 상승도 없이 **목표를 채운 채** 끝내 다음 접속에 보스가 서 있게 한다(접속 사냥과 같은 상태).
- **그대로 둔 규칙**: 아래층 반복 사냥(`floor < maxFloor`)에는 보스가 없다(작업 210). `autoClimb: false`면 층이 오르지 않고 진행도만 `(floorKills + kills) % target`. 마지막 층(20층)에서는 이겨도 층 없이 보스만 계속 잡는다(작업 204).
- **정산 창**(`ui/modals/offlineModal.ts`): `OfflineReward`에 `startFloor`·`endFloor`·`bossKills`·`deaths`를 더해 `.offline-floors` 줄에 `5층 → 8층 돌파! · 보스 3마리 처치`, 층이 멈췄으면 `보스에게 N번 져서 층이 멈췄습니다`를 보여 준다(`styles/modals.css` `.offline-floors`).
- **서버 검증**(`server/save-guard.mjs`): `MAX_FLOOR = 20`을 더하고 `clampSaveProgress`가 ① 처치·보스·플레이 시간 ② 층 상한(보스 1마리 = 1층, `MAX_FLOOR`까지) ③ **서버가 인정한 등반 층(`save.maxFloor`)으로 다시 계산한 금화 상한**(`rewardBudget`의 `depthOption` → `payout`) 순서로 본다. 시작 층 값으로만 계산하면 5층에서 8층으로 올라간 정당한 금화가 클램프로 깎인다. 반환값의 `budget`도 실제로 쓴 `payout`이다.
- **검증**: `npx tsc --noEmit` 통과, `node scripts/verify-item-art.mjs` 통과, `vite build` 통과. 신규 `tests/offline-climb.test.mjs` **7/7** — ① 강한 스펙 1시간 정산으로 `maxFloor`·`bossKills` 상승(층마다 목표를 새로 채운다) ② 약한 스펙은 그 층에 머물고 1번 패배·10골드 손해·`bossRetryFloor` 기록 ③ `autoClimb: false`면 층 고정 ④ 아래층 반복은 보스 없음 ⑤ 마지막 층은 층 없이 보스만 ⑥ 추정식이 실제 전투 상수(1.6배·공속 간격·0.85초)와 일치 ⑦ `save-guard`가 등반 세이브를 하나도 클램프하지 않고 금화·경험치 상한이 보상보다 크다. 기존 `offline`·`save-guard`·`floor-cap` 포함 24/24. 전체 `node --test tests/*.test.mjs` **972건 중 969 통과** — 실패 3건(`costume-field-render` 남/여 "코스튬 모드에서 통합 바디가 남아 있다", `skillbook-server` `hell` 이름)은 `b78d14e`·`9279bbb`(main)에서 그대로 재현되는 기존 실패다(112파일을 4묶음으로 나눠 실행).
- **배포**: [PR #226](https://github.com/songduckjin/DJRPG/pull/226) 스쿼시 병합 `fe53231ec897`(Cloudflare Pages 체크 SUCCESS — `Workers Builds: djrpg`는 이 저장소 상시 실패). 도중 `main`이 세 번 앞서가(`8f64cac` 작업 231 · `8104b0c` 기록 · `9279bbb` 작업 236) 리베이스를 반복했고, TASK.md 충돌은 새 작업 줄을 위에 두고 해결했다. 운영 `https://djrpg.pages.dev/version.json` = `fe53231ec897`(`builtAt 2026-11-20T17:04:07.083Z`, 루트 200), 배포 번들 `assets/index-BlI_6skY.js`(748,480B)에 `offline-floors`·`층 돌파`·`보스에게 ${deaths}번 져서 층이 멈췄습니다` 포함 확인.
- **남는 것**: 승패 경계 상수 3개(`BOSS_HIT_INTERVAL .85`·`BOSS_APPROACH_SECONDS 2`·`BOSS_SAFETY_MARGIN .9`)는 실기 데이터가 없어 전투식에서 도출한 추정이다. 실기에서 방치 등반이 너무 보수적(층이 안 오름)이거나 관대하면 이 값만 조정한다. 폰 실기에서 방치 → 정산 창 표시는 사용자 확인 몫.

## 2026-11-21 · songduckjin 작업 231 — 유니크·전설 장비 발광을 "훨씬 진하게" (색·세기 강화)

- **요청**: "유니크 전설 발광 진하게 강화" — [작업 218]의 숨쉬기 발광이 실기에서 너무 은은했다. 파형(0 → 최대 → 0)과 주기(유니크 2.6초·전설 2.3초)는 그대로 두고 **색·세기·겹 구성**만 올렸다.
- **톤 표**: 유니크 `#fb923c` peak 0.58 → **`#ff7a00` peak 0.92**, 전설 `#dc2626` peak 0.64 → **`#ef1a1a` peak 1.0**.
- **필드 3겹**: 한 겹으로는 "진한 색"과 "빛"이 같이 나오지 않는다(가산만 쓰면 밝은 금속이 노랗게 날아가고, 곱하기만 쓰면 어두워진다). 그래서 ① `multiply` = **원본 파츠 텍스처 + 등급색 tint**(명암·판금 경계 유지) ② `add` = **밝기 비례 발광 텍스처** ③ `add` = 같은 발광 텍스처를 1.12배로 키운 후광 — 세 겹이 같은 파동 세기를 공유한다. 발광 텍스처는 `glowGearTexture`가 파츠 텍스처 픽셀을 `min(1.25, .45 + 1.55·lum)` 배 등급색으로 바꿔 **1/3 크기** 캔버스에 굽고 72개 LRU 캐시에 담는다(프레임이 바뀔 때 0.3ms 수준, 메모리 수 MB).
- **광량 상한 1.25**: 처음엔 2.0까지 열었는데 주황이 노랗게, 빨강이 분홍으로 날아가 "진한 등급색"이 아니라 흰빛이 됐다. 채널 곱을 1.25로 묶어 색을 유지했다.
- **장착 화면**: 발광 레이어가 **몸 그림(z-index 1) 아래**에 있어 실루엣 밖 후광만 보이던 것을 몸 위(z-index 2)로 올리고, 등급색 `drop-shadow(0 0 7px var(--gear-color))`·`saturate(1.3) brightness(1.08)`·`shadowBlur = max(10, width·.045)`를 더했다. 갑옷 얼굴 도려내기(`destination-out`)와 목선 마스크는 그대로다.
- **잔상 분리**: 겹이 셋이 되며 잔상 복제(`cloneHeroLayers`)가 `blendMode !== 'add'`로 거르면 곱하기 겹이 잔상에 섞였다 — `GEAR_GLOW_LABEL`(`gear-glow`) 표식으로 바꿔 셋 다 뺀다.
- **검증**: `npx tsc --noEmit` 통과, 전체 `node --test tests/*.test.mjs` **950건 중 947 통과**(실패 3건은 `origin/main` 에서도 동일하게 실패하는 기존 건 — `costume-field-render` 2건·`skillbook-server` 1건), `npm run build` 통과.
- **실기 검수**: 실제 빌드 번들을 헤드리스 크롬(SwiftShader WebGL)으로 열고 `/api/account` 만 가짜 세션으로 응답해 **같은 장비(패왕의 성검·불멸의 왕관·패왕의 전갑)** 로 유니크·전설을 착용시켜 필드와 `내 정보` 장착 화면을 발광 정점 프레임으로 캡처했다 → `downloads/djrpg_gear_glow_boost_v1.png`(수정 전/후 6칸). 수정 전에는 검이 살짝 물드는 정도·장착 화면은 윤곽 후광만이었고, 수정 후에는 장비 전체가 등급색으로 타오르며 판금 경계·무늬가 남는다.
- **머지·배포**: [PR #225](https://github.com/songduckjin/DJRPG/pull/225) 스쿼시 `8f64cacdb949` → 운영 `djrpg.pages.dev` `version.json` `8f64cacdb949`(`builtAt 2026-11-20T16:54:06Z`) 확인. 운영 번들 `assets/index-CG3G5PNM.js`에서 `#ff7a00`·`#ef1a1a`(십진 16742912·15669786), `peak:.92`·`peak:1`, `gear-glow` 문자열을 확인했고, `Workers Builds: djrpg` 체크는 이전 Workers 설정 잔재로 여전히 실패 표시(실제 배포 경로는 Cloudflare Pages — 통과).
## 2026-11-21 · songduckjin 작업 234 — 좌상단 HUD 닉네임 이름판이 레벨 숫자를 가리던 문제(배지·이름판·HP·월드보스 세로 배치)

- **요청**: 실기 스크린샷(`attachments/2026-11-21/IMG_1143-1d9e57e1d7f546608ec5f5240e3df121.jpg`, iOS Safari·`djrpg.pages.dev`)에서 좌상단 **닉네임 이름판(`덕진`)이 레벨 배지 원 안으로 올라와 `LV` 아래 숫자(`4`)의 아래쪽을 가리는** 문제.
- **원인**: 작업 228이 넣은 `.hero-name`이 `left: 36px; transform: translateX(-50%); top: 40px`. `.level-badge`는 `left:12px; top:5px; width:49px; height:49px`(=원 5~54px)이고 레벨 숫자(`.level-badge b`)는 26~48px라, 높이 17px짜리 이름판이 40~57px에 걸쳐 숫자 아래 8px를 덮었다. `max-width: 74px` + 좌우 여백·테두리(총 86px)를 배지 중심(36px)에 가운데 정렬해 **16자 닉네임은 왼쪽 −7px까지 화면 밖으로** 나가는 문제도 함께 있었다.
- **수정** (`src/styles/hud.css`·`src/styles/world-boss.css`): 좌상단 세로 배치를 한 번에 다시 잡았다. `.hero-name`은 `left: 12px`(배지 왼쪽에 붙여 오른쪽으로만 신장)·`top: 56px`(배지 원 아래 2px)·`max-width: 76px`(총 76px, 16자 닉네임은 줄임표)로 내리고 `translateX(-50%)`를 없앴다. 그 아래로 `.health-bar` `top: 59px → 77px`, `.world-boss-entry` `top: 84px → calc(env(safe-area-inset-top, 0px) + 97px)`, `.tutorial` 배너 `calc(safe + 83px) → calc(safe + 173px)`. 월드보스 진입 버튼은 `.top-hud`와 달리 세이프 에어리어를 쓰지 않아 노치 기기에서 HUD만 내려가면 다시 HP를 덮었으므로 `.utility-nav`와 같은 기준으로 맞췄다.
- **실측(빌드 번들 + 가짜 세션, headless Chromium `deviceScaleFactor 2`)**: 375×667에서 배지 5~54 · 레벨 숫자 26~48 · 이름판 56~73 · HP 77~92 · 월드보스 97~167 · 튜토리얼 173~224(간격 2/4/5/6px). 레벨 1·4·9·12(1·2자리), 닉네임 2자(`진이`·`덕진`)·8자(`송덕진입니다`)·16자(`검은황야의방랑검객`), 튜토리얼 배너 표시 조합 모두 **겹침 0** — 390×844·360×640도 같다. 닉네임판 폭은 2자 30px·8자 65px·16자 76px(말줄임)이고 화면 왼쪽 밖으로 나가지 않는다.
- **테스트**: `tests/character-switch.test.mjs`에 「좌상단 HUD는 레벨 배지 → 닉네임 → HP → 월드보스 순서로 겹치지 않는다(작업 234)」 추가 — CSS 숫자로 `배지 top+height ≤ 이름판 top ≤ HP top ≤ 월드보스 top`을 검사하고, `.hero-name`에 `translateX(-50%)`가 돌아오면 실패한다.
- **검증**: `npx tsc --noEmit` 통과, `npm run build` 통과, `node --test tests/*.test.mjs` **949건 중 946 통과**. 실패 3건은 `main`(f3c3c28) 워크트리에서 그대로 재현되는 기존 실패(`costume-field-render` 남/여 "코스튬 모드에서 통합 바디가 남아 있다", `skillbook-server` `hell` 이름 불일치)로 이번 변경과 무관하다.
- **번호·브랜치**: 처음 **작업 230**으로 등록했으나 그 사이 같은 번호의 **필드 몹 원거리 랜덤 스폰**(PR #217)과 **작업 233**(머리 위 초록 체력바, PR #219)이 `main`에 병합되어 `docs/TASK.md`가 충돌했다. **234**로 다시 등록하고 브랜치를 `fix/234-hud-hero-name`으로 옮겨 rebase한 뒤 새 PR을 열었다(원 PR #220은 닫음, 원격 `fix/230-hud-hero-name`은 같은 번호 브랜치와 삭제 권한 403으로 남아 있다).
- **배포**: [PR #222](https://github.com/songduckjin/DJRPG/pull/222) 스쿼시 병합 `b78d14eeb72a`(2026-11-20T16:32:27Z, Cloudflare Pages 체크 SUCCESS — `Workers Builds: djrpg`는 이 저장소 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `b78d14eeb72a`(`builtAt 2026-11-20T16:32:53.400Z`)·루트 200. 배포 CSS `assets/index-BhRQyYWJ.css`(117,121B)에 `.hero-name{…left:12px;top:56px;…max-width:76px…}`·`.health-bar{…top:77px…}`·`.world-boss-entry{…top:calc(env(safe-area-inset-top,0px) + 97px)…}`·`.tutorial{…+ 173px…}`가 그대로 실려 있다.
- **검수 이미지**: `downloads/djrpg_hud_name_fix_v1.png` — 375×667 4조합(Lv 1·2자 닉네임 / Lv 12·2자리 레벨 / Lv 12·16자 닉네임 / Lv 4·튜토리얼 배너) 실브라우저 캡처. 전체 화면은 `downloads/djrpg_hud_name_fix_v1_full.png`.
- **남는 것**: iOS 실기(Safari·홈 화면 앱) 확인은 사용자 몫이다. 스크립트로 `env(safe-area-inset-top)`를 흉내 낼 수는 없어, 노치 보정은 `.utility-nav`와 같은 `calc()` 패턴을 쓰는 것으로만 확인했다.

## 2026-11-21 · songduckjin 작업 233 — 내 캐릭터 머리 위 초록 체력바

- **요청**: 확정 시안 `downloads/hp_orb/rec_1_hero_bar.jpg` 대로 **내 캐릭터 머리 바로 위(실제 머리 높이 기준)** 에 초록 체력바를 추가해 운영(`djrpg.pages.dev`)에 배포. 기존 상단 `.hp-pill`(HP 280/280)은 유지 — 화면 위쪽은 고정 수치, 캐릭터 위는 눈이 따라가는 게이지다.
- **새 파일 `src/game/render/heroHpBar.ts`**: 값·좌표·그리기를 한 곳이 소유한다. `HERO_HP_BAR` = 폭(화면 캐릭터 높이 × `.62`, 26~48px 클램프)·높이(폭 × `.18`, 최소 3px)·간격(캐릭터 높이 × `.10`, 최소 4px)·`hatLiftArtPx`(50 아트 px)·색(게이지 `#38b25c`·상단 하이라이트 `#9ce9b6` alpha .55·트랙 `#241714`·테두리 `#070505`). `heroHpRatio`가 `hp / max(1, totalStats(save).health)`를 0~100%로 클램프하고, `heroHpBarBox`는 그리지 않아야 할 때(체력 0 이하·상한 없음·캐릭터 높이 0·NaN) `undefined`를 돌려준다. `paintHeroHpBar`는 트랙 → 게이지 → 상단 하이라이트 → 1px 테두리 순서로 둥근 모서리(높이의 1/3)로 그린다.
- **머리 꼭대기 계산**: `drawHero` 끝에서 `drawHeroHpBar(this, world, bodyPx, hatLift)`를 부른다. 머리 꼭대기 = 이번 프레임 `heroLayer.position.y − bodyPx × heroLayer.scale.y` — `heroBodyPx`(시트별 머리~발 높이)와 그 프레임의 세로 배율을 쓰므로 서기·걷기(`walkAnchors`)·공격, 3직업 남녀, 갑옷·투구로 시트가 바뀌어도 같은 비율로 머리 위에 앉는다(몸 높이가 화면 높이의 `.0935`로 고정되는 `heroScale` 규칙 덕분에 바 위치도 모든 자세에서 같다).
- **관모 간격**: 마법사 고깔모자·후광은 셀 위로 솟는다 — 여성 파츠의 최대 상단이 셀 좌표 `-36`(정수리 14 기준 50px 위, `mage_helms/female_{0,3,4,5,6,7,8,9}`)라 착용 프레임만 `hatLiftArtPx` 50(화면 약 10px)을 더 띄운다. 전사·궁수 투구는 정수리 높이에 얹혀 기본 간격(6~7px)으로 충분해 0.
- **레이어**: `src/game/render.ts`에 `GameView.heroHpBar = new Graphics()`를 두고 스테이지에서 `effects`(몹 빨간 바·이펙트) 위, `labels`(보스·정예 이름표) 아래에 올렸다. `effects`는 `preferences.effects === 'low'`에서 alpha .4가 되므로 합치지 않았다 — 저효과 설정에서도 체력바는 또렷하다. 죽음·캐릭터 숨김(`layer.visible === false`·`alpha ≤ .05`) 프레임은 `clear()`만 해 이전 바가 남지 않는다.
- **시각 검수**: `scripts/preview-hero-hp-bar.mjs`가 게임 코드(`heroHpBar.ts`·`heroScale.ts`·`arena.ts`)에서 화면 390×700 기준 좌표·배율·색을 그대로 계산해 JSON으로 내리고, `scripts/preview-hero-hp-bar.py`가 `wasteland-ground` 위에 시트별 `heroBodyPx`·`heroScale`·앵커 `.97`(마법사 모자는 셀 `-44`, 전사 투구는 목 밑동 `(228, 89)`)로 합성한다. 결과 8칸 — 전사 남 서기 100%/50%, 전사 여 걷기 70%, 궁수 여 서기 100%, 궁수 남 공격 50%, 마법사 남 서기 35%, 마법사 여 고깔모자(female_7) 100%, 전사 남 투구(helm_7) 80%: **`downloads/djrpg_hero_hp_bar_v1.png`**(2배 확대 컷). 실제 게임 배율 1배 전체 화면 3컷(전사 100%·궁수 50%·마법사 고깔모자 100%)은 **`downloads/djrpg_hero_hp_bar_field_v1.png`**. 확인: 바가 머리·투구·고깔모자를 가리지 않고 6~10px 위에 뜨고, 50%에서 오른쪽 트랙이 남고, 걷기·공격 프레임에서도 간격이 유지되며, 1배에서도 게이지가 읽힌다.
- **검증**: `npx tsc --noEmit` 통과. 신규 `tests/hero-hp-bar.test.mjs` **11/11** — 비율 클램프, 죽음·상한 없음·높이 0에서 미표시, 머리 위 간격·중앙 정렬·폭 상하한, 3직업 남녀 × 서기·걷기·공격 × 화면 높이 667/700/844/932의 머리 위 간격, 관모 추가 간격(음수·NaN 무시), 그리기 순서·색·50%/100% 게이지 폭, `drawHeroHpBar`의 머리 꼭대기 계산, 죽음·숨김에서 지우기, 렌더러 배선(전용 레이어·스테이지 순서·`totalStats(save).health`). 전체 `node --test tests/*.test.mjs` **959건 중 956 통과** — 실패 3건(`costume-field-render` 남/여 "코스튬 모드에서 통합 바디가 남아 있다", `skillbook-server` `hell` 이름 불일치)은 `12ddc08`(main)에서 그대로 재현되는 기존 실패다. `vite build` 통과(빌드 번들에 `heroHpBar`·`3715676`).
- **배포**: [PR #219](https://github.com/songduckjin/DJRPG/pull/219) 스쿼시 병합 `816934df97d8`(Cloudflare Pages 체크 SUCCESS — `Workers Builds: djrpg`는 이 저장소 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `816934df97d8`(`builtAt 2026-11-20T16:24:49.461Z`) **HTTP 200**, 루트 200. 배포 번들 `assets/index-HFj9SRhD.js`(744,104B)에 `heroHpBar=new _e`·스테이지 순서 `this.effects,this.heroHpBar,this.labels`·`0x38b25c`(3715676) 포함 확인. 로그인 화면은 새 번들로 정상 부팅(브라우저 확인).
- **남는 것**: 게임 안 실제 화면(로그인 후 필드)은 게스트 계정을 만들지 않아 미확인 — 합성 검수 이미지가 실게임 배율·좌표를 게임 코드에서 그대로 받아 그린다. 상단 `.hp-pill`, 몹 빨간 바, `store.ts`/`server/**`/`world.ts` 계약은 무변경. 던전·월드보스 화면은 `GameView`를 공유하지 않고 각자 렌더러(`ui/dungeonField.ts`·`ui/worldBossField.ts`)를 쓰므로 이번 변경의 영향을 받지 않는다.

## 2026-11-21 · songduckjin 작업 230 — 일반 필드 몹 원거리 랜덤 스폰

- **요청**: 사용자 "몹들이 필드 멀리서 뜨도록 랜덤하게 뜨게좀 해줘". 지금은 몹이 `arenaLimits`(±120/±180) 테두리에서만 떠서, 아이소메트릭 투영으로 **화면 중앙 기준 ±103×±77px** — 캐릭터 바로 코앞에 튀어나왔다.
- **`arena.ts`**: 일반 필드용 `fieldSpawnLimits`(horizontal 250 · vertical 400 — `.43` 압축 때문에 세로가 크다. 화면으로 좌우 ±215px · 위아래 ±172px), `fieldSpawnMinDistance`(170), `fieldSpawnBand`(.78~1), `clampFieldPoint`를 더했다. `spawnArenaEnemy(player, angle, distanceRatio?)`는 플레이어에서 `angle` 방향 **필드 경계까지의 거리**에 밴드 비율을 곱한 지점을 고르고(최소 거리 미달이면 같은 방향 외곽까지 밀고, 그래도 모자라면 **반대편 → 가장 먼 외곽** 순), 반환점은 항상 필드 경계 안이다. 2인자 호출은 기본값(밴드 가운데)으로 그대로 동작한다. `arenaLimits`·`clampArenaPoint`·`arenaEdgePoint`는 건드리지 않아 던전(`ui/dungeonBattle.ts`) 경계는 그대로다.
- **`world.ts`**: 스폰마다 `fieldSpawnBand.near + random() × 폭`을 넘겨 **거리도 함께 굴린다**(각도만 흔들면 매번 같은 경계선 한 줄에서 뜬다). 적 이동 클램프와 `warcry` 넉백을 `clampArenaPoint` → `clampFieldPoint`로 바꿔, 멀리 스폰된 적이 **첫 프레임에 아레나로 순간이동하지 않고** 외곽에서 걸어 들어온다. 플레이어 이동은 계속 `clampArenaPoint`(아레나) 안이다.
- **테스트**: `tests/field-spawn.test.mjs`(신규 5건) — ① 아레나 가운데·네 모서리 × 36각도 × 3비율에서 필드 경계 안·최소 거리 170 이상 ② 밴드 비율이 커지면 거리도 단조 증가, 각도·거리가 매번 겹치지 않음 ③ 모서리에 몰린 플레이어도 반대편/가장 먼 외곽에서 170 이상 ④ 아레나 계약(120/180)과 필드(250/400) 경계 분리 ⑤ World에 실제로 스폰해 **프레임당 이동량 ≤ (플레이어 125 + 적 38)/60** — 순간이동 없이 아레나 밖에서 시작해 4초 안에 사거리 90까지 걸어 들어온다. `tests/arena.test.mjs`는 스폰 기대값을 아레나 → 필드로 갱신(플레이어는 아레나 안 유지).
- **검증**: `npx tsc --noEmit` 통과, `node --test tests/*.test.mjs` **953건 중 950 통과**. 실패 3건(`costume-field-render` 2 · `skillbook-server` 1)은 `origin/main` `c2c1c27`·`f3c3c28`에서도 같은 파일이 그대로 실패하는 기존 실패다. `node scripts/verify-item-art.mjs` 통과. `vite build` 번들 단계는 이 컨테이너 RAM(2.5~3GB) 부족으로 OOM(`insufficient memory`) — Cloudflare Pages 빌드로 확인했다.
- **머지·배포**: [PR #217](https://github.com/songduckjin/DJRPG/pull/217) 스쿼시 `2fe46aae498a`(Cloudflare Pages 체크 통과, `Workers Builds`는 상시 실패 체크), 운영 `https://djrpg.pages.dev/version.json` = `2fe46aae498a`(`builtAt 2026-11-20T15:58:47Z`) 확인. 배포 번들 `assets/index-YCnIObwm.js`에 새 필드 경계 `horizontal:250,vertical:400`과 기존 아레나 `horizontal:120,vertical:180`이 함께 있는 것을 확인했다. **모바일 실기 화면은 미확인**(사용자 몫).
- **번호**: 처음 `[작업 229]`로 등록했다가 같은 시각 병합된 #214(전사 그립 원복)가 229를 써서 230으로 올렸다(PR #216 닫고 #217로 재발행).

## 2026-11-21 · songduckjin 작업 229 — 전사 서기 '이전 그립' 원복(작업 222 되돌리기) · 알파 기준 유지 · 캐시 버전 4

- **요청**: [작업 222](https://github.com/songduckjin/DJRPG/pull/193)(낮은 양손 그립)로 바꾼 전사 남녀 서기 시트·대검 앵커를 **그 직전(이전 그립)**으로 되돌려 운영에 배포.
- **기준 커밋**: `4a1e95c`(PR #193, 작업 222)의 변경 목록을 `git show --stat`으로 확인 — PNG 88장 + 코드 6파일 + 테스트 8파일 + 문서 3파일. 원복 원본은 `4a1e95c^`(=`985f7f5`)다.
- **에셋 88장**: `4a1e95c^`의 서기 PNG만 되돌렸다 — 기준 `warrior_{male,female}_idle_v1.png`, `headless/`, `noweapon/`, `noweapon/headless/`, `armors/`·`armors/headless/`·`noweapon/armors/`·`noweapon/armors/headless/`의 `warrior_*_armor_{0..9}_idle_v1.png`. 걷기·공격 시트는 작업 222가 건드리지 않았으므로 그대로다.
- **`git revert`를 쓰지 않은 이유**: 작업 227(PR #209, 알파 복원 + `pilotSheet()`/`PILOT_ASSET_VERSION` 통합)이 222 뒤에 들어와, 222 커밋을 통째로 되돌리면 227의 알파 복원과 버전 표준화가 깨진다. 그래서 ① 에셋만 `4a1e95c^`에서 꺼내고 ② `python3 scripts/restore-pilot-alpha.py --only <서기 22개 파일명>`으로 227 기준(배경에서 2px 넘게 떨어진 내부 `alpha>=30` → 255, 외곽 AA 유지)을 다시 적용(28장 723,999px 복원) ③ 코드는 222가 바꾼 서기 앵커·시그니처만 이전 값으로 되돌리되 `pilotSheet()` 래퍼는 그대로 두었다.
- **코드**: `WEAPON_POSES.male.idle0` = `{197.2, 220.7, 0°}`, `female.idle0` = `{198, 219.6, -0.31°}`(222 이전 값). 222가 더한 갑옷 전용 앵커 `idleArmor`와 `weaponPose(gender, motion, frame, armor)` 4번째 인자, `syncWeaponPart(..., armor)`·`drawHero`의 `armor` 전달, `equipmentPortraitWeapon`의 `armorIndexFor(save)`를 제거했다 — 이전 그립에서는 맨몸·갑옷 서기 시트의 손 위치가 같아 앵커가 하나다. `armors.ts`의 `WARRIOR_IDLE_ASSET_VERSION`·`withMotionVersion`은 작업 227에서 이미 `pilotSheet()`로 대체돼 있어 건드리지 않았다.
- **캐시 무효화**: `src/game/render/pilotAssets.ts`의 `PILOT_ASSET_VERSION`을 **3 → 4**로 올렸다. 서기 시트를 같은 파일명으로 덮어썼고 `/assets/*`는 1년 `immutable`이므로 URL 버전이 바뀌어야 브라우저·CDN이 새 그림을 받는다. `pilotSheet()`가 붙는 모든 pilot-25d URL(본체·머리 없음·무기 지운 판·갑옷·투구·무기 파츠)이 함께 `?v=4`가 된다.
- **테스트**: `?v=3`을 기대하던 76곳을 `?v=4`로 갱신(대부분 `pilotSheet()` 경유라 값만 바뀐다). `tests/weapon-render.test.mjs`의 자세 표 검사를 222 이전 기준으로 되돌렸다 — 키 9개(`idleArmor` 없음), `weaponPose(gender,'idle',0) === idle0`, 남성 `idle0.rot === 0`, 여성 `|rot| < 1`.
- **검증**: `npx tsc --noEmit` 통과. 관련 7파일(`weapon-render`·`armor-render`·`archer-armor-render`·`character-portrait`·`equipped-detail`·`mage`·`weaponless-body`·`pilot-alpha`) **86/86**, 전체 `node --test tests/*.test.mjs` **948건 중 945 통과** — 실패 3건은 `c2c1c27`(main)에서 그대로 재현되는 기존 실패(`costume-field-render` 남/여 "코스튬 모드에서 통합 바디가 남아 있다", `skillbook-server` `hell` 이름 불일치)로 이번 변경과 무관하다(별도 워크트리에서 같은 3건 실패 확인). `npm run build` 통과.
- **알파 전수 확인**: 되돌린 88장 전부에 대해 227 규칙(내부 반투명 < 1.5%·불투명 중앙값 ≥ 250/255)을 5×5 침식 기준으로 재검사 — **88/88 통과**.
- **검수 이미지**: `downloads/djrpg_warrior_grip_revert_ingame_v1.png` — 남/여 × (맨몸 서기 · 맨몸+대검 파츠 · 갑옷 5번 서기 · 갑옷 5번+대검) 8칸을 `wasteland-ground` 위에 실게임 규칙(`WEAPON_POSES.idle0`의 가드 좌표·회전, 파츠 앵커 `WEAPON_GUARD`)으로 합성. 대검 파츠는 기본 검을 지운 `noweapon/` 시트 위에 얹었다(게임과 같은 경로). 확대해 보면 파츠 손잡이가 두 손 안에 들어오고 칼날선이 이전 그립과 나란하다.
- **배포**: [PR #214](https://github.com/songduckjin/DJRPG/pull/214) 스쿼시 병합 `86d554b6980a`(2026-11-20T15:22:34Z, Cloudflare Pages 체크 SUCCESS — `Workers Builds: djrpg`는 이 저장소 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `86d554b6980a`(`builtAt 2026-11-20T15:22:50.361Z`, 루트 200). 배포 번들 `assets/index-CY_1dsE0.js`(741,943B)에 `const r2=4`(=`PILOT_ASSET_VERSION`)와 `pilotSheet()`(`?v=${r2}`)가 들어 있고 `idleArmor`는 없다. 실서버 자산 확인(`?v=4`, HTTP 200 · 로컬 파일과 md5 동일): `warrior_male_idle_v1.png` 179,731B `997dee81…` · `armors/warrior_female_armor_5_idle_v1.png` 32,225B `1a905bf0…` · `noweapon/warrior_female_idle_v1.png` 17,806B `06d1efc5…` · `headless/warrior_male_idle_v1.png` 19,921B `61a0bf3c…` · `noweapon/armors/headless/warrior_male_armor_9_idle_v1.png` 19,289B `d5f89dd5…`.
- **남는 것**: 폰 실기(iOS Safari)에서 이전 그립·대검 위치 확인은 사용자 몫이다. 원격 브랜치 `fix/229-warrior-grip-revert`는 삭제 권한(403)으로 남아 있다.

## 2026-11-20 · songduckjin 작업 226 — 우편·거래소 `503 DB_UNAVAILABLE`에서 버튼 잠금·교착 해소 + 잠긴 이유 안내

- **배경**: 서버 `server/http.mjs` `errorResponse`가 DB 연결·설정 단계 예외(그리고 트랜잭션 밖 예외)를 `503 DB_UNAVAILABLE`로 돌려주는데, 클라이언트 `SaveSync.mutate`는 **모든 5xx**에서 `pendingMarket`을 남겼다. 그 결과 DB가 잠깐 죽은 동안 거래소 `수령`·`모두 수령`과 우편 `모두 받기`가 함께 잠기고, `거래 결과 다시 확인`을 눌러도 같은 503만 반복돼 서버가 회복될 때까지 거래·저장이 멈췄다. 게다가 `Interface.open()`이 `pendingMarket`을 이유로 **모든 창 열기를 막아** 그 다시 확인 버튼이 있는 거래소 창조차 열 수 없는 교착이었다(사용자 제보의 "버튼이 잠기거나 안내가 안 뜬다").
- **서버 판정**: `server/http.mjs`의 503 `DB_UNAVAILABLE`은 `ApiError`가 아닌 예외를 감싼 기본 응답이고, `DB_NOT_CONFIGURED`는 DB 클라이언트 생성 전(`server/database.mjs` `client`)에 난다 — 둘 다 `transaction()`(`server/database.mjs`)이 시작되기 전이거나 `rollback`으로 끝나 커밋되지 않은 요청이다. 서버 코드는 바꾸지 않았다(응답 계약 유지).
- **클라이언트** (`src/game/sync.ts` `mutate`): `response.status >= 500 && transactionSkippedCodes.includes(body.code)`(`DB_UNAVAILABLE`·`DB_NOT_CONFIGURED`)이면 `pendingMarket`을 **해제**하고 서버 문구를 그대로 담아(`code`·`status` 포함) 던진다. status가 실려 재시도 루프를 돌지 않으므로 요청 1회·토스트 1회로 끝나고, `finally`가 `locked=false`·`onPause(false)`로 버튼과 사냥을 되돌린다. 응답 유실·코드 없는 5xx는 종전대로 `pendingMarket`을 남겨 같은 `requestId`로 멱등 재확인한다(커밋 응답만 유실된 경우 다음 요청은 `409 SAVE_CONFLICT`/상태 오류로 끝나 최신 세이브 재로드로 흐른다). `Market.act`는 같은 action·data면 `requests` 맵의 **같은 `requestId`**를 다시 쓰므로, 해제 후 사용자가 같은 버튼을 다시 눌러도 서버가 이미 커밋한 거래를 재생(`djrpg_market_requests`)해 두 번 적용되지 않는다.
- **화면**: `marketModal.ts`는 `pendingMarket`이 남아 있으면 잠긴 이유 문구와 `거래 결과 다시 확인` 버튼을 함께 보여 준다(작업 224가 넣은 `최근 거래` 탭·최소 등록 금액과 같은 함수 안에서 충돌 없이 병합). `utilityModal.ts`는 거래소 거래가 걸려 있어도 우편함에서 `거래 결과 다시 확인`으로 바로 풀 수 있게 했고(전에는 `journey-` 거래일 때만 버튼이 있었다), 거래소 대기 안내 문구를 붙였다. `interface.ts` `open()`은 `pendingMarket` 중에도 **거래소 창만** 열어 준다(`busy`·`locked`·`pendingWarehouse` 가드는 그대로 — 다 풀면 거래 중 다른 창이 열린다).
- **테스트**: `tests/sync.test.mjs` 3건 신규 — ① 503 `DB_UNAVAILABLE`에서 `pendingMarket`·`locked` 해제, 요청 1회(재시도 없음), 토스트 1회, 곧바로 같은 화면에서 재시도 성공 ② 503 `DB_NOT_CONFIGURED`도 동일 ③ 코드 없는 500은 `pendingMarket` 유지·같은 `requestId`로 3회 확인 후 재시도로 해제. `tests/item-protection-ui.test.mjs` 거래소 창 안내·다시 확인·해제 시 사라짐, `tests/journey-ui.test.mjs` 우편함에서 거래소 대기 풀기, `tests/modal-ui.test.mjs` `open()` 예외 1건. 픽스 전에는 새 sync 2건이 실패하고 500 유지 1건은 통과하는 것을 확인했다.
- **검증**: `npx tsc --noEmit` 통과, 관련 4파일 `65/65`, 전체 `node --test tests/*.test.mjs` **912건 중 909 통과**, 실패 3건은 이번 변경과 무관한 `main` 기존 실패(`costume-field-render` 남/여 — "코스튬 모드에서 통합 바디가 남아 있다", `skillbook-server` — `hell` 스킬 이름 화면/서버 불일치). `npm run build` 통과, 로컬 배포 번들에 `DB_NOT_CONFIGURED` 분기·새 안내 문구 포함 확인.
- **번호·브랜치**: 등록 시 224로 올렸으나 같은 번호가 fks3997의 `최고층 복귀 버튼…`(PR #201), 225가 공용창고 UI(#203)로 먼저 병합돼 **226**(브랜치 `fix/226-market-db-unavailable-recovery`)으로 정정했다. 옛 등록 브랜치 `fix/224-market-db-unavailable-recovery`는 남아 있고, 병합 뒤 원격 브랜치 삭제는 권한(403)으로 되지 않는다.
- **배포**: [PR #205](https://github.com/songduckjin/DJRPG/pull/205) 스쿼시 병합 `c6bcb484b7e5`(Cloudflare Pages 체크 SUCCESS, `Workers Builds: djrpg`는 이 저장소 상시 실패) → 운영 `https://djrpg.pages.dev/version.json` = `c6bcb484b7e5`(`builtAt 2026-11-20T14:23:04.896Z`)·루트 200. 배포 번들 `assets/index-BczOC7up.js`(739,830B)에 `DB_NOT_CONFIGURED` 분기와 거래소·우편함 안내 문구가 들어 있고, 상시 실패 체크 외 추가 실패는 없다.
- **남는 것**: 코드 없는 5xx(응답 유실)로 `pendingMarket`이 남은 경우 사용자가 '다시 확인'을 누르지 않으면 여전히 잠긴다(이제 거래소 창은 열리므로 안내대로 풀 수 있다). 브라우저·모바일 실기 확인은 정책상 미실시.

## 2026-11-20 · songduckjin 작업 225 — 공용창고 인벤토리 UI 개편·깜빡임 없는 이동·일괄 이동

- **요청**: 공용창고 모달을 장비창 인벤토리와 같은 아이콘 그리드로 바꾸고, 아이템 이동이 깜빡임 없이(원클릭·다중 선택 일괄 포함) 되게 해 운영(`djrpg.pages.dev`)에 배포.
- **문제였던 것**: ① 옛 `renderWarehouse`는 아이콘·등급 테두리 없이 이름 줄만 나열 ② `moveItem`이 `ui.warehouseItems = undefined` 후 `loadWarehouse`를 다시 불러 **한 개 옮길 때마다 "공용창고를 불러오는 중…"이 화면을 덮고 스크롤이 초기화** ③ 여러 개를 한 번에 옮길 수 없음.
- **화면** (`src/ui/modals/warehouseModal.ts` 신규): 공용창고·가방 두 영역을 장비창과 같은 `.bag-grid`/`.bag-item` 슬롯으로 그린다(등급 테두리·아이템 그림·아틀라스 아이콘·강화 `+N`·잠금·`×N` 수량·직업 배지). 같은 주머니·같은 스킬북은 한 칸에 `×N`으로 모으되 개별 id는 그대로라 일괄 이동 때 함께 나간다. 요약 바(`계정 공용 금화` · `공용창고 N/40 · 가방 M/40`) + 도구 줄(`빠른 이동`·`선택`·`새로고침`). 슬롯을 탭하면 이름(강화 `+N`)·등급·부위·직업 제한·스탯 상세 바와 `[보관하기]`/`[꺼내기]`가 뜨고, `빠른 이동`을 켜면 상세 없이 탭 한 번에 반대편으로 옮긴다. `선택` 모드에서는 여러 칸을 골라 `[선택 보관 (N)]`/`[선택 꺼내기 (N)]`로 한 번에 보낸다(한 쪽만 선택된다). 재그리기는 모달 전체(`renderModal`)가 아니라 그리드·상세만 다시 그려(`painters`) 스크롤이 유지된다.
- **깜빡임 제거** (`server/endpoints/warehouse.mjs` · `src/game/sync.ts`): 이동 응답에 옮긴 뒤 **창고 목록(`items`)** 과 세이브(`save`)를 함께 실어 보내, 화면이 `list`를 다시 부르지 않고 인메모리 상태만 맞춘다. 기다리는 동안 그 칸만 `is-busy`로 흐려지고, 이동 요청은 `queues`로 줄을 세워 연속 탭도 "다른 요청을 처리 중입니다"로 튕기지 않는다. `transferWarehouse(action, string | string[])`로 인자를 넓혔다(1개면 예전처럼 `itemId`로 전송 — 구서버 호환).
- **서버 일괄 처리**: `deposit`/`withdraw`가 `itemIds`(1~40개)를 받아 **한 트랜잭션**에서 처리한다. **전부 아니면 전무** — 가방에 없는/소유권이 어긋난 id, 창고 40칸 초과(`WAREHOUSE_FULL`), 가방 40칸 초과(`BAG_FULL`) 중 하나라도 걸리면 아무것도 옮기지 않고 409로 되돌린다. 단건 `itemId` 요청은 응답·에러 코드·문구까지 예전 그대로이고, 일괄일 때만 안내 문구가 달라진다(`가방에 없는 아이템이 있어 아무것도 보관하지 않았습니다…`). `requestId` 멱등(`djrpg_warehouse_requests`)·세션·캐릭터 슬롯·리비전 검증은 그대로다.
- **CSS** (`src/styles/modals.css`): `.warehouse-*` 전용 선택자만 추가하고, 더 이상 쓰지 않는 `.warehouse-item` 규칙 3줄을 지웠다(같은 줄에 묶여 있던 `.character-pages button` 등은 유지). 390×844에서 두 영역이 187px씩, 40/40(8열×5행)이 스크롤 없이 한 화면에 들어오고, 360×780에서는 각자 스크롤된다. 40칸을 넘겨 그리드가 길어지면 `max-height: 34dvh`로 패널 안에서 스크롤된다.
- **`equipModal.ts`는 건드리지 않았다** — 헬퍼(`iconPath`)만 쓰고 아이콘 마크업은 창고 모듈 안에 둔다(병렬 작업 충돌 방지).
- **검증**: `npx tsc --noEmit`·`npm run build` 통과. 신규 `tests/warehouse-grid.test.mjs` **7/7** — 일괄 보관 3개(저장 1회·응답 `items`·`moved`), 같은 `requestId` 재생, 단건 `itemId` 문구 유지, 소유권/창고 40칸/가방 40칸 전부-아니면-전무, 형식 400(빈 배열·41개·requestId 없음)·캐릭터 슬롯 409, 화면 4건(그리드·`×N`·`+N`/잠금/직업 배지·빠른 이동·선택 일괄·상세 바·불러오기 실패). 회귀 전체 `tests/*.test.mjs` **906건 중 903 통과** — 실패 3건은 `main`에 이미 있던 `costume-field-render` 남/여 2건·`skillbook-server` 1건이다(수정 전 `main`과 동일).
- **화면 검수**: `downloads/djrpg_warehouse_ui_v1.png`(390×844 기본)·`_detail.png`(상세 바)·`_select.png`(선택 꺼내기 3개)·`_full.png`(40/40)·`_360.png`(360×780). 실제 모달 렌더러를 게임 없이 띄운 검수 페이지로 캡처했고(픽시 부팅 없이 CSS·마크업 확인), 좌표 실측은 390에서 dialog 507px·패널 251px·그리드 223px·칸 36px, 360에서 칸 32px이다.
- **배포**: [PR #203](https://github.com/songduckjin/DJRPG/pull/203) 스쿼시 병합 `43452d4876ff`(2026-11-20T14:06:00Z, Cloudflare Pages 체크 SUCCESS, `Workers Builds: djrpg`는 이 저장소 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `43452d4876ff`(`builtAt 2026-11-20T14:06:24.137Z`) **HTTP 200**, 루트 200. 배포 번들 `assets/index-CZKruc9J.js`에 `빠른 이동`·`선택 꺼내기`·`warehouse-slot`·`itemIds`·`계정 공용 금화` 포함, CSS `assets/index-CBcFRKMF.css`에 `warehouse-modal`·`warehouse-slot`·`warehouse-detail`·`warehouse-batch`·`warehouse-plus` 포함 확인.
- **운영 API 실측**(임시 게스트 계정, 끝나고 탈퇴): 새 게스트로 `itemIds:["no-a","no-b"]` 보관 → **409 `ITEM_NOT_AVAILABLE`** `가방에 없는 아이템이 있어 아무것도 보관하지 않았습니다…`(일괄 문구), 단건 `itemId:"no-a"` → **409 `ITEM_NOT_AVAILABLE`** `가방에 있는 아이템만 창고에 넣을 수 있습니다.`(예전 문구), `list` → `{"items":[]}`, 마지막에 `deleteAccount`(confirmId `게스트`) **200 `deleted.characters 1`** → 지운 토큰 `load` 401. 게스트는 가방이 비어 있어 실제 이동(200)은 로컬 테스트로만 확인했다.
- **번호 정정**: 처음 `작업 224`로 등록했으나 같은 번호가 다른 PR(#201)에서 먼저 병합(`8970b0b8c030`)되어 `작업 225`로 바꿨다(`TASK`·`CODE_MAP`·`QUICK_PATCH`·코드 주석). 브랜치 `feat/224-warehouse-grid-ui`는 지워지지 않아 남아 있다(원격 브랜치 삭제 권한 403).
- **남은 일**: 폰 실기(iOS Safari)에서 그리드 칸 크기·상세 바 위치 확인은 사용자 몫이다. 40칸이 꽉 찬 계정에서의 일괄 이동은 운영 실데이터로 확인하지 않았다.

## 2026-11-20 · fks3997 작업 224 — 최고층 복귀 버튼·거래소 거래 완료 업적·최근 거래 탭·최소 등록 금액·부팅 오류 완화 + 구형 계정 로그인 503 핫픽스

- **요청**(사용자 확정 메시지 `#6215`·`#6289`·`#6294`·`#6313`·`#6335`·`#6370`, 긴급 `#6466`·`#6486`·`#6510`): ① "혹시나 내 도전 최고층에서 2층 이상 강등되면 최고층으로 버튼도 만들어줘" ② "거래소에 최근 거래 기록이랑 현재 최소 등록 금액 표시되게 추가해줘" ③ 업적 `거래소 거래 완료`(등록·취소 제외, 성사된 거래만, `1·5·15·30·50·100회`) ④ 크롬 `초기화에 실패했습니다 (Failed to fetch dynamically imported module: …/assets/WebGLRenderer-*.js)` ⑤ **긴급** — 구형 비밀번호(`salt:hex`) 계정(`fks3997` 등) 로그인이 비밀번호와 무관하게 `503 DB_UNAVAILABLE`.
- **① `▲ 최고층`(`#6215`)** (`src/ui/hud.ts`·`src/styles/hud.css`): `renderStatus`의 `.status-floor`에 `save.maxFloor - save.floor >= 2`일 때만 `<button class="floor-return">▲ 최고층</button>`을 붙이고(`⚔ 보스 도전` 뒤), 클릭하면 `world.travelToFloor(save.maxFloor)`로 즉시 이동·`ui.message` 안내. 1층 차이는 층 선택 창으로 충분해 띄우지 않는다. 보스 재도전은 최고층에서 진 상태라 두 버튼이 겹치지 않는다. 399px 이하에서는 글자·여백을 줄인다.
- **② 거래소 `최근 거래`·`최소 등록 금액`(`#6313`)** (`src/ui/modals/marketModal.ts`·`src/game/market.ts`·`src/styles/market.css`·`server/market.mjs`): 탭을 `판매 중·최근 거래·거래 완료·내 거래·판매 등록·수령함` 6칸으로 늘리고, `최근 거래`는 서버 `view:'sold'`(`sold_at DESC`)를 받아 `renderRecent`가 아이템명·등급·가격·거래 시각·내 구매/판매 표시를 압축해 보여준다(필터·페이지 없음). `switch('recent')`는 `stat=''`·`sort='newest'`로 고정. `rules`에 `minPrice:1`을 명시하고 판매 등록 화면 가격 입력 위에 `현재 최소 등록 금액 1 금화`·`min`·placeholder를 서버 값으로 표기.
- **③ 업적 `거래소 거래 완료`(`#6289`·`#6294`)** (`server/journey-state.mjs`·`server/market.mjs`): `milestones`에 `['market','거래','거래소 거래 완료',[1,5,15,30,50,100],(_save,state)=>state?.marketTrades??0]`을 더하고 `journeyView`가 단계 `get(save, state)`로 계정 장부를 넘긴다. `market.mjs` `buy`가 성사되면 `tradeParties`를 남겨 **같은 배치**에서 구매자 장부는 `journeyOperation`(`skipJourney`)으로, 판매자 장부는 `tradeCountOperation`(`json_set` upsert)으로 +1 — 등록·취소는 세지 않는다. 판매자의 `save_json`을 직접 고치지 않는 이유: 그 세이브는 판매자 기기 클라이언트가 들고 있어 다음 저장에 덮어써진다. `writeSave` 밖 `tx.batch`/`tx.execute`를 더하지 않아 "배치 2·실행 0" 계약도 그대로다.
- **④ 부팅 오류 완화(`#6335`·`#6370`)** (`public/boot-recovery.js`·`tests/boot-recovery.test.mjs`): `vite:preloadError`뿐 아니라 `error`·`unhandledrejection`의 `Failed to fetch dynamically imported module`·`error loading dynamically imported module`·`Importing a module script failed`·`Unable to preload CSS` 문구를 받아, 60초에 1회 `_boot=<시각>` 쿼리로 문서·청크를 새로 받는다(무한 새로고침 방지). 빌드에서 `WebGLRenderer-*.js`가 `__vite__mapDeps`/`__vitePreload` 경유로 로드되는 것을 확인.
- **⑤ 구형 계정 로그인 503 핫픽스(`#6466`·`#6486`·`#6510`)** (`server/legacy-auth.mjs`·`server/auth.mjs`·`server/scrypt-js.mjs`(신규)·`server/endpoints/account.mjs`): 원인은 ① login이 구형 해시 계정이면 무조건 `legacyVerifier`(Vercel)부터 부르고 ② 그 `fetch` 옵션의 `cache:'no-store'`를 Cloudflare Workers가 거부해 `catch → fail(503)`로 떨어지는 것. 수정은 `cache` 삭제 + `deriveScrypt`가 `node:crypto` `scrypt` 실패·부재 시 **순수 JS scrypt**(`server/scrypt-js.mjs` — PBKDF2-HMAC-SHA256은 WebCrypto, ROMix만 JS)로 폴백 + login이 **서버 안에서 먼저 판정**(내부 검증이 아예 불가능한 런타임에서만 Vercel을 마지막 수단). 구형 해시는 `N=16384,r=8,p=1`, 성공 즉시 `scrypt$2048$8$1$…`로 자동 업그레이드.
- **테스트**: 신규 `legacy-login` 5건(순수 JS scrypt ↔ `node:crypto` 바이트 일치 N=1024·16384, 네이티브 실패 시 폴백 검증, **구형 계정 틀린 비번 401·맞는 비번 200+업그레이드·외부 호출 0회**, Vercel `fetch`에 `cache` 없음·401→false·네트워크 실패 503), 신규 `floor-return` 3건(2층 이상일 때만·클릭 이동·CSS), 보강 `achievements`(8분류·market 6단계·금화/주머니 사다리·현재값)·`market`(buy 양쪽 +1·등록/취소 제외·`rules.minPrice`)·`market-actions`(recent→`view:'sold'`)·`boot-recovery`(WebGLRenderer 문구·캐시 우회 URL·60초 창)·`functions-adapter`(외부 Vercel 호출 0회).
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과. 전체 `node --test tests/*.test.mjs` **899건 중 896 통과** — 실패 3건(`costume-field-render` 남/녀·`skillbook-server` 이름 대조)은 `origin/main` 워크트리에서도 동일하게 실패하는 기존 실패로 확인.
- **배포**: [PR #201](https://github.com/songduckjin/DJRPG/pull/201) 스쿼시 병합 `8970b0b8c030`(2026-11-20T13:51:10Z, Cloudflare Pages 체크 SUCCESS) → 운영 `https://djrpg.pages.dev/version.json` = `8970b0b8c030`(`builtAt 2026-11-20T13:51:28.936Z`) **HTTP 200**, 루트 200. 배포 번들 `assets/index-gKVhmVBU.js`(729,297B)에 `▲ 최고층`·`최근 거래`·`현재 최소 등록 금액`·`floor-return`·`market-recent-row` 포함, `boot-recovery.js`에 `_boot` 포함 확인.
- **운영 실측(§검증 필수)**: `curl -X POST https://djrpg.pages.dev/api/account -H 'Content-Type: application/json' -d '{"action":"login","loginId":"fks3997","password":"wrong"}'` → **HTTP 401 `INVALID_CREDENTIALS`**(배포 전 503 `DB_UNAVAILABLE`), 같은 요청 `logincheck999` → 401. 게스트 생성(`{"action":"guest"}`) **200**(Workers에서 `hashPassword` 정상 동작) → 그 토큰으로 `journey-list` 200, 업적 46건에 `market-1·5·15·30·50·100`(금화 1000·2000·3000·5000·8000·12000, 주머니 0·0·1·1·1·2) 포함, `market list` `rules.minPrice=1`·`view:'sold'` 7건 응답.
- **미확인/남은 일**: ① fks3997의 **실제 비밀번호 로그인**은 비밀번호를 알 수 없어 실측하지 못했다(틀린 비번이 401로 바뀐 것과 로컬 재현 테스트로 대체). ② 사용자 폰에서 `▲ 최고층`·`최근 거래` 탭·최소 금액 표기의 실제 화면 확인은 사용자 몫. ③ 브랜치 `work/224-ui-market-boot` 원격 삭제가 API 권한(403 address not permitted)으로 실패해 남아 있다.

## 2026-11-20 · fks3997 작업 223 — 드롭률 전 구간 2배 · 보스 재도전 영구 저장 · 보스 소환 쿨타임 초기화 · 월드보스 참여 보상 복구 · 몬스터 처치 업적 상향

- **요청**(사용자 확정 메시지 `#6034`·`#6061`·`#6066`, 이후 `#6086`·`#6108`·`#6127`·`#6139`·`#6180`·`#6194`): ① "전구간2배할까? 더어렵게할껀데위에서도빨리못잡게할껀데" — 초반이 너무 짜다("부캐1시간방치해서 반지한개얻었어")는 제보에 전 구간 드롭률 2배(+보스도 2배) ② "3층 보스 실패했는데 보스도전버튼이 생겼다가 없어졌어 4층 넘어갈때까지 계속 있어야되는데" ③ "보스 도전 때 스킬 쿨도 돌려줘" ④ "월드보스 1회도전당 보상은없어졌어?" → "1회도전당 금화만줘야지 그리고 기록갱신알림은넣어야되고" ⑤ 몬스터 처치 업적 7단계 상향.
- **① 드롭률 2배** (`src/game/items.ts` `itemDropChance`): 일반(정예 포함) `Math.min(.008, .002 + depth*(.006/19))` → `Math.min(.016, .004 + depth*(.012/19))`(1층 0.20%→**0.40%**, 20층 0.80%→**1.60%**), 보스 `Math.min(.12, .03 + depth*(.09/19))` → `Math.min(.24, .06 + depth*(.18/19))`(3%→**6%**, 12%→**24%**). 장비 70% : 스킬북 30%(`SKILLBOOK_DROP_SHARE`) 비율, `offline.ts` 정산 경로, 던전 `dungeonDropChance`(15~20%)는 그대로다. 테스트 기대값: `tests/offline.test.mjs`(1층 장비 .0028·스킬북 .0012, 보스 20층 .168/.072, 1.60%·24% 상한), `tests/balance-196.test.mjs`(.0028/.0112), `tests/elite-mob.test.mjs`(경계값 .005/.002, `itemDropChance(1,false) === .004`).
- **② 보스 재도전 영구 저장(`#6086`)** (`src/game/store.ts`·`src/game/world.ts`·`server/{database,save-seed}.mjs`): HUD 상태가 세션 메모리(`bossRetryAvailable`)에만 있어 새로고침·재접속·버전 업데이트 리로드(`new World(save)`)마다 사라졌다. `Save.bossRetryFloor?: number`(0/없음 = 재도전 없음, `maxFloor`와 같으면 버튼 유지)를 추가하고 `parseSave`가 0~MAX_FLOOR 정수로 클램프, `freshSave`·`initialSave`는 0. 생성자는 `save.bossRetryFloor === save.maxFloor && save.maxFloor < MAX_FLOOR`로 복원하고, 보스 패배 두 경로(자동 등반 유지 `climbOn`·중단 `else`)에서 `save.bossRetryFloor = save.floor`를 적으며, 보스를 이겨 다음 층으로 올라갈 때(`kill`의 `autoClimb` 분기) 0으로 지운다 — `challengeBoss()`는 건드리지 않아 도전 중에는 기록이 남는다. `server/database.mjs` `writeSave`는 `bossRetryFloor`를 0~`maxFloor` 정수만 저장하고 옛 클라이언트가 빠뜨려도 0으로 둔다(거부 없음). 버튼 노출 게이트 `bossFloor()`는 그대로 — 몹 30마리로 2층에 내려가 있는 동안은 숨고 최고 층에 돌아오면 다시 뜬다(2층에서 3층 보스를 부르는 층 꼬임은 만들지 않았다).
- **③ 보스 소환 시 쿨타임 초기화(`#6108`)** (`world.ts` `update`의 `if (boss)` 스폰 블록): 체력 100% 회복과 같은 자리에서 `for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = 0;` — 자동 등반 소환과 `⚔ 보스 도전` 재도전 소환이 같은 블록으로 합류하므로 둘 다 스킬을 쿨 없이 시작한다.
- **④ 월드보스 1회 도전 참여 보상 복구(`#6127`·`#6139`)** (`server/world-boss.mjs`): 216/218 병합 과정에서 `participation:${attempt.id}` 보상이 빠져 "1회 도전 보상이 없어졌다"는 제보가 왔다. `participationMail`(구현은 이전 `mail` 헬퍼와 같은 규칙)을 추가해 `credit()`에서 `ended && Number(attempt.credited) > 0`이면 `djrpg_boss_rewards`의 `participation:<도전 id>` 중복 방지로 `월드보스 도전 참여 보상` 우편 1장을 **금화 1,000·books 0·pouches 0**으로 지급한다(주머니 없음 — 사용자 "1회도전당 금화만줘야지"). `result.battle.record`(첫 기록·갱신·변동없음)는 `main`의 것을 그대로 둔다. `src/ui/modals/worldBossModal.ts` `renderBossRewards`의 추가 보상 목록 맨 앞에 `참여 보상 · 1회 도전 완료 시 · 1,000 금화` 안내를 넣었다.
- **⑤ 몬스터 처치 업적 상향(`#6180`·`#6194`)** (`server/journey-state.mjs` `milestones`): `['kills','사냥','몬스터 처치',[500,1000,2000,4000,8000,16000,32000]]` → `[1000,5000,15000,30000,60000,120000,250000]`. `tests/achievements.test.mjs`의 단계 목록과 주머니 단계 id(`kills-15000`·`kills-30000`·`kills-60000`·`kills-120000`·`kills-250000`)를 새 값으로 고쳤다. 이미 달성·수령한 단계는 그대로 남고 미수령 단계의 목표 숫자만 올라간다.
- **테스트** (`tests/world-movement.test.mjs` 신규 2건): 새로고침·재접속(JSON 왕복 → `parseSave` → `new World`)에도 `bossRetryReady`가 살아 있는지, 2층으로 내려갔다 3층으로 돌아오면 다시 뜨는지, 보스를 이겨 4층으로 오르면 기록이 지워지는지, 옛 세이브(값 없음) 0·`99` → 20 클램프까지. 그리고 보스 소환(자동·재도전) 뒤 `cooldown` 전부 0. `tests/world-boss-live.test.mjs`는 공유 처치에서 참여 우편 1장(1,000G·주머니 0), 3회 도전에서 참여 우편 3장(재정산해도 안 늘어남)과 랭크 우편을 제목으로 찾도록 갱신.
- **검증**: `node node_modules/typescript/bin/tsc --noEmit` 통과, `node node_modules/vite/bin/vite.js build` 통과(배포 번들에 `Math.min(.016,.004+…(.012/19)`·`Math.min(.24,.06+…(.18/19)` 포함 확인). 부분 테스트: `world-movement` **25/25**, `world-boss-live`+`world-boss-preview` **27/27**, `achievements`+`journey`+`journey-ui`+`journey-metrics` **43/43**, `offline`+`elite-mob`+`balance-196`+`field-loot`+`dungeon-battle`+`save-guard`+`concurrency` **83/83**. 전체 `node --test tests/*.test.mjs` **875건 중 872 통과**, 실패 3건은 이번 변경과 무관한 `main` 기존 실패(`costume-field-render` 남/여 2건 — 종전 기록에도 있는 상시 실패, `skillbook-server` 1건 — 'hell' 스킬 이름이 화면·서버에서 어긋남).

- **배포**: [PR #199](https://github.com/songduckjin/DJRPG/pull/199) 스쿼시 병합 `f14a5c3c148d`(2026-11-20 22:12 KST, Cloudflare Pages 체크 SUCCESS) → 운영 `https://djrpg.pages.dev/version.json` = `f14a5c3c148d`(`builtAt 2026-11-20T13:12:36.765Z`) **HTTP 200**, 루트 200. 배포 번들 `assets/index-CVCEgrNc.js`(727,572B)에 `Math.min(.016,.004+…(.012/19)`·`Math.min(.24,.06+…(.18/19)`·`bossRetryFloor`·`참여 보상`이 들어 있고 옛 `min(.008` 값은 없어진 것을 확인했다. 병합 전 `main`이 `b816973`(songduckjin 작업 223 계정 탈퇴·작업 222 배포 기록)까지 진행돼 `TASK.md`·`WORKLOG.md` 충돌을 양쪽 보존으로 풀고 `tsc`·전체 테스트(884건 중 881)·`vite build`를 다시 통과시킨 뒤 병합했다. **작업 번호 223은 songduckjin 님의 '계정 탈퇴'와 중복**이라 담당자 열로 구분한다(201·216과 같은 관행). 서버 수치(`journey-state.mjs` 마일스톤·`world-boss.mjs` 참여 보상)는 병합 커밋으로 확인했고, 운영 계정으로 업적 목록·월드보스 우편을 직접 호출해 보지는 않았다. `Workers Builds: djrpg`는 이 저장소에서 상시 실패하는 기존 체크다. 원격 작업 브랜치 삭제는 권한(403)으로 되지 않아 남아 있다.

## 2026-11-20 · songduckjin 작업 223 계정 탈퇴(아이디 삭제) — 서버 API·인게임 확인창·같은 아이디 즉시 재가입

- **요청**: 사용자가 `djsong` 아이디를 지우고 새로 가입하려 했으나 서버에는 **캐릭터 삭제만** 있고 계정(아이디) 자체를 지우는 API가 없었다. 운영 Turso 대시보드 접근 권한이 없어 대신 지워 줄 수도 없으므로, 게임 안에서 **비밀번호 확인 후 아이디를 지우는 기능**을 만들어 달라는 지시. 추가 요청 `#18745` "캐릭터선택에 공용창고는 없애줘"(하단 메뉴 아이콘으로 옮겼다).
- **서버** (`server/account-delete.mjs` 신규 · `server/endpoints/account.mjs`): `deleteAccount` 액션은 ① `assertSession`(지금 로그인한 세션) ② `verifyPassword`(비밀번호 재확인, 없거나 틀리면 `401 INVALID_CREDENTIALS`) ③ `confirmId`(아이디 입력, 대소문자 무시, 틀리면 `400 ACCOUNT_ID_MISMATCH`) 세 관문을 통과해야 한다. 게스트는 비밀번호가 없어 토큰과 `게스트` 확인 문구로만 지운다. 통과하면 `transaction` 안에서 `deleteAccountData(tx, id)`가 `ACCOUNT_TABLES` 22종 + `djrpg_market`(seller/buyer) + 매물 알림을 지우고 `djrpg_accounts` 행을 맨 마지막에 지운다. 표를 하나라도 남기면 같은 아이디로 다시 가입한 주인이 옛 캐릭터·창고·우편·결제 기록을 물려받기 때문이다.
- **무결성**: 판매 중 매물은 `409 MARKET_PENDING`으로 탈퇴를 막는 대신 **자동 취소**한다(탈퇴하려는 사람에게 거래소 정리를 요구하면 아이디를 지울 수 없다). `djrpg_dungeon_*`·`djrpg_boss_*`·`djrpg_announcements`는 처음 쓰일 때 만들어지는 표라 **`sqlite_master`에 있는 표만** 골라 지운다(`season.mjs`의 `RESET_TABLES` 처리와 같은 방식). 응답은 `{ ok, deleted: { characters, listings, diamonds } }`.
- **화면** (`src/ui/modals/accountDelete.ts` 신규 · `accountModal.ts`): `계정 정보` 맨 아래 `계정 탈퇴 (아이디 삭제)` 버튼 → 캐릭터 삭제 확인창(작업 206)과 **같은 다크 판타지 오버레이**(CSS는 `.character-delete-*` 규칙에 `.account-delete-*` 선택자를 함께 적어 한 벌로 유지). `window.prompt()`/`confirm()` 없이 비밀번호·아이디 두 칸, 불일치는 확인창 안에 안내하고 해당 칸으로 포커스, 두 칸이 맞아야 `계정 삭제`가 위험 강조, 진행 중 `삭제 중…` + 중복 클릭 차단. 사냥 중 모달이 다시 그려져도 입력이 남도록 `.modal-dialog` 밖에 얹고 모달이 닫히면 함께 닫는다. 성공하면 `clearLocalAccount()`(`src/ui/login.ts` — 토큰 + `djrpg.accounts.v1`·`djrpg.save.v1.*`·`djrpg.lastLogin.v1`) 후 로그인 화면으로 다시 연다.
- **공용창고 버튼 제거** (`#18745`): `charactersModal.ts`의 `dialog.append(button('공용창고', () => ui.open('warehouse')))` 삭제. 공용창고 모달과 `ui.open('warehouse')`는 하단 메뉴 아이콘(작업 221)이 그대로 쓴다.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/account-delete.test.mjs` **8/8** — 계정 종속 표 전수 삭제·판매 중 매물 자동 취소·같은 아이디 즉시 재가입(1레벨 새 캐릭터)·잘못된 비밀번호 401·잘못된 아이디 400(대소문자 무시 확인)·다른 계정 데이터 무영향·지운 토큰 401·게스트 탈퇴·화면 4건(탈퇴 버튼/확인창, 불일치·빈 비밀번호 안내, 중복 클릭 차단과 리로드, 서버 오류 안내, 캐릭터 선택 공용창고 없음). 회귀 `modal-ui`·`characters`·`market`·`functions-adapter`·`shop`·`journey` **77/77**, 전체 `tests/*.test.mjs` **881건 중 878 통과** — 실패 3건은 `origin/main`에서도 같은 `costume-field-render` 2건·`skillbook-server` 1건.
- **배포**: [PR #196](https://github.com/songduckjin/DJRPG/pull/196) 스쿼시 병합 `82b7e7503c30` → 운영 `https://djrpg.pages.dev/version.json` = `82b7e7503c30`(`builtAt 2026-11-20T12:36:18.326Z`)·루트 200. 배포 번들(`assets/index-B6Q_uG43.js`)에 `deleteAccount`·`계정 탈퇴`·`account-delete-overlay`, CSS(`assets/index-DW9oZcEg.css`)에 `account-delete`/`account-withdraw` 확인. 캐릭터 선택의 `("공용창고",()=>…open("warehouse"))` 문자열은 0건(하단 메뉴·모달 제목만 남음).
- **운영 API 실측**(임시 계정 `t223chk`, 끝나고 삭제): 등록 200 → 잘못된 비밀번호 **401 `INVALID_CREDENTIALS`** → 잘못된 아이디 **400 `ACCOUNT_ID_MISMATCH`** → 탈퇴 **200 `{"ok":true,"deleted":{"characters":1,"listings":0,"diamonds":0}}`** → 지운 토큰 `load` **401** → 같은 아이디 재등록 **200**(새 계정) → 정리 탈퇴 200·로그인 401.
- **미확인/남은 일**: 모바일 실기 화면(버튼 위치·확인창 키보드)은 사용자 확인 몫. `djsong` 계정은 **사용자가 폰에서** 계정 정보 → 계정 탈퇴로 직접 지우면 된다(운영 DB 접근 권한이 없어 대신 지울 수 없다).

## 2026-11-20 · fks3997 작업 222 — 보스 도전 버튼·보스전 체력·몹 30마리 층 하락·일일 분해 1개·월드보스 `list` 503 폴백

- **요청**: 운영(`djrpg.pages.dev`)에서 사용자가 직접 확인한 5건 + 한국 접속 경로 503. ① `#5781` "⚔ 보스 도전" 버튼이 보스에게 지기 전에 미리 뜬다 ② `#5792` "각 층 끝까지 등반해서 실패해야 떠야되는데" — 일반·정예 몹에게 죽어도 버튼이 뜬다 ③ `#5811` "층보스 떴을때 체력 꽉찬 상태로 싸우게 해줘" ④ `#5827` "몹이 30마리 이상 생성되면 층 하락시켜줘" ⑤ `#5841` "일일보상 장비 1개 분해로 하자" + `#5666`·`#5729` 미국 PDX `curl`은 200인데 한국 ICN 브라우저는 `/api/world-boss` `action:'list'`가 30ms 만에 503(`DB_UNAVAILABLE`).
- **①·② 버튼 조건** (`src/game/world.ts`): 생성자의 `this.bossRetryAvailable = !save.autoClimb`(작업 210)를 `false`로 — 자동 등반을 끄거나 그런 세이브로 접속해도 보스에게 지기 전에는 버튼이 없다. 패배 처리 `else` 분기의 `this.bossRetryAvailable = this.bossFloor()`(작업 210)를 `if (this.bossFloor() && enemy.boss) this.bossRetryAvailable = true;`로 — 보스에게 진 경우에만 켜지고, 일반·정예 몹에게 진 것으로는 켜지지 않으며 이미 켜져 있던 상태는 일반 몹 패배로 꺼지지 않는다. `bossPending`(자동 소환) 조건과 `kill()`의 보스 처치 경로는 그대로다.
- **③ 보스전 체력** (`world.ts` `update`의 `if (boss)` 소환 블록): `this.player.hp = totalStats(this.save).health; this.save.health = this.player.hp;` — 자동 등반 소환과 `⚔ 보스 도전` 재도전 소환이 같은 블록으로 합류하므로 둘 다 꽉 찬 체력으로 시작한다.
- **④ 몹 상한·층 하락** (`world.ts`): `MOB_CAP = 30` 신규 export, 스폰 조건 `this.enemies.length < 18` → `< MOB_CAP`. 스폰 블록 바로 뒤에 `enemies.length >= MOB_CAP && floor > 1`이면 `floor--`·`floorKills = 0`·`enemies = []`·`chaseTarget/pursuing` 해제·`bossPending`/`elitePending` 해제·`spawnTimer = .2`·`적이 너무 많아 N층으로 내려갑니다.`·`onChange()`. 바닥 드랍(`drops`)은 건드리지 않는다. 1층은 내려가지 않고 상한만 지킨다(30번째 몹이 스폰되는 순간 하락하므로 1층 외 실질 상한은 29).
- **⑤ 일일 미션** (`server/journey-state.mjs`): `dailyTasks`의 `salvage`를 `{name:'장비 1개 분해',target:1,gold:800}`으로(주간 `장비 분해 15회`는 그대로). 목표가 1이라 기대 `current`가 잘리므로 `tests/journey.test.mjs` 2곳(3→1, 2→1)을 함께 고쳤다.
- **월드보스 503** (`server/world-boss.mjs`·`server/world-boss-schema.mjs`): `action:'list'`의 `quickList`(읽기 배치·지역 레플리카) 호출을 try/catch로 감싸 실패하면 503을 내지 않고 `writeOperation`(주 DB 쓰기 트랜잭션)으로 폴백한다. `ApiError`(인증·세션)는 그대로 올려 불필요한 쓰기를 막는다. 스키마 쪽은 DDL이 전부 `IF NOT EXISTS`인데도 초기화 일시 오류로 요청 전체가 503이 되던 것을 막기 위해, DDL 실패 시 `sqlite_master`로 네 테이블 존재를 한 번 확인해 있으면 통과하고, 없거나 확인조차 실패하면(DB 연결 자체 사망) 원래 오류를 그대로 올린다. 실패한 스키마는 캐시에 남기지 않는다.
- **⑥ 수령함 아이템 받기 `409 ITEM_CONFLICT`(`#5921`)** (`server/market.mjs` `mutate`의 `claim`): `claim`은 받은 아이템의 주인 기록을 `operations`에 쌓아 `writeSave`에서 한 번에 실행하는데, `reconcileItems`는 그보다 **먼저** 옛 `location='inbox'` 행을 읽어(클라이언트 세이브가 그 아이템을 이미 들고 있으면 — 받기 직후 저장·재시도) `409`로 막았다. 그래서 이 요청에서 실제로 받을 배달의 아이템 id만 담은 `claimable` 집합을 만들고 `owned` 목록에서 그 행만 `location:'inventory'`·`character_slot: row.slot`으로 미리 보고 통과시켰다(다른 배달·다른 계정 아이템은 종전대로 409). 이미 가방에 같은 id가 있으면 두 번 넣지 않는다. `warehouse.mjs` `withdraw`는 `reconcileItems`를 부르지 않고 클라이언트 `progress`도 받지 않아 같은 문제가 없다. 회귀 테스트(`tests/market.test.mjs`)는 등록→타 계정 구매→수령→저장 전 구간이고, 수정 전 코드로 돌리면 실제로 `ITEM_CONFLICT`로 실패하는 것을 확인했다.
- **검증**: 신규 테스트 9건 — 월드(생성자 버튼 없음 2케이스·일반/정예 패배 미활성+기존 활성 유지·보스 등장 회복 2경로·30마리 하락/1층 예외/29마리 유지), 월드보스(읽기 실패 폴백·인증 오류 비폴백·스키마 일시 오류 허용·DB 사망 시 오류) + 경매장 회귀 1건. `node --test` — `world-movement` 20/20, `world-boss-live` 20/20, `market` 29/29, `world-boss-field`+`world-boss-preview`+`journey-metrics`+`season-reset` 38/38, `journey`+`journey-metrics` 21/21, `shop`+`concurrency`+`functions-adapter` 17/17. `tsc --noEmit`·`vite build` 통과. `verify-item-art`는 이 체크아웃이 부분 클론(blob:none)+스파스라 원본 아트 346개가 없어 실패(작업 217 기록과 같은 기존 제약, 코드 문제 아님).
- **배포**: [PR #190](https://github.com/songduckjin/DJRPG/pull/190) 스쿼시 병합 `985f7f5eef29`(2026-11-20T12:25:04Z, `origin/main` 3724447 위로 병합해 docs 충돌 3건 해소 후). Cloudflare Pages 체크 통과(`Workers Builds: djrpg`는 `main`에서도 같은 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `985f7f5eef29`(`builtAt 2026-11-20T12:25:22.559Z`, HTTP 200), 루트 200, 배포 번들 `index-CssnHnJk.js`에 `적이 너무 많아`·`boss-retry` 포함 확인. 운영 `/api/world-boss`는 인증 없이 `401 INVALID_TOKEN` + `Server-Timing` 헤더로 응답(왕복 95ms) — 로그인한 계정으로 `list` 200 확인은 사용자 인게임 테스트 몫이다(운영 DB에 검증용 계정을 만들지 않았다).
- **번호 정정**: 처음 `작업 221`로 등록했지만 `main`의 PR #187(하단 메뉴 공용창고 아이콘)이 이미 221을 썼으므로 `작업 222`로 바꿨다(TASK·WORKLOG·CODE_MAP·QUICK_PATCH 전부).

## 2026-11-20 · songduckjin 작업 221 하단 메뉴 '공용창고' 아이콘 추가(A안) — 4탭 배치·운영 배포
- 요청: 하단 메뉴 `내 정보 · 스킬 · 거래소` 옆에 **공용창고** 아이콘 버튼을 넣어 달라. 시안 3종(`downloads/djrpg_nav_warehouse_preview_v1.png`) 중 사용자가 **A안(다크 오크·황금 자물쇠 상자)** 을 확정했고 원본은 `downloads/warehouse_icon/opt_a.png`(1402×1122, 검정 배경 RGB)다.
- **아트** (`scripts/build-nav-warehouse-icon.py` 신규 → `public/assets/icons/nav_warehouse_v1.png`, 128×128 팔레트 PNG(tRNS)·6.2KB): ① 배경은 **테두리에 닿은 검정 성분(luma<12)만** 연결 요소로 지우고 `binary_fill_holes`로 판금 사이 어두운 홈은 남긴다(안쪽이 뚫리지 않는다). ② 실루엣 bbox로 잘라 **영역 평균(BOX) 축소**로 가장자리를 부드럽게 만들고(premultiply 후 unpremultiply — 검은 테두리 없음), 보이는 폭을 기존 `nav_market_v2.png` 알파 bbox(6..122 = 116px)와 같게 맞춰 중앙에 앉힌다. ③ 어두운 오크가 하단 메뉴의 어두운 버튼(`#17100d99`) 위에서 다른 3탭에 묻히지 않도록 **톤 보정(감마 .72·게인 1.08·채도 1.12)과 실루엣 바깥 옅은 빛 테두리(반경 1.4px·강도 .5)** 를 넣었다. 48px 실물 크기 3배 비교(`downloads/nav_check_final_3x.png`)에서 은빛 갑옷·불꽃 검·황금 저울과 같은 무게로 읽힌다.
- **UI** (`src/ui/interface.ts`): `navIcons.warehouse`를 추가하고 `<nav class="bottom-nav">`의 `market` 버튼 **바로 뒤**에 `<button data-modal="warehouse" type="button" aria-label="공용창고" title="공용창고">`를 넣었다. 클릭 동작은 새 코드가 아니라 **이미 있던 `ui.open('warehouse')`** (모달 본문은 `modals/charactersModal.ts`의 `renderWarehouse`/`loadWarehouse`) 그대로다. 배지·점은 달지 않았다.
- **CSS** (`src/styles/hud.css`): 3탭과 같은 아이콘 정렬 보정 변수(`--menu-icon-scale: .9931`·`--menu-icon-y: .3906%`)를 warehouse 버튼에도 준다. 4탭 실폭은 360px에서 230px(좌 10 + 48×4 + 6×3)이고, 359px 이하 미디어쿼리(42px·gap 3 → 186px)와 액션 패드(`right:10`, `≤399px`에서는 `bottom:68`)가 서로 겹치지 않는다. 360×740·390×844 실배치 검수 이미지 `downloads/djrpg_nav_warehouse_layout_360_390.png`에서 확인했다(액션 패드 3원을 CSS 좌표대로 함께 그려 겹침 없음).
- **테스트** (`tests/equipment-info.test.mjs`): 하단 메뉴 순서 검사를 `['equipment','skills','market','warehouse']`로 바꾸고, 거래소 다음 위치·아이콘 경로·PNG 128×128(IHDR) 규격 검증을 추가했다.
- **검증**: `npx tsc --noEmit` 통과, `node --test tests/{equipment-info,modal-ui,modal-interaction,journey-ui}.test.mjs` **34/34** 통과, `npx vite build` 성공. PR #187의 Cloudflare Pages 체크 통과(Workers Builds는 저장소의 오래된 설정으로 상시 실패).
- **배포**: PR #187 스쿼시 병합 `7ed2712a6cfa` → 운영 `https://djrpg.pages.dev/version.json` = `7ed2712a6cfa`(`builtAt 2026-11-20T12:03:10.958Z`). `/assets/icons/nav_warehouse_v1.png` **HTTP 200 `image/png` 6,181B**, 원격 sha256 `6598546…a2ddf1` = 로컬과 동일. 배포 번들 `index-Cs6ajptJ.js`에 `data-modal="warehouse" … aria-label="공용창고"`와 아이콘 경로, `index-S4XFwZRg.css`에 `.bottom-nav [data-modal=warehouse]` 규칙이 들어간 것을 확인했다.
- **미확인**: 로그인 뒤 인게임 화면에서 4탭이 실제로 어떻게 보이는지는 실기 확인하지 않았다(게스트 계정을 새로 만들지 않았다). 사용자가 새로고침하면 바로 보인다.
- **참고**: 오픈 PR #182(작업 216)도 `src/ui/interface.ts`를 고치지만 액션 패드 아이콘 쪽이라 하단 메뉴 구간과 겹치지 않아 진행했다. 리베이스 중 `docs/TASK.md`만 충돌했고(다른 작업 행), 코드 충돌은 없었다.

## 2026-11-20 · songduckjin 작업 218 장비 등급색 발광 — 필드 캐릭터·장착 화면의 착용 투구·갑옷·무기
- 요청: `#18318` "아니 장착한 일러스트일때만" → `#18330` "전투화면에서만 인데" → `#18362` "전투중 내 캐릭터 검과 투구 갑옷에만 그리고 장착화면에서도 마찬가지" → `#18408` "유니크 이상만 반짝였다 말았다 그래야돼 전설은 좀 더 빨갛게" → `#18484` "빛이 아니고 저건 물감칠같아" → `#18496` "전체가 반짝여야돼 빛으로" → `#18521` **"v2에 1번으로 가자 유지되는건 아니지?"**(확정 = 시안 v2의 색·세기, 단 계속 유지가 아니라 펄스).
- **값** (`src/game/render/gearGlow.ts` 신규): 유니크 `#fb923c` 2.6초 peak .58, 전설 `#dc2626` 2.3초 peak .64. 일반·매직·래어·에픽은 표에 없어 빛이 없다. `gearGlowAmount(time, tone)` 는 `(1-cos(2πt/T))/2` 를 smoothstep 한 뒤 peak 를 곱해 **0초에 원래 색 → 반 주기에 최대 → 다시 0** 으로 돌아온다(필드·장착 화면이 같은 파형을 쓴다).
- **필드**(`render/entities.ts` `syncGearGlow`·`render.ts` `heroGlow`): 부위 스프라이트(`hero`(갑옷은 몸체 시트)·`heroHelmet`/`heroMageHelm`·`heroWeapon`/`heroBow`/`heroStaff`)를 **같은 텍스처로 복제해 `blendMode='add'`** 로 얹고 tint=등급색, alpha=파동값만 매 프레임 갱신한다(새 에셋·셰이더 없음). 갑옷은 몸체 시트에 얼굴까지 들어 있어 **`heroGlowMask`(흰 Sprite)로 목 밑동 아래만** 남긴다 — 목 좌표는 투구 자세 표(`helmetPlacement`)를 그대로 쓰고 궁수·마법사는 셀 상수 104. 딜레이 크러싱 잔상(`cloneHeroLayers`)에서는 발광 복제본을 제외해 같은 파츠가 두 번 그려지지 않게 했다. 테스트 스텁 뷰처럼 `heroGlow` 가 없으면 그 자리에서 만든다.
- **장착 화면**(`ui/equipmentPortrait.ts` `renderEquipmentGlowLayers`): 초상화 본체는 종전 dataURL 캐시 그대로 두고, **부위별 투명 발광 PNG**(갑옷·투구·무기)를 따로 합성한다. `paintPatch` 가 파츠 픽셀의 **루미넌스**를 광량으로 써 `light = min(1.6, .3 + 1.2*lum)` 만큼 등급색 빛을 만들고(`shadowBlur` 후광 포함), 레이어가 `mix-blend-mode: screen` 으로 본체 위에 더해진다 — 어두운 틈새·무늬는 남고 밝은 면이 빛난다(1차 구현은 등급색 74%를 덮는 '물감칠'이어서 사용자 피드백 `#18484`·`#18496` 뒤 PR #188로 교체), 갑옷 레이어는 머리 자리(셀 228,74 r38×44)를 `destination-out` 으로 도려내 맨 얼굴은 원래 색으로 남긴다. 파츠가 없는 부위(기본 검은 몸체 시트에 구워짐)는 레이어를 만들지 않는다. `equipModal` 은 `.showcase-glow` 위에 레이어를 얹고 `--gear-cycle` 로 CSS `gear-rarity-pulse`(0%/100% opacity 0 ↔ 50% 1)를 돌린다 — `prefers-reduced-motion` 에서는 멈추고 opacity .5 로 고정.
- **작업 217 관계**: UI 카드(가방·장착 슬롯·거래소·도감) 펄스는 PR #175 롤백(#183)에서 원복됐고, 이 작업은 그 뒤 `origin/main`(6bafcfc) 위에 리베이스해 머지한다.
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과(이 스파스 작업 트리에는 `public/assets/item-art` 가 없어 `npm run build` 의 `verify-item-art` 단계는 실행 불가 — 동일 명령을 `generate-version → tsc → vite build` 로 나눠 통과 확인). 테스트는 변경 영역 19개 파일 **202건 중 182 통과 / 20 실패**로, 실패 20건은 자산 파일이 없는 스파스 체크아웃 때문이며 **`origin/main`(b2fbe61) 동일 조건 실행 결과와 완전히 같은 목록**이다(회귀 0). 신규 `tests/gear-rarity-glow.test.mjs` 9/9.
- 시안: `downloads/djrpg_equip_glow_preview_v2.png`(확정) · `downloads/djrpg_equip_glow_preview_v3.png`(빛 버전) · 생성기 `work/glow-mock/build_preview_v2.py`.
## 2026-11-20 · songduckjin 작업 217 롤백 — 장비 등급색 펄스 글로우(PR #175) 원복

- **요청(사용자)**: "아까 그건 롤백해야돼". 19:41(KST)에 배포한 카드·슬롯 등급색 펄스 글로우는 사용자가 원한 화면이 아니었다 — 실제로 원한 것은 **전투 중 내 캐릭터의 검·투구·갑옷 파츠**와 **내 정보 장착 화면 전신 캐릭터**에 각 장비 등급색 빛이 들어왔다 돌아오는 것이고, 그쪽은 시안 확인 뒤 별도 작업으로 한다. 그래서 카드 펄스 기능만 깔끔히 되돌린다.
- **원복 방식**: `git revert 8d474348bbed` — PR #175는 스쿼시 커밋(부모 `17f2eb9` 하나)이라 `-m` 없이 되돌린다. `docs/TASK.md`만 충돌했고(그 뒤 문서 커밋 #176·#178이 같은 블록을 고쳤다), 217 표 행을 **롤백 행**으로 바꾸고 217 이력 줄을 롤백 사유로 교체해 해소했다. 작업 중 `main`이 크게 움직여(#179 미리보기 대공사·#177 월드보스·#181 부팅 복구 병합, 원 `33a2505` → `a8ddc85`) 최신 `origin/main` 위로 리베이스했고, 그 충돌(`docs/{TASK,WORKLOG,CODE_MAP,QUICK_PATCH}.md`, 삭제한 `tests/rarity-glow.test.mjs`가 `main`에서 수정됨)은 `main`의 새 내용을 살리고 217 항목만 걷어내는 쪽으로 풀었다.
- **되돌린 것**: `src/styles/rarity.css`(68줄) 삭제, `src/styles/main.css`의 `@import './rarity.css'` 제거, `src/styles/modals.css`·`src/styles/codex.css`의 등급별 정적 `box-shadow`(magic~legendary) 복구, `tests/rarity-glow.test.mjs`(138줄) 삭제, `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`의 217 안내 제거.
- **그대로 둔 것**: 등급별 `border-color` 규칙과 `market.css`의 `.market-pick` 테두리색 — PR #175 이전과 같은 상태다.
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과(빌드 CSS `dist/assets/index-CF2jIIg1.css`에 `rarity-pulse` 키프레임 0건, `#60a5fa55`·`#f8717166` 등 정적 등급 그림자가 복귀한 것을 확인). `npm test` **820건 중 795 통과 / 25 실패** — 실패 25건은 같은 체크아웃의 `origin/main`(`a8ddc85`)을 같은 방식으로 돌린 결과와 **완전히 같은 목록**이다(이 체크아웃에 파츠 PNG·코스튬 아틀라스가 없어 생기는 기존 실패: 궁수·마법사·전사 시트/파츠, v3 아틀라스, 보물 주머니 개봉 그림 등). 즉 회귀 0건.

## 2026-11-20 · fks3997 작업220 운영 핫픽스 — 시즌2 다이아 우편 받기 500(원장 UNIQUE 충돌)
- 요청: 운영(`djrpg.pages.dev`)에서 **우편 `받기`·`모두 받기`가 안 되는 긴급 버그**(사용자 제보 `#5539`). 원인은 시즌 초기화가 `djrpg_journey`만 비우고 다이아 원장(`djrpg_shop_ledger`, `UNIQUE(account_id,source_type,source_id)`)은 남기기 때문에, 시즌1에 `all-idle-launch-diamonds-2026-11-20`(1,000 다이아)를 이미 받은 계정이 시즌2에 같은 ID로 4,000 다이아를 다시 받으면 `INSERT`가 UNIQUE 충돌 → 500.
- **시즌2 전용 ID** (`server/journey-state.mjs`): `DIAMOND_MAIL_ID = 'all-idle-launch-diamonds-2026-11-20-s2'`, 옛 값은 `LEGACY_DIAMOND_MAIL_ID`로 남겨 마이그레이션 기준으로만 쓴다.
- **이미 받아 둔 옛 우편 구제** (`migrateLegacyDiamondMail`, `advanceJourney`에서 우편 지급 전에 호출 → `journeyState`를 지나는 모든 경로): 우편함에 옛 ID **미수령** 우편이 있으면 그 자리에서 새 ID로 바꾸고 `state.notices`의 지급 이력도 새 ID로 맞춘다. 이미 새 ID 우편이 따로 있으면 옛 우편은 지워 4,000 다이아가 두 통이 되지 않는다. 받은 우편(`claimedAt`)은 건드리지 않는다. 시즌 초기화 직후 새 코드로 접속한 계정은 새 ID로 한 통만 받는다.
- 검증: `tests/journey.test.mjs`에 2건 추가(① 시즌1 원장 기록이 남은 계정의 `모두 받기`·개별 `받기` → 4,000 다이아 지급·원장에 시즌1·시즌2 행 공존·두 번째 받기는 `NOT_AVAILABLE` ② 옛 ID 미수령 우편이 새 ID로 바뀌어 한 통만 남고 지급 이력도 새 ID). 수정 전 코드로 되돌리면 이 2건이 실제로 실패하는 것까지 확인. `journey` **18/18**, `season-reset`·`journey-ui`·`journey-metrics`·`shop`·`achievements` **30/30** 통과, `tsc --noEmit`·`vite build` 통과. 전체 826건 중 769 통과/57 실패는 수정 전과 같은 수(스파스 체크아웃에 원본 아트가 없어 실패하는 자산·렌더 테스트).
- **후속(같은 날 배포)**: 시즌1에 다이아를 받지 않은 계정은 초기화(20:10)~핫픽스 배포(20:31) 사이에 옛 ID로 4,000을 정상 수령할 수 있었고, 그러면 새 ID로 한 번 더 붙었다. `advanceJourney` 지급 조건에 **“옛 ID가 `state.notices`나 `state.mail`에 이미 있으면 주지 않는다”**를 1줄 추가해 수령 뒤 우편을 지운 계정에도 중복 지급이 없게 했다(시즌1에 1,000을 받은 계정은 옛 ID 우편이 우편함에 남아 마이그레이션으로 받으므로 영향 없음). `journey` **19/19**, 관련 묶음 **49/49**, 가드를 빼면 새 테스트가 실패하는 것까지 확인.
- 배포: PR 스쿼시 병합 → `main` 자동 배포 → `https://djrpg.pages.dev/version.json` 새 커밋 확인.

## 2026-11-20 · fks3997 작업214 보물 주머니 9컷 프레임 모션·Canvas 빛/입자·1.8초 마무리·스포일러 제거(미리보기 배포)
- 요청: 사용자 인게임 피드백 — `#5204` "아니 빛이 그냥 빛이어야 되는데 뭔 흰색 모형이 있어?", `#5222`·`#5241` "이미지를 흔들지 말고 프레임을 더 넣어서 모션으로"·"빛난 후에는 템 뜨는 거랑 주머니 바닥에 풀리는 게 더 빨랐으면 좋겠어"·"버튼 누르면 위에 글자 떠서 미리 알게 돼(스포일러 제거)"·"전체적으로 끊기고 어색해, 1차원적인 효과 넣지 말고 최대한 부드럽고 세련되게". `main` 병합 금지.
- **중간 컷 4장 추가(6 → 9컷)** (`work/pouch_mid.py` → `public/assets/icons/treasure_pouch_{step1b,step2b,step3b,slump0}_v3.png`): 인접 컷을 `images --edit`로만 국소 수정해(같은 카메라·재질·배경, 포즈만 변화) ① 끈이 당겨지며 부푸는 ② 끈이 조금 더 풀리며 입구가 틈새처럼 벌어지는 ③ 반쯤 활짝 열리며 빛이 비치는 ④ 무너지며 풀리기 시작하는 컷을 만들고, `work/pouch_alpha.py` 파이프라인(테두리 flood-fill + 색거리×밝기 soft alpha, premultiply 축소)으로 **512×512 RGBA**로 떠서 **1단계 `treasure_pouch_v2.png` 몸통 bbox(74,57,433,447)** 기준으로 폭·아래끝·가로 중심을 맞췄다(주머니가 튀지 않는다). 무너지는 컷은 빛이 배경으로 번진 1차 결과의 알파가 남아 검은 테두리가 생겨, 빛을 입구 안에만 두도록 다시 만들어 통과시켰다. `POUCH_FRAME_URLS` 9컷 = 닫힘 → 부푸는 → 끈 헐거워짐 → 틈새 → 빛 새어 나옴 → 반쯤 활짝 → 활짝 → 무너짐 → 바닥에 납작. 6컷 중 흔들림 없이 빛만 남은 자리를 메우느라 `slump1_v2`는 시퀀스에서 빠졌다(파일은 남겨 둠 — 광선이 다시 나타나 빛이 단조롭게 잦아들지 않았다).
- **Canvas 빛·입자** (`src/ui/pouchLight.ts` 신규): `conic-gradient` 부채꼴(`.pouch-glow::after`)·단단한 흰 원판(`.pouch-glow::before`·`.pouch-flash::before`·`.pouch-halo`)과 `pouch-glow`/`pouch-flash`/`pouch-halo` 키프레임을 **CSS에서 전부 삭제**하고, 무대에 560×560 투명 Canvas 한 장(`.pouch-light`, `pointer-events: none`, `mix-blend-mode: screen`, DPR 2 상한)을 얹어 `requestAnimationFrame` 60fps로 그린다. 쪼으는 구간에는 작은 원 4겹을 `lighter`로 더한 **경계 없는 가우시안 백색 글로우**가 70→128px로 고조되고 흰빛 가루 26개가 입구로 모여들며(나선 + sin 페이드), 1.075초 절정에는 130→370px 순백 섬광이 0.42초에 걸쳐 가라앉고 36개 입자가 사방으로 흩어져 0.5~0.9초에 사라진다(1/3은 짧은 꼬리). `createPouchLight()`는 2D 컨텍스트가 없으면 `null`을 돌려주어 테스트·구형 환경에서도 안전하고, `prefers-reduced-motion`이면 아예 만들지 않는다.
- **타임라인 2.8초 → 1.8초** (`pouchModal.ts`): `POUCH_FRAME_AT [0,220,470,700,890,1000,1075,1180,1300]`·`POUCH_BURST_MS 1075`·`POUCH_RESULT_MS 1440`·`POUCH_OPEN_MS 1800`. 앞쪽 텐션 1.075초, 절정 뒤 **0.365초 만에 보상 카드**, 주머니는 1.18초에 무너지고 1.3초에 바닥에 납작해진다. `pouch-shake`·`pouch-burst`를 없애 **그림은 흔들리지 않고 컷으로만** 움직이며, 컷 전환은 380ms → **120ms linear** 크로스페이드로 줄여 60fps에 가까운 촘촘한 모션을 만들었다(두 장 겹친 스택은 그대로). 결과 카드 등장은 `pouch-reveal 420ms 1440ms`.
- **스포일러 제거** (`#5228`): `openPouchWindow`가 [열기]를 누른 즉시 부르던 `ui.message(...)`와 `ui.sharePouchLegend(...)`를 `pendingAnnounce`로 묶어 **`POUCH_RESULT_MS`(1.44초) 타이머**로 옮겼다. 세이브 차감·지급은 종전대로 누르는 즉시 1회이며, 연출 중 창을 닫으면 타이머를 정리하되 남은 결과 알림은 그 자리에서 보내(깐 주머니의 결과를 잃지 않는다).
- 검증: `npx tsc --noEmit` 통과, `npx vite build` 통과(`generate-version.mjs` 선행), `tests/treasure-pouch.test.mjs` **21/21** — 9컷 자산(512 RGBA·이름)·새 타임라인 상수·`pouch-shake`/`conic-gradient`/CSS 빛 레이어 없음·120ms 크로스페이드·Canvas 순백색만·rAF 프레임에서 입자 개수·실타이머 9컷 전환(0.22/0.47/0.7/0.89/1.0/1.075/1.18/1.3초)·`ui.message`가 1.44초 전에는 0건, 뒤에 1건인지까지 검사. 빛 그림은 `work/pouch_light_mock.py`(같은 수식을 numpy로 옮긴 것)로 1.0초·1.075초·1.25초 프레임을 미리 렌더해 경계 없는 번짐을 확인(`work/pouch_out10/light_preview.png`). **`main` 병합 안 함**, 실기 모션·발열 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업213 보물 주머니 흰빛·쪼으는 연출·모달 UI 다듬기(미리보기 배포)
- 요청: 사용자 인게임 피드백(`#5057` 5건 + `#5069` 글자 크기 + `#5083`→`#5094` 화면 밝아짐) — ① 흰빛 ② 쪼으는 텐션·부드러운 크로스페이드(2.7~3.0초, 360~420ms) ③ 상단 한 줄(`확률표`·`보물 주머니`·`×`) ④ `장비 획득` 등 획득 문구 제거 ⑤ 등급 글자 제거 + 결과 카드 글자를 그림보다 작게 + 팝업보다 조금 큰 백색 후광. `main` 병합 금지.
- **타임라인 1.85초 → 2.8초**(`src/ui/modals/pouchModal.ts`): `POUCH_FRAME_AT [0,860,1260,1680,2120,2500]`·`POUCH_RESULT_MS 2280`·`POUCH_OPEN_MS 2800`. 앞부분 0.86초를 **쪼으는 구간**으로 길게 두고(떨림이 점점 커지고 주머니가 힘을 모으듯 0.96배까지 움츠러든다), 2→3→4→5→6단계 간격을 380~440ms로 벌려 한 장이 다음 장으로 충분히 녹아들게 했다.
- **크로스페이드 210ms → 380ms ease-in-out**(`styles/modals.css` `img.pouch-art`): 두 장을 겹친 스택은 그대로 두고 전환 시간만 늘렸다. CSS 지연도 같은 박자 — `pouch-shake 860ms`(쪼으는 떨림)·`pouch-burst 1660ms 840ms`(1.68초에 가장 크게 부풀며 2.5초에 가라앉음)·`pouch-glow 1620ms 1180ms`(빛이 새어 나와 1.68초에 가장 밝고 서서히 잦아듦)·`pouch-flash 520ms 1660ms`·`pouch-halo 1160ms 1640ms`·`pouch-reveal 560ms 2280ms`. 떨림은 `img.pouch-art`, 부풀기는 `.pouch-art-stack`에 나눠 걸어 두 애니메이션이 `transform`을 서로 덮어쓰지 않게 했다(종전에는 `pouch-burst`가 `both`로 0% 값을 먼저 잡아 흔들림이 가려졌다).
- **흰빛**(`#5057`): `pouchGlowInk()`가 보상 종류·등급과 무관하게 `POUCH_WHITE_LIGHT '#ffffff'`를 돌려주고, 글로우 `--pouch-glow: #ffffff`·섬광 `radial-gradient(circle, #ffffff 0%, #ffffffaa 26%, …)`·placeholder `.pouch-art-glow`까지 노란/주황 계열(`#ffd977`·`#f2b658`·`#fffbe8`)을 걷어냈다. `overflow: visible`(카드·무대)는 그대로라 빛은 팝업 밖까지 퍼진다.
- **팝업 크기 후광**(`#5083`→`#5094`): 처음 요청은 화면 전체(`fixed inset:0`) 섬광이었으나 사용자가 "화면 전체 말고 주머니 팝업창 조금 넘게"로 정정 — `.pouch-halo`를 `position: absolute; left/top 50%; width: clamp(460px, 128vw, 520px); aspect-ratio: 1` 원형으로 두어 330px 팝업보다 조금 크게 테두리 밖으로 살짝 넘치며(피크 opacity .58) 1.16초에 걸쳐 잦아든다. `pointer-events: none`.
- **상단 한 줄**(`#5057`): 제목 `h3`를 별도 줄에서 빼 `.pouch-window-top`(grid `auto minmax(0,1fr) auto`)의 가운데로 옮겼다 — 왼쪽 `확률표`, 가운데 `보물 주머니`, 오른쪽 `×`.
- **결과 카드**(`#5057`·`#5069`): `pouch-result-label`(장비/금화/스킬북 획득)과 `pouch-result-grade`(일반·레어…, 스킬북) 요소를 없애고 그림 + 이름(등급 색)만 남겼다. 이름 14px→11.5px·금화 15px→12px로 줄이고 줄간격 1.2·`overflow-wrap: anywhere`, 그림은 44px→56px(금화 뭉치 72px→84px)로 키워 **그림이 주인공**이 되게 했다. 없어진 두 클래스의 CSS도 삭제.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. `tests/treasure-pouch.test.mjs` 20/20 — 새 타임라인 상수·380ms ease-in-out·흰빛(빛 규칙에 노란/주황 없음)·후광 크기·상단 한 줄·획득/등급 글자 없음·이름 글자 < 그림/3·실타이머 6단계 전환(0.86/1.26/1.68/2.12/2.5초)까지 검사. **`main` 병합 안 함**, 실기 모션 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업212 보물 주머니 6단계 흘러내림·금화 뭉치 + 가방/보스전 UI 정리(미리보기 배포)
- 요청: `preview/gravel-background-fks3997`(d0595f4) 위에 ① 6단계 크로스페이드 개봉(약 1.85초, 두 장을 겹쳐 서서히) ② 흘러내림 2장·금화 뭉치 그림 ③ 금화 당첨 카드에 금화 뭉치 ④ 미리보기 테스트 우편 `preview-pouch-test-3`(100개) ⑤ 스킬북 칸 1:1·`×1` 오른쪽 아래 ⑥ `1개 더 열기` 연속 개봉 ⑦ 모달 축소·빛이 팝업 밖으로 ⑧ 가방 주머니 클릭 즉시 개봉 ⑨ `⚔ 보스 도전` 층 배지 옆 ⑩ 주머니 `×100` ⑪ 보스전 일반 몹 미등장·자동 등반 중 패배 시 1마리부터. `main` 병합 금지.
- **에셋**(`work/pouch_new.py` → `public/assets/icons/`): `downloads/pouch-slump-1.png`·`pouch-slump-2.png`·`pouch-gold-pile-v2.png`를 `work/pouch_alpha.py`(테두리 flood-fill + 색 거리×밝기 soft alpha, premultiply 축소)로 512×512 RGBA 변환. 흘러내림 두 장은 **저장소의 1단계 `treasure_pouch_v2.png` 몸통 bbox(74,57,433,447) 기준**으로 폭·아래끝·가로 중심을 맞춰(slump1 0.917배, slump2 0.802배) 그림이 바뀔 때 주머니가 튀지 않고 제자리에서 흘러내린다. 금화 뭉치는 430px 폭·가운데 정렬.
- **6단계 크로스페이드**(`src/ui/pouchArt.ts`·`pouchModal.ts`·`styles/modals.css`): `POUCH_FRAME_URLS` 6장, `createPouchArt()`가 같은 크기의 `img.pouch-art` **두 장을 겹친 `.pouch-art-stack`**을 만들고 `setPouchFrame()`이 뒤 장에 다음 그림을 넣은 뒤 `is-front`를 넘겨 CSS `opacity` transition(210ms)으로 서서히 전환한다(뚝 끊김 없음). `POUCH_FRAME_AT [0,260,470,650,1150,1480]`·`POUCH_RESULT_MS 1300`·`POUCH_OPEN_MS 1850`. CSS는 같은 박자 — `pouch-shake 320ms`(두근거림)·`pouch-burst 700ms 250ms`(부풀며 떠오름)·`pouch-glow 700ms 650ms`(빛줄기·섬광이 연해짐)·`pouch-flash 320ms 650ms`·`pouch-reveal 460ms 1300ms`(보상 카드). `1개 더 열기`는 `resetPouchArt()`로 두 장을 1단계로 되돌리고(전환 끔) `is-opening`을 다시 붙여 처음부터 새로 시작한다.
- **무대·모달 레이아웃**: 보상 카드를 무대 위쪽에 절대 배치해 **바닥에 납작하게 접힌 주머니 위 빈 공간**에 뜨게 했고, 카드는 330px·여백 축소로 아담하게 줄이되 `overflow: visible`로 열어 글로우·섬광이 팝업 테두리 밖까지 퍼진다(확률표만 자체 스크롤).
- **금화 보상**: `pouchResultCard`의 금화 분기가 `pouch_gold_pile_v2.png`(72px, drop-shadow)를 함께 그려 장비·스킬북과 같은 자리에 큰 그림으로 보여 준다.
- **가방·주머니 UI**(`equipModal.ts`·`styles/modals.css`): `.bag-item.skillbook-item`의 `aspect-ratio: auto; min-height: 84px`를 없애 10열 칸을 모두 1:1 정사각형으로 맞추고, `×1`은 유지하되 `.bag-item.skillbook-item .skillbook-count`를 **오른쪽 아래**로 내려 왼쪽 위 직업 배지와 겹치지 않게 했다(주머니 `×N`은 오른쪽 위 그대로, `×100` 세 자리도 nowrap). 가방에서 주머니 칸을 한 번 누르면 상세 패널 없이 `openPouchWindow`가 바로 뜬다.
- **개봉 창 버튼**: 주 버튼은 `열기` → 개봉 후 남은 주머니가 있으면 **`1개 더 열기`**(보유 N개 표시), 0개면 `확인`. 보조 버튼은 늘 `닫기`, 우상단 `×` 유지 — 중간에 그만두고 나갈 수 있다.
- **미리보기 우편**(`server/journey-state.mjs`): `PREVIEW_POUCH_MAIL_ID` `preview-pouch-test-3`(test-2를 받은 계정도 새로고침하면 다시), `PREVIEW_POUCH_MAIL_POUCHES = 100`, 제목 `[미리보기 테스트] 보물 주머니 100개`. 운영 호스트 지급·표시 없음은 그대로.
- **보스전**(`src/game/world.ts`·`ui/hud.ts`·`styles/hud.css`): `bossRetryAvailable`(보스에게 쓰러지면 true, 다음 층으로 오르면 false)로 `bossRetryReady`를 다시 정의해 **자동 등반이 켜져 있어도** 버튼이 뜬다. 보스 예약·보스 생존 중에는 일반 몹을 부르지 않고(`bossFight`), 보스가 나올 때 남은 일반 몹도 정리한다. 최고층에서 자동 등반 중 보스에게 지면 `autoClimb`를 끄지 않고 `floorKills`를 0으로 돌려 1마리부터 다시 잡게 하며, 목표를 채우면 기존 `kill()` 규칙이 보스를 자동으로 다시 부른다(아래층은 종전 규칙 그대로 — `#5028`). HUD는 `.status-floor`로 층 배지와 `⚔ 보스 도전`을 한 덩어리로 묶어 바로 옆에 붙였다.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과, `treasure-pouch` 16/16(6장 규격·타임라인·겹친 두 장 전환·`1개 더 열기`·가방 클릭 즉시 개봉·`×100`/`×1` 위치), `journey`·`journey-ui` 29/29(우편 100개), `world-movement` 19/19(보스전 일반 몹 없음·자동 등반 유지·아래층 불변), 그 밖의 묶음 704건 중 702 통과 — 실패 2건은 작업 전과 같은 `costume-field-render`(d0595f4 원본에서도 동일하게 실패). **`main` 병합 안 함**, 실기 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업210 보물 주머니 4단계 개봉 모션·투명 배경 + 보상 아이콘 · 월드보스 하루 3회 복구 · 보스 업적 정예 제외 · 로그아웃 안전장치
- 요청: `preview/gravel-background-fks3997`(6799108) 위에 ① 주머니 그림의 어두운 배경 제거(`#4368`·`#4385`) ② "당연히 부드럽게 열어야지"(`#4404`) — 2장이 아닌 **4단계 스무스 애니메이션** ③ "보물주머니 보상주는거 이미지로 넣어줘"(`#4461`) ④ "월드보스 3번 치게 해야지"(`#4445`) ⑤ "보스가 아니잖아 … 던전이나 메인 스테이지 보스까지만"(#4475·#4486) ⑥ 저장 실패로 로그아웃에 갇히지 않게(#4347 후속). `main` 병합 금지.
- **에셋**: `downloads/pouch-option1-leather.png`·`pouch-step2-loosening.png`·`pouch-step3-peeking.png`·`pouch-open-leather.png` 4장을 512×512 RGBA로. 배경색은 테두리 20px 중앙값, 테두리에서 **색 거리 ≤ 6 flood-fill**로 확실한 배경만 외곽 처리(주머니 안쪽 그림자 보존), 외곽 12px 띠에서 **색 거리 × 밝기** soft alpha(빛 폭발 주변의 어두운 열기는 눌리고 빛줄기·반짝임은 남는다), premultiply 축소. 네 장의 **몸통 폭·아래끝·가로 중심을 1단계에 맞춤**(3단계 0.898배) — 그림이 바뀔 때 주머니가 튀지 않는다. 파일명 `_v2`(immutable 캐시 회피), 기존 `treasure_pouch.png`는 참조 0이라 남겨 둠.
- **4단계 모션**(`src/ui/pouchArt.ts`·`src/ui/modals/pouchModal.ts`·`src/styles/modals.css`): 창을 열 때 네 장을 미리 받고(`preloadPouchFrames`), `[열기]`마다 1단계로 되돌린 뒤 `POUCH_FRAME_AT [0,200,420,640]`ms에 2·3·4단계로 갈아 끼운다. CSS는 같은 박자 — `pouch-shake`(0~0.2초 부풀며 흔들림)·`pouch-burst`(0.2~0.9초 부풀며 떠오름, 0.64초 정점)·`pouch-glow`(0.42초부터 등급색/황금빛 광선)·`pouch-flash`(0.62초 섬광)·`pouch-reveal`(0.9초 결과 카드, `POUCH_RESULT_MS`). 세이브 차감·버튼 잠금 계약은 그대로(`POUCH_OPEN_MS 950`), `prefers-reduced-motion`이면 곧바로 4단계·결과. 투명 PNG라 `img.pouch-art`의 `box-shadow`를 `drop-shadow`로 바꿔 사각 상자 그림자를 없앴다.
- **보상 아이콘**(`src/ui/modals/utilityModal.ts`·`styles/modals.css`): `pouchReward`가 `<img class="pouch-reward-icon" src="/assets/icons/treasure_pouch_v2.png">`(19px, 금화 아이콘과 같은 인라인 크기) + `보물 주머니 N개`를 함께 그린다 — 일일·주간·업적·우편함이 모두 이 함수를 쓴다.
- **월드보스 3회**(`server/world-boss.mjs`·`ui/modals/worldBossModal.ts`·`game/worldBossLive.ts`·`ui/interface.ts`): `WORLD_BOSS_DAILY_ATTEMPTS` 1 → **3**. `remaining`/`maxAttempts`·"계정당 하루 3회" 안내·입구 배지 `3/3`이 이 값 하나를 본다. 일일·주간 `월드보스 도전` 미션은 종전대로 **1회 참여**로 달성.
- **보스 업적 정예 제외**(`src/game/world.ts` `kill`·`bossCount.ts`·`server/journey-state.mjs` 주석): `if (enemy.boss) this.save.bossKills++;` — 필드 정예 몹은 보스가 아니라 세지 않는다. 사냥터 층 보스 + 던전 5·10층 보스 + 월드보스 도전(도전마다 1회)만 합산.
- **로그아웃 안전장치**(`src/main.ts`): `game-logout`에서 `flush()`가 `false`면 `confirm('서버 저장에 실패했습니다. 저장되지 않은 상태로 로그아웃할까요?')`를 띄우고, 확인하면 `clearToken(); location.reload();`, 취소하면 로그인 상태를 유지한다(갇히지 않음).
- **`⚔ 보스 도전`·아래층 보스 없음**(`#4566`·`#4599`): `World.bossFloor()`가 **최고 도달 층에서만** 보스를 허용하고(아래층은 목표를 채워도 `floorKills`만 0으로 돌려 일반·정예 반복), `bossRetryReady`는 최고 층 + 자동 등반 꺼짐 + `floor < MAX_FLOOR`일 때 true다. `challengeBoss()`가 자동 등반을 다시 켜고 기존 몹을 정리한 뒤 그 층 보스를 바로 소환하며, 또 지면 다시 버튼이 살아나고 이겨 다음 층으로 올라가면 사라진다. HUD `.status-main`(층 버튼 옆)에 `⚔ 보스 도전`(`.boss-retry`, 금빛 테두리·은은한 맥동)을 붙였고, `offline.ts`도 아래층에는 보스 몫(보스 처치·보스 금화·보스 드롭)을 넣지 않는다.
- **미리보기 전용 테스트 우편**(`#4580`·`#4589`): 사용자가 미리보기에서 주머니를 다 열어 모션을 확인할 수 없어, `preview` 호스트에서만 계정당 1회 `[미리보기 테스트] 보물 주머니 1개`(`preview-pouch-test-1`, `pouches: 1`·만료 없음)를 준다. `season.mjs` `isProductionHost`/`isPreviewHost`로 판정하고, `journey.mjs` `snapshot`/`mutate` → `journeyState` → `advanceJourney(..., preview)`로 전달한다. **운영 `djrpg.pages.dev`에서는 지급도 표시도 없고, 공용 DB에 남아 있으면 운영 접속 때 `stripPreviewPouchMail`이 지운다**(지급 이력은 `state.notices`에 남겨 다시 붙지 않는다). 운영 배포 전에는 `grantPreviewPouchMail` 호출 한 줄만 빼면 된다.
- **타직업 스킬북은 가방으로**(`#4617`): `bagCapacity.countedInBag(item, job)`이 40칸에 **장비 + 다른 직업 전용 스킬북**을 함께 세고(내 직업 책·보물 주머니 제외), `equipmentCount`·`canStoreItem`이 `save.job`을 받는다. 스킬 창(`skillBooks.ts`)은 내 직업 책만 카드로 보여 주고 "다른 직업 전용 스킬북은 가방에서 확인" 한 줄을 남긴다. 가방(`equipModal.ts`)은 다른 직업 책을 직업 배지와 함께 보여 주고(`내 직업만 보기`면 숨김) 상세에 `다른 직업 전용 스킬북 · 경매장 판매/공용창고 보관 가능`만 적으며 사용 버튼은 없다. 표기는 `가방 N/40`. 서버도 `server/skill-ids.mjs` `skillBookJobOf`·`countedInBag`으로 `database.mjs` `reconcileItems`와 `market.mjs` 수령함 받기의 40칸 검사를 같이 맞췄다(`tests/bag-job-books.test.mjs`가 두 판본을 대조).
- **몹 한 마리당 아이템 1개 — 70:30**(`#4628`·`#4639`·`#4649`): `items.ts` `itemDropChance(floor, boss)`는 일반(정예 포함) 1층 0.20% → 20층 0.80%, 보스 1층 3.0% → 20층 12.0%에서 멈추고, `rollItemKind()`가 당첨된 1개를 장비 70%·스킬북 30%로 가른다. `world.ts` `kill`·`offline.ts`가 **한 번만** 굴려 1개만 떨어뜨리며, `equipmentDropChance`·`skillBookDropChance`는 같은 값의 70%·30% 호환(던전·던전 보스 5개战利品의 종류 비율이 70:30이 된다).
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. `tests/treasure-pouch.test.mjs` **14/14**(4장 512·RGBA·경로, `POUCH_FRAME_AT`/`POUCH_RESULT_MS`와 CSS 지연 일치, 실제 타이머로 0.26초 2단계·0.48초 3단계·0.70초 4단계·`[한 번 더 열기]` 1단계 복귀), `tests/world-boss-live.test.mjs` **14/14**(3회·2/1/0 `remaining`·4번째 `BOSS_LIMIT`·다음 날 3회), `tests/achievements.test.mjs` **9/9**(일반·정예 0, 보스 +1), `tests/journey-ui.test.mjs` **13/13**(보상 칸 주머니 그림), `tests/world-boss-preview.test.mjs` **7/7**(안내 문구), `tests/world-movement.test.mjs` **16/16**(재도전·아래층 보스 없음), `tests/offline.test.mjs` **5/5**(아래층 보스 몫 없음), `tests/journey.test.mjs` **15/15**(미리보기 우편·호스트 판정), `tests/bag-job-books.test.mjs` **5/5**(타직업 책 40칸·가방 화면·스킬 창), `offline`·`elite-mob`·`field-loot`·`dungeon-battle`·`balance-196` 드롭 계약 갱신 통과, 전체 **696건 중 649 통과**(실패 47은 종전과 같은 `public/assets/**` ENOENT). 실기 모바일 모션 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업209 긴급 핫픽스 — 서버 타직업 스킬북 33종 검증 + 가방 40칸 만석 즉시 자동 분해 + 우편 받기/모두 받기 버튼 대비
- 요청: `preview/gravel-background-fks3997`(91ae02f) 위에 ① 실기 테스트에서 궁수·마법사 **스킬북이 `400 INVALID_ITEM`으로 거부**(`#4213`) ② **우편함 받기/모두 받기 버튼이 활성인지 구분되지 않음**(`#4246`) ③ **가방 40칸이 꽉 차면 설정 이하 장비가 남아 있어도 새 장비를 못 줍음 — 꽉 차면 바로 자동 분해**(`#4286`·`#4297`). `main` 병합 금지.
- **원인**: `server/database.mjs` `itemValid`가 스킬북 `skillId`를 **전사 11종**(`slash2`…`instinct`)으로 하드코딩해, 궁수·마법사 책이 `reconcileItems`에서 400으로 막혔다(재현: 궁수 `doubleShot`·마법사 `fireBolt`·패시브 `bowMastery` → 400, 전사 `slash2`·주머니 → 200). 같은 이유로 `healStaleLoadItems`도 타직업 책을 "깨진 아이템"으로 보고 load에서 지울 수 있었다. `server/journey.mjs`의 `bookNames`에도 전사 11종만 있어 우편·여정 보상 책이 전사 것만 나오고 이름도 옛 이름(`소드 슬래시`)이었다.
- **수정① 33종 단일 목록**(`server/skill-ids.mjs` 신규·`server/database.mjs`·`server/journey.mjs`·`tests/skillbook-server.test.mjs` 신규): 전사·궁수·마법사 **액티브 24 + 패시브 9 = 33종**을 서버 한 곳에 모으고(`skillBookIds`·`skillBookIdSet`·`skillNames`·`skillBookName`·`rollRewardSkillBook`) `itemValid`가 그 집합을 본다. Functions는 `src/game/skills.ts`(TS)를 실행할 수 없어 값을 따로 적되, 테스트가 클라이언트 `allSkillIds`·`allPassiveIds`·`skills`·`passives`와 **순서·ID·이름 일치**를 고정한다. `journey.mjs` `rewards()`는 33종에서 뽑고 이름을 클라와 같은 `[스킬북] {스킬 이름}`으로 만든다(기존 저장 책은 서버 `identity`가 이름을 지키므로 그대로 유지).
- **수정② 만석 즉시 자동 분해**(`src/game/inventory.ts` `bagEquipmentCount`·`sweepBagOnFull`, `src/game/world.ts` `sweepFullBag`·드롭 루프): 가방 장비가 `EQUIPMENT_BAG_LIMIT`(40) 이상이고 `autoSalvage` 스위치가 켜져 있으면, **이미 들어 있던** 장비 중 `autoSalvageBlock`이 허용하는 것(설정 등급 이하·잠금 아님·41층 이상이면 `+N까지` 이하·입을 수 있는 직업·슬롯이 이미 채워짐·장착보다 나쁨)만 `salvageItems`와 같은 값(금화·강화석·`salvageCount`)으로 일괄 분해해 칸을 만든다. 새 드롭이 자리를 못 얻는 순간 먼저 호출되고, 1개 이상 분해되면 `가방이 가득 차 설정 이하 장비 N개를 자동 분해했습니다 (+XG, +N강화석)`를 띄운 뒤 드롭을 넣는다. 보호 대상·스킬북·주머니만 남았다면 예전처럼 드롭은 바닥에 남고 `가방이 가득 찼습니다. 장비를 분해하세요.`가 한 번 뜬다. 오프라인 정산(`offline.ts`)은 손대지 않았다.
- **수정③ 받기 버튼 대비**(`src/ui/modals/utilityModal.ts` `claimButton`·`src/styles/modals.css` `.utility-button.utility-claim*`): 우편함·보상·업적의 받기/모두 받기는 지금 누를 수 있을 때만 `is-ready`가 붙어 **금빛 테두리 `#e6b866`·밝은 그라데이션 배경·굵은 글자·은은한 금빛 맥동**(`prefers-reduced-motion`이면 정지), 비활성(`disabled`)은 `opacity .38`·`grayscale(.6) brightness(.8)`로 어둡고 흐리게 갈린다. 계정·설정·수령 완료 삭제 등 다른 버튼은 종전 그대로다.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/skillbook-server.test.mjs` **5/5**(33종 동기화·33권+주머니 저장/재로드·`healStaleLoadItems` 미삭제·없는 skillId/중복 id/kind 불일치 400·보상 추첨 33종), `tests/journey-ui.test.mjs` **13/13**(+받기 버튼 `is-ready`와 CSS 규칙), `tests/auto-salvage.test.mjs` **12/12**(+만석 분해 2벌만·보호 대상 유지·필드에서 40벌 분해 후 드롭 수령·안내문). 관련 묶음 117/117(`journey`·`journey-metrics`·`market`·`characters`·`functions-adapter`·`treasure-pouch`·`achievements`·`season-reset`·`item-plus`·`floor-cap`·`item-drop-jobs` 등), 94/94(`bag-capacity`·`inventory`·`salvage-*`·`field-loot`·`world-movement` 등). 전체 684건 중 **637 통과**, 실패 47건은 작업 전 674건 중 627 통과와 **같은 목록**(sparse 체크아웃의 `public/assets/**` ENOENT).
- 배포: 미리보기 `preview/gravel-background-fks3997` 푸시 `212f036`, `version.json` `212f036caca0`(HTTP 200, builtAt 2026-11-20T08:01:02Z)·루트 200. 배포 번들 `index-Dggh3CS1.js`에 `가득 차 설정 이하`·`utility-claim`·`is-ready`, CSS `index-CE0GytG7.css`에 `#e6b866`·`grayscale` 확인. 실 API(게스트·마법사 캐릭터) `save` **200** → `load` **200**에서 궁수 책 `doubleShot`·마법사 책 `fireBolt`·전사 패시브 `mastery`·보물 주머니가 그대로 남았고, 없는 `skillId`(`fireball`)는 **400 `INVALID_ITEM`** 그대로였다. **`main` 병합 안 함**(사용자 확인 대기), 모바일 실기 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업208 업적 개편(보스 합산·보상 개편) + 장비 도감 570칸(등급별 발견) + 보물 주머니 레전드 전광판 + 새 시즌 안내·환영 우편
- 요청: `preview/gravel-background-fks3997`(bae77dd) 위에 ① 주머니에서 **레전드 장비**를 뽑으면 접속 중인 모든 유저 화면 위 **황금빛 전광판**(`#3965`) ② 도감 **등급별 카운팅 버그 수정** + 활 10·지팡이 10 포함 **95종 × 6등급 = 570칸**(`#3992`·`#4025`) ③ 업적 단계 교체와 **보스류 합산** 카운팅(`#3992`·`#4008`) ④ 새 시즌 안내 문구(`#4047`) — 추가 확정: 새 시즌 **환영 우편(1,000G + 보물 주머니 1)**(`#4069`), 전 슬롯 기념 **다이아 4,000개**(`#4170`), 업적 보상 **스킬북 제거 → 금화 사다리 + 후반 보물 주머니**(`#4150`·`#4157`). `main` 병합 금지.
- **전광판**(`server/announcements.mjs` 신규·`server/database.mjs`·`server/endpoints/market.mjs`·`src/game/legendBoard.ts`·`src/ui/legendBar.ts`·`ui/modals/pouchModal.ts`·`ui/interface.ts`·`styles/hud.css`): `djrpg_announcements` 표 + `POST /api/market {action:'announcePouchLegend', itemName}`(정식 계정만, 캐릭터 이름은 세이브, 이름 60자·같은 계정 5초 중복 1줄)·`{action:'announcements'}`(최근 5분·20줄). 화면은 **5초마다** 확인해 `🎉 {캐릭터명}님이 보물 주머니에서 [{아이템명}]을(를) 획득했습니다!`를 **5.5초** 띠 배너로 띄운다(`seq`·`seen` id 기억, 대기열 5줄, 5분 밖 줄은 기억만). 게스트는 서버 기록 없이 자기 화면에만 표시하고, 서버 실패 시에도 로컬 표시로 폴백해 개봉을 막지 않는다. 표는 시즌 초기화(`RESET_TABLES`)·이관 목록(옵션 20번째 표)에도 넣었다.
- **도감**(`src/game/codex.ts`·`ui/modals/codexModal.ts`·`server/database.mjs`): 버그 원인은 `equipmentCodexKey`가 `부위:번호`만 남긴 것 — 일반 한 벌만 먹어도 6등급이 모두 발견으로 잡혔다. 이제 **`equipmentCodexVariantKey` = `부위:번호:등급`**이 실제 획득 등급만 기록하고, `codexVariants`·`codexOwnership`·모달 요약(`발견 N / 570`)·`found/missing/owned` 필터가 모두 등급 단위다. 무기는 **대검 0~9 · 활 10~19 · 지팡이 20~29**(`codexBaseIndex`가 `baseItemIndex`를 거쳐 그림 프레임과 같은 기본형을 가리킨다 — 활 `bow_{0,5}.png`·지팡이 `staff_{0,5}.png`), `firstDropFloor`·`codexOptions`는 `entry.tier`로 계산. 구세이브의 `부위:번호` 키는 버리고 `bag`+`equipment`에서 실제 등급을 다시 찾는다. `writeSave`의 발견 기록 정규식은 `^(부위):\d{1,2}:(등급)$`·상한 **570**.
- **업적**(`server/journey-state.mjs`·`server/journey.mjs`·`src/game/bossCount.ts`·`world.ts`·`ui/dungeonField.ts`·`ui/worldBossField.ts`·`ui/modals/utilityModal.ts`): 단계 — 레벨 5·10·15·20·25·30 / 몬스터 500·1,000·2,000·4,000·8,000·16,000·32,000 / **보스 10·50·100·150·200** / 층 5·10·15·20 / 도감 10·50·100·200·300·450·570 / **스킬 강화 횟수 5·15·30·50·100**(`Σ(레벨-1)`) / 최고 스킬 레벨 5·10·15·20·25·30. `보스 처치`는 **모든 보스류 합산** — 사냥터 보스 + 필드 정예(`kill`에서 `bossKills++`) + 던전 5·10층 클리어 + 월드보스 도전 종료(1회, `finishSent` 가드)가 세이브 `bossKills` 하나로 모인다. 보상은 **스킬북 0** + 금화 사다리 `[1000,2000,3000,5000,8000,12000,20000]` + **마지막 단계 주머니 2개·4단계 이상 사슬은 3번째 단계부터 1개**(`achievementReward`), 수령은 일일·주간과 같은 `rewards()` 경로로 주머니를 지급하고 업적 카드에 `보물 주머니 N개`가 보인다.
- **새 시즌**(`server/journey-state.mjs`·`src/ui/login.ts`): `season-2-open` 환영 우편을 계정마다 1회(`notices` 이력) — 제목 `[새 시즌 오픈] 대공사 새 시즌 오픈! 기념 보물 주머니 1개를 드립니다`, **1,000G + 주머니 1**(`books:0`, 만료 없음). 전 슬롯 방치 기념 다이아 우편은 **4,000개**로 상향(만료 없음 — 시즌 초기화가 `djrpg_journey`를 비우므로 새 시즌 첫 조회에 다시 지급, 게스트 제외). 설정 화면 문구를 `대공사 업데이트로 새 시즌이 시작되었습니다 … 직업과 성별을 새로 선택해 모험을 시작하세요! 새 시즌 오픈 기념으로 금화 1,000과 무작위 보물 주머니 1개를 우편으로 보내 드렸습니다.`로 다듬었다.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `codex` 15/15(570칸·등급별 발견·활/지팡이·구키 마이그레이션)·`achievements` 9/9(단계·보스 합산·스킬 강화·도감 카운트·보상 사다리)·`announcements` 4/4(5분 창·5초 중복·이름 정규화·게스트 403)·`legend-board` 6/6(문구·판정·중복·순서·5.5초)·`season-reset` 5/5(환영 우편 + 다이아 4,000 동시 지급·게스트 제외). 회귀 `journey` 13/13(업적 수령 = 금화+주머니·스킬북 0)·`journey-ui` 13/13·`treasure-pouch`·`elite-mob`·`dungeon-battle`·`modal-ui`·`characters`·`market`·`migrate-turso-db` 통과. 전체 674건 중 627 통과 — 실패 47건은 이 작업 전 `bae77dd`와 **같은 목록**(전부 sparse 체크아웃의 `public/assets/**` ENOENT). **`main` 병합 안 함** — 사용자가 미리보기에서 주머니 연출을 확인한 뒤 지시하기로 했다.

## 2026-11-20 · fks3997 작업207 일일·주간 미션 개편 + 월드보스 1일 1회 + 무작위 보물 주머니(가방 개봉 · 확정 그림·연출·레벨 곡선 포함)
- 요청: `preview/gravel-background-fks3997`(c6de2b9) 위에 ① 일일·주간 **개별 미션은 금화만**, 전체 완료 보상만 **무작위 보물 주머니**(일일 1·주간 3) ② 미션을 각 5개로 다시 짜고(사냥터 보스 제거 → **월드보스 도전**·**장비 분해** 추가) **월드보스 하루 1회** ③ 가방에서 까는 **무작위 보물 주머니**와 큰 개봉 창·좌상단 `[확률표]` ④ **개봉 연출 0.95초**(흔들림→빛→결과) ⑤ **레벨·경험치 곡선**(`1400×level²`, 몹 `9+층`). `main` 병합 금지.
- **미션**(`server/journey-state.mjs`): 일일 — 접속 300 · 사냥 300(1,000) · 30분(1,000) · **월드보스 1회(1,500)** · **분해 3회(800)**, 완료 2,000+주머니 1. 주간 — 일일 5일(5,000) · 사냥 2,000(5,000) · 3시간(5,000) · **월드보스 5일(8,000)** · **분해 15회(5,000)**, 완료 10,000+주머니 3. 개별 `books: 0`, 금화 액수는 종전 그대로(일일 합 4,600 · 주간 합 28,000).
- **월드보스 하루 1회**(`server/world-boss.mjs`): `WORLD_BOSS_DAILY_ATTEMPTS=1`로 `BOSS_LIMIT`·`remaining`·문구를 한 상수에서 뽑고, 응답에 `maxAttempts`를 실어 화면(`worldBossLive`·`worldBossModal`·`.wb-entry-count 1/1`)이 서버 값을 그린다.
- **새 지표 연결**: `worldBoss`는 서버가 `start`에서 `recordJourneyMetric`으로 일일·주간 카운터를 **1** 올린다(여정 SELECT는 기존 배치에 합쳐 왕복 +1, 같은 `requestId` 재시도는 세지 않음). `salvage`는 세이브 누적 **`salvageCount`**의 증가분 — 수동(개별·일괄)·자동 분해가 **분해한 장비 수**만큼 올리고(`salvageItems`·`salvageByRarity`·`autoSalvageRecovered`), `writeSave`가 단조 보존. `advanceJourney`가 `worldBoss`·`salvage`를 0에서 시작하고 `journeyView`는 없는 값을 0으로 읽는다.
- **주머니 아이템**(`items.ts`·`store.ts`·`bagCapacity.ts`·`server/database.mjs`): `TreasurePouch{slot:'pouch',kind:'pouch',rarity:'unique'}`·`isPouch`·`isEquipment`·`pouchItem`·`migrateItem`. 자동 장착·자동/일괄 분해·경매장·도감·40칸에서 제외(서버 `itemValid` 슬롯 `'pouch'` 추가, 40칸 3곳·`market`·`warehouse` 제외). 가방은 `×N` 한 칸.
- **개봉**(`game/pouch.ts`·`ui/modals/pouchModal.ts`): 분류 **55/40/5**(사용자 최종 확정 #3949) → 금화 1,500·3,000·5,000(55/32/13) / 장비 6등급(34/30/20/11/4/1, `save.maxFloor` 스탯·3직업 균등) / 스킬북 100%. **확률표는 전체 확률 10항목(`POUCH_OVERALL_RATES`, 합 100.00%)을 높은 확률 순으로 깐 표** — 장비 줄은 `.pouch-rate-row.rarity-*` 인게임 색, 아래 `합계 100% · 장비·스킬북은 3직업 균등` 요약 한 줄. `openPouch`가 1개 소모 후 지급, **가방 40칸이 차면 열지 않고 안내**(주머니 보존). 큰 개봉 창은 장비창 위 한 겹, `[열기]`→연출→결과 카드, `[한 번 더 열기]`/`[확인]`. `rollItem`은 `rollRarity`+`rollEquipment`로 나눠 기존 드롭 확률 불변.
- **개봉 연출 0.95초**(사용자 요청 #3933): 주머니 흔들림·위로 벌어짐(`@keyframes pouch-open` 0~0.55초) → 당첨 색(장비는 그 등급 색 `POUCH_RARITY_INK`, 나머지 황금빛) 빛 터짐(`.pouch-glow` screen 블렌드 0.25~0.9초) → 결과 카드 짠 등장(`@keyframes pouch-reveal` 0.6초~). 세이브 차감은 누르는 즉시 한 번, 연출 중 버튼 잠금으로 중복 개봉 차단. `prefers-reduced-motion`이면 애니메이션 없이 바로 결과.
- **레벨·경험치 곡선**(사용자 확정 #3976): `expToNext(level)=1400×level²`(1~5층 Lv.3~4·10층 Lv.6·20층 Lv.11~12), 몹 경험치 일반 `9+층`·정예 2배·보스 6배(1층 10/20/60·20층 29/58/174), 오프라인 정산 `kills×(9+층)+보스 몫 5배 추가`. `elite-mob`·`offline` 통과.
- **그림**: 사용자가 **1번 클래식 가죽 보물 주머니** 확정(#3921) — `downloads/pouch-option1-leather.png`(1254²)를 `public/assets/icons/treasure_pouch.png`(512², 해상도만 축소·배경 무손실)로 넣고 `POUCH_ART_URL`·`POUCH_ICON_URL`로 연결해 가방 칸·상세·개봉 창이 같은 파일을 쓴다.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과(번들에 `무작위 보물 주머니`·`treasure_pouch.png`, CSS에 `.pouch-window`·`.pouch-rate-table`·`.pouch-glow`·`.pouch-reveal`). 신규 `tests/treasure-pouch.test.mjs` 12/12(10항목 확률·정렬·소수 둘째 자리 표기·연출 계약 포함), `tests/journey-metrics.test.mjs` 2/2. 회귀 `journey` 12/12(금화 6,600 · 44,600)·`world-boss-live` 8/8·`world-boss-preview`·`world-boss-field`·`journey-ui`·`modal-ui`·`item-drop-jobs`·`inventory`·`bag-capacity`·`market`·`characters`·`shop`·`dungeon-*` 통과. 전체 647건 중 600 통과 — 실패 47건 전부 이 sparse 체크아웃의 `public/assets/**` ENOENT(변경 전과 같은 파일). **미리보기 푸시·배포는 주머니 그림 확정 뒤.**

## 2026-11-20 · fks3997 작업206 필드 정예 몹 + 시즌 100% 초기화(로그인 직업·성별 재선택) + 타직업 스킬북 차단(미리보기 배포)
- 요청: `preview/gravel-background-fks3997`(eb887c1) 위에 ① 일반 사냥터 **30마리 처치마다 정예 몹 1마리**(체력·금화·경험치 2배, **장비·스킬북 드롭률은 1배 유지**, 일반보다 1.22배 크고 한눈에 구분), ② **시즌 100% 초기화** — ID·비밀번호만 남기고 다이아·레벨·장비·가방·스킬·층수·부캐 슬롯·경매장·공용창고·던전·월드보스·우편 전부 비운 뒤 로그인하면 **직업·성별을 새로 선택**하고 1층부터, ③ 작업 205에서 발견된 **타직업 스킬북 오소모** 보완. `main` 병합 금지.
- **정예 몹**(`src/game/world.ts`): `ELITE_KILL_INTERVAL 30`·`ELITE_HP_SCALE 2`·`ELITE_REWARD_SCALE 2`·`ELITE_MOB_SCALE 1.22`, `Enemy.elite?`, `World.eliteKills`/`elitePending`. 일반 몹 처치마다 카운터가 오르고 30이면 다음 스폰을 정예로 예약, 스폰에서 `elite = !boss && elitePending`으로 **보스가 우선**(겹치면 보스가 나가고 예약은 다음 스폰). 체력 `enemyMaxHp(floor,false)×2`, 금화 `(3+floor)×2`, 경험치 `8×2=16`, 드롭은 정예에서도 `equipmentDropChance/skillBookDropChance(floor,false)` 그대로 — **1배**. `travelToFloor`에서 카운터·예약 초기화, 스폰 시 `정예 해골이 나타났습니다!`.
- **정예 표시**(`render/entities.ts`·`render.ts`): 보스 이름표 맵 `bossLabels` → `enemyLabels`(보스·정예 공용). 정예는 일반 해골 시트에 1.22배 몸, 발밑 금빛 오라(지면 타원 채움 + 1px 링, `time`으로 숨쉬듯), 머리 위 `정예 해골` 금빛 10px 배지, 체력바 30px·`#e0873a`.
- **시즌 초기화 안전장치**(`server/season.mjs` 신규): 미리보기와 운영이 **같은 Pages 프로젝트·같은 Turso DB**를 보므로(`wrangler.toml` 없음 → 대시보드 환경변수 공용) `seasonArmed(request)`가 **호스트가 `djrpg.pages.dev`일 때만** true — 미리보기(`preview-…`)·배포 해시 호스트·URL 없는 Vercel 어댑터는 DB 조회조차 하지 않는다. 긴급 정지 `DJRPG_SEASON_RESET=off`, 호스트 추가는 `DJRPG_PRODUCTION_HOSTS`. **이번 미리보기 배포로는 어떤 데이터도 지워지지 않았고**, `main` 병합 뒤 운영 첫 요청에서 한 번 돈다.
- **1회성 마이그레이션**(`server/season.mjs` `runSeasonReset` + `server/database.mjs` `djrpg_meta`): `season_epoch` 행이 없을 때만 트랜잭션 안에서 초기화하고 `season_epoch=2`를 적는다(동시 요청·콜드 스타트에도 1회). 비우는 표 — market·market_events·market_inbox·market_requests·warehouse·warehouse_requests·item_owners·character_item_owners·dungeon_records·boss_days·boss_attempts·boss_scores·boss_rewards·journey·save_requests·save_versions·shop_entitlements(던전·월드보스 표는 없으면 건너뜀). 일반 계정(`password_hash<>'guest'`)의 `djrpg_characters` 삭제·`djrpg_accounts.save_json`을 `seasonResetSave`(1층·0골드·빈 가방·`needsSetup:true`·`season:2`, **이름 유지**)로·`profiles`(`shared_gold 0`·`active_slot 1`)·`shop_wallet`(`diamonds 0`·`max_slots 3`) 재설정. **남기는 것**: `id`·`password_hash`·`session_id`, 결제 기록(`shop_orders`·`shop_ledger`), 결제 멱등(`shop_requests`), `customer_key`. **게스트 계정은 대상 아님**(세이브·캐릭터 그대로).
- **로그인 흐름**(`server/endpoints/account.mjs`·`src/ui/login.ts`·`server/save-seed.mjs` 신규): `login`·`load` 응답에 `needsSetup` 추가 → 로그인 화면이 패널을 가리고 **`새 시즌 시작 — 직업과 성별을 선택해 주세요`**를 띄운다(전사/궁수/마법사·남성/여성, 성별 문구는 직업을 따라가고 `다른 계정으로 로그인` 버튼). `완료`는 신규 `completeSetup`으로 직업 첫 확정 무기를 가진 1층 캐릭터를 만들고(이미 끝났으면 409 `SETUP_DONE`), 설정 전 `save`/`reset`은 409 `SEASON_SETUP_REQUIRED`로 막아 구버전·오래된 기기가 `needsSetup`을 덮지 못한다. `initialSave`는 `server/save-seed.mjs`로 옮겨 가입·캐릭터 추가·시즌 초기화가 한 곳을 쓴다. `Save.needsSetup?`·`Save.season?`은 선택 필드로 `parseSave`가 게임 세이브에 남기지 않는다.
- **타직업 스킬북**(`game/store.ts`·`ui/skillBooks.ts`): `useSkillBook`이 `skillBookJob(item) !== jobOrDefault(save.job)`이면 `{ok:false, message:'{직업} 전용 스킬북입니다'}`로 막고 세이브를 건드리지 않는다(가방·스킬북 탭 공통). 스킬북 카드 버튼은 `{직업} 전용`으로 잠긴다.
- **이관 스크립트**(`scripts/migrate-turso-db.mjs`): 19번째 표 `djrpg_meta` 추가(시즌 표시가 새 DB로 함께 가야 이관 직후 같은 초기화가 다시 돌지 않는다) — 예전 공용 DB에 없을 수 있어 `OPTIONAL_TABLES`로 0행 취급.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/elite-mob.test.mjs` 4/4, `tests/season-reset.test.mjs` 3/3, `tests/skillbook-job.test.mjs` 3/3, `tests/migrate-turso-db.test.mjs` 6/6. 회귀 `world-movement`·`item-drop-jobs`·`skill-ui`·`characters`·`functions-adapter` 40/40, 관련 13파일 159건 중 157 통과(실패 2는 `public/assets` 없는 체크아웃의 기존 실패). 전체 634건 중 587 통과 — 실패 47건 전부 `public/assets/**` ENOENT(변경 전과 같은 파일).
- 미리보기: `preview/gravel-background-fks3997` 푸시 `f106a89`, `version.json` `f106a8986f10`(HTTP 200, `builtAt 2026-11-20T06:42:16Z`)·루트 200. 배포 번들 `index-DrT8PISo.js`에 `needsSetup`·`completeSetup`·`새 시즌 시작`·`정예 해골`·`1.22`·`전용 스킬북입니다` 확인, CSS `index-oS1-G3h7.css`에 `.season-setup` 확인. 미리보기 API `/api/account` load → `401 INVALID_TOKEN`(새 `djrpg_meta` DDL 포함 스키마 정상, 시즌 초기화는 호스트 게이트로 미실행). **`main` 병합 없음**, 모바일 실기(정예 외형·새 시즌 화면) 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업205 직업 표기·`내 직업만 보기` + 던전 실제 보상·층별 고정 난이도(미리보기 배포)
- 요청: `preview/gravel-background-fks3997`(cc9cc87) 위에 ① 가방·경매장의 직업 배지와 `내 직업만 보기` 필터, ② 던전 실제 보상 지급·층별 고정 난이도·드롭률 정리. `main` 병합 금지.
- **직업 판별**(`items.ts`): `skillBookJob(item)`(스킬·패시브 id를 `skillOrderFor`/`passiveOrderFor`로 대조)·`itemJob(item)`(무기=`weaponJob`, 스킬북=`skillBookJob`, 공용 방어구·장신구는 `undefined`)·`usableByJob(item, job)`. 새 드롭된 스킬북 60개를 전수로 돌려 세 직업 중 하나로 판별되는 것을 테스트로 고정.
- **필터**(`ui/jobFilter.ts` 신규): `jobOnlyVisible`(아이템 없는 줄은 유지)·`jobOnlyHidden`·`readJobOnly`/`saveJobOnly`(기기 키 `djrpg-bag-job-only`·`djrpg-market-job-only`, 기본값 전체 보기, 저장 불가 환경에서도 예외 없음). `interface.ts`의 `bagJobOnly`·`marketJobOnly`가 시작 시 읽는다. 필터는 **보기 전용** — 아이템·세이브를 건드리지 않고, 서버 경매장 `filters` 계약도 그대로 두고 화면에서 거른다(내 거래 탭은 필터 제외).
- **표기**: 장비창 가방 슬롯·상세(`전사 전용 무기 · 내 직업` / `장착 불가 (궁수 전용)`), 스킬북 카드(`.job-badge`+`궁수 전용 스킬북` 아리아), 경매장 매물·판매 선택 목록 배지와 상세 경고, 분류 필터 아래 `내 직업만 보기: 켬/끔` 버튼과 `다른 직업 전용 장비 N개는 숨겨져 있습니다.` 안내. 공용 방어구·장신구는 켜도 그대로 보인다.
- **던전 난이도**(`dungeonBattle.ts`): 임시 `dungeonPreviewHp`(내 DPS×4) 삭제 → `DUNGEON_MOB_HP = [60,106,160,220,299,406,557,767,1055,1444]` 고정 곡선(기준은 필드 `enemyMaxHp(2×층)`), 정예 2배(`DUNGEON_ELITE_HP_SCALE`)·보스 30배(`DUNGEON_BOSS_HP_SCALE`). 1층 60은 Lv.5~10·저층 장비(평타 DPS 80~130)로 3~6초, 10층 보스 43,320은 공격 120(DPS 400) 장비로 90초 초과·15~20층 파밍(DPS 1,000 전후)이면 40초 안팎 — 테스트가 이 창을 고정한다.
- **드롭률**: `DUNGEON_ITEM_DROP_CHANCE=.5` 삭제 → `dungeonDropChance(floor)=min(.20,.15+(floor−1)×.005)`(1층 15%·10층 19.5%). 무엇이 떨어지는지는 필드 `equipmentDropChance`:`skillBookDropChance` 비율 그대로, 5·10층 보스는 5템+10무더기 유지.
- **실제 보상**(`game/dungeonRewards.ts` 신규): `dungeonKillGold`(일반 7×(3+층)·보스 70×층), `dungeonClearStones`(층×2 + 최초 클리어 `10+층×3`), `claimDungeonRewards`가 `save.gold`/`save.stones`에 넣고 아이템은 자동 분해 규칙(켜져 있으면 금화·강화석으로) → `canStoreItem` 확인 후 `save.bag`(가득 차면 놓친 개수, 스킬북은 자리 불필요). `DungeonBattle.clearRewards()`는 `outcome==='clear'`일 때만 금화·아이템을 돌려주어 실패·시간 초과에는 지급이 없다.
- **화면**: `dungeonField.ts`의 `result()`가 clear에서 지급→`ui.dungeon.clear`→`ui.onSave()`+`renderStatus`+`renderBagBadge`→순위 전송, 결과창은 `ui/dungeonRewardMarkup.ts` `dungeonRewardMarkup(receipt)`로 금화·강화석(최초 클리어 보너스 표기)·아이템 목록·자동 분해·놓침을 그린다. 하단 문구 `드롭 50% 테스트 · 보상은 준비 중` → 실제 보상 안내, 로비의 `보상 수량은 전투 연결 시 확정됩니다` → `dungeonPrizePanel`이 층별 금화·강화석 수량과 드롭 확률(보스는 5템+10무더기)을 표시.
- **중복 클리어**: 로비는 늘 `clearedFloor+1`만 열고 결과창 다음 층도 `floor+1` — 이미 깬 층을 다시 도는 경로가 없어 최초 클리어 보너스가 반복되지 않는다. 재도전은 실패·시간 초과에만 있고 그때는 보상 없음.
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/job-filter.test.mjs` 5/5·`tests/dungeon-rewards.test.mjs` 8/8, `tests/dungeon-battle.test.mjs` 32/32(고정 체력·1층/10층 창·보스 30배·드롭률·clearRewards), 관련 회귀 113/113(`dungeon-lobby`·`dungeon-ranking`·`dungeon-record`·`modal-ui`·`modal-interaction`·`item-drop-jobs`·`market`·`skill-ui` 포함). 전체 624건 중 576 통과 — 실패 48건은 이 sparse 체크아웃에 `public/assets/**`가 없어 나오는 기존 실패. 기존 테스트 3건은 새 계약에 맞춰 갱신(`dungeon-record` clear 호출 형태, `skill-ui` 카드 배지 위치, `dungeon-battle` 2층 체력 곡선).
- 미리보기: `preview/gravel-background-fks3997` 푸시 `eb2e550`, `version.json` `eb2e5504367a`(HTTP 200, `builtAt 2026-11-20T06:23:02Z`)·루트 200. 배포 번들 `index-QNAfE3Va.js`에서 `Ub=[60,106,160,220,299,406,557,767,1055,1444]`·`FI=30`·`GI=2`·`DI=.15,II=.005,OI=.2`·`firstClear:H>ru(fe),autoSalvage:r.autoSalvage?r.salvageRarity:void 0`·`70*t:7*(3+t)`·`최초 클리어 보너스 포함`·`djrpg-bag-job-only`/`djrpg-market-job-only` 확인, `드롭 50% 테스트`·`보상은 준비 중`·`보상 수량은 전투 연결 시 확정됩니다`·`dungeonPreviewHp` **0건**. CSS `index-Wxot--NC.css`에 `.job-badge`·`.bag-job-only`·`.market-job-only`·`.dungeon-result-items`. **`main` 병합 없음**. 모바일 실기 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업204 20층 체제 개편 + 3직업 교차 드롭(미리보기 배포)
- 사용자 확정: `#3361`·`#3368`·`#3381`·`#3388`(20층 상한·층당 몹 수·압축 곡선·+1~+7/12층 자동분해) → `#3411` 정정 **"20층기준 +1만뜨고 체렵압축하면안되"**(압축·+단계·자동분해 변경 전부 철회) → `#3422` 추가 **"다른직업 장비나 스킬북도 동일확률로 뜰수있어"**.
- `store.ts`: `MAX_FLOOR = 20`. `parseSave`가 `floor`·`maxFloor`를 1~20으로 클램프 — 21층 이상에 있던 세이브는 **층·최고 층만** 20으로 당기고 장비·가방·처치 기록은 그대로 둔다. `floorKillTarget = 150 + 55×(f−1) + round((f−1)²×6.4)` → 1층 150 · 5층 472 · 10층 1,163 · 15층 2,174 · 20층 3,505(기존 120+40×(f−1)).
- `world.ts`: 보스 처치 시 `floor < MAX_FLOOR`일 때만 다음 층으로 오르고, 20층에서는 `최고 20층 달성! 20층에서 계속 사냥합니다.`를 알린 뒤 20층에서 사냥을 이어 간다(적 정리·`spawnTimer .2`·`floorKills` 초기화는 종전과 같다). `travelToFloor`는 20층 위를 거부한다.
- `server/database.mjs`: `MAX_FLOOR = 20` 상수(store.ts와 같은 값)와 `writeSave` 저장 전 클램프 — 21층 이상 요청은 20층으로 저장되고 최고 층도 20을 넘지 않는다.
- UI: `floorModal`이 최고 20층이면 잠긴 `21층` 칸 대신 `🏆 최고 20층 · 20층 달성 · 마지막 층` 칸을 보여 주고, 20층에서 자동 등반을 켜면 최고 층 안내를 띄운다.
- **불변(정정 반영)**: `enemyMaxHp`·`offlineMobHp`·`enemyHitDamage`·`enemyMoveSpeed`·`spawnTimer`·`rollItem` 스탯/등급 확률·`maxPlusFor`(11~20층 `+1`까지)·`AUTO_SALVAGE_PLUS_FLOOR(41)`을 한 줄도 바꾸지 않았다 — 20층은 예전 20층 그대로이고 상한이 풀리면 고층 곡선이 이어진다.
- 3직업 교차 드롭(`items.ts`): `dropJobs`/`dropJob`으로 확률 드롭의 무기·스킬북이 전사·궁수·마법사 1/3씩. 튜토리얼 첫 확정 드롭(`guaranteed`)은 내 직업 `starterWeaponName(job)` 그대로. `rollSkillBook`은 직업을 먼저 고른 뒤 그 직업의 `floor×2` 해금 풀에서 뽑고 `job` 인자는 호환용(`_job`). 오프라인 정산도 같은 함수라 자동 적용.
- 안전장치: `weaponJob`·`canWield` 신규. `autoEquipBest`가 무기 칸 후보를 `canWield`로 거르고, 장비창 `itemDetail`은 타직업 무기의 장착 버튼을 `"{직업} 전용"`으로 잠그며 슬롯 표기도 그 무기의 직업 기준으로 보여 준다. `salvageUpgrades`는 입을 수 없는 무기를 비교에서 빼고, `autoSalvageBlock`은 그런 무기에 `empty-slot`·`upgrade` 보호를 걸지 않는다(등급·`+단계` 보호는 유지).
- 검증: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/floor-cap.test.mjs` 4/4(클램프·몹 수 곡선·20층 정지·`writeSave` 보정), `tests/item-drop-jobs.test.mjs` 4/4(1/3 드롭·직업 판별·자동 장착 차단·분해 보호). 새 스펙에 맞춰 기존 테스트 갱신: `offline`(600초 120마리 < 새 1층 목표 150 → 보스 없음), `archer`/`mage`(직업 전용 드롭 → 3직업 1/3), `codex`(무기 슬롯 난수 시퀀스에 직업 값). 전체 609건 중 562 통과 — 실패 47건은 sparse 체크아웃에 `public/assets/**`가 없어 생기는 기존 45건 + `costume-field-render` 2건(변경 전 상태에서도 동일 실패 확인).
- 미리보기: `preview/gravel-background-fks3997` 푸시 `1f9d281`, `version.json` `1f9d281db9a9`(HTTP 200, `builtAt 2026-11-20T05:58:22Z`)·루트 200, 배포 번들 `index-DLv3erw4.js`에 `150+55*e+Math.round(Math.pow(e,2)*6.4)`·`최고 ${Ft}층 달성! ${Ft}층에서 계속 사냥합니다.`·`${Ft}층 달성 · 마지막 층`·`만 쓸 수 있는 무기입니다` 확인. **`main` 병합·운영 배포는 사용자 확인 대기**. 모바일 실기 확인은 사용자 몫.

## 2026-11-20 · fks3997 작업203 41층 이후 자동 분해 `+단계` 필터(미리보기 배포)
- 사용자 확정 스펙: "41단계부터 필터활성화되게하자 그아래는 자동삭제해놔도 내꺼보다 높은공격력은못팔게막혀있으니깐" · "까지로표기하자" · "보호가아니고 저거선택하면 +4까지 삭제인거야". 즉 `save.maxFloor >= 41`에서 `+0까지`~`+7까지`(기본 `+4까지`)를 고르고, 고른 단계까지가 자동 분해 대상, 그 위는 경매장 판매용으로 보관한다.
- `game/inventory.ts`: `AUTO_SALVAGE_PLUS_FLOOR = 41`, `autoSalvageBlock(save, item, maxRarity, maxPlus?)`/`autoSalvageRecovered(..., maxPlus?)`가 41층 이상에서 `plusOf(item) > maxPlus`면 `'plus'`로 남긴다(기존 3인자 호출은 그대로 동작). 40층 이하에서는 값을 무시해 예전 등급·장착품 비교 규칙만 남는다.
- `game/world.ts`: `autoSalvagePlus` 훅(UI가 매 회수마다 최신값 전달)을 `sweeps`·`autoSalvageRecovered`에 넘긴다. 가방이 가득 차도 상한 안의 장비는 회수되고, 상한 위 장비는 바닥에 남아 가득 찬 가방을 기다린다.
- UI: 신규 `ui/salvagePlus.ts`(`djrpg-auto-salvage-plus`·기본 4·`+4까지` 라벨·`salvagePlusUnlocked`), `ui/interface.ts` `salvagePlus`/`setSalvagePlus`, 장비창 가방 하단(`equipModal.ts` `select.salvage-plus` — 네이티브 선택창이라 8단계를 한 번에 고른다)과 설정 '사냥'(`utilityModal.ts` 같은 select)이 **41층 이상에서만** 보인다. 40층 이하 화면은 이전과 완전히 같다(테스트로 고정).
- 일괄 분해(`salvagePlan`/`salvageItems`)는 플레이어가 직접 고른 목록이라 `maxPlus`를 적용하지 않고, 오프라인 정산(`offline.ts`)도 그대로 자동 분해 없음. 선택값은 기기 저장이고 세이브 초기화(`store.ts` `clearLegacySave`) 때 등급 기준·자동 분해 스위치와 함께 지운다. Save/서버 형식 무변경.
- 검증: `npx tsc --noEmit`, `npx vite build` 통과, 신규 `tests/salvage-plus.test.mjs` 11/11(기본·저장·손상값·라벨·41층 게이트·40층 미적용·+4까지 기본/+5 보호·플레이어 상한·가방 가득·일괄 분해 무관·장비창 렌더), 관련 회귀 51 통과(`auto-salvage`·`salvage-rarity`·`salvage-protection`·`item-plus`·`modal-ui`·`item-protection-ui`), 전체 601건 중 554 통과 — 실패 47건은 모두 sparse 체크아웃에 `public/assets/**` 이미지가 없어 생기는 기존 실패이고(`api/**`·`functions/**`를 채운 뒤 `characters`·`dungeon-ranking`·`functions-adapter`·`market` 42건은 전부 통과).
- 미리보기: `preview/gravel-background-fks3997` 푸시 `c10ff2b`, 미리보기 `version.json` `c10ff2b39eb0`(HTTP 200, `builtAt 2026-11-20T05:11:25Z`)·루트 200, 배포 번들 `index-DQtU14ck.js`에 `djrpg-auto-salvage-plus`·'경매장 판매용으로 보관됩니다', CSS `index-CbCq-oyt.css`에 `.salvage-plus` 확인. **`main` 병합·운영 배포는 사용자 "잠시" 요청으로 보류**(다음 말씀 후 진행). 모바일 실기 확인은 사용자 몫.
## 2026-11-20 · songduckjin 작업 217 장비 등급색 펄스 글로우 (가방·장착·거래소·도감)
- **요청(사용자)**: "장비들 등급색에따라 색이맞게 빛이 들어왔다 원래대로돌아왔다 이렇게 만들어줘" — 아이템 UI 슬롯 기준으로 해석해 구현.
- **새 파일(`src/styles/rarity.css`)**: 등급별 토큰 `--rp-ink`(등급색)·`--rp-soft`/`--rp-bloom`(쉴 때·빛이 들어올 때 색+투명도)·`--rp-in`/`--rp-in-bloom`·`--rp-out`/`--rp-out-bloom`(안쪽·바깥쪽 번짐)·`--rp-cycle`을 한 벌씩 정의하고, 두 갈래 선택자 `:is(.bag-item,.equipment-slot,.item-detail).<등급>`(가방·장착 슬롯·아이템 상세)과 `:is(.market-pick,.codex-card,.codex-detail).rarity-<등급>`(거래소 목록/등록·도감 카드/상세)를 같은 규칙으로 묶어 `border-color: var(--rp-ink)` + `@keyframes rarity-pulse`(안쪽·바깥쪽 2겹 `box-shadow`)를 건다.
- **값**: 매직 `#60a5fa` 3.2초 / 레어 `#facc15` 3초 / 에픽 `#c084fc` 2.8초 / 유니크 `#fb923c` 2.6초 / 전설 `#f87171` 2.4초, 모두 `ease-in-out infinite`. 쉼 알파 .24~.35(5~7px) → 빛 알파 .60~.80(9~12px)로 등급이 오를수록 번짐·진하기·속도가 함께 강해진다. 블룸 알파 상한 0xcc·안쪽 번짐 12px로 아이콘·글자 시인성을 지킨다.
- **일반 등급**: `.bag-item.common`·`.equipment-slot.common`·`.codex-card.rarity-common` 등은 종전 정적 상태 그대로(애니메이션 없음).
- **접근성**: `@media (prefers-reduced-motion: reduce)`에서 `animation: none` + 같은 등급색의 정적 글로우만 남긴다.
- **기존 파일**: `src/styles/main.css`가 `rarity.css`를 **맨 마지막**에 import(같은 특이도에서 덮도록), `modals.css`·`codex.css`는 등급별 정적 `box-shadow`를 걷어내고 `border-color`만 남겼다(그림자의 주인은 rarity.css 하나), `market.css`는 원래 테두리색만 있어 그대로.
- **검증**: `npx tsc --noEmit`·`npx vite build` 통과. 신규 `tests/rarity-glow.test.mjs` 9건(키프레임 2겹 구조·주기 2.4~3.2초 단조 감소·팔레트 일치·블룸>소프트 알파·일반 등급 미적용·reduced-motion·렌더 코드의 등급 클래스 계약). 전체 `npm test` 703건 중 680 통과(실패 23건은 변경 전 `origin/main`과 같은 목록 — 이 체크아웃에 없는 파츠 PNG/코스튬 아틀라스 에셋 검사). 리베이스 후 `tests/{modal-ui,equipment-info,equipped-detail,codex,market,bag-hover}` 71건 재통과.
- **운영 검증**: 배포 CSS(`assets/index-DXES48bi.css`)에 `@keyframes rarity-pulse`·`animation:rarity-pulse var(--rp-cycle) ease-in-out infinite` 포함. 실브라우저(`djrpg.pages.dev`)에서 `getComputedStyle` 측정 — 등급별 `rarity-pulse 3.2s/3s/2.8s/2.6s/2.4s ease-in-out infinite`, 쉼 알파 .24~.35, 빛 상태 알파 .60~.80·9~12px, `common`은 `animation: none`. 검수 이미지 `downloads/djrpg_rarity_pulse_review_v1_2026-11-20.png`(실제 배포 CSS로 두 상태를 나란히 렌더).
- **머지·배포**: 최신 `origin/main`(작업 215 회전참격 #172) 위로 리베이스 → [PR #175](https://github.com/songduckjin/DJRPG/pull/175) 스쿼시 병합 `8d474348bbed`(2026-11-20T10:41Z). Cloudflare Pages 체크 통과(`Workers Builds: djrpg`는 종전과 같은 상시 실패). 운영 `https://djrpg.pages.dev/version.json` = `8d474348bbed`(`builtAt 2026-11-20T10:41:39.044Z`).
- **사용자 확인 몫**: iOS 실기에서 숨쉬기 속도·번짐이 과하지 않은지(특히 가방 100칸이 등급색으로 가득할 때 스크롤 부드러움), 실기 `동작 줄이기` 설정에서 정적 등급색만 보이는지.
## 2026-11-20 · songduckjin 작업 216 통합 개선 7건(평타 아이콘·파이어 볼트·무기 미장착·가입 분리·마법사 사거리·스킬 레벨 제한·카드 액션) + 궁수 공격 배율
- **요청(사용자 확정)**: 모아서 한 번에 배포하기로 한 7건 — ① 3직업 기본 평타 원형 아이콘(불꽃 없는 대검·활·마법탄) ② 마법사 1번 `파이어 볼트`를 머리 위 화염구 N발 직선 단일 타격(레벨별 개수·크기) ③ 무기 미장착 시 전 직업 공격 불가 + "무기를 장착해야 공격할 수 있습니다." ④ 신규 가입은 아이디·비밀번호만 받고 캐릭터 생성 화면으로 분리(성별 `남`/`여`) ⑤ 마법사 사거리 240/130 ⑥ 스킬 권장(필요) 레벨 잠금·표기 제거 ⑦ 캐릭터 카드 탭 시 `선택`·`방치`·`삭제` 노출. 작업 중 추가 요청 — "궁수는 활 쏠 때 캐릭터가 작아져".
- **평타 아이콘**: 승인 원본 3장(`downloads/icon_greatsword/`)에서 원 밖만 투명하게(반지름 620·2.5px 페더) 잘라 알파 프리멀티플라이로 256×256을 굽는 `scripts/build-attack-icons.py`를 두고 `public/assets/icons/attack_{warrior,archer,mage}.png`(103/103/122KB)로 배치. `skillArtwork.ts`의 `attackIconPath(job)`·`applySkillArtwork(button, kind, job)`·`setSkillIcon(art, kind, job)`이 액션 패드(`hud.ts`)와 스킬 창 기본 공격 카드(`skillModal.ts`)에 직업별 메달리온을 그린다(글자 `⚔`는 비우고 `.skill-art`가 덮는다). 새 파일이라 `/assets/*` immutable 캐시 버스터는 불필요.
- **파이어 볼트**: `fireBoltCount`(Lv.1~4 1발 → 5레벨마다 +1, 최대 6발)·`fireBoltScale`(1→2.45배)·`fireBoltSpots`(아이소 역변환으로 머리 위 반원, 가운데가 8px 높고 개수가 늘어도 폭은 같다). `World.action('fireBolt')`는 N발을 `shoot({from: 머리 위 자리, launch: .18+i*.05, size})`로 쏘고 **위력을 N으로 나눠** 합계는 예전 한 발(×2.0) 그대로다. `vfx.ts` `drawMagicBolt`는 `launch` 전에는 제자리에서 맥동, 남은 시간에만 선형(직선) 비행.
- **무기 미장착**: `World.action`이 `save.equipment.weapon`이 없으면 평타·공격 스킬을 막고 `warnWeapon`이 `WEAPON_REQUIRED_NOTICE`를 4.5초에 한 번만 띄운다(자동 사냥 매 프레임 도배 방지). **첫 처치 전(`tutorial===0`)만 예외** — 시작 무기는 그 첫 처치의 100% 드랍이라 전면 차단하면 새 캐릭터가 진행 불가가 된다.
- **가입 분리**: `server/endpoints/account.mjs` `register`가 아이디·비밀번호만 받아 **캐릭터 행 없이** `uncreated: true` 자리표시자 세이브만 만들고 `needsCharacter: true`를 돌려준다. `characters` 목록에서 자리표시자를 빼고 `load`/`login`에도 `needsCharacter`를 싣고, `createCharacter`가 자리표시자 슬롯을 덮어쓴다(세이브를 먼저 보내면 `409 CHARACTER_REQUIRED`). `ui/login.ts`는 `characterStep`(닉네임·직업·성별 `남`/`여`)으로 그 자리에서 캐릭터를 만들고 세션을 갱신해 입장한다. 게스트·기존 로그인 동작은 그대로.
- **마법사 사거리·스킬 레벨**: `mageAttackRange` 240 / `mageStopRange` 130(궁수 280/150 > 마법사 240/130 > 전사 90). `canLearn`은 항상 참 — 캐릭터 레벨 잠금 없이 스킬북만 있으면 1레벨부터 습득·사용하고, 스킬 창의 `권장 Lv.N` 문구를 지웠다(전사 스킬 순서·`skills[].level` 값은 유지).
- **캐릭터 카드**: `ui.characterFocus`(새 상태)로 카드를 누르면 그 카드만 펼쳐져 `선택`(접속)·`방치`·`삭제`가 나타나고(다시 누르면 접힘, 팝업을 닫으면 초기화), 빈 슬롯은 누르면 바로 생성 화면으로 간다. 생성 화면 성별 버튼은 `남`/`여`만.
- **궁수 공격 배율(추가 요청)**: `archerMaleAttack` 268→**235**, `archerFemaleAttack` 270→**233**. 예전 값은 공격 시트의 불투명 영역(머리 위로 솟은 활대 포함 239~275px)을 잰 값이라 몸통(정수리~발끝 232.8/229px)이 서기(333/331px)보다 13% 작게 그려졌다. 정수리~발끝만 다시 재어 서기와 같은 체격으로 맞췄다(갑옷 1~9번 공격 시트 230~258px는 한 값으로 그려 ±8% 안).
- **광폭 버프 3종 밸런스(추가 지시)**: 블러드 레이지·호크아이·아케인 실드가 공용으로 쓰는 `World.player.berserk` 배율을 공속 `min(1.5, 1.2 + (레벨-1)*.01)`(Lv.1 +20%·레벨당 +1%·상한 1.5배, 예전 `1.5 + (레벨-1)*.08`은 Lv.30 3.8배)과 공격력 `1.2 + (레벨-1)*.015`(Lv.30 +63.5%, 예전 Lv.1 +50%·상한 없음)로 다듬고 `berserkSpeedScale`/`berserkAttackScale`로 묶었다. `render/heroMotion.ts` `costumePlaybackRate`도 같은 공속 식(역수)으로 맞췄다. 지속은 `warcry` `6+(레벨-1)*.2`(Lv.30 11.8초 < 쿨 14초), `hawkEye`·`arcaneShield` `7+(레벨-1)*.17`(Lv.30 11.93초 < 쿨 16초)라 어떤 레벨에서도 무한 유지가 없다. 스킬 표의 `power`/`description`과 스킬 창의 버프 성장 문구(+20%·레벨당 +1.5%)도 같은 수치로 정합화. 신규 `tests/buff-balance.test.mjs` 4건, `costume-field-render`의 재생 배율 기대값 갱신.
- **빈손 외형(추가 지시)**: `"왜 첫 전사캐릭이 갑옷도 안입었는데 옷을 입고있지 검들고"` — 기본 본체 시트(`pilot*`·`archer_*`·`mage_*`)에 0번 무기가 그림으로 들어 있어, 무기를 하나도 안 찬 캐릭터도 손에 검·활·지팡이를 들고 있었다. `items.ts` `hasNoWeapon(save)`를 두고 `usesSwordlessBody`/`usesBowlessBody`/`usesStafflessBody`가 미착용도 참이 되게 했으며, `render/entities.ts` `drawHero`가 전사 `noweapon/`·궁수 `nobow/`(갑옷 티어는 `archer_armors/nobow/`)·마법사 `mage_nostaff/` 본체로 갈아 끼워 빈손으로 그린다(투구의 머리 없는 판도 같은 플래그를 쓴다). `ui/equipmentPortrait.ts`(장비창·캐릭터 카드 초상화)도 같은 판을 쓴다. 무기를 차면 종전 그대로다. 신규 `tests/weaponless-body.test.mjs` 4건, 렌더 테스트(armor·archer-helm·archer-armor·bow·staff·mage-helm·mage-robe·weapon·equipped-detail·character-portrait) 기대값 갱신.
- **테스트**: 신규 `attack-icon`(PNG 256² RGBA·모서리 투명·3장 상이·경로), `fire-bolt`(개수·크기·머리 위 반원 대칭·N발 단일 목표·합계 피해·대상 처치 후 정리), `weapon-required`(세 직업 평타·스킬 차단·4.5초 쿨다운·자동 사냥 도배 없음·튜토리얼 0 예외), `register-flow`(가입 캐릭터 0개·목록/load·409 CHARACTER_REQUIRED·생성 덮어쓰기·게스트/구형 요청 호환·검증), `character-card-actions`(접힘/펼침·세 버튼·빈 슬롯 생성 이동·`남`/`여`), `archer-attack-scale`(실측 정수리~발끝·서기 대비 ±3%·예전 대비 12~18% 확대). 갱신: `world-movement`(무기 없음 — 튜토리얼 0 예외), `archer`/`crushing`/`skill-feedback`/`skill-ui`(사거리·canLearn·평타 아이콘), `modal-ui`(카드 펼침 후 선택), `characters`/`functions-adapter`/`dungeon-*`/`world-boss-*`/`concurrency`(가입 후 캐릭터 생성·무기 장착 세이브).
- **검증**: `npx tsc --noEmit` 통과, `npx vite build` 통과(49초), 전체 703건 중 698 통과 — 실패 5건은 전부 변경 전 `origin/main`에서도 같은 기존 실패(코스튬 v3 매니페스트·아틀라스 2건, `costume-field-render` drawHero 2건, 월드보스 패배 연출 1건 — 이 체크아웃이 sparse라 `public/assets/costume/v3` blob을 받지 못하는 환경 요인 포함). `node scripts/verify-item-art.mjs`는 새 평타 아이콘 3장 검사를 추가했고, 이 체크아웃에서는 코스튬 v3 자산 부재로 끝까지 돌지 못한다(같은 이유).
- **머지·배포**: [PR #182](https://github.com/songduckjin/DJRPG/pull/182) 스쿼시 병합 `08891a35fbea`(main `08891a3`). Cloudflare Pages 체크 SUCCESS, 운영 `version.json` `08891a35fbea`(`builtAt 2026-11-20T12:15:52Z`)·루트 200·**새 평타 아이콘 3장 HTTP 200 `image/png`**(원격 sha256 = 로컬: warrior `54d3c706e04a17ce`·archer `d2c387be8f91dae8`·mage `5b842fcd42f53e95`)·배포 번들(`index-D9gLLNVr.js`)에 `assets/icons/attack_${...}`·`noweapon/`·`character-connect`·`login-create`·`무기를 장착해야 공격할 수 있습니다` 확인. `Workers Builds: djrpg`는 종전과 같이 실패(다른 PR도 동일 — 배포는 Cloudflare Pages).
- **운영 API 확인(가입 분리)**: 새 계정 `smoke216211843`으로 register → `needsCharacter: true`·캐릭터 0개, 같은 아이디 재가입 `409 ACCOUNT_EXISTS`, login → `characters: []`, `createCharacter(slot 1, 연기테스트/female/mage)` → 200·`revision 1`·세이브 이름·직업 반영, load → save(금화 123) 200. (검증용 계정 1개가 운영 DB에 남는다.)
- **사용자 확인 몫**: 모바일 실기 — 원형 평타 아이콘 3직업, 파이어 볼트 머리 위 N발 연출, 무기 해제 후 안내 문구, 가입 → 캐릭터 생성 → 입장, 카드 탭 → 세 버튼, 궁수 사격 체격.

## 2026-11-20 · songduckjin 작업 212 딜레이 크러싱 10연타·전사 잔상 (+ 전사 스킬 순서)
- **요청(사용자 확정)**: 전사 3번 `딜레이 크러싱`을 붉은보석1식 **단일 타겟 10회 연속 공격 + 전사 잔상 연출**로. ① 본체가 제자리에서 attack 4프레임을 빠르게 10번 ② 타격마다 이전 공격 동작(현재 착용 투구·갑옷·대검 포함)의 잔상이 본체 주변에 남는다 ③ 잔상은 본체보다 낮은 불투명도(0.14~0.42 계단식, 살짝 푸른 은빛) ④ 10회 독립 타격 판정 ⑤ 타마다 데미지 숫자(겹치지 않게 자리 분산) ⑥ 10타 뒤 잔상 정리·idle 복귀. **추가 지시**: 딜레이 크러싱·드래곤 트위스터를 전사 스킬 **마지막 두 자리**로 옮기고 앞의 다섯(slam·warcry·power·destroy·hell)을 4·5·7·10·14로 앞당긴다.
- **월드(`src/game/world.ts`)**: `crushHits=10`·`crushInterval=.062`·`crushPoseSpan=.062`·`crushTrailLife=.3`·`crushLabelOffset(i)`·`HeroAfterimage` 타입을 두고, `action('crushing')`이 `World.crush` 시퀀스와 연출 이펙트(`kind:'crushing'`, `duration=.62`, `strikeInterval`, `aim`)를 열고 **첫 타를 즉시** 낸다. `update`가 경과 시간만큼 `crushStrike()`를 돌려 **타마다** ① `attackPose=crushPoseSpan`(4프레임을 62ms로 한 번) ② `damage(skillRange('crushing',lv), …, maxTargets=1, crushLabelOffset(i))` — 사거리 안 가장 가까운 **한 마리**, 대상이 그 타에 쓰러지면 다음 타가 다음 적으로 이어짐 ③ 잔상 한 점. 타 피해는 `총위력/10 × (0.92~1.08)`라 **10타 합계는 예전 한 방(공격력 × 3.4 × 레벨 배율)과 같다** — 처치 속도·`server/save-guard.mjs` 상한에 영향 없음(오히려 단일 타겟이라 광역보다 처치가 적다). 10타가 끝나면 `crush=undefined`·`attackPoseSpan=.32`로 복귀하고, 잔상은 나이를 먹어 스스로 사라진다(마지막 타 뒤 0.3초). 층 이동·사망 시 시퀀스·잔상 목록을 비운다. `damage()`에는 마지막 선택 인자로 팝업 오프셋을 더했고(기존 호출부 영향 없음) `attackPoseSpan`(기본 .32)으로 공격 모션 길이를 월드가 소유한다.
- **렌더(`render/entities.ts`·`render.ts`·`render/vfx.ts`)**: `attackFrame`·`heroMotion`이 `world.attackPoseSpan`을 쓰므로 62ms 포즈에서도 4프레임이 실제로 넘어간다. `updateAfterimages`가 `world.afterimages` 기록마다 `cloneHeroLayers()`(투구 파츠·대검 파츠·몸통 시트를 zIndex 순서대로 복제, 푸른 은빛 틴트 `0xbfd4ff`)를 만들어 본체 뒤(`ghosts`)에 깔고, 기록이 사라지면 스프라이트를 파괴한다 — alpha는 기록값(0.42→0.14)에 수명 페이드를 곱해 0.3초에 걸쳐 지운다. `drawSkillVfx`의 crushing 가지는 예고 링·단발 충격 대신 **62ms마다 지면 링과 내려찍기(fx_wild_stamp)가 한 번씩 깜빡이는** 10연타 연출로 바뀌었고, `updateDamageLabels`는 `labelOffsetX/Y`가 있으면 그 자리에 숫자를 띄운다(10개가 한 점에 겹치지 않는다).
- **스킬 순서(`src/game/skills.ts`)**: `skillOrder = ['slash2','slam','warcry','power','destroy','hell','crushing','spin']`, 해금 레벨 2·4·5·7·10·14·18·24(크러싱 18·드래곤 트위스터 24). `skillOrder`를 쓰는 스킬창·퀵슬롯·스킬북 순서와 `motionTemplateSkills('smash')` 결과 순서(`['slam','crushing']`)가 함께 바뀐다. 기존 세이브의 `learned`·`quickSlots`·`skillLevels`는 ID 기반이라 그대로 살아남는다.
- **머지·배포**: [PR #168](https://github.com/songduckjin/DJRPG/pull/168) 스쿼시 병합 `27bf4ed4943b`(2026-11-20T09:57:45Z). Cloudflare Pages 체크 통과(`Workers Builds: djrpg`는 종전과 같은 상시 실패 잔재). 운영 `https://djrpg.pages.dev/version.json` = `27bf4ed4943b`(`builtAt` 2026-11-20T09:58:00.380Z), 루트 200. 배포 번들 `index-Df3J1tMq.js`에 새 스킬 순서 배열·`단일 타겟 10연타`·잔상 기록(`alpha:.42-s*.031`·`*11%29-14`)·`attackPoseSpan`·`strikeInterval`·`.062` 확인, `fx_wild_stamp.png`·`pilot-25d/armors/headless/warrior_male_armor_5_attack_v1.png` 200. 브랜치 삭제는 403으로 미완. 브라우저·iOS 실기 확인은 사용자 몫.
- **검증**: 신규 `tests/crushing.test.mjs` 7건 — ① 순서·해금 레벨 ② 발동 1회에 10타가 따로 들어가고 총 피해가 예전 한 방 ±5%·타별 ±9%·팝업 10개(자리 10종) ③ 사거리 안 다른 적·사거리 밖 적은 안 맞음 ④ 대상이 쓰러지면 다음 적으로 이어지되 횟수는 10회 ⑤ 잔상 10점(alpha .14~.42·±14px)·0.3초 뒤 전멸·`attackPose=0`·`attackPoseSpan=.32` ⑥ 스킬 레벨 5에서도 총 피해 ×레벨 배율 ⑦ 나머지 전사 6종은 종전대로 피해/버프. `npx tsc --noEmit`, `npx vite build`, 전체 680건 중 678 통과(실패 2건은 변경 전부터 같은 `costume-field-render` — 이 체크아웃은 에셋을 sparse로 빼둔 상태라 검증용으로 `public/assets`를 되살려 돌렸다). 검수 이미지 `downloads/djrpg_skill_3_crushing_afterimage_v1.png`(`scripts/preview-crushing-afterimage.py`, 실제 `armors/headless`·`helmets/atk`·`fx_wild_stamp`·`skeleton_warrior` 합성).

## 2026-11-20 · songduckjin 작업 210 캐릭터 선택 카드 외형 동기화(실제 착용 장비 합성 초상화)
- **배경**: 캐릭터 선택 카드가 전사는 `/assets/warrior_{gender}_base.png`(구형 필드 스프라이트), 궁수·마법사는 장비를 반영하지 않은 정적 `idle_v1` 시트를 보여 줘서 인게임 캐릭터와 달랐다.
- **서버**(`server/endpoints/account.mjs`): `characters` 응답에 `equipment`를 더한다 — `portraitEquipment(save)`가 `save_json`에서 **투구·갑옷·무기 이름만**(각 40자 컷, 빈 슬롯은 `null`) 꺼내고 능력치·가방·세이브 본문은 내려보내지 않는다. 카드 그림이 `baseItemIndex`(이름 기반 외형 티어)만 요구해서 이름으로 충분하다.
- **클라이언트**(`src/ui/modals/charactersModal.ts`): `characterPortraitSave(summary)`가 요약(성별·직업·장비 이름)을 최소 `Save`로 만들고 `equipmentPortraitPlan`·`renderEquipmentPortrait`에 넘긴다 — 필드·장비창과 **같은 합성 경로**(전신 시트 + 투구/모자 + 갑옷/로브 + 대검/활/지팡이 파츠)를 그대로 쓴다. 접속 중인 슬롯(`slot === ui.session.characterSlot`)은 `ui.world.save`를 써서 장비를 갈아입고 모달을 다시 열면 바로 반영된다. 합성 전에는 같은 조합의 전신 시트를 먼저 보여 주고, 결과는 `cardPortraits`(키별, 24개)에 기억해 사냥 중 재렌더에도 깜빡이지 않는다. `warrior_*_base` 경로와 `characterImage()`는 삭제.
- **출력 높이 옵션**(`src/ui/equipmentPortrait.ts`): `renderEquipmentPortrait(save, { height })`·`EquipmentPortraitOptions`·`portraitOutputHeight` 추가. 카드는 360px로 그려 캔버스가 가볍고, 캐시 키에 높이를 붙여 장비창(720px) 결과를 덮어쓰지 않는다.
- **CSS**(`src/styles/modals.css`): `.character-slot img.character-portrait` — 112px·`object-fit: contain`·`object-position: center bottom`. 세 직업 모두 머리·무기가 잘리지 않고 발끝이 같은 높이에 맞는다. 합성 PNG에서 알파가 캔버스 가장자리에 닿지 않는 것(좌우·상하 여백 ≥13px, 마법사 투구 여유 44행)을 확인했다.
- **테스트**: 신규 `tests/character-portrait.test.mjs` 5건 — ① `characters` 응답이 장비 이름 3종만 내려보내고 세이브 본문이 없음 ② 전사·궁수·마법사 × 남녀로 `characterPortraitSave`의 전신 시트·합성 키·파츠가 라이브 세이브와 완전히 같음 ③ 장비 없는 요약의 폴백 시트와 `warrior_*_base` 미사용 ④ 카드 렌더가 접속 슬롯은 라이브 세이브, 다른 슬롯은 서버 장비로 첫 페인트 ⑤ 카드 높이(360) 합성이 전신+투구+대검 3장을 그린다. `tests/archer.test.mjs`의 캐시 버스터 검사는 카드가 시트 경로를 직접 만들지 않게 바뀐 책임에 맞춰 `charactersModal.ts`가 시트 경로를 갖지 않는지로 교체.
- **검증**: `npx tsc --noEmit` 통과, 전체 663건 중 661 통과(실패 2건은 변경 전 `origin/main`에서도 같은 `costume-field-render` — 스태시 후 재현 확인), `npx vite build` 통과(번들에 `character-portrait`·합성 폴백 로그 확인).
- **미리보기**: 필드·장비창과 같은 합성으로 남녀·직업별 초상화와 카드(112px) 배치를 확인 — 전사 대검·궁수 활/투구·마법사 로브/모자/지팡이가 모두 카드 안에 들어온다.
- **머지·배포**: [PR #164](https://github.com/songduckjin/DJRPG/pull/164) 스쿼시 병합 `dd5ec4dc3f63`(2026-11-20T08:35:18Z). Cloudflare Pages 체크 통과(`Workers Builds: djrpg`는 종전과 같은 상시 실패 잔재). 운영 `https://djrpg.pages.dev/version.json` = `dd5ec4dc3f63`(`builtAt 2026-11-20T08:35:18.200Z`), 루트 200. 운영 API: 게스트 등록 → `/api/account` `characters` 응답에 `equipment:{"helmet":null,"armor":null,"weapon":null}`(새 게스트) 확인. 배포 번들 `index-BGbZXgNB.js`에 `character-portrait`·`캐릭터 … 외형` alt·합성 폴백 문구, CSS `index-CVZnLEOs.css`에 `.character-portrait{height:112px;object-position:center bottom}` 확인.
- **사용자 확인 몫**: 캐릭터 선택 모달 실기 — 접속 중 슬롯의 장비를 바꾼 뒤 다시 열었을 때 카드가 즉시 바뀌는지, 다른 슬롯 카드가 그 캐릭터의 실제 착용 장비(투구·갑옷·무기/활/지팡이)와 같은지, 3장이 한 화면에서 잘리지 않는지.

## 2026-11-20 · songduckjin 작업 211 209 후속 보강(거래소 정렬 인덱스·던전 시드/리플레이 검증)

- **머지·배포**: [PR #165](https://github.com/songduckjin/DJRPG/pull/165) 스쿼시 병합 `5af89869d90b`(2026-11-20T08:42Z). `origin/main`(9174d16) 위로 리베이스하며 작업 번호를 211로 정정(캐릭터 카드 작업이 210으로 먼저 머지). 운영 `version.json` = `5af89869d90b`(`builtAt` 2026-11-20T08:42:27Z), 루트 200, 배포 번들 `index-B4sA3AHy.js`에 `djrpg.dungeon.clear`·`1/60`·`seed` 포함, 운영 API 4종 401 + `Server-Timing` 확인. 브랜치 삭제는 403으로 미완(브랜치 `feat/210-market-index-dungeon-seed` 남음). 브라우저·iOS 실기 확인은 사용자 몫.

- **거래소**: 실제 표는 `djrpg_market`(지시서의 `djrpg_market_listings`는 없다). `snapshot()`의 스탯 필터·정렬이 `COALESCE(json_extract(item_json,'$.stats.<스탯>'),0)`이라 10만 건에서 97~101ms(임시 B-tree + 판매 중 전행 스캔)였다. `server/database.mjs`에 `marketStatExpression(stat)`·`MARKET_SORT_STATS`·`marketSortIndexStatements()`를 두고 `state` 첫 열 + 식 DESC + `created_at DESC,id` **표현식 인덱스 6개**(스탯 5 + 가격)를 스키마 배치에 넣었다. `snapshot()`도 같은 식 함수를 쓴다. **부분 인덱스(`WHERE state='active'`)는 질의의 `state=?`가 바인딩 값이라 채택되지 않았다**(실측 70ms 그대로) — 전체 인덱스만 동작. 인덱스 DDL이 실패하면 인덱스만 빼고 스키마를 다시 만든다(서비스 정지 방지).
- **거래소 실측**(`scripts/explain-market-query.mjs`, 임시 파일 DB·5회 중앙값·개선 전/후를 같은 DB에서): 10만 건 스탯 정렬 97.01→0.27ms(공격) / 96.58→0.31 / 101.10→0.31 / 71.56→0.10(치명) / 71.56→0.08(속도), 스탯+무기 카테고리 85.30→1.06, 가격 오름차순 31.95→0.30, 가격 범위 26.67→0.28. 2만 건 스탯 18.6~19.7→0.26~0.30, 가격 14.45→0.28. 인덱스 6개 18.1MB(10만)·3.5MB(2만), 생성 771ms(10만)·142ms(2만). 기본 목록·이름 검색·내 매물·시세는 그대로 수 ms.
- **던전**: `start`가 32비트 시드와 시작 시각을 함께 발급·저장(`djrpg_dungeon_attempts.seed`, 기존 표는 `ALTER`로 보강, 같은 층 재입장은 유지). 전투는 `DUNGEON_STEP=1/60` 고정 스텝으로만 전진하고, 전투 경로(`world/items/bossLoot/dungeonBattle`)는 `src/game/rng.ts` `random()`을 쓴다. `DungeonBattle`은 시드를 각 스텝에만 걸어 웨이브 등장 자리를 ±8.6°·±8% 흔든다(시드가 없으면 종전과 같다). 클리어 시 `dungeonBattleSummary`(won·steps·heroHp·heroHpMax·enemyHp·slain·digest)를 `submit`에 싣고, 서버 `verifyDungeonClear`가 같은 시드·스텝으로 리플레이해 경과 시간·요약 존재·스텝 요구 시간·리플레이 대비 스텝/체력 ±12%를 확인한다. 신규 에러 코드 `DUNGEON_SUMMARY_REQUIRED`·`DUNGEON_SUMMARY_MISMATCH`(기존 코드·PR #162 따라잡기 예외 유지). 판정 근거는 `{"event":"dungeon_verify",...}` 로그로 남긴다.
- **검증**: `npx tsc --noEmit`, `npx vite build`, 신규 `tests/market-index`(4)·`tests/dungeon-seed`(6), 전체 671건 중 617 통과(실패 54건은 이 체크아웃에 `public/assets/**`가 없어 생기는 기존 에셋 실패 — 같은 환경의 `origin/main`과 같은 목록), `node scripts/explain-market-query.mjs --rows=20000/100000`. 브라우저·iOS 실기 확인은 사용자 몫.
- **남은 위험**: 요약 대조는 ±12% 허용(브라우저 엔진 차이 흡수)이라, 같은 세이브·층의 요약을 미리 계산해 재사용하는 스크립트는 통과할 수 있다(전투 로직을 실제로 돌려야 한다). `digest`는 로그로만 남겨 실제 일치율을 본 뒤 좁힌다. 리플레이가 못 깨는 세이브는 예전처럼 30초 관대 경로(현재 던전은 어떤 세이브든 17~25초에 깨므로 사실상 미사용).
## 2026-11-20 · songduckjin 작업 209 100명 동시 접속 대응(서버 검증 경계·저장 최소화·읽기/쓰기 분리·계측·부하 테스트)
- **먼저 확인**: main의 `reconcileItems`(소유권·스탯), `djrpg_save_requests`(멱등), 거래소 `mutate` 단일 트랜잭션, 월드보스 `replayBoss`·`djrpg_boss_rewards`, `schema()`·`market-connection.mjs` 캐시는 **이미 해결**돼 있어 손대지 않았다.
- **신규 `server/save-guard.mjs`**(순수 JS — ts 로더 없이 도는 `scripts/migrate-turso-db.mjs`가 DB 모듈을 그대로 쓴다): `rewardBudget`이 마지막 저장 이후 서버 시계 경과(최대 12시간)와 층으로 킬(60+6/초)·보스·경험치(×2)·금화·강화석·아이템 개수(8+0.5/초) 상한을 계산하고, `clampSaveProgress`가 **넘친 값만** 잘라 낸다(거부 아님). `itemWithinBounds`는 `rollItem` 공식(등급배율·티어 보정·plus 8%/단계)에 옛 세이브 여유 2.5배를 둔 능력치 상한이다. 상수는 게임 원본과 같은지 테스트가 대조하고, 1~120층 × 등급 × 직업 드롭 3,000여 개가 전부 통과하는 것을 고정했다.
- **`server/database.mjs`**: `writeSave`가 클램프를 적용하고 `credits`(거래소 판매대금·우편 보상)를 상한에 더하며 `clamped`를 반환, `reconcileItems`는 **소유 기록도 이전 세이브에도 없는** 아이템만 개수·능력치를 검사(첫 배포에서 기존 가방이 거부되지 않게), `account()`가 `djrpg_dungeon_records`를 LEFT JOIN해 `dungeon_record_floor`를 함께 주고(저장마다 왕복 추가 없음), `schema()`에 던전 표 DDL을 추가했다.
- **던전 검증**: `DungeonBattle`이 DOM 없는 순수 로직이라 서버가 리플레이한다(`server/dungeon-verify.mjs`). `start`로 서버가 시작 시각을 적고(`djrpg_dungeon_attempts`), `submit`이 기록+1층·시작 기록·최소 클리어 시간(리플레이 시간의 절반, 최소 10초/미클리어 30초)을 확인한 뒤에만 `djrpg_dungeon_records`를 올린다. `writeSave`는 세이브의 `dungeonFloor`를 기록+1까지만 저장한다. `list`는 읽기 배치만. 클라이언트는 `dungeonField`의 층 진입에서 `live.enter(floor)`, 결과에서 `submit(floor)`, 검증 실패 시 12초 뒤 최대 3회 재전송.
- **저장 최소화**: `sync.ts`에 `dirty`/`changeSeq`/`lastSaveAt`을 넣어 `queueSave`가 마지막 저장 5초 뒤로 예약하고, `main.ts`의 5초 점검은 `flushIfDirty()`(변경 없으면 요청 0건). 저장 중 변경은 `changeSeq` 비교로 이어서 보낸다. `flush()` 자체는 종전대로 항상 저장한다(명시 저장 계약 유지).
- **읽기/쓰기 분리·연결·계측**: 월드보스 `list`는 `quickList`(읽기 배치 한 번)로 답하고 오늘 첫 요청·정산 필요 시에만 쓰기 경로, `server/connection.mjs` `sharedConnection`으로 account/dungeon/world-boss도 연결 재사용, `server/metrics.mjs`가 `Server-Timing`(`schema`/`db`/`tx`/`replay`/`settle`/`total`)과 `{"event":"api",...}` 로그(세이브 본문·토큰 없음)를 남긴다.
- **검증**: `npx tsc --noEmit` 통과, 신규 테스트 `save-guard` 8/8·`concurrency` 9/9(같은 매물 두 구매자·멱등·창고·응답 유실·타계정 소유권·위조 아이템·클램프·월드보스 HP 합/보상 1회·조회 무쓰기)·`dungeon-verify` 6/6·`sync` 3건, 기존 계약 테스트 수정(던전 순위·결과창 소스 검사, 여행 일일/주간 카운터는 서버 시계를 되돌려 큰 진행을 넣도록, 이관 테이블 18→20). 전체 656건 중 602 통과 — 실패 54건은 이 체크아웃에 `public/assets/**`가 없어 생기는 기존 에셋 테스트다(`origin/main`과 같은 목록). `npx vite build` 통과(`npm run build`는 `verify-item-art`가 에셋을 요구해 여기서는 불가, CI가 수행).
- **실측**: `scripts/load-test-100.mjs`(임시 파일 DB·실제 엔드포인트) 100명 10초 저장 1,000건 오류 0·p95 2.0ms, 100명·100ms 주기 4,109건 오류 0·p95 1.8ms, 거래소 혼합 4,595건 오류 0 — **로컬 측정이라 운영 p95로 단정하지 않는다**. `scripts/explain-market-query.mjs` 2만 건: 모든 조회 인덱스 사용, 기본 0.8ms·이름 0.6ms·가격 정렬 15ms·스탯 정렬 15ms, 10만 건 스탯 정렬 73ms → 인덱스·페이지네이션 변경 없음(근거만 기록). 상세 `docs/SCALE_100.md`.
- **머지·배포**: [PR #160](https://github.com/songduckjin/DJRPG/pull/160) 스쿼시 병합 `f61afd2a4e4b`(2026-11-20T07:26:31Z). Cloudflare Pages 프리뷰 빌드 통과(전체 `npm run build` — `verify-item-art`·`vite build` 포함, 에셋이 있는 CI에서만 가능), `Workers Builds: djrpg`는 `main`에서도 같은 상시 실패. 운영 `https://djrpg.pages.dev/version.json` = `f61afd2a4e4b`(`builtAt 2026-11-20T07:26:50Z`), 루트 200, 배포 번들 `index-AF3cwFOD.js`에 `flushIfDirty`·`markDirty`·`changeSeq`·`lastSaveAt`·`start",{floor` 포함 확인, 운영 API `/api/account`·`/api/market`·`/api/dungeon`의 401 응답에 `Server-Timing` 헤더가 붙는 것 확인(새 서버 계측 코드가 배포됨).
- **후속 수정**: [PR #162](https://github.com/songduckjin/DJRPG/pull/162) 스쿼시 병합 `4f420aaeb6ae` — 서버 기록이 세이브를 따라오지 못한 계정(배포 이전에 이미 층을 깬 계정)이 `DUNGEON_OUT_OF_ORDER`로 영원히 순위에 오르지 못하던 문제를 고쳤다(기록이 비어 있을 때 한 번만 저장된 층 인정, 그 뒤 한 층씩). 운영 `version.json` = `4f420aaeb6ae`(`builtAt 2026-11-20T07:36:00Z`)·루트 200·`/api/dungeon` 401 응답에 `Server-Timing` 확인.
- **사용자 확인 몫**: 브라우저 실기(던전 층 진입 → 클리어 → 순위 반영, 사냥 중 저장 빈도·오프라인 보상 정상 지급) 확인.
- **남은 위험**: 운영 p95 미측정, 던전 검증은 시간 기반 가능성 경계(스크립트 우회 여지), 능력치 상한의 2.5배 여유 안에서는 최대치 아이템 1개 생성 가능, 클램프된 클라이언트의 로컬 값이 서버와 잠시 다를 수 있음.
## 2026-11-20 · songduckjin 작업 206 캐릭터 삭제 확인 모달(브라우저 prompt 제거) + 작업207 직업별 사거리 간격 조정
- **작업 206 배경**: 캐릭터 삭제가 `window.prompt()`로 이름을 받고 있어 iOS 인앱 브라우저(구글 앱·사파리 웹뷰)에서 시스템 얼럿이 게임 UI 위에 떴고, 입력·확인 클릭이 먹통이 되거나 이름이 틀리면 아무 안내 없이 조용히 끝났다.
- **작업 206 구현**(`src/ui/modals/charactersModal.ts` `openDeleteCharacter`): 경고 문구(`${name} 캐릭터와 착용 장비·가방 아이템 ${itemCount ?? 0}개가 영구 삭제됩니다.`)·이름 확인 입력창·`취소`·`영구 삭제`(위험 강조)를 다크 판타지 톤 확인창(`.character-delete-overlay`·`-card`·`-warning`·`-field`·`-error`·`-confirm`, `styles/modals.css`)으로 그린다. 목록의 `삭제` 버튼은 `openDeleteCharacter(ui, character)`만 부른다.
- **맞는 이름에서만 삭제**: 입력값이 캐릭터 이름과 같아지면 `영구 삭제`가 `.ready`(붉은 그라데이션·발광)로 바뀌고, 다르면 누를 때 확인창 안에 `캐릭터 이름을 정확히 입력해 주세요.`(`role="alert"`)를 남기고 입력창으로 되돌린다 — 조용한 `return` 없음. `input` 이벤트에서 이름이 맞으면 안내가 지워진다.
- **요청 중·성공·실패**: `sync.flush()`로 저장을 먼저 확인한 뒤 `accountRequest('deleteCharacter', { slot, name, revision })`. 요청 중에는 취소·영구 삭제를 비활성화하고 버튼이 `삭제 중…`이 되며(두 번 눌러도 요청 1회), 성공하면 확인창을 닫고 `ui.characterList = undefined` → `loadCharacters`로 목록을 다시 읽은 뒤 `${name} 캐릭터를 삭제했습니다.`를 띄운다. 실패(서버 `ACTIVE_CHARACTER`·`CHARACTER_NAME_MISMATCH` 등)는 확인창 안에 서버 메시지를 남기고 버튼을 `영구 삭제`로 되돌린다.
- **목록 모달 밖에 얹는 이유**: 캐릭터 목록은 사냥 중 `world.onChange`마다 `.modal-dialog`가 다시 그려진다. 확인창을 그 안에 두면 입력 중인 이름과 오류 문구가 사라지므로, 분해 보호 팝업과 같은 방식으로 `ui.root`에 한 겹만 얹고(목록 모달 위) 목록 모달이 닫히면 `hidden` 감시로 함께 닫는다(Escape는 이 확인창만 닫는다).
- **모바일(iOS 웹뷰)**: 입력창 `font-size:16px`(포커스 시 자동 확대 방지)·`autocapitalize/autocorrect off`·`spellcheck=false`·`enterkeyhint=done`, 버튼 `min-height:46px`·`touch-action:manipulation`, 오버레이 `z-index:60`(목록은 5, 생성 로딩은 100), 카드 `max-height:88dvh` 스크롤로 키보드가 올라와도 확인 버튼이 가려지지 않는다. 포커스는 확인창을 여는 클릭 안에서 바로 준다.
- **작업 207 사거리**: `game/world.ts` — 궁수 `archerAttackRange 280`·`archerStopRange 150`, 마법사 `mageAttackRange 210`·`mageStopRange 110`, 전사 90 유지(사용자 확정). 궁수>마법사>전사 순서와 사거리>정지 거리를 테스트로 고정했다.
- **테스트**: `tests/modal-ui.test.mjs` 4건 추가(렌더·`window.prompt` 미사용·불일치 안내·`삭제 중…`+중복 클릭 1회+목록 갱신·실패 메시지)로 16/16. `tests/archer.test.mjs`·`tests/mage.test.mjs`는 정지 거리 기대값을 하드코딩(99/70·118) 대신 상수 기준(`stopRange±20`)으로 바꾸고 확정 수치·순서 테스트를 넣어 29/29.
- **검증**: `npx tsc --noEmit`, 관련 회귀(`characters`·`world-movement`·`arena`·`modal-interaction`·`bag-capacity`) 통과, 전체 608건 중 606 통과(실패 2건은 `origin/main`에서도 같은 `costume-field-render` 2건), `npm run build` 통과(배포 번들에 `character-delete-overlay`·`삭제 중…` 포함 확인).
- **검증**: `npx tsc --noEmit`, 관련 회귀(`characters`·`world-movement`·`arena`·`modal-interaction`·`bag-capacity`) 통과, 전체 **621건 중 619 통과**(실패 2건은 `origin/main`에서도 같은 `costume-field-render` 2건), `npm run build` 통과(배포 번들에 `character-delete-overlay`·`삭제 중…`·`캐릭터 이름을 정확히 입력해 주세요.` 포함 확인).
- **머지·배포**: [PR #155](https://github.com/songduckjin/DJRPG/pull/155) 스쿼시 병합 `404d7e1692d9`(2026-11-20T06:17:04Z). 운영 `https://djrpg.pages.dev/version.json` = `404d7e1692d9`(`builtAt 2026-11-20T06:17:28Z`, 루트 200), 배포 번들 `index-CFncNrmx.js`에 `character-delete-overlay`·`character-delete-confirm`·`삭제 중…`·`캐릭터 이름을 정확히 입력해 주세요.`, CSS `index-CLpTlbBa.css`에 `.character-delete-*`·`.character-delete-confirm.ready{border-color:#ff6a5e…}` 확인. 사거리는 배포 번들에서 `La=280,MI=150,Fa=210,kI=110`과 `job==="archer"?MI:job==="mage"?kI:90`·`job==="archer"?La:job==="mage"?Fa:90` 사용부까지 확인.
- **남은 것**: iOS 실기(인게임 캐릭터 선택 → 삭제 → 이름 입력·키보드·버튼 터치) 확인은 사용자 몫. 서버 `deleteCharacter`(이름 불일치 `CHARACTER_NAME_MISMATCH`·현재 캐릭터 `ACTIVE_CHARACTER`·마지막 캐릭터 `LAST_CHARACTER` 차단)는 이번에 바꾸지 않았다.
- **겹침 참고**: `docs/TASK.md`의 `[-]` 작업 191·192가 같은 파일(`charactersModal.ts`·`world.ts`)을 잡고 있었으나 원격에 해당 브랜치(`codex/191-*`·`codex/192-shop`)와 커밋이 없어 실제 진행 흔적이 없었다. 변경은 `charactersModal.ts`의 새 함수/오버레이와 `modals.css` 새 클래스로만 한정했다.
## 2026-11-20 · songduckjin 작업215 전사 `hell` → 회전참격(암흑·진홍 혈풍 회오리)
- 사용자 확정: 3번 시안(`downloads/skill_whirl_slash/opt_c.png`) — 전사 주변 360°를 감싸고 도는 암흑·진홍 혈풍 회오리. 스킬명 `회전참격`, ID `hell` 유지(세이브 호환).
- 스킬 표: `skills.ts` `hell` 이름·설명(`360° 회전`·`사방`)·위력(`공격력 × 3.2 · 360° 회전`), 쿨 16·사거리 185 그대로(해금 레벨 14는 작업 212 순서). `ui/hud.ts` 짧은 이름 `회전참격`.
- 이펙트: `render/vfx.ts` `drawWhirlSlash`. 텍스처 `fx_whirl_slash_ring.png`(512², 62KB)는 `downloads/whirl/ring_b.png`(시안에서 캐릭터 없이 뽑은 위에서 본 혈풍)를 `scripts/build-whirl-slash-fx.py`로 굽는다 — 중심 구멍 0.22~0.40, **알파=밝기×3.4**, 색 ×1.6, 128색 팔레트.
- 왜 `add`가 아니라 일반 합성인가: `add`로만 얹으면 어두운 안개가 전부 사라져 밝은 분홍 번짐만 남았다. 본체는 일반 합성으로 어둡게 깔고, 밝은 혈흔만 같은 텍스처를 `add`로 한 겹 더 얹는다.
- 왜 컨테이너인가: 눌린 타원 스프라이트를 직접 돌리면 타원이 통째로 기울어 공중에서 도는 것처럼 보인다. `scale.y .52` 컨테이너 `floor`(`vfxLayers`)의 자식으로 넣어 회전이 바닥 평면에서 일어나게 했다. 지면은 `dragonBack`(액터 뒤)에 깔아 전사 몸을 덮지 않는다.
- 구성: 바깥 회오리(−.6−age×7.4rad/s)·안쪽 하이라이트(age×10.5, `add`)·위로 솟는 고리 2겹(y −44·−88, 6.2·8.4rad/s), 바닥 암흑 기운 5겹 타원, 조여드는 테두리, 칼날 궤적(굵기 변화 선), 혈점·불티 12개.
- 모션: `drawHero`가 `hell` 동안 가로 배율 cos 스핀(.46초 한 바퀴 — 뒤집힘 포함)과 7px 도약, 잔상 색 `0xd2352f`. 코스튬 템플릿 `hell` → `spin`.
- 판정 불변: `world.ts` `hell` 360° 광역(사거리 185, 시전 즉시 + 0.4초 간격) 그대로 — 4방향 피격/사거리 밖 무피해 테스트 추가.
- 테스트: 신규 `tests/skill-whirl-slash.test.mjs` 6/6, `costume-manifest` 14/14(템플릿 표 갱신), 전체 622건 중 620(실패 2건은 `origin/main`에서도 같은 `costume-field-render`), `verify-item-art`, `npm run build`.
- 검수 이미지: `downloads/djrpg_skill_whirl_slash_ingame_v1.png`(필드 합성).
- 배포: [PR #172](https://github.com/songduckjin/DJRPG/pull/172) 스쿼시 병합 `17f2eb9aaefc`. 그 사이 작업 212·213·214가 먼저 머지돼`skills.ts`(새 스킬 순서·`hell` 해금 레벨 14)·`costume-manifest.test.mjs`·`TASK`/`WORKLOG`/`CODE_MAP` 충돌을 풀며 두 번 리베이스했다(파일이 겹치지 않아 기능 충돌은 없었고, `hell`은 새 순서의 6번 자리를 유지한다). 운영 `version.json` `17f2eb9aaefc`(`builtAt 2026-11-20T10:38:55Z`)·루트 200·새 에셋 **HTTP 200 `image/png` 63,895B(원격 sha256=로컬)**·배포 번들 `index-BicZHXvC.js`에 `fx_whirl_slash_ring.png`·`회전참격`×2·`fxWhirl`×6·`vfxLayers`·틴트 `0xd2352f`(13776175) 포함, 옛 이름 `헬파이어` 0건 확인.

## 2026-11-20 · fks3997 작업201 장비 +1~+7 강화 단계(미리보기 → 운영 배포)
- 사용자 확정 스펙: "10층마다 한 단계씩 열리고(최대 +7) 확률로 떨어지며, 이름 옆에 다른 색 +숫자로 보이고, 기존 보유 장비도 등급·스탯으로 알아서 보수적으로 표기".
- `items.ts`: `maxPlusFor(floor)=min(7, floor((floor-1)/10))`, `plusWeights`/`rollPlus`(단계 가중치 `0.6^k`, 보스 `×1.2^k`), `applyPlus`(단계당 8% → `+7`=1.56배), `plusOf`, `itemDisplayName`, `estimatePlus`(최대 랜덤 3·최고 티어 보정·쯔바이핸드 보정을 먼저 뺀 보수적 역산), `normalizePlus`. `rollItem`은 `plus`(0 포함)를 항상 적고, `migrateItem`은 `plus`가 없는 옛 장비만 역산한다.
- UI: 신규 `ui/itemName.ts` `renderItemName`/`itemNameText`가 이름은 그대로 두고 `<span class="item-plus">+N</span>`(밝은 에메랄드 `#43f6c5`)만 덧붙인다 — 장비창 가방/상세, 장착 상세, 분해 보호 팝업, 분해 확인, 오프라인 보상, 거래소, 공용창고, 필드 획득 문구. `item.name`을 바꾸면 서버 `identity`(이름 포함) 때문에 409가 나므로 이름은 절대 손대지 않는다.
- 서버: `database.mjs` `identity`/`sameItemBody`는 `plus`를 보지 않고 `reconcileItems`가 0~7로 정규화 — 옛 장비가 로드에서 plus를 얻어도 409 ITEM_CONFLICT가 없고, 스탯 변조는 그대로 막힌다(실제 sqlite 모듈 테스트로 확인).
- 테스트: 신규 `tests/item-plus.test.mjs` 7/7(해금 10층 단위, 20,000회 분포, +8%, 옛 장비 전수 보수성, `plus:0` 유지, UI 색 클래스, ITEM_CONFLICT). 기존 계약 2건은 새 필드에 맞춰 갱신(`ring-restore` 반복 파싱 동일성, `codex` 0단계 기준 미리보기). `npx tsc --noEmit`·`npx vite build` 통과, 전체 505건 중 450 통과(55 실패는 sparse 체크아웃의 에셋/서버 파일 없음 + 종전 `costume-field-render` 2건).
- 번호: 199(마법사 로브·지팡이 PR #135·#136)·200(궁수 투구 PR #134)과 겹쳐 **201**로 등록.
- 배포: [PR #137](https://github.com/songduckjin/DJRPG/pull/137) 스쿼시 병합 `a55b97384569`(브랜치 유지). 운영 `version.json` `a55b97384569`·`builtAt 2026-11-20T04:45:30Z`(HTTP 200), 루트 200, 번들 `index-BXKKPRVo.js`에 `item-plus`·`강화 +`·`Math.min(7`, CSS `index-Y4PlZyty.css`에 `#43f6c5`. API: 게스트 등록 200·load 200·plus 붙은 아이템 저장 200·재load에서 `plus:4` 유지·`/api/dungeon` list 200·`/api/market` list/recent-price 200.

## 2026-11-20 · songduckjin 작업200 궁수 전용 투구 10종 외형(서기·걷기·사격 파츠 + 머리 없는 본체)
- 궁수(`job === 'archer'`)가 투구를 쓰면 전사 판금 투구 대신 **궁수 전용 투구·모자 10종**(가죽 두건 ~ 신궁의 황금 왕관)이 나온다. 파츠는 승인 시안 `downloads/archer_helm_preview/{male,female}_helm_{0..9}.png`에서 뽑았고, 빌더는 `scripts/build-archer-helm-parts.py` 하나다.
- **파츠 20장** `public/assets/pilot-25d/archer_helms/{성별}_{0..9}_v1.png`: 시안을 기본 원본과 같은 캔버스 변환(높이 337·발끝 y=353·중심 x=181 — `build-archer-sheets.py`의 서기 규칙)으로 362px 셀에 옮긴 뒤 **머리 영역 다각형**(`HEAD_POLYGON`, 여성은 포니테일·옆 땋은 머리 포함)만 오려 낸 전체 셀 PNG(256색, 장당 5KB·합계 164KB). 얼굴·머리카락이 파츠 안에 함께 들어 있어 오픈페이스(서클릿·왕관)도 얼굴이 겹치지 않는다.
- **머리 없는 본체 12장** `public/assets/pilot-25d/archer_headless/{,nobow}/archer_{성별}_{동작}_v1.png`(합계 436KB): 같은 다각형을 본체에서 지운 판. 파츠와 구멍이 **같은 도형**이라 목·칼라 이음매가 남지 않고, 파츠가 로딩되기 전에는 머리 있는 시트로 그려 머리가 빈 채로 보이지 않는다.
- **자세 표** `archerHelmFrames`(`src/game/render/archerHelmets.ts`): 걷기·사격은 인물이 작게 그려져 서기 얼굴(150,25)-(200,80)을 각 프레임에서 템플릿 매칭(TM_CCOEFF_NORMED)해 배율·좌상단을 잰 값이다 — 남 걷기 0.90~0.93/사격 0.66~0.72, 여 걷기 0.92~0.93/사격 0.65~0.70. 파츠 앵커는 좌상단(0,0), 회전 없음(사격 자세의 고개 숙임은 그림에 이미 들어 있다).
- **조합**: 활을 1번 이상 차면 기본 활 지운 `nobow` 본체의 머리 없는 판을 써서 활·투구를 함께 착용해도 셀 좌표계가 같다(갑옷 10종 시트도 같은 규격 — 갑옷 작업이 붙을 때 머리 없는 판만 추가하면 된다).
- 코드: `render/entities.ts` `syncArcherHelmet`·`drawHero`(머리 없는 시트 교체·`lastArcherHelmBow` 키로 머리 없는 시트 3장 프리페치), `render.ts`(`archerHeadlessFrame`·`prefetchArcherHeadless`·투구 파츠 20장 부팅 프리로드), `ui/equipmentPortrait.ts`(`equipmentPortraitArcherHelm`·`composeFallback` 좌상단 합성·캐시 키에 투구 포함). `store.ts`·`server/**`·`world.ts`·`baseItems.helmet` 순서·전사 투구 파이프라인은 그대로다.
- 검증: `npx tsc --noEmit`, `tests/archer-helm-render.test.mjs` 10/10(파츠 규격·머리 지움·자세 표·drawHero·장비창), `tests/archer.test.mjs` 15/15, 전체 573건 중 570 통과(실패 3건은 `origin/main` 953c52f에서 동일 재현 — `costume-field-render` 2, `market` schema 1), `node scripts/verify-item-art.mjs`(투구 20·머리 없는 시트 12 추가), `npm run build`, `git diff --check`.
- 검수: `downloads/djrpg_archer_helms_preview_v1.png`(남녀 10종 서기), `djrpg_archer_helms_motion_v1.png`(대표 3종 × 걷기·사격 4프레임), `djrpg_archer_helms_ingame_v1.png`(390×844 실게임 배율) — 머리카락 비침·이중 머리·목 이음매 없음 확인. 브라우저 실기 화면은 미확인(로컬 루프백 차단 — 사용자 몫).
- 번호 참고: 199는 마법사 로브 작업, 200으로 등록했다(198은 마법사 직업과 fks3997 체력 상향이 겹쳐 있는 상태).
- **머지·배포**: [PR #134](https://github.com/songduckjin/DJRPG/pull/134) 스쿼시 병합 `1dfb08910e79`. Cloudflare Pages 운영 `version.json` `1dfb08910e79`(`builtAt 2026-11-20T04:34:29Z`), **새 에셋 32장(투구 파츠 20 + 머리 없는 시트 12) 전부 HTTP 200 `image/png`·원격 sha256=로컬**, 배포 번들 `index-bvyg8b6g.js`에 `archer_helms/`·`archer_headless`·`nobow` 경로와 자세 표(`x:66,y:97,scale:.72` 등) 포함 확인. `Workers Builds: djrpg`는 기존과 같이 실패(실제 배포 경로인 Cloudflare Pages 체크는 통과).

## 2026-11-20 · fks3997 작업198 고층 일반·보스 체력 상향(미리보기)
- `game/world.ts` `deepMobHp` 곡선을 `24 + floor*14 + floor^2.65*0.52`로 올리고(78층 15,359→54,826), 보스는 `earlyBossHp`(예전 곡선)에서 같은 램프(8→25층)로 `일반 몹 ×6`(78층 41,710→328,955)까지 넘어가게 했다. 1~8층 일반·보스는 예전 값 그대로, 10~15층은 작업 196 수준(299/653), 25층 3,008·40층 9,735·50층 17,254로 25층부터 본격 상승, 오프라인 정산(`offlineMobHp`)·던전 HP는 불변.
- 테스트 기대치 갱신(`balance-196` 딥 몹/보스, `world-movement` HP 표). tsc·관련 79테스트·`npx vite build` 통과, 전체 538건 중 497 통과(41 실패는 sparse 체크아웃의 `public/assets/**`·`server/**` 없음에서 오는 기존 실패). 미리보기에서 사용자 확인 후 운영 배포를 위해 `main` 병합.
- 번호 참고: 같은 번호 198을 songduckjin 님이 '마법사 직업'(PR #128)으로도 등록했다(미리보기 브랜치에만 있던 이 작업 등록이 main에 보이지 않아 생긴 중복). 문서에서는 담당자로 구분한다.

## 2026-11-20 songduckjin — 작업198 마법사 직업(기본 시트·지팡이 10종·원거리 마법탄·스킬 8+3 뼈대)
- 세 번째 직업 `mage`를 `warrior`/`archer`와 같은 계약으로 붙였다. `Job`·`jobs`·`jobNames`·`jobOrDefault`(모르는 값은 전사)로 정규화하고, `store.parseSave`·`server/endpoints/account.mjs`(`jobOf`·`jobs`)가 `mage`를 허용·보존한다. 기존 전사·궁수 세이브는 장비·진행·퀵슬롯 그대로다.
- 에셋: 승인 원본(`downloads/mage_preview/{male,female}_{3,walk,attack}.png`)에서 전사·궁수와 같은 셀 좌표계(서기 362×362·걷기/공격 1448×362, 검정 배경 휘도 키잉, 발끝 정렬)의 `pilot-25d/mage_{male,female}_{idle,walk,attack}_v1.png` 6장을 만들었다. 스트립은 인물끼리 닿지 않아 세로줄로 자르지 않고, 큰 덩어리(본체)를 x 순서로 놓은 뒤 떨어진 장화·손의 마법 구슬을 상자 겹침이 가장 큰 본체에 붙였다(합쳐진 스트립은 narrowest-gap 방식 폴백). 크기는 bbox가 아니라 **머리끝~발끝**으로 맞춰 여성 시트의 지팡이가 머리 위로 솟아도 본체가 작아지지 않는다(빌더 `scripts/build-mage-sheets.py`).
- 지팡이 10종(`견습생의 지팡이`~`대현자의 성지팡이`)은 `staffBases`로 분리해 드랍·장착·표기('지팡이')만 마법사에 연결하고, 전사 대검·궁수 활의 드랍·코덱스·착용 시트는 그대로 뒀다. 아이콘은 `item-art/staff_0.png`·`staff_5.png`(870×290, 174×290 칸 5개), 스킬 아이콘은 `icons/mage-skills.png`(4×2)·`mage-passive-skills.png`(3×1), 빌더는 `scripts/build-staff-art.py`·`build-mage-icons.py`다.
- 전투: 마법사는 `mageAttackRange`(240)·`mageStopRange`(118) 원거리로, 평타는 화살 대신 **마법 구슬**(`shot` + `variant` arcane/fire/frost/chain/meteor, 남성 푸른 마력·여성 붉은 화염)이 도착 시점에 판정된다(`world.action`→`shoot`, `render/vfx.ts` `drawMagicBolt`).
- 스킬 뼈대 8종(파이어 볼트·아이스 볼트·체인 라이트닝·마력 폭발·프로스트 노바·아케인 실드·메테오 스트라이크·아르카나 오버로드)과 패시브 3종(지팡이 숙련·마나 회로·비전 감응). 투사체는 기존 `shoot`, 폭발·노바는 새 이펙트 `burst`/`nova`, 버프는 `ward`로 그리고 판정은 `update`의 `nextHit` 한 번만이다(노바 즉시 피해 중복 없음).
- 외형 가드: `usesBaseSheetOnly(save)` 하나로 `drawHero`·`equipmentPortrait`가 마법사도 기본 시트만 그리고 전사 갑옷·투구·대검 파츠를 호출하지 않는다(능력치는 정상 적용). `render.ts`에 `mageMale/Female(+Walk/Attack)` 경로, `heroScale`에 337/300/268.
- 생성 UI: 로그인 신규 가입과 `새 캐릭터` 모두 **위 줄 [전사][궁수][마법사] → 아래 줄 성별(남성/여성 마법사)**, 계정 창·캐릭터 카드·스킬 모달이 직업 이름과 시트를 따른다.
- 검증(최신 main 병합 후): `npx tsc --noEmit`, `node --test tests/mage.test.mjs` 13/13, 전체 `node --test tests/*.test.mjs` **553건 중 550 통과** — 실패 3건은 `origin/main`에서 동일 재현되는 기존 실패(`costume-field-render` 2, `market`의 schema 초기화 1: `db.execute is not a function`). `node scripts/verify-item-art.mjs`(마법사 시트 6·지팡이 10·아이콘 2 추가), `npm run build`, `git diff --check` 통과. 브라우저 실기 미실행(이 환경의 브라우저가 127.0.0.1 차단) — 게임 배율·아이소메트릭을 재현한 합성 검수 이미지 `downloads/djrpg_mage_ingame_v1.png`로 확인.
- **번호 정정**: 같은 번호 159를 다른 작업 세션이 '궁수 스타터 가죽 튜닉'(PR #124, 이미 main)으로 먼저 등록해, 이 작업을 **198**로 다시 등록하고 브랜치도 `feat/198-mage-job`으로 바꿨다(같은 내용의 PR #127은 닫고 #128로 재생성). 궁수 159의 코드·기록은 그대로다.
- **최신 main 통합**: `d6a701e`(작업 159·194~197)와 병합하며 `render.ts`·`store.ts`·`equipmentPortrait.ts`·`charactersModal.ts` 4파일을 손으로 합쳤다 — 궁수 시트 `?v=2` 캐시 버스터, 던전 `dungeonFloor`/`dungeonClearAt` 세이브 정규화, 캐릭터 카드의 방치/삭제·`itemCount` 구조를 보존하고 그 위에 마법사를 얹었다(캐시 버스터 테스트 포함 27/27).
- **머지·배포**: [PR #128](https://github.com/songduckjin/DJRPG/pull/128) 스쿼시 병합 `bc0a2617470c`. Cloudflare Pages 운영 `version.json` `bc0a2617470c`(`builtAt 2026-11-20T03:23:31Z`), 루트 200, **새 에셋 10장 전부 HTTP 200**(`mage_*_v1.png` 6·`item-art/staff_0|5.png`·`icons/mage-skills.png`·`mage-passive-skills.png`, 원격 sha256=로컬), 배포 번들 `index-C2qf-TOP.js`에 6경로·`item-art/staff_`·`mage-skills`·`fireBolt`·`arcaneOverlord`·'마법사'·'지팡이' 확인. `Workers Builds: djrpg`는 기존과 같이 실패(Cloudflare Pages 체크는 통과).

## 2026-11-19 · fks3997 작업167 로컬 경고 원 복원
- 내려찍기 타격점에 시전1초 빨간 원 점멸을 복원했다. tsc·부분31테스트·diff 통과. 사용자 최신 지시로 로컬에만 저장하고 미리보기/운영 생성은 하지 않는다.

## 2026-11-19 · fks3997 작업166 원래배경 확장 미리보기
- 작업165의 새 자갈이미지를 철회하고, 원래그림 core540×914 주위만 확장해637×1079로 구성했다. core1:1·양축 카메라팬·원래 불/풀 위치 복원, 경계24px만 연결했다.
- 중앙픽셀 일치·tsc·부분13테스트·아트/코스튬·diff 통과. Draft PR88의 미리보기만 갱신하고 운영은 변경하지 않는다.

## 2026-11-19 · fks3997 작업165 미리보기 전용 배경
- 최종637×1079 자갈 PNG/안쪽 바위·풀 배치·추가확대 제거·불/풀 실측 앵커·해상도 진폭 보정을 적용했다. tsc·부분12테스트·아트/코스튬·diff 통과.
- 사용자 지시: 이후 변경은 미리보기로 모으고 명시적 배포 요청 때 일괄배포한다. 본 작업은 Draft PR/Pages Preview만 생성하며 main은 병합하지 않는다.

# 작업 로그

## 2026-11-20 — 마법사 남녀 로브 10종 외형 적용 (작업 208)

- **요청**: `baseItems.armor` 0~9번(가죽 조끼 ~ 패왕의 전갑)이 마법사에게 장착되면 전사용 판금 갑옷이 아니라 **마법사 전용 로브 10종**으로 보이게 하고, 필드·장비창·운영 배포까지 완료.
- **로브 구성**: 0번(가죽 조끼)은 스타터 천 로브 기준 시트(`mage_{성별}_{동작}_v1.png`, 지팡이 파츠 구조에서는 `mage_nostaff/`)를 그대로 쓰고, **1~9번만 새 시트**를 둔다. 승인 확정본(`downloads/mage_armor_preview/{male,female}_robe_{1..4}.png` + `_robe_{5..9}_v5.png`, 1254²)을 서기로, 걷기·공격은 `images --edit`로 로브만 바꿔 만들었다.
- **지팡이 파츠(작업 201)·마법사 투구(작업 204) 호환**: 로브 시트는 **기본 지팡이를 그리지 않은 판**이다. 걷기·공격 원본은 `mage_nostaff/` 시트에 `images --edit`를 걸어 손에 아무것도 쥐지 않은 4포즈로 생성했고(`downloads/mage_robe_gen/raw_nostaff/`), 서기는 승인 시안에서 지팡이만 지운 판(`downloads/mage_robe_gen/staffless/`)을 썼다. 그래서 지팡이를 차면 `staffs/` 파츠가, 투구를 쓰면 `mage_helms/` 파츠가 로브 위에 그대로 얹힌다. 투구용 **머리 없는 판**(`robes/headless/`)은 `mage_headless/nostaff` 와 `mage_nostaff` 의 차이(머리 영역)를 셀 좌표 그대로 옮겨 만들었다.
- **정합(핵심)**: 기준은 `mage_nostaff/` 시트(플레이어에게 실제로 그려지는 본체)다. ① 배경을 알파로 키잉하고 ② 4프레임 시트는 캐릭터가 없는 열에서 칸을 나눈 뒤 ③ **성별·동작별 배율 하나**(1~4번 티어의 몸통 기둥 높이 비율 중앙값: 남 서기 0.2978·걷기 0.6651·공격 0.6169, 여 0.321·0.6484·0.675)를 고정하고 ④ **발끝 y·몸통 기둥 중심 x**를 기준 시트에 맞춘 뒤 상체(머리·어깨) 겹침이 최대가 되도록 ±70px 안에서 다듬었다. 칸 경계 1px은 비워 4프레임을 정확히 자를 때 옆 칸이 섞이지 않게 했다.
- **에셋**: `public/assets/pilot-25d/robes/mage_{성별}_robe_{1..9}_{idle,walk,attack}_v1.png` 54장 + `robes/headless/` 같은 이름 54장 = **108장 9.2MB**(256색 팔레트 PNG + 투명 인덱스, 서기 362×362, 걷기·공격 1448×362, 장당 28~156KB). 부팅 프리로드에는 넣지 않았다.
- **렌더**: `render/robes.ts`(신규)가 `mageRobeIndexFor(save)`(마법사+갑옷 기본형 0~9, 아니면 -1)·`robeSheetPath`/`robeHeadlessSheetPath`(1~9번만)·`robeFrameIndex`·`robeSheetKey`를 제공한다. `drawHero`는 ① 지팡이·투구 파츠를 먼저 고른 뒤 ② 착용 로브 티어가 있으면 로브 시트로 갈아 끼우고(투구 파츠가 준비됐으면 머리 없는 판) ③ 나머지 전사 오버레이는 그대로 건너뛴다. 티어가 바뀔 때만 `prefetchRobe`로 6장을 받고 최근 3티어만 유지한다(`robeTierCacheLimit=3`). 로딩 전에는 기준 시트로 한 프레임 더 그린다.
- **장비창(내 정보)**: `equipmentFallbackPortrait`가 마법사면 착용 인덱스의 로브 서기 시트(투구를 쓰면 머리 없는 판)를, 0번·미착용이면 기존 마법사 본체/`nostaff` 시트를 쓴다. 캐시 키는 `mage:{성별}:r{인덱스}:{지팡이}:{투구}`.
- **계약**: `store.ts`·`server/**`·`world.ts`·`baseItems` 순서·아이템 능력치/드랍 무변경. 전사·궁수 경로, 지팡이·투구 파츠, `mage_nostaff`·`mage_headless` 시트는 손대지 않았다.
- **검증**: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`(로프 108장 규격), `npm run build`, `git diff --check`, 전체 `node --test tests/*.test.mjs` — 결과는 배포 기록에 함께 적는다. 신규 `tests/mage-robe-render.test.mjs` 11건(이름→인덱스·경로 규칙·프레임 접힘·108장 규격·칸 경계·필드 로딩 전 폴백/후 교체·4프레임 분할·0번/미착용/전사 비적용·장비창 경로·키·프리로드 제외).
- **배포**: [PR #158](https://github.com/songduckjin/DJRPG/pull/158) 스쿼시 병합 `f2ae099377ac`. 운영 `https://djrpg.pages.dev/version.json`이 `f2ae099377ac`(`builtAt 2026-11-20T06:37:23Z`)로 갱신됐고, **로브 시트 108장(전신 54 + 머리 없음 54) 전부 HTTP 200**, 표본 2장은 원격 sha256 = 로컬과 일치, 배포 번들 `assets/index-BERYNNWv.js`에 `pilot-25d/robes`·`robes/headless`·`mage_*_robe_*` 템플릿과 `robe:` 캐시 키가 들어간 것을 확인했다. **모바일 실기 화면은 미확인**(게스트 계정을 만들지 않았다).
- **검수 이미지**: `downloads/djrpg_mage_robes_ingame_v1.png`(남녀 10티어 실게임 배율), `downloads/djrpg_mage_robes_preview_v1.png`(장비창 셀 크기), `downloads/djrpg_mage_robes_motion_v1.png`(남녀 1·5·9번 걷기·공격 4프레임), `downloads/djrpg_mage_robe_helm_v1.png`(로브+지팡이+마법사 모자 합성).

## 2026-11-20 — 마법사 지팡이 10종 외형 적용: 남녀 서기·걷기 4프레임·공격 4프레임 (작업 201)
## 2026-11-20 — 궁수 남녀 갑옷 10종 외형: 서기·걷기·사격 + 활·투구 동시 착용 호환 (작업 205)

- **요청**: `songduckjin/DJRPG`에 궁수 전용 남녀 갑옷 10종(가죽 조끼 ~ 패왕의 전갑) 외형을 붙이고 PR 머지·`djrpg.pages.dev` 운영 배포까지 완료. 승인 시안(`downloads/archer_armor_preview/{male,female}_armor_{0..9}.png`)이 이미 있었다.
- **에셋**: 0번(가죽 조끼)은 궁수 스타터 시트(작업 159)가 이미 그 차림이라 새 파일을 두지 않고, 1~9번만 `public/assets/pilot-25d/archer_armors/` 아래에 **네 가지 판 216장(12MB)**으로 만들었다 — ① 전신 ② 기본 활 지운 판(`nobow/`, 활 10종과 동시 착용) ③ 머리 지운 판(`headless/`, 궁수 투구 10종과 동시 착용) ④ 둘 다(`nobow/headless/`). 규격은 전사 갑옷(작업 155)과 같은 362px 셀(서기 362×362, 걷기·사격 1448×362, 256색 팔레트 + 투명 인덱스 0, 장당 ≤128KB).
- **제작**: 걷기·사격 36장은 궁수 스타터 시트에 `images --edit`으로 **갑옷만** 바꿔 만들고(얼굴·머리·화살통·활·4포즈·순수 검정 배경 유지), 서기 18장은 승인 시안(1254²)을 쓴다. 활 지운 판은 그 갑옷 시트에 "활만 지우고 가려진 갑옷·다리를 채워라"를 `images --edit`으로 맡겨 다시 그린 뒤, **같은 티어 갑옷 시트**에 허리 아래 실루엣 IoU로 배율을, 상체 겹침으로 위치를 맞췄다(`scripts/build-archer-armor-nobow.py`, 발끝 오차 ±5px). 머리 지운 판은 투구 빌더의 `HEAD_POLYGON` 을 그대로 써(파츠와 구멍이 같은 도형) 프레임별로 같은 티어 서기 얼굴을 템플릿으로 찾아 다각형을 옮겨 지운다(`scripts/build-archer-armor-headless.py`).
- **정합**: 전체 실루엣 IoU만으로 배율을 잡으면 망토·날개 견갑(8·9번)에서 몸이 8~20% 작아졌다(티어 9 발끝이 60px 떠오름). 그래서 배율은 **성별·동작 묶음마다 하나**(남 서기 .2777·걷기 .6723·사격 .6816, 여 .2604·.6689·.6651)로 고정하고, 이동은 프레임마다 상체 겹침 → 전체 실루엣 순으로 다듬었다. 결과는 스타터 시트 대비 오차 서기 ≤5px·걷기 ≤8px·사격 ≤15px이고 회귀 테스트가 지킨다.
- **렌더**: `render/archerArmors.ts`(신규)가 경로·인덱스·프레임·판 규칙을 소유하고, `drawHero`는 궁수 갑옷 1~9번이면 그 시트를 쓰되 활 인덱스 ≥ 1 → `nobow`, 궁수 투구 파츠가 **로딩된 뒤** → `headless` 를 함께 고른다(파츠가 없으면 머리 있는 판으로 그려 머리만 빈 채로 보이지 않게). `render.ts`는 티어·판별로 동적 로드하고 최근 3티어만 유지하며(전사 갑옷 캐시와 분리) 부팅 프리로드에는 넣지 않는다. 장비창 초상화도 같은 조합을 쓰고 키에 갑옷 티어·활·투구를 넣는다.
- **불변**: `store.ts`·`server/**`·`world.ts`·`baseItems` 순서·전사/마법사 외형·코스튬 레이어 무변경. 능력치·드랍·전투 계산 그대로.
- **검증**: `npx tsc --noEmit` 통과, `npm test` 605건 중 603 통과(실패 2건은 작업 149 이후 계속 실패하는 `costume-field-render`, `origin/main` 분리 워크트리에서 동일 재현), 신규 `tests/archer-armor-render.test.mjs` 13건, `node scripts/verify-item-art.mjs`(216장), `npm run build`, `git diff --check` 통과.
- **검수 이미지**: `downloads/djrpg_archer_armor_10_male_v1.png`·`..._female_v1.png`(10티어 × 서기/걷기0·2/사격0·2 접촉 시트), `downloads/djrpg_archer_armor_ingame_v1.png`(필드 합성 — 게임 배율 9.35% + 2.4배 인셋, `scripts/preview-archer-armor.py`). 브라우저 실기 화면은 미확인(로컬 루프백 차단).
- **배포**: [PR #152](https://github.com/songduckjin/DJRPG/pull/152) 스쿼시 병합 `36224b8dc5e8`, 운영 `version.json` `36224b8dc5e8`(`builtAt 2026-11-20T05:57:01Z`). 네 가지 판 표본 4장 **HTTP 200 `image/png`**(원격 sha256 = 로컬 2장 확인)·배포 번들 `index-CgKqItQ0.js`에 `archer_armors`·`archer_armors/nobow` 경로 포함. PR 체크는 `Cloudflare Pages` pass, `Workers Builds`는 main에서도 실패하는 상시 체크. 병합 전 마법사 지팡이(작업 202)·마법사 투구(작업 204) PR이 먼저 들어와 `equipmentPortrait.ts` 키·포트레이트 분기에서 충돌했고, 궁수 갑옷 티어를 키에 넣으면서 마법사 staff·mageHelm 분기를 그대로 유지하는 형태로 정리했다.


## 2026-11-20 — 마법사 전용 모자·투구 10종 외형 적용 + 남성 서기 시트 정수리 잘림 수정 (작업 204)

- **요청**: `songduckjin/DJRPG`에 확정된 마법사 남·여 모자·투구 10종(v2)을 서기·걷기·공격 전체에 적용하고 운영(`djrpg.pages.dev`)까지 배포.
- **선행 버그 수정(중요)**: 배포본 `pilot-25d/mage_male_idle_v1.png`는 **정수리가 셀 위로 잘려 머리가 없는 그림**이었고 본체가 의도(337px)보다 17% 크게 그려져 걷기(300px)·공격(268px)과 크기가 어긋났다. 원인은 `scripts/build-mage-sheets.py`의 `body_height()` — 발끝 무게중심 ±34px 띠로 정수리를 찾는데, 마법사 남성은 발끝이 머리 중심에서 벗어나 어깨를 정수리로 오인했다(943px). 승인 원본에서 직접 잰 정수리~발끝(`IDLE_BODY_PX`: 남 1129px)으로 서기 시트를 다시 구웠고(본체 337px·발끝 y=353), `/assets/*` 불변 캐시를 피해 `mage_{male,female}_idle_v1.png` URL에 `?v=2`를 붙였다(`render.ts`·`ui/equipmentPortrait.ts`·`ui/modals/charactersModal.ts`). 여성 서기는 이미 정상이라 기존 승인 배율(1053px)을 유지했다.
- **연동 수정**: 서기 본체가 0.83525배 작아진 만큼 ① `mage_nostaff/mage_male_idle_v1.png`를 같은 규칙으로 다시 구웠고(지팡이 지우는 자세 좌표를 새 셀로 이동, `?v=2`), ② 지팡이 파츠 PNG는 예전 셀에서 떴으므로 `staffs.ts`에 자세별 파츠 배율(`staffPlacement().scale`, 남 서기 0.83525)을 더해 손에서 떨어지지 않게 했다. 걷기·공격 자세와 지팡이 파츠 10장은 그대로다.
- **파츠 20장**: 승인 시안(`downloads/mage_helm_v2/{male,female}_helm_{0..9}.png`, 1254²)을 서기 셀 좌표계로 옮겨 **모자·투구 + 얼굴·머리카락·목덜미**를 뜬 PNG. 고깔모·후광·날개·뿔이 셀 위로 솟아 파츠는 **362×406(위 44행 여유)**이고 장당 9~19KB·합계 328KB.
- **머리 없는 본체 12장**: 게임 서기 셀의 실루엣에서 지우는 구멍을 자동으로 떠서(상자 안 실루엣 ∩ 지팡이 통로 제외, 작은 구멍 메움 → 2px 침식) `mage_headless/`(기본)·`mage_headless/nostaff/`(지팡이 지움) × 남녀 × 3동작. 걷기·공격은 서기 얼굴을 템플릿 매칭한 (배율·이동)으로 구멍을 옮긴다.
- **렌더**: `src/game/render/mageHelmets.ts`(신규)가 인덱스·경로·자세 표(`male walk 0.95~0.98 / attack 0.94~0.95`, `female walk 0.98~1.0 / attack 0.89~0.98`)·머리 없는 시트 경로를 제공하고, `drawHero`가 마법사 분기에서 파츠와 시트가 **둘 다** 준비됐을 때만 머리 없는 시트로 갈아 끼운다(지팡이를 찼으면 `nostaff` 판). 투구 파츠는 zIndex .35로 지팡이(.4)보다 뒤에 그려 지팡이가 앞을 지나간다. 장비창(`equipmentPortrait.ts`)도 같은 시트·좌표로 합성하고, 파츠가 셀 위로 솟는 만큼 초상화 위 여백을 늘려(`composeFallback` overflow) 고깔모가 잘리지 않는다.
- **계약**: `store.ts`·`server/**`·`world.ts`·`baseItems` 순서·아이템 능력치/드랍·전투 판정 무변경. 마법사는 여전히 전사 갑옷·투구·대검 파츠를 쓰지 않는다.
- **검증**: `npx tsc --noEmit` 통과, 신규 `tests/mage-helm-render.test.mjs` 11/11, `tests/mage-helm-render`·`mage`·`staff-render` 34/34, 전체 `node --test tests/*.test.mjs` **601건 중 599 통과**(실패 2건은 `origin/main`에서도 동일한 `costume-field-render` 기존 실패), `node scripts/verify-item-art.mjs`(투구 파츠 20·머리 없는 시트 12 추가), `npm run build` 통과, `git diff --check`.
- **검수 이미지**: `downloads/djrpg_mage_helms_ingame_v1.png`(남녀 10종, 게임 배율 .42), `downloads/djrpg_mage_helms_preview_v1.png`(셀 크기 1배 — 이음매·머리카락 비침), `downloads/djrpg_mage_helms_motion_v1.png`(남녀 대표 5종 × 걷기·공격 4프레임). 육안 확인: 후광·뿔·고깔모 잘림 없음, 머리카락 비침 없음, 셀 위 여유 행에 후광이 실제로 그려짐.
- **머지·배포**: [PR #149](https://github.com/songduckjin/DJRPG/pull/149) 스쿼시 병합 `8c26b5d57379`. Cloudflare Pages 성공, 운영 `version.json` `8c26b5d57379`(`builtAt 2026-11-20T05:44:58Z`)·새 에셋 32장 전부 HTTP 200(원격 sha256=로컬)·바뀐 서기 시트 2장 `?v=2` 200(sha256=로컬)·배포 번들(`index-Cgp7Sog1.js`)에서 `mage_helms`/`mage_headless` 경로·서기 좌표 `y:-44`·지팡이 서기 배율 `.83525`·`STAFF_ASSET_VERSION=2` 확인. 브랜치 삭제는 API 권한 제한으로 실패(`feat/204-mage-helm-10-parts` 원격에 남음).

## 2026-11-20 — 마법사 지팡이 10종 외형 적용: 남녀 서기·걷기 4프레임·공격 4프레임 (작업 205)

- **요청**: `songduckjin/DJRPG`에서 마법사 지팡이 10종(짧은 완드 1~5 + 긴 그랜드 스태프 6~10) 외형을 남녀 마법사의 서기·걷기·공격 전체에 적용하고 운영(`djrpg.pages.dev`)까지 배포. 1~5번 짧은 지팡이를 들었을 때 뒤로 기본 긴 지팡이가 절대 삐져나오면 안 된다.
- **시트 두 벌**: 마법사 기본 시트에는 기본 지팡이(긴 고목 지팡이)가 그려져 있어 ① 기본 지팡이를 지운 본체 시트(`public/assets/pilot-25d/mage_nostaff/mage_{male,female}_{idle,walk,attack}_v1.png` 6장, 324KB) ② 티어별 지팡이 파츠(`staffs/staff_{0..9}_v1.png` 10장, 60KB)로 나눴다. 두 시트 모두 기준 시트와 같은 362px 셀 좌표계다. 0번(견습생의 지팡이)도 파츠를 쓰므로 모든 티어가 "nostaff 시트 + 파츠" 한 규칙을 따른다.
- **파츠 뜨기**(`scripts/build-staff-parts.py`): 승인 시안 `tools/staff-src/male_staff_{0..9}.png`(1254²)는 같은 캐릭터·같은 자세에서 지팡이만 바꾼 그림이다. 시안 전체 상자 대신 **몸통 기준**(발끝 열의 몸통 중심 x·발끝 y·머리끝~발끝 높이)으로 10장에 같은 정합 하나를 잡는다(얼굴 NCC는 지팡이 장식이 머리 위로 솟으면 배율이 흔들렸다). 그 위에서 지팡이 통로(머리 → 손 → 자루 끝) 안·본체 실루엣 밖 영역을 지팡이로 떠고, 주먹 자리에서 끊긴 위·아래 덩어리를 **둘 다** 살린 뒤 256색 팔레트 PNG로 굽는다.
- **기본 지팡이 지우기**: 프레임마다 (머리 점·자루 끝·그립 점)을 표로 두고 자루 띠 + 장식 원을 지운다. 지운 자리의 RGB는 투명 영역의 검정을 끌어오지 않도록 **가장 가까운 불투명 색으로 먼저 채운 뒤** 인페인트하고, 띠가 몸통 속을 지나면(가장자리에서 6px보다 먼 픽셀) 알파를 살려 옷 색으로만 메운다 — 배경 쪽 지팡이는 알파가 0으로 사라지고 옷 위 구간만 색이 메워진다.
- **자세 표**(`src/game/render/staffs.ts` `STAFF_POSES`): 남녀 × 9자세(서기1·걷기4·공격4). 회전축이 그립 점(`STAFF_GRIP` (92,114))이라 걷기·공격 어느 프레임에서도 지팡이가 손에서 떨어지거나 길이가 줄지 않는다(강체).
- **연결**: `render/entities.ts` `syncStaffPart` + `drawHero` 마법사 분기(지팡이를 차면 `mage_nostaff/` 시트로 갈아 끼우고 파츠를 얹는다), `render.ts`(`staffPart`·`prefetchStaff`·`staffBodyFrame`, 파츠 1장+시트 3장만 받고 최근 3티어 유지, 부팅 프리로드 제외), `ui/equipmentPortrait.ts`(`equipmentPortraitStaff` — 장비창도 같은 파츠·같은 좌표로 합성, 캐시 키에 파츠 경로 포함).
- **캐시**: 파츠·`mage_nostaff` 시트는 이번에 새로 만든 파일이라 `/assets/*` immutable 캐시에 걸리지 않는다(캐시 버스터 불필요). 기존 마법사 시트 6장은 손대지 않았다.
- **검증**: `npx tsc --noEmit`, `node --test tests/staff-render.test.mjs` **10/10**, `tests/mage.test.mjs` 13/13, 전체 `tests/*.test.mjs` 583건 중 578 통과(실패는 `costume-field-render` 2·`market`/`functions-adapter` schema 계열로 `origin/main`에서도 같은 기존 실패), `node scripts/verify-item-art.mjs`(지팡이 파츠 10장·nostaff 시트 6장 검사 추가), `npm run build`. 검수 이미지 `downloads/djrpg_staff_ingame_v1.png`(남녀 × 10티어, 게임 배율)·`downloads/djrpg_staff_walk_attack_v1.png`(남녀 짧은 1·긴 6·최상위 9의 걷기·공격 4프레임)을 열어 손 위치·잔상을 육안 확인했다.
- **머지·배포**: [PR #141](https://github.com/songduckjin/DJRPG/pull/141) 스쿼시 병합 `4798c5e6b713`. Cloudflare Pages 운영 `version.json` `4798c5e6b713`(`builtAt 2026-11-20T04:50:04Z`), 루트 200, **새 에셋 16장(`mage_nostaff` 6·`staffs` 10) 전부 HTTP 200**(원격 sha256=로컬), 배포 번들 `index-Crw4pvhf.js`에 `mage_nostaff`·`staffs/`·`staffPart`·`nostaff:` 키 확인. `Workers Builds: djrpg`는 종전과 같이 실패(Cloudflare Pages 체크는 통과).
- **번호 정정·충돌 해소**: 같은 번호 199를 다른 세션이 'Windows 임시 DB 잠금·market 스키마 모의 객체 정리'로 먼저 썼고, main에 궁수 전용 투구(작업 200)가 병합되어 충돌이 났다. 작업을 **201**로 다시 등록(PR #136 닫고 #141 재생성)하고, `render.ts`·`render/entities.ts`·`ui/equipmentPortrait.ts`(composeFallback 파라미터 `archerHelm`·`staff` 병존)·`scripts/verify-item-art.mjs`(활·투구·지팡이 블록 병존)를 손으로 합쳤다. 병합 후 `tsc`, `staff-render` 10/10·`mage` 13/13, 전체 583건 중 581 통과(실패 2건은 `costume-field-render` 종전 실패), `verify-item-art`, `npm run build` 재확인.

## 2026-11-20 — 궁수 활 10종 외형 적용: 남녀 서기·걷기 4프레임·사격 4프레임 (작업 160)

- **요청**: `songduckjin/DJRPG`에서 궁수 활 10종(`사냥꾼의 활` ~ `패왕의 신궁`) 외형을 남녀 궁수의 서기·걷기·사격 모든 프레임에 적용하고 PR 머지·`djrpg.pages.dev` 배포까지 완료. 전사 대검 10종(작업 156)과 같은 아키텍처를 쓴다.
- **시트 두 벌**: 스타터 가죽 궁수 시트에는 0번 기본 활이 이미 그려져 있어 ① 기본 활대만 지운 본체 시트(`public/assets/pilot-25d/nobow/archer_{male,female}_{idle,walk,attack}_v1.png` 6장, 252KB) ② 티어별 활 파츠(`bows/bow_{1..9}_v1.png` 9장, 76KB)로 나눴다. 두 시트 모두 기준 시트와 같은 362px 셀 좌표계라 배율·앵커를 다시 재지 않는다.
- **지우기(빌더 `scripts/build-bow-parts.py`)**: 4배 확대해 읽은 기본 활대 중심선(반폭 표 포함)을 자세별로 강체 회전·이동해 덮는 띠만 지우고, 지운 자리 색은 띠 법선 양쪽의 **본체 픽셀(피부 제외)**을 선형으로 섞어 채운 뒤 주변 고주파(가죽 결)를 25px 아래에서 옮겨 얹는다. 알파는 지운 자리를 모폴로지 close 로 닫아 본체 안쪽이면 살리고 허공으로 나온 부분이면 투명하게 둔다. 손가락(그립)은 보호 원으로 남기고, 사격 프레임에서 휘어 띠를 벗어난 활대 조각은 "본체 테두리에서 4px 이상 들어간 곳을 보호한 채 두께 2.4px 이상인 덩어리만" 지워 정리한다. **시위(활줄)는 지우지 않는다** — 사격 프레임에서 얼굴 쪽으로 당겨진 시위가 그대로 살아 있다.
- **파츠**: 승인 시안(`downloads/bow_preview/male_bow_{1..9}.png`)은 0번 시안(스타터 원본과 픽셀 동일)과 같은 캐릭터·같은 자세에서 활만 바꾼 그림이다. 얼굴 NCC(배율 0.278, NCC 0.863)로 셀 좌표에 정합한 뒤 0번과 색이 달라진 영역 + 본체 밖 영역을 활 통로 안에서 합쳐 활 실루엣을 뜨고, 손(피부 마스크)·검은 배경·활줄(9px 열림 연산)을 뺐다. 그립 자리는 손이 본체에 그려져 있으므로 파츠에서도 비워 손이 활을 쥔 모양이 한 번만 그려진다.
- **자세 표**: 파츠 그립 점(232,193)을 회전축으로 남녀 × 9자세(서기 1·걷기 4·사격 4)의 그립 좌표·회전각을 `BOW_POSES`에 두었다(사격은 −50° 안팎, 서기 대비 크게 돈다). 걷기·사격의 8프레임 재생은 4프레임으로 접는다.
- **렌더**: `src/game/render/bows.ts`(신규) → `render.ts`가 `bowPart`/`prefetchBow`/`bowBodyFrame`을, `entities.ts`의 `drawHero`가 궁수일 때 nobow 시트로 갈아 끼우고 `syncBowPart`로 파츠를 얹는다(피격 틴트 공유, 전사 투구·대검·착용 무기 오버레이는 계속 숨김). 부팅 프리로드에는 넣지 않고 장착 티어의 파츠 1장 + nobow 3장만 동적으로 받아 최근 3티어를 유지하며, 로딩 전에는 기본 시트로 폴백한다. 장비창 초상화도 같은 nobow 시트 + 활 파츠를 캔버스에 합성한다.
- **티어 매칭 버그 수정**: 활 이름이 서로를 포함해(`각궁` ⊂ `룬 각궁`, `장궁` ⊂ `혈염 장궁`) 접미사 첫 일치만 쓰면 `룬 각궁`이 1번 각궁으로 읽혔다(아이콘도 1번을 썼다). `items.ts` `bowIndex`를 **가장 긴 기본형이 이기는** 방식으로 고치고 `baseItemIndex`도 그 결과를 쓰게 했다.
- **검증**: `npx tsc --noEmit` 통과, 전체 `node --test tests/*.test.mjs` 550건 중 547 통과 — 실패 3건은 `costume-field-render` 2건(작업 149 이후 계속 실패하던 기존 실패, `origin/main` `d6a701e` 워크트리에서 동일 재현)과 `market.test.mjs`의 DB 스키마 1건(같은 워크트리에서 동일 재현). 신규 `tests/bow-render.test.mjs` 9건(이름→티어 매핑·파츠 규격과 그립 주변 활대·nobow 6장 규격과 실제 삭제/손 보존·자세 표·프리로드 제외·필드 합성·걷기/사격 회전·0번 폴백·초상화), `tests/archer.test.mjs` 15건(초상화 기대값을 활 파츠 기준으로 갱신). `node scripts/verify-item-art.mjs`(nobow 6장·활 파츠 9장 검사 추가)·`npm run build`·`git diff --check` 통과.
- **검수 이미지**: `downloads/djrpg_bow_10_idle_v1.png`(남녀 10종 서기), `downloads/djrpg_bow_walk_attack_v1.png`(걷기·사격 4프레임 × 2·5·8번), `downloads/djrpg_bow_ingame_scale_v1.png`(게임 배율), `downloads/bow_nobow_check.png`(기본 활 지운 시트), 보조 `downloads/bow_parts_only.png`. 생성은 `python3 scripts/build-bow-parts.py`(=`--preview` 로 에셋 없이 이미지 만 확인).
- **브라우저 실기 확인 미실시**: 로컬 빌드를 띄우는 루프백 주소가 이 환경 브라우저에서 차단된다(작업 158·159와 같은 조건). 게스트 검수용으로 `scripts/preview-server.mjs`에 `?bow=1..9` 를 추가해 두었다(계정·DB 무접촉).
- **배포**: [PR #130](https://github.com/songduckjin/DJRPG/pull/130) 스쿼시 병합 `5586ffba0fbe`, 운영 `version.json` `5586ffba0fbe`(`builtAt 2026-11-20T03:35:35Z`). 새 에셋 **15장(활 파츠 9 + nobow 6) 전부 HTTP 200 `image/png`**, 원격 sha256 = 로컬(활 1·5·9번, nobow 남녀 서기·걷기·사격 확인). 배포 번들 `index-tyFHcoTm.js`(1,263,659B)에 `pilot-25d/bows`·`pilot-25d/nobow` 경로와 `nobow:${gender}:${animation}:${poseFrame}` 키가 포함된 것을 확인. PR 체크는 `Cloudflare Pages` pass, `Workers Builds: djrpg`는 `main`에서도 같이 실패하는 상시 체크(기존 PR과 동일). 병합 전 마법사 직업 PR(#128, 작업 198)이 먼저 들어와 `render/entities.ts`·`ui/equipmentPortrait.ts`에서 `usesBaseSheetOnly`(전사 외 직업 공통 분기)와 충돌했고, 그 공통 분기 위에 궁수 활 파츠를 얹는 형태로 정리해 리베이스했다(마법사는 파츠 없이 기본 시트만 — 기존 동작 유지).

## 2026-11-20 — 궁수 직업 추가: 기본 시트·활 10종·원거리 전투·스킬 8+3 (작업 158)

- **요청**: `songduckjin/DJRPG`에 두 번째 직업 **궁수(`archer`)**를 전사 기준으로 자연스럽게 추가하고 PR 머지·`djrpg.pages.dev` 운영 배포까지 완료. 승인된 궁수 원본 그림(서기 1장·걷기 4프레임·활 사격 4프레임, 남녀)이 이미 워크스페이스에 있었다.
- **세이브 호환**: `Save.job?: 'warrior' | 'archer'`를 추가하고 `freshSave(gender, job)`·`parseSave`가 항상 값을 채운다(없는 예전 세이브·DB 레코드는 `'warrior'`). 서버 `initialSave`·`register`·`createCharacter`·`characters`·`reset`이 `job`을 검증·보존하고, 클라이언트는 `jobOrDefault()` 하나로 판정한다. 전사 세이브는 장비·진행·퀵슬롯이 그대로 유지된다(테스트 `archer.test.mjs`).
- **생성 UI**: 로그인 신규 가입과 `새 캐릭터` 모달 모두 **위 줄 = 직업(전사/궁수), 아래 줄 = 성별**로 배치하고, 성별 버튼 이름은 고른 직업을 따라간다(`남성 전사 ↔ 남성 궁수`). 계정 창의 직업 표기도 세이브 값을 읽는다.
- **에셋**: `scripts/build-archer-sheets.py`가 승인 원본(`downloads/archer_preview/*.png`)에서 전사 기준 시트와 **같은 셀 좌표계**(서기 362×362 몸높이 337·발끝 353, 걷기·공격 1448×362 = 362px 셀 4개, 몸높이 300/270)로 6장을 만든다. 순수 검정 배경은 휘도 알파(5~26)로 키잉하고, 망토가 옆 인물과 닿은 스트립(남자 걷기·남자 공격)은 가장 좁은 세로 틈에서 잘라 프레임을 나눈다(연결성분 중심으로 프레임 배정). 활 10종 아이콘은 `scripts/build-bow-art.py`가 `item-art/bow_0|5.png`(870×290, 174×290 칸 5개)로, 스킬 아이콘은 `scripts/build-archer-icons.py`가 `icons/archer-skills.png`(708×354, 4×2)와 `icons/archer-passive-skills.png`(384×128, 3×1)로 만든다 — 전사 시트와 같은 `background-size` 규칙을 그대로 쓴다.
- **필드 렌더**: `render.ts`가 `archer{Male,Female}`·걷기/공격 시트를 부팅 때 함께 받고, `drawHero`는 직업이 `archer`면 궁수 시트만 그리며 **전사용 갑옷 시트·투구 파츠·대검 파츠·착용 무기(`wearable/weapons.png`) 오버레이를 전부 생략**한다(`syncHelmet`/`syncWeaponPart`/`syncWeapon` 호출 자체를 건너뛰고, 남아 있던 스프라이트는 숨긴다). `heroScale`에 궁수 6개 항목, `walkAnchors`에 궁수 걷기 앵커를 추가했다. 장비창 초상화(`equipmentPortrait`)도 궁수면 `archer_{gender}_idle_v1.png` 한 장만 합성하고 투구·검 파츠를 계획에서 뺀다(능력치는 정상 반영).
- **원거리 전투**: `World`에 `archerAttackRange=250`·`archerStopRange=118`을 두고, 궁수는 정지 거리 밖에서만 추격하고 사거리 안이면 서서 쏜다. 평타는 `Effect.kind='shot'` 화살을 만들어 **도착 시점에만** 판정하며(`damage` 반경 42, 최대 1마리), 살아 있는 목표는 비행 중에도 도착지가 갱신돼 빗나가지 않는다. `drawArrow`는 월드 좌표 진행도를 아이소메트릭 화면 변위로 보간해 화살대·촉·잔상 궤적을 그리고, `rain`(애로우 레인)·`hawk`(호크아이) 이펙트를 추가했다.
- **활 10종**: `bowBases`(`사냥꾼의 활` ~ `패왕의 신궁`)를 전사 `baseItems.weapon`(대검 10종)과 분리해 두고 `rollItem(floor, guaranteed, boss, job)`·`rollSkillBook(floor, job)`·`equipmentImage`가 직업을 따른다. 활은 전용 아이콘 시트(`item-art/bow_0|5.png`)를 쓰고, `wearableEquipmentImage`는 `undefined`라 대검 착용 이미지가 붙지 않는다. 1번 튜토리얼 드랍 이름도 `낡은 사냥꾼의 활`로 갈린다. 대검 목록·코덱스 75종·드랍 확률표는 그대로다.
- **스킬 8+3**: `skills.ts`에 `Job`·`archerSkillOrder`(더블 샷·멀티 샷·관통 사격·빙결 화살·호크아이·저격 일격·폭풍 연사·애로우 레인)·`archerPassiveOrder`(궁술 숙련·신속의 발걸음·매의 눈)를 추가하고 `skillOrderFor(job)`·`passiveOrderFor(job)`로 기존 레벨 해금·스킬북·쿨타임·퀵슬롯 구조를 그대로 쓴다. `cooldowns`는 스킬 표에서 자동 생성되므로 궁수 스킬도 같은 쿨타임 표에 들어가고, `totalStats`는 직업별 패시브(공격 +15% / 이동·공속 / 치명)를 같은 식으로 적용한다. 스킬 모달·HUD·스킬북 강화 표시·퀵슬롯 목록은 모두 직업별 8+3만 보여 준다.
- **버그 수정(배포 후)**: `parseSave`가 퀵슬롯을 정규화할 때 직업을 넘기지 않아 **궁수 세이브의 퀵슬롯이 로그인·불러오기마다 비워지던 문제**를 발견해 고쳤다(`normalizeQuickSlots(raw, learned, job)`). 궁수 세이브 저장·불러오기 회귀 테스트를 추가했다(PR #122).
- **검증**: `npx tsc --noEmit` 통과, `npm test` 487건 중 485 통과 — 실패 2건은 `costume-field-render`(작업 149 이후 계속 실패하던 기존 2건, 분리 worktree의 `b009d42`·`eef4e9d`에서 동일 재현). 신규 `tests/archer.test.mjs` 12건(직업 기본값·전사 세이브 보존·궁수 스킬/패시브·스킬북·활 드랍·활 아이콘·원거리 판정·정지 거리·스킬 8종 이펙트·외형 분기·시트 규격·강화 표시). `node scripts/verify-item-art.mjs` 통과(궁수 시트 6장·활 아이콘 2장·아이콘 시트 2장 추가 확인), `npm run build` 통과, `git diff --check` 통과.
- **검수 이미지**: `downloads/djrpg_archer_ingame_v1.png` — 실제 배포 에셋(황야 배경·궁수 시트·스켈레톤)을 게임과 같은 배율(본체 = 화면 높이 9.35%)·아이소메트릭 투영으로 합성한 3패널 검수본(서기/걷기, 화살 비행, 애로우 레인 착탄)과 2.0배 확대 인셋. 생성 스크립트 `scripts/preview-archer-field.py`. **브라우저 실기 확인은 미실시**(로컬 빌드를 띄우는 루프백 주소가 이 환경의 브라우저에서 차단됨).
- **배포**: [PR #120](https://github.com/songduckjin/DJRPG/pull/120) 스쿼시 병합 `7dd9d67643e2`, 운영 `version.json` `7dd9d67643e2`(`builtAt 2026-11-20T01:30:06Z`). 새 에셋 10장(궁수 시트 6 + 활 아이콘 2 + 스킬 아이콘 2) 전부 **HTTP 200 `image/png`**, 원격 sha256 = 로컬(궁수 남자 서기·활 2번 시트 확인). 배포 번들 `index-B7aBXvAW.js`(1,228,551B)에 `archer_male_idle_v1`·`archer_female_attack_v1`·`item-art/bow_`·`archer-skills`·`archer-passive-skills`·`"archer"` 문자열과 `doubleShot`·`arrowRain` 스킬이 포함된 것을 확인. PR 체크는 `Cloudflare Pages` pass, `Workers Builds: djrpg`는 이전 Workers 설정 잔재로 상시 실패(기존 PR과 동일). 브랜치 삭제는 권한(403)으로 실패해 원격에 `feat/158-archer-job`이 남아 있다.

## 2026-11-20 — 대검 10종 외형 전체 적용: 남녀 서기·걷기·공격 파츠 (작업 156)

- **요청**: `baseItems.weapon` 10종(두손검 ~ 패왕의 성검) 외형을 남녀 전사의 **서기·걷기 4프레임·공격 4프레임** 전체에 적용하고 PR 병합·운영 배포까지 완료. 갑옷 10종(작업 155)·투구 10종과 조합해도 조합마다 검을 다시 그리지 않는다.
- **구조 결정**: 본체 시트에는 0번 기본 두손검이 이미 그려져 있다. 티어별 검을 그냥 겹치면 뒤에 기본 검 칼날·가드가 삐져나온다(특히 2번 바스타드·4번 쯔바이핸드처럼 얇은 검). 그래서 ① **기본 검만 지운 본체 시트**(`noweapon/`)를 만들고 ② 검은 **파츠 1장 + 자세 표**로 얹는다. 갑옷 × 무기 조합이 늘어나도 시트는 (갑옷 10 × 동작 3 × 전신/머리없음 2 × 검없음 2)로 끝난다.
- **기본 검 지우기**: 지우는 모양은 기준 시트의 검 덩어리(강철색 성분 + 자동차 마스크)에서 뜬 **깨끗한 칼날 실루엣**이고, 갑옷 시트에는 그 모양을 같은 자세 시트의 강철 성분에 평행이동(±9px)으로 맞춰 옮긴다(갑옷마다 다르게 그려진 검을 자기 분할로 잡으면 다리·어깨 금속까지 먹는다). 검이 가리고 있던 다리·허리는 지운 자리에서 본체 실루엣을 닫아(모폴로지 close 45px) 되살리고 색은 `cv2.inpaint`로 이어 붙인다 — 그냥 지우면 다리 모양으로 구멍이 난다. 남은 잔여물은 60px 미만 성분 제거로 정리.
- **파츠 뜨기**: 승인 시안(`tools/weapon-src/male_weapon_{1..9}.png`, 1254², 합계 11MB — 재생성 없이 그대로 보관)을 **얼굴 NCC**로 기준 시트에 정합(배율 0.288 고정, 이동 격자 탐색)한 뒤, ① 본체 실루엣 밖으로 나온 영역 ② 기준 시트와 색이 크게 달라진 영역(블러 5px, 문턱 0.20)을 검 통로(가드→칼끝 + 손잡이 118px) 안에서만 합쳐 검 실루엣을 뜬다. 손은 두 그림에서 거의 같아 색차가 작으므로 파츠에 섞이지 않고, 본체 시트의 두 손이 새 검을 쥔 모습으로 남는다. 손잡이 끝(폼멜)은 자세마다 손 위치가 달라 떠 보여 가드에서 40px까지만 남기고, 시안에 같이 그려진 돌·파편은 본체 덩어리 3px 밖 조각을 지워 제거했다.
- **에셋**: 파츠 9장(`public/assets/pilot-25d/weapons/weapon_{1..9}_v1.png`, 362×362, 합계 **80KB**) — 256색 팔레트 PNG. 기본 검 없는 시트 132장(`noweapon/` 본체 12 + 갑옷 120, 합계 **5.9MB**, 장당 ≤190KB, 서기 362×362·걷기/공격 1448×362). 빌더는 `scripts/build-weapon-parts.py`(`--preview`는 검수 이미지만).
- **자세 표**: 기준 시트에서 잰 남성 9자세(가드 점·칼끝 점)를 회전각으로 바꿔 `WEAPON_POSES`에 넣었다. idle·걷기는 검 마스크 강체 정합, 공격 4프레임은 시트를 3배 확대해 가드·칼끝 좌표를 읽어 확정(자동 정합은 칼날 대칭 때문에 180° 뒤집힘 오답이 나온다). 여성은 같은 자세의 여성 시트에서 검 실루엣 주축을 재고 방향은 남성 자세와 가까운 쪽을 골랐다. 파츠 PNG 는 idle 자세 그대로이고, 앵커는 **손잡이(가드) 점** `WEAPON_GUARD = (197.2, 220.7)`, 자세마다 가드 좌표 + 회전각만 준다 — 강체라 스윙 중 칼 길이가 줄거나 손에서 떨어지지 않는다.
- **렌더**: `render/weapons.ts`(신규)가 경로·자세·인덱스 규칙을, `render/entities.ts` `syncWeaponPart`가 스프라이트(앵커=가드, zIndex .4, 피격 틴트 공유)를 맡는다. `drawHero`는 0번이 아닌 검을 차면 본체를 `noweapon` 시트로 갈아 끼우고 파츠를 얹으며, 파츠·시트가 아직 로딩 전이면 기존 시트로 한 프레임 더 그린다(폴백). `render.ts`는 본체 시트 묶음(갑옷 티어 × 검없음 여부)과 파츠를 **장비가 바뀔 때만** 받고 최근 3개만 유지한다(`prefetchBody`·`prefetchWeapon`·`Assets.unload`). 장비창 초상화(`ui/equipmentPortrait.ts`)도 같은 시트·같은 파츠를 idle 0프레임으로 합성하고 캐시 키에 검 파츠를 넣었다.
- **계약**: `store.ts`·`server/**`·`world.ts`·`baseItems` 순서·0번 기본 검 무변경. 기존 기준 시트·갑옷 시트·투구 파츠는 그대로 두고 `noweapon/`·`weapons/`만 추가했다. 기존 테스트의 가짜 뷰(갑옷·투구·코스튬·장비창)를 새 계약(`prefetchBody`·`weaponPart`·초상화 키에 검 파츠)으로 갱신했다.
- **테스트**: `tests/weapon-render.test.mjs` 9건 신규 — ① 10종 이름→인덱스·1~9번만 파츠·`usesSwordlessBody` ② 파츠 9장 규격(362², 불투명 1200px 초과, 손잡이 자리에 검, 200KB 이하) ③ noweapon 132장 존재·규격·기본 검 영역 픽셀이 절반 이하 ④ 자세 표 9자세·프레임 4접힘·음수 프레임 ⑤ 파츠·noweapon 부팅 프리로드 미포함 ⑥ 로딩 전 폴백·로드 후 시트 교체·파츠 위치·앵커·회전 ⑦ 걷기·공격 프레임에서 자세 표 추종 ⑧ 검을 벗으면 파츠 숨김·기준 시트 복귀 ⑨ 장비창 초상화 시트·파츠·키.
- **검증**: `npx tsc --noEmit`, 전체 테스트 **473건 중 471 통과**(실패 2건은 `tests/costume-field-render.test.mjs`의 종전부터 같은 실패), `node scripts/verify-item-art.mjs`(noweapon 132장·파츠 9장 추가 확인), `npm run build`, `git diff --check`.
- **검수 이미지**: `downloads/djrpg_weapon_10_idle_v1.png`(갑옷 9+투구 9 남 / 갑옷 4+투구 여 × 10티어 서기), `downloads/djrpg_weapon_walk_attack_v1.png`(남녀 × 걷기·공격 4프레임 × 2·5·8번), `downloads/djrpg_weapon_ingame_scale_v1.png`(0·1·2·5·8·9번 남녀 서기, 본체 150px 배율).
- **배포**: [PR #115](https://github.com/songduckjin/DJRPG/pull/115) 스쿼시 병합(`88dd1b95ea7b`). PR의 `Cloudflare Pages` 체크 통과(`Workers Builds: djrpg`는 종전부터 같은 실패). 운영 `https://djrpg.pages.dev/version.json`이 `88dd1b95ea7b`(`builtAt 2026-11-20T00:11:48Z`)로 갱신됐고, **새 에셋 141장(파츠 9 + noweapon 132) 전부 HTTP 200**(실패 0), 배포 번들 `assets/index-NYhj-_cK.js`에 `/assets/pilot-25d/weapons`·`noweapon/armors`·`weapon_${n}_v1.png` 템플릿과 `noweapon:${성별}:…` 캐시 키가 들어간 것을 확인했다. 배포 페이지는 로그인 화면까지 정상 로드(부트 프리로드 진행). **모바일 실기 화면은 미확인** — 게스트 계정을 새로 만들지 않았고, 1번 이상 검을 착용한 세이브가 필요하다.

## 2026-11-20 — 남녀 갑옷 10종 서기·걷기·공격 + headless 시트 제작·적용 (작업 155)

- **요청**: 사용자가 승인한 `baseItems.armor` 10종(가죽 조끼 ~ 패왕의 전갑) 전체에 대해 **남녀 서기·걷기(4프레임)·공격(4프레임)** 전신 시트와 **투구 호환 headless 시트**를 만들어 필드·장비창에 연결하고 PR 병합·운영 배포까지 완료.
- **이미 승인된 원본 재사용**: 서기 20장(`downloads/armor_preview/raw/{male,female}_armor_{0..9}.png`, 1254²)은 시안 작업에서 검수·승인된 그대로 썼다(재생성 없음).
- **걷기·공격 40장 생성**: 기준 시트(`warrior_{male,female}_{walk,attack}_v1.png`, 4포즈)에 `images --edit`를 적용해 **갑옷 외형만** 티어별로 바꿨다. 프롬프트에 같은 캐릭터·얼굴·긴 머리·대검·4포즈·프레이밍·순수 검정 배경 유지와 티어별 갑옷 묘사(가죽/징박힌/사슬/강철 흉갑/하프 플레이트/미스릴/흑요석/드래곤 메일/성기사 풀플레이트/패왕의 전갑)를 넣었다. 원본은 `downloads/armor_gen/raw/{성별}_{동작}_{0..9}.png`(2124×740).
- **정합(핵심)**: 원본은 1254² 또는 2124×740이라 게임 셀(362px)과 규격이 다르다. ① 배경(순수 검정)을 알파로 키잉하고 ② 4프레임 시트는 캐릭터가 없는 열에서 칸을 나눈 뒤 ③ **SIFT(얼굴·머리·대검 = 변하지 않는 부분) 유사변환**과 **실루엣 IoU 최대화(배율·이동 격자 탐색)** 두 후보를 모두 계산해, 워프 결과의 머리 꼭대기·발끝이 기준 시트와 ±4px 안에 오는 쪽을 골랐다(초과분에 페널티, `lib.fit_auto`). 결과 IoU는 걷기·공격 0.85~0.97, 서기 0.65~0.96(망토·견갑이 큰 패왕·흑요석 티어는 실루엣 차이가 커 IoU가 낮지만 몸 높이·발끝은 기준과 일치).
- **키잉**: 1차 시도는 `L≤14`를 배경으로 지워 **흑요석·패왕 망토 내부가 구멍**났다(어두운 갑주가 배경과 이어짐). 문턱을 `L≤4`(사실상 0)로 낮추고 가장자리 6px 띠에서만 밝기 램프로 알파를 만들어 해결했다.
- **headless**: 기준 시트의 `warrior − headless` 차이(머리·머리카락 픽셀)를 셀 좌표 그대로 옮겨 지운다. 다만 티어별로 **견갑·망토·금장식이 커지면** 색차(`|티어 − 기준|`)가 큰 픽셀은 지우지 않도록 보호하고, 보호 영역이 700px 미만인 가는 조각(머리카락)은 다시 지운다. 기준 headless 시트에 남아 있던 작은 구멍(제작 잔재)은 마스크에서 250px 미만 성분을 빼 제거했다.
- **용량**: 120장(60 + headless 60) 합계 **9.2MB**, 장당 최대 128KB. **256색 팔레트 PNG(색인 0 = 투명 tRNS)** 로 저장해 같은 그림의 RGBA(약 440KB)보다 1/4 수준이다.
- **렌더**: `render/armors.ts`(신규)가 `armorSheetPath(성별, 인덱스, 동작, headless)`·`armorSheetPaths`(티어당 6장)·`armorIndexFor(save)`(갑옷 없으면 -1)·`armorFrameIndex`·`armorSheetKey`를 제공한다. `drawHero`는 착용 인덱스가 0~9면 그 티어 시트를 쓰고(투구를 썼으면 headless 시트), 아직 로딩 전이면 기존 기준 시트로 폴백한다. 배율·앵커·무기 소켓·`heroBodyPx` 표는 시트 규격이 같아 그대로 쓴다.
- **로딩 전략**: 120장을 부팅 때 받지 않는다(`renderAssetPaths` 무변경). 티어가 바뀔 때 그 티어 6장만 `Assets.load`로 받고 **최근 3티어만 유지**(나머지는 `Assets.unload`)한다. 장비창 초상화도 같은 시트(서기 1장)를 쓰고 캐시 키에 갑옷 티어를 넣었다.
- **검수**: 남녀 10종 × 서기/걷기/공격 시트를 직접 열어 확인했고, 투구 10종을 실제 앵커로 합성한 조합(갑옷 10종×투구 5, 갑옷 4×투구 10, 걷기·공격 주요 티어 4프레임)에서 목 밑동·견갑 어긋남이나 머리카락 비침이 없음을 확인했다.
- **테스트**: `tests/armor-render.test.mjs` 10건 신규 — ① 갑옷 10종 이름→인덱스 매핑·`armorIndexFor` 폴백 ② 경로 규칙(성별·동작·headless·범위 밖 undefined)·티어당 6장 ③ 프레임 4접힘 ④ 120장 규격(362×362 / 1448×362, 팔레트 tRNS, 200KB 이하) ⑤ 시트가 비지 않고 배경 투명, 4프레임이 칸 경계를 넘지 않음 ⑥ 로드 후 필드가 갑옷 시트로 그리기·로딩 전 폴백·티어 변경 시 6장 프리페치 1회 ⑦ 걷기·공격 4프레임 분할(칸 폭 362, x=1086) ⑧ 투구 시 headless 시트 선택 ⑨ 장비창 경로·캐시 키 ⑩ 부팅 프리로드 미포함.
- **계약**: `store.ts`·`server/**`·`world.ts`(전투·세이브) 무변경, `baseItems` 순서·아이템 소유권 무변경, 기존 기준 시트 6장·`headless/` 6장·투구 파츠 93장 무변경. `equipped-detail`·`helmet-head-render`·`hero-weapon-render`·`costume-field-render` 테스트의 초상화 키·가짜 뷰를 새 계약(갑옷 티어 포함)으로 갱신했다.
- **검증**: `npx tsc --noEmit`, 전체 테스트 **464건 중 462 통과**(실패 2건은 `tests/costume-field-render.test.mjs`의 "drawHero가 코스튬 레이어로 그리고…"로 종전부터 같은 실패), `node scripts/verify-item-art.mjs`(갑옷 시트 120장 추가 확인), `npm run build`, `git diff --check`.
- **검수 이미지**: `downloads/armor_ingame_{male,female}_{idle,walk,attack}_v1.png`(티어별 시트), `downloads/djrpg_armor_helmet_{male,female}_idle_v1.png`(갑옷 10×투구 5), `downloads/djrpg_armor4_helmet10_{male,female}_v1.png`(갑옷 4×투구 10), `downloads/djrpg_armor_helmet_{male,female}_{walk,attack}_v1.png`.
- **배포**: [PR #113](https://github.com/songduckjin/DJRPG/pull/113) 스쿼시 병합(`b8034c1fdcc27183`). PR의 `Cloudflare Pages` 체크 통과(`Workers Builds: djrpg`는 종전부터 같은 실패). 병합 2분 뒤 운영 `https://djrpg.pages.dev/version.json`이 `b8034c1fdcc2`(`builtAt 2026-11-19T22:47:50Z`)로 갱신됐고, **갑옷 시트 120장 전부 HTTP 200**(`content-type: image/png`, 24~128KB — 예: `armors/warrior_male_armor_9_walk_v1.png` 120,159B, `armors/headless/warrior_male_armor_5_idle_v1.png` 29,335B), 배포 번들 `assets/index-m6nQCbdw.js`에 `const W0="/assets/pilot-25d/armors"` 와 `warrior_${성별}_armor_${인덱스}_${동작}_v1.png` 템플릿이 들어간 것을 확인했다. 원격 브랜치 삭제는 자격 증명 제한(403)으로 남아 있다.
- **검수 이미지(게임 배율)**: `downloads/djrpg_armor_ingame_scale_v1.png` — 700px 화면 기준 `heroBodyFraction`(0.0935)로 축소해 갑옷 0·3·6·9번 × 남녀 × 서기/걷기 2프레임/공격 3프레임을 실제 크기(본체 약 65px)로 합성한 것.

## 2026-11-20 — 남녀 투구 10종 공격 3/4 옆모습 파츠 80장 추출·적용 (작업 154)

- **요청**: 공격할 때 투구가 여전히 정면 그림을 돌린 것처럼 보인다는 판단으로, 승인된 **남전사 10종 + 여전사 10종 × 공격 4프레임** 3/4 옆모습 시안(`downloads/helm_atk/raw/{male,female}_helm_{0..9}.png`)을 게임 파츠로 떠서 필드에 적용하고, PR 병합·운영 배포까지 완료. 153은 정면 파츠를 회전·세로 축소해 흉내만 냈고, 154는 **각 프레임의 3/4 시안에서 직접 떠낸다**.
- **시안 재생성 없음**: 직전 시안 작업에서 `read_file` 검수까지 통과한 원본 20장(각 2150×730, 4포즈)을 그대로 입력으로 썼다.
- **정렬(raw → 게임 셀)**: 원본 시트의 4포즈를 빈 열 기준으로 자르고, 게임 공격 시트 `warrior_{male,female}_attack_v1.png`의 362px 셀 4개와 **SIFT + `estimateAffinePartial2D`(RANSAC)** 로 유사변환을 추정했다. 머리·투구가 다른 부분이 대응점을 흔들지 않도록 상단 28%를 마스크에서 뺐다. 결과 배율은 0.64~0.69(원본이 1.5배), 프레임마다 dx·dy 가 다르다. 검수 오버레이에서 몸통이 픽셀 단위로 겹쳤다.
- **마스크(핵심)**: 재생성본은 같은 포즈지만 **색·음영이 게임 본체와 달라**(본체 픽셀 색차 중앙값 20/255) 색차 기반 분리는 실패했다. 대신 게임이 투구용으로 지운 **머리 실루엣**(`원본 알파 ∧ ¬headless 알파`, 얇은 외곽선은 열기(5×5)로 제거)을 기준으로 삼았다 — ① 게임 본체가 투명한 곳(머리 위·옆 허공)은 파츠가 raw 전경 실루엣대로 끝나 왕관·뿔·날개가 잘리지 않고, ② 본체가 불투명한 곳(목·칼라·어깨)은 머리 실루엣에서 8→16px 페더로 본체 그림에 녹아 직선 절단선·목 끊김이 없다. 허공 쪽은 머리에서 25px까지만 포함해 멀리 있는 검·팔이 딸려오지 않는다. 작업 해상도는 셀의 2배(724²).
- **용량**: 80장 합계 **373KB**(256색 팔레트 PNG, 1장 2~7KB, 46~127px 폭·70~166px 높이). 알파 단계는 129단계로 유지된다.
- **앵커**: 파츠 크롭의 **아래 중앙**을 게임 셀 좌표로 옮긴 값을 인덱스별로 기록했다(`helmetAttackFrames[성별][프레임][인덱스]`). 투구마다 왕관·뿔·머리카락이 붙는 방향이 달라 크롭이 10px 안팎 비뚤어지므로 프레임 공통값 하나로는 안 된다(남 4프레임 x 171.5~182.5). 배율 1·회전 0·세로 배율 1로 얹으면 원본 그림과 같은 자리에 앉는다.
- **렌더**: `render/helmets.ts`에 `helmetAttackArtPaths`(80)·`helmetAttackArtList`·`helmetArtPath()`·`helmetArtFor(성별, 인덱스, 동작, 프레임)`·`helmetPlacement(성별, 동작, 프레임, 인덱스)`를 넣고, 공격은 `atk/{성별}_{인덱스}_f{프레임}.png`, 서기·걷기는 기존 정면 파츠를 그대로 돌려준다. `render/entities.ts` `syncHelmet`이 동작·프레임·인덱스를 넘기고, `render.ts`가 정면 13장 + 공격 80장을 부팅 때 함께 프리로드한다(프레임 전환 순간 텍스처가 비어 투구가 한 프레임 사라지는 일 방지). 장비창(`ui/equipmentPortrait.ts`)은 서기 1프레임이라 정면 파츠를 그대로 쓴다.
- **계약**: `store.ts`·`server/**`·`world.ts` 전투·세이브 형식 무변경. 정면 파츠 13장·`headless/` 시트·idle/walk 앵커·`baseItems.helmet` 순서(= 파츠 인덱스) 무변경. 여성도 공격은 인덱스 0~9 각각의 전용 파츠를 쓴다(정면처럼 3~9번을 남성 파츠로 공유하지 않는다).
- **테스트**: `tests/helmet-head-render.test.mjs` 14건 — ① 공격 80장이 `atk_{성별}_{인덱스}_f{프레임}` 경로·프리로드·파일 규격(RGBA, 40~170px)로 모두 존재 ② 서기·걷기는 정면 파츠 유지, 프레임은 4로 접힘 ③ 공격 앵커가 인덱스별로 다르고 4프레임이 1프레임보다 20px 이상 아래(숙임) ④ `drawHero`가 `attackPose` .32/.24/.16/.08에서 3/4 파츠로 갈아 끼우고 서기로 돌아오면 정면 파츠·서기 앵커로 복귀. `scripts/verify-item-art.mjs`에 atk 80장 규격 검사를 추가했다.
- **검증**: `tsc --noEmit`, 전체 테스트 **403건 중 401 통과**(실패 2건은 `tests/costume-field-render.test.mjs`의 "drawHero가 코스튬 레이어로 그리고…"로 `main`에서도 동일하게 실패하는 기존 실패), `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과.
- **배포**: [PR #111](https://github.com/songduckjin/DJRPG/pull/111) 스쿼시 병합(`18e51099b71088a9`). PR의 `Cloudflare Pages` 체크 통과(`Workers Builds: djrpg`는 `main`에서도 계속 실패하는 기존 실패). 병합 뒤 운영 `https://djrpg.pages.dev/version.json`이 `18e51099b710`(`builtAt 2026-11-19T15:33:22Z`)로 갱신됐고, **atk 파츠 80장 전부 HTTP 200**(파일별 3,935~7,262B), 배포 번들 `assets/index-CR83q69g.js`에 80개 경로 리터럴(`/assets/pilot-25d/helmets/atk/male_0_f0.png` … `female_9_f3.png`)과 `atk_male_3_f2` 키가 들어간 것을 확인했다. 원격 브랜치 삭제는 자격 증명 제한(403)으로 남아 있다.
- **주의(다른 작업자 변경)**: 착수 시점 이후 `origin/main`이 던전·드롭 기능으로 크게 갱신되어(최신 `e2d0639`) **최신 `main` 위로 리베이스**한 뒤 타입 검사·전체 테스트·빌드를 다시 돌렸다. 충돌은 `docs/TASK.md` 한 곳(두 작업 행)이었고 양쪽을 모두 남겼다. `src/game/render.ts`는 자동 병합되어 투구 프리로드와 드롭 레이어가 함께 들어간다.
- **검수 이미지**: 남성 10종×4프레임 `downloads/djrpg_attack_34_extracted_male.png`, 여성 10종×4프레임 `downloads/djrpg_attack_34_extracted_female.png`(둘 다 머리 없는 공격 시트 위에 실제 앵커로 합성). 확대 검수 `downloads/_headsheet_male_v2.png`·`_zoom_male_v5.png`·`_zoom_female_v5.png`·`_cmp_raw_vs_comp2.png`.

## 2026-11-19 — 공격 4프레임 투구 고개 방향·숙임 매칭 (작업 153)

- **제보**: 「투구 낀 모습까진 완벽한데 공격할 때 머리 방향이 안 가서 머리가 떠다니는 느낌」 + 「다른 투구도 전부」.
- **원인**: `render/helmets.ts` `helmetFrames`의 `attack` 앵커가 목 밑동보다 10~50px 위에 찍혀 있었다(남 2프레임 y=118, 여 2프레임 y=115). 파츠가 정수리·이마에 얹히고 턱·목이 비어 떠 보였고, `syncHelmet`이 `rotation = 0`으로 고정해 고개가 돌아가거나 숙여진 3·4프레임에서 정면 파츠가 몸통과 따로 놀았다.
- **재측정**: 원본 공격 시트(`warrior_{male,female}_attack_v1.png`)를 머리 없는 시트와 나란히 놓고 4프레임의 턱·목 밑동을 다시 읽었다(남 0~3프레임 목 밑동 y≈122/118/168/185, 여 ≈133/136/158/188). 앵커를 그 높이로 내리고, 프레임별 고개 기울기와 숙임을 넣었다 — 남 `4°/-3°/12°/15°`·세로 `1/1/0.92/0.88`, 여 `4°/-2°/11°/14°`·세로 `1/1/0.92/0.88`. 3·4프레임은 고개를 깊게 숙인 자세라 세로만 12% 줄여 화면상 단축을 냈다.
- **렌더**: `HelmetPlacement`에 `rotation?`(라디안, 목 밑동 앵커 피벗)·`scaleY?`(없으면 `scale`)를 추가하고 `render/entities.ts` `syncHelmet`이 `sprite.rotation`·`sprite.scale.set(scale, scaleY)`를 반영한다. 스프라이트 앵커가 (0.5, 1)이라 회전축이 곧 목 밑동이다.
- **방향 파츠를 새로 굽지 않은 이유**: 승인 파츠 13장을 `images --edit`로 3/4·숙임 재생성해 봤지만 디자인이 1:1로 유지되지 않았다(리벳·바이저 문양 변형, 화풍도 3D 렌더로 이탈). 같은 투구가 프레임·각도마다 달라 보이는 것이 더 큰 문제라, 승인된 파츠를 그대로 두고 피벗 회전·숙임 축소로 맞췄다. 파츠 52장을 추가하지 않아 초기 로딩·에셋 용량(3.46MB 기준)도 늘지 않는다.
- **계약**: `store.ts`·`server/**`·`world.ts` 전투·세이브 형식 무변경, 투구 파츠 PNG·`headless/` 시트·`idle`·`walk` 앵커 무변경(사용자 확인 완료 구간).
- **테스트**: `tests/helmet-head-render.test.mjs`에 2건 추가(13건) — ① 성별·공격 프레임별 `rotation`·`scaleY` 유한성과 숙임 단조성(1프레임은 젖힌 고개라 ≤0, 2프레임 세로 ≥ 3프레임 > 4프레임, 2·3프레임 앵커가 옛값보다 아래) ② `drawHero`가 공격 `attackPose` .32/.24/.16/.08에서 `rotation`·`scale.y`를 그대로 적용하고 서기로 돌아오면 풀리는지.
- **검증**: `npx tsc --noEmit`, 전체 테스트 402건 중 400 통과(실패 2건은 `tests/costume-field-render.test.mjs`의 "drawHero가 코스튬 레이어로 그리고…"로 `main`에서도 동일하게 실패하는 기존 실패), `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과.
- **배포**: [PR #109](https://github.com/songduckjin/DJRPG/pull/109) 스쿼시 병합(`9d52aab261d7`). PR의 `Cloudflare Pages` 체크 통과(`Workers Builds: djrpg`는 `main`에서도 계속 실패하는 기존 실패). 운영 `https://djrpg.pages.dev/version.json`이 `9d52aab261d7`(`builtAt 2026-11-19T14:14:12Z`)로 갱신됐고, 배포 번들 `assets/index-Fq-JbBxw.js`에 새 공격 표(`x:196,y:192,scale:.97,scaleY:.88,rotation:Qr(15)}`·`x:194,y:194,scale:.95,scaleY:.88,rotation:Qr(14)}`)와 `Qr(4)·Qr(-2)·Qr(-3)·Qr(11)·Qr(12)`(deg 헬퍼)가 들어간 것, 머리 없는 공격 시트 2장과 투구 파츠가 HTTP 200인 것을 확인했다. 원격 브랜치 삭제는 자격 증명 제한(403)으로 남아 있다.
- **검수 이미지**: 남성 10종×4프레임 `downloads/djrpg_attack_helm_all_v1.png`, 여성 10종×4프레임 `downloads/djrpg_attack_helm_female_v1.png`, 전후 `downloads/djrpg_attack_helm_before_after_v1.png`, 게임 배율 `downloads/djrpg_attack_helm_ingame_v1.png`. 폰 실기(공격 중 머리 따라오는 느낌)는 사용자 확인 몫이다.

## 2026-11-19 — 투구 착용 시 머리 매칭·머리카락 비침 수정 (작업 152)

- **제보**: 「얼굴에 매칭이 제대로 안 되네요」. 작업 151은 본체 시트(긴 머리카락·정수리 포함) 위에 투구 파츠만 얹어, 투구 위·옆으로 본체 머리카락이 삐져나와 스티커처럼 보였고, 오픈페이스 투구에서는 본체 얼굴과 파츠 얼굴이 겹쳤다. 여성·공격 프레임은 앵커도 어긋나 있었다.
- **머리 없는 본체 시트**: `public/assets/pilot-25d/headless/warrior_{male,female}_{idle,walk,attack}_v1.png` 6장을 새로 만들었다. 원본 시트의 18프레임을 머리 주변만 크롭해 `images --edit`로 머리·머리카락·수염을 지운 뒤, SIFT 특징 매칭으로 편집본을 원본 좌표계에 정합하고 `원본 실루엣 ∧ ¬편집본 실루엣` 마스크로 머리 영역만 지웠다(홀수 머리카락이 덮고 있던 갑옷은 편집본의 갑옷으로 채움). 어깨·갑옷·대검은 원본 픽셀 그대로다. 셀 크기·자리는 원본과 동일(idle 362², walk/attack 1448×362)이며 256색 PNG로 줄여 합계 278KB다.
- **렌더**: `render/helmets.ts`의 `headlessBodyPaths`가 경로를, `render.ts`의 `paths`·`walkSheets`·`attackSheets`가 로딩·프레임 분할을 맡는다. `render/entities.ts` `drawHero`는 착용 투구가 있을 때만 이 시트로 갈아 끼우고(로딩 전에는 기존 시트로 폴백), 배율·앵커·무기 소켓은 기존 시트 값을 그대로 쓴다(같은 좌표계). 맨얼굴은 종전 시트를 그대로 쓴다.
- **앵커 재측정**: 지운 머리 영역의 무게중심 x·정수리 높이를 기준으로 `helmetFrames` 표를 다시 쟀다(남 idle (228, 89)·여 idle (227, 88), 걷기 4프레임·공격 4프레임). 합성 검수에서 파츠가 칼라에 얹히는지 프레임별로 눈으로 확인했다.
- **장비창**: `ui/equipmentPortrait.ts` `equipmentFallbackPortrait`가 투구 착용 시 `headless/` idle 시트를 돌려줘, 미리보기도 필드와 같은 머리 없는 본체 + 투구 파츠가 된다.
- **계약**: `store.ts`·`server/**`·`world.ts` 전투·세이브 형식 무변경. 기존 본체 시트·투구 파츠 PNG는 손대지 않았다.
- **테스트**: `tests/helmet-head-render.test.mjs`에 머리 없는 시트 6장 존재·크기 일치·프리로드, 투구 착용 시 필드 텍스처 교체(걷기·공격·여성 포함)와 해제 시 원복, 초상화 base가 `headless/`로 바뀌는지 확인을 추가(11건). `tests/equipped-detail.test.mjs`의 초상화 base 기대값을 새 계약에 맞게 고쳤다.
- **검증**: `tsc --noEmit`, 전체 테스트 400건 중 398 통과(실패 2건은 `costume-field-render`의 기존 실패), `npm run build`, `git diff --check` 통과.
- **배포**: [PR #107](https://github.com/songduckjin/DJRPG/pull/107)을 스쿼시 병합했다(머지 `6ba9330a22037e0d2de1775e2880699ff2937cf9`). PR의 `Cloudflare Pages` 체크는 통과, `Workers Builds: djrpg`는 `main`에서도 계속 실패하는 기존 실패다. 병합 뒤 운영 `https://djrpg.pages.dev/version.json`이 `6ba9330a2203`(`builtAt 2026-11-19T13:17:23Z`)로 갱신됐고, 머리 없는 시트 6장이 모두 HTTP 200, 배포 번들(`index-BLHBfVs_.js`)에 6개 경로가 들어간 것을 확인했다. 실기 화면(투구를 쓴 채 걷기·공격)은 사용자 확인 몫이다.
- **검수 이미지**: 남성 10종 `downloads/djrpg_helmet_overlay_male_v2.png`, 남녀 대표 `downloads/djrpg_helmet_overlay_gender_v2.png`, 걷기 프레임 `downloads/djrpg_helmet_overlay_frames_v2.png`.

## 2026-11-19 — 투구 10종 머리 파츠 필드·장비창 적용 (작업 151)

- **요청**: 승인 시안(`djrpg_pilot_helms_1to5.png`·`djrpg_pilot_helms_6to10.png`)의 남녀 전사 외형 위에 게임 내 투구 10종(`baseItems.helmet` 0~9, 옛 이름 `낡은 투구` 포함)을 착용하면 필드와 장비창(`내 정보`) 모두에 투구 외형이 보이게 하고, PR 병합·운영 배포까지 완료.
- **시안 → 파츠**: 시안 두 장은 같은 몸통에 투구만 바꿔 그린 5열 그림이라, 목 칼라 위치를 기준으로 투구 머리 부분을 잘라 냈다. 검정 배경을 투명화할 때 투구 안쪽의 순수 검정 그림자가 배경과 색이 같아 얇은 통로로 새는 문제가 있어, 어두운 영역을 2px 깎고 플러드필한 뒤 다시 부풀리는 방식으로 안쪽 그림자를 보존했다. 목 아래로는 가운데 목 폭만 남기고 어깨 갑옷을 잘라 본체 갑옷과 겹쳐 보이지 않게 했고, 아래쪽 끝은 페이드했다. 결과는 `public/assets/pilot-25d/helmets/helm_0~9.png`(투명 RGBA, 폭 60~74px).
- **여성 오픈페이스**: 0~2번(가죽 두건·철제 바시넷·사슬 코이프)은 얼굴이 드러나 남성 수염이 그대로 보이므로, `warrior_female_idle_v1.png`를 `images --edit`로 편집해 같은 여성 전사가 세 투구를 쓴 3열 시안을 1장 생성(검수 후 사용)하고 `helm_female_0~2.png`로 추출했다. 3~9번은 풀페이스라 남녀 공용이다.
- **정렬**: 파츠는 전부 **아래 중앙(목 밑동) 앵커**이고 크기는 본체 362px 셀 좌표계로 맞췄다. 성별·동작(idle/walk/attack)·프레임별로 목 밑동 좌표와 배율을 실물 합성으로 재서 `src/game/render/helmets.ts` 표에 넣었다(걷기는 4포즈를 8프레임으로 반복 재생하므로 4개 값). 시트마다 머리 크기가 달라 프레임별 배율 보정이 필요했다.
- **렌더**: `src/game/render.ts`가 파츠 13장을 부팅 때 프리로드(진행률에 합산)하고, `render/entities.ts`의 `drawHero`가 `syncHelmet`으로 현재 프레임 앵커에 스프라이트를 놓는다. 투구를 벗으면 숨기고, 피격 tint는 본체와 같은 `0xffd4cf`를 쓴다. zIndex는 본체(0)와 무기(1) 사이인 0.5다.
- **장비창**: `ui/equipmentPortrait.ts`의 `equipmentPortraitPlan` 키에 착용 투구를 넣어 캐시가 섞이지 않게 하고, `composeFallback`이 pilot idle 전신 그림 위에 같은 좌표·배율로 투구를 합성한다.
- **계약**: `store.ts`·`server/**`·`world.ts` 전투 로직·세이브 형식은 변경하지 않았다. `baseItems.helmet` 순서(= 파츠 인덱스)도 그대로다.
- **테스트**: `tests/helmet-head-render.test.mjs` 8건(이름→인덱스 매핑·`낡은 투구`→7·여성 0~2 분기·파츠 PNG 규격·프리로드 목록·프레임 앵커 유한성·필드 스프라이트 생성/숨김/틴트·초상화 키 변화). `scripts/verify-item-art.mjs`에 파츠 13장 규격 확인을 추가했다. 기존 `tests/equipped-detail.test.mjs`의 초상화 키 기대값은 새 계약(성별 + 투구)에 맞게 고쳤다.
- **검증**: `tsc --noEmit` 통과, 전체 테스트 397건 중 395 통과, `node scripts/verify-item-art.mjs` 통과, `vite build` 통과, `git diff --check` 통과. 실패 2건은 `tests/costume-field-render.test.mjs`의 "drawHero가 코스튬 레이어로 그리고…"로 `main`(`29a1e29`)에서도 동일하게 실패하는 기존 실패다.
- **배포**: [PR #105](https://github.com/songduckjin/DJRPG/pull/105)를 스쿼시 병합했다(머지 `c94216cdc19445696fbaa7fa2f3436cfa43c1db6`). PR의 `Cloudflare Pages` 체크는 통과, `Workers Builds: djrpg`는 `main`에서도 계속 실패하는 기존 실패다. 병합 뒤 운영 `https://djrpg.pages.dev/version.json`이 `c94216cdc194`(`builtAt 2026-11-19T11:51:16Z`)로 갱신됐고, 투구 파츠 13장이 모두 HTTP 200, 배포 번들에 파츠 경로가 포함된 것을 확인했다. 원격 브랜치 삭제는 자격 증명 제한(403)으로 남아 있다.
- **검수 이미지**: 남성 10종 `downloads/djrpg_helmet_overlay_male.png`, 남녀 대표 `downloads/djrpg_helmet_overlay_gender.png`, 18프레임 `downloads/djrpg_helmet_overlay_frames.png`. 실기 화면(투구가 머리에 앉은 느낌·걷기/공격 중 흔들림)은 사용자 확인 몫이다.

## 2026-11-19 — 평타 1마리 제한·걷기/공격 몸 크기 보정 (작업 150)

- **제보**: 사용자가 실기 확인 후 「평타가 여러 마리를 한 번에 때린다」·「대검을 휘두르거나 걸을 때 캐릭터가 작아진다」를 알렸다.
- **평타 단일 대상**: `src/game/world.ts` `action`의 평타만 `this.damage(90, attack, angle, 1.15, 12, 0, p, 1)`로 호출한다. `damage()`에 선택 인자 `maxTargets`(기본 `Infinity`)를 추가해 사거리·부채꼴(±1.15rad) 안의 적을 가까운 순으로 정렬하고 그 수만 맞힌다. 스킬 7종(`slash2`·`spin`·`crushing`·`slam`·`power`·`destroy`·`hell`)은 인자를 넘기지 않아 종전처럼 광역이며, 스킬 이펙트의 지연 판정(`origin=effect`)도 그대로다. 피격 표시·넉백·처치·드랍 정리 순서는 그대로다. **한 방 무게(후속 지시)**: 한 마리만 맞히게 되면서 총피해가 줄어 "한방한방이 쌔야 돼"라는 사용자 지시를 받아 `basicAttackPower = 1.6`을 두고 평타 피해를 `attack` → `attack × 1.6`으로 올렸다. 기존 광역 평타와 비교하면 대상 하나에 주는 피해가 1.6배이고, 피해 숫자 표시도 `Math.round(attack × 1.6)`으로 커진다. 스킬 배율·쿨다운·오프라인 정산(`killsPerMinute`는 `attack`/`enemyMaxHp` 비율)·서버 계약은 건드리지 않았다.
- **몸 크기**: pilot 시트 알파를 다시 재니 idle 남 337·여 335, walk 4칸 남 293~307·여 295~305, attack 4칸 남 246~342·여 246~342(1프레임은 머리 위로 든 검 포함). 작업 149가 세 상태 모두 `heroBodyPx` 335를 쓰고 있어 걷기에서 약 10%, 내려찍는 칸에서 최대 27% 작았다. `pilotMaleWalk`/`pilotFemaleWalk` **335 → 300**(4칸 평균), `pilotMaleAttack`/`pilotFemaleAttack` **335 → 270**(내려찍는 칸 평균, 검을 머리 위로 든 1칸은 이상치로 제외)으로 바꿨고, 서기(idle) 335는 건드리지 않았다. 그림자 반지름 `bodyPx × scale × .37`은 두 값이 약분돼 화면 크기가 변하지 않는다.
- **테스트 추가**: `tests/world-movement.test.mjs`에 ① 평타가 사거리·부채꼴 안의 가장 가까운 한 마리만 때림(배열 순서 무관·피격 표시 1건) ② 평타로 한 마리를 처치해도 다른 적은 살아 있고 처치 수만 늘어남 ③ `destroy` 스킬은 가깝고 먼 적을 함께 때림 ④ 평타 피해가 `attack × basicAttackPower(1.6)`이고 피해 숫자도 1.6배 ⑤ 평타 두 방 합계가 이전 두 방 합계의 1.6배. `tests/hero-art.test.mjs`에 남녀 각각 pilot 시트 알파 실측과 `heroBodyPx` 를 대조(`idle` 1%·walk/attack 평균 8% 허용)하고 걷기·공격이 idle보다 작은 값으로 보정돼 있는지 확인하는 테스트를 넣었다.
- **검증**: `npx tsc --noEmit`, `node --test tests/*.test.mjs` 389건 중 387 통과, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. 실패 2건은 `tests/costume-field-render.test.mjs`의 "drawHero가 코스튬 레이어로 그리고…"으로, 변경 전 `main`(`17facd5`)에서도 동일하게 실패하는 기존 실패다(작업 149의 pilot 전환으로 기대값이 낡았고 이 작업 범위 밖이라 손대지 않았다).
- **배포**: [PR #103](https://github.com/songduckjin/DJRPG/pull/103)을 스쿼시 병합했다(머지 `11e99459be5bffb7b48b935ee6dbc0a96d0af317`). PR의 `Cloudflare Pages` 체크는 통과, `Workers Builds: djrpg`는 `main`에서도 계속 실패하는 기존 실패다. 병합 15초 뒤 운영 `https://djrpg.pages.dev/version.json`이 `11e99459be5b`(`builtAt 2026-11-19T11:08:32Z`)로 갱신됐고 `/`와 `/assets/pilot-25d/warrior_male_attack_v1.png`가 HTTP 200임을 확인했다. 원격 브랜치 삭제만 자격 증명 제한(403)으로 남아 있다. 실기 화면(타격감·평타 대상·걷기/공격 체격)은 사용자 확인 몫이다.

## 2026-11-19 — AI 시안 기반 남녀 전사 외형 전체 교체(작업 149)

- **요청/결정**: 사용자가 필드 화면을 공유하고 기존 전사 그림을 앞서 만든 서기·양손 끌며 걷기·4단계 내려찍기 시안으로 교체해 달라고 했다. 사용자는 그림이 갑옷·대검 일체형이라 장착 아이템의 화면 외형이 고정되는 점을 확인하고 실제 게임 전체 교체를 선택했다. 장착 슬롯·능력치·Save는 그대로다. 이에 작업 145의 추가 실기 검수는 대체하고 기존 v3/v4/v5 코스튬 구현·파일은 보존한다.
- **제작**: ImageGen으로 남녀 각 12셀 시트를 만들었다. 투명 배경 matte를 제거해 `public/assets/pilot-25d/warrior_{male,female}_{idle,walk,attack}_v1.png` 6장으로 자르고, 시트 원본은 `docs/references/djrpg_pilot_{male,female}_v1_sheet.png`에 기록했다. 프레임은 idle 1장, 걷기 4장 반복, 공격 4장이다.
- **연결**: `render.ts`가 pilot 에셋을 로드하고 `render/entities.ts`가 남녀별 idle·walk·attack을 선택한다. 이미지에 무기가 포함되므로 필드 코스튬·장비 오버레이·외부 무기 스프라이트를 생략한다. `equipmentPortrait.ts`는 같은 남녀 idle 이미지를 쓰며 매니페스트 요청도 하지 않는다. 전투 데이터와 장비 통계는 읽기만 한다.
- **검증·배포**: `node node_modules/typescript/bin/tsc --noEmit`, 관련 `node --test` 86건, PNG 6장 투명도·셀 규격·프레임 경계 확인, `pnpm run build`, `git diff --check` 통과(줄바꿈 CRLF 안내만 표시). PR #101이 `9e9d736883e0`으로 병합됐고 운영 Pages `/version.json`이 같은 SHA, 남녀 idle·walk·attack 에셋 6장이 HTTP 200임을 확인했다. PR의 `Cloudflare Pages` 체크는 성공했지만 `Workers Builds: djrpg` 별도 체크는 실패했다. 수동 `pnpm run deploy:cf`는 로컬 `CLOUDFLARE_API_TOKEN` 부재로 실패했고, PR 병합 후 GitHub 연동 자동 Pages 배포가 완료됐다. Vite는 기존 Pixi dynamic-import와 500KB 초과 번들 경고를 출력했다.

## 2026-11-19 — 3D→2.5D Blender 자동 렌더 파이프라인·확정 포즈 시안 등록 (작업 147)

- **배경**: 캐릭터를 3D로 만들어 2.5D 쿼터뷰 셀로 뽑는 작업을 PC 코덱스가 반복할 수 있게, 렌더 절차를 명령 한 줄로 고정했다. 사용자가 확정한 대검 포즈(서기·양손 끌며 걷기·4단계 내려찍기)가 기준이다.
- `scripts/blender/render_25d_costume.py`(신규, 1026줄) — Blender CLI 전용 렌더러. `.blend`/`.glb`/`.fbx` 로드, 액션 슬롯 수만큼 균등 프레임 샘플링(기본은 끝 프레임 제외), 쿼터뷰 직교 카메라 + 3점 조명 + `FILM_TRANSPARENT`, **발끝 앵커를 셀 피벗 `(117, 232.3)px`에 · 본체 높이를 190px에** 맞추는 카메라 피팅(1회 ortho_scale 보정 + 2~3회 위치 반복, 모든 액션·프레임 공통 고정), 파츠 분리 렌더(`--parts`·`--part-map`·`djrpg_part`·`--holdout`), 규약 8×8 아틀라스 패킹(`<out>/atlas/<파츠>-<라벨>-v0.png`, 1872×1936, 변형당 32칸)과 `render-manifest.json`. `--dry-run`/`--print-spec`/`--selftest`(bpy 없이 PNG 코덱·슬롯 계산 점검) 지원. `bpy`는 `require_bpy()` 안에서만 import한다.
- `docs/BLENDER_25D_PIPELINE.md`(신규) — Blender 4.x 준비·엔진 선택(Cycles 기본), Mixamo/CC0 파일럿 모델과 파츠 분리 레시피, **확정 포즈 스펙**(idle·walk·attack 4단계 표), 본·소켓 명명(`hand_r`·`hand_l`·`weapon_socket`)과 양손 그립(Child-Of 권장 / IK), 4단계 키프레임 규약(샘플러가 범위를 등분하므로 키를 1·9·17·25에), CLI 인자·Windows 예시, 기존 `build-costume-atlas.py`·`costumeHero.ts`·`COSTUME_ASSET_VERSION` 연결 절차, 검수 체크리스트·문제 해결.
- `docs/references/`(신규) — 확정 시안 2장을 가로 1024px·256색 PNG로 줄여 넣었다(`djrpg_25d_3poses_preview_v2.png` 1536²·1.7MB → 1024×683·484KB, `djrpg_attack_4frames_v2.png` → 1024×512·372KB). `public/assets/**`에 넣지 않아 번들·런타임 용량 영향 없음.
- **범위**: `src/**`·`public/assets/**`·`server/**`·Save/API 무변경. 배포 매니페스트·버전 올리기는 실제 렌더가 나온 뒤 별도 작업이다(가이드 §8.2).
- **검증**: `python3 -m py_compile` 통과, `--selftest` 6/6, `--help`·`--print-spec`·`--dry-run` 동작, 합성 셀로 아틀라스 패킹·슬롯 좌표·매니페스트 출력 확인, `npx tsc --noEmit`, `node --test tests/*.test.mjs`, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check`. 실제 Blender 렌더는 이 환경에 Blender가 없어 PC 몫이다(가이드 §1.2 자체 점검으로 먼저 확인).
- **반영**: [PR #99](https://github.com/songduckjin/DJRPG/pull/99) → 스쿼시 병합 `d8110470a99c97a6ae38fa85b0d47e8eccdad22b`. Cloudflare Pages 운영 `https://djrpg.pages.dev/version.json`이 `d8110470a99c`로 갱신된 것을 확인했다. 같은 PR에서 `Workers Builds: djrpg` 체크가 실패로 뜨는데, 이는 병합 전 `main` 헤드(`7ef716f`)에서도 동일하게 실패하는 기존 상태다(사이트 배포를 담당하는 `Cloudflare Pages` 체크는 통과).

## 2026-11-19 — 무기 레이어 검 1.45배·손잡이 허리·골반까지 내림(실기 후속 2차)

- **제보**: 직전 PR #96(1.35배·`{-3, 68}`) 배포 후에도 "검이 아직도 머리 위에 떠 있어, 가려도 되는데 왜". 실측상 `weapon-male` 정지 셀은 1.35배·`+68`에서도 검 끝이 발끝 기준 `-208px`로 본체 머리 상단 `-193px`보다 15px 위에 남고, 손잡이(`-94px`)도 아직 상체에 걸쳐 있었다.
- `src/game/render/costumeHero.ts`: `costumeWeaponFit = { x: -8, y: 110, scaleX: 1.45, scaleY: 1.45 }`로 올렸다. 검 길이 104 → 151px, 손잡이 `-119.3 * 1.45 + 110 = -63px`(몸높이 190px의 33% = 허리·골반 손 높이), 검 끝 `-204.3 * 1.45 + 110 = -186px`로 머리 상단(`-193px`) 아래에 들어와 검날이 머리를 넘지 않고 몸을 덮는다. X는 1.45배가 만든 손잡이 이동을 `-8`로 되둘린다.
- 적용 범위는 종전과 같다. `definition.slot === 'weapon'`에만 기본값으로 쓰이고 매니페스트 `fit`이 있으면 그 값이 우선하며, 갑옷·투구·v3 아틀라스 PNG·매니페스트·`COSTUME_ASSET_VERSION`·Save/API 계약은 바꾸지 않았다.
- 테스트: `tests/costume-field-render.test.mjs`의 무기 보정 단언을 1.45배·`{-8, 110}`로 바꾸고, 아틀라스 생성기 손 소켓 실측(남 `-119.86`·여 `-105.69`)으로 성별별 손잡이 높이(남 `-64px`·여 `-43px`)와 검 끝이 머리 상단 `-193.32px` 아래에 남는지 확인하는 계산 단언으로 교체했다.
- 문서: `docs/COSTUME_SYSTEM.md` v2.2(§7.10 보정값·1차 보정 이력), `docs/CODE_MAP.md`(캐릭터 외형 행·`costumeHero.ts` 항목).
- 검증: `tsc --noEmit`, `node --test tests/*.test.mjs` 382건, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 열람은 이미지 입력 제한으로 하지 않았고 실제 화면 검수는 사용자 몫이다.

## 2026-11-19 — 무기 레이어 검 확대(1.35배)·손잡이 내림(실기 후속)

- **제보**: 실기(웹)에서 "검 크기가 더 컸으면 좋겠다, 그리고 검이 머리 위에 떠 있나 봐". §7.9에서 70% 축소를 걷어낸 1배 상태에서도 `scripts/build-costume-atlas.py` `weapon_cells()`가 손 소켓(`SOCKETS`)의 어깨·목 높이(`hand_y = PIVOT_Y + (v - anchor_y) * frame * scale ≈ -120px`)에 손잡이를 앉히고 검 길이를 `BODY_PX * 0.55 = 104px`로 그려, 검이 몸에서 떠 보이고 짧았다.
- `src/game/render/costumeHero.ts`: `costumeWeaponFit = { x: -3, y: 68, scaleX: 1.35, scaleY: 1.35 }`를 신설하고 `planHeroCostume()`에서 `definition.slot === 'weapon'`일 때 매니페스트 `fit`이 없으면 이 값을 기본으로 쓴다. 발끝 피벗(`anchor.y = .96`) 기준 1.35배로 올라간 `120 * 0.35 = 42px`를 되돌리고 26px를 더 내려(`+42 + 26 = +68`) 손잡이를 발끝 기준 `-94px`(몸높이 190px의 49% = 허리·손 높이)에 둔다. X는 `+8px` 손잡이 접점을 유지하도록 `-3`. 검 길이는 104 → 140px.
- 매니페스트가 `fit`을 지정하면 무기도 그 값이 우선하며, 갑옷·투구는 종전대로 `fit`(없으면 보정 없음)만 쓴다. 공격 계열 무기 셀은 투명(공격 시트에 검 내장)이라 이 보정은 idle·walk에만 보인다. v3 아틀라스 PNG·매니페스트·`COSTUME_ASSET_VERSION`·Save/API 계약은 그대로다.
- 아틀라스 실측으로 검증: 정지 프레임 무기 bbox 남 `y -206..-101`·여 `-191..-86`, 본체 상단 `-193`. `tests/costume-field-render.test.mjs`의 "무기 1배" 단언을 1.35배·`{-3, 68}` 기대로 바꾸고, 손잡이가 발끝 기준 `-94px`에 오는지 계산 단언과 매니페스트 `fit` 우선 검사를 추가했다.
- 문서: `docs/COSTUME_SYSTEM.md` v2.1(§7.10 신설, §7.7·§7.9에 후속 표시), `docs/CODE_MAP.md`(캐릭터 외형 행·`costumeHero.ts` 항목).
- 검증: `tsc --noEmit`, `node --test tests/*.test.mjs` 전체, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 열람은 이미지 입력 제한으로 하지 않았고 실제 화면 검수는 사용자 몫이다.

## 2026-11-19 — 자동전투 추격 후 공격 멈칫(사거리 경계 데드존) 수정

- **제보**: 자동 사냥 중 캐릭터가 때리다가 멈추는 현상. `src/game/world.ts` `update`에서 적 추격 정지 거리(`stop = 89`)와 공격 사거리(`distance < 90`)가 1px 어긋나 있었다. 적이 89~90 구간에 있거나 넉백으로 경계에 걸친 프레임에는 `pursuing`이 참으로 남아 `activeMove`가 0이 아니고, `action()`의 "수동 이동 중이면 공격 취소" 규칙(`activeMove > .05`) 때문에 사거리 안인데도 공격이 씹혔다.
- **수정**: 적(`drop` 아님)이면 `distance < 90`에서 추격을 **즉시** 끊고(`pursuing = false`) 그 프레임부터 서서 공격한다. 사거리 경계 90은 추격 쪽에 두어(`distance < 90` 아니면 추격) 정확히 90에서도 붙어 들어가 공격한다. 드랍 추격 정지 거리(60/20)·`action()`의 이동 차단·쿨다운·저장/API 계약은 그대로다.
- 테스트: `tests/world-movement.test.mjs`에 회귀 검사 2건 추가 — ① 89.9·89.5·89·85.2·40에서 추격 상태로 시작해도 사거리 안이면 서서 그 프레임에 공격(걷기 0, 피해 발생) ② 89.5 경계에 6초 고정해도 쿨다운마다 계속 공격(8회 이상)하고 한 번도 걷기 시작하지 않음. 수정 전 코드에서 ①이 실패하는 것을 확인했다.
- 검증: `tsc --noEmit`, 전체 `node --test tests/*.test.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 확인은 이미지 입력 제한으로 하지 않았다.

## 2026-11-19 — 캐릭터 외형 3부위(갑옷·투구·무기)·무기 크기 원복 (실기 후속)

- **제보 2건**: 실기 화면에서 ① 문장(`offhand`)이 캐릭터 밖으로 튀어나와 보임 ② 두손검이 작아 보임. ①은 문장·장갑·신발 코스튬 레이어가 캐릭터에 붙어 그려진 결과였고, ②는 작업 143/144의 무기 70% 축소 보정 때문이었다.
- `src/game/render/costumeHero.ts`: `costumeSlotDrawOrder`(6부위)를 `costumeAppearanceSlots = ['armor','helmet','weapon']`로 바꿔 `planHeroCostume()`이 갑옷·투구·무기 3부위만 계획한다. 문장·장갑·신발은 착용·스탯·`내 정보` 10칸 슬롯·코덱스·Save·매니페스트 계약과 아틀라스 PNG를 그대로 두고 **그림 레이어만** 없다. 외형을 그리지 않는 부위는 `planCostume()`을 호출하지 않아 매핑 밖 이름이어도 폴백을 만들지 않는다.
- 무기 `if (definition.slot === 'weapon')` 70% 축소 블록을 제거해 매니페스트 `fit`(없으면 1배)만 쓴다. 축소 보정식이 `(1 - scale)` 항이라 손 소켓 접점은 1배에서도 같은 좌표다(검만 커진다).
- 테스트: `tests/costume-field-render.test.mjs`에서 6부위 기대 단언을 3부위 기대로 바꾸고, 회귀 검사 2건(문장·장갑·신발 착용/미매핑 이름이어도 레이어·폴백 없음, 무기 `scale`·`offset`·`rotation` 원복)을 추가했다. `tests/equipped-detail.test.mjs`의 문장·신발 레이어 기대도 "없음"으로 바꿨다. 아틀라스 실패 목록은 실제로 쓰는 3페이지로 정리했다.
- 문서: `docs/COSTUME_SYSTEM.md` v2.0(§7.9 신설, §7.7 축소 항목에 원복 표시), `docs/CODE_MAP.md`(캐릭터 외형 행·`costumeHero.ts` 항목).
- 검증: `tsc --noEmit`, 전체 `node --test tests/*.test.mjs` **380건**, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. PNG·스크린샷 확인은 이미지 입력 제한(2026-11-19 17:45까지) 때문에 하지 않았고 화면 검수는 사용자 몫이다.

## 2026-11-19 — 서리의 가죽두건 혼합 장비 레이어 (작업 145 후속)

- **운영 화면 후속**: PR #89의 전신 시안은 `서리의 가죽두건 + 낡은 두손검` 단일 조합에서만 적용된다. 운영 화면에서 문장·신발 등 다른 장비를 함께 착용한 상태가 확인돼 전신 대체 조건을 벗어나면 v3 금속 투구가 그대로 보였다. `codex/145-frost-hood-layered-fix`에서 아이템 원본의 천 두건만 머리 위치에 배치하는 **두건 전용 레이어**를 추가했다.
- `scripts/build-costume-atlas.py --pilot-145-overlay`: 아이템 원본 아이콘(`item-art/helmet_0.png`)의 천 두건만 잘라 남/여 × (갑옷 위 / 맨몸 위) 머리 기준점에 얹은 v5 페이지 4장(`public/assets/costume/v5/atlas/frost-hood-{armor,body}-{male,female}.png`)을 생성한다. v3 배포물·매니페스트와 `COSTUME_ASSET_VERSION`(3), v4 전신 페이지는 바꾸지 않았다.
- `src/game/render/costumeHero.ts` `planHeroCostume()`: 혼합 장비에서는 투구 레이어만 `frost-hood-*` 페이지(variant 0, `assetVersion: 5`)로 바꾼다. 갑옷·문장·무기·신발 레이어와 레이어 순서, 전신 v4 경로, 장비창 공용 계획은 그대로이며 공격 방향은 기존 v3 정책(좌우 반전)을 따른다.
- 테스트·검증 도구: `tests/costume-field-render.test.mjs`에 갑옷+두건, `tests/equipped-detail.test.mjs`에 갑옷·문장·신발+두건(필드 계획 = 장비창 계획) 검사 2건을 추가했고, `scripts/verify-item-art.mjs`가 v5 페이지 4장의 존재와 2048×2048 RGBA 규격을 검사한다.
- 검증: `npx tsc --noEmit`, 관련 테스트 **66건**, 전체 `npm test` **379건**, `node scripts/verify-item-art.mjs`, `npm run build`, `git diff --check` 통과. Save/API·`src/game/store.ts`·`server/**` 무변경.
- PR #92로 반영했다. 실제 운영 필드·장비창 화면(얼굴 가림·손잡이 접점)은 사용자 검수 전이므로 작업 145는 `[-]`를 유지한다.
- **병합·배포 실측**: PR #92를 `7fc83660fdb0e3cdf219edf724511ffee306ab5f`로 스쿼시 병합했다. 운영 `https://djrpg.pages.dev/version.json` = `7fc83660fdb0`, v5 아틀라스 4장(`frost-hood-{armor,body}-{male,female}.png`)·v4 전신 1장·v3 매니페스트가 200으로 응답하고, 배포 번들에 `frost-hood-`·`pilot-frost-leather-hood-overlay` 코드가 포함된 것을 확인했다. 화면 캡처는 이미지 입력 제한으로 하지 않았고 실제 필드·장비창 검수는 사용자 몫으로 남긴다.

## 2026-11-19 — 코스튬 동작 싱크·캐시 제한 (작업 144)

- **실기 후속 수정**: 무기 레이어의 104px 검이 머리 위까지 돌출되던 문제를 공용 외형 계획에서 70% 축소·손 소켓 유지로 보정했다. `낡은 투구`는 v3의 열린 얼굴 공용 투구로 그려지던 문제를 확인하고, 정확한 닫힌 바이저가 있는 통합 본체·초상화로 폴백시켰다. 기존 PNG·Save/API 계약은 변경하지 않았다.
- 후속 검증: 남/여 정지 셀 합성 비교, TypeScript 검사, 관련 Node 테스트 **86건**, 아틀라스 검증, diff 검사를 통과했다. 모바일 실기 재확인은 남아 있다.
- 설계·구현 불일치 수정: `spin` 시 본체가 360° 도는 동작을 제거하고, 필드 코스튬·기존 바디 폴백 모두 회전값 0으로 통일했다. 스킬 프레임·회오리·잔상 연출은 유지한다.
- 필드 아틀라스 캐시를 현재 계획에 필요한 최대 6페이지로 제한했다. 장비 계획 변경 시 코스튬 스프라이트와 잔상을 먼저 해제하고, 파생 셀 텍스처와 이전 Pixi Assets 페이지를 unload한다. 로딩 중인 페이지도 상한에 포함하고, unload 완료 전 다음 페이지를 요청하지 않는다.
- 장비 미리보기는 디코딩 아틀라스 이미지 LRU 2장을 유지하고, 합성 중인 페이지는 축출하지 않는다. dataURL LRU 24개는 그대로 유지한다.
- 1872×1936 RGBA 페이지 기준 약 13.83 MiB, 최대 6페이지 약 82.97 MiB로 산정했다. 실제 모바일 FPS·GPU 메모리는 측정하지 않았다.
- 검증: TypeScript `--noEmit`, 관련 Node 테스트 **70건**, `node scripts/verify-item-art.mjs`, `git diff --check` 통과.

## 2026-11-19 — 코스튬 아틀라스 v3 (작업 143)

- 덕진 님 폰 실기에서 잡힌 v2 버그 3건을 근본 수정하고 `COSTUME_ASSET_VERSION = 3`으로 배포 경로를 올렸다. `/assets/costume/v3/`에 아틀라스 **70장**(23MB, 1872×1936 = 셀 `234×242` 8×8)과 매니페스트 55종을 커밋하고, 참조 0을 확인한 `public/assets/costume/v2/`(60장·39MB)를 삭제했다.
- **갑옷 + 본체 겹침**: `src/game/render/costumeHero.ts` `planHeroCostume()`이 갑옷 착용 시 본체 파츠(`torso`·`arms`·`legs`)를 **전부** 뺀다. v2는 `torso`만 빼서 공격 프레임에서 맨몸 팔·다리가 갑옷 밖으로 나왔다.
- **투구**: 생성기가 얼굴 상관으로 찾은 머리 창 안에서만 차이를 떠 몸통·어깨·다리 파편을 없애고, 투구 한 벌 스프라이트를 프레임별 머리 기준점에 `(dx, dy)`로 얹는다. 갑옷을 입지 않은 조합용 `helmet-body-<성별>` 페이지 10장을 추가하고 렌더러가 갑옷 유무로 페이지를 고른다.
- **공격 모션**: `clean_fragments()`가 크롭 경계의 이웃 포즈 조각(잘린 발·칼끝)을 지운다(셀 변환 뒤 한 번 더). `cast`는 공격 포즈만 써서 무기가 중간에 사라지지 않게 했고, `gloves`는 손 주변 상자만 남겨 가죽 갑주가 배에 붙던 문제를 없앴다.
- **검수 도구 신규**: `scripts/costume-contact-sheet.py` — 배포본 아틀라스를 게임과 같은 순서로 합성한 접촉 시트(`--only verify`·`helmets`·`motions`). 남/여 × (맨몸 / 맨몸+낡은 투구 / 갑옷+투구) × (idle / walk / attack)에서 파편·겹침·머리 어긋남 0건을 눈으로 확인했다.
- 검증: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`, 전체 `npm test` **360건**, `npm run build`, `git diff --check` 통과. 문서: `docs/COSTUME_SYSTEM.md` v1.5(§7.5 신설), `docs/CODE_MAP.md`·`docs/QUICK_PATCH.md`·`AGENTS.md` 경로 갱신.

## 2026-11-18 · 작업 142 코스튬 실물 아틀라스 v2 · 레거시 정리

- 담당자 `songduckjin`의 작업지시에 따라 `[작업 139]`~`[작업 141]`의 코스튬 파이프라인에 **실물 에셋**을 붙였다. `/assets/costume/v2/manifest.json`(55종)과 아틀라스 60장(총 39MB, 1872×1936 = 셀 `234×242` 8×8)을 커밋하고 `COSTUME_ASSET_VERSION = 2`로 올려 v1 SPA fallback HTML 캐시를 우회했다.
- 새 그림을 그리지 않고 `public/assets/`의 기존 2.5D 프리렌더 시트를 재료로 썼다. 생성기 `scripts/build-costume-atlas.py`가 본체 높이 190px·실루엣 중심 x·발끝 피벗으로 시트를 정규화해 맨몸/갑옷/투구 시트가 걷기 프레임에서 10px 이내로 겹치게 만들고, 그 위에 장비 레이어를 원본 그대로 앉혔다. 색 변형은 `appearance.ts` 팔레트 색조를 휘도 램프로 입히되 피부·외곽선·하이라이트는 보존한다.
- 장비 페이지 이름을 `<부위>-<성별>`로 바꿨다(갑옷 레이어가 전신 그림이라 남/여 혼용 불가). `docs/COSTUME_SYSTEM.md` v1.4 §7.2·§7.4에 규격·제작 방식·남은 한계를 남겼다.
- 참조 0을 확인한 구형 걷기 시트 5장과 `icons/nav_status_v2.png`만 삭제했다. `warrior_equipped_*` 8장(폴백 참조)·통합 바디 시트(필드 폴백)·`tools/costume-viewer/`(138 프로토타입)는 근거와 함께 유지 목록으로 보고한다.
- 검증: `npx tsc --noEmit`, `node scripts/verify-item-art.mjs`(아틀라스 검증 추가), 전체 `npm test` 355건, `npm run build`, `git diff --check` 통과.

## 2026-11-18 · fks3997 작업164 월드보스 처치 연출
- 검을 꽂고 무릎꿇어 주저앉는 8프레임/접점보정·먼지/돌을 추가했다. 서버 공유HP 0 때만 한 번, “보스를 처치하였습니다.” 문구 뒤 결과창으로 이어지고 토벌후 재도전은 차단한다.
- 새 팝업 기본 도전탭/내부탭전환 유지. tsc·부분56테스트·아트75/착용50·diff 통과, 실기 미실행. Pages 배포 결과는 PR에 기록한다.

## 2026-11-18 · fks3997 작업163 월드보스 입장 지연
- 저장 확인을 입장연출/에셋 로딩 중에 처리하고 새 전투 DB 쓰기·조회 왕복을 줄였다. 저장 무한대기 방지·취소/재시도 안전성, 기존 도전/보상 계약을 유지했다.
- 최신 main 작업141(장비창 공용 외형·내 정보 통합)을 보존 통합했다. tsc·부분64테스트·diff 통과, Pages 배포 결과는 PR에 기록한다.

## 2026-11-18 · 작업 141 장비창(내 정보) 공용 외형 연동 · 136 UI 레이아웃 통합

- 담당자 `songduckjin`의 작업지시에 따라 `src/ui/equipmentPortrait.ts`를 필드와 같은 공용 계획(`planHeroCostume`, 작업 140)으로 다시 연결했다. 미리보기는 **idle 0프레임**만 그리며, `fit` 좌표 표·`wearableEquipmentImage` 덧그리기·`tightFrame` 픽셀 스캔·`starter` 분기를 제거했다.
- PR #72(`[작업 136]`, Draft)는 직접 병합하지 않고, 그 브랜치를 141에 병합해 UI 레이아웃(`내 정보` 3탭·`statusModal.ts` 삭제·계정 성별 고정·요약+6스탯+장비 10칸+가방)과 `tests/equipment-info.test.mjs`를 통합했다. 최신 `main`의 월드보스 진입 버튼·`worldBoss` 모달과 충돌은 `main` 쪽을 유지하며 해소했다.
- 매니페스트·아틀라스가 없거나 셀이 페이지 밖이면 `warrior_equipped_{starter|t2|t3|t4}_{gender}.png` 전신 초상화로 폴백한다(빈 화면 없음). 매니페스트 실패는 세션 동안 재요청하지 않고, 실패 페이지는 1회만 기록한다. dataURL 캐시는 LRU 24를 유지한다.
- 136의 티어 초상화 6장은 폴백 자산으로 유지하고 142의 참조 0 검사 후 삭제 후보로 넘긴다(`docs/COSTUME_SYSTEM.md` v1.3 §7.3).
- 검증: `npx tsc --noEmit`, 관련 6개 테스트 파일 71건, 전체 `tests/*.test.mjs` 338건, `git diff --check` 통과. `src/game/render/**`·`src/game/store.ts`·`server/**` 무변경 확인.

## 2026-11-18 · fks3997 작업161/162 통합 배포 준비
- 크롬 GPU 미지원 Canvas mesh 경로 복구를 실기 확인했다. 월드보스를 서버 공유HP 1,000만·하루3회·서버전투재현·실순위·참여/순위/막타/공동처치 우편보상으로 활성화했다.
- 다른 작업자 작업140 렌더러 전환을 보존 통합했다. tsc·관련89테스트·Functions컴파일·diff 통과. PR78 핫픽스는 실전 활성화와 묶는 통합 PR로 대체하고, Cloudflare Pages 배포 상태는 해당 PR에 기록한다.

## 2026-11-18 · 작업 139 코스튬 스펙 v1.1 · 런타임 매니페스트·75종 매핑

- 담당자 `songduckjin`의 작업지시에 따라 `src/game/costume/**`(신규, Pixi·DOM 비의존)에 코스튬 런타임 데이터 계층을 구현했다. 매니페스트 타입·스키마 검증·1회 로드 캐시, `items.ts` 고유 장비 이름 **75종** 매핑(55 `costumeId` + 20 명시적 `"none"`), 폴백 4경로(`bodyFallback`+`reason`), 캐시 버스터 URL, 액티브 8종 스킬 템플릿 매핑.
- `docs/COSTUME_SYSTEM.md`를 v1.1로 확정했다 — 파츠 교체 가림·자체 PixiJS 레이어 채택·피벗 `(0,0)`·최대 동작 캔버스 후보(한 손 검 183×213 / 대검 234×242, `estimateCanvas` 계산값)·§3.3 스킬 매핑표·§7.1 런타임 계약. 매니페스트 필드는 §7 7개 그대로다.
- 검증: `npx tsc --noEmit`, `node --test tests/costume-manifest.test.mjs` 14건, `git diff --check` 통과. `render/**`·`appearance.ts`·`store.ts`·`items.ts`·`ui/**`·`server/**`·`public/assets/**` 무변경 확인. 전체 `npm test`·`npm run build`는 실행하지 않았다(공용 계약 무변경).
- PR #76을 `main`에 스쿼시 병합하고 Production `/version.json` 반영을 확인했다. 게임 화면·Save/DB/API는 변하지 않았으며 렌더러 연결은 `[작업 140]`에서 한다.

## 2026-11-18 · 작업 134 필드 통합 바디 및 무기 소켓

- 담당자 `songduckjin`의 작업지시에 따라 남녀 검 없는 서기·걷기 시트 10장으로 갑옷·투구 통합 몸체를 복구하고, 직업·성별·8프레임별 무기 소켓과 공격 시 검 중복 방지, 장착 무기 등급별 검기 색을 적용했다.
- `pnpm exec tsc --noEmit`, 관련 테스트 76개, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #66이 `272c4619924603565a0b765a65ca0026078bb904`로 main에 병합됐다. Cloudflare Pages Production `/version.json`에서 `272c46199246` 확인. 모바일 실기 미확인.

## 2026-11-18 · 작업 133 장비창 완성 착용 이미지
- 사진 속 장비 조합의 남녀 완성 착용 이미지를 제작하고 장비창의 DOM 레이어를 한 장의 렌더링 이미지로 교체했다. 다른 조합은 10개 장비 슬롯의 착용 파츠와 장신구를 몸에 맞춰 그려 메모리에 캐시한다.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(8개), `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #62가 `84a1dd0cd5917bd396f3d9ee9f68ee4acafe4854`로 main에 병합. Production `/version.json` `84a1dd0cd591`, 남녀 이미지 HTTP 200 확인. 모바일 실기 화면 미확인.

## 2026-11-18 · 작업 132 장비창 착용 미리보기 합성 위치 수정
- 실제 장착한 투구·갑옷·검의 크기와 몸 기준 위치를 조정하고, 장갑·신발의 좌우 아트를 분리해 배치했다. 남녀 공통.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(7개), `git diff --check` 통과. PR #60이 `d0389150a528a96a489c50688ebc37750b7468a2`로 main에 병합됐다. Cloudflare Pages Production `/version.json`에서 `d0389150a528` 확인. 모바일 실기 화면 미확인.

## 2026-11-18 · 작업 131 장비창 실제 착용 아이템 미리보기
- 장비창 중앙에 실제 장착한 무기·투구·갑옷·장갑·신발 착용 아트를 표시하고, 기본 본체 성별과 장비 프레임 비율을 유지했다.
- `pnpm exec tsc --noEmit`, `node --test tests/equipped-detail.test.mjs`(7개), `git diff --check` 통과. PR #58이 `39d8cd400cd712e05864f5551891722effa8483c`로 main에 병합됐다. Production `/version.json`은 `39d8cd400cd7`; 착용 아트 5개 파일 모두 HTTP 200 `image/png`.

## 2026-11-18 · 작업 130 전투 추격 중 공격 멈춤 수정
- 자동전투가 기본 공격 사거리 안에서도 추격을 계속해 이동 중 공격 차단에 걸리던 불일치를 수정했다. 적 추격 정지 거리를 89로 조정했으며 드랍 추격과 수동 이동 제약은 유지했다.
- `pnpm exec tsc --noEmit`, 전투·아레나 테스트 9개, `git diff --check` 통과. PR #56이 `90631fcf103c8e93090db63069f354e27923e0eb`로 main에 병합됐다. Pages Preview 배포 성공.

## 2026-11-18 · 작업 129 장착 장비 착용형 아트 제작 · Production 배포
- 검·투구·갑옷·장갑·신발 고유 착용 아트 50프레임을 생성하고, 남녀 idle·이동·공격 중 캐릭터 몸에 부착되도록 렌더링했다. 공백 없는 `낡은가죽두건`도 장비창과 착용 모습에서 정확한 프레임으로 연결된다.
- `pnpm run check`, 258개 테스트, `pnpm run build`, `git diff --check` 통과. PR #54 (`f77b3bc`)를 main 커밋 `efec6056dca698d17988c522830c6a790fb16ee4`로 병합했다. Cloudflare Pages Production의 `/version.json`에서 `efec6056dca6`, 다섯 착용 아트의 HTTP 200 `image/png` 응답을 확인했다.
- Cloudflare Pages Preview는 성공했다. 별도 `Workers Builds: djrpg` 검사는 실패했으나 운영 대상인 Pages Production 배포에는 영향이 없었다. 브라우저·모바일 화면 실기는 미확인이다.

## 2026-11-18 · 작업 128 장착 장비별 캐릭터 외형 적용
- 투구·갑옷·장갑·신발·검의 기존 아이템 아트를 캐릭터 레이어에 연결해 남녀 idle·이동·공격 모션에 유지했다. 별도 이미지 생성은 필요하지 않았다.
- 타입 검사, 256개 테스트, 프로덕션 빌드, `git diff --check` 통과. PR #52를 `a5db0e25387abbb6ef3b94d6c613fa936413d3f7`로 main에 병합했다.
- Cloudflare Pages Production이 `version.json` `a5db0e25387a`와 새 JS 번들을 HTTP 200으로 제공하는 것을 확인했다. 화면 실기 확인은 별도다.

## 2026-11-17 · 작업 62 최신 버전 강제 + 충돌 무한 재로드 차단 배포 결과
- PR #42가 `4491196`으로 main에 병합됐고 Cloudflare Pages Production이 새 `index-Nm1Sohin.js`와 `version.json`(`449119655a16`)을 제공하는 것을 확인했다. `/`와 `/index.html`은 `Cache-Control: no-store, max-age=0`.
- 운영 API 실측: `account`·`market`·`warehouse` 모두 다른 `X-App-Version` 헤더에 `426 VERSION_OUTDATED`(`expected: 449119655a16`), 현재 버전 헤더와 헤더 없는 호출은 `401 INVALID_TOKEN`으로 통과해 인증 단계까지 진행됐다. 브라우저로 `djrpg.pages.dev` 접속 시 로그인 화면까지 정상 부팅(콘솔 오류 없음).

## 2026-11-17 · 작업 61 배포 결과
- PR #40이 `aea1858`로 main에 병합됐다. Cloudflare Pages Production이 새 `index-B134k4CR.js`를 제공하고 새 클라이언트 문구를 포함하는 것을 확인했다.
- 운영 `djrpg.pages.dev`의 `/api/account`·`/api/market`·`/api/warehouse`가 토큰 없이 `401 INVALID_TOKEN`을 반환해 서버 배포와 `session_id` 스키마 마이그레이션이 완료됐음을 확인했다.

## 2026-11-17 · 작업 61 · 단일 기기 로그인 강제 + ITEM/CHARACTER 충돌 자동 복구
- 서버: `djrpg_accounts.session_id` 마이그레이션, `login`/`register`/`guest`마다 새 `sid` 발급→토큰 `{id,sid,exp}`, account·market·warehouse에서 불일치·구 토큰 `401 SESSION_REPLACED`. 편집: `server/database.mjs`, `auth.mjs`, `endpoints/{account,market,warehouse}.mjs`.
- 클라이언트: 401이면 토큰 삭제·저장 정지·안내 후 로그인 복귀, `ITEM_CONFLICT`/`CHARACTER_CONFLICT`이면 최신 세이브 재로드. 편집: `src/game/sync.ts`, `src/main.ts`, `src/ui/login.ts`.
- 테스트: 단일 세션 교체·구 스키마 마이그레이션·충돌 자동 복구·세션 만료 회귀 추가(223건). `npm run check`, `npm test`, `npm run build`, `git diff --check` 통과. 브라우저 실기 미실행.

## 2026-11-17 · 작업 123 · 대검베기 휘두르기 변경
- 대검베기를 단일 흰색 궤적의 `휘두르기`로 변경하고, 2회 타격을 합산 위력 2.15배의 단일 타격으로 정리했다. 발밑 룬을 제거했다.
- `pnpm run check`, 218개 테스트, `pnpm run build`, `git diff --check` 통과. PR #36이 `8811a302a8c91e8ee2e986c3c4c93c40762ffbfa`로 main에 병합됐다. Cloudflare Production에서 HTTP 200과 새 `index-Bm7w5dto.js`, `휘두르기` 문구를 확인했다.

## 2026-11-17 · 작업 123 기본 공격 검기 제거
- `world.action('attack')`의 `slash` 효과는 공격 모션·피드백용으로 유지하고, 렌더러에서 기본 공격 검기 이미지와 발밑 룬만 그리지 않도록 변경했다. 성별·직업별 분기가 없는 공용 효과 경로를 수정했다.
- `pnpm run check`, 213개 테스트, `pnpm run build`, `git diff --check` 통과. 화면 실기는 미확인이다.

## 2026-11-17 · 작업 122 Cloudflare Production 결과
- PR #34 병합 `e82777e8549059ec9d6c4a554b998119b78f354e` 후 `https://djrpg.pages.dev`가 새 `index-DAHH0fS6.js` 번들을 제공하는 것을 확인했다. 화면에서의 겹침 해소는 모바일 실기 미확인이다.

## 2026-11-17 · 작업121~125 통합 배포
- 사용자요청: 캐릭터중복검제거·가방등급순·거래소등록후조회제거/만료범위축소·모바일닫기터치전달방지·캐릭터버튼업적아래통합.
- 최신main e82777e의Cloudflare전환·레벨배지캐릭터진입보존. 타입검사·218개테스트·빌드·diff통과.
- PR통합후Cloudflare Pages운영배포와실제번들확인예정. 폰실기는배포후사용자확인필요.

## 2026-11-17 · PR #31 운영 배포 성공
- 사용자 재시도 요청: PR #31 병합 `6e5b913b7c7d1994662cba3c59eb13eaf7e58bdc`, Vercel Production success 확인.
- 운영 `https://djrpg.vercel.app/`가 새 `index-7bpUNZAJ.js`·`index-CGx-HJ2q.css` 제공 확인. 이전 PR #30 수정과 장비배지 수정 모두 포함.
- 최신캐릭터/공용창고변경보존, 타입검사·209개테스트·빌드통과. 성공기록은추가자동빌드방지를위해로컬보관.
## 2026-11-17 · 작업 122 레벨 배지 캐릭터 선택
- 우측 검 버튼이 편의 메뉴와 겹쳐 이를 제거하고 좌상단 레벨 배지 클릭을 캐릭터 선택으로 연결했다. 계정 정보는 기존 설정 메뉴에서 계속 접근할 수 있다. HUD·UI 연결·스타일만 수정하며 데이터 계약은 변경하지 않는다.
- `pnpm run check`, 213개 테스트, `pnpm run build`, `git diff --check` 통과. 화면 실기 확인은 별도로 진행하지 않았다.

## 2026-11-17 · 작업 121 Cloudflare Production 완료
- 정책 PR #33 병합 `4e4c60878565f4599dbc682c60876f7c520780a5`의 Cloudflare Pages Production 배포 `77e184d4-532e-4999-a74a-6fe886c1366b`가 success였다. Vercel Git 연결은 해제 상태다.

## 2026-11-17 · 작업 121 Cloudflare 단일 배포 정책
- 사용자 요청으로 이중 배포를 중단하고 Cloudflare Pages `djrpg`만 운영 배포 대상으로 정했다. `AGENTS.md`의 배포 보호·인프라 규칙을 갱신한다. 기존 Vercel API·설정 파일은 이번 정책 변경에서 수정하지 않는다.
- 운영 `https://djrpg.pages.dev`에서 임시 신규 계정의 가입·로그인과 저장/불러오기·창고 목록·거래소 목록을 모두 HTTP 200으로 확인했다. 기존 계정 로그인은 서버 불안정 오류가 나며 사용자가 새 계정 사용을 선택했다. Vercel 프로젝트의 GitHub 연결을 해제하고 미연결 상태를 확인해 이후 자동 이중 배포를 중단했다. 프로젝트 자체는 남아 있다.

## 2026-11-17 · 작업 119 Cloudflare Production 결과
- PR #32가 `496819ceb55019470981db31858e993bee76527c`로 `main`에 병합됐고 Cloudflare Pages Production에서 Functions 4개 배포가 성공했다. 운영 API의 메서드 검사 405·존재하지 않는 계정 401, 임시 계정의 가입·로그인·저장·불러오기·창고·거래 조회 200을 확인했다.
- Vercel Production의 동일 병합 배포는 `upgradeToPro=build-rate-limit`으로 실패했다. 기존 계정의 Cloudflare 로그인도 오류가 나 사용자 선택에 따라 새 계정 사용으로 전환한다. Vercel 자동 배포 연결은 남아 있다.

## 2026-11-17 · 작업 119 Cloudflare 연결 확인
- Cloudflare 계정의 기존 `djrpg`는 Pages가 아닌 Worker이며, GitHub `main` 최신 빌드가 pnpm 9의 `packages field missing or empty`로 설치 단계에서 실패했다.
- Pages 전환 브랜치에 `pnpm-workspace.yaml` 루트 패키지 선언을 추가했다. 최신 `main` 통합 후 타입 검사·213개 테스트·프로덕션 빌드 통과; Pages 배포·운영 API 검증은 진행 중이다.
- Cloudflare Pages `djrpg`를 GitHub `main`에 연결하고 `pnpm run build`→`dist`, `NODE_VERSION=24`로 첫 정적 배포에 성공했다. 현재 `main`에는 Pages Functions가 없어 API 전환은 아직 안 됐다. PR #32는 Vercel 빌드 횟수 제한 검사 실패와 병합 불가 상태로 자동 승인 검토에서 병합 거절됐다.
- Pages Preview `task/119-cloudflare-pages`의 빌드·Functions 4개 라우팅 성공. Vercel 운영 DB URL·토큰을 Cloudflare Production/Preview에 암호화 비밀로 등록하고 Preview를 다시 배포했다. `/api/account` GET은 405, 존재하지 않는 계정 로그인은 Turso 조회 후 401 `INVALID_CREDENTIALS` 확인. 실제 계정 로그인·저장·거래·창고와 `main` Functions 배포는 아직 검증하지 않았다.

## 2026-11-17 · 작업 119 Cloudflare Pages 전환 진행
- `origin/main` 5912052에서 작업 브랜치를 시작해 Pages Functions 4개와 공통 API 코어를 연결하고 Vercel 어댑터·설정은 유지했다.
- DB 스키마·JSON·토큰 형식은 유지. 타입 검사·212개 테스트·프로덕션 빌드·Wrangler 번들 통과, 로컬 라우팅 200/405/503 확인.
- 사용자가 무료 플랜을 선택했다. 새 scrypt 비용(2048)은 로컬 Wrangler에서 계산 3~4ms·검증 3~5ms; 기존 계정은 Vercel 서명 로그인으로 1회 검증 후 재해시한다. Vercel 신형 해시 배포와 Cloudflare 계정 연결 전 Production 전환은 보류한다.

## 2026-11-17 · 작업120 배포 재시도
- 최신main5912052의캐릭터선택/공용창고및Cloudflare전환등록보존. 장비배지우상단·미확인장비만집계패치추가.
- 타입검사·209개테스트·빌드·diff통과. PR통합후 Vercel운영상태와번들확인예정.

## 2026-11-17 · PR #24 Preview 검사 제한
- 작업 94 브랜치의 로컬 타입 검사·208개 테스트·프로덕션 빌드·diff 통과. 운영 DB 읽기 전용 사본 검증 완료.
- PR Preview의 Vercel 상태는 `failure` / `upgradeToPro=build-rate-limit`(24시간 재시도 안내). Production 배포와 구분하며, 병합·운영 반영은 별도 확인한다.

## 2026-11-17 · 작업106~118 통합 배포
- 사용자 배포 요청: 보상 완료보너스·8메뉴 정렬·내상태 압축·스킬/스킬북 그림·장착그룹/행압축·장비8글자/가방10열·장착설명잠금·거래소 연결재사용/조회취소 통합.
- 검증 코드 `b661c62`: 타입검사·205개 테스트·프로덕션빌드·diff 통과. 최신 main a87ce48 이후 다른 작업자 변경 없음.
- 기존 계정/아이템/DB·API 형식 유지. PR 통합 후 Vercel Production 상태와 운영 HTML 번들 확인 예정.

## 2026-11-17 · PR #29 운영 배포 성공
- 작업97~105 통합 커밋 `a87ce48fcfff34a6a76b4ede23d27b03f7bab100`, Vercel Production `success` 확인.
- 운영 `https://djrpg.vercel.app/`에서 새 `index-Dv66x0H3.js`·`index-TVsjYXcg.css` 제공 확인. 모아둔 수정 전체 운영 반영.
- 타입 검사·194개 테스트·빌드 통과 코드와 동일. 불필요한 빌드를 줄이기 위해 결과 문서는 로컬 브랜치에 보관.

## 2026-11-17 · 작업 94 운영 DB 백업
- Production Turso 전체 DB 읽기 전용 사본을 Git 제외된 `.backups/`에 생성. 23개 테이블의 원본·사본 행 수, SQLite 무결성·외래 키 확인(계정 3개).
- 사용자가 복원 모의 검사 대신 기존 세이브의 슬롯 1 읽기 확인을 선택. PR #24 병합·Production 배포 후 결과를 별도 기록한다.

## 2026-11-17 · 작업 106 · 협업 승인 자동화 정책
- 사용자 지시로 겹침 작업·핵심 데이터 계약·PR 병합의 사전 승인 대기를 자동 승인으로 변경. 영향 분석·공개 기록·필수 검사·운영 백업 확인은 유지.
- 작업 94 브랜치의 PR #24에 반영 예정. Production 배포 여부는 운영 백업 확인 후 기록.

## 2026-11-17 · 작업 97~105 통합 배포
- 사용자 요청으로 모아둔 장비/가방/거래소/팝업/스킬 표시 수정 통합. 기존 검증 코드 변경 없이 배포.
- 타입 검사·194개 테스트·프로덕션 빌드·diff 통과 버전 `2d897d6`. 원본 아이템/반지 ID·기존 계정 유지, 스킬북 제외 장비40개.
- 원격업로드 1회 후 PR 병합·Vercel Production과 운영 HTML 번들 확인 예정. 브라우저 실기는 미실행.

## 2026-11-17 · 운영 배포 성공
- 사용자 재시도 요청의 PR #28 병합 `84b6570352a48be6fe8426885d91243053f84f46`, Vercel Production `success` 확인.
- `https://djrpg.vercel.app/` HTML이 새 `index-8ETSGQ1o.js`·`index-DIOsXhTy.css`를 제공함을 확인. 작업92~96 운영 반영 완료.
- 게임 코드 추가 변경 없음. 성공 기록은 불필요한 자동 빌드를 줄이기 위해 로컬 문서 브랜치에 보관.

## 2026-11-17 · 작업 96 배포 실패
- 설정·우편·일일/주간 보상·업적 PR #26 병합 완료: `700b8dba3846c301c2ed32e8d4337c0c57932755`. 타입 검사·176개 테스트·빌드 통과.
- Vercel Production `failure` / `upgradeToPro=build-rate-limit`. 운영 HTML은 이전 `index-Dp1RK6nj.js`·`index-Dr2zcSfL.css` 유지, 새 `index-8ETSGQ1o.js` 미반영.
- 작업 93~96 코드는 main에 모두 준비됨. 사용자 재시도 요청으로 이 기록을 PR 반영해 동일 게임 코드의 운영 배포를 재시도함.

## 2026-11-17 · 작업 93~95 통합 배포 시도
- 사용자 배포 요청으로 거래소 30개·한도 안내, 장비창 정렬, 스킬30레벨·책 강화/스킬창 이동·빨간점 통합 반영.
- 검증 버전 `e75ed58`: 타입 검사·165개 테스트·프로덕션 빌드·diff 통과. 코드 변경 없이 업로드·PR 통합/운영 빌드 시도.
- 기존 PR #21 장비·가방 수정 포함. 새 설정·우편함·보상·업적 기능은 기획 단계로 제외. 배포 결과는 PR의 Vercel 상태와 운영 번들로 확인.

## 2026-11-17 · PR #21 운영 배포 실패
- 사용자 배포 요청으로 PR #21 병합 완료: `c6c07296b482666fc8f1396d2e159f1e3c2ee97c`.
- 타입 검사·158개 테스트·빌드 통과 버전이나, Vercel Production도 `failure` / `upgradeToPro=build-rate-limit`으로 배포 차단.
- 운영 HTML은 이전 번들 `index-Dp1RK6nj.js` / `index-Dr2zcSfL.css` 유지. 제한 해제 후 위 검증 버전 재배포 필요.

## 2026-11-17 · 작업 91 · fks3997
- 장착 칸 그림 27→44px, 왼쪽 위 부위·오른쪽 이름, 기존 등급 테두리 유지. 작은 화면은 장비창 스크롤 제공.
- 호버/포커스/터치 상세, 바깥 클릭 종료, 명시적 장착 해제. 가방 가득 참·잠금 보존 회귀 검증.
- 타입 검사·145개 테스트·빌드·diff 검사 통과. 브라우저 실기 미실행, PR 검토 대기.

## 2026-11-17 · 작업 90
- `src/game/world.ts`, `src/game/items.ts`: 층 상승 몹 정리·드랍 보존, 보통 난이도 체력/피해·드랍 곡선 조정.
- `src/game/offline.ts`, `src/ui/modals/offlineModal.ts`: 스킬북·보스 보상 및 아이템 안내 반영.
- `src/game/sync.ts`, 관련 테스트: 진행 중 저장 완료 후 거래 스냅샷·요청, 저장 실패 시 거래 차단 검증.
- 검증: `pnpm run check`, 151개 테스트, `pnpm run build` 통과.

## 2026-11-17 · 작업 89
- `ambientMotion.ts`: 축소된 화면에서 거의 보이지 않던 풀 좌우 흔들림 강도·주기 보정. 320px 화면 메시 풀 끝 왕복 약 1~1.5px→3.7~6px, 뿌리/불 효과 유지.
- `tests/ambient-motion.test.mjs`: 실제 정점의 모바일 화면 변위·큰 변형의 삼각형 뒤집힘 방지 회귀 추가.
- 검증: 타입 검사·143개 테스트·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-17 · 작업 88
- `src/main.ts`, `src/ui/boot.ts`, `src/styles/boot.css`: 로그인 후 로딩 오버레이와 초기화 오류·새로고침 표시.
- `src/game/render.ts`, `src/game/wasteland.ts`, `src/game/bootProgress.ts`: 고유 텍스처별 진행률과 배경 로딩 완료 집계.
- `tests/boot-progress.test.mjs`: 중복 로드·완료 수·100% 도달 검증. `pnpm run check`, 141개 테스트, `pnpm run build` 통과.

## 2026-11-17 · 에셋 경량화
- `public/assets/`: 104개 파일 재인코딩(RGBA→256색 팔레트 + 시트 등분 유지 축소)로 71.69MB → 3.80MB(94.7% 절감).
- 미사용 36개 파일 삭제(개별 프레임 walk/attack, `item-locks` v1·v2, `nav_*` v1, `dungeon_tile.jpg`, `fx_dragon_twister.png`).
- `scripts/verify-item-art.mjs`: item-art 시트 규격 2172x724 → 870x290(5칸 유지).
- 검증: `npm test` 139건, `npm run build` 통과. 파일명·확장자·치수 의존 코드 변경 없음.

## 2026-11-17 · 작업 87
- `src/game/wasteland.ts`, `src/game/render.ts`, `src/game/render/field.ts`, `src/game/ambientScene.ts`: 이동에 따른 황야 배경 이동과 모닥불 조명·불티 정렬.
- `tests/wasteland.test.mjs`, `tests/ambient-motion.test.mjs`: 화면 경계·배경 효과 동기화 검증.
- 검증: `pnpm run check`, 139개 테스트, `pnpm run build` 통과. Vercel 배포 `success`로 작업 85 배포 보류도 해소.

## 2026-11-16 · 작업 86
- `src/game/world.ts`: 적/드랍 추적 시작·정지 거리 분리, 목표 전환·층 이동 시 추적 상태 초기화.
- `tests/world-movement.test.mjs`: 가까운 적·짧은 넉백 제자리걸음 방지와 먼 드랍 수집 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 138건, `pnpm run build` 통과.

## 2026-11-16 · 작업 85
- 배포 보류: PR #17 병합 후 Vercel 빌드 횟수 제한(24시간 후 재시도). Production에 새 효과 미반영, 제한 해제 후 재배포 필요.
- `wasteland.ts`, `ambientMotion.ts`, `ambientScene.ts`: 원본 배경 픽셀을 재사용하는 국소 풀/불꽃 변형·불티·빛 일렁임, 30Hz 갱신·감소 모션·리사이즈/정리 지원.
- 검증: 고정 영역/뿌리·변위 한계·프레임 독립성·실제 Pixi 레이어/리사이즈/중복 방지/정리 포함 136건, 타입 검사·빌드·diff 검사 통과.
- 작업 75의 카메라·이동 경계 변경 통합, 진행 중 작업 86 파일 수정 없음. 브라우저 실기 미실행.

## 2026-11-16 · 작업 75
- `src/game/arena.ts`, `render.ts`, `render/entities.ts`: 고정 아레나 투영과 캐릭터·룬·비네팅·오라 위치 동기화.
- `src/game/world.ts`: 플레이어·몬스터 경계 제한, 가장자리 스폰 및 넉백 보정.
- `tests/arena.test.mjs`, `world-movement.test.mjs`: 화면 이동·경계·속도 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 130건, `pnpm run build` 통과.

## 2026-11-16 · 작업 84
- `hud.css`: 원 크기·큰 원 위치 유지, 인접 원 테두리 간격 17.6~18.5px로 통일해 작은 원을 큰 원에 가깝게 이동.
- `modals.css`: 가방 max-content 행·칸 최소 64px·5px 간격·필터 축소 방지·세로 스크롤/스크롤바 여백 적용.
- 검증: 간격 계산·타입 검사·127개 테스트·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 83
- `equipModal.ts`, `modals.css`: 가방 잠긴 장비 우측 상단에 작은 자물쇠 배지, 잠금 해제 시 제거·그리드 배열 유지.
- `hud.css`: 부채꼴 영역 160→180px·작은 스킬 중심 간격 확대, 기본 공격 위치와 좁은 화면 메뉴 분리 유지.
- 검증: 잠금/해제·품목 수 유지 포함 127건, 타입 검사·빌드·diff 검사 통과. 사용자 확인에 따라 몬스터 수정 제외, 작업 75 파일·브라우저 실기 미실행.

## 2026-11-16 · 작업 82
- `hud.css`, UI HUD/interface·skillArtwork·field-skills 에셋: 기본 공격 80px·스킬 50px 부채꼴, 좁은 화면 메뉴 위로 이동, 빈 슬롯·알림·선택 흐름 유지.
- `skillFeedback.ts`: 전투 효과를 읽어 자동/수동 실제 발동만 윤곽·문양 강조, 기본 공격 약한 강조, 재발동 교체·감소 모션 지원. 월드/렌더 수정 없음.
- 검증: 자동/수동·잘못된 재사용·지속효과 중복 방지·빈 슬롯·감소 모션 포함 126건, 타입 검사·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-16 · 작업 81
- `hud.css`: 승인된 기존 저울 이미지·42px 크기 유지, 거래소만 불투명 표시와 흐린 그림자 제거. 사용자가 거절한 새 형태는 적용하지 않음.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. 나머지 메뉴/작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 80
- `src/ui/interface.ts`, `public/assets/icons/nav_*_v2.png`: 승인한 상태/장비/스킬/거래소 4개 아이콘을 128×128·같은 여백으로 적용, 새 경로로 캐시 갱신.
- 검증: 선택 원본과 파일 일치·128×128 RGBA·타입 검사·119개 테스트·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 79
- `modals.css`, `item-locks-v3.png`: 소수점 CSS 그림자 제거, 잠긴 상태 연속 금빛 테두리를 이미지에 포함·표면 정리, 설명 아이콘 30→34px·새 캐시 경로 적용.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. PNG RGBA·투명 이미지 확인, 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 78
- `src/styles/modals.css`: 잠긴 자물쇠 이미지 실루엣에 얇은 금빛 윤곽 적용, 열린 상태·글자·버튼 배경 유지.
- 검증: 타입 검사·119개 테스트·빌드·diff 검사 통과. 진행 중 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 77
- `src/styles/modals.css`: 자물쇠 버튼 기본/잠금 상태 배경·테두리 제거, 기존 터치 영역·키보드 포커스 유지.
- `public/assets/icons/item-locks-v2.png`: 정상 U자 고리를 더 높이 들어 옆으로 돌린 열린 상태로 교체, 새 경로로 캐시 갱신.
- 검증: 타입 검사·기존 119개 테스트·빌드·diff 검사 통과. 진행 중 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 76
- 마지막 금화·어두운 청동 2.5D 잠금/열림 아이콘 적용, 금화 단위·재화 UI 통일, 대검 베기 아래 장착 슬롯순 정렬, 판매 분류/등급 필터·등급색, 매물 검색 필터 단순화·선택 옵션 내림차순 추가.
- 장비 잠금 저장/복원·모든 분해 경로 제외·판매 해제 확인 및 서버 원자적 등록, 설명 내용 너비로 축소, 닫기 누르는 순간 처리·44px 터치 영역.
- 검증: 잠금 복원/분해/취소·승인/중복 등록·필터/정렬/설명 위치/닫기 포함 119건, 타입 검사·빌드·diff 검사 통과. 작업 75 파일 수정·브라우저 실기 미실행.

## 2026-11-16 · 작업 73
- 거래소 구매가격 안내 줄 제거·착용 장비 이미지/이름/등급 추가. 소유권 읽기/쓰기를 거래 배치에 합쳐 장비 변경 거래 DB 배치 4→2회.
- `sync.ts`, `main.ts`: 사냥 변경 저장을 1초 단위로 묶고 거래가 대기 저장을 흡수, 화면 이탈 명시 저장 유지. 금화 2.5D 시안 생성·수정(아이콘 교체 미적용).
- 검증: 중복 거래·소유권·실패 롤백·DB 왕복·저장 병합 포함 109건, 타입 검사·빌드·diff 검사 통과. 작업 74의 보행/속도 변경 유지, 실기 지연 미측정.

## 2026-11-16 · 작업 74
- `src/game/world.ts`: 몬스터 접근 속도 상한 적용(일반 최대 64, 보스 28).
- `src/game/render/entities.ts`, `heroMotion.ts`: 이동 중 보행 프레임을 공격 이미지보다 우선 표시.
- `tests/hero-motion.test.mjs`, `world-movement.test.mjs`: 남녀 장비 조합·고층 속도 검사.
- 검증: `pnpm run check`, `pnpm test` 104건, `pnpm run build` 통과.

## 2026-11-16 · 작업 72
- `src/game/loadout.ts`, `src/ui/modals/skillModal.ts`: 장착 스킬 해제 버튼·슬롯 초기화·오류 안내 추가.
- `tests/loadout.test.mjs`, `skill-ui.test.mjs`: 해제·재장착·저장 복원·버튼 저장 호출 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 95건, `pnpm run build` 통과.

## 2026-11-16 · 작업 70
- 도감 부위 버튼 제거·6등급 오름차순 정렬·등급 수 안내 수정. 거래소 현재/구매/증감 비교표 및 조건 초기화 전체 너비 적용.
- 팝업 재진입 시 필터·선택·스크롤 기본값 복원, 가방 상세를 배열 밖 오버레이로 표시·선택 강조·바깥 클릭 닫기.
- 검증: 비교·정렬·팝업 복원·오래된 응답 차단·오버레이 위치 포함 테스트 92건, 타입 검사·빌드·diff 검사 통과. 브라우저 실기 미실행.

## 2026-11-16 · 작업 71
- `src/game/render/entities.ts`, `heroMotion.ts`: 무기 없는 스킬의 캐릭터 회전·눌림·앵커 왜곡 제거, 돌진·VFX 유지.
- `tests/hero-motion.test.mjs`: 남녀 투구 단독·무기 착용 스킬 동작 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 84건, `pnpm run build` 통과.

## 2026-11-16 · 작업 68
- `src/game/items.ts`, `codex.ts`, `inventory.ts`: 6등급 드랍·스탯·도감·분해 공통 규칙 적용.
- `server/database.mjs`, `market.mjs`, 장비·도감·거래소 스타일·필드 VFX: 새 등급 저장·검색·색상 적용.
- `tests/codex.test.mjs`, `market.test.mjs`: 6등급 생성·저장 호환·거래소 검증.
- 검증: `pnpm run check`, `pnpm test` 82건, `pnpm run build` 통과.

## 2026-11-16 · 작업 69
- `src/game/appearance.ts`, `src/game/render/entities.ts`: 무기 없는 공격·스킬에서 검 공격 시트 대신 현재 장비 외형 유지.
- `tests/appearance.test.mjs`: 남녀·투구·갑옷 무기 없는 조합과 무기 착용 공격 분기 확인.
- 검증: `pnpm run check`, `pnpm test`, `pnpm run build` 통과.

## 2026-11-16 · 작업 67
- `public/assets/wasteland-scene.png`, `src/game/wasteland.ts`, `render/field.ts`, `main.ts`: 선택한 세로 배경 적용, 기존 무작위 장식 제거, 모닥불 3곳에 화면 비례 조명 정렬.
- `src/ui/modals/equipModal.ts`, `codexModal.ts`, `interface.ts`, `src/game/codex.ts`, 관련 스타일: 스킬북 버튼 테마·장비 문구·부위 탭·중앙 등급 필터·등급별 테두리.
- 검증: 배경 크기/조명 정렬·등급 필터 포함 66건, 타입 검사·빌드·`git diff --check` 통과. 진행 중인 작업 66 파일은 수정하지 않음.

## 2026-11-16 · 작업 66
- `public/assets/warrior_female_helm_attack.png`, `warrior_female_oldhelm_attack.png`, `warrior_male_helm_attack.png`: 투구 단독 착용 공격 시트를 보행 2행에서 공격 1행 4프레임으로 교체.
- `src/game/render.ts`: 교체 이미지 캐시 갱신; 기존 `src/game/appearance.ts`의 남녀 투구 단독 외형 연결 확인.
- `tests/hero-art.test.mjs`: 공격 시트 6종의 4×1 비율 검사 추가.
- 검증: `pnpm run check`, `pnpm test` 68건, `pnpm run build` 통과.

## 2026-11-16 · 작업 65
- `public/assets/warrior_male_*_helm.png`, `walk8_male_*_helm.png`, `warrior_male_helm_attack.png`: 남성 투구 단독 정지·보행·공격 이미지 5개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`: 남성 갑옷·투구 독립 조합 외형 연결, 여성 분기 유지.
- `tests/appearance.test.mjs`: 남녀 투구 단독·갑옷 동시·개별 해제 회귀 검사.
- 검증: 최신 main 통합 후 `pnpm run check`, `pnpm test` 62건, `pnpm run build`, 성별 분기 `rg`, `git diff --check` 통과.

## 2026-11-16 · PR #4 최신 main 통합 및 배포 검증
- `docs/TASK.md`, `WORKLOG.md`, `src/styles/modals.css`: 충돌 해결, 본 작업 번호 61~64로 정리; 외부 남녀 투구·회화형 메뉴·잔상 수정 유지.
- 검증: 성별 분기 확인, 회귀 62건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 64
- `src/game/codex.ts`, `src/ui/modals/codexModal.ts`, `src/styles/codex.css`, `interface.ts`: 장비 제목 옆 도감, 기본 장비 75종·검색·부위/발견/보유 필터·그림·등급별 등장 층/옵션 상세·고정 닫기 행.
- `src/game/store.ts`, `api/account.mjs`, `server/database.mjs`: 현재 가방/착용 장비 발견 이관, 분해/판매 후 발견 기록 유지, 이전 클라이언트 저장 시 이력 보존 및 명시적 초기화 처리.
- 검증: 실제 드랍식 대조를 포함한 회귀 58건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과. 브라우저 실기 검증 미실행.

## 2026-11-16 · 작업 61~63
- `src/game/inventory.ts`, `src/ui/modals/salvageModal.ts`, `equipModal.ts`: 기본 일반 분해·빈 장착 부위 분해 확인/취소·가능한 자동 장착 활성화.
- `src/game/loadout.ts`, `store.ts`, `world.ts`, `src/ui/skillLoadout.ts`, `hud.ts`, `skillModal.ts`: 빈 슬롯 저장 호환, 필드 +/빨간 알림·스킬 장착/교체 선택 효과, 슬롯 번호 버튼 제거.
- `src/game/facing.ts`, `render/entities.ts`, `src/styles/`, `src/ui/interface.ts`: 몬스터/보스 원본 왼쪽 시선 보정, 스킬·거래소 닫기 행과 거래소 탭 고정.
- 검증: 회귀 49건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과; 브라우저 실기 검증 미실행.

## 2026-11-16 · 작업 60
- `src/game/appearance.ts`: 남성 갑옷+투구에 기존 일체형 정지·보행·공격·초상화 연결, 여성 분기 유지.
- `src/game/render/entities.ts`, `src/ui/modals/equipModal.ts`, `src/styles/modals.css`: 남녀 투구 2D 덧그리기 제거.
- `tests/appearance.test.mjs`: 남녀 갑옷·투구 조합과 남성 무갑옷 동작 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 34건, `pnpm run build`, 성별 분기 `rg`, `git diff --check` 통과.

## 2026-11-16 · 작업 59
- `public/assets/*oldhelm*.png`: 낡은 투구 아이콘과 같은 검은 뿔투구를 착용한 여성 정지·보행·공격 이미지 8개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`: `낡은 투구` 장착 시에만 전용 외형 선택, 다른 투구·해제 시 기존 외형 복귀.
- `tests/appearance.test.mjs`: 갑옷·평상복·무기 유무 및 투구 교체·해제 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 33건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 58
- `public/assets/warrior_female_*_helm*.png`, `walk8_female_*_helm.png`: 여성 평상복·갑옷의 투구 착용 정지·보행·공격 일체형 이미지 8개 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `src/ui/modals/equipModal.ts`: 여성 투구 착용 시 일체형 이미지 선택, 투구 아이콘 중복 표시 제거.
- `src/styles/modals.css`, `tests/appearance.test.mjs`: 이전 여성 투구 겹침 스타일 제거 및 착용·해제 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 32건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 57
- `src/game/appearance.ts`, `src/game/render/entities.ts`: 여성 갑옷 정지·보행·공격 자세별 머리 위치에 투구 그림 배치.
- `src/ui/modals/equipModal.ts`, `src/styles/modals.css`: 장비창 초상화와 투구를 같은 크기 기준으로 겹쳐 표시.
- `tests/appearance.test.mjs`: 여성 투구 위치·갑옷 해제 후 투구 유지 회귀 검사.
- 검증: `pnpm run check`, `pnpm test` 32건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 54·55
- `server/`, `src/game/market.ts`, `sync.ts`, `api/market-events.mjs`: 저장+거래 단일 요청·DB 배치·읽기 조회·스키마 재사용, 응답 즉시 상태/수령함 반영 및 1초 스트림·2초 조회.
- `src/game/appearance.ts`, `render/entities.ts`, `src/ui/modals/equipModal.ts`: 몸체와 투구 외형 분리, 갑옷·투구 독립 해제와 저장 유지.
- `public/assets/wasteland-*.png`, `src/game/render.ts`, `render/field.ts`: 시안 1번의 황야 바닥·회화 장식 6종 적용, 장식 스프라이트 재사용.
- 검증: 회귀 30건, `pnpm run check`, `pnpm run build`, `git diff --check` 통과; 운영 체감 지연·모바일 화면은 미측정.

## 2026-11-16 · 작업 53
- `src/styles/hud.css`: 하단 메뉴 4개의 배경·아이콘 반투명 처리, 테두리·그림자 제거.
- `src/ui/interface.ts`: 거래소를 금빛 선 저울 아이콘으로 교체.
- 검증: `pnpm run check`, `pnpm test` 17건, `pnpm run build`, `git diff --check` 통과.

## 2026-11-16 · 작업 52
- `server/`, `api/market*.mjs`, `api/account.mjs`: 공용 매물·검색·판매 기록·수령함, 원자적 거래·소유권 원장·revision·중복 요청 복구·실시간 변경 스트림.
- `src/game/market.ts`, `sync.ts`, `src/ui/modals/marketModal.ts`: 5개 거래소 탭, 필터·장비 비교·등록/구매/취소/수령·알림·재연결; 상단 체력바와 필드 위 금빛 메뉴 4개 적용.
- `tests/`, `docs/MARKET.md`: 17개 거래/동시 구매/가방 포화/충돌/응답 유실 테스트 통과; 기존 사냥 보상 신뢰 한계 기록; `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 51
- `public/assets/item-art/`: 붉은보석 분위기를 참고한 검·방어구·장신구 75종의 고유 회화 그림 15개 시트 제작.
- `src/game/items.ts`, `src/ui/modals/equipModal.ts`, `src/game/render/entities.ts`, `src/styles/modals.css`: 이름별 그림을 가방·장비창·전투 장착 외형에 연결.
- 도형식 SVG 에셋 150개와 생성 스크립트 제거; `scripts/verify-item-art.mjs`, `package.json`에 그림 누락 빌드 검사 추가.
- 검증: 75칸 투명도·내용, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 50
- `public/assets/equipment/`, `scripts/generate-item-icons.mjs`: 장비 기본형 75종의 투명 전투용 SVG 이미지 생성.
- `src/game/items.ts`, `src/game/store.ts`, `src/ui/modals/equipModal.ts`: 장비 이미지 경로 공통화와 장비창 아이콘 연결 유지.
- `src/game/render.ts`, `src/game/render/entities.ts`: 공격·보행·정지 캐릭터에 착용 장비 이미지 합성 및 장비 교체 시 갱신.
- 검증: SVG 75개 XML 확인, 빌드 산출물 75개 포함, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 49
- `public/assets/icons/items/`: 검 10종을 포함한 장비 기본형 75종 전용 SVG 아이콘 생성.
- `scripts/generate-item-icons.mjs`, `package.json`: 아이템 목록 기반 아이콘 재생성 명령 추가.
- `src/game/store.ts`, `src/ui/modals/equipModal.ts`: 가방·장비창에 이름별 아이콘 연결, 기존 아이템은 기본 아이콘으로 대체.
- 검증: SVG 75개 XML 확인, 빌드 산출물 75개 포함, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 48
- `src/game/render/entities.ts`: 정지 상태 발 위치와 바닥 그림자 크기 보정.
- `public/assets/icons/`, `src/ui/modals/equipModal.ts`: 장비창 10개 슬롯과 특수 두손검 아이콘 파일·표시 경로 확인.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 47
- `public/assets/walk8_*.png`: 전사 외형 6종과 해골·보스의 투명 8프레임 보행 시트 제작.
- `src/game/render.ts`, `src/game/render/entities.ts`: 시트 프레임 로딩, 이동 거리 기반 보행 주기와 프레임별 발 위치 정렬 적용.
- 검증: 시트 8개 크기·투명도, `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 46
- `src/game/render.ts`, `src/game/render/entities.ts`: 전사·몬스터·잔상 앵커를 .97로 조정하고 그림자를 발밑에 정렬.
- 보행 바운스 제거; `slam`·`hell`의 점프 연출은 유지.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 45
- `src/game/world.ts`, `src/game/skills.ts`: MP 상태·소모 조건·스킬 비용 데이터 제거; 스킬은 쿨타임으로 발동.
- `src/ui/`, `src/styles/`: MP 구슬과 장비·스킬 설명의 마나 표시 제거.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-16 · 작업 44
- `src/game/render.ts`: 사막 타일 URL 캐시 버스터 v2, 바닥 틴트 흰색·불투명도 1 고정.
- `src/game/render/field.ts`: 7겹 비네팅 각 겹의 불투명도를 .04에서 .015로 완화.
- 검증: `pnpm run build` 성공 (TypeScript 검사 포함).

## 2026-11-16 · 작업 42–43
- 조이스틱·AUTO 토글·키보드 이동을 제거하고 자동 추적·전투·루팅을 상시 활성화.
- 스킬북 드랍·가방 보관·사용을 추가하고 습득/강화를 스킬북으로 전환; 기존 스킬 세이브 호환 유지.
- 일괄 분해에서 스킬북 보호, 스킬북 전용 필터·아이콘 추가.
- 검증: `pnpm run check`, `pnpm run build` 성공 (TypeScript 0건).

## 2026-11-15 · 작업 41
- `src/game/items.ts`: 무기·방어구 슬롯별 10종, 장신구 계열별 5종 베이스와 층·등급별 Tier 스탯 보정 추가.
- `src/game/items.ts`: 새·기존 장비 이름 보존, 구형 쯔바이핸드 표기 호환 유지.
- 검증: 슬롯별 종류·상위 Tier 드랍·세이브 이름 검사, TypeScript 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 40
- `src/game/world.ts`: 좌우 시선 판정을 아이소메트릭 화면 X(`dx - dy`)로 통일하고 자동 이동 시 실제 드랍/적 목표를 바라보도록 수정.
- 검증: 자동 이동·드랍 획득·수동 이동 시선 로직 검사, TypeScript 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 39
- `src/game/store.ts`, `src/game/world.ts`, `src/game/items.ts`: 30레벨 상한·SP 지급/소모·구형 세이브 보정·층별 드랍률 적용.
- `api/account.mjs`, `src/game/offline.ts`, `src/main.ts`: 서버 경과 시간 기준 12시간 이내 오프라인 사냥 정산·즉시 저장.
- `src/ui/`, `src/styles/modals.css`, `AGENTS.md`: MAX/SP 표시와 오프라인 보상 팝업. 로직 검사·API 문법·TypeScript·Vite 빌드 통과.

## 2026-11-15 · 작업 38
- `src/ui/interface.ts`, `src/ui/hud.ts`, `src/ui/modals/`: HUD·장비·스킬·상태·층·계정 UI 분리.
- `src/game/render.ts`, `src/game/render/`, `src/game/store.ts`, `src/game/items.ts`: 렌더링·아이템 처리 모듈 분리 및 저장 형식 유지.
- `src/styles/`, `AGENTS.md`: 스타일 분리와 작업 지도 갱신. 이동 메서드·CSS 규칙 일치, TypeScript 검사·Vite 빌드 통과.

## 2026-11-15 · 작업 37
- `src/game/world.ts`, `src/game/render.ts`: 자동사냥 타깃·수동 이동 방향에 맞춰 캐릭터 좌우 반전 동기화, 4px 떨림 방지 및 정지 공격 시 타깃 응시.
- 검증: TypeScript 타입 검사(`tsc --noEmit`)와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 35·36
- `src/game/store.ts`, `src/game/world.ts`, `api/account.mjs`: 최고 층·자동 등반 저장과 호환 이관, 층 이동·반복 사냥, 쯔바이핸드 드랍·능력치 추가.
- `src/ui/interface.ts`, `src/styles/main.css`: 층 선택 팝업과 장비·가방 전용 아이콘 연결.
- 검증: 저장 이관·층 이동·잠금·반복·등반·구형 무기명 로직 검사, TypeScript 타입 검사와 Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 34
- `src/game/skills.ts`, `src/game/render.ts`, `src/game/world.ts`: 드래곤 중심 출발→확장→수축 승천 궤도와 단계별 타격 반경 동기화.
- `src/styles/main.css`: 하단 상태·장비·스킬 아이콘 테두리 제거 및 왼쪽 정렬.
- 검증: 궤도·타격 시점 로직 검사, `pnpm run check`와 `pnpm run build` 성공.

## 2026-11-15 · 작업 33
- `src/ui/interface.ts`, `src/styles/main.css`: 하단 3개 아이콘 메뉴 축소, 전투 맵 높이 확대, 층별 처치 진행도 표시.
- `src/game/store.ts`, `src/game/world.ts`, `api/account.mjs`: 느린 레벨 성장, 층별 처치 목표·적 강화·기존 세이브 이행.
- `src/game/skills.ts`, `src/game/render.ts`: 2단 내려치기, 딜레이 크러싱, 굵어진 용의 축소 나선·승천 연출.
- 검증: `pnpm run check`, `pnpm run build`, 성장·보스·지연 타격 로직 검증 통과.

## 2026-11-15 · 작업 32
- `api/account.mjs`, `package.json`, `pnpm-lock.yaml`, `vercel.json`: Turso 계정 API, 토큰 인증, 비밀번호 해시, 서버 저장/초기화.
- `src/game/store.ts`, `src/ui/login.ts`, `src/main.ts`, `src/ui/interface.ts`: 서버 전용 세이브, 5초·이벤트 저장, 기존 로컬 데이터 이전.
- 검증: API 가입·로그인·저장·불러오기·초기화·오류 응답, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 31
- `src/ui/login.ts`, `src/styles/main.css`: 로그인·회원가입·게스트 화면과 기기 내 비밀번호 해시 인증.
- `src/game/store.ts`, `src/main.ts`, `src/ui/interface.ts`: 계정별 세이브, 구버전 게스트 이전·로그아웃·계정별 초기화.
- 검증: 계정 분리·비밀번호·이전 사례, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 30
- `src/game/render.ts`, `index.html`, `src/main.ts`: 황야 바닥 원색·오브젝트·문구 적용, 비네팅 완화.
- `src/game/store.ts`: 누락·손상된 세이브 필드와 장비를 안전하게 정리해 기존 진행 데이터 유지.
- 검증: 구버전·손상 세이브 사례, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 29
- `src/game/render.ts`: 용 머리·몸통 텍스처로 궤도 비행, 레벨별 6~24마디·깊이·꼬리 흔들림 적용.
- `src/game/skills.ts`: 드래곤 트위스터 범위를 용 궤도에 맞게 확대.
- 검증: 이미지 파일, TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 28
- `src/ui/interface.ts`: 분해 등급 네이티브 선택창을 저장 가능한 3단계 순환 버튼으로 교체.
- `src/styles/main.css`: 가방 그리드 내부 스크롤·푸터 고정 및 상단 토스트 배치.
- 검증: TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 26·27
- `src/game/render.ts`: 바닥·오브젝트 밝기와 원형 시야 완화, 드래곤 트위스터 감속·지속 VFX.
- `src/game/store.ts`, `skills.ts`, `world.ts`, `src/ui/interface.ts`, `src/styles/main.css`: 스킬 레벨 저장·강화·전투 성장·표시.
- 검증: 기존 세이브 변환·주기 타격 확인, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 23~25
- `src/game/render.ts`: 투구 없는 갑옷 세트, 초대형 용 이펙트, 원형 시야·필드 오브젝트.
- `src/ui/interface.ts`, `src/styles/main.css`: 외형 분기, 아이템 아이콘과 장비·가방 레이아웃 개선.
- 검증: 9개 아이콘·8개 애니메이션 프레임 확인, TypeScript 검사·Vite 빌드 성공.

## 2026-11-15 · 작업 17~22
- `src/game/render.ts`, `world.ts`: 전사·해골·보스 4프레임 보행/공격, 발 정렬·크기·런지·넉백 조정.
- `src/game/render.ts`, `skills.ts`, `src/ui/interface.ts`, `src/styles/main.css`: 스킬별 대형 VFX와 아이콘·색상 구분.
- 검증: 32개 프레임·3개 전용 VFX 파일 확인, TypeScript 검사·Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 15·16
- `src/styles/main.css`: 공격·스킬 버튼 축소 및 우측 하단 정렬, AUTO 버튼 위치 조정.
- `src/game/render.ts`: 4종 VFX 스프라이트 로드·가산 블렌딩·회전/확대/페이드 적용.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 13·14
- `src/game/store.ts`: 장비 점수·10칸 자동 장착, 등급별 일괄 분해 및 보상 계산.
- `src/ui/interface.ts`, `src/styles/main.css`: 자동 장착 버튼과 분해 등급 선택·저장·결과 안내.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 12
- `src/game/world.ts`: 일반 0.5%, 보스 12% 드랍률 적용; 튜토리얼 확정 드랍 유지.
- `src/game/store.ts`: 일반·보스별 희귀도 확률을 지시된 비중으로 조정.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 11
- `src/game/world.ts`, `render.ts`: 공격 직후 0.22초간 남녀·갑옷별 두손검 공격 포즈 적용.
- `src/game/store.ts`, `src/ui/interface.ts`: 무기 등급별 이름과 튜토리얼 문구 통일, 기존 저장 장비 이름 변환.
- 검증: TypeScript 타입 검사, Vite 프로덕션 빌드 성공.

## 2026-11-15 · 작업 10
- `src/game/skills.ts`, `store.ts`: 테스트 전체 해금 플래그, 7 액티브·3 패시브, 습득·퀵슬롯 저장 호환.
- `src/game/world.ts`, `render.ts`, `src/ui/interface.ts`: 신규 스킬 전투·이펙트, 3슬롯 장착/교체 및 AUTO 연계.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 9
- `src/game/store.ts`: 두손검·문장 장비 명칭과 상위 대검 계열 드랍 이름 정리.
- `src/game/world.ts`, `render.ts`, `src/ui/interface.ts`: 대검 베기·드래곤 트위스터·와일드 스탬프·블러드 레이지 적용.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 8
- `src/game/render.ts`, `src/ui/interface.ts`: 남녀 검 장착 스프라이트 적용, 막대기 검 제거.
- `src/game/render.ts`, `src/game/world.ts`: 잔상·교대 스윙·3중 검기·타격 스파크/숫자·걷기 탄성·사망 페이드 구현.
- 검증: `pnpm run check`, `pnpm run build` 성공; 신규 검 이미지 2종 빌드 포함 확인.

## 2026-11-15 · 작업 7
- `src/ui/interface.ts`, `src/styles/main.css`: 중앙 전사 쇼케이스와 좌우 10슬롯, 전투력·HP·MP 요약.
- 가방 전체/무기/방어구/장신구 필터, 정사각 슬롯, 장착 장비 비교·분해 유지.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 6
- `src/game/render.ts`: 화면 비율에 맞춘 캐릭터 스케일, 지형 장식·마법진·보스 이름/HP 바.
- `src/game/store.ts`, `world.ts`: 갑옷 전용 외형 전환·맨몸 검 표시, 일반 4%/보스 42% 드랍과 등급 희소화.
- `src/styles/main.css`: 하단 바와 HP/MP 프레임을 철제·금빛 스타일로 조정.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 5
- `src/ui/interface.ts`, `src/styles/main.css`: 전투 화면 확장, 좌측 LV 배지, 장비 팝업에 가방·분해 통합과 신규 아이템 배지.
- `src/game/render.ts`: 새 에셋 선형 보간, 전사·해골 크기 축소, 횃불 도형 제거 및 걷기·공격·스킬·피격·사망 연출.
- `src/game/world.ts`: 피격 넉백을 시간에 따라 이동시키고 사망 파티클 이벤트 추가.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 4
- `src/game/store.ts`, `world.ts`: 계정 이름·ID 저장 및 레벨당 `800 × level^2.1` 경험치 곡선 적용.
- `src/ui/interface.ts`, `src/styles/main.css`: 원형 LV 배지·경험치 링, 계정 팝업, 이름/성별 변경·초기화 확인.
- `src/main.ts`: 초기화 중 자동 저장 재생성 방지; 작업 3의 수동 이동 시 AUTO OFF 규칙 반영.
- 검증: `pnpm run check`, `pnpm run build` 성공.

## 2026-11-15 · 작업 3
- `src/game/render.ts`: 던전 타일·전사·해골 스프라이트와 그림자·방향/피격 모션 적용.
- `src/game/world.ts`, `store.ts`: 기본 ON 자동사냥, 드랍 우선 추적, 수동 이동 시 AUTO OFF, 설정 저장.
- `src/ui/interface.ts`, `src/styles/main.css`: 가방+하단 메뉴, 상태·10칸 장비·스킬 팝업 구현.
- 검증: `pnpm run check`, `pnpm run build` 성공; 6개 에셋 빌드 포함 확인.

## 2026-11-15 · 작업 2
- `vercel.json`에 Vite 빌드·`dist` 출력, SPA fallback, HTML/정적 자산 캐시 헤더 추가.
- 검증: `pnpm run build` 성공 (`tsc --noEmit && vite build`), JSON 구문 검사 통과.
- Vercel CLI·인증·프로젝트 연결이 없어 URL 미발급; `main` 푸시 후 Vercel Import 필요.

## 2026-11-15 · 작업 1
- Vite·TypeScript·PixiJS 초기화 및 세로형 전투/인벤토리 UI 구현.
- `src/game/`에 직접 이동, 4개 공격 동작, 적·보스, 빛기둥 드랍, 장비·저장 구현.
- `src/ui/`에 10칸 장비, 가방 비교·장착·분해, 튜토리얼 구현.
- 검증: `pnpm run build` 성공 (내부 `tsc --noEmit && vite build`); 브라우저 실기 검증 생략.
## 2026-11-16 · 작업 56
- `public/assets/warrior_female_armored_nohelm.png`, `walk8_female_armored_nohelm.png`, `warrior_female_armored_attack.png`: 여성 갑옷 정지·보행·공격 이미지 생성.
- `src/game/appearance.ts`, `src/game/render.ts`, `src/game/render/entities.ts`, `src/styles/modals.css`: 성별별 갑옷 외형 선택과 장비창 인물 중앙 정렬.
- `tests/appearance.test.mjs`, `tests/market.test.mjs`: 성별별 외형 회귀 검사와 Windows 임시 DB 잠금 정리 보강.
- 검증: `pnpm run check`, `pnpm test` 31건, `pnpm run build`, `git diff --check` 통과.

# 2026-11-18 작업 137·138

- 작업 137 문서 PR #73을 `6402d79c3fa014fb419815606fcd022dd1b411a3`로 main에 병합했다. Cloudflare Pages Preview 성공, 별도 Workers 빌드는 기존 `[previews]` 설정 누락으로 실패했다.
- 작업 138을 `task/138-costume-prototype`에 등록하고 독립 뷰어를 시작했다. 도구 비교와 제작량 가정은 `tools/costume-viewer/TOOL_COMPARISON.md`에 기록한다. 화면 실기·모바일 성능은 아직 측정하지 않았다.
- 작업 138 마감: `tools/costume-viewer/`에 본체 파츠 4분할(머리·몸통·양팔·다리)·갑옷/투구 레이어·무기 2종과 **가림 방식(파츠 숨김/교체) 토글**을 구현했다. `model.ts` `partPlan`·`coverModeNote`와 단위 테스트 5건 추가(합계 8건 통과).
- 정량 비교 실측: 번들 증가(esbuild min+gzip) 자체 0B / Spine +57,939B / DragonBones +47,015B, Draw Call 장면 전체 1회/프레임, 데스크톱 1280×960 60.0fps, 모바일 뷰포트 390×844(DPR2) 24.9fps(SwiftShader 소프트웨어 GL), JS 힙 +5.98MB. 측정 환경·절차와 결론은 `tools/costume-viewer/TOOL_COMPARISON.md`.
- 화면 검증: Vite + Chromium(WebGL2)으로 프레임 0~7·자동 재생·무기·좌우 반전·레이어·가림 토글을 확인했고 콘솔·페이지 오류 0건이었다. 미리보기는 `downloads/costume-viewer-preview.png`.
- 검증: 루트·뷰어 `tsc --noEmit`, `node --test tools/costume-viewer/model.test.mjs` 8건, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. PR #74를 Ready로 전환해 `main`에 스쿼시 병합했다(모바일 실기 미측정).

## 2026-11-18 · PR #51 운영배포 대상
- 사용자 요청으로 현재 월드보스 소개·전용 연습전·포효/결과/순위예시 UI와 보상·업적 수령 지연 개선을 운영 반영한다. 실공유HP/실순위/실보상은 미연동 연습전임을 유지한다.
- 최신 main b39d160의 다른 작업자 외형·코스튬 반영분을 보존하고 통합했다. 진행 중 UI 개편은 포함하지 않는다. 성능 개선 등 추가 기능 수정 없음.
- tsc·관련101테스트·장비75/착용50아트검사·운영빌드·diff 통과. Cloudflare Pages djrpg만 사용, 운영 https://djrpg.pages.dev/ .

# 2026-11-18 작업 140

- `src/game/render/costumeHero.ts`(신규)로 필드 캐릭터를 독립형 코스튬 레이어 렌더러에 연결했다. `planCostume()`·`resolveSkillMotion()`을 소비해 본체 3파츠 + 장비 레이어를 계획하고, 갑옷은 몸통 파츠를 교체(§4), 매니페스트 `zOrder`·`anchor`·`fit`을 반영한다. 아틀라스는 `COSTUME_ASSET_VERSION` 경로에서 1회 로드·셀 캐시.
- `render/entities.ts` `drawHero`는 코스튬 모드 → 기존 통합 바디·무기 소켓 폴백 순서로 그린다. 그림자·런지·피격 tint·광폭 오라는 두 경로가 공유하고, 잔상은 코스튬 모드에서 보이는 레이어를 모두 복제한다.
- 모션 계약: `HeroCostumeMotion`(idle1·walk8·attack4·slash4·spin6·smash4·cast3), `heroCostumeMotion()`·`costumeFrameIndex()`·`costumePlaybackRate()`(월드 쿨다운의 역수, 상한 3배)를 `render/heroMotion.ts`에, `costumeBodyPx`·`costumeScale()`을 `render/heroScale.ts`에 두었다. `heroSockets.ts` 소켓 표는 폴백 전용으로 명시.
- 아틀라스 배치 규약을 `docs/COSTUME_SYSTEM.md` v1.2 §7.2로 확정했다 — 셀 234×242, 페이지 2048² 64칸, 변형당 32칸(페이지당 변형 2개, 3번째부터 `-2` 페이지), 프레임 슬롯 표. 142가 이 규약으로 팩킹한다.
- 안전장치: 매니페스트 실패 시 아틀라스 요청 0회, 레이어 경로는 전부 아니면 전무(부분 실루엣·캐릭터 소실 없음), 실패 페이지는 1회 기록 후 재시도 없음.
- 대표 장면 1회: 로컬 Vite + Chromium(SwiftShader 소프트웨어 GL) 412×892 DPR1, 3층 자동사냥. 폴백 남/여는 캐릭터·그림자 정상 표시에 화면 전체 draw call 7~9/프레임(개발 서버가 없는 매니페스트 경로에 SPA fallback HTML을 주므로 콘솔 오류 1건 → `manifest-parse` → 폴백), 코스튬 모드(합성 아틀라스 주입)는 레이어 8개·통합 바디 숨김·draw call 7·콘솔 오류 0건이었다. FPS는 소프트웨어 GL이라 절대값이 의미 없고(5.2~5.4) 폴백/코스튬이 동일했다. 모바일 실기·GPU 메모리는 142에서 잰다.
- 검증: `npx tsc --noEmit`, `node --test tests/costume-field-render.test.mjs`(신규 16건) + `tests/costume-manifest.test.mjs tests/appearance.test.mjs tests/hero-motion.test.mjs tests/hero-art.test.mjs tests/hero-weapon-render.test.mjs`, 전체 `node --test tests/*.test.mjs` 303건, `node scripts/verify-item-art.mjs`, `git diff --check` 통과. `world.ts`·`store.ts`·`server/**`·`src/ui/**` 무변경.
- PR #79(`task/140-costume-field-renderer`).

- 배포 후 실측: 운영 `https://djrpg.pages.dev/version.json` = `3854ab354695`(머지 커밋). 게스트 시작 후 필드 장면에서 콘솔 오류 0건·4xx 0건·캐릭터 정상 표시를 확인했다. 다만 없는 `/assets/costume/v1/manifest.json` 요청이 SPA fallback으로 `200 text/html` + `immutable`을 받아 브라우저에 v1 URL이 캐시되므로, 첫 실물 에셋 배포(142)는 `COSTUME_ASSET_VERSION`을 2로 올려야 한다(문서: `docs/COSTUME_SYSTEM.md` §7.2 주의, `docs/TASK_songduckjin.md` 작업 142 필수 항목).

## 2026-11-19 fks3997 — 작업168 상시 던전 대기창
- 업적 아래 동일 utility 크기/간격 철문 아이콘·현재층 도전/순위 대기창, 전투/서버 미연동·가짜순위 없음.
- tsc·관련45테스트·아트 검사 통과. Draft PR #88 preview 전용(기존 배경확장/167 경고원 포함), 운영병합 금지.

## 2026-11-19 fks3997 — 작업169 던전 대기창 정리
- 철문 가림 제거·제목/층 재배치·중복 안내 삭제·90초 문장·금화/강화석 이미지 보상. 세로영역 절약·내부 스크롤 제거.
- tsc/부분14/아트/diff 통과. 브라우저 실기 미실행. 사용자 지시로 미리보기 생성 요청 전 로컬만, push/운영 없음.

## 2026-11-19 fks3997 — 작업170 던전 탭 레이아웃
- 철문 높이 고정·층글자 제목보다 작게·10위 기본행/내순위·도전탭 전용 버튼.
- tsc/관련14/diff 통과. Draft88 미리보기 갱신 요청, 운영미배포. 브라우저 실기 미실행.

## 2026-11-19 fks3997 — 작업171 던전1층
- 현 철문 테마 석조감옥, 문열림/줌 진입, 기존 장비/자동스킬로 90초3/3/정예1. 독립복사Save로 보상/기록 미반영·다음층 미연결.
- 실패/시간초과/클리어 결과에 재도전/나가기. 렌더러 종료 후 메인 사냥 복구.
- tsc/관련19/아트/diff 통과. 브라우저 실기 미실행. 사용자 요청 Draft88 미리보기만, 운영배포 없음.

## 2026-11-19 fks3997 — 작업172 철문·관찰 난이도
- 문틀/좌우문 별도 PNG3장, 대기창 위치 그대로 문만개방·줌제거·필드fade. 닫기/로딩실패 취소시 메인복구.
- 일반HP40에 고레벨피해적용/전멸즉시다음웨이브로 초고속클리어 원인 확인, 관찰용현재DPS8초HP·정예3배·받는피해상한.
- tsc/관련20/아트/diff 통과, 새레이어 합성 정합검사·기본45.65초/고공격55.55초 클리어 시뮬. 브라우저 실기 미실행. Draft88 preview만.

## 2026-11-19 fks3997 — 작업173 철문 자물쇠
- 자물쇠 좌문이 우문 앞에 표시되도록 명시적 z-index, 문틀은 최상단 유지. tsc/관련2/diff 통과, 실기 미실행. Draft88 미리보기만.

- 173 후속: 사용자 요청으로 개방 회전방향 반전(+82/-82). 기존 문틀/잠금장치 레이어 유지, CSS 방향 수정/diff 확인. 미리보기만.

- 173 최종: 개방각110도, CSS transition 목표각 유지로 정지·90도 이상에서 문짝이 사라지지 않게 backface 표시. diff 확인, preview만.

- 110도에 도달한 후 약0.65초 정지 상태를 보여주고 층 화면으로 전환(개방1.15초/대기총1.8초).

- 173 전환 깜박임: 대기창 먼저닫아 메인필드가 비치는 순서 제거. 배경/배우 첫프레임 선렌더→대기창 위fade→650ms후대기창닫기.

- 173 방향 재정정: 이전회전부호가 안쪽이었음. 좌-110/우+110으로 자유단을 앞(z양수)으로 회전하고 개방중문틀앞에 배치. 110도정지/전환유지. diff 및 회전좌표 산술 확인.

## 2026-11-19 fks3997 — 작업174 던전 접근거리
- 중앙 방어 위치고정/생성190초과·적110내 자동공격으로 접근모션 확보. 타웨이브앞으로추격해 생성과겹치는원인 제거.
- tsc/부분9/diff 통과, 2초접근 미처치·미종료검증, 기본51.5초/고공격55.55초 클리어시뮬. 브라우저 실기 미실행, 미리보기만.

## 2026-11-19 fks3997 — 작업175 문안/쉬운1층/2층 이동
- 사용자2단계=2층 명시, 1층클리어 다음층버튼·2층1.2배HP·페이드전환·풀HP/90초. 3층/DB/보상/랭킹 미연결.
- 문안 기존던전배경 표시. 기본HP DPS8→4초·정예3→2배·받는피해상한 일반0.5%/정예0.8%로 완화.
- tsc/부분22/diff 통과, 기본1층28.35초/2층31.4초 클리어 시뮬. 브라우저 실기 미실행, 미리보기만.

## 2026-11-19 fks3997 — 작업176 정면문안·출구개방
- 문안정면어두운복도, 새석조배경중앙문제거/출구3레이어전체표시로상단잘림제거. 다음층눌러결과닫고그문개방후전환.
- tsc/관련22/아트/diff 통과. 브라우저실기미실행, Draft88 preview만. 월드보스최고기록집계는146충돌로보류유지.

## 2026-11-19 fks3997 — 작업177/178 업적단계·던전문
- 분류당현재미수령1개·전체완료분류하단·모두받기는표시단계만·빨간점연동, 서버보상/이력불변.
- 문턱접지(top10%/h28%)·다음층닫힘즉시초기화후전환·문뒤wave안내제거/하단유지.
- tsc/관련21/diff통과. 브라우저실기미실행, Draft88미리보기만.

## 2026-11-19 fks3997 — 작업179 문앞배우·사망잔상
- CSS방배경/DOM문z2/투명배우canvasz3/HUDz4로몬스터가문뒤가림제거. 전투시간정지와별개시각시간진행·사망소멸후.75초결과, 층리셋때구몬스터/시체/라벨청소.
- tsc/던전10/diff통과, 브라우저실기미실행. Draft88 preview만.

## 2026-11-19 fks3997 — 작업180 던전 배경 회귀
- 179에서불투명canvas생성후alpha0으로바꿔CSS방/문이갈색clear에가려짐. Pixi소스초기alpha고정확인, 던전앱init옵션부터backgroundAlpha0. 공용render무변경/배우앞레이어유지.
- tsc/던전10/diff통과, 브라우저실기미실행. preview만. 벽추가질문은회색석조벽/어두운가장자리방안추천, 미구현.

## 2026-11-19 fks3997 — 작업181/182 대기창벽·10층·배경색
- 승인석조벽고정배경·기존문짝개방유지. 사용자30아닌10확정, 5/10보스단독·나머지3/3/정예·층진행/완료를세션에만유지. 계정Save/DB/보상/순위무변경.
- alpha0에갈색RGB가남는문제방지: init/background색도검정으로지정해RGBA0.
- tsc/관련24/아트/diff통과, 기본10층전부28~58초클리어시뮬. 브라우저실기미실행, Draft88 preview만.

## 2026-11-19 fks3997 — 작업183 벽하단암부제거
- 대기창CSSbottomfade삭제·벽PNG자체bottomblack제거한v2로변경. 문턱양옆까지회색석조유지. tsc/대기창3/아트/diff통과, 실기미실행. 미리보기만.

## 2026-11-19 fks3997 — 작업191 사용자명시운영배포
- 사용자테스트변경(165~190, 다른AI드롭포함)을PR88로배포. 최신main c804d74의전사/투구외형·공격사거리경계수정보존, 렌더/월드/테스트/공용문서충돌수동통합. DB이관146/최고기록집계보류는불변.
- tsc·build·아트·diff통과. 전체448중446통과/기존코스튬2실패는main독립worktree에서도동일재현(26중24통과). 새실패없음. 브라우저실기미실행.
- 던전은10층세션미리보기/실제보상·순위미반영상태그대로, 필드드롭은기존저장흐름유지. 운영버전확인대기.

- 191 운영배포완료: PR88 merge146a6ac4b8ef, Pages production success, https://djrpg.pages.dev/version.json =146a6ac4b8ef(builtAt2026-11-19T14:22:18Z). 새JS/CSS내용·방/벽/문이미지200확인. 추가운영빌드를피해완료기록은로컬커밋만.

## 2026-11-19 fks3997 — 작업192/193 필드드랍
- 던전과등급테두리차이: tint는어두운원본RGB에곱해져탁해짐. 순수alpha색마스크1px선/형상halo로교체·원본색보존·원형glow제거.
- 화면고정드랍을배경scene UV에고정, 카메라양축/경계/resize/그림자/착지예약동기화. 흡수때만캐릭터추적. world/Save/획득/확률무변경.
- tsc/부분38/build/아트/diff통과, 실기미실행. 사용자직접운영요청으로별도미리보기검수생략.

## 2026-11-20 songduckjin — 작업157 스킬1·2 이펙트(은빛검기·푸른청룡)
- 1번휘두르기: 코드arc2줄→검정배경 add스프라이트2장(fx_slash2 검기·fx_slash2_ground 황금지면충격파). 검기만 스윙방향회전, 지면파는 눕힌채(세로.62) 전방34%. 등급은 폭+8px·12%틴트만.
- 2번: 청룡머리·비늘몸통 PNG교체(짙은파랑), 한바퀴1.1→2.4초, 발밑파란지면광·링, 몸통방사1.25배. `/assets/*`immutable이라 dragon2장은`?v=2`.
- tsc/부분6(검기·청룡계약 새로)/전체474중472(costume-field-render2건은종전실패)/build/아트/diff통과. PR#118 스쿼시`eef4e9d5251d`, 운영version.json`eef4e9d5251d`(builtAt2026-11-20T01:17:18Z)·새에셋4장200(원격sha=로컬, 머리평균RGB 35/105/189 파랑)·번들`index-QOXkJ41J.js`에 경로·`Math.PI*2/2.4`확인. 브라우저실기미실행.

## 2026-11-20 songduckjin — 작업159 궁수 스타터 가죽 튜닉 시트 교체
- 승인 원본(`downloads/archer_preview/{male,female}_starter.png`)에서 `images --edit`로 걷기·활사격 4프레임 스트립 생성. 후드·망토·견갑 없이 민소매 가죽 조끼+크림 셔츠, 퀴버·나무활 유지, 4프레임 얼굴·옷·바닥선 동일 확인.
- `scripts/build-archer-sheets.py` 입력을 `{}_starter{,_walk,_attack}.png`로 교체 후 6장 재생성(362×362 / 1448×362, 검정 키잉·발끝정렬). 셀 높이 남 337/301·299·300·300/239·275·270·270, 여 337/300×4/239·277·279·263. 옛 후드 입력은 주석으로만 남김.
- `/assets/*` immutable이라 `render.ts` 6경로·`equipmentPortrait.ts`·`charactersModal.ts`의 궁수 시트 URL에 `?v=2`. `tests/archer.test.mjs`에 캐시 버스터 누락 감시 1건 추가(궁수 시트 참조 줄은 전부 `?v=` 필요).
- 시트만 교체: `heroBodyPx`·전투 수치·Save/DB/API 무변경. 장비 오버레이는 종전대로 궁수에게 그리지 않는다.
- tsc/archer 14·전체488중486(costume-field-render2건은 `86ac44e` 워크트리 동일실패)/아트6장/build/diff통과. 번들에 6경로 `?v=2` 확인. 검수 `downloads/djrpg_archer_starter_ingame_v2.png`(남녀 걷기·사격 4패널). 브라우저 실기 미실행.
- 159 운영배포완료: PR#124 스쿼시`4ba39fdb63b7`, Pages production success, https://djrpg.pages.dev/version.json =4ba39fdb63b7(builtAt2026-11-20T02:29:42Z). ?v=2 시트6장 200·원격sha=로컬, 번들`index-j5_2NUhd.js`에 6경로 ?v=2 확인. 브라우저실기미실행.

## 2026-11-20 fks3997 — 작업215 보물 주머니 3컷 탄성·빛전환
- 원인(`#5297`): AI로 만든 중간 컷 6장(`step1b`·`step2`·`step2b`·`step3`·`step3b`·`open`)의 각도·배 둘레·문양이 달라 9컷을 넘길수록 모양이 울렁거렸고 6·7번 컷에 어두운 후광 찌꺼기가 남아 더 끊겨 보였다.
- `POUCH_FRAME_URLS`를 **3장**(`treasure_pouch_v2`·`slump0_v3`·`slump2_v2`)으로 줄이고 `preloadPouchFrames`도 3장. 그림 대신 `.pouch-art-stack`에 `transform-origin: 50% 92%` **Squash & Stretch**(`pouch-squash` 920ms, scaleX/scaleY 교대 → 0.9초 `scale(1.08)` 힘 모음, `rotate` 없음)와 `pouch-settle`(320ms 1080ms, translateY·scaleY로 가라앉기).
- 타임라인 `POUCH_FRAME_AT` 0/920/1080·`BURST 920`(Canvas 흰빛 피크가 정확히 이 순간)·`RESULT 1220`·`OPEN 1550`. 1→2번 컷은 섬광 속 180ms, 2→3번 컷은 200ms 크로스페이드(`data-pouch-frame` 규칙). 토스트·전광판은 그대로 보상 카드 시각(스포일러 없음).
- 2→3번 컷은 윤곽 차이가 커서 그냥 겹치면 문양이 두 개로 비쳤다(정지 프레임 목업 `downloads/djrpg_pouch_3frames_215_sheet.png`·`pouch215_collapse_compare.png`로 확인) — **나가는 2번 컷만** `pouch-collapse` 200ms로 바닥 축 `scaleY(.55)`까지 눌러 사라지게 해 겹침 얼룩을 없앴다.
- `pouchLight`는 `start(burstAt, endAt)`만 받아 그림 전환과 같은 프레임에 피크가 오고, `prefers-reduced-motion`이면 탄성·빛·전환 모두 끈다.
- tsc·`node --test tests/treasure-pouch.test.mjs` 21/21·vite build 통과. `scripts/verify-item-art.mjs`는 이 작업 클론이 `public/assets` 아이콘만 받은 sparse 체크아웃이라 `item-art` 파일이 없어 실행 불가(이번 변경과 무관).
- 브라우저 실기 미실행, 미리보기만.
## 2026-11-20 songduckjin — 작업213 전사 1번 스킬 '이단참'(좌우 횡베기 2연격)
- `skills.ts`: `slash2` 표시 이름 휘두르기→**이단참**(ID 유지), 설명·위력표기(`공격력 × 1.1 · 2연격`) 갱신. `slash2Hits`(0s 1.1배·0.18s 1.1배·합 2.2배, 넉백 6/12)·`slash2SecondHit`·`slash2SwingSeconds`(0.44)·`slash2TotalPower`를 단일 기준으로 추가. 퀵슬롯 단축명은 이미 `이단참`이라 표기가 일치하게 됐다.
- `world.ts`: 발동 즉시 1타, 0.18초 뒤 2타 — 타마다 사거리·부채꼴을 다시 재는 독립 `damage()` 호출이라 데미지 팝업도 두 번. `Effect.hits`로 타수를 세고 두 타 뒤 `nextHit`을 비운다. 2연격 모션 창 `attackCombo='double'`·`attackPose=0.44`.
- 모션(`heroMotion.slash2SwingMotion`·`entities.drawHero`): 공격 시트 4프레임을 1타 0→3, 2타 3→0으로 되감아 좌우 횡베기를 구분하고 스윙마다 전진 pulse. 무기·투구·갑옷 파츠가 같은 프레임을 쓴다.
- 검기(`vfx.ts`): 새 에셋 `public/assets/fx_slash2_dual.png`(512×122, 17KB, 은빛·강철빛 초승달)를 add 합성. 1타는 정방향(−0.17rad), 2타는 좌우 반전(+0.2rad)으로 X자 교차, 2타 시점에 황금 지면 충격파. 새 파일명이라 `/assets/*` immutable 캐시를 피한다.
- 검증: `tsc`, `vite build`, 전체 678건 중 676 통과(실패 2건은 변경 전 main과 같은 `costume-field-render`), 신규 `tests/skill-double-slash`(5). 검수 이미지 `downloads/djrpg_skill_1_double_slash_ingame_v1.png`(`scripts/preview-double-slash.py`). 브라우저·iOS 실기 확인은 사용자 몫.
- 213 운영배포완료: PR#170 스쿼시`14c378662bd0`(2026-11-20T10:11:17Z), Pages production success, https://djrpg.pages.dev/version.json =14c378662bd0(builtAt2026-11-20T10:11:36Z). 루트200·번들`index-ex5_BV8U.js`에`fx_slash2_dual`·`이단참`·`2연격`·`attackCombo`·새 에셋 200(17,311B, sha256 일치, immutable). 작업 212와 리베이스 병합(skills.ts 순서·world.ts attackPoseSpan/crush 공존). 브라우저·iOS 실기 미실행.

## 2026-11-20 · fks3997 · 작업 218 · 월드보스 한정 배포
- 사용자 지시로 누적 전체 통합(217)을 취소하고 월드보스 216 변경만 최신 main에 적용. 주머니 수령 기능은 다른 AI 배포가 선행됨을 사용자 확인. 기존 서버 읽기/쓰기 분리와 계측 유지.

### 작업 218 선행 배포 반영 후 검증
- 보물 주머니 포함 운영 배포 #179(`b2fbe61`) 확인 후 최신 main 통합. 기존 업적 집계·서버 계측 보존. 변경은 월드보스 4개와 관련 테스트/문서뿐.
- 관련 63개 테스트 전부 통과(기존 실패 주머니 4개 수령/재시도 검증 포함), 운영 빌드(tsc·아트 검사·Vite) 통과. PR #177 운영 병합 진행.

## 2026-11-20 songduckjin — 작업222 전사 남녀 서기 '낮은 양손 그립' 시트·대검 앵커 교체
- 사용자가 고른 시안(`downloads/warrior_grip_fix/twohand_drag_v1.png`, 낮은 양손 그립)대로 **전사 서기(`idle`)만** 다시 그렸다. 걷기·공격 시트는 이미 같은 낮은 그립(두 손이 자루에 모이고 칼날이 왼쪽 아래)이라 손대지 않았다.
- 에셋 88장(서기 전용): `warrior_{male,female}_idle_v1.png`(RGBA) · `headless/` · `noweapon/` · `noweapon/headless/` · `armors/warrior_*_armor_{0..9}_idle_v1.png`(256색 팔레트) · `armors/headless/` · `noweapon/armors/` · `noweapon/armors/headless/`. 합계 2.8MB.
- 제작: 승인 시안은 SIFT 유사변환으로 기준 셀(높이 337·발끝 y≈353·정수리 x≈230)에 그대로 넣었고, 여성·갑옷 10종은 `images --edit`으로 **자세(팔·그립)만** 바꾼 뒤 같은 방식으로 셀에 맞췄다(높이·발끝 오차 ≤4px, 기준 시트에 55% 톤 매칭). 머리 없는 시트는 기존 `headless`에서 뽑은 머리 영역(5px 확장)을 알파만 지워 만들고, 기본 검 지운 시트는 검만 지운 판을 다시 그려 정합했다(검 뒤의 스커트·다리를 새로 그림).
- 검은 배경 키잉은 **경계에서 이어진 저경사 영역만** 배경으로 뺀다 — 흑요석·흑금 갑옷(6·9번)이 통째로 사라지던 문제를 잡았다(갑옷6 서기 6,237px → 23,292px).
- 앵커: `WEAPON_POSES`에 `idle0`(맨몸, 남 158·226.5·-2.2 / 여 198.5·220·-0.2)과 `idleArmor`(갑옷, 남 203·221.5·-1.2 / 여 198.5·220·-0.2)를 두고 `weaponPose(gender, motion, frame, armor)`가 고른다 — 갑옷 서기 시트는 같은 낮은 그립이지만 손이 벨트 중앙이라 앵커가 다르다. `drawHero`·`equipmentPortraitWeapon`이 착용 갑옷 인덱스를 넘긴다.
- 캐시: `/assets/*` 1년 불변이라 서기 경로에만 `?v=2`(`armors.ts` `WARRIOR_IDLE_ASSET_VERSION`·`withMotionVersion`, `weapons.ts` `swordlessBodyPath`, `helmets.ts` `headlessBodyPaths.*.idle`, `render.ts` `paths.pilot*`, `ui/equipmentPortrait.ts`). 걷기·공격 URL은 그대로.
- 검증: `npx tsc --noEmit`, `npm test` 865건 중 861 통과(실패 4건은 변경 전 `main`과 같은 `costume-field-render` 2·`skillbook-server` 1 등), `node scripts/verify-item-art.mjs`, `npx vite build`, `git diff --check`. 캐시 버스터 감시 테스트 1건(`tests/weapon-render.test.mjs`) 추가. 검수 이미지 `downloads/djrpg_warrior_low_grip_ingame_v1.png`(남녀 × 갑옷 0~9 × 대검 0~9 + 투구 0번, 실게임 52px 포함). 브라우저·iOS 실기 화면은 미확인(사용자 몫).
- 작업 번호는 218이 `docs/TASK.md`에서 먼저 쓰여(등급색 발광·월드보스 배포) **222**로 등록했다.
- 222 운영배포완료: PR#193 스쿼시 `4a1e95cbe6a5`(2026-11-20T12:32:50Z), Pages production success, https://djrpg.pages.dev/version.json =4a1e95cbe6a5. 루트 200·번들 `index-B6Q_uG43.js`에 `idleArmor` 앵커(남 203·221.5·-1.2 / 여 198.5·220·-0.2)·`idle0`(남 158·226.5·-2.2)·서기 `?v=2` 경로·`noweapon/armors` 확인. **서기 시트 88장 전부 HTTP 200 `image/png`·원격 sha256=로컬**. 머지 직전 `main`(985f7f5)으로 재적용하고 작업 216의 빈손(`noweapon`) 규칙과 테스트 충돌 6건을 함께 해소했다. 브라우저·iOS 실기 미실행(사용자 몫).

## 2026-11-20 songduckjin — 작업228 모바일 장비창 가방 노출·HUD 닉네임·캐릭터 전환 무새로고침
- 사용자 제보 3건을 한 번에 처리: `#19086` "장비창이 폰크기에 맞게해야할거같에 인벤토리창아 안보여" · `#19089` "레벨믿에 닉네임은 떠야할거같아" · `#19121` "캐릭터 생성할때 접속하는중입니다 에서 무한로딩같아 너무 느린거같아".
- **가방 원인**: `src/styles/modals.css`의 `@media (max-height: 750px)`가 `.equipment-modal .bag-grid { min-height: 0 }`으로 가방 칸을 0px까지 줄이고, 위쪽 전신(190px)+장착 10칸(정사각 132px)+가방 머리 3줄(82px)+바닥줄(84px)이 세로를 다 먹었다. 실측(헤드리스 Chromium): 390×664에서 가방 5px · 375×667에서 37px · 375×560에서 4px(바닥줄이 가방을 덮음).
- **가방 수정**: 해당 규칙 삭제 + 모바일(`max-width: 480px`) 컴팩트화 — 전신 146px(≤720px 높이 132px), 장착 10칸 `aspect-ratio:auto; height:48px`(≤380px 46px), `가방` 제목·`내 직업만 보기`·`등급순`을 `.bag-heading` 한 줄로(DOM은 그대로, 클래스·aria 유지), 바닥줄은 `가방 16/40 · 보물 주머니 N개` 한 줄 + 10px 버튼, `.bag-grid` 최소 135px. `max-height: 620px`에서는 창 자체가 스크롤되고 가방 칸은 최소 135px 유지.
- **가방 실측(수정 후)**: 390×844 294px · 375×667 157px · 390×664 150px · 360×640 135px · 375×560 135px(창 스크롤). 검수 이미지 `downloads/djrpg_mobile_equipment_hud_v1.png`.
- **HUD 닉네임**: `renderStatus` 템플릿에 `<span class="hero-name">`를 넣고 `save.name`을 `textContent`로만 채운다(특수문자 안전). `.level-badge`(5~54px) 아래 40~57px에 배지 중앙 정렬 이름판(최대 74px·말줄임·`pointer-events:none`이라 배지 클릭을 가리지 않음, 체력바 59px·월드보스 진입 85px와 겹치지 않음).
- **캐릭터 전환**: `changeCharacter`가 `sync.flush()` 대신 `sync.flushIfDirty()`를 쓰고, `selectCharacter`/`createCharacter` 응답의 세이브로 `applyCharacterSwitch`가 `World.adoptSave`(같은 save 객체에 내용만 교체, 몹·드랍·쿨·보스 상태 초기화)·세션 슬롯/리비전·sync.revision·HUD·가방 배지·임무 배지를 한 번에 갱신한다. `location.reload()` 제거(번들·에셋·`/api/account` 재로딩이 "접속하는 중" 지연의 원인). 방치분은 서버가 내려준 `offlineSeconds`로 그 자리에서 정산. 캐릭터 선택 창은 `world.onChange` 재렌더 대상에서 제외(카드 초상화 합성이 무거움).
- **서버**: `selectCharacter`/`createCharacter` 응답에 `characterName`·`characterSlot`·`offlineSeconds`를 추가하고, 트랜잭션 끝의 `account()` 재조회를 없애 왕복 1회를 줄였다(고른/만든 캐릭터의 세이브를 그대로 응답).
- **검증**: `npx tsc --noEmit` · `npm run build` 통과, `npm test` 911건 중 908 통과(실패 3건은 변경 전 `main`과 같은 `costume-field-render` 2·`skillbook-server` 1). 신규 `tests/character-switch.test.mjs` 5건(무새로고침·월드/세션/동기화 반영·오프라인 정산·HUD 닉네임·가방 최소 높이), `tests/characters.test.mjs`에 `characterName`/`offlineSeconds`/리비전 단언 추가, `tests/modal-ui.test.mjs`는 `flushIfDirty`로 갱신. 헤드리스 375×667에서 레벨 배지 → 캐릭터 → `선택` 흐름이 **페이지 이동 0회**로 LV14·`두번째검수`로 바뀌는 것 확인.
- 228 운영배포완료: PR #212 스쿼시 `d187671b8831`(2026-11-20T14:51:07Z), https://djrpg.pages.dev/version.json = `d187671b8831`. 배포 번들 `assets/index-BC-oG_ZF.js`에 `flushIfDirty`·`adoptSave`·`hero-name`·`characterName` 포함, `changeCharacter`에 `location.reload()` 없음. 배포 CSS `assets/index-BYUADiCY.css`에 `.equipment-modal .bag-grid{min-height:135px}`·`@media (max-height:620px)` 포함, `max-height:750px` 가방 찌그러짐 규칙 없음, `.warehouse-*` 블록 유지.
- 작업 번호는 224(최고층 복귀)·225(공용창고)·226(우편·거래소 503 잠금)·227(시트 알파 복원)이 이미 쓰여 **228**로 등록했다.
## 2026-11-20 · songduckjin 작업 227 — 2.5D 캐릭터·장비 시트 알파 복원(반투명으로 뒤가 비치던 문제)

- **증상**: 황야 위 캐릭터(전사·궁수·마법사, 갑옷·로브·투구·무기 파츠)의 몸통 뒤로 바닥 타일이 비쳐 보였다. **원인은 코드의 `alpha`가 아니라 시트 PNG 알파 채널** — 마법사 남 서기는 불투명 픽셀의 56.4%가 `0<a<255`·중앙값 **198/255**, 걷기 54.2%·194, 공격 59.6%·177. 궁수 남 서기 45.1%·237, 마법사 여 서기 42.2%·244.
- **수정**(`scripts/restore-pilot-alpha.py` 신규): 완전 투명 배경에서 **거리 2px 초과 내부**의 `alpha>=30` 픽셀을 **255**로 복원, 외곽 1~2px 안티엘리어싱과 내부 먼지·그림자 점(`a<30`)은 그대로. RGB는 손대지 않는다 — 황야 타일 위 게임 배율(본체 = 화면 높이 9.35% → 800px에서 0.222배) before/after 합성으로 **straight alpha**임을 확인했다(premultiply로 보고 `rgb/(a/255)` 보정하면 그림이 뜨고 번진다). **`fx_*`(블러드 레이지·불꽃·회오리)는 대상에서 제외**.
- **대상 267장**(전체 797장 중 나머지는 이미 불투명): 본체 18·머리 없음 12·무기/활/지팡이 지운 판 20·갑옷(전신·머리 없음·무기 지움) 40·투구 정면 13 + 공격 80·궁수/마법사 투구 파츠 40·대검 9·활 9·지팡이 10·기타. 색 변형 없음(인덱스 PNG는 256색 팔레트 유지, 팔레트 항목이 256을 넘는 173장만 옥트리 256색 — 평균 채널 오차 0.1~0.35). 파일 총량 **42.2MB → 41.3MB**.
- **수정 후**(같은 지표): 마법사 남 서기 21.6%·**중앙값 255**, 걷기 24.2%·255, 공격 25.2%·255, 궁수 남 서기 15.4%·255, 마법사 여 서기 15.7%·255, 전사 남 서기 12.3%·255. 남은 반투명은 외곽 AA와 먼지 점이다(내부 반투명 < 1.5%).
- **캐시**: `/assets/*` 1년 `immutable`이라 **모든 pilot-25d URL**에 버전을 붙인다 — `src/game/render/pilotAssets.ts`(신규) `PILOT_ASSET_VERSION = 3`·`pilotSheet()`·`pilotSheets()`. `render.ts`(`paths.pilot*`·`attackSheets`·`walkSheets`)·`armors.ts`(`WARRIOR_IDLE_ASSET_VERSION`→`PILOT_ASSET_VERSION`, 서기 전용 `withMotionVersion` 제거)·`weapons.ts`·`bows.ts`·`staffs.ts`(`STAFF_ASSET_VERSION`)·`robes.ts`·`archerArmors.ts`·`helmets.ts`(투구 정면 13·공격 80 표를 `pilotSheets()`로)·`mageHelmets.ts`·`archerHelmets.ts`·`ui/equipmentPortrait.ts`.
- **테스트**: 신규 `tests/pilot-alpha.test.mjs` 31건(대표 30장 내부 반투명 < 1.5%·중앙값 ≥ 250, 이펙트 4장 반투명 유지, 파츠 전수 내부 < 2%). 기존 경로 문자열 검사(archer·armor·weapon·bow·staff·robe·helm·mage·equipped-detail·character-portrait)를 `?v=3`·`pilotSheet()` 규칙으로 맞추고, `weapon-render`의 캐시 버스터 감시를 "서기만" → "pilot-25d 전 경로"로 다시 썼다.
- **참고**: 작업 번호는 `main`에 이미 224·225·226(거래소·부팅 핫픽스, 공용창고 UI, 마켓 503 안내)이 등록되어 있어 **227**로 올렸다. 검수 이미지 `downloads/djrpg_alpha_fix_compare_v1.png`.
- **참고**: 작업 번호는 `main`에 이미 224·225·226(거래소·부팅 핫픽스, 공용창고 UI, 마켓 503 안내)이 등록되어 있어 **227**로 올렸다. 검수 이미지 `downloads/djrpg_alpha_fix_compare_v1.png`.
- **운영 배포 완료**: PR [#209](https://github.com/songduckjin/DJRPG/pull/209) 스쿼시 `d8dc4cc7f692`, Cloudflare Pages production success, `https://djrpg.pages.dev/version.json` = `d8dc4cc7f692`(builtAt 2026-11-20T14:38:19Z). 대표 에셋 실측 HTTP 200 — `mage_male_idle_v1.png?v=3` 86,700B·`mage_male_walk_v1.png?v=3` 307,232B·`archer_male_idle_v1.png?v=3` 88,114B·`warrior_male_idle_v1.png?v=3` 130,487B(모두 로컬 수정본과 md5 동일). 배포 번들 `index-BwiOI_2u.js`에 `PILOT_ASSET_VERSION=3`(`const n2=3; function J(s){ ... ?v=${n2} }`, 모든 pilot 경로가 이 함수를 지난다) 확인.
## 작업 243 — 적 공격 모션·던전 스킬 쿨타임 실시간 표시·치명타 확률 실전 반영·API 호출 절감 (2026-11-21 09:00 전 배포)

- **배경**: 2026-11-20 22:40 UTC Cloudflare Pages Functions 일일 호출 120,897건(무료 한도 100,000) 초과로 `/api/*` 405 → 9시(UTC 자정) 초기화 대기. 사용자가 "9시전에 다 적용하자"로 모아 둔 세 건을 한 번에 배포.
- **적 공격 모션**: `Enemy.attack` 타이머(`ENEMY_STRIKE_SECONDS = .42`)를 추가하고, 필드 접촉 피해(`World.update` d<35)·던전 고정 피해(`DungeonBattle.step` 0.9초 주기)·월드보스 타격에서 세운다. 렌더러(`render/entities.ts`)는 이 값을 0.34까지 빠르게 나갔다 천천히 돌아오는 포락선으로 바꿔 플레이어 방향으로 최대 16px(보스 26px) 내딛고 8% 늘어난 몸으로 그린다. 맞는 순간 새 이펙트 `enemyStrike`가 할퀴기 3줄·충격 섬광을 그리고, 피해 숫자판이 붉은 `-N`을 띄운다. 연출만 더하므로 난수 소비·피해량·던전 digest는 바뀌지 않는다.
- **던전 스킬 쿨타임**: `.dungeon-auto-skills` 칸마다 남은 쿨타임 마스크(`scaleY`)와 초 단위 숫자를 매 프레임 갱신(`cooldown[id]/cooldowns[id]`). 스타일은 `src/styles/dungeon.css`의 `.dungeon-auto-skill-mask`·`.dungeon-auto-skill-cd`.
- **치명타**: 추가옵션 `critPct`는 이미 `totalStats().crit`에 들어가 있었지만 전투에서 쓰이지 않았다(표시 전용). `World.damage()`가 대상마다 `crit`% 확률로 1.8배(`CRIT_DAMAGE_SCALE`, 상한 `CRIT_CHANCE_CAP=80`)를 터뜨리고 금빛 큰 숫자로 표시. 월드보스는 서버 `replayBoss`가 같은 클래스를 다시 돌리므로 `World.critRoll`에 시드 난수(`REHEARSAL_CRIT_SEED = 0xc217`)를 끼워 클라이언트·서버 치명타 순서를 맞췄다. 던전은 기존 고정 스텝 시드 난수를 그대로 쓴다.
- **API 호출 절감**: 자동 저장 상한 5초→10초(탭 숨김 45초, `visibilitychange` 즉시 저장 유지), 저장 확인 타이머 5→10초, 전광판 5→30초, 여정 30→120초, 월드보스 순위 5→20초. 한 세션 기준 하루 호출을 대략 1/3 이하로 줄이는 계산이다(전광판 720→120/시간, 저장 720→360/시간, 월드보스 720→180/시간).
- **검증**: `tsc --noEmit` 통과, `vite build` 성공(761.66kB), `node --test tests/*.test.mjs` 1,034건 중 1,030 통과 — `tests/crushing.test.mjs`는 10타 피해 합계를 재는 테스트라 치명타를 끄도록 `world.critRoll = () => 1`을 넣었다. 남은 실패 4건(costume-field-render 2·skillbook-server 1·market DB 1)은 이전 커밋에서도 동일한 기존 실패다.
- **운영 배포 완료**: PR [#246](https://github.com/songduckjin/DJRPG/pull/246) 스쿼시 `b26eb3fdc2c4`, Cloudflare Pages production 반영 — `version.json` = `b26eb3fdc2c4`(`builtAt` 2026-11-20T23:12:21Z), 루트 200, 배포 번들 `assets/index-Cj-RzYW2.js`(761.66kB)에 `enemyStrike`·`critRoll`·`dungeon-auto-skill-mask` 포함, CSS `assets/index-ZadWjGuG.css`에 `.dungeon-auto-skill-mask`·`.dungeon-auto-skill-cd` 포함 실측.
- **검증 보강**: 신규 `tests/enemy-strike-crit.test.mjs` 3건 — ① 접촉 피해 순간 `enemy.attack`이 서고 `enemyStrike` 효과에 잃은 체력이 실리며 0.42초 뒤 0으로 돌아온다 ② `critRoll` 0/1로 치명타 유무를 고정해 1.8배 배수 확인 ③ 상한 80%.
- **남은 장애**: 2026-11-21 09:12 KST(00:12 UTC) 기준 운영 `/api/account`·`/api/market`·`/api/dungeon`·`/api/world-boss`가 모두 `405`(빈 본문) — 무료 한도 초기화 뒤에도 Functions가 서비스되지 않아 로그인 불가. Cloudflare 대시보드(`Djin3997@gmail.com`)에서 프로젝트 설정 확인·재배포가 필요하다(보관함에 계정 없음).

## 작업 246 — 강화 `+N` 표기 통일·업그레이드 화살표 슬림 교체·공용창고 다중 선택·스킬북 균등 드롭·가방 스킬북 `×N`·`자동 강화` 활성 표시 (미리보기 2차, 2026-11-21)
- **배경**: 미리보기(`preview/gravel-background-fks3997`)에서 사용자가 직접 인게임 테스트하며 보낸 6건. `main` 병합·운영 배포는 하지 않는다.
- **`+N` 위치 통일**: 새 `src/ui/plusBadge.ts`(`plusBadgeMarkup`·`plusBadgeNode`·`appendPlusBadge`)가 유일한 배지 생성기. 가방 칸(장비만)·장비창 장착 10칸(이제까지 `+N`이 없었다)·공용창고가 모두 이 헬퍼를 쓰고, CSS `.bag-item .item-plus-badge, .equipment-slot .item-plus-badge`가 **왼쪽 아래(left 3px·bottom 2px)** 한 자리를 정한다. `.equipment-slot`에 `position: relative`를 주고 부위 이름은 `padding-left: 13px`로 배지와 겹치지 않게 비웠다. 공용창고 전용 `.warehouse-plus { left: 1px }`는 삭제.
- **업그레이드 화살표**: `src/ui/upgradeBadge.ts`가 글자 `▲` 대신 `<img class="upgrade-arrow" src="/assets/icons/upgrade-arrow-slim.png">`를 만든다(사용자가 고른 3번 슬림 더블 셰브론 64×64 투명 PNG를 `downloads/`에서 그대로 복사 — 무늬 손대지 않음). CSS 크기 `clamp(7px, 1.9vw, 9px)`(예전 글자 11~14px보다 작다) + `drop-shadow(0 0 3px rgba(52,211,153,.8)) drop-shadow(0 0 6px rgba(16,185,129,.5))`. 거래소는 46px 상자 9px·작은 칸 7px.
- **공용창고**: `WarehouseState`에서 `quick`·`select`를 없애고 `선택`·`빠른 이동` 버튼과 CSS(`.warehouse-mode`)를 제거. `tap()`은 항상 선택 토글 + 상세 바 포커스, 고른 쪽에만 `선택 보관 (N)`/`선택 꺼내기 (N)`이 나타난다(한 번에 한 쪽만). 선택 체크는 상단 `job-badge`·우상단 화살표·우하단 수량·왼쪽 아래 `+N`이 모서리를 다 쓰므로 **가운데 반투명 ✓**(`.warehouse-slot.is-picked::after`)로 옮겼다.
- **스킬북 드롭**: `rollSkillBook(_floor, _job)`이 `스킬.level <= floor*2` 필터를 쓰지 않는다 — `dropJob()`으로 직업을 1/3로 고른 뒤 그 직업 11종(액티브 8+패시브 3)에서 균등 1/11. 습득에 레벨 제한이 없으므로(`useSkillBook`) 1층에서도 높은 스킬북을 모아 둘 수 있다.
- **가방 스킬북 묶음**: 새 `src/ui/bagStacks.ts` `bagStacks(items)`가 같은 `skillId` 스킬북·같은 보물 주머니를 한 칸 `{item, count, key}`로 모으고(처음 나온 차례 유지), `equipModal.renderInventory`가 `count > 1`이면 `×N`(`.skillbook-count`)을 단다. 칸의 `data-item-id`는 묶음의 첫 아이템이라 상세 보기·사용이 그 id로 연결되고, 사용은 `useSkillBook`이 같은 책을 필요 권수만큼 개별 id로 소모한다(목록·40칸 계산은 그대로 개별이다).
- **`자동 강화` 버튼**: `skillModal.skillTopBar`가 `hasSkillUpgrade(save)`(=`skillBookStatus(...).ready` 판정)로 `disabled`와 `.is-ready`를 정한다. 활성은 금빛 테두리 `#f0c47e`+발광, 비활성은 `opacity .5`·`grayscale(.75)`·`cursor: default`이고 클릭해도 안내조차 띄우지 않는다(누를 수 없는 버튼).
- **검증**: `npx tsc --noEmit` 통과, `vite build` 성공, `node --test tests/*.test.mjs` 1,084건 중 1,081 통과 — 실패 3건은 이전 커밋(`f8b9811`)과 같은 기존 건(`costume-field-render` 2·`skillbook-server` 1 'hell' 이름 불일치). 신규 `tests/plus-badge.test.mjs` 4건·`tests/bag-skillbook-stack.test.mjs` 3건, `warehouse-grid`(다중 선택 재작성)·`upgrade-badge`(PNG·크기·발광)·`item-drop-jobs`(1·3·20층 6,600회 표본 33종 균등)·`skill-auto-upgrade`(활성/비활성·CSS) 갱신.
- **미리보기 배포 완료**(2026-11-21 10:56 KST): `origin preview/gravel-background-fks3997` `f8b9811` → `1a987b0`, `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` = `1a987b0e09f3`(`builtAt` 2026-11-21T01:56:09.997Z`)·루트 200. `/assets/icons/upgrade-arrow-slim.png` HTTP 200·8,984B·md5 `2e77214e947587286facffc89d72fa17`(로컬과 동일). 배포 번들 `assets/index-B4pOHKma.js`(766,416B)에 `upgrade-arrow-slim.png`·`item-plus-badge`·`선택 보관`·`선택 꺼내기`·`skill-auto-upgrade` 포함, `빠른 이동` 0회. 배포 CSS `assets/index-CX2zh570.css`에 `.upgrade-arrow{width:clamp(7px,1.9vw,9px);filter:drop-shadow(0 0 3px rgba(52,211,153,.8)) drop-shadow(0 0 6px rgba(16,185,129,.5))}`·`.item-plus-badge{left:3px;bottom:2px}`·`.equipment-slot{position:relative}`·`.slot-part{padding-left:13px}`·`.skill-auto-upgrade.is-ready`·`.skill-auto-upgrade:disabled{opacity:.5;filter:grayscale(.75)}`·`.warehouse-slot.is-picked:after{content:"✓";inset:0;place-items:center}` 확인, `.warehouse-mode`·`.warehouse-quick`는 0회. **`main` 병합·운영 배포 안 함.**

## 작업 247 — 거래소 탭 정리·수령함 30건 상한·수령함/보상 빨간 점·판매 등록 칸 압축·가방 칸 순서 (미리보기, 2026-11-21)
- **배경**: 미리보기에서 사용자가 직접 테스트하며 보낸 요청 6건(11-21 10:54)과 도중에 더한 2건(보상 전체 완료 보상 분리, 가방 보물 주머니 첫 칸), 1건(스킬북 직업별 묶음). **`main` 병합·운영 배포 없음.**
- **거래소 탭**: `MarketView`에서 `sold`를 빼고 탭을 5개(`판매 중`·`최근 거래`·`내 거래`·`판매 등록`·`수령함 N/30`)로 줄였다. 판매 완료 기록은 `최근 거래`가 최근 순서로 보여 주고(서버 `view:'sold'` 계약은 그대로 — `load`가 `recent` → `sold`로 보낸다), 옛 상태나 잘못된 값이 들어오면 `switch`가 `MARKET_VIEWS` 검사로 `active`에 앉힌다. `내 거래`의 `판매 중인 물건만 보기`는 이제 오른쪽 줄(`.market-mine-bar` + `margin-left:auto`)에 붙였다(예전엔 스타일 없이 왼쪽에 홀로 떠 있었다).
- **수령함 빨간 점**: 메인 하단 거래소 아이콘이 숫자 배지(`.market-badge`) 대신 `.skill-nav-dot`과 같은 빨간 점(`.market-nav-dot`, `hud.css` 한 규칙)을 쓴다. 거래소 창에서는 `수령함` 탭 라벨 옆 `.market-inbox-dot`. **거래소 창을 열지 않아도 보이게** 하려고 거래소 API를 새로 부르지 않고, 이미 120초마다 도는 `journey-list` 응답에 `marketInbox`(미수령 건수)를 한 쿼리로 얹었다(`server/journey.mjs`). 클라이언트는 `Market.inboxCount`/`inboxAt`과 `Journey.inboxAt`을 비교해 **더 최근에 확인한 값**을 쓴다 — 수령 직후엔 바로 꺼지고, 새 배달은 다음 폴링에 켜진다(`updateMarketNavDot`).
- **수령함 30건 상한**: `server/market.mjs` `rules.maxInbox = 30`, 안내 문구는 `inboxFullMessage` 한 곳. `mutate`의 읽기 배치에 미수령 건수 쿼리를 더해 **판매 등록·구매** 시점에 30건 이상이면 `409 INBOX_FULL`(`수령함이 가득 찼습니다(최대 30건). 수령함에서 먼저 받아 주세요.`)로 막는다. 판매 보관료가 아니라 "돌아갈 자리" 문제라 등록을 먼저 막았고, **이미 성사된 판매대금·기존 매물의 만료/취소 반환은 그대로 보관**한다(테스트로 31번째 대금 확인). UI는 `수령함 N/30`·안내문·규칙 줄에 상한을 적었다.
- **판매 등록 칸**: 물품 칸을 `.market-register-grid` 5열(359px 이하 4열)·1:1 정사각형으로 줄이고, `bagStacks`로 같은 스킬북(`skillId`)을 한 칸 `×N`으로 모았다. `+N`은 왼쪽 아래(공용 규칙에 `.market-pick` 추가), 직업 배지는 좌상단, 추천 화살표는 아이콘 우상단, 이름은 한 줄 말줄임 — 장비는 id마다 달라 묶지 않고, 칸을 누르면 지금처럼 1개씩 가격 입력 폼이 열린다. `.market-modal button`(padding 8px)보다 특이도가 높도록 `.market-modal .market-pick`으로 적었다.
- **보상 탭**: `일일 보상`·`주간 보상` 탭 라벨을 `일일`/`주간`에서 바꾸고, 그 기간에 받을 보상(개별 미션 또는 전체 완료)이 있을 때만 `.reward-tab-dot`을 붙인다. 패널은 `전체 완료 보상` 카드를 **맨 위**(`.reward-completion`)로 올리고, 개별 미션은 `일일 미션`/`주간 미션` 제목 + `.reward-mission-group` 별도 묶음으로 분리했다.
- **가방 칸 순서(사용자 확정)**: `src/ui/bagStacks.ts`에 `bagKindRank`(주머니 0·장비 1·스킬북 2)·`compareBagItems(raritySort, myJob)`·`orderedBagItems`를 두어 **등급순을 켜도** 주머니가 첫 칸, 스킬북은 장비 뒤에 남는다. 스킬북 구간은 `skillBookJobRank`로 **내 직업 → 전사 → 궁수 → 마법사** 묶음이고 같은 직업 안에서는 그 직업 스킬 표 순서 → 이름 순. 공용창고는 `compareWarehouseItems(a,b,myJob)`·`slotRank`(주머니 -1)로 같은 규칙을 따르고, 장비는 지금처럼 부위 → 전투력 → 등급 → `+N` → 이름.
- **검증**: `tsc --noEmit` 통과, `vite build` 성공(769.17kB), `node --test tests/*.test.mjs` **1,096건 중 1,093 통과** — 실패 3건은 직전 커밋 `1a987b0`과 같은 기존 건(costume-field-render 2·`skill-ids` `hell` 이름 1). 신규 `tests/market-inbox-ui.test.mjs` 5건(5탭·`sold` 폴백·오른쪽 토글·`×N` 칸·빨간 점 최신값), `tests/bag-stack-order.test.mjs` 3건(3단 순서·직업 묶음·묶음 대표 id), `tests/market.test.mjs` 수령함 상한 1건(막힘·대금 유지·경계 29건), `tests/journey.test.mjs` `marketInbox` 1건, `journey-ui`·`warehouse-grid`·`item-protection-ui`에 순서·탭 점 검증 추가. `plus-badge`/`upgrade-badge`는 공용 `+N` 규칙 선택자에 `.market-pick`을 더한 만큼 기대 문자열을 맞췄다.
- **미리보기 배포 확인**: `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` = `8cdd86093a53`(`builtAt` 2026-11-21T02:13:55Z) HTTP 200, 배포 번들 `assets/index-Csuhdl-N.js`에 `market-nav-dot`·`market-inbox-dot`·`market-mine-bar`·`market-pick-count`·`reward-tab-dot`·`reward-missions-heading`·`reward-completion`·`marketInbox`·`판매 중인 물건만 보기`, CSS `assets/index-BxeqfE7c.css`에 `.market-nav-dot`·`.market-inbox-dot`·`.market-register-grid`·`.reward-tab-dot`·`.reward-mission-group` 포함 실측.

## 작업 249 — 거래소 판매 등록 스크롤 제거·묶음 등록(최대 10개)·전체/개당 구매 (미리보기, 2026-11-21)
- **배경**: 사용자 확정(11-21 11:46) "판매할템 선택하면 스크롤생기지않게해야함 묶음템은 한번에 개당갯수 적어서 등록할수있어야하고 구매할때는 묶음전체구매할지 개당구매할지 선택할수있어야함", 이어서 "한 매물당 최대 10개"와 "판매 등록 칸 한 줄에 8개". 직전 작업 248(가방 40칸·거래소 헤더/탭/간편 보기) 위로 rebase해 얹었다. **`main` 병합·운영 배포 없음.**
- **서버(`server/market.mjs`·`server/database.mjs`)**: `djrpg_market`에 `quantity`(기본 1)·`items_json`(남은 아이템 JSON 배열)을 더했다(새 DB는 DDL에, 기존 DB는 스키마 배치 뒤 `addMarketBundleColumns`가 `ALTER TABLE ADD COLUMN` — 실패하면 로그만 남기고 게임은 계속 돈다). `price`는 **개당 가격**으로 못 박고 `totalPrice = price × quantity`는 화면이 계산한다. `rules.maxBundle = 10`·`maxBundleMessage`, 초과하면 `400 INVALID_QUANTITY`.
  - **등록**: `itemIds`(UI가 고른 실제 묶음) 또는 `itemId`+`quantity`(서버가 같은 `skillId` 책을 가방 순서대로 모음). 같은 묶음 기준만 허용(`bundleKey`: 스킬북 `book:<skillId>`, 그 외 아이템 id), 소모품(보물 주머니)은 `ITEM_NOT_AVAILABLE`, 잠긴 장비는 기존 승인 흐름(승인 시 묶음 전부 해제), 총액 10억 상한. 가방에서 뺀 아이템은 모두 `djrpg_item_owners.location='escrow'`로 옮긴다.
  - **구매**: `quantity`가 없으면 **전체 구매**(기존 클라이언트 호환 — 기존 매물은 수량 1). `1 ≤ quantity ≤ 남은 수량` 검증, 전체면 `state='sold'`(그 행의 `quantity`는 팔린 수량), 부분이면 남은 수량·`items_json`으로 `active` 유지. 대금은 팔린 만큼(개당×수량 − 수수료 5% 올림)만 판매자 수령함에 넣고, 구매품은 아이템마다 수령함 한 줄.
  - **취소·만료**: 남은 아이템 전부를 판매자 수령함으로 반환(아이템마다 한 줄). 수령함의 `UNIQUE(listing_id,kind)`는 그대로 두고 묶음 매물만 종류를 `purchase:<아이템id>`·`return:<아이템id>`로 붙여 **테이블 재작성 없이** 부분 구매·반환이 여러 줄 생기게 했다(운영 DB 이전 위험 없음).
  - 수령함 상한(작업 247)은 구매에 `수령함 건수 + 구매 수량 > 30`으로 적용한다.
  - **열 보정이 실패해도 단건 거래는 살린다**: 등록 INSERT는 예전 열 목록 그대로 쓰고(새 열은 기본값), 묶음일 때만 `UPDATE quantity/items_json`을 덧붙인다. 구매도 마지막 한 개를 사는 경우(또는 단건 매물)는 예전 UPDATE 문장으로 닫는다 — 새 열이 없는 DB에서도 기존 단건 등록·구매·취소가 종전대로 동작한다.
- **화면(`src/ui/modals/marketModal.ts`·`src/styles/market.css`·`src/game/market.ts`·`src/ui/bagStacks.ts`)**: 248의 헤더·5 인덱스 탭·간편/상세 보기·정사각 칸은 그대로 두고 다음만 얹었다.
  - 판매 등록 중에만 모달에 `.market-registering`을 붙여 `display:flex; overflow:hidden`으로 만들고, **물품 그리드만 내부 스크롤**, 선택 카드(`.market-register-detail`)는 그리드 아래 고정 바(카드가 길면 카드 안에서만 스크롤) — 아이템을 골라도 모달 전체 스크롤이 새로 생기지 않는다.
  - 물품 칸은 **한 줄 8칸**(간격 4px, 아이콘 34px·배지 축소, 359px 이하 간격 3px).
  - 선택 카드: 아이콘+이름+`보유 ×N` → 최근 거래가 → **수량(1~min(보유,10), `최대` 버튼)** + **개당 가격** → `총 N개 · 총액 · 수수료 · 예상 수령` 라이브 계산 → 버튼이 `N개 묶음 등록`으로 바뀐다. 등록은 `itemIds`+`price`로 보낸다(단건도 `itemIds` 하나).
  - 목록(상세·간편·최근 거래)은 수량 2개 이상이면 `개당` 라벨 + 가격 + `총 N개`, 상세에는 **`전체 구매(N개)`** 와 수량 입력 + **`선택 수량 구매(n개)`** 두 버튼(단건 매물은 기존 `구매 확정` 그대로).
  - `Market`은 `quantity`(등록 수량)·`buyQuantity`(매물별 구매 수량)를 들고, `applyEffect`가 부분 구매 뒤 남은 수량을 즉시 반영하되 `myActive`는 **새 등록만** 센다(서버가 등록에 `mine:true`를 싣는다).
- **검증**: `tsc --noEmit` 통과, `vite build` 성공(777.31kB, `assets/index-DNsROdlX.js`). `tests/market.test.mjs` 32→35건(묶음 등록·개당 가격·부분/전체 구매·10개 초과·다른 스킬북 섞기·보유 초과·취소/만료 전량 반환·stale 화면 동시 구매·소유권/저장 무결성), 신규 `tests/market-bundle-ui.test.mjs` 4건(스크롤 구조·수량/개당 카드·10개 상한·전체/선택 구매), `item-protection-ui`의 등록 payload 기대값을 `itemIds`로 갱신, 248의 `market-view-toggle` 배지 좌표·크기를 8칸 기준으로 갱신. 전체 `node --test tests/*.test.mjs` 1,124건 중 1,121 통과 — 실패 3건(코스튬 렌더 2·스킬북 `hell` 1)은 `4e04eaf`에서도 같은 기존 실패다(전투 테스트 1건이 실행에 따라 간헐적으로 더 실패하는데, `4e04eaf`에서 같은 두 파일을 6회 돌려 1회 재현 — 이번 작업과 무관).
- **미리보기 배포 확인**: `origin preview/gravel-background-fks3997` `5133a74` → `dc5d72f` → `0ea20b4`, `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` = `0ea20b44d407`(`builtAt` 2026-11-21T03:31:56Z)·루트 200(그 뒤 문서 커밋은 같은 코드로 재배포되어 version.json이 그 해시가 된다). 배포 번들 `assets/index-BnMiPQH0.js`에 `market-registering`·`market-register-detail`·`market-register-quantity`·`market-buy-quantity`·`market-bundle-count`·`market-pick-count-inline`·`전체 구매`·`선택 수량 구매`·`묶음 등록`·`maxBundle`, CSS `assets/index-D9NdJmn7.css`에 `.market-registering`·`.market-register-detail`·`.market-buy-quantity`·`repeat(8`·`.market-unit-label` 포함 실측. **서버 쪽 `ALTER TABLE`은 배포 뒤 첫 거래소 요청 때 한 번 돌므로, 실제 등록·구매는 사용자의 인게임 확인이 필요하다.**

## 작업 257 — 거래소 판매 중 서브 필터 탭·간편보기 4~5열 카드 그리드·카드 상세 팝업·카드 배지 확대 (미리보기, 2026-11-21)
- **사용자 지시(`#8958`)**: "간편보기는 간편하지가 않아. 한 줄에 4~5개 표시돼도 되고 이미지가 크게 한 화면에 여러 개 볼 수 있게 해야 간편보기지" / "간편보기일 때 +1 표시가 이미지를 다 가려".
  - 판매 중 목록 위에 **`전체`·`장비`·`스킬북`** 서브 필터 탭(`Market.kind`, 서버 `filters` 계약은 그대로 — 받은 한 페이지를 화면에서 거른다, 칩에 이 페이지 건수).
  - 간편 보기를 한 줄 목록 → **정사각형 카드 그리드**(`.market-compact-grid` = `repeat(auto-fill, minmax(76px, 1fr))` → 폰 4열·모달 5열). 카드에는 큰 아이콘 + 가격(개당)만, 묶음 `×N`·내 매물 표시·등급 테두리·추천 화살표는 유지.
  - 카드의 `상세`/`구매` 버튼을 없애고, **카드를 누르면 `.market-sheet` 바텀시트**가 즉시 뜬다 — 능력치·추가옵션·판매자·개당/총 수량 + `listingDetail`(장비 비교·`전체 구매`/`선택 수량 구매`·등록 취소). 게스트는 읽기만 되고 구매만 잠긴다.
  - `+N`은 아이콘 칸(`.market-card-art`) 왼쪽 아래 모서리에만 작게(아이콘 중앙을 가리지 않는다).
- **피드백 `#9078`**: 종류 탭을 `간편보기/자세히보기` 아이콘과 **같은 한 줄**(`.market-list-toolbar`)로 옮기고 인덱스 탭 톤으로 정리(세로 1줄 절약).
- **피드백 `#9089`**: 종류 탭·보기 전환·상단 메인 탭을 바꾸면 `Market.clearSelection()`으로 선택된 매물·상세 바·판매 등록 포커스·수량·시세 상자가 초기화된다.
- **피드백 `#9105`**: 카드가 커진 만큼 직업 배지 10.5px·업그레이드 화살표 16px·`+N` 11.5px·스킬북 동그라미 스킬 아이콘 `clamp(24px, 6.6vw, 32px)`. 스킬북 카드는 동그라미와 겹치지 않게 `×N`을 오른쪽 위로 올린다(`:has`).
- **검증**: `npx tsc --noEmit`·`npx vite build`(792.17kB) 통과, 신규 `tests/market-compact-grid.test.mjs` **12/12**, `market-view-toggle` 5/5, 거래소 관련(`market`·`market-bundle-ui`·`market-actions`·`market-inbox-ui`·`market-index`·`multi-character-market`·`item-protection-ui`·`upgrade-badge`·`plus-badge`) 전부 통과. 전체 1,141건 중 1,048 통과 — 실패 93건은 `public/assets/**`가 없는 이 체크아웃의 기존 건.
- **미리보기 배포 확인**: `preview/gravel-background-fks3997` `76540cb` → `7132f93` → `ce1dc4d` → `9fba6d3` → **`04b146e`**, `version.json` = `04b146e5aa19`(`builtAt` 2026-11-21T07:27:59Z). 실브라우저(게스트·390~500px 모달)에서 5열 카드·가격만·`궁수`/`마법사` 배지·초록 화살표·`+1`·스킬북 동그라미 확인, 카드 탭 → 상세 팝업(`공격 +18 · 체력 +39`·비교표·`구매 확정` 잠김) 확인. 스크린샷 `browser/market257-final-2026-11-21-162916.png`·`browser/market257-sheet-2026-11-21-162931.png`. **`main` 병합·운영 배포는 하지 않았다**(미리보기 전용, 사용자 지시 대기).
- **피드백 `#9143`·`#9155`(상단 바 자리 조정)**: `간편/자세히` 아이콘을 `76540cb`의 원래 자리(**결과 줄 `7건` 바로 아래**)로 되돌리고, **종류 탭(`전체`·`장비`·`스킬북`)을 그 줄 왼쪽**에 붙였다. 탭은 `.market-list-toolbar`의 `justify-content: space-between` + `.market-kind-tabs` `flex: 0 1 auto`·`.market-kind-tab` `flex: 0 0 auto`(패딩 5px 8px)로 **가로를 꽉 채우지 않고 왼쪽에 오밀조밀**, 아이콘은 오른쪽 끝. 폭이 모자라면 탭 줄만 가로 스크롤(스크롤바 숨김)된다. 검증: `tsc --noEmit`·`vite build` 통과, `market-compact-grid` 12/12·`market-view-toggle` 5/5(툴바 위치·탭 flex 계약 갱신). 미리보기 `eeaae85d7ce8`(`builtAt` 2026-11-21T07:41:41Z) 배포 후 게스트 실화면 확인 — 스크린샷 `browser/m257-9155-02-2026-11-21-164605.png`·`browser/m257-9155-toolbar-2026-11-21-164611.png`(간편)·`browser/m257-9155-03-detail-2026-11-21-164627.png`(상세). **`main` 병합·PR은 사용자 확인 대기.**
