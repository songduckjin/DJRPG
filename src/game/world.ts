/**
 * 필드 사냥 `World` — 이름과 export 경로를 지키는 껍데기(PR-2B).
 *
 * 실제 코드는 둘로 나뉘어 있다:
 *  · `game/combat/engine.ts` — `CombatEngine`: action·damage·shoot·쿨다운·이펙트·스킬(싸우는 규칙)
 *  · `game/fieldProgress.ts` — `FieldProgress`: 스폰·보스·층 이동·드롭(필드의 일)
 * `World`는 `FieldProgress`를 그대로 상속하고, 예전에 이 파일이 내보내던 타입·상수·공식을 그대로
 * re-export한다 — `import { World } from './world'`, `import { enemyMaxHp } from './world'` 같은
 * 기존 경로가 하나도 바뀌지 않는다.
 *
 * 왜 나눴나: 서버 리플레이(`server/dungeon-verify.mjs`·`server/world-boss.mjs`)가 던전·월드보스 전투를
 * 그대로 다시 돌리는데, 그 전투들은 `World`를 상속하는 바람에 필드의 몹 스폰·드롭·가방 규칙
 * (`arena`·`loot`·`inventory`·`bossLoot`·`bagCapacity`)까지 런타임 클로저로 끌고 들어왔다.
 * 이제 던전·월드보스는 `CombatEngine`만 쓰고, 필드 모듈은 서버 번들에 들어오지 않는다
 * (`tests/architecture-boundaries.test.mjs`·`tests/combat-field-split.test.mjs`).
 *
 * **동작·난수·타이밍·밸런스 수치는 한 값도 바꾸지 않았다** — 순수 이동이다.
 */
import { FieldProgress } from './fieldProgress';

/** 필드 사냥의 화면·규칙이 쓰는 이름 — 하는 일은 전부 `FieldProgress`(와 그 위의 `CombatEngine`)에 있다. */
export class World extends FieldProgress {}

// ── 전투 타입·공식·타겟팅 (PR-2A에서 `game/battle/`로 이동, 경로 호환용 re-export) ──
export type { Action, ArrowVariant, Coin, Drop, Effect, Enemy, HeroAfterimage } from './battle/types';
export { BASE_ATTACK_INTERVAL, BOSS_HP_RATIO, CRIT_CHANCE_CAP, CRIT_DAMAGE_SCALE, DAMAGE_REDUCTION_CAP, ELITE_HP_SCALE, ELITE_KILL_INTERVAL, ELITE_MOB_SCALE, ENEMY_ATTACK_RANGE, ENEMY_STOP_RANGE, ENEMY_STRIKE_SECONDS, MOB_CAP, MOB_CAP_GRACE_SECONDS, WARRIOR_ATTACK_RANGE, attackInterval, damageReduction, enemyRawHit, fieldSpawnRate, spawnRefillSeconds, spawnsPerRefill, swarmCount, targetAliveCount, archerAttackRange, archerStopRange, basicAttackPower, berserkAttackScale, berserkSpeedScale, enemyHitDamage, enemyMaxHp, enemyMoveSpeed, mageAttackRange, mageStopRange, offlineMobHp } from './battle/formulas';
export { fireBoltSpots } from './battle/targeting';

// ── 전투 연출·쿨다운 상수 (`game/combat/engine.ts`) ──
export { WEAPON_NOTICE_COOLDOWN, WEAPON_REQUIRED_NOTICE, cooldowns, crushHits, crushInterval, crushLabelOffset, crushPoseSpan, crushTrailLife, fireBoltCount, fireBoltScale } from './combat/engine';

// 보상 배율의 정의는 `progress.ts`에 있다(PR-3) — `tests/elite-mob.test.mjs`가 이 경로로 읽는다.
export { ELITE_REWARD_SCALE } from './progress';
