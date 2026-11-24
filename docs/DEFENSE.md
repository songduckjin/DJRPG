# DEFENSE — 무한 방어전 · 능동 교전 · 서버 검증 순위

> **책임**: 신규 던전 모드 **무한 방어전**(2026-11-24 양측 최종 확정). 성벽 없이 캐릭터가 아래에서 출발해
> 위에서 내려오는 적에게 걸어가 싸우고, 쓰러질 때까지 스테이지가 계속 오르는 모드. 끝없는 던전(돌파형)은
> `docs/DUNGEON.md`이고 **이 모드는 그 화면·코드를 건드리지 않는다**(같은 던전 모달의 허브에서 갈라진다).

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 전투 순수 로직·고정 스텝·요약 | `src/game/dungeon/defenseBattle.ts` (`DEFENSE_STEP`=1/60·`DefenseBattle`·`defenseBattleSummary`·`runDefenseBattle`) |
| 세이브 기록·보상 지급 | `src/game/defenseProgress.ts` (`defenseStage`·`defenseStageAt`·`recordDefenseRun`·`claimDefenseRewards`) |
| 서버 순위 클라이언트 | `src/game/defenseLive.ts` (`begin`·`submit`·`load`) |
| 진입 허브·로비·순위 화면 | `src/ui/modals/defenseLobby.ts`·`src/ui/modals/dungeonModal.ts`(모드 분기)·`src/ui/defenseLobby.ts`(상태) |
| 전투 화면 | `src/ui/defenseField.ts`·`src/styles/defense.css` |
| 서버 순위·기록 | `server/defense.mjs`·`server/endpoints/defense.mjs`·`functions/api/defense.js` |
| 서버 검증 | `server/defense-verify.mjs` |
| 표·상한 | `server/defense-schema.mjs`·`server/tables.mjs`·`src/game/store.ts`(`DEFENSE_MAX_STAGE`=999) |

## 확정 사양 (2026-11-24, 대장님·송덕진 님)

1. **모드 이름**: 무한 방어전. 진입은 기존 **던전 모달 첫 화면 = 던전 허브**의 두 카드(끝없는 던전 / 무한 방어전).
2. **성벽(방어선) 없음** — 성벽 오브젝트도, 하단 `방어선` HP 막대도 없다. 하단 HUD에는 **캐릭터 HP만** 있다.
3. **능동 교전** — 자동 전투. 캐릭터는 화면 아래(69%)에서 출발해 가장 가까운 적을 향해 **위·대각선으로 직접 걸어가**
   사거리 안에서 평타·스킬로 싸운다. 적은 위(화면 2%)에서 **곧게 내려와** 방어선(53%)에서 멈춘다.
4. **무한 스테이지** — 웨이브 3개 = 1스테이지, 5스테이지마다 보스(보스 1 + 미니언 4). 캐릭터 HP 0(또는 30분
   안전 상한)에서 판이 끝난다.
5. **보상** — 처치 금화·경험치는 `progress.ts` `killReward`/`applyKillReward`, 아이템은 `items.ts`
   `itemDropChance()`·`rollItem()`과 `statBooks.ts` `rollStatBookDrop('hunt')`을 **직접 호출**한다(상수 복사 금지
   → `PR #347`의 ÷10이 자동 반영). **실패해도 획득분은 유지**한다.
6. **보상 상한** — `defenseRewardFloor(stage) = min(20, 1 + floor((stage-1)/2))`. 서버 저장 가드
   (`rewardBudget`, `MAX_FLOOR=20`)를 건드리지 않고 20층 값에서 포화한다. **랭킹 스테이지만 계속 오른다.**
7. **랭킹** — `djrpg_defense_records`·`djrpg_defense_attempts`, `POST /api/defense`(list/start/submit),
   상위 10명 + 내 순위 고정, 동점은 **먼저 도달한 도전자**, 게스트 제외.

## 불변 규칙

- **고정 스텝만**: `DEFENSE_STEP`(1/60)으로만 전진한다. 실시간 dt로 전투를 돌리면 서버 리플레이가 어긋나
  정상 판이 거부된다(`src/ui/defenseField.ts`의 `pendingStep`).
- **결정적 난수**: 시드 난수만 쓴다(적 레인·지터·치명타·드랍). 좌우 흔들림 같은 연출 난수를 전투에 넣지 않는다.
- **좌표**: 화면이 아이소메트릭 투영(`projectArenaPoint`)이라 세로는 `v = x+y`, 가로는 `u = x-y`다.
  캐릭터 경계는 `CombatEngine.clampHeroPoint`를 방어전만 오버라이드한다(`DEFENSE_ARENA_*`).
- **판정 순서**(`verifyDefenseRun`): ① 물리적 최소 시간(`max(스폰 하한×0.75, 체력 합/maxDps×0.9)`)
  ② 요약 형식·스텝/시간·처치 범위·체력·digest ③ 2분(7,200스텝) 이하 판만 고정 스텝 리플레이(스테이지 ±1·처치 ±12%).
  실패 코드: `DEFENSE_NOT_STARTED`·`DEFENSE_RUN_MISMATCH`·`DEFENSE_TOO_FAST`·`DEFENSE_SUMMARY_REQUIRED`·`DEFENSE_SUMMARY_MISMATCH`.
- **기록의 주인은 서버**: 세이브의 `defenseStage`는 `djrpg_defense_records.best_stage + 1`까지만 저장된다
  (`server/save-guard.mjs` `defenseStageCap`). 세이브만 고쳐 900스테이지를 주장할 수 없다.
- **제출 → 저장 순서**: `submit`이 세이브의 스테이지를 읽지 않으므로 **먼저 제출**, 그 다음 보상 지급·저장이 안전하다.
  먼저 저장하면 낡은 기록 때문에 스테이지가 1로 잘린다(`src/ui/defenseField.ts`의 `finish`).
- **보상 지급은 판 종료 1회**: 전투는 `structuredClone` 사본으로 돌고, 실제 세이브는 결과창에서만 바뀐다.
- **게스트**: `list`만. `start`/`submit`은 `GUEST_READ_ONLY`(403).

## 금지

- 성벽·방어선 HP를 다시 넣기(확정 사양에서 빠졌다).
- 드랍률 상수 복사(`0.0039` 등) — 반드시 `items.ts` 함수를 부른다.
- `MAX_FLOOR`(20)·`rewardBudget` 계약을 이 모드 때문에 바꾸기.
- 30분 상한(`DEFENSE_RUN_SECONDS`)·스테이지 상한(999)을 한쪽만 바꾸기(테스트가 대조한다).
- 기존 끝없는 던전 화면·검증 경로 수정.

## 테스트

`node --test tests/defense-battle.test.mjs tests/defense-verify.test.mjs tests/defense-save-cap.test.mjs tests/defense-ranking.test.mjs`

## 관련 매뉴얼

`docs/DUNGEON.md` · `docs/FIELD_OFFLINE.md` · `docs/SYNC_SAVE.md` · `docs/INVENTORY_GEAR.md`
