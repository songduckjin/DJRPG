# 작업 206 — 필드 정예 몹 + 시즌 100% 초기화(로그인 시 직업·성별 재선택) + 타직업 스킬북 차단

> 담당: fks3997 · 브랜치: `work/206-elite-season-setup` → `preview/gravel-background-fks3997` · 상태: `[x]`
> 사용자 확정(11-20): 정예 `30마리당 1마리`·`체력 2배`·`금화·경험치 2배`·**드롭률은 그대로(1배)**,
> 시즌 초기화는 **다이아까지 100%**(게스트 제외, ID·비번만 유지). `main` 병합 금지 — 미리보기 확인용.

## 1. 필드 정예 몹 (`#3551`, `#3558`, `#3569`)

### 1.1 스폰·스펙 (`src/game/world.ts`)
- `ELITE_KILL_INTERVAL = 30` · `ELITE_HP_SCALE = 2` · `ELITE_REWARD_SCALE = 2` · `ELITE_MOB_SCALE = 1.22`(렌더).
- `Enemy.elite?: boolean`(선택 필드 — 던전 몹·옛 테스트 객체는 그대로 컴파일된다).
- `World.eliteKills`(일반 몹 처치 카운터) · `World.elitePending`(다음 스폰 예약). 일반 몹을 잡을 때마다 카운터가 오르고 **30**이 되면 예약, 스폰에서 소비된다. 정예 자신의 처치는 다음 정예 카운트에 넣지 않는다.
- 스폰(`update`): `boss`가 먼저 계산되고 `elite = !boss && elitePending` — **보스 타이밍과 겹치면 보스가 우선**이고 정예 예약은 남아 다음 스폰이 가져간다.
- 체력 `enemyMaxHp(floor, false) * 2`, 금화 `(3 + floor) * 2`, 경험치 `8 * 2 = 16`.
- **장비·스킬북 드롭률은 일반 몹과 같은 1배** — `kill`이 정예에서도 `equipmentDropChance(floor, false)`·`skillBookDropChance(floor, false)`를 그대로 쓴다(보스 배율로 새지 않는다).
- `travelToFloor`가 `eliteKills`·`elitePending`을 초기화한다. 층을 옮겨도 이어 세지 않는다.
- 스폰 때 `정예 해골이 나타났습니다!` 안내(30마리마다 한 번).

### 1.2 시각 구분 (`src/game/render/entities.ts`, `render.ts`)
- 정예는 일반 몹의 **1.22배** 몸(`h * .095 * ELITE_MOB_SCALE / texture.height`), 발밑에 **금빛 오라**(지면 타원 + 1px 링, `time`으로 숨쉬듯 커졌다 작아짐), 머리 위 **`정예 해골` 금빛 배지**(일반 10px, 보스 11px와 구분), 체력바 폭 30px(일반 26·보스 40), 체력바 색 `#e0873a`.
- `GameView.bossLabels` → `enemyLabels`(보스·정예 이름표 공용 맵). 정예 스프라이트는 보스가 아니라 일반 해골 시트를 쓴다(틴트 `0xffe4bb`).

## 2. 시즌 100% 초기화 + 로그인 시 직업·성별 재선택 (`#3544`, `#3551`)

### 2.1 안전장치 — 운영 호스트에서만 (`server/season.mjs`)
- 미리보기(`preview-…djrpg.pages.dev`)와 운영(`djrpg.pages.dev`)은 **같은 Cloudflare Pages 프로젝트·같은 Turso DB**를 본다(`wrangler.toml` 없음 → 대시보드 환경변수 공용). 그래서 미리보기에서 초기화가 돌면 **운영 유저 데이터가 지워진다.**
- `seasonArmed(request, env)`: `request.url`의 **호스트가 `djrpg.pages.dev`(또는 `DJRPG_PRODUCTION_HOSTS`에 추가한 호스트)일 때만** true. 미리보기·배포 해시 호스트·URL 없는 어댑터(Vercel `api/`)는 **조회조차 하지 않고** false.
- 긴급 정지 스위치: `DJRPG_SEASON_RESET=off`(운영에서도 초기화를 막는다).
- 결과: 이번 미리보기 배포로는 **아무 데이터도 지워지지 않는다.** `main` 병합 → 운영 배포의 첫 요청에서 한 번 돈다.

### 2.2 전역 1회성 마이그레이션 (`server/season.mjs` `runSeasonReset`, `server/database.mjs`)
- `djrpg_meta(key,value)` 표 추가. `season_epoch` 행이 없을 때만 초기화하고, 트랜잭션 안에서 다시 확인한 뒤 `season_epoch = SEASON_EPOCH(2)`를 적는다 → **콜드 스타트·동시 요청에도 딱 1회**.
- 비우는 것: `djrpg_market`·`_market_events`·`_market_inbox`·`_market_requests`·`djrpg_warehouse`·`_warehouse_requests`·`djrpg_item_owners`·`djrpg_character_item_owners`·`djrpg_dungeon_records`·`djrpg_boss_days`·`_boss_attempts`·`_boss_scores`·`_boss_rewards`·`djrpg_journey`·`djrpg_save_requests`·`djrpg_save_versions`·`djrpg_shop_entitlements`. 던전·월드보스 표는 처음 쓰일 때 생기므로 **없으면 건너뛴다**(`sqlite_master` 확인).
- 100% 초기화: 일반 계정의 `djrpg_characters` 행 삭제, `djrpg_accounts.save_json` → `seasonResetSave`(1층·0골드·빈 가방·`needsSetup:true`·`season:2`, **이름은 유지** — `json_set`으로 `$.name`·`$.accountId`만 채운다), `djrpg_account_profiles`(`shared_gold 0`·`active_slot 1`), `djrpg_shop_wallet`(`diamonds 0`·`max_slots 3` — 다이아·부캐 슬롯도 초기화).
- 남기는 것: `djrpg_accounts`의 **`id`·`password_hash`·`session_id`**, 결제 기록(`djrpg_shop_orders`·`djrpg_shop_ledger`), 결제 멱등 기록(`djrpg_shop_requests` → 재시도로 다이아가 두 번 지급되는 것을 막는다), `djrpg_shop_wallet.customer_key`.
- **게스트 제외**: `password_hash = 'guest'` 계정의 세이브·캐릭터는 건드리지 않는다(초기화는 일반 가입 계정만).

### 2.3 로그인 흐름 (`server/endpoints/account.mjs`, `src/ui/login.ts`)
- `login`·`load` 응답에 `needsSetup`(=`save.needsSetup === true`)가 실린다. 기존 기기에 남은 토큰도 `load`에서 같은 표시를 받는다.
- `src/ui/login.ts` `openSeasonSetup`: 로그인·자동 복원 직후 `needsSetup`이면 로그인 화면을 가리고 **`새 시즌 시작 — 직업과 성별을 선택해 주세요`** 패널을 띄운다(전사/궁수/마법사 · 남성/여성, 성별 버튼 문구는 직업에 맞춰 바뀐다). `완료`는 `completeSetup`을 보내고, 응답의 새 세이브로 인계한다. 실패하면 패널에 이유를 보여 주고 다시 시도할 수 있으며 `다른 계정으로 로그인`으로 토큰을 지울 수 있다.
- `completeSetup`(신규 액션): `needsSetup === true`인 계정만, `gender ∈ {male,female}`·`job ∈ {warrior,archer,mage}`일 때 `initialSave`(해당 직업 첫 확정 무기 루트·1층)를 만들어 `writeSave`로 저장하고 리비전을 올린다. 이미 끝난 계정은 **409 `SETUP_DONE`**(오래된 기기의 완료 요청이 진행을 덮지 않는다).
- 설정 전에는 어떤 클라이언트도 세이브할 수 없다 — `save`/`reset`이 **409 `SEASON_SETUP_REQUIRED`**. 구버전 번들은 버전 가드(426)로 새 번들을 받으므로 `needsSetup`을 모르는 채 덮어쓸 수 없다.
- 세이브 계약: `Save.needsSetup?: boolean`·`Save.season?: number`(선택 필드, `parseSave`는 게임 세이브에서 이 둘을 남기지 않는다).

### 2.4 새 파일
- `server/save-seed.mjs`: `jobs`·`jobOf`·`initialSave`(가입·캐릭터 추가·시즌 초기화가 함께 쓰는 한 곳)·`seasonResetSave`.
- `server/season.mjs`: `SEASON_EPOCH`·`PRODUCTION_HOSTS`·`seasonArmed`·`RESET_TABLES`·`runSeasonReset`.

## 3. 타직업 스킬북 소모 방지 (작업 205 보고)

- `src/game/store.ts` `useSkillBook`: 스킬북의 주인(`skillBookJob`)이 내 직업이 아니면 **사용하지 않고 소모하지도 않는다** → `{ ok:false, message:'{직업} 전용 스킬북입니다' }`. 가방(장비창)과 스킬북 탭이 같은 함수를 쓰므로 두 곳 모두 막힌다.
- `src/ui/skillBooks.ts` `renderSkillUpgrade`: 다른 직업 책 카드는 버튼이 `{직업} 전용`으로 잠기고 안내 문구도 `{직업} 전용 스킬북`으로 바뀐다(눌러 볼 필요 없이 한눈에 보인다).
- 직업이 없는 옛 세이브는 전사로 본다(`jobOrDefault`).

## 4. 검증

- `npx tsc --noEmit` 통과, `npx vite build` 통과(번들 `index-*.js`).
- 신규 `tests/elite-mob.test.mjs` **4/4**(30마리 스폰·2배 체력/금화/경험치·드롭 1배·보스 우선·층 이동 초기화).
- 신규 `tests/season-reset.test.mjs` **3/3**(미리보기 호스트 무동작·운영 1회 실행·ID/비번/세션 유지·공용 데이터 비움·다이아/슬롯 초기화·게스트 보존·두 번째 요청 무동작·설정 전 저장 409·`completeSetup`·재로그인 정상 입장).
- 신규 `tests/skillbook-job.test.mjs` **3/3**(전사·궁수·마법사 × 타직업 책 4조합 거부·세이브 불변·내 책만 소모·옛 세이브 전사 취급·드롭 3직업).
- 회귀: `world-movement`·`item-drop-jobs`·`skill-ui`·`characters`·`functions-adapter` **40/40**, `field-loot`·`dungeon-battle`·`job-filter`·`modal-ui`·`skill-progression`·`loadout`·`item-protection-ui`·`shop`·`market`·`balance-196`·`offline` 등 **159건 중 157 통과**(실패 2건은 이 sparse 체크아웃에 `public/assets/**`가 없어 나오는 기존 실패), `migrate-turso-db` **6/6**(`djrpg_meta` 이관 목록 추가).
- 전체 `npm test` 634건 중 587 통과 — 실패 47건은 전부 `public/assets/**` ENOENT(체크아웃에 `public/` 없음, 변경 전과 같은 파일).
- 미리보기 배포 확인은 `docs/WORKLOG.md`의 206 항목에 기록했다. **`main` 병합 없음**, 모바일 실기 확인은 사용자 몫.
