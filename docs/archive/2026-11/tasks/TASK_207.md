# 작업 207 — 일일·주간 미션 개편 + 월드보스 1일 1회 + 무작위 보물 주머니(가방에서 까기)

> 담당: fks3997 · 브랜치: `preview/gravel-background-fks3997`(기준 `c6de2b9`) · 상태: `[-]`(검증 중 · **주머니 그림 확정 대기**)
> 사용자 확정(11-20): 개별 미션은 **금화만**, 전체 완료 보상만 주머니(일일 1 · 주간 3). 미션은 각 5개(사냥터 보스 빼고
> **월드보스 도전·장비 분해** 추가), 월드보스는 **하루 1회**. `main` 병합 금지 — 미리보기 확인용.
> **주머니 아이콘·일러스트는 사용자가 시안 3개 중 하나를 고른 뒤 확정**된다. 그때까지 그림은 CSS 플레이스홀더다.

## 1. 일일·주간 미션 (5개 + 전체 완료) — `server/journey-state.mjs`

| 구분 | 미션 | 지표 | 보상 |
|---|---|---|---|
| 일일 | 오늘 접속 | `login`(1) | 300G |
| 일일 | 몬스터 300마리 처치 | `kills`(300) | 1,000G |
| 일일 | 30분 플레이 | `seconds`(1,800) | 1,000G |
| 일일 | **월드보스 1회 도전** | `worldBoss`(1) | 1,500G |
| 일일 | **장비 분해 3회** | `salvage`(3) | 800G |
| 일일 전체 완료 | 5개 모두 | — | 2,000G + **무작위 보물 주머니 1개** |
| 주간 | 일일 목표 5일 완료 | `days`(5) | 5,000G |
| 주간 | 몬스터 2,000마리 처치 | `kills`(2,000) | 5,000G |
| 주간 | 3시간 플레이 | `seconds`(10,800) | 5,000G |
| 주간 | **월드보스 5일 도전** | `worldBoss`(5) | 8,000G |
| 주간 | **장비 분해 15회** | `salvage`(15) | 5,000G |
| 주간 전체 완료 | 5개 모두 | — | 10,000G + **무작위 보물 주머니 3개** |

- 모든 개별 미션 `books: 0`(스킬북 없음). 전체 완료 보상만 `pouches: 1`/`pouches: 3`, 금화는 종전 액수 그대로.
- **사냥터 보스 미션(`boss`) 제거** — 지표 `bosses`(`bossKills`)는 여정 상태에 계속 쌓이지만 쓰는 미션은 없다.
- 기존 지표(`kills`·`seconds`·`days`)는 세이브 누적 값의 증가분으로 센다. 새 지표 둘:
  - `salvage` — 세이브의 **`salvageCount`** 증가분. 수동(개별·일괄)·자동 분해가 **분해한 장비 수**만큼 올린다
    (`salvageItems`·`salvageByRarity`·`autoSalvageRecovered`). `writeSave`가 이 값을 단조 증가로 보존하고
    (옛 클라이언트가 빼고 보내도 잃지 않는다) `parseSave`가 0 이상 정수로 읽는다.
  - `worldBoss` — **서버가 직접 적는다**. `server/world-boss.mjs` `start`가 시도를 만든 뒤
    `recordJourneyMetric(tx, row, 'worldBoss')`로 일일·주간 카운터를 1 올린다(같은 `requestId` 재시도는 기존 시도를
    돌려주므로 두 번 세지 않는다). 여정 상태 SELECT는 start의 기존 배치에 함께 넣어 **추가 왕복 1회**만 쓴다.
  - `advanceJourney`가 새 지표를 `0`에서 시작하고(`worldBoss ??= 0`·`salvage ??= 0`), `journeyView`는 없는 값을 0으로 읽는다.
- 수령(`server/journey.mjs` `rewards`): `pouches` 합계만큼 `randomUUID()` 주머니를 `save.bag`에 넣는다. 주머니는
  **장비 40칸을 쓰지 않는다**(서버 검증도 `slot !== 'pouch'` 제외). 일일 5개를 모두 받으면 `weekly.days`가 1 오른다(종전 규칙).
- 보상 카드(`ui/modals/utilityModal.ts`): `보물 주머니 N개`가 금화 옆에 주황색(`.pouch-reward`)으로 표시된다.

## 2. 월드보스 하루 1회 — `server/world-boss.mjs`, `ui/*`

- `WORLD_BOSS_DAILY_ATTEMPTS = 1`(종전 3). `remaining = max(0, 1 - 오늘 시도 수)`, `BOSS_LIMIT` 문구
  `오늘 도전 1회를 모두 사용했습니다.`, 응답에 `maxAttempts`를 실어 화면이 숫자를 서버 값으로 그린다.
- 화면: `.wb-entry-count` 초기값 `1/1`, `worldBossLive`의 `남은 도전 N/M`·`도전하기 · N/M`, 안내 문구 `계정당 하루 1회`.
- 계정 내 캐릭터 공유·하루 경계(오전 5시)·`BOSS_ALREADY_ACTIVE`/`BOSS_DEFEATED` 규칙은 그대로다.

## 3. 무작위 보물 주머니 — 아이템 (`src/game/items.ts`, `store.ts`, `bagCapacity.ts`)

- `TreasurePouch = { id, name:'무작위 보물 주머니', slot:'pouch', rarity:'unique', kind:'pouch', stats:{} }` · `Item` 유니온에 추가.
- `isPouch`·`isEquipment`(스킬북·주머니가 아닌 것)·`pouchItem`.
- `migrateItem`: `kind==='pouch'` 또는 `slot==='pouch'`면 저장된 이름 그대로 읽는다(서버 identity가 이름을 포함).
- **보호**: 자동 장착·자동 분해(`autoSalvageBlock → 'pouch'`)·일괄 분해·경매장 판매 목록·도감·`itemPower`(0)·
  장비 40칸(`equipmentCount`·`parseSave`·`canStoreItem`) 어디에도 끼지 않는다. 가방 칸에는 `×N` 한 칸.
- 서버 검증(`server/database.mjs`): `itemValid` 슬롯 목록에 `'pouch'` + `slot==='pouch'`면 `kind==='pouch'` 필수.
  40칸 검사(`inventoryOwnerQuery`·`reconcileItems`)·`server/market.mjs` 귀속 반환·`server/endpoints/warehouse.mjs` 입고에서 제외.

## 4. 개봉 — 확률·화면 (`src/game/pouch.ts`, `src/ui/modals/pouchModal.ts`, `ui/pouchArt.ts`)

### 4.1 확률표 (사용자 최종 확정 · 두 단계 추첨)
1. 분류: **금화 55% · 장비 40% · 스킬북 5%**
2. 세부
   - 금화: `1,500G` 55% · `3,000G` 32% · `5,000G` 13% → `save.gold`
   - 장비: `일반` 34% · `매직` 30% · `레어` 20% · `에픽` 11% · `유니크` 4% · `레전드` 1%(**최고 층 기준 · 3직업 균등**)
     → `rollEquipment(save.maxFloor, 등급)` — 슬롯·티어·스탯·`+단계` 규칙은 `rollItem`과 같은 함수
   - 스킬북: 세 직업 모든 스킬북 같은 확률(100%) → `rollSkillBook(save.maxFloor)`
3. **전체 확률 10항목**(분류 × 세부, 합 100.00%) — `POUCH_OVERALL_RATES`:
   `1,500G` 30.25% · `3,000G` 17.60% · `일반 장비` 13.60% · `매직 장비` 12.00% · `레어 장비` 8.00% ·
   `5,000G` 7.15% · `무작위 스킬북 1권` 5.00% · `에픽 장비` 4.40% · `유니크 장비` 1.60% · `레전드 장비` 0.40%
- `rollItem`을 `rollRarity`(등급 뽑기) + `rollEquipment`(생성)로 나눠 **기존 드롭 확률이 바뀌지 않게** 했다
  (`item-drop-jobs`·`balance-196` 회귀 통과).

### 4.2 개봉 규칙 (`openPouch`)
- 주머니 1개를 찾아 **소모**하고 결과를 세이브에 넣는다(금화 → `save.gold`, 장비·스킬북 → `save.bag`).
- **장비 40칸이 가득이면 열지 않고 안내**한다(`가방이 가득 찼습니다. 장비를 분해한 뒤 열어 주세요.`) — 주머니를 잃지 않는다.
- 남은 개수를 돌려 `[한 번 더 열기]`/`[확인]`을 고른다.

### 4.3 화면
- 가방에서 주머니를 고르면 상세에 **`[열기]`** → 장비창 위에 큰 개봉 창(분해 보호 팝업과 같은 한 겹).
- 창 **왼쪽 위 `[확률표]`** → 아래에 **전체 확률 10줄 표**(높은 확률 순, 확률은 소수 둘째 자리 `30.25%`).
  장비 등급 줄은 인게임 등급 색(`.pouch-rate-row.rarity-common` … `.rarity-legendary`), 아래 요약 한 줄:
  `합계 100% · 장비·스킬북은 3직업 균등`.
- `[열기]` → **개봉 연출 0.95초**(사용자 요청 `#3933`): 주머니가 흔들리다 위로 벌어지고(0~0.55초,
  `@keyframes pouch-open`) → 입구에서 당첨 색(장비는 그 등급 색, 나머지는 황금빛) 빛이 터져 퍼지고(0.25~0.9초,
  `.pouch-glow` screen 블렌드) → 결과 카드가 짠 하고 떠오른다(0.6초~, `@keyframes pouch-reveal`).
  세이브 차감은 누르는 즉시 **한 번**, 연출 중에는 버튼이 잠겨 중복으로 까지지 않는다.
  `prefers-reduced-motion`이면 애니메이션 없이 결과가 바로 보인다.
- 그림은 사용자가 고른 **1번 클래식 가죽 보물 주머니**(확정 `#3921`) — `public/assets/icons/treasure_pouch.png`
  (원본 `downloads/pouch-option1-leather.png` 1254×1254를 512px로만 줄임, 배경·구도 무손실)로
  `POUCH_ART_URL`·`POUCH_ICON_URL`이 연결되어 가방 칸·상세·개봉 창이 같은 파일을 쓴다.

## 5. 검증

- `npx tsc --noEmit` 통과 · `npx vite build` 통과(`dist/assets/index-DGqNlkJG.js`에 `무작위 보물 주머니`, CSS에 `.pouch-window`·`.pouch-rates`·`.pouch-rate-row`).
- 신규 `tests/treasure-pouch.test.mjs` **12/12** — 확률 합계 100%(분류 55/40/5·금화·등급·**전체 10항목 내림차순**) / 2만 회 분포 / 확률표 10줄 표 + 등급 색·요약 렌더 /
  개봉 시 소모·지급·연속 300회 / 가방 가득이면 미소모 / 자동·일괄 분해·자동 장착·경매장·도감 제외 / `parseSave` 보존 /
  가방 `×N` + 상세 `[열기]` / 개봉 창 `[확률표]`·`[열기]`·`[한 번 더 열기]`·`[확인]` 흐름 / 결과 카드.
- 신규 `tests/journey-metrics.test.mjs` **2/2** — 월드보스 `start`가 일일 1·주간 1로 기록되고 같은 `requestId` 재시도로 늘지 않음,
  다음 날 일일 1·주간 2 / 장비 분해가 분해한 벌 수만큼 `salvageCount`를 올림(수동 2 · 자동 1 · 등급 일괄 3).
- 신규 레벨 곡선(사용자 확정 `#3976`): `expToNext(level) = 1400 × level²`(1~5층 Lv.3~4 · 10층 Lv.6 · 20층 Lv.11~12),
  몹 경험치 일반 `9 + 층` · 정예 2배 · 보스 6배(1층 10/20/60 · 20층 29/58/174), 오프라인 정산도 같은 규칙
  (`kills × (9+층) + 보스 × 5배 추가`) — `elite-mob` 4/4·`offline` 통과.
- 회귀: `journey` 12/12(미션·금화 6,600/44,600 반영) · `world-boss-live` 8/8 · `world-boss-preview`·`world-boss-field` ·
  `journey-ui`·`modal-ui`·`item-drop-jobs`·`inventory`·`bag-capacity`·`market`·`characters`·`shop`·`dungeon-*`.
- 전체 647건 중 600 통과 — 실패 47건은 전부 이 sparse 체크아웃에 `public/assets/**`가 없어 나는 기존 실패
  (`hero-art`·`armor-render`·`weapon-render` 등, 변경 전과 같은 파일).
- **주머니 그림이 확정되기 전에는 `preview/gravel-background-fks3997`에 푸시하지 않는다**(사용자 지시).
