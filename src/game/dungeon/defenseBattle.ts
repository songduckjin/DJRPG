/**
 * 무한 방어전 전투 (DOM-free) — 2026-11-24 확정 **v2** 밸런스.
 *
 * v2는 v1(방어선 압박)의 방어선(v=60) 규칙을 **완전히 없앴다**. 적이 방어선에 서서 거리 무관으로
 * 때리던 규칙 대신, 적이 스폰(v=-940) 뒤 **캐릭터에게 직접 다가와** `ENEMY_STOP_RANGE`(60)에서 선다.
 * 원거리 직업의 정지 거리(궁수 180·마법사 160)는 "먼저 쏘는 시간"만 벌어 주고 무피해를 만들지 못한다.
 *
 *  ① 진행 단위는 **N 웨이브 하나**다(스테이지 개념 없음). 5웨이브마다 보스, 3의 배수 웨이브에 정예.
 *  ② 방어선·성벽 오브젝트와 HP/압박 규칙이 없다 — 판은 캐릭터 HP 0(또는 30분 안전 상한)에서 끝난다.
 *  ③ 적 이동속도는 110 → 190 u/s로 오르고(후반 가속), 20%는 스폰 뒤 3초간 2.1배속 돌진형이다.
 *  ④ 25%는 사수형 — 사거리 215에서 쏘고(접근 중에도) 1타 위력 ×0.8이다. 궁수 견제의 핵심이다.
 *  ⑤ 적 1타는 필드 1타의 90%(0.9초마다 한 마리), 1~3웨이브는 ×0.55로 완화한다.
 *  ⑥ 웨이브를 막으면 최대 체력 15%를 회복한다. 보상은 v1 그대로(필드 1/5 수준·20층 포화).
 *
 * 좌표: 화면은 아이소메트릭 투영(`projectArenaPoint`)을 그대로 쓴다 — 화면 세로는 `x+y`, 가로는 `x-y`다.
 * 그래서 이 모드의 자리는 (가로 `u = x-y`, 세로 `v = x+y`)로 적고, 월드 좌표는 `x=(u+v)/2, y=(v-u)/2`다.
 *
 * 서버가 이 파일을 그대로 리플레이한다(`server/defense-verify.mjs`) — `src/ui/**`를 import하지 않고,
 * 프레임 시간이 아니라 고정 스텝(`DEFENSE_STEP`)으로만 전진한다. `tests/architecture-boundaries.test.mjs`가
 * 서버 → ui 역방향 import를 막는다.
 *
 * 이름 규칙: 이 파일의 `stage`는 **웨이브 번호**다. 세이브(`defenseStage`)·API(`stage`)·DB
 * (`djrpg_defense_records.best_stage`)의 필드 이름은 v1과의 호환 때문에 그대로 두고, 화면에 보이는
 * 단위만 전부 `N 웨이브`로 통일했다(확정 사양 ①).
 */
import { random, seededRandom, useRandom, type Random } from '../rng';
import { CombatEngine } from '../combat/engine';
import type { Enemy } from '../battle/types';
import { ENEMY_STOP_RANGE, ENEMY_STRIKE_SECONDS, enemyHitDamage, enemyMaxHp } from '../battle/formulas';
import { DEFENSE_MAX_STAGE, totalStats, type Save } from '../store';
import { DEFENSE_TUNING } from './defenseTuning';
export { DEFENSE_MAX_STAGE };
import { itemDropChance, rollItem, type Item } from '../items';
import { rollStatBookDrop } from '../statBooks';
import { applyKillReward, killReward } from '../progress';

/** 서버 리플레이와 클라이언트가 함께 쓰는 고정 스텝(초). 던전(`DUNGEON_STEP`)과 같은 값이다. */
export const DEFENSE_STEP = 1 / 60;
/** 한 판의 안전 상한(초) — 30분. 서버 검증·요청 예산을 지키기 위한 상한이고 난이도 상한이 아니다. */
export const DEFENSE_RUN_SECONDS = 1800;
/** 30분 판의 최대 스텝 수 — 이보다 긴 요약은 서버가 받지 않는다. */
export const DEFENSE_MAX_STEPS = Math.ceil(DEFENSE_RUN_SECONDS / DEFENSE_STEP) + 2;
/** digest 표본 간격(스텝). 0.5초마다 남은 체력·처치 수·웨이브를 남긴다. */
export const DEFENSE_TRACE_EVERY = 30;

/** 캐릭터가 출발하는 자리(화면 아래 69%) — 월드 좌표. */
export const DEFENSE_HERO_X = 190;
export const DEFENSE_HERO_Y = 190;
/** 적이 스폰되는 자리(화면 위 바깥, v=-940). */
export const DEFENSE_SPAWN_V = DEFENSE_TUNING.spawnV;
/** 5개 레인(가로 u). 시드 난수로 고르고 ±6만 흔든다. */
export const DEFENSE_LANES: readonly number[] = [-160, -80, 0, 80, 160];
/** 레인 안에서의 난수 흔들림(월드 단위) — 리플레이가 흔들리지 않게 연출용 난수를 쓰지 않고 시드 난수만 쓴다. */
export const DEFENSE_SPAWN_JITTER = 6;
/**
 * 캐릭터가 움직일 수 있는 범위(가로 u, 세로 v).
 *
 * 세로 위 끝(`180`)은 화면 59%다 — 캐릭터는 하단(69%)에서 출발해 위에서 내려오는 적을 향해 올라가지만
 * 적 스폰 지점(화면 2%)까지 올라가지는 않는다. 아래 끝(`470`, 화면 76%)은 하단 HUD 위다.
 */
export const DEFENSE_ARENA_U = 200;
export const DEFENSE_HERO_CEIL_V = 180;
export const DEFENSE_ARENA_V_MIN = DEFENSE_HERO_CEIL_V;
export const DEFENSE_ARENA_V_MAX = 470;
/** 캐릭터가 출발하는 세로 자리(화면 69%). */
export const DEFENSE_HERO_V = 380;
/** 적을 쫓기 시작하는 세로 자리(화면 42%) — 복도 위쪽의 먼 적을 향해 미리 걸어가지는 않는다. */
export const DEFENSE_ENGAGE_V = -30;

/** 보스 웨이브 주기 — 5웨이브마다. */
export const DEFENSE_BOSS_EVERY = DEFENSE_TUNING.bossEvery;
/** 보스 웨이브의 호위 미니언 수. */
export const DEFENSE_BOSS_MINIONS = DEFENSE_TUNING.bossEscorts;
/** 정예 웨이브의 마지막 1마리는 정예(체력 ×2·피해 ×2). */
export const DEFENSE_ELITE_HP_SCALE = 2;
/** 적 공격력의 기준 층 상한. */
export const DEFENSE_ENEMY_FLOOR_CAP = DEFENSE_TUNING.enemyFloorCap;
/** 보상 기준 층의 상한 — 서버 저장 가드의 `MAX_FLOOR`(20)와 같은 값이다. */
export const DEFENSE_REWARD_FLOOR_CAP = 20;

/** 적 종류 — 근접 55% / 돌진 20% / 사수 25%. 보스는 항상 근접이다. */
export type DefenseEnemyKind = 'melee' | 'charger' | 'ranged';
/** 적 종류·스폰 경과 시간은 `Enemy` 본체를 건드리지 않고 이 모듈이 소유한다(다른 모드와 타입 공유). */
const enemyKinds = new WeakMap<Enemy, DefenseEnemyKind>();
const enemyAges = new WeakMap<Enemy, number>();

/** 적 종류(화면 연출·테스트용). 태그가 없으면 근접이다. */
export function defenseEnemyKind(enemy: Enemy): DefenseEnemyKind {
  return enemyKinds.get(enemy) ?? 'melee';
}

/** 스폰 뒤 흐른 시간(초) — 돌진형 연출이 쓴다. */
export function defenseEnemyAge(enemy: Enemy): number {
  return enemyAges.get(enemy) ?? 0;
}

/** 보상 기준 층 — 1웨이브부터 1.5웨이브마다 1층씩 오르고 20층(30웨이브)에서 포화한다. */
export function defenseRewardFloor(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  const t = DEFENSE_TUNING;
  return Math.min(DEFENSE_REWARD_FLOOR_CAP, t.rewardStart + Math.floor((depth - 1) / t.rewardWavesPerFloor));
}

/** 적 체력·공격력의 기준 층 — 웨이브마다 선형으로 오르고 상한(60)에서 포화한다. */
export function defenseEnemyFloor(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  const t = DEFENSE_TUNING;
  return Math.max(1, Math.min(t.enemyFloorCap, Math.round(t.enemyFloorStart + t.enemyFloorStep * (depth - 1))));
}

/** 보스 웨이브인가(5·10·15…). */
export function defenseBossStage(stage: number): boolean {
  return Math.max(1, Math.floor(stage)) % DEFENSE_BOSS_EVERY === 0;
}

/** 정예가 나오는 웨이브인가 — 보스 웨이브를 뺀 3의 배수 웨이브. */
export function defenseEliteWave(stage: number): boolean {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return !defenseBossStage(depth) && depth % DEFENSE_TUNING.eliteEvery === 0;
}

/** 한 웨이브의 적 수(보스 웨이브가 아닐 때) — 1웨이브 8마리에서 30웨이브 18마리, 상한 24마리. */
export function defenseWaveKills(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  const t = DEFENSE_TUNING;
  const early = Math.min(t.mobsMid, t.mobsEarly + (depth - 1) * (t.mobsMid - t.mobsEarly) / (t.mobRamp1 - 1));
  const late = early + Math.max(0, Math.min(1, (depth - t.mobRamp1) / (t.mobRamp2 - t.mobRamp1))) * (t.mobsLate - t.mobsMid);
  const grown = depth > t.mobRamp2 ? t.mobsLate + Math.floor((depth - t.mobRamp2) / 5) : late;
  return Math.max(1, Math.min(t.mobsMax, Math.round(grown)));
}

/** 한 웨이브의 스폰 목록 — 보스 웨이브는 보스 1 + 호위 6이다. */
export function defenseWaveSizes(stage: number): number[] {
  return defenseBossStage(stage) ? [1 + DEFENSE_BOSS_MINIONS] : [defenseWaveKills(stage)];
}

/** 그 웨이브의 총 적 수 — 서버 최소 시간 계산의 근거다. */
export function defenseStageEnemyCount(stage: number): number {
  return defenseWaveSizes(stage).reduce((sum, count) => sum + count, 0);
}

/** 적 스폰 간격(초). */
export function defenseSpawnSeconds(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  const t = DEFENSE_TUNING;
  return Math.max(t.spawnMin, t.spawnStart - t.spawnStep * (depth - 1));
}

/** 그 웨이브 적의 추격 속도(월드 단위/초) — 웨이브마다 오르고 190에서 멈춘다. */
export function defenseDescentSpeed(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  const t = DEFENSE_TUNING;
  return Math.min(t.chaseMax, t.chaseStart + t.chaseStep * (depth - 1));
}

/** 그 웨이브 일반 몹의 체력 — 필드 곡선(`enemyMaxHp`)의 단일 출처를 그대로 쓴다. */
export function defenseMobHp(stage: number): number {
  return Math.round(enemyMaxHp(defenseEnemyFloor(stage), false) * DEFENSE_TUNING.hpScale);
}

/** 그 웨이브 보스의 체력 — 같은 기준 층의 필드 보스(일반의 13배). */
export function defenseBossHp(stage: number): number {
  return Math.round(enemyMaxHp(defenseEnemyFloor(stage), true) * DEFENSE_TUNING.hpScale);
}

/** (가로 u, 세로 v) → 월드 좌표. */
export function defensePoint(u: number, v: number): { x: number; y: number } {
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

/** 월드 좌표 → (가로 u, 세로 v). */
export function defenseLane(x: number, y: number): { u: number; v: number } {
  return { u: x - y, v: x + y };
}

/** 캐릭터가 서는 자리의 경계(복도 안쪽) — `CombatEngine.clampHeroPoint`가 이 모드에서만 이 함수를 쓴다. */
export function clampDefenseHero(x: number, y: number): { x: number; y: number } {
  const { u, v } = defenseLane(x, y);
  return defensePoint(
    Math.max(-DEFENSE_ARENA_U, Math.min(DEFENSE_ARENA_U, u)),
    Math.max(DEFENSE_ARENA_V_MIN, Math.min(DEFENSE_ARENA_V_MAX, v))
  );
}

/** 전투가 끝난 뒤 클라이언트가 `submit`에 실어 보내는 결과 요약. 서버는 같은 시드로 다시 돌려 대조한다. */
export type DefenseBattleSummary = {
  /** 도달한 웨이브 — 랭킹의 기준값이다(필드 이름은 v1 호환으로 `stages`). */
  stages: number;
  kills: number;
  seconds: number;
  steps: number;
  heroHp: number;
  heroHpMax: number;
  /** 떨어진 아이템 개수(장비·스탯북). */
  items: number;
  digest: string;
};

/** 한 판이 실제로 남긴 보상 — 실패(캐릭터 사망)여도 그대로 지급한다. */
export type DefenseRewards = { gold: number; exp: number; kills: number; bossKills: number; items: Item[] };

class DefenseWorld extends CombatEngine {
  slain = 0;
  bossKills = 0;
  /** 지금 웨이브 번호(= 도달 웨이브). */
  stage = 1;
  /** 이 웨이브 적의 추격 속도(월드 단위/초). 웨이브가 오르면 `DefenseBattle`이 바꾼다. */
  descentSpeed = defenseDescentSpeed(1);
  /** 이 판에서 처치가 남긴 금화·경험치 — `applyKillReward`가 이미 이 사본 세이브에 적었다. */
  gold = 0;
  exp = 0;
  items: Item[] = [];

  /** 캐릭터는 복도 전체를 오르내린다(필드 아레나 경계가 아니다). */
  protected override clampHeroPoint(x: number, y: number): { x: number; y: number } {
    return clampDefenseHero(x, y);
  }

  /**
   * 내려온 적만 쫓는다 — 아직 복도 위쪽(화면 42%보다 위)에 있는 적을 향해 미리 걸어가면
   * 캐릭터가 스폰 지점까지 올라가 버린다. 적이 교전 구역에 들어오면 그때 가장 가까운 적으로 향한다.
   */
  override nearest(): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDistance = Infinity;
    for (const enemy of this.enemies) {
      const { v } = defenseLane(enemy.x, enemy.y);
      if (v < DEFENSE_ENGAGE_V) continue;
      const distance = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
  }

  /**
   * v2: 방어선이 없다 — 적은 스폰 뒤 **캐릭터를 향해 직접 다가와** `ENEMY_STOP_RANGE`(60)에서 선다.
   * 돌진형은 스폰 뒤 3초간 2.1배속이고, 사수형은 조금 느리게 다가온다(사격은 `DefenseBattle`이 맡는다).
   * `CombatEngine.tickEnemies`의 공격·군집 규칙은 쓰지 않는다 — 방어전은 0.9초마다 한 마리씩 때린다.
   */
  protected override tickEnemies(dt: number): void {
    const p = this.player;
    const t = DEFENSE_TUNING;
    for (const enemy of this.enemies) {
      enemy.attack = Math.max(0, (enemy.attack ?? 0) - dt);
      const age = (enemyAges.get(enemy) ?? 0) + dt;
      enemyAges.set(enemy, age);
      const kind = defenseEnemyKind(enemy);
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      const slow = enemy.slow > 0 ? enemy.slowScale ?? .55 : 1;
      let speed = this.descentSpeed;
      if (kind === 'charger' && age < t.chargerSeconds) speed *= t.chargerSpeedScale;
      if (kind === 'ranged') speed *= .85;
      const moving = d > ENEMY_STOP_RANGE;
      if (moving && d > 0) {
        const step = Math.min(d - ENEMY_STOP_RANGE, speed * slow * dt);
        enemy.x += dx / d * step;
        enemy.y += dy / d * step;
        enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25);
      }
      enemy.moving = moving;
      // 넉백(스킬 타격)은 그대로 받되, 복도 밖으로는 나가지 않는다.
      enemy.x += enemy.knockX * dt;
      enemy.y += enemy.knockY * dt;
      const lane = defenseLane(enemy.x, enemy.y);
      const u = Math.max(-DEFENSE_ARENA_U, Math.min(DEFENSE_ARENA_U, lane.u));
      const bounded = defensePoint(u, Math.max(DEFENSE_SPAWN_V - 40, Math.min(DEFENSE_ARENA_V_MAX + 40, lane.v)));
      enemy.x = bounded.x;
      enemy.y = bounded.y;
      enemy.knockX *= Math.exp(-dt * 12);
      enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.slow <= 0) enemy.slowScale = undefined;
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
    // 몸 분리 — 한 점에 겹치지 않게 최소 간격(24)을 둔다(결정적, 적 목록 순서 고정).
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i], b = this.enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < t.separation) {
        const push = (t.separation - d) / 2;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
    }
  }

  /** 처치 — 보상·드랍은 이 모드의 규칙(`dropLoot`) 하나가 정한다. */
  override kill(enemy: Enemy): void {
    this.slain++;
    if (enemy.boss) this.bossKills++;
    this.effects.push({ x: enemy.x, y: enemy.y, kind: 'death', age: 0, duration: .7, angle: random() * Math.PI * 2 });
    this.dropLoot(enemy);
  }

  /**
   * 처치 보상과 드랍.
   *
   * 금화·경험치는 `progress.ts` `applyKillReward`가 계산하고(필드 보상 계수·보스 배율 포함),
   * 아이템은 `items.ts` `itemDropChance()`·`rollItem()`과 `statBooks.ts` `rollStatBookDrop()`을
   * **직접** 부른다 — 상수를 복사하지 않으므로 PR #347(드랍률 ÷10)이 머지되면 이 모드도 자동으로 따라간다.
   */
  private dropLoot(enemy: Enemy): void {
    const floor = defenseRewardFloor(this.stage);
    const job = this.save.job ?? 'warrior';
    const reward = applyKillReward(this.save, { floor, boss: enemy.boss, elite: !!enemy.elite });
    this.gold += reward.gold;
    this.exp += reward.exp;
    if (enemy.boss) {
      // 보스는 확정 1개(PR #347이 던전 보스 확정 드랍을 2 → 1로 내린 것과 같은 결) — 등급표는 보스 몫을 쓴다.
      this.items.push(rollItem(floor, false, true, job));
    } else if (random() < itemDropChance(floor, false)) {
      this.items.push(rollItem(floor, false, false, job));
    }
    // 영구 스탯북은 던전 일반 몹과 같은 경로(`rollStatBookDrop('hunt')`)로 한 번 더 굴린다.
    const book = rollStatBookDrop('hunt');
    if (book) this.items.push(book);
  }
}

/** 무한 방어전 한 판 — 고정 스텝으로 전진하고, 서버가 같은 시드로 그대로 리플레이한다. */
export class DefenseBattle {
  readonly world: DefenseWorld;
  /** 서버가 준 시드. 없으면 게스트·시드 실패라 `Math.random`으로 돈다(그 판은 순위에 오르지 않는다). */
  readonly seed?: number;
  steps = 0;
  elapsed = 0;
  /** 지금 웨이브 번호 = 도달 웨이브. */
  stage = 1;
  finished = false;
  outcome: 'dead' | 'timeout' | null = null;
  private rng?: Random;
  private traceValues: number[] = [];
  /** 이 웨이브에 아직 소환하지 않은 적 수와 스폰 타이머. */
  private spawnLeft = 0;
  private spawnClock = 0;
  /** 적의 캐릭터 타격 간격(0.9초) — 한 번에 한 마리만 때린다(던전과 같다). */
  private hitCooldown = 0;
  private bossSpawned = false;
  /** 이 웨이브에서 세운 적 수(편성 줄 번호). */
  private spawned = 0;
  /** 이 웨이브를 막을 때 회복한 양 — 결과·테스트가 읽는다. */
  private healed = 0;

  constructor(save: Save, seed?: number) {
    // 전투 중에는 세이브 사본으로 싸우고, 실제 세이브에는 판이 끝날 때 한 번만 적는다
    // (던전의 "전투 중 저장 금지" 규칙과 같다).
    const copy = structuredClone(save);
    // 입문 구간(1~4층) 자연 회복이 방어전에 붙지 않게 기준 층을 상한(20)으로 둔다 — 생존은 장비·스킬 몫이다.
    copy.floor = 20;
    copy.floorKills = 0;
    // `tutorial`은 건드리지 않는다 — 무기 없이 시작한 새 캐릭터도 튜토리얼 예외로 평타를 낼 수 있어야
    // 방어전이 "서 있다 죽는" 판이 되지 않는다(던전은 무기를 전제하지만 방어전은 첫 진입도 받는다).
    copy.autoClimb = false;
    if (Number.isFinite(seed)) {
      this.seed = Math.floor(Number(seed)) >>> 0;
      this.rng = seededRandom(this.seed);
    }
    this.world = new DefenseWorld(copy);
    this.world.enemies = [];
    this.world.player.hp = totalStats(copy).health;
    const start = defensePoint(0, DEFENSE_HERO_V);
    this.world.player.x = start.x;
    this.world.player.y = start.y;
    this.world.stage = 1;
    this.world.descentSpeed = defenseDescentSpeed(1);
    // 첫 웨이브도 시드 난수로 세운다 — 서버 리플레이가 같은 자리에서 시작해야 한다.
    this.withRandomRun(() => this.startWave());
  }

  get trace(): readonly number[] { return this.traceValues; }
  /** 보스 웨이브인가. */
  get bossStage(): boolean { return defenseBossStage(this.stage); }
  /** 정예 웨이브인가. */
  get eliteWave(): boolean { return defenseEliteWave(this.stage); }
  /** 지금 웨이브에서 처치해야 하는 총 마리 수(화면 표시용). */
  get stageTarget(): number { return defenseStageEnemyCount(this.stage); }
  /** 남은 적(아직 소환하지 않은 수 + 살아 있는 수). */
  get remaining(): number { return this.spawnLeft + this.world.enemies.length; }
  /** 다음 적 타격까지 남은 시간(초) — 화면이 사수형 예고를 그리는 데 쓴다. */
  get nextStrikeIn(): number { return this.hitCooldown; }
  /** 마지막 웨이브를 막으며 회복한 양 — 0이면 아직 막은 웨이브가 없다. */
  get healedOnClear(): number { return this.healed; }

  /** 이 판이 남긴 보상 — 실패해도 그대로 지급한다. */
  rewards(): DefenseRewards {
    return { gold: this.world.gold, exp: this.world.exp, kills: this.world.slain, bossKills: this.world.bossKills, items: this.world.items.slice() };
  }

  private withRandomRun<T>(run: () => T): T {
    if (!this.rng) return run();
    const previous = useRandom(this.rng);
    try { return run(); } finally { useRandom(previous); }
  }

  /** 이 웨이브의 적을 세운다. 웨이브가 시작하면 첫 한 마리는 곧바로 나온다. */
  private startWave(): void {
    this.spawnLeft = defenseWaveSizes(this.stage)[0];
    this.spawnClock = 0;
    this.spawned = 0;
    this.bossSpawned = false;
    if (this.spawnLeft > 0) this.spawnEnemy();
  }

  private spawnEnemy(): void {
    const stage = this.stage;
    const bossWave = defenseBossStage(stage);
    const boss = bossWave && !this.bossSpawned;
    if (boss) this.bossSpawned = true;
    // 정예 웨이브의 마지막 한 마리(보스 제외)는 정예 — 체력 2배.
    const elite = !bossWave && defenseEliteWave(stage) && this.spawnLeft === 1;
    const lane = DEFENSE_LANES[Math.min(DEFENSE_LANES.length - 1, Math.floor(random() * DEFENSE_LANES.length))];
    const u = lane + (random() * 2 - 1) * DEFENSE_SPAWN_JITTER;
    const point = defensePoint(u, DEFENSE_SPAWN_V);
    const hp = boss ? defenseBossHp(stage) : defenseMobHp(stage) * (elite ? DEFENSE_ELITE_HP_SCALE : 1);
    // 종류 — 보스는 근접, 일반·정예는 시드 난수로 돌진형/사수형이 섞인다(순서 고정: 레인 → 지터 → 종류).
    const roll = boss ? 1 : random();
    const kind: DefenseEnemyKind = roll < DEFENSE_TUNING.chargerPct / 100 ? 'charger'
      : roll < (DEFENSE_TUNING.chargerPct + DEFENSE_TUNING.rangedPct) / 100 ? 'ranged' : 'melee';
    const enemy: Enemy = {
      x: point.x, y: point.y, hp, maxHp: hp, boss, hit: 0, step: 0, moving: true,
      knockX: 0, knockY: 0, slow: 0, elite: elite || undefined
    };
    enemyKinds.set(enemy, kind);
    enemyAges.set(enemy, 0);
    this.world.enemies.push(enemy);
    this.spawnLeft--;
    this.spawned++;
  }

  /**
   * 한 스텝 전진. 시드가 걸려 있으면 이 스텝 동안만 그 시드의 난수를 쓴다 — 서버 리플레이도 같은
   * 시드·같은 스텝 수로 돌기 때문에 적 스폰·드랍·치명타의 난수가 모두 같은 순서로 나온다.
   */
  advance(seconds: number): void {
    if (this.finished) return;
    this.withRandomRun(() => this.step(seconds));
    this.steps++;
    if (this.finished || this.steps % DEFENSE_TRACE_EVERY === 0) this.sample();
  }

  private sample(): void {
    this.traceValues.push(Math.round(this.world.player.hp), Math.round(this.enemyHpLeft()), this.world.slain, this.stage);
  }

  private enemyHpLeft(): number {
    let total = 0;
    for (const enemy of this.world.enemies) total += Math.max(0, enemy.hp);
    return total;
  }

  private step(seconds: number): void {
    const dt = Math.min(.05, Math.max(0, seconds), DEFENSE_RUN_SECONDS - this.elapsed);
    this.elapsed += dt;
    // 필드의 즉시 부활은 이 판이 소유한다 — 캐릭터가 쓰러지면 판이 끝난다.
    const hit = this.world.player.hit;
    this.world.player.hit = Infinity;
    try { this.world.update(dt); } finally { this.world.player.hit = Math.max(0, hit - dt); }
    // 적의 반격 — 0.9초마다 사거리 안의 가장 가까운 한 마리가 때린다(던전과 같은 규칙, 군집 배율 없음).
    // 사수형은 사거리 215에서 쏘고 1타 위력이 0.8배다.
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (this.hitCooldown === 0) {
      const target = this.nearestInRange();
      if (target) {
        const kind = defenseEnemyKind(target);
        const taken = Math.max(1, Math.round(
          this.enemyHitBalance(!!target.boss) * (target.elite ? 2 : 1) * (kind === 'ranged' ? DEFENSE_TUNING.rangedDmgScale : 1)
        ));
        this.world.player.hp = Math.max(0, this.world.player.hp - taken);
        this.world.player.hit = .25;
        this.hitCooldown = DEFENSE_TUNING.strikeInterval;
        target.attack = ENEMY_STRIKE_SECONDS;
        this.world.effects.push({
          x: this.world.player.x, y: this.world.player.y, kind: 'enemyStrike', age: 0, duration: .5,
          angle: Math.atan2(this.world.player.y - target.y, this.world.player.x - target.x), amount: taken
        });
      }
    }
    if (this.world.player.hp <= 0) { this.outcome = 'dead'; this.finished = true; return; }
    // 스폰 — 이 웨이브의 적이 남아 있으면 간격마다 한 마리씩(동시 생존 상한 안에서).
    if (this.spawnLeft > 0) {
      this.spawnClock += dt;
      const interval = defenseSpawnSeconds(this.stage);
      while (this.spawnLeft > 0 && this.spawnClock >= interval && this.world.enemies.length < DEFENSE_TUNING.maxAlive) {
        this.spawnClock -= interval;
        this.spawnEnemy();
      }
    } else if (!this.world.enemies.length) {
      // 이 웨이브를 막았다 — 다음 웨이브(무한). 막을 때마다 최대 체력 15%를 회복한다.
      if (this.stage < DEFENSE_MAX_STAGE) {
        this.stage++;
        this.world.stage = this.stage;
        this.world.descentSpeed = defenseDescentSpeed(this.stage);
      } else {
        this.outcome = 'timeout';
        this.finished = true;
        return;
      }
      this.healOnWaveClear();
      this.startWave();
    }
    if (this.elapsed >= DEFENSE_RUN_SECONDS) { this.outcome = 'timeout'; this.finished = true; }
  }

  /** 웨이브를 막았을 때의 회복 — 최대 체력의 15%. */
  private healOnWaveClear(): void {
    const pct = DEFENSE_TUNING.healClearPct;
    if (!(pct > 0)) return;
    const max = totalStats(this.world.save).health;
    const before = this.world.player.hp;
    this.world.player.hp = Math.min(max, this.world.player.hp + max * pct / 100);
    this.healed = this.world.player.hp - before;
    this.world.effects.push({ x: this.world.player.x, y: this.world.player.y, kind: 'heal', age: 0, duration: .45, angle: 0, amount: Math.round(max * pct / 100) });
  }

  /**
   * 이 웨이브 적 1타의 위력(방어 반영).
   *  · 보스는 보스 곡선(`enemyHitDamage(..., boss=true)`)을 그대로 쓴다 — 일반의 약 2.2배다.
   *  · 1~3웨이브는 ×0.55로 완화한다(신규 캐릭터가 3~4웨이브는 보게).
   */
  private enemyHitBalance(boss: boolean): number {
    const t = DEFENSE_TUNING;
    const ease = this.stage <= t.earlyWaves ? t.earlyDmgScale : 1;
    return enemyHitDamage(defenseEnemyFloor(this.stage), boss, totalStats(this.world.save).defense, false) * t.dmgScale * ease;
  }

  /** 사거리 안의 적 — 가까운 순. 근접은 90, 사수형은 215다. */
  private inRange(): Enemy[] {
    const t = DEFENSE_TUNING;
    return this.world.enemies
      .map(enemy => ({ enemy, d: Math.hypot(enemy.x - this.world.player.x, enemy.y - this.world.player.y) }))
      .filter(({ enemy, d }) => d <= (defenseEnemyKind(enemy) === 'ranged' ? t.rangedAttackRange : t.enemyAttackRange))
      .sort((a, b) => a.d - b.d)
      .map(({ enemy }) => enemy);
  }

  private nearestInRange(): Enemy | undefined {
    return this.inRange().slice(0, DEFENSE_TUNING.maxStrikers)[0];
  }
}

/** FNV-1a 32비트 — 표본 정수 배열을 8자리 16진수 한 줄로 접는다(던전 `dungeonDigest`와 같은 방식). */
export function defenseDigest(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const int = Math.max(-2147483648, Math.min(2147483647, Math.round(value))) | 0;
    for (const shift of [24, 16, 8, 0]) { hash ^= (int >>> shift) & 255; hash = Math.imul(hash, 0x01000193) >>> 0; }
  }
  return hash.toString(16).padStart(8, '0');
}

/** 끝난 판의 결과 요약 — 클라이언트가 `submit`에 싣고, 서버는 같은 시드로 돌린 결과와 비교한다. */
export function defenseBattleSummary(battle: DefenseBattle): DefenseBattleSummary {
  const playerHp = Math.max(0, Math.ceil(battle.world.player.hp));
  const health = Math.max(1, Math.ceil(totalStats(battle.world.save).health));
  return {
    stages: battle.stage,
    kills: battle.world.slain,
    seconds: Math.round(battle.elapsed * 10) / 10,
    steps: battle.steps,
    heroHp: playerHp,
    heroHpMax: health,
    items: battle.world.items.length,
    digest: defenseDigest([...battle.trace, playerHp, battle.stage, battle.world.slain])
  };
}

/**
 * 그 세이브로 그 시드의 판을 고정 스텝으로 돌린다 — 클라이언트 재생과 서버 리플레이가 같은 함수를 쓴다.
 * `maxSteps`는 서버 리플레이의 CPU 상한(3분 = 10,800스텝)에 쓴다.
 */
export function runDefenseBattle(save: Save, seed?: number, maxSteps = DEFENSE_MAX_STEPS): DefenseBattle {
  const battle = new DefenseBattle(save, seed);
  while (!battle.finished && battle.steps < maxSteps) battle.advance(DEFENSE_STEP);
  return battle;
}

/** 서버 최소 시간 검증이 쓰는 값 — 그 웨이브까지 스폰 간격만으로도 이만큼은 걸린다. */
export function defenseSpawnFloorSeconds(stage: number): number {
  let total = 0;
  const last = Math.max(1, Math.min(DEFENSE_MAX_STAGE, Math.floor(stage)));
  for (let s = 1; s <= last; s++) total += defenseStageEnemyCount(s) * defenseSpawnSeconds(s);
  return total;
}

/** 그 웨이브까지 나오는 적들의 체력 합 — 최소 시간의 두 번째 근거(처치 불가능한 주장을 막는다). */
export function defenseStageHpSum(stage: number): number {
  let total = 0;
  const last = Math.max(1, Math.min(DEFENSE_MAX_STAGE, Math.floor(stage)));
  for (let s = 1; s <= last; s++) total += defenseStageEnemyCount(s) * defenseMobHp(s);
  return total;
}

/** 보상 계산에 쓰는 처치 보상 하나(결과창·검증 로그용) — 세이브를 건드리지 않는 순수 계산. */
export function defenseKillReward(stage: number, save: Save, boss = false, elite = false): { gold: number; exp: number } {
  return killReward(save, { floor: defenseRewardFloor(stage), boss, elite });
}
