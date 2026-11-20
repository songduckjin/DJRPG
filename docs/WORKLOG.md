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
