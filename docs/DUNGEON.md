# DUNGEON — 끝없는 던전 · 서버 리플레이 검증 · 순위

> **책임**: 상시 던전(1~10층, 90초 한 판)의 전투·클리어 기록·서버 검증·순위. 필드 사냥과 방치 정산은 `docs/FIELD_OFFLINE.md`.
>
> **별도 모드**: 무한 방어전(성벽 없는 방어형·무한 스테이지)은 `docs/DEFENSE.md`다 — 이 문서의 화면·검증 경로를
> 수정하지 않고 같은 던전 모달의 **허브**에서 갈라진다(2026-11-24).

## 핵심 파일

| 역할 | 파일 |
|---|---|
| 전투 순수 로직·고정 스텝·요약 | `src/ui/dungeonBattle.ts` (`DUNGEON_STEP`=1/60·`DUNGEON_MAX_STEPS`·`DungeonBattle`·`dungeonBattleSummary`·`runDungeonBattle`) |
| 화면·드롭 연출·결과 | `src/ui/dungeonField.ts`·`src/ui/dungeonRewardMarkup.ts`·`src/styles/dungeon.css` |
| 대기창·다음 층·순위 탭 | `src/ui/dungeonLobby.ts`·`src/ui/modals/dungeonModal.ts` |
| 서버 순위·기록 | `src/game/dungeonLive.ts`·`server/dungeon.mjs`·`server/endpoints/dungeon.mjs`·`functions/api/dungeon.js` |
| 서버 리플레이 검증 | `server/dungeon-verify.mjs` |
| 클리어 보상·세이브 기록 | `src/game/dungeonRewards.ts`·`src/game/dungeonProgress.ts` |
| 스키마·층 상한 | `server/dungeon-schema.mjs`(`DUNGEON_MAX_FLOOR`=10)·`src/game/store.ts`(`DUNGEON_MAX_FLOOR`·`dungeonFloor`·`dungeonClearAt`) |

## 불변 규칙

- **한 판 90초**. `DUNGEON_STEP`은 클라이언트·서버가 같은 고정 스텝이고 `DUNGEON_MAX_STEPS`를 넘는 요약은 서버가 거부한다. 전투는 실시간 dt가 아니라 고정 스텝으로만 진행한다(`pendingStep`에 프레임 dt를 모은다).
- **결정적 난수**: 전투 난수는 `src/game/rng.ts`의 `random()` 입구만 쓴다. 서버가 `begin`에서 준 시드로 `runDungeonBattle(save, floor, seed)`를 다시 돌려 같은 결과를 재현한다.
- **판정 순서**(`verifyDungeonClear`): ① 경과 시간 ≥ `requiredClearSeconds`(리플레이 클리어 시간의 1/2, 최소 10초·미클리어 30초) ② 요약 `won` 존재 ③ 스텝 상한 ④ 리플레이와 스텝·남은 체력 ±12%. 실패 코드: `DUNGEON_NOT_STARTED`·`DUNGEON_TOO_FAST`·`DUNGEON_OUT_OF_ORDER`·`DUNGEON_SUMMARY_REQUIRED`·`DUNGEON_SUMMARY_MISMATCH`.
- **기록의 주인은 세이브**: `submit`은 클라이언트가 보낸 층이 아니라 계정 세이브의 `dungeonFloor`를 서버가 다시 읽어 적는다. 최고층은 오르기만 하고 같은 층은 처음 기록 시각을 유지한다.
- **저장 선행**: `dungeonLive.submit`은 `sync.flush()`로 진행을 먼저 저장한 뒤 요약을 보낸다. 전송 실패 요약은 `rememberClear`가 들고 있다가 순위 탭 재전송에 그대로 쓴다.
- **전투 중 저장 금지**: 던전 안에서는 필드 자동 사냥·자동 등반이 꺼진 사본(`structuredClone`)으로 싸운다. 실제 `Save`는 클리어 보상 시점에만 바뀐다.
- **던전 보스**: 5층·10층. 보스 아이템은 `BOSS_ITEM_DROPS`(1개, 아이템 드롭 B안 2026-11-23)·`rollBossItem`(던전 전용). 메인 필드 보스와 표가 다르다 — `docs/FIELD_OFFLINE.md`.
- **적 피해**: `dungeonHitDamage(층, 보스, 방어, 정예)` = `enemyHitDamage(층, …)` (작업 254에서 층×2 → 층×1, 사용자 확정) × (정예 2배). 최대 체력 % 상한은 없다.
- **적 사거리**: 필드와 같은 `ENEMY_ATTACK_RANGE`(90)·`ENEMY_STOP_RANGE`(60). 36·27 같은 접촉 거리 상수를 되살리지 않는다.
- **층 등급표**: `dungeonRarityFor`·`DUNGEON_RARITY_TIERS`(1~10층)·`DUNGEON_BOSS_RARITY_TIERS`. 드롭률 `DUNGEON_DROP_CHANCE_*` 0.5% 고정(아이템 드롭 B안 2026-11-23, 직전 5%의 1/10).
- **게스트**: `list`만 가능, `submit`은 `GUEST_READ_ONLY`(403). 10층 뒤는 `11층 Coming Soon`.
- **히어로 이동**: 던전도 필드와 같은 규칙으로 가장 가까운 적을 향해 `stopRange`까지 걷는다(작업 248에서 중앙 고정을 없앴다). `nearest()`에 임의 상한을 두지 않는다.

## 금지

- 피해 식을 서버에 따로 적기 — 서버는 `runDungeonBattle`을 그대로 돌린다.
- `DUNGEON_STEP`·`DUNGEON_MAX_FLOOR`를 한쪽만 바꾸기(테스트가 대조한다).
- 실시간 dt로 전투를 돌리기(리플레이가 어긋나 검증이 거짓 실패한다).

## 테스트

`node --test tests/dungeon-battle.test.mjs tests/dungeon-verify.test.mjs tests/dungeon-record.test.mjs tests/dungeon-ranking.test.mjs tests/dungeon-lobby.test.mjs tests/dungeon-rewards.test.mjs tests/dungeon-248.test.mjs tests/dungeon-seed.test.mjs`

## 관련 매뉴얼

`docs/FIELD_OFFLINE.md` · `docs/WORLDBOSS_RANKING.md` · `docs/SYNC_SAVE.md` · `docs/INVENTORY_GEAR.md`
