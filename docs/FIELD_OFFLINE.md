# FIELD_OFFLINE — 일반 필드 전투 · 방치 오프라인 · 필드 보스

> **책임**: 접속 중 일반 필드 사냥(층 이동·층 보스·정예·드롭)과 방치(오프라인) 정산. 끝없는 던전은 `docs/DUNGEON.md`.
> **읽는 법**: 이 파일 → `docs/SYNC_SAVE.md`(저장) → 손대는 파일만 `rg`. 전체 트리 탐색 금지.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 전투 루프·스폰·AI·층·보스·드롭 회수 | `src/game/world.ts` |
| 드롭 바닥 배치·흡수 규칙(순수 계산) | `src/game/loot.ts` (표시는 `src/game/render/drops.ts`) |
| 이동·스폰 경계 | `src/game/combat/bounds.ts` (`arenaLimits`·`clampArenaPoint`·`fieldSpawnLimits`·`clampFieldPoint`·`clampKnockbackPoint`) → 필드 스폰은 `src/game/arena.ts` |
| 보스 금화 무더기·던전 보스 드롭 표 | `src/game/bossLoot.ts` |
| 방치 정산(최대 12시간) | `src/game/offline.ts` |
| 자리 비움(백그라운드) 정산 판정 — 60초·3분·12시간, 토스트/팝업, 정산 초 | `src/game/background.ts` (부르는 곳 `src/main.ts` `settleBackground`) |
| 층 상한·층당 처치 목표·경험치 | `src/game/store.ts` (`MAX_FLOOR`=20·`floorKillTarget`·`addExperience`) |
| 드롭 확률·등급·강화 | `src/game/items.ts` — 규칙은 `docs/INVENTORY_GEAR.md` |
| HUD·층 선택·보스 도전 버튼·부활 대기 카드 | `src/ui/hud.ts`·`src/ui/reviveNotice.ts`·`src/styles/hud.css`·`src/ui/modals/floorModal.ts` |
| 층별 권장 전투력·여유/적정/위험 | `src/game/floorPower.ts` (`recommendedFloorPower`·`floorPowerState`) |
| 층별 **시간당 처치 수**·가장 빠른 층 | `src/game/offline.ts` (`killsPerHourAt`·`bestFarmFloor`·`offlineSurvivalUptime`) |
| 부활 대기(5초·1~4층 0초) | `src/game/combat/engine.ts` (`REVIVE_SECONDS`·`reviveSeconds`) |
| 부활 대기 표시(B안 카드)·문구·판정 | `src/game/reviveNotice.ts`(순수 규칙)·`src/ui/reviveNotice.ts`(DOM) |

## 불변 규칙

- **층 상한 20**(`MAX_FLOOR`). `parseSave`가 `floor`·`maxFloor`를 1~20으로 클램프하고 서버 `writeSave`도 같은 상한을 쓴다.
- **필드 보스는 최고 도달 층에서만**(`bossFloor()` = `save.floor >= save.maxFloor`). 아래층 반복 사냥에는 보스가 없다. 보스는 자동 등반이 켜져 있을 때만 예약된다.
- **보스 재도전**: 최고 층에서 **보스에게** 져 자동 등반이 꺼지면 `bossRetryReady` → HUD `⚔ 보스 도전`. 일반·정예 몹에게 진 것으로는 켜지지 않는다. 진 층은 `save.bossRetryFloor`에 남겨 새로고침·재접속에도 유지하고 다음 층으로 오르면 0으로 지운다. 보스 소환 순간 체력을 최대치로 회복하고 모든 쿨타임을 0으로 리셋한다.
- **사거리**: 전사 90 / 궁수 330·정지 180 / 마법사 285·정지 160. `World.update`가 가장 가까운 적을 향해 `stopRange`까지 걷는다. 몹 공격 사거리는 전사 평타와 같은 90(`ENEMY_ATTACK_RANGE`, 정지 60) — 적이 몸에 겹쳐 서지 않는다(작업 254).
- **평타 1마리**: `action`의 평타는 `maxTargets=1`·피해 `attack × basicAttackPower(1.6)`. 광역은 스킬만.
- **일반 사냥 사망 시 층 진행도 초기화(2026-11-25 덕진 님 확정)** — 5층부터 필드에서 **일반·정예 몹**에게 쓰러지면 이번 층 `floorKills = 0`이다(다음 층으로 넘어가지 못한다). 규칙은 `src/game/progress.ts` `afterFieldDeath` 한 곳에 있고, 접속(`FieldProgress.heroDown`)과 방치·자리 비움(`offline.ts` — 사망은 `버티는 초 + 부활 대기` 주기로 규칙적이라고 보고 **마지막 사망 이후 몫**만 남긴다, A안)이 같은 규칙을 쓴다. **입문 1~4층은 면제**(부활 대기 0초와 같은 구간, `FIELD_DEATH_RESET_FROM = 5`). 진행도를 0으로 돌리면 예약된 보스도 취소한다. 보스 패배(`afterBossLose`/`recordBossLoss`)·`bossRetryFloor`·`autoClimb`·10골드 패널티·보스 보상은 현행 그대로다.
- **층당 처치 목표(`killsToBoss`)는 2026-11-25부터 두 구간** — 1~4층은 현행 `150 + 30d + d²`(150·181·214·249), 5~39층은 사망 리셋 뒤에도 층을 넘을 수 있는 한 생애 예산 곡선 `goalLine`(5층 30 → 10층 35 → 20층 40 → 30층 52 → 39층 68), 40층(마지막 층)만 **150 예외**(보스 반복 방지). `server/save-guard.mjs`가 같은 함수를 import하므로 **클라·서버 동시 배포** 대상이다.
- **필드 몹 상한 30**(`MOB_CAP`). 30마리가 차면 1층 내려가 `floorKills`·적·추격·보스/정예 예약을 비우고 드롭은 남긴다.
- **정예 몹**: 30마리마다 1마리, 체력·금화·경험치 ×2, 드롭은 1배, 크기 1.22배, 배지 `정예 해골`.
- **몹은 필드 외곽 밴드에서 뜬다**(`spawnArenaEnemy`·`fieldSpawnBand`). 적의 **걸음**은 필드 경계(`clampFieldPoint`), 플레이어는 아레나(`clampArenaPoint`)다. **넉백·블러드 레이지 밀어내기는 `clampKnockbackPoint`**(작업 264) — 아레나 안에 있던 몹은 경계 위에서 멈추고(밖으로 밀려나지 않는다), 아직 필드에서 걸어 들어오는 중인 몹은 더 바깥으로 나가지 않는다. 예전에는 넉백도 필드 경계(120~250 구간)까지만 막아서, 맞은 몹이 아레나 밖에 갇히면 전사가 따라가지도 때리지도 못했다.
- **드롭**: 처치 시 금화는 그 자리에서 지급(코인은 연출 전용), 아이템은 `LOOT_REST_SECONDS`(1.5초) 뒤 흡수되어 `LOOT_ABSORB_SECONDS` 후 가방에 들어간다. 가방 40칸이 차면 바닥에 남고 경고는 1회.
- **드롭률은 전 층 고정**(작업 254 → 아이템 드롭 B안 2026-11-23): 접속 일반 0.039% · 보스 0.4%, 방치 일반 0.030% · 보스 0.4%. 등급 컷만 층에 따라 오른다(`rollItem`).
- **방치 정산**: 최대 12시간(`elapsedSince`), 아래층에서는 보스 몫 없이 진행도만 돈다. 자동 등반이 켜져 있고 최고 층이면 목표 처치마다 보스전을 정산해 이기면 층을 올린다(작업 235). 방치도 `autoSalvageRecovered`를 지나 분해분은 가방 대신 금화·강화석이 된다(작업 254).
- **부활 대기 5초(2026-11-24 확정)** — 쓰러지면 그 자리에서 `REVIVE_SECONDS`(5초)를 기다린 뒤 만혈로 일어난다. **입문 1~4층은 면제(0초)**. 접속(`FieldProgress.heroDown` → `CombatEngine.reviveTimer`)과 방치 정산(`offlineSurvivalUptime`·`offlineDeathsPerHour`)이 **같은 상수**를 쓴다 — "켜 놓고 보는 사람 = 방치하는 사람". 쓰러져 있는 동안은 추격·공격·피격을 멈춘다(엔진이 `player.hp > 0`을 본다). 세이브 `health`가 0으로 저장될 수 있어 `CombatEngine` 생성자가 0이면 만혈로 세운다. 필드 정산·캐릭터 전환으로 타이머를 지울 때도 `FieldProgress`가 체력 0을 만혈로 복구한다. 타이머 없이 체력 0이 남은 비정상 상태는 다음 필드 프레임에서 복구·저장한다.
- **부활 대기 표시는 화면 중앙 카드(B안, 2026-11-25)** — 5층부터 쓰러진 5초 동안 `.revive-card`가 92px 링에 남은 초를 5→1로 보여 주고(정수·올림), 0초에 `부활!`을 `REVIVE_FLASH_SECONDS`(0.9초) 번쩍인 뒤 사라진다. 문구·판정은 `src/game/reviveNotice.ts`(`reviveNoticeState`), DOM은 `src/ui/reviveNotice.ts`가 맡고 `Interface.tick()`이 매 프레임 `ui.revive.render(this)`로 부른다. 손실 표시는 `FieldProgress.reviveLostGold`(= `defeatPenalty`가 돌려준 실제 손실, 가진 금화가 모자라면 그만큼)를 쓴다. 카드가 떠 있는 동안 같은 문장의 토스트는 접는다(`isReviveToastSuppressed` — 보스 안내는 남긴다). **입문 1~4층은 카드 없음**(현행 유지)이며, 쓰러진 동안 전투 캔버스는 `saturate(.28) brightness(.62)`로 탈색되고 HP 바는 붉은 테두리가 된다.
- **방치 생존 가동률(2026-11-24)** — `offlineKillsPerMinute = 60 × min(처치 능력, 젠) × 0.7 × 가동률`이고 `가동률 = 버티는 초 ÷ (버티는 초 + 부활 대기)`다. 받는 피해는 `enemyHitDamage × 군집 ÷ 0.85 × (1−회피)`, 회복은 `피흡(초당 최대 체력 2.5% 상한) + 체력회복(%/5초) + 1~4층 자연회복 1%/초`다. 회복이 피해를 넘으면 `Infinity`(죽지 않음)라 처치 수가 깎이지 않는다. 사냥 중 쓰러진 횟수는 `reward.fieldDeaths`로 남기고 접속과 같은 10골드를 문다(`defeatPenalty`). 보스전(`offlineBossBattle`)도 회피·피흡·회복을 넣어 "버티는 초"를 계산한다(승패 판정은 36케이스에서 불변).
- **스킬 위력 단일 표** — `src/game/skills.ts` `SKILL_HIT_POWER`가 엔진 `action()`·방치 DPS·스킬 추천 순위(`skillCastScale`)의 공통 출처다. 하드코딩 사본을 다시 만들지 않는다(11/23 개편에서 방치만 파워 스트라이크 ×4로 남았던 회귀를 막는 테스트가 있다).
- **층 보상 배율(`안 A`, 2026-11-24)** — `killReward`가 마리당 금화·경험치에 `depthRewardScale`(15층 기준 1, 20층 2.21 = 몹 HP 비율)을 곱한다. 처치 수는 15~16층에서 정점인데 보상이 그대로면 깊은 층이 손해라, **전투·몹 HP 곡선은 그대로 두고 보상식만** 고쳤다. 던전 정산(`killGold`, `unscaled`)과 보스 금화(70×층)는 대상이 아니다. 서버 상한(`server/save-guard.mjs`)의 2배 여유 안에 들어온다.
- **자리 비움 정산(작업 261)**: 탭을 내렸다 돌아오면 **숨겨져 있던 시간**을 같은 방치 규칙으로 **한 번** 정산한다(새로고침해야 보상이 나오던 동작을 없앴다). 판정은 `src/game/background.ts` 한 곳이다 — ① 60초 미만은 정산 없음 ② 60~179초는 토스트 한 줄 ③ 180초 이상이거나 유니크·전설 획득·레벨업·층 상승·자동 분해가 있으면 기존 방치 정산 팝업 ④ 상한 12시간 ⑤ 정산 초는 `min(load의 offlineSeconds, 숨김초, 12시간)`. 저장 흐름은 `docs/SYNC_SAVE.md`(숨김·복귀 저장).
- **자리 비움이 정산하지 않는 상태**: 월드보스 도전(서버 60초 시계로 마감) · 끝없는 던전(전투 그대로 재개) · 동기화 잠금·충돌(그 흐름이 먼저 revision을 확정한다) · 활성 슬롯이 바뀐 복귀. 정산 뒤에는 `resetField()`로 적·드롭·쿨타임·보스 예약만 세이브 기준으로 다시 세운다 — `adoptSave()`를 쓰면 세이브가 비워진다.
- **저장**: `world`의 휘발 상태(`enemies`·`effects`·`drops`)는 저장되지 않는다. `save`를 바꾸면 `world.onChange` → `Interface.onSave` → `sync.queueSave()` 한 경로만 쓴다.
- **기념 종일 버프(2026-11-22)**: 공격력·방어력·최대 체력 **+30%**가 `2026-11-22 02:00 ~ 2026-11-23 05:00 KST`에 켜진다. 기간·배율의 단일 기준은 `src/game/patchBuff.ts`(`isPatchBuffActive`·`applyPatchBuff`)이고, 곱하는 자리는 `src/game/items.ts`의 `totalStats` 한 곳이다 — 필드·던전·방치·월드보스 리플레이·HUD·장비창 숫자가 모두 이 함수를 지나므로 `save`에 버프 값을 저장하지 않는다. 기간이 지나면 배율이 1로 돌아오고 HUD 알약(`.patch-buff-pill`, `src/ui/hud.ts` `renderPatchBuff`)은 스스로 사라진다. 종료 순간 `CombatEngine.tickStart`가 지금 체력을 새 최대치로 한 번만 자른다. 남은 시간 문구·알약·장비창 한 줄은 `patchBuffPillMarkup`·`patchBuffSummaryMarkup`이 만든다.

## 층별 권장 전투력 — 「층 선택」 창

- **권장 전투력은 수치 표가 아니라 층 곡선에서 계산한다** (`src/game/floorPower.ts`). `enemyMaxHp`·`enemyHitDamage`·`swarmCount`·`basicAttackPower`·`CRIT_DAMAGE_SCALE`만 읽으므로 밸런스를 바꾸면 값도 같이 움직인다. 별도 표를 새로 만들지 않는다.
- **기준 빌드** = 그 층을 편하게 사냥하는 최소선. 레벨 `ceil(층 × 0.8)`(옛 `권장 Lv.` 규칙), 방어·치명·공속은 그 레벨 기본값(장비 기대치 없음), 공격은 몹을 2대에 잡는 값, 체력은 적이 0.85초마다 한 번(그 한 번에 `swarmCount(층)`마리 함께) 때릴 때 20초를 버티는 값이다. 그래서 1층 권장값 = 장비 없는 1레벨의 전투력(68)이고, 11층·16층에서 군집이 2·3마리로 늘어 권장값이 한 단계 뛴다.
- **판정**: 내 전투력(=`totalStats` → `combatPower`)이 권장값의 1.5배 이상이면 `여유`, 0.75배 미만이면 `위험`, 사이가 `적정`.
- **층 카드의 둘째 줄은 `시간당 N 마리`(1안, 2026-11-24)** — `offline.killsPerHourAt(save, 층)`(그 층에서 지금 스펙으로 1시간 사냥 시 처치 수, 쓰러짐 포함)를 보여 준다. 가장 빠른 층(`bestFarmFloor`, 최고 도달 층 이하)에 `★ 최다`, 그 층 대비 손해가 `FARM_LOSS_BADGE_PCT`(15%) 이상인 층에 `▼N%`(`FARM_LOSS_DANGER_PCT` 40%부터 붉게)를 붙인다. 상단 `★ 추천`과 초록 한 줄도 **시간당 처치 기준**이고, 창을 열면 그 층의 구간이 펼쳐진다. `여유/적정/위험`은 종전대로 권장 전투력 판정이다(구간 머리의 `권장 X ~ Y`도 그대로). 카드 높이는 52px라 20장이 한 화면에 들어온다.
- **전투력 식은 한 곳**: `combatPower`(공격×3 + 방어×2 + 체력×0.2 + 치명×2 + 공속×2)를 `내 정보`와 층 선택 창이 함께 쓴다.
- **화면**: 10층 단위 구간(`floorGroups`, `MAX_FLOOR`까지 자동 확장)으로 묶고, 가장 빠른 층이 든 구간 하나만 자동으로 펼친다. 구간 머리를 누르면 접히고 펼쳐지며, 최고 층 위 카드는 잠긴다(이동 불가). 카드 높이는 상태와 무관하게 같다.

## 금지

- 몹 체력·피해·스폰 곡선·등급 확률을 "정리" 명목으로 압축하기(밸런스 작업은 사용자 확정 필요).
- `clampArenaPoint`로 적 스폰·이동을 자르기(멀리 뜬 적이 첫 프레임에 순간이동한다).
- **넉백·밀어내기를 `clampFieldPoint`로 자르기**(맞은 몹이 아레나 밖 120~250 구간에 갇혀 전사가 닿지 못한다 — `clampKnockbackPoint`를 쓴다).
- `render/`에서 상태 변경·저장 트리거.

## 테스트

`node --test tests/world-movement.test.mjs tests/arena.test.mjs tests/field-spawn.test.mjs tests/knockback-bounds.test.mjs tests/field-loot.test.mjs tests/elite-mob.test.mjs tests/offline.test.mjs tests/offline-climb.test.mjs tests/offline-auto-salvage.test.mjs tests/offline-survival-rework.test.mjs tests/background-settle.test.mjs tests/floor-cap.test.mjs tests/boss-loot.test.mjs tests/floor-power-modal.test.mjs tests/patch-rewards-and-buff.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md`(드롭·가방) · `docs/DUNGEON.md` · `docs/SYNC_SAVE.md` · `docs/WORLDBOSS_RANKING.md`
