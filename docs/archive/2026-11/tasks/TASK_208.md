# 작업 208 — 업적 개편(보스 합산·스킬 강화 횟수) + 장비 도감 등급별 570종 + 보물 주머니 레전드 전광판 + 새 시즌 안내

> 담당: fks3997 · 브랜치: `work/208-achievements-codex-announce` → `preview/gravel-background-fks3997` · 상태: `[x]`
> 사용자 확정(11-20): ① 전광판 `#3965` ② 등급별 도감 카운팅·활·지팡이 포함 570종 `#3992`/`#4025`
> ③ 업적 단계·보스 합산 `#3992`/`#4008` ④ 새 시즌 안내 문구 `#4047` ⑤ 새 시즌 환영 우편
> (`1,000G + 무작위 보물 주머니 1개`, `#4069`) ⑥ 전 슬롯 방치 기념 다이아 **4,000개**(`#4170`)
> ⑦ 업적 보상 개편(스킬북 제거 → 금화 사다리 + 후반 보물 주머니, `#4150`/`#4157`).
> `main` 병합 금지 — 미리보기 확인 후 사용자 지시로 진행.

## 1. 보물 주머니 레전드 전광판 (`#3965`)

### 1.1 서버 (`server/announcements.mjs` 신규, `server/database.mjs`, `server/endpoints/market.mjs`)
- `djrpg_announcements(id, account_id, character, item, created_at)` 표 + `created_at` 인덱스. 시즌 초기화 대상에도 넣었다(`server/season.mjs` `RESET_TABLES`).
- `POST /api/market { action:'announcePouchLegend', itemName }` — 정식 계정만(`게스트` → 403 `GUEST_READ_ONLY`), 이름은 **세이브의 캐릭터 이름**, 아이템 이름은 한 줄로 다듬어 **60자 이하**만(400 `INVALID_ITEM`). 같은 계정이 **5초 안**에 다시 올리면 한 줄만 남는다(연타·재전송 방지). 하루치만 남기고 정리한다.
- `POST /api/market { action:'announcements' }` — **최근 5분**(`ANNOUNCEMENT_WINDOW_MS`) 공지만 오래된 순으로 최대 20줄. 게스트도 읽을 수 있고 쓰기만 막는다.
- 미리보기·운영이 같은 Turso DB를 보므로 표는 `schema()`가 만들고, 이관 스크립트(`scripts/migrate-turso-db.mjs`)에는 **옵션 표**로 넣어 예전 공용 DB에 없어도 건너뛴다(20개 표).

### 1.2 클라이언트 (`src/game/legendBoard.ts`·`src/ui/legendBar.ts` 신규, `src/ui/interface.ts`, `src/ui/modals/pouchModal.ts`, `src/styles/hud.css`)
- 문구 고정: **`🎉 {캐릭터명}님이 보물 주머니에서 [{아이템명}]을(를) 획득했습니다!`**, 배너는 **5.5초**(`LEGEND_BANNER_MS`, 5~6초 확정).
- `LegendBoard`(순수 상태): `seen`(띄운 id 기억)·5분 창 밖 줄은 기억만 하고 띄우지 않음·대기열 최대 5줄·받은 순서대로 하나씩. 내가 뽑은 줄은 `show()`로 맨 앞에 선다.
- `mountLegendBar(ui)`: 화면 위쪽 `.legend-bar`(position fixed·z-index 70·황금빛 띠)를 200ms마다 갱신하고, **5초마다** `/api/market {action:'announcements'}`를 확인한다(게스트·`document.hidden`은 건너뜀).
- `openPouchWindow`가 주머니에서 **레전드 장비**(`isLegendaryPouchResult`)를 뽑으면 `ui.sharePouchLegend(아이템 표시 이름)` → 서버 기록 성공 시 그 줄을, 실패·게스트는 로컬 줄을 띄운다(내 화면은 서버 상태와 무관하게 보인다).

## 2. 장비 도감 등급별 카운팅 수정 + 활·지팡이 포함 570종 (`#3992`, `#4025`)

### 2.1 버그와 원인
- `equipmentCodexKey(item)`가 `${slot}:${index}`만 남겨, **일반 한 벌만 먹어도 매직·레어·에픽·유니크·레전드까지 발견**으로 잡혔다. 업적 `장비 도감 수집`도 기본형 개수(75)로만 셌다.

### 2.2 수정 (`src/game/codex.ts`)
- `codexEntries` = **95종**: 부위 9종(무기 10·문장 5·투구 10·갑옷 10·목걸이 5·장갑 10·허리띠 10·신발 10·반지 5) + 무기 세 갈래 **대검 0~9 · 활 10~19 · 지팡이 20~29**(`CODEX_BOW_OFFSET`·`CODEX_STAFF_OFFSET`, `entry.group` = `대검`/`활`/`지팡이`, `entry.tier` = 그 목록 안 순번).
- **`equipmentCodexVariantKey(item)` = `부위:번호:등급`** — 실제로 획득한 등급만 `save.equipmentCollection`에 남는다. 판정은 `codexVariants`가 등급 단위로 하고, 미발견 등급은 `미발견`으로 남는다.
- `normalizeCollection`은 **570칸에 있는 키만** 통과시킨다. 구버전 `부위:번호` 키는 버리고, 같은 세이브의 `bag`+`equipment`에서 `discoverEquipment`가 실제 등급을 다시 찾는다(구세이브 마이그레이션 안전).
- `codexBaseIndex`가 활·지팡이를 무기 번호로 옮기고 나머지는 `baseItemIndex`(그림과 같은 규칙)를 쓴다 → **도감 칸과 `equipmentImage` 프레임이 어긋나지 않는다**(활 `bow_{0,5}.png`·지팡이 `staff_{0,5}.png`, 착용 외형 시트는 없음).
- `firstDropFloor`·`codexOptions`는 `entry.tier`로 계산한다(활·지팡이도 대검과 같은 곡선).

### 2.3 화면·서버
- `src/ui/modals/codexModal.ts`: 요약은 **`발견 N / 570`**(= `equipmentCollection` 길이), 무기 카드에 `무기 · 활`처럼 갈래를 표시, 발견/미발견 판정은 **등급 단위**. 검색·부위·등급·상태 필터도 등급 단위(`found`/`missing`/`owned`).
- `server/database.mjs` `writeSave`: `equipmentCollection` 정규식 `^(부위):\d{1,2}:(등급)$`·상한 **570**(합집합 유지). 무기는 두 자리 번호까지 온다.

## 3. 업적 개편 & 보스 합산 카운팅 (`#3992`, `#4008`, `#4150`, `#4157`)

### 3.1 단계 (`server/journey-state.mjs`)
| 분류 | 목표 |
|---|---|
| 캐릭터 레벨 `level` | 5·10·15·20·25·30 |
| 몬스터 처치 `kills` | 500·1,000·2,000·4,000·8,000·16,000·32,000 |
| 보스 처치 `boss` | 10·50·100·150·200 |
| 최고 도달 층 `floor` | 5·10·15·20 |
| 장비 도감 수집 `collection` | 10·50·100·200·300·450·570 |
| 스킬 강화 횟수 `skills` | 5·15·30·50·100 |
| 최고 스킬 레벨 `rank` | 5·10·15·20·25·30 |

- `collection` = `collectionCount(save)` — `부위:번호:등급` 키만 센다(`save.equipmentCollection.length`).
- `skills` = `skillUpgradeCount(save)` = `Σ max(0, 레벨-1)` (배운 스킬의 1레벨 제외).

### 3.2 보스 합산 — 세이브 `bossKills` 하나
- 사냥터 층 보스 + **필드 정예 몹**(`src/game/world.ts` `kill`: `enemy.boss || enemy.elite`),
- **던전 5·10층 보스 클리어**(`src/ui/dungeonField.ts` → `dungeonBossKills(floor,true)`·`addBossKill`),
- **월드보스 도전/처치**(`src/ui/worldBossField.ts`: 서버가 도전을 끝냈다고 알린 그 순간 1회 — `finishSent` 가드).
- 공용 규칙은 `src/game/bossCount.ts`(`addBossKill`·`dungeonBossKills`·`isDungeonBossFloor`).

### 3.3 보상 (`achievementReward(index, count)`)
- **스킬북 직접 지급 없음**(모든 단계 `books: 0`).
- 금화 사다리 `[1000, 2000, 3000, 5000, 8000, 12000, 20000]`(단계 인덱스, 마지막 값을 넘지 않음).
- 보물 주머니: **각 업적의 마지막 단계 2개**, 4단계 이상 사슬은 **3번째 단계(index 2)부터 1개**.
- `server/journey.mjs` `rewards()`가 일일·주간과 같은 경로로 `무작위 보물 주머니`를 지급하고, `ui/modals/utilityModal.ts` `taskRow`가 `보물 주머니 N개`를 표시한다(업적 카드 포함).

## 4. 시즌 안내 문구·우편 (`#4047`, `#4069`, `#4170`)

### 4.1 새 시즌 환영 우편 (`server/journey-state.mjs`)
- `SEASON_NOTICE_ID = 'season-2-open'` — `grantSeasonNotice`가 계정마다 **한 번만**(`state.notices` 이력).
- 제목 `[새 시즌 오픈] 대공사 새 시즌 오픈! 기념 보물 주머니 1개를 드립니다`, 본문에 같은 안내 + 초기화 범위·직업/성별 재선택 안내.
- 보상 **금화 1,000 + `pouches: 1`**(`books: 0`), 만료 없음.
- 전 슬롯 방치 기념 다이아 우편은 **4,000개**로 올렸다(`다이아 4,000개 지급`, 만료 없음). 시즌 초기화가 `djrpg_journey`를 비우므로 새 시즌 첫 조회에 **다시 지급**된다(게스트 제외 — `diamondMailEligible`).

### 4.2 화면 문구 (`src/ui/login.ts` `openSeasonSetup`)
- `대공사 업데이트로 새 시즌이 시작되었습니다.` + 초기화 범위(레벨·장비·가방·다이아·층수·거래소·창고·던전·월드보스·우편) + `직업과 성별을 새로 선택해 모험을 시작하세요!` + `새 시즌 오픈 기념으로 금화 1,000과 무작위 보물 주머니 1개를 우편으로 보내 드렸습니다.`

## 5. 검증

- `npx tsc --noEmit` 통과, `npx vite build` 통과(6초).
- 신규/보강 테스트: `codex` **15/15**(570칸·등급별 발견·활/지팡이·구키 마이그레이션), `achievements` **9/9**(단계·보스 합산·스킬 강화 횟수·도감 카운트·보상 사다리), `announcements` **4/4**(5분 창·중복·이름 정규화·게스트 403·엔드포인트), `legend-board` **6/6**(문구·레전드 판정·중복·순서·5.5초·대기열), `season-reset` **5/5**(새 시즌 우편 + 다이아 4,000 동시 지급·게스트 제외), `journey` **13/13**(업적 수령 = 금화+주머니, 스킬북 0), `journey-ui` 13/13, `treasure-pouch`·`elite-mob`·`dungeon-battle` 회귀 통과, `modal-ui`·`characters`·`market`·`migrate-turso-db` 갱신 통과.
- 전체 `tests/*.test.mjs`: **674건 중 627 통과**, 실패 47건은 이 작업 전 `bae77dd`와 **같은 목록**(전부 `public/assets/**` ENOENT — 이 체크아웃이 `public/`을 빼고 받은 sparse 체크아웃이라 생기는 기존 실패).
- 브라우저 실기·미리보기 주머니 연출 확인은 사용자 몫.
