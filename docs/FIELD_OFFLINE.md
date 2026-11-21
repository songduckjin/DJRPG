# FIELD_OFFLINE — 일반 필드 전투 · 방치 오프라인 · 필드 보스

> **책임**: 접속 중 일반 필드 사냥(층 이동·층 보스·정예·드롭)과 방치(오프라인) 정산. 끝없는 던전은 `docs/DUNGEON.md`.
> **읽는 법**: 이 파일 → `docs/SYNC_SAVE.md`(저장) → 손대는 파일만 `rg`. 전체 트리 탐색 금지.

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 전투 루프·스폰·AI·층·보스·드롭 회수 | `src/game/world.ts` |
| 드롭 바닥 배치·흡수 규칙(순수 계산) | `src/game/loot.ts` (표시는 `src/game/render/drops.ts`) |
| 이동·스폰 경계 | `src/game/arena.ts` (`arenaLimits`·`clampArenaPoint`·`fieldSpawn*`·`clampFieldPoint`) |
| 보스 금화 무더기·던전 보스 드롭 표 | `src/game/bossLoot.ts` |
| 방치 정산(최대 12시간) | `src/game/offline.ts` |
| 층 상한·층당 처치 목표·경험치 | `src/game/store.ts` (`MAX_FLOOR`=20·`floorKillTarget`·`addExperience`) |
| 드롭 확률·등급·강화 | `src/game/items.ts` — 규칙은 `docs/INVENTORY_GEAR.md` |
| HUD·층 선택·보스 도전 버튼 | `src/ui/hud.ts`·`src/ui/modals/floorModal.ts`·`src/styles/hud.css` |

## 불변 규칙

- **층 상한 20**(`MAX_FLOOR`). `parseSave`가 `floor`·`maxFloor`를 1~20으로 클램프하고 서버 `writeSave`도 같은 상한을 쓴다.
- **필드 보스는 최고 도달 층에서만**(`bossFloor()` = `save.floor >= save.maxFloor`). 아래층 반복 사냥에는 보스가 없다. 보스는 자동 등반이 켜져 있을 때만 예약된다.
- **보스 재도전**: 최고 층에서 **보스에게** 져 자동 등반이 꺼지면 `bossRetryReady` → HUD `⚔ 보스 도전`. 일반·정예 몹에게 진 것으로는 켜지지 않는다. 진 층은 `save.bossRetryFloor`에 남겨 새로고침·재접속에도 유지하고 다음 층으로 오르면 0으로 지운다. 보스 소환 순간 체력을 최대치로 회복하고 모든 쿨타임을 0으로 리셋한다.
- **사거리**: 전사 90 / 궁수 330·정지 180 / 마법사 285·정지 160. `World.update`가 가장 가까운 적을 향해 `stopRange`까지 걷는다. 몹 공격 사거리는 전사 평타와 같은 90(작업 254).
- **평타 1마리**: `action`의 평타는 `maxTargets=1`·피해 `attack × basicAttackPower(1.6)`. 광역은 스킬만.
- **필드 몹 상한 30**(`MOB_CAP`). 30마리가 차면 1층 내려가 `floorKills`·적·추격·보스/정예 예약을 비우고 드롭은 남긴다.
- **정예 몹**: 30마리마다 1마리, 체력·금화·경험치 ×2, 드롭은 1배, 크기 1.22배, 배지 `정예 해골`.
- **몹은 필드 외곽 밴드에서 뜬다**(`spawnArenaEnemy`·`fieldSpawnBand`). 적 이동·넉백은 `clampFieldPoint`, 플레이어만 `clampArenaPoint`.
- **드롭**: 처치 시 금화는 그 자리에서 지급(코인은 연출 전용), 아이템은 `LOOT_REST_SECONDS`(1.5초) 뒤 흡수되어 `LOOT_ABSORB_SECONDS` 후 가방에 들어간다. 가방 40칸이 차면 바닥에 남고 경고는 1회.
- **드롭률은 전 층 고정**(작업 254): 접속 일반 0.39% · 보스 4%, 방치 일반 0.30% · 보스 4%. 등급 컷만 층에 따라 오른다(`rollItem`).
- **방치 정산**: 최대 12시간(`elapsedSince`), 아래층에서는 보스 몫 없이 진행도만 돈다. 자동 등반이 켜져 있고 최고 층이면 목표 처치마다 보스전을 정산해 이기면 층을 올린다(작업 235). 방치도 `autoSalvageRecovered`를 지나 분해분은 가방 대신 금화·강화석이 된다(작업 254).
- **저장**: `world`의 휘발 상태(`enemies`·`effects`·`drops`)는 저장되지 않는다. `save`를 바꾸면 `world.onChange` → `Interface.onSave` → `sync.queueSave()` 한 경로만 쓴다.

## 금지

- 몹 체력·피해·스폰 곡선·등급 확률을 "정리" 명목으로 압축하기(밸런스 작업은 사용자 확정 필요).
- `clampArenaPoint`로 적 스폰·이동을 자르기(멀리 뜬 적이 첫 프레임에 순간이동한다).
- `render/`에서 상태 변경·저장 트리거.

## 테스트

`node --test tests/world-movement.test.mjs tests/arena.test.mjs tests/field-spawn.test.mjs tests/field-loot.test.mjs tests/elite-mob.test.mjs tests/offline.test.mjs tests/offline-climb.test.mjs tests/offline-auto-salvage.test.mjs tests/floor-cap.test.mjs tests/boss-loot.test.mjs`

## 관련 매뉴얼

`docs/INVENTORY_GEAR.md`(드롭·가방) · `docs/DUNGEON.md` · `docs/SYNC_SAVE.md` · `docs/WORLDBOSS_RANKING.md`
