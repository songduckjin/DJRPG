# DEFENSE — 무한 방어전 · 적 직접 추격 · v2 밸런스 · 서버 검증 순위

> **책임**: 신규 던전 모드 **무한 방어전**(2026-11-24 양측 확정 · 같은 날 v2 밸런스 확정). 방어선 없이 적이
> 캐릭터에게 직접 다가오고, 쓰러질 때까지 **웨이브**가 계속 오르는 모드. 끝없는 던전(돌파형)은
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
   보상 층 `defenseRewardFloor(wave) = min(20, 1 + floor((wave-1)/1.5))` — **30웨이브에서 20층 포화**.
   보상 수준은 v1 그대로 **필드의 1/5 수준**, 피흡 상한 5%도 그대로다. **실패해도 획득분은 유지**.
9. **랭킹**: 직업별 분리 없이 **전체 통합 1개 순위**. `djrpg_defense_records`·`djrpg_defense_attempts`,
   `POST /api/defense`(list/start/submit), 상위 10명 + 내 순위 고정, 동점은 **먼저 도달한 도전자**, 게스트 제외.

## v2 실측 (구현된 엔진 · 5시드 · `sim_v2/run-impl.mjs`)

| 캐릭터 | 전사 | 궁수 | 마법사 | 30웨이브 도달 |
|---|---|---|---|---|
| Lv.1 신규 | 3 | 3~4 | 3 | — |
| Lv.10 초반 | 12~13 | 14~15 | 12~13 | — |
| **Lv.20 · 전투력 ~2,000** | **33~34** | **35** | **30~32** | 8.4~8.7분 |
| Lv.30 표준 | 62~63 | 53~54 | 48~50 | 8.4~8.6분 |
| Lv.30 고스펙(전설 +7) | 92~99 | 80~83 | 73~78 | 8.4~8.6분 |

- 30웨이브는 **속도가 아니라 생존**의 관문이다(스펙과 무관하게 8.4~8.7분). 최대 동시 생존 몹 12마리(상한 24).
- 1~30웨이브 누적 383마리, 서버 스폰 하한 `defenseSpawnFloorSeconds(30)` = 377초(×0.75 = 283초 < 실제 521초).

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

## 금지

- 성벽·방어선 HP·`v=60` 압박을 다시 넣기(확정 사양에서 빠졌다).
- 드랍률 상수 복사(`0.0039` 등) — 반드시 `items.ts` 함수를 부른다.
- `MAX_FLOOR`(20)·`rewardBudget` 계약을 이 모드 때문에 바꾸기.
- 30분 상한(`DEFENSE_RUN_SECONDS`)·웨이브 상한(999)을 한쪽만 바꾸기(테스트가 대조한다).
- 기존 끝없는 던전 화면·검증 경로 수정.
- 화면·문서에 `스테이지` 단위를 다시 쓰기(웨이브 하나가 단위다).

## 테스트

`node --test tests/defense-battle.test.mjs tests/defense-verify.test.mjs tests/defense-save-cap.test.mjs tests/defense-ranking.test.mjs`

## 관련 매뉴얼

`docs/DUNGEON.md` · `docs/FIELD_OFFLINE.md` · `docs/SYNC_SAVE.md` · `docs/INVENTORY_GEAR.md`
