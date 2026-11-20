# 작업 204 — 20층 체제 개편(최대 20층 상한 · 층당 몹 수 상향) + 3직업 교차 드롭

> 담당: fks3997 · 브랜치: `preview/gravel-background-fks3997` · 상태: `[-]` → 검증 후 `[x]`
> 사용자 확정 발언: `#3361`·`#3368`·`#3381`·`#3388` → `#3411`(정정) → `#3422`(추가)

## 확정 스펙(최종)

### 1. 최대 층수 20층 상한 — `MAX_FLOOR = 20`
- `src/game/store.ts`에 `MAX_FLOOR = 20`을 두고 `parseSave`가 `floor`·`maxFloor`를 1~20으로 클램프한다.
- `src/game/world.ts`는 20층 보스 처치 시 21층으로 오르지 않고 20층에 머문다(`최고 20층 달성` 안내). `travelToFloor`도 20층 위를 받지 않는다.
- `server/database.mjs` `writeSave`가 저장 전에 `floor`·`maxFloor`를 1~20으로 보정한다(같은 값의 `MAX_FLOOR` 상수를 모듈에 둔다).
- 기존 21층 이상 세이브는 **층·최고 층만 20으로 당긴다** — 장비·가방·처치 기록은 그대로 둔다.
- `ui/modals/floorModal.ts`: 최고 20층이면 잠긴 `21층` 칸 대신 `🏆 최고 20층 · 20층 달성 · 마지막 층` 칸을 보여 준다.

### 2. 층당 보스 등장 몹 수 상향 — `floorKillTarget`
`150 + 55 × (floor − 1) + round((floor − 1)² × 6.4)`:

| 층 | 1 | 5 | 10 | 15 | 20 |
|---|---|---|---|---|---|
| 목표 | 150 | 472 | 1,163 | 2,174 | 3,505 |

### 3. 몹 체력·장비 스탯·스폰 곡선 압축 금지 (정정 `#3411`: "20층기준 +1만뜨고 체렵압축하면안되")
- `enemyMaxHp`·`offlineMobHp`·`enemyHitDamage`·`enemyMoveSpeed`·`spawnTimer`·`rollItem`의 스탯/등급 확률은 **한 줄도 바꾸지 않는다**. 20층은 예전 20층 그대로이고, 30·50·80층으로 상한이 풀릴 때 고층 곡선이 그대로 이어진다.
- `maxPlusFor(floor) = min(7, floor((floor − 1) / 10))`도 그대로 — 20층 상한에서는 11층부터 `+1`까지만 나온다.
- `AUTO_SALVAGE_PLUS_FLOOR = 41`도 그대로 — 20층 상한 동안 `+N까지` 필터는 숨겨져 있고, 상한이 풀리면 자동으로 켜진다.

### 4. 무기·스킬북 3직업 동일 확률 드롭 (추가 `#3422`: "다른직업 장비나 스킬북도 동일확률로 뜰수있어")
- `items.ts` `dropJobs = ['warrior','archer','mage']`·`dropJob(random)` — 1/3씩.
- `rollItem`: 확률 드롭(`guaranteed === false`)의 무기 칸은 직업을 먼저 1/3로 고른 뒤 `weaponBasesFor(dropJob)`에서 만든다. 튜토리얼 첫 확정 드롭(`guaranteed === true`)은 지금처럼 내 직업 `starterWeaponName(job)`.
- `rollSkillBook`: 직업을 1/3로 고른 뒤 그 직업의 `floor × 2` 해금 스킬·패시브 중 하나. 세 직업이 액티브 8+패시브 3으로 같아 전 스킬 균등 확률이 된다. `job` 인자는 호출부 호환용(`_job`)으로 남긴다.
- 오프라인 정산(`offline.ts`)은 같은 `rollItem`/`rollSkillBook`을 쓰므로 자동으로 같아진다.

### 5. 다른 직업 무기 안전장치
- `items.ts` `weaponJob(item)`(활=궁수·지팡이=마법사·그 외 대검=전사)과 `canWield(item, job)`.
- `autoEquipBest`: 무기 칸 후보를 `canWield`로 거른다 — 전사가 활, 궁수가 대검을 자동 장착하지 않는다.
- `itemDetail`(장비창): 다른 직업 무기는 장착 버튼이 `"{직업} 전용"`으로 잠기고, 슬롯 표기도 그 무기의 직업 기준(`활`·`지팡이`)으로 보여 준다.
- `salvageUpgrades`: 입을 수 없는 무기는 '더 좋은 장비' 비교에서 빠진다(강해도 보호 팝업에 세우지 않는다).
- `autoSalvageBlock`: 입을 수 없는 무기는 `empty-slot`·`upgrade` 보호를 받지 않는다(등급·`+단계` 보호는 그대로 — 경매장용 고급 장비는 남는다).

## 검증
- `npx tsc --noEmit` 통과.
- 신규 `tests/floor-cap.test.mjs`(클램프·몹 수 곡선·20층 정지·`writeSave` 보정) **4/4**, `tests/item-drop-jobs.test.mjs`(1/3 드롭·직업 판별·자동 장착 차단·분해 보호) **4/4**.
- 관련 회귀: `balance-196`·`item-plus`·`salvage-plus`·`auto-salvage`·`world-movement`·`field-loot`·`dungeon-battle`·`offline`·`codex`·`archer`·`mage` 통과(에셋 없는 sparse 체크아웃의 기존 `public/assets` 실패 제외).
- `npx vite build` 통과.
- 미리보기 `preview/gravel-background-fks3997` 푸시 → `https://preview-gravel-background-fk.djrpg.pages.dev/version.json` 200 확인. **`main` 병합 금지**(사용자 확인 대기).

## 남긴 메모
- `server/journey-state.mjs`의 업적 '최고 도달 층' 단계가 `[10, 30, 50, 100]`이라 30·50·100단계는 20층 상한 동안 도달할 수 없다. 사용자가 언급하지 않아 건드리지 않았다(상한이 풀리면 그대로 살아난다).
- 다른 직업 스킬북은 사용하면 습득되지만 그 직업의 스킬 목록에만 쓰이므로 지금 캐릭터의 퀵슬롯에는 오르지 않는다(기존 `normalizeQuickSlots(job)` 규칙).
