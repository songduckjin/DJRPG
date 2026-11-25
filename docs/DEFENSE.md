# DEFENSE — 무한 방어전 · 적 직접 추격 · v3 밸런스(30웨이브 벽) · 서버 검증 순위

> **책임**: 신규 던전 모드 **무한 방어전**(2026-11-24 양측 확정 · 같은 날 v2 밸런스 확정 · **2026-11-25 v3 밸런스**).
> 방어선 없이 적이 캐릭터에게 직접 다가오고, 쓰러질 때까지 **웨이브**가 계속 오르는 모드. 끝없는 던전(돌파형)은
> `docs/DUNGEON.md`이고 **이 모드는 그 화면·코드를 건드리지 않는다**(같은 던전 모달의 허브에서 갈라진다).

## 핵심 파일

| 역할 | 파일 |
|---|---|
| v2 밸런스 표(상수 단일 출처) | `src/game/dungeon/defenseTuning.ts` (`DEFENSE_TUNING`·`DEFENSE_RANGED_FX`) |
| 전투 순수 로직·고정 스텝·요약 | `src/game/dungeon/defenseBattle.ts` (`DEFENSE_STEP`=1/60·`DefenseBattle`·`defenseBattleSummary`·`runDefenseBattle`) |
| 세이브 기록·보상 지급 | `src/game/defenseProgress.ts` (`defenseStage`·`defenseStageAt`·`recordDefenseRun`·`claimDefenseRewards`) |
| 서버 순위 클라이언트 | `src/game/defenseLive.ts` (`begin`·`submit`·`load`) |
| 진입 허브·로비·순위 화면 | `src/ui/modals/defenseLobby.ts`·`src/ui/modals/dungeonModal.ts`(모드 분기)·`src/ui/defenseLobby.ts`(상태) |
| 전투 화면 | `src/ui/defenseField.ts`·`src/styles/defense.css` |
| 서버 순위·기록 | `server/defense.mjs`·`server/endpoints/defense.mjs`·`functions/api/defense.js` |
| 서버 검증 | `server/defense-verify.mjs` |
| 표·상한 | `server/defense-schema.mjs`·`server/tables.mjs`·`src/game/store.ts`(`DEFENSE_MAX_STAGE`=999) |

## 확정 사양 (2026-11-24 · v2)

1. **모드 이름**: 무한 방어전. 진입은 기존 **던전 모달 첫 화면 = 던전 허브**의 두 카드(끝없는 던전 / 무한 방어전).
2. **단위는 웨이브 하나** — `3웨이브 = 1스테이지` 개념을 없앴다. 로비·전투 HUD(`WAVE`)·배너·결과·순위가
   모두 `N 웨이브`로 적는다. **5웨이브마다 보스**(보스 1 + 호위 6), **3의 배수 웨이브에 정예**(마지막 1마리 ×2).
3. **방어선(성벽) 완전 삭제** — `v=60` 오브젝트·HP·압박 규칙이 없다. 적은 스폰(`v=-940`) 뒤 **캐릭터에게
   직접 다가와** `ENEMY_STOP_RANGE`(60)에서 선다. 판은 캐릭터 HP 0(또는 30분 안전 상한)에서 끝난다.
4. **적 이동**: 추격 속도 `110 + 1.2×(웨이브-1)` u/s, 상한 190(캐릭터 125보다 빠르다). 스폰 간격
   `1.30 − 0.02×(웨이브-1)`초, 하한 0.55초.
5. **몹 3종**: 근접 55% / **돌진 20%**(스폰 3초간 ×2.1배속) / **사수 25%**(사거리 215, 접근 중에도 사격, 1타 ×0.8).
   몹 체력은 `enemyMaxHp` 단일 출처를 그대로 쓰고, 적 기준 층은 `2 + 0.55×(웨이브-1)`(상한 60)이다.
6. **적 1타**: `enemyHitDamage(..., boss)` × **0.90**, **0.9초마다 한 마리**. 보스는 보스 곡선(일반의 약 2.2배),
   정예는 ×2. **1~3웨이브는 ×0.55** 완화(신규 캐릭터가 3~4웨이브는 보게).
7. **웨이브 클리어 회복**: 최대 체력 **15%**.
8. **보상**: 처치 금화·경험치는 `progress.ts` `killReward`/`applyKillReward`, 아이템은 `items.ts`
   `itemDropChance()`·`rollItem()`과 `statBooks.ts` `rollStatBookDrop('hunt')`을 **직접 호출**(상수 복사 금지).
   보상 층 `defenseRewardFloor(wave) = min(20, 1 + floor((wave-1)/1))` — **1웨이브 = 1층, 20웨이브에서 20층 포화**(v3).
   처치 금화·경험치는 같은 층 필드 마리당의 **1.8배**(v3 `killRewardScale`), 피흡 상한 5%는 그대로다.
   **실패해도 획득분은 유지**.
9. **랭킹**: 직업별 분리 없이 **전체 통합 1개 순위**. `djrpg_defense_records`·`djrpg_defense_attempts`,
   `POST /api/defense`(list/start/submit), 상위 10명 + 내 순위 고정, 동점은 **먼저 도달한 도전자**, 게스트 제외.

## v3 밸런스 — 30웨이브 벽 (2026-11-25 송덕진 님 최종 승인 · 난이도 C안 + 보상 R-B안)

v2는 **최고 스펙이 죽지 않았다** — 전설+3·스탯북 30 세팅이 119~122웨이브에서 30분 상한(`outcome: 'timeout'`)으로
잘렸다. 원인은 실력이 아니라 구조다. 몹 **기준 층이 60에서 포화**되므로 웨이브 71 이상은 몹 HP·공격이 완전히 평평하고,
들어오는 피해(≈26/초)보다 회복(웨이브 15% + 피흡)이 커진다. v3는 **1~14웨이브를 건드리지 않고** 15웨이브부터
곡선을 한 번 더 꺾어 30웨이브가 사실상의 맥스가 되게 한다.

### 상수 (`defenseTuning.ts`)

| 상수 | v2 | v3 | 의미 |
|---|---|---|---|
| `wallFrom` | — | **15** | 벽 구간 시작 웨이브(이 웨이브까지는 배율 ×1) |
| `wallHpGrowth` | — | **1.13** | 16웨이브부터 웨이브당 몹·보스 체력 배율 |
| `wallDmgGrowth` | — | **1.25** | 16웨이브부터 웨이브당 적 1타 배율(체력보다 가파르게) |
| `rewardWavesPerFloor` | 1.5 | **1** | 1웨이브 = 1층(20웨이브에서 20층 포화) |
| `rewardCap` | 20 | **20 (유지)** | 보상 층 상한 — `DEFENSE_REWARD_FLOOR_CAP`·서버 `MAX_FLOOR`와 같은 값 |
| `killRewardScale` | — (1) | **1.8** | 처치 금화·경험치 배율(`defenseKillReward`도 같은 배율) |
| `bossDropCount` | — (1) | **2** | 보스 웨이브 확정 장비 수(같은 보스 등급표로 2회) |
| `milestoneEvery` | — | **10** | 마일스톤 주기(웨이브). 0이면 없음 |
| `milestoneGoldScale` | — | **2** | 마일스톤 금화 = 그 웨이브 보상 층의 보스 금화 ×2 |
| `milestoneDrops` | — | **1** | 마일스톤 확정 장비 수(층+2 등급표, 20층 상한) |

유지(이번 PR에서 바꾸지 않는다): `enemyFloorStart/Step/Cap`(2 / 0.55 / 60), `maxStrikers: 1`,
`healClearPct: 15`, `DEFENSE_RUN_SECONDS = 1800`, 1~3웨이브 완화 ×0.55, 몹 수·스폰·추격 곡선, 기존 최고 기록(초기화 없음).

### 곡선 (v2 → v3, 실제 `defenseMobHp`·`defenseBossHp`)

| 웨이브 | 기준 층 | 일반 몹 HP | 보스 HP | 체력 배율 |
|---|---|---|---|---|
| 1~15 | 2~10 | 43~224 (**동일**) | 559~2,912 (**동일**) | ×1 |
| 16 | 10 | 224 → **253** | 2,912 → **3,291** | ×1.13 |
| 20 | 12 | 305 → **562** | 3,965 → **7,305** | ×1.84 |
| 25 | 15 | 490 → **1,663** | 6,370 → **21,623** | ×3.39 |
| 30 | 18 | 791 → **4,947** | 10,283 → **64,313** | ×6.25 |
| 35 | 20 | 1,133 → **13,056** | 14,729 → **169,728** | ×11.5 |

## v3 실측 (구현된 엔진 `runDefenseBattle` · 5시드 평균 · `work/sim/runner.mjs`)

| 캐릭터 | 전사 | 궁수 | 마법사 | 판 길이 | 금화/분 (v2 → v3) | 아이템/판 (v2 → v3) |
|---|---|---|---|---|---|---|
| Lv.1 신규 | 3.0 | 3.0 | 2.0 | 42~51초 | 68~76 → 99~136 | 0 → 0 |
| Lv.10 초반 | 15.2 | 18.0 | 18.0 | 261~309초 | 398~591 → **1,470~1,576** | 2.2~3.6 → **6.2~7.2** |
| Lv.20 표준(전투력 ~2,000) | 21.0 | 21.0 | 21.0 | 356~360초 | 856~1,020 → **2,445~2,496** | 5.4~6.2 → **10.0** |
| Lv.30 표준 | 24.4 | 24.4 | 24.4 | 416~424초 | 1,695~1,760 → **2,430~2,467** | 10.4~11.6 → **10.0~10.4** |
| Lv.30 최고(전설+3·스탯북 30) | **30.8** | **30.6** | **30.4** | 505~517초 | 2,426~2,496 → **3,069~3,264** | 23.0~24.2 → **13.8~14.8** |

- **15칸 전부 `dead`** — 30분 상한에 닿는 판이 없다(최장 517초). "시간 제한이 난이도를 가리는" 문제가 사라졌다.
- 세 직업 최대 격차 **0.4웨이브**(최고 스펙) — 통합 1개 순위에서 특정 직업이 보드를 채우지 않는다.
- 판이 짧아진 몫은 보상 상수가 메운다: Lv.20·Lv.30·최고 스펙 모두 **금화/분이 v2보다 높다**(최고 스펙 +35%).
- 서버 최소 시간도 함께 검증했다 — 예: Lv.30 세이브가 21웨이브를 360초에 도달했고 `requiredDefenseSeconds(21)` = 202초다
  (`defenseStageHpSum`이 `defenseMobHp`를 쓰므로 벽 구간 체력이 최소 시간 근거에 자동으로 들어간다).

## 보상 규칙 (v3)

1. **처치** — `killReward`(필드 계수·보스 6배·정예 2배 그대로) × **`killRewardScale` 1.8**. 결과창 계산
   (`defenseKillReward`)도 같은 배율을 쓴다.
2. **보스 웨이브(5·10·15…)** — 확정 장비 **2개**(`bossDropCount`, 보스 등급표).
3. **마일스톤(10·20·30…웨이브 클리어)** — 그 웨이브 보상 층의 **보스 금화 ×2** + 확정 장비 **1개**(층+2 등급표).
4. **보상 층** — 1웨이브 = 1층, **20층 상한(20웨이브)**. 생존·보상 모두 20층 위로는 오르지 않는다.
5. 실패해도 획득분 유지 — 판이 어떻게 끝나든 `claimDefenseRewards`가 한 번 지급한다.

## 불변 규칙

- **고정 스텝만**: `DEFENSE_STEP`(1/60)으로만 전진한다. 실시간 dt로 전투를 돌리면 서버 리플레이가 어긋나
  정상 판이 거부된다(`src/ui/defenseField.ts`의 `pendingStep`).
- **결정적 난수**: 시드 난수만 쓴다(적 레인·지터·종류·치명타·드랍). 좌우 흔들림 같은 연출 난수를 전투에 넣지 않는다.
  스폰 한 마리의 난수 순서는 **레인 → 지터 → 종류**로 고정이다(순서를 바꾸면 모든 시드의 판이 달라진다).
- **좌표**: 화면이 아이소메트릭 투영(`projectArenaPoint`)이라 세로는 `v = x+y`, 가로는 `u = x-y`다.
  캐릭터 경계는 `CombatEngine.clampHeroPoint`를 방어전만 오버라이드한다(`DEFENSE_ARENA_*`).
- **연출은 판정 밖**: 사수형 조준선(0.25초)·투사체(520u/s)·돌진형 잔상·종류별 색은 `ui/defenseField.ts`의
  `Graphics` 한 겹에서만 그린다. 데미지 시점·수치는 `DefenseBattle`이 정하고 연출이 그것을 따라간다.
- **판정 순서**(`verifyDefenseRun`): ① 물리적 최소 시간(`max(스폰 하한×0.75, 체력 합/maxDps×0.9)`)
  ② 요약 형식·스텝/시간·처치 범위·체력·digest ③ 2분(7,200스텝) 이하 판만 고정 스텝 리플레이(웨이브 ±1·처치 ±12%).
  실패 코드: `DEFENSE_NOT_STARTED`·`DEFENSE_RUN_MISMATCH`·`DEFENSE_TOO_FAST`·`DEFENSE_SUMMARY_REQUIRED`·`DEFENSE_SUMMARY_MISMATCH`.
- **필드 이름은 v1 호환**: 세이브 `defenseStage`, API `stage`, DB `best_stage`, 요약 `stages`는 **웨이브 번호**를 담는다
  (스키마 이관 없이 단위를 바꾸기 위해 이름만 그대로 두었다). 화면에 `스테이지`라고 쓰지 않는다.
- **기록의 주인은 서버**: 세이브의 `defenseStage`는 `djrpg_defense_records.best_stage + 1`까지만 저장된다
  (`server/save-guard.mjs` `defenseStageCap`). 세이브만 고쳐 900웨이브를 주장할 수 없다.
- **제출 → 저장 순서**: `submit`이 세이브의 값을 읽지 않으므로 **먼저 제출**, 그 다음 보상 지급·저장이 안전하다.
- **보상 지급은 판 종료 1회**: 전투는 `structuredClone` 사본으로 돌고, 실제 세이브는 결과창에서만 바뀐다.
- **게스트**: `list`만. `start`/`submit`은 `GUEST_READ_ONLY`(403).
- **벽 구간은 상수 하나로**: `defenseHpWaveScale`·`defenseDmgWaveScale`은 `DEFENSE_TUNING`의
  `wallFrom`·`wallHpGrowth`·`wallDmgGrowth`만 읽는다(`defenseBattle.ts`에 계수를 복사하지 않는다).
  `wallFrom: 0`이면 v2와 완전히 같은 곡선이어야 한다.
- **클라·서버 동시 배포**: `defenseTuning.ts`는 클라이언트 전투와 서버 리플레이가 **함께** 읽는다. 한쪽만 배포하면
  서버 리플레이의 웨이브·digest가 어긋나 정상 판이 `DEFENSE_SUMMARY_MISMATCH`로 거부되므로 반드시 같이 배포한다.

## 금지

- 성벽·방어선 HP·`v=60` 압박을 다시 넣기(확정 사양에서 빠졌다).
- 드랍률 상수 복사(`0.0039` 등) — 반드시 `items.ts` 함수를 부른다.
- 벽 구간 계수(`1.13`·`1.25`)를 `defenseBattle.ts`에 복사하기 — 상수는 `defenseTuning.ts` 하나다.
- `MAX_FLOOR`(20)·`rewardBudget` 계약을 이 모드 때문에 바꾸기.
- 30분 상한(`DEFENSE_RUN_SECONDS`)·웨이브 상한(999)을 한쪽만 바꾸기(테스트가 대조한다).
- 기존 끝없는 던전 화면·검증 경로 수정.
- 화면·문서에 `스테이지` 단위를 다시 쓰기(웨이브 하나가 단위다).

## 테스트

`node --test tests/defense-battle.test.mjs tests/defense-verify.test.mjs tests/defense-save-cap.test.mjs tests/defense-ranking.test.mjs`

- `defense-battle`: 웨이브 구성·몹 수·스폰·추격·회복 15%·결정성·실패 보상·**벽 구간 배율**·**보상 기준 층 1:1**·
  **처치 보상 ×1.8·보스 확정 2개**·**10웨이브 마일스톤**.
- `defense-verify`: 최소 시간·요약 대조·리플레이·**벽 구간 판이 TOO_FAST로 거부되지 않는지**.
- v3 실측표는 저장소 밖 시뮬(`work/sim/runner.mjs`, 스펙 5종 × 직업 3 × 시드 5)로 다시 낸 값이다.

## 관련 매뉴얼

`docs/DUNGEON.md` · `docs/FIELD_OFFLINE.md` · `docs/SYNC_SAVE.md` · `docs/INVENTORY_GEAR.md`
