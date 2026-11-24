/**
 * 무한 방어전 전투 (DOM-free) — 2026-11-24 대장님·송덕진 님 최종 확정안.
 *
 * 요청(송덕진 님 개인 비서 → 우리 측, 2026-11-24 08:38)과 최종 확정 사양:
 *  ① 기존 '끝없는 던전'(돌파형)과 별도 모드. 캐릭터는 화면 아래에서 출발해 **위에서 내려오는 적**을
 *     향해 위·대각선으로 직접 걸어가 교전한다(자동 전투).
 *  ② 웨이브 3개 = 1스테이지. 스테이지를 막을 때마다 스테이지가 계속 오른다(무한). 5스테이지마다 보스.
 *  ③ **성벽(방어선)이 없다** — 성벽 오브젝트·방어선 HP 막대가 없고, 판은 **캐릭터 HP 0**에서 끝난다.
 *  ④ 아이템 드랍률은 필드와 동일 — 상수를 복사하지 않고 `items.ts`의 `itemDropChance()`·
 *     `rollItem()`·`statBooks.ts`의 `rollStatBookDrop()`을 **직접 호출**한다(PR #347의 ÷10이 자동 반영).
 *  ⑤ 실패해도 그때까지 먹은 금화·경험치·아이템은 남는다.
 *  ⑥ 보상 기준 층은 `defenseRewardFloor(stage) = min(20, 1 + floor((stage-1)/2))` — 서버 저장 가드
 *     (`rewardBudget`, `MAX_FLOOR=20`) 계약을 건드리지 않고 20층 값에서 포화한다. 랭킹 스테이지는 계속 오른다.
 *
 * 좌표: 화면은 아이소메트릭 투영(`projectArenaPoint`)을 그대로 쓴다 — 화면 세로는 `x+y`, 가로는 `x-y`다.
 * 그래서 이 모드의 자리는 (가로 `u = x-y`, 세로 `v = x+y`)로 적고, 월드 좌표는 `x=(u+v)/2, y=(v-u)/2`다.
 * 캐릭터는 화면 아래(v=380)에서 시작해 적을 따라 위로 올라가고, 적은 위(v=-940)에서 **복도 아래
 * 방어선(v=60)** 까지 곧게 내려온다. 방어선에 닿은 적은 그 자리에서 캐릭터를 압박한다.
 *
 * 서버가 이 파일을 그대로 리플레이한다(`server/defense-verify.mjs`) — `src/ui/**`를 import하지 않고,
 * 프레임 시간이 아니라 고정 스텝(`DEFENSE_STEP`)으로만 전진한다. `tests/architecture-boundaries.test.mjs`가
 * 서버 → ui 역방향 import를 막는다.
 */
import { random, seededRandom, useRandom, type Random } from '../rng';
import { CombatEngine } from '../combat/engine';
import type { Enemy } from '../battle/types';
import { ENEMY_ATTACK_RANGE, ENEMY_STOP_RANGE, ENEMY_STRIKE_SECONDS, enemyHitDamage, enemyMaxHp } from '../battle/formulas';
import { DEFENSE_MAX_STAGE, totalStats, type Save } from '../store';
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
/** digest 표본 간격(스텝). 0.5초마다 남은 체력·처치 수·스테이지를 남긴다. */
export const DEFENSE_TRACE_EVERY = 30;

/** 캐릭터가 출발하는 자리(화면 아래 69%) — 월드 좌표. */
export const DEFENSE_HERO_X = 190;
export const DEFENSE_HERO_Y = 190;
/** 적이 내려오기 시작하는 자리(화면 위 바깥, v=-940). */
export const DEFENSE_SPAWN_V = -940;
/** 적이 멈추는 방어선(v=60 · 화면 y≈53%) — 성벽이 아니라 적이 더 내려오지 않는 선이다. */
export const DEFENSE_LINE_V = 60;
/** 5개 레인(가로 u). 시드 난수로 고르고 ±6만 흔든다. */
export const DEFENSE_LANES: readonly number[] = [-160, -80, 0, 80, 160];
/** 레인 안에서의 난수 흔들림(월드 단위) — 리플레이가 흔들리지 않게 연출용 난수를 쓰지 않고 시드 난수만 쓴다. */
export const DEFENSE_SPAWN_JITTER = 6;
/**
 * 캐릭터가 움직일 수 있는 범위(가로 u, 세로 v).
 *
 * 세로 위 끝(`180`)은 화면 59%다 — 캐릭터는 하단(69%)에서 출발해 위에서 내려오는 적을 향해 올라가지만
 * 적 스폰 지점(화면 2%)까지 올라가지는 않는다. 그래서 적이 방어선(53%)에 닿으면 캐릭터가 바로 아래에서
 * 맞붙는다. 아래 끝(`470`, 화면 76%)은 하단 HUD 위다.
 */
export const DEFENSE_ARENA_U = 200;
export const DEFENSE_HERO_CEIL_V = 180;
export const DEFENSE_ARENA_V_MIN = DEFENSE_HERO_CEIL_V;
export const DEFENSE_ARENA_V_MAX = 470;
/** 캐릭터가 출발하는 세로 자리(화면 69%). */
export const DEFENSE_HERO_V = 380;
/** 적을 쫓기 시작하는 세로 자리(화면 42%) — 복도 위쪽의 먼 적을 향해 미리 걸어가지는 않는다. */
export const DEFENSE_ENGAGE_V = -30;

/** 웨이브 3개 = 1스테이지. */
export const DEFENSE_WAVES_PER_STAGE = 3;
/** 5스테이지마다 보스 스테이지(1웨이브 = 보스 1 + 미니언 4). */
export const DEFENSE_BOSS_EVERY = 5;
/** 보스 스테이지 1웨이브의 미니언 수. */
export const DEFENSE_BOSS_MINIONS = 4;
/** 보스 스테이지가 아닌 3웨이브의 마지막 1마리는 정예(체력 ×2). */
export const DEFENSE_ELITE_HP_SCALE = 2;
/** 적 공격력의 기준 층 상한 — `defenseEnemyFloor(stage) = 2 × min(stage, 40)`(필드 80층 상당). */
export const DEFENSE_ENEMY_FLOOR_CAP = 40;
/** 보상 기준 층의 상한 — 서버 저장 가드의 `MAX_FLOOR`(20)와 같은 값이다. */
export const DEFENSE_REWARD_FLOOR_CAP = 20;

/**
 * 보상 기준 층 — 스테이지 1~2는 1층, 이후 2스테이지마다 한 층씩 오르고 20층에서 포화한다(39스테이지 이후).
 * 서버 `rewardBudget`이 `MAX_FLOOR=20`에서 자르므로, 이 식을 넘겨 잡으면 정상 보상이 저장 단계에서 잘린다.
 */
export function defenseRewardFloor(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return Math.min(DEFENSE_REWARD_FLOOR_CAP, 1 + Math.floor((depth - 1) / 2));
}

/** 적 체력·공격력의 기준 층 — 40스테이지(필드 80층)에서 포화해 무한히 세지지 않게 한다. */
export function defenseEnemyFloor(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return 2 * Math.min(DEFENSE_ENEMY_FLOOR_CAP, depth);
}

/** 보스 스테이지인가(5·10·15…). */
export function defenseBossStage(stage: number): boolean {
  return Math.max(1, Math.floor(stage)) % DEFENSE_BOSS_EVERY === 0;
}

/** 한 웨이브의 적 수(보스 스테이지가 아닐 때) — 스테이지가 깊어질수록 3→9마리. */
export function defenseWaveKills(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return 3 + Math.min(6, Math.floor((depth - 1) / 4));
}

/** 한 스테이지의 웨이브별 적 수 — 보스 스테이지는 1웨이브가 보스 1 + 미니언 4다. */
export function defenseWaveSizes(stage: number): number[] {
  const kills = defenseWaveKills(stage);
  return defenseBossStage(stage)
    ? [1 + DEFENSE_BOSS_MINIONS, kills, kills]
    : [kills, kills, kills];
}

/** 한 스테이지의 총 적 수 — 서버 최소 시간 계산의 근거다. */
export function defenseStageEnemyCount(stage: number): number {
  return defenseWaveSizes(stage).reduce((sum, count) => sum + count, 0);
}

/** 적 스폰 간격(초) — 1스테이지 1.5초에서 41스테이지 이후 1.1초. */
export function defenseSpawnSeconds(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return Math.max(1.1, 1.5 - .01 * (depth - 1));
}

/** 적이 스폰에서 방어선까지 내려오는 시간(초) — 1스테이지 8.5초에서 66스테이지 이후 3.2초. */
export function defenseDescentSeconds(stage: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
  return Math.max(3.2, 8.5 - .08 * (depth - 1));
}

/** 그 스테이지 적의 하강 속도(월드 단위/초) — 시간표 하나로만 조절한다. */
export function defenseDescentSpeed(stage: number): number {
  return (DEFENSE_LINE_V - DEFENSE_SPAWN_V) / defenseDescentSeconds(stage);
}

/** 그 스테이지 일반 몹의 체력 — 필드 곡선(`enemyMaxHp`)의 단일 출처를 그대로 쓴다. */
export function defenseMobHp(stage: number): number {
  return enemyMaxHp(defenseEnemyFloor(stage), false);
}

/** 그 스테이지 보스의 체력 — 같은 기준 층의 필드 보스(일반의 13배). */
export function defenseBossHp(stage: number): number {
  return enemyMaxHp(defenseEnemyFloor(stage), true);
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
  /** 도달한(마지막으로 들어간) 스테이지 — 랭킹의 기준값이다. */
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
  stage = 1;
  /** 이 스테이지의 적 하강 속도(월드 단위/초). 스테이지가 오르면 `DefenseBattle`이 바꾼다. */
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
   * 적은 캐릭터를 쫓지 않고 **곧게 내려온다**(요청 ①: 위에서 내려오는 적).
   * 방어선(`DEFENSE_LINE_V`)에 닿거나 캐릭터와 `ENEMY_STOP_RANGE` 안이 되면 그 자리에 선다.
   * `CombatEngine.tickEnemies`의 공격·군집 규칙은 쓰지 않는다 — 방어전은 `DefenseBattle`이 0.9초마다
   * 한 마리씩 캐릭터를 때린다(던전과 같은 방식).
   */
  protected override tickEnemies(dt: number): void {
    const p = this.player;
    const playerV = p.x + p.y;
    for (const enemy of this.enemies) {
      enemy.attack = Math.max(0, (enemy.attack ?? 0) - dt);
      const { v } = defenseLane(enemy.x, enemy.y);
      const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      const slow = enemy.slow > 0 ? enemy.slowScale ?? .55 : 1;
      const descending = v < DEFENSE_LINE_V && distance > ENEMY_STOP_RANGE && playerV - v > ENEMY_STOP_RANGE;
      if (descending) {
        const step = this.descentSpeed * slow * dt;
        // 세로(v)만 움직인다 — 좌우 흔들림은 연출도 넣지 않는다(리플레이가 흔들리지 않게).
        enemy.x += step / 2;
        enemy.y += step / 2;
        enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25);
      }
      enemy.moving = descending;
      // 넉백(스킬 타격)은 그대로 받되, 복도 밖으로는 나가지 않는다.
      enemy.x += enemy.knockX * dt;
      enemy.y += enemy.knockY * dt;
      const lane = defenseLane(enemy.x, enemy.y);
      const u = Math.max(-DEFENSE_ARENA_U, Math.min(DEFENSE_ARENA_U, lane.u));
      const bounded = defensePoint(u, Math.max(DEFENSE_SPAWN_V - 40, Math.min(DEFENSE_LINE_V, lane.v)));
      enemy.x = bounded.x;
      enemy.y = bounded.y;
      enemy.knockX *= Math.exp(-dt * 12);
      enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.slow <= 0) enemy.slowScale = undefined;
      enemy.hit = Math.max(0, enemy.hit - dt);
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
  /** 지금 들어가 있는 스테이지 = 도달 스테이지. */
  stage = 1;
  wave = 1;
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

  constructor(save: Save, seed?: number) {
    // 전투 중에는 세이브 사본으로 싸우고, 실제 세이브에는 판이 끝날 때 한 번만 적는다
    // (던전의 "전투 중 저장 금지" 규칙과 같다).
    const copy = structuredClone(save);
    // 입문 구간(1~4층) 자연 회복이 방어전에 붙지 않게 기준 층을 상한(20)으로 둔다 — 생존은 장비·스킬 몫이다.
    copy.floor = 20;
    copy.floorKills = 0;
    copy.tutorial = 3;
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
  /** 보스 스테이지인가. */
  get bossStage(): boolean { return defenseBossStage(this.stage); }
  /** 지금 스테이지에서 처치해야 하는 총 마리 수(화면 표시용). */
  get stageTarget(): number { return defenseStageEnemyCount(this.stage); }
  /** 남은 적(아직 소환하지 않은 수 + 살아 있는 수). */
  get remaining(): number { return this.spawnLeft + this.world.enemies.length; }

  /** 이 판이 남긴 보상 — 실패해도 그대로 지급한다. */
  rewards(): DefenseRewards {
    return { gold: this.world.gold, exp: this.world.exp, kills: this.world.slain, bossKills: this.world.bossKills, items: this.world.items.slice() };
  }

  private withRandomRun<T>(run: () => T): T {
    if (!this.rng) return run();
    const previous = useRandom(this.rng);
    try { return run(); } finally { useRandom(previous); }
  }

  /** 이 스테이지·웨이브의 적을 세운다. 웨이브가 시작하면 첫 한 마리는 곧바로 나온다. */
  private startWave(): void {
    const sizes = defenseWaveSizes(this.stage);
    this.spawnLeft = sizes[Math.max(0, Math.min(sizes.length - 1, this.wave - 1))];
    this.spawnClock = 0;
    this.bossSpawned = false;
    if (this.spawnLeft > 0) this.spawnEnemy();
  }

  private spawnEnemy(): void {
    const stage = this.stage;
    const bossWave = defenseBossStage(stage) && this.wave === 1;
    const boss = bossWave && !this.bossSpawned;
    if (boss) this.bossSpawned = true;
    // 3웨이브의 마지막 한 마리(보스 스테이지 제외)는 정예 — 체력 2배.
    const elite = !bossWave && this.wave === DEFENSE_WAVES_PER_STAGE && this.spawnLeft === 1;
    const lane = DEFENSE_LANES[Math.min(DEFENSE_LANES.length - 1, Math.floor(random() * DEFENSE_LANES.length))];
    const u = lane + (random() * 2 - 1) * DEFENSE_SPAWN_JITTER;
    const point = defensePoint(u, DEFENSE_SPAWN_V);
    const hp = boss ? defenseBossHp(stage) : defenseMobHp(stage) * (elite ? DEFENSE_ELITE_HP_SCALE : 1);
    const enemy: Enemy = {
      x: point.x, y: point.y, hp, maxHp: hp, boss, hit: 0, step: 0, moving: true,
      knockX: 0, knockY: 0, slow: 0, elite: elite || undefined
    };
    this.world.enemies.push(enemy);
    this.spawnLeft--;
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
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (this.hitCooldown === 0) {
      const target = this.nearestInRange();
      if (target) {
        const taken = enemyHitDamage(defenseEnemyFloor(this.stage), target.boss, totalStats(this.world.save).defense, false) * (target.elite ? 2 : 1);
        this.world.player.hp = Math.max(0, this.world.player.hp - taken);
        this.world.player.hit = .25;
        this.hitCooldown = .9;
        target.attack = ENEMY_STRIKE_SECONDS;
        this.world.effects.push({
          x: this.world.player.x, y: this.world.player.y, kind: 'enemyStrike', age: 0, duration: .5,
          angle: Math.atan2(this.world.player.y - target.y, this.world.player.x - target.x), amount: Math.round(taken)
        });
      }
    }
    if (this.world.player.hp <= 0) { this.outcome = 'dead'; this.finished = true; return; }
    // 스폰 — 이 웨이브의 적이 남아 있으면 간격마다 한 마리씩.
    if (this.spawnLeft > 0) {
      this.spawnClock += dt;
      const interval = defenseSpawnSeconds(this.stage);
      while (this.spawnLeft > 0 && this.spawnClock >= interval) {
        this.spawnClock -= interval;
        this.spawnEnemy();
      }
    } else if (!this.world.enemies.length) {
      // 이 웨이브를 막았다 — 다음 웨이브, 마지막 웨이브였으면 스테이지 +1(무한).
      if (this.wave < DEFENSE_WAVES_PER_STAGE) {
        this.wave++;
      } else if (this.stage < DEFENSE_MAX_STAGE) {
        this.stage++;
        this.wave = 1;
        this.world.stage = this.stage;
        this.world.descentSpeed = defenseDescentSpeed(this.stage);
      } else {
        this.outcome = 'timeout';
        this.finished = true;
        return;
      }
      this.startWave();
    }
    if (this.elapsed >= DEFENSE_RUN_SECONDS) { this.outcome = 'timeout'; this.finished = true; }
  }

  private nearestInRange(): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDistance = Infinity;
    for (const enemy of this.world.enemies) {
      const distance = Math.hypot(enemy.x - this.world.player.x, enemy.y - this.world.player.y);
      if (distance <= ENEMY_ATTACK_RANGE && distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
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

/** 서버 최소 시간 검증이 쓰는 값 — 그 스테이지까지 스폰 간격만으로도 이만큼은 걸린다. */
export function defenseSpawnFloorSeconds(stage: number): number {
  let total = 0;
  const last = Math.max(1, Math.min(DEFENSE_MAX_STAGE, Math.floor(stage)));
  for (let s = 1; s <= last; s++) total += defenseStageEnemyCount(s) * defenseSpawnSeconds(s);
  return total;
}

/** 그 스테이지까지 나오는 적들의 체력 합 — 최소 시간의 두 번째 근거(처치 불가능한 주장을 막는다). */
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
