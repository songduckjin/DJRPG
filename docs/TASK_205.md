# 작업 205 — 가방·경매장 직업 표기 + `내 직업만 보기`, 던전 실제 보상·층별 고정 난이도

> 담당: fks3997 · 브랜치: `work/205-job-filter-dungeon-rewards` → `preview/gravel-background-fks3997` · 상태: `[x]`
> 사용자 요청: 직업 필터(가방·경매장)와 던전 실전 보상(작업 204 뒤 후속). `main` 병합 금지, 미리보기 확인용.

## 1. 가방·경매장 직업 표기 + `내 직업만 보기`

### 1.1 아이템 직업 판별 (`src/game/items.ts`)
- `skillBookJob(item)` — 스킬북이면 `skillOrderFor`/`passiveOrderFor`로 전사·궁수·마법사 중 하나를 찾는다. 스킬북이 아니면 `undefined`.
- `itemJob(item)` — 무기는 `weaponJob`(대검=전사·활=궁수·지팡이=마법사), 스킬북은 `skillBookJob`. **공용 방어구·장신구는 `undefined`**.
- `usableByJob(item, job)` — `내 직업만 보기` 판정. 직업 전용인데 내 직업이 아니면 false, 공용이면 true.

### 1.2 화면
- `ui/jobFilter.ts`(신규): `jobOnlyVisible`(목록 필터, 아이템 없는 줄은 유지)·`jobOnlyHidden`(숨긴 개수)·`readJobOnly`/`saveJobOnly`(기기 저장 `djrpg-bag-job-only`·`djrpg-market-job-only`, 기본 전체 보기)·`jobOnlyLabel`.
- 장비창 가방(`equipModal.ts`): 슬롯마다 `전사`/`궁수`/`마법사` 배지(`.job-badge`+`.job-warrior|archer|mage`), 분류 필터 아래 `내 직업만 보기: 켬/끔` 버튼, 하단에 `다른 직업 전용 장비 N개는 숨겨져 있습니다.` 안내, 비었을 때 `내 직업만 보기`를 끄라는 문구.
- 아이템 상세: 직업 전용 무기는 `전사 전용 무기 · 내 직업` 또는 **`장착 불가 (궁수 전용)`**, 스킬북은 `궁수 전용 스킬북`(+내 직업이면 `· 내 직업`).
- 스킬 탭 스킬북 카드(`skillBooks.ts`): 카드마다 직업 배지.
- 경매장(`marketModal.ts`): 매물·판매 선택 목록의 이름 옆 배지, 상세에서 `장착 불가 (전사 전용)` / `마법사 전용 스킬북 (내 직업 아님)`, 검색/필터 위 `내 직업만 보기` 체크박스(판매 중·거래 완료 목록만 — 내 거래 기록은 그대로), 결과 줄에 `이 페이지에서 다른 직업 N개 숨김`.
- 경매장 필터는 **화면에서** 거른다(서버 `filters` 계약·페이지 계산 무변경).

## 2. 던전 실제 보상 + 층별 고정 난이도

### 2.1 고정 난이도 (`src/ui/dungeonBattle.ts`)
- `dungeonPreviewHp`(내 DPS×4 고무줄) **삭제** → `DUNGEON_MOB_HP[1..10] = [60, 106, 160, 220, 299, 406, 557, 767, 1055, 1444]`·`dungeonMobHp(floor)`.
  - 값은 필드 곡선 `enemyMaxHp(2 × 층)` — 던전 N층이 필드 2N층과 같은 손맛.
  - `DUNGEON_ELITE_HP_SCALE = 2`(3웨이브 정예, 예전 그대로), `DUNGEON_BOSS_HP_SCALE = 30`(5·10층 단일 보스, 같은 층 일반 몹의 30배 — 필드 보스 6배보다 무겁다).
- 1층 60: Lv.5~10·저층 장비(평타 DPS 80~130)로 3~6초. 10층 보스 43,320: 평타 DPS 400(공격 120)은 90초 초과, 15~20층 파밍 장비(DPS 1,000 전후)는 40초 안팎.

### 2.2 드롭률
- `DUNGEON_ITEM_DROP_CHANCE = .5`(테스트) **삭제** → `dungeonDropChance(floor)` = `min(.20, .15 + (floor−1)×.005)` — 1층 15%, 10층 19.5%. 무엇이 떨어지는지는 필드의 `equipmentDropChance`:`skillBookDropChance` 비율 그대로.
- 5·10층 보스는 기존대로 `bossItems(5)` + `bossGoldPiles` 10무더기(합계 70×층).

### 2.3 실제 지급 (`src/game/dungeonRewards.ts` 신규)
- `dungeonKillGold(floor, boss)` — 일반 7×(3+층), 보스 70×층.
- `dungeonClearStones(floor, firstClear)` = 층×2 + (최초 클리어면 `10 + 층×3`).
- `claimDungeonRewards(save, floor, {gold, items}, {firstClear, autoSalvage, autoSalvagePlus})`:
  - `save.gold += gold`, `save.stones += stones`.
  - 아이템은 접속 중 자동 분해(`autoSalvageRecovered`, 필드와 같은 규칙) → 아니면 `canStoreItem` 확인 후 `save.bag`에 push, 가득 차면 `missed`로 센다(스킬북은 자리 불필요).
  - 영수증: `{floor, firstClear, gold, stones, items, missed, salvaged{count,gold,stones}}`.
- `DungeonBattle.clearRewards()` — `outcome === 'clear'`일 때만 `{gold: lootGold, items}`. `dead`/`timeout`은 `undefined`라 지급 자체가 없다.

### 2.4 화면
- `dungeonField.ts` `result()`: clear일 때 `claimDungeonRewards` → `ui.dungeon.clear(save,floor)` → `ui.onSave()`·`renderStatus()`·`renderBagBadge()` → 순위 전송. 결과창은 `ui/dungeonRewardMarkup.ts`의 `dungeonRewardMarkup(receipt)`로 실제 획득 금화·강화석(보너스 포함)·아이템 목록·자동 분해·놓친 개수를 그린다.
- 하단 HUD 문구 `자동 전투 · 1~10층 · 드롭 50% 테스트 · 보상은 준비 중` → `자동 전투 · 1~10층 · 클리어하면 처치 금화·강화석·떨어진 아이템을 그대로 받습니다`.
- 로비 도전 탭 `보상 수량은 전투 연결 시 확정됩니다.` → `dungeonPrizePanel(floor, boss)`가 그 층의 실제 금화·강화석 수량과 드롭 확률(보스 층은 5템+10무더기)을 보여 주고, `실패·시간 초과에는 지급되지 않습니다`를 명시.

## 3. 진행 구조와 중복 클리어
- 로비는 언제나 `clearedFloor + 1` 층만 열고(`ui.dungeon.floor.floor`), 결과창의 다음 층도 `floor + 1`. 이미 깬 층을 다시 도는 경로가 없어 최초 클리어 보너스가 반복 지급되지 않는다.
- 재도전 버튼은 실패·시간 초과 결과에만 있고, 그때는 보상이 없다.
- 게스트도 같은 `ui.world.save`를 쓰고 `ui.onSave()`로 로컬 저장, 정식 계정은 서버 저장 + `dungeonLive.submit()` 순위 기록(기존 197 경로 그대로).

## 4. 검증
- `npx tsc --noEmit` 통과, `npx vite build` 통과.
- 신규 `tests/job-filter.test.mjs` 5/5 — 무기·스킬북 직업 판별, 공용 방어구, 필터 목록, 기기 저장/기본값/저장 불가 환경.
- 신규 `tests/dungeon-rewards.test.mjs` 8/8 — 금화·강화석 수량, 세이브 반영, 최초 클리어 보너스, 가방 가득(스킬북 보관), 자동 분해, 결과창 마크업, 로비 보상 패널, 필드 지급 배선(`claimDungeonRewards`+`ui.onSave`).
- `tests/dungeon-battle.test.mjs` 32/32 — 고정 체력(장비 무관)·1층/10층 클리어 시간 창·보스 30배·드롭률 15~19.5%·`clearRewards`(clear만 지급).
- 관련 회귀: `dungeon-lobby`·`dungeon-ranking`·`dungeon-record`·`modal-ui`·`item-drop-jobs`·`market`·`skill-ui`·`dungeon-battle`·`dungeon-rewards`·`job-filter` **100/100**.
- 전체 `tests/*.test.mjs` 624건 중 576 통과 — 실패 48건은 이 sparse 체크아웃에 `public/assets/**`가 없어 나오는 기존 실패(코스튬·아트·시트 규격 검사). `server/**`는 존재해 API 테스트는 통과.

## 5. 배포
- `preview/gravel-background-fks3997`에 푸시(작업 등록 커밋 → 구현 커밋), 미리보기 `version.json` HTTP 200 확인. **`main` 병합 금지.**
