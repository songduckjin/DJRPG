/**
 * 전투 공식 (DOM-free, 순수 함수).
 *
 * 필드(`world.ts`)·던전(`dungeon/battle.ts`)·오프라인 정산(`offline.ts`)·서버 클램프
 * (`server/save-guard.mjs`)가 보는 **밸런스 수치의 단일 진실**이다. 여기 값을 바꾸면 세 곳이 함께
 * 움직이므로, 밸런스 PR은 이 파일 하나와 그 근거 테스트만 보면 된다.
 *
 * 화면·렌더·`src/ui/**`를 import하지 않는다 — 서버가 이 모듈을 그대로 돌린다
 * (`tests/architecture-boundaries.test.mjs`).
 */

/** 적 공격 모션 길이(작업 245) — 이 시간 동안 적이 플레이어 쪽으로 내딛고, 끝나면 제자리로 돌아온다. */
export const ENEMY_STRIKE_SECONDS = .42;
/** 전사 평타의 사거리(월드 단위) — 전사는 이 거리 안의 적을 벤다. */
export const WARRIOR_ATTACK_RANGE = 90;
/** 몬스터의 공격 사거리(작업 254) — **전사 평타와 같은 90**으로 통일했다.
 *
 *  종전에는 적이 히어로 몸에 닿아야(35) 때렸다. 그래서 전사는 90에서 일방적으로 벨 수 있었고
 *  적은 몸이 닿아야 반격했다. 이제 적도 **90 안이면 때린다** — 히어로가 벨 수 있는 자리에서
 *  곧바로 반격을 받는다(맞사거리가 양쪽 모두 90). 던전도 같은 상수를 쓴다
 *  (`game/dungeon/battle.ts`의 0.9초 피격). */
export const ENEMY_ATTACK_RANGE = WARRIOR_ATTACK_RANGE;
/** 몬스터가 서는(걷기를 멈추는) 거리 — 공격 사거리(90)보다 **안쪽인 60**이다(작업 254).
 *
 *  서는 자리를 사거리와 똑같이 90으로 두면, 히어로의 평타가 적을 16유닛 밀어내는 넉백 때문에
 *  적이 매 타격마다 사거리 밖으로 튕겨 나가고 히어로가 다시 걸어 들어가야 한다 — 때리고 걷고를
 *  반복하는 딸꾹질이 된다. 60은 ① 그 16유닛을 밀려도 76이라 사거리(90) 안에 남고 ② 시기는
 *  화면에서 약 57px(적·히어로 몹 높이 66px 안팎)라 몸이 겹치지 않으면서 공격 모션의 16px
 *  내딛기(보스 26px)가 닿는 자리다. 예전 정지 거리는 27이었다 — 적이 히어로 몸 위에 올라서
 *  여러 마리가 한 점에 겹쳤다. */
export const ENEMY_STOP_RANGE = 60;
/** 치명타(작업 245, 밸런스 v2) — 장비 추가옵션 `치명타 확률`·패시브를 합산한 스탯 `crit`이 곧 발동 확률(%)이다.
 *  배수는 1.8배, 확률 상한은 100%다. v2는 기본(레벨) 20% + 패시브 30% + 장비 60% = 110% 예산을 잡고
 *  실전에서 100%에서 자른다 — 세 직업 모두 풀 세팅에서 97~100%에 닿는다. */
export const CRIT_CHANCE_CAP = 100;
export const CRIT_DAMAGE_SCALE = 1.8;
/**
 * 치명타 피해 **가산**의 합산 상한(%) — 장비 추가옵션 `치명타 피해량`(백로그 2번, 덕진 님 확정).
 *
 * 추가옵션은 부위마다 1~3%가 붙고 10부위를 모두 채우면 30%까지 쌓인다. 1.8배에 30%를 그대로 더하면
 * 2.1배가 되어 치명타 한 방이 스킬 한 방을 넘어서므로, 가산은 **+15%에서 자른다**(1.95배).
 */
export const CRIT_DAMAGE_BONUS_CAP = 15;
/**
 * 치명타 한 방의 피해 배율 — 기본 1.8배 + 장비 추가옵션 `치명타 피해량`(%, 상한 `CRIT_DAMAGE_BONUS_CAP`).
 *
 * 확률 판정(`CRIT_CHANCE_CAP`)은 그대로이고 **터졌을 때의 배수**만 오른다. 필드(`combat/engine.ts`)와
 * 방치 정산(`offline.ts`), 상세 스탯(`statSheet.ts`)이 모두 이 함수 하나를 쓴다.
 */
export function critDamageScale(bonusPct = 0): number {
  const bonus = Math.max(0, Math.min(CRIT_DAMAGE_BONUS_CAP, Number.isFinite(bonusPct) ? bonusPct : 0));
  return CRIT_DAMAGE_SCALE + bonus / 100;
}
/**
 * 평타의 **직업별 기본 간격**(초) — 밸런스 v2.
 *
 * 마법사만 0.63초다. 종전에는 세 직업 모두 0.48초에 장비 공속 배율로만 격차를 냈는데, 그러면 마법사의
 * "공속 +N%" 표시가 실제 체감과 어긋났다(배율을 0.45로 눌러 표시 숫자를 거의 지워야 했다). 이제 간격
 * 자체가 느려 "느리게 캐스팅하는 대신 한 방"이 애니메이션에도 드러나고, 장비 공속은 정직하게 먹는다.
 */
export const BASE_ATTACK_INTERVAL: Record<'warrior' | 'archer' | 'mage', number> = { warrior: .48, archer: .48, mage: .63 };
/** 최대 공속(초당 타격 수) — 6.00타/초, 곧 최소 간격 0.1667초(밸런스 v2).
 *  위계는 궁수 6.00 > 전사 ~4.54 > 마법사 ~3.36이며, 6.00에 닿는 것은 궁수뿐이다(호크아이 중). */
export const HITS_PER_SECOND_CAP = 6;
/** 한 직업의 평타 간격(초). 공속 %와 광폭 버프 배율을 반영하고 6.00타/초 상한에서 자른다. */
export function attackInterval(job: string, speed: number, berserkSpeed = 1): number {
  const base = BASE_ATTACK_INTERVAL[job as 'warrior'] ?? BASE_ATTACK_INTERVAL.warrior;
  const interval = base / (1 + Math.max(0, speed) / 100) * (berserkSpeed > 0 ? 1 / berserkSpeed : 1);
  return Math.max(1 / HITS_PER_SECOND_CAP, interval);
}
/** 평타 한 방의 공격력 배율. 한 마리만 맞히는 대신 한 방이 무겁다(작업 150). */
export const basicAttackPower = 1.6;
/** 궁수 평타 사거리와, 이보다 멀 때만 다가가는 거리(작업 157, 간격 조정 작업 207, 상향 작업 244).
 *  사용자 요청 "궁수 법사 사거리 조금씩늘려줘"(2026-11-21)로 280/150 → 330/180.
 *  필드 스폰 밴드가 170~333 남짓이라(작업 230) 이제 거의 모든 적을 뜨자마자 쏘고,
 *  추격은 적이 정지 거리(180) 안으로 들어올 때만 한다. 정지 거리는 평타의 약 55%로 종전 비율 그대로다. */
export const archerAttackRange = 330;
export const archerStopRange = 180;
/** 마법사도 원거리다 — 궁수보다 짧은 사거리에서 마법 구슬을 날린다(작업 198, 간격 조정 작업 207·216·244).
 *  직업별 간격은 궁수 330/180 > 마법사 285/160 > 전사 90 순서를 지긴다.
 *  궁수의 약 86%를 유지해 두 원거리 직업의 체감 차등은 그대로 두고 함께 올렸다(240/130 → 285/160). */
export const mageAttackRange = 285;
export const mageStopRange = 160;

export function enemyMoveSpeed(floor: number, boss: boolean): number {
  return boss ? 28 : Math.min(64, 38 + Math.max(0, floor - 1) * 1.2);
}
/** The normal-mob curve the game had before 작업 196 (floor 78: ~4,380). It is kept as the floor of
 *  the blend below so the early floors play exactly as they did, and `game/offline.ts` still settles
 *  its standing rewards on it: the deeper curve is about a live fight taking longer, and 20 hours away
 *  should not quietly pay 30% less. */
export function offlineMobHp(floor: number): number { return 24 + floor * 12 + Math.pow(floor, 1.55) * 4; }
/** The deep curve from 작업 198: floor 78 lands at ~54,800 instead of ~15,360, so a high floor has to
 *  be worn down and a floor you cannot clear sends you back down to farm. The exponent is what keeps the
 *  early floors where they are — 10~15층 sits at the health 작업 196 left (10층 299·15층 653 vs 309·651)
 *  — while from 25층 on it climbs fast: 25층 3,000 · 40층 9,700 · 50층 17,300 · 60층 27,700 · 78층 54,800(3.6배). */
export function deepMobHp(floor: number): number { return 24 + floor * 14 + Math.pow(floor, 2.65) * 0.52; }
/** Floors below this keep the old curve; the deep one has fully taken over by `HP_RAMP_BY`. The ramp is
 *  what lets both halves of the request hold: 1~8층은 그대로, 25층부터는 깊은 층 곡선, 그 사이는 완만히. */
/** 9~20층 일반 몹 HP 배율(밸런스 v2) — 종전 블렌드 곡선의 75%. 20층 1,083. */
export const MOB_HP_DEEP_SCALE = .75;
/** 21층+ 일반 몹 HP의 층당 기울기 — `98.5 × (1 + 층/2)`. 20 → 21층이 +4.6%로 이어진다. */
export const DEEP_HP_PER_UNIT = 98.5;
const HP_RAMP_FROM = 8, HP_RAMP_BY = 25;
/** The boss weight the game had before 작업 198 (floor 78: ~41,700, 2.7x a normal mob): a geared
 *  player deleted a boss in one combo, which made its 2.2% drop feel handed out. */
export function earlyBossHp(floor: number): number { return 220 + floor * 95 + Math.pow(floor, 1.6) * 32; }
/** 보스 HP = 일반 몹의 13배(밸런스 v2). v1의 8배는 스킬을 0으로 두고 계산한 값이라, 실제 Lv17 캐릭터
 *  (스킬 Lv10)로는 보스가 3초에 녹았다 — 13배로 올려 표준 장비 4~5초를 지킨다. 20층 보스 14,079. */
export const BOSS_HP_RATIO = 13;
/** Health of a mob on a floor: the early curve and the deep one blended over `HP_RAMP_FROM`~`BY`, and
 *  a boss blended the same way from its old weight into six times its mob — 1~8층 보스는 그대로다. */
/**
 * 입문 구간(1~4층) 완화 배율 — 밸런스 v2 온보딩.
 *
 * 적 사거리가 90이 된 뒤로 1층의 Lv.1 캐릭터가 적 두어 마리에 둘러싸여 순식간에 쓰러졌다. 1층 몹 HP를
 * 40 → 26, 몹 공격을 9.9 → 6.4로 낮추고 5층까지 계단식으로 원래 곡선에 붙인다(6층부터 1.0).
 * 보스는 대상이 아니다 — 1층 보스(347)는 그대로 "벽"으로 남는다.
 */
export const EARLY_EASE: readonly number[] = [1, .65, .72, .79, .86, .93];
/** 그 층의 입문 완화 배율(1~5층). 6층부터는 1이다. */
export function earlyEaseScale(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return depth < EARLY_EASE.length ? EARLY_EASE[depth] : 1;
}
/** 일반 몹 HP — 1~8층은 종전 곡선(입문 완화 포함), 9~20층은 ×0.75, 21층+는 `98.5 × (1 + 층/2)` 선형.
 *  보스는 1~8층 종전 그대로, 9층부터 일반 몹의 **13배**다(밸런스 v2 — 표준 장비 보스 4~5초 유지). */
export function enemyMaxHp(floor: number, boss: boolean): number {
  if (boss) {
    if (floor <= 8) return Math.round(earlyBossHp(floor));
    return Math.round(enemyMaxHp(floor, false) * BOSS_HP_RATIO);
  }
  if (floor <= 8) return Math.round(earlyEaseScale(floor) * Math.round(offlineMobHp(floor) + (deepMobHp(floor) - offlineMobHp(floor)) * Math.min(1, Math.max(0, (floor - HP_RAMP_FROM) / (HP_RAMP_BY - HP_RAMP_FROM)))));
  if (floor <= 20) {
    const ramp = Math.min(1, Math.max(0, (floor - HP_RAMP_FROM) / (HP_RAMP_BY - HP_RAMP_FROM)));
    return Math.max(220, Math.round(Math.round(offlineMobHp(floor) + (deepMobHp(floor) - offlineMobHp(floor)) * ramp) * MOB_HP_DEEP_SCALE));
  }
  return Math.round(DEEP_HP_PER_UNIT * (1 + floor / 2));
}
/** 정예 몹은 일반 몹 **30마리 처치마다 한 마리** 나온다(작업 206). 보스가 대기 중이면 그 스폰은 보스가 가져간다. */
export const ELITE_KILL_INTERVAL = 30;
/** 정예 몹의 체력·보상 배율 — 체력 2배, 금화·경험치 2배. 장비·스킬북 드롭률은 일반 몹과 **같다(1배)**. */
export const ELITE_HP_SCALE = 2;
/** 보상 배율의 정의는 `src/game/progress.ts` 한 곳에 있다(PR-3) — 기존 import 경로를 위해 여기서 재export한다. */
export { ELITE_REWARD_SCALE } from '../progress';
/** 정예 몹의 몸 크기 — 일반 몹보다 살짝 큰 1.22배(작업 206). */
export const ELITE_MOB_SCALE = 1.22;
/** 필드에 동시에 설 수 있는 몹 상한(작업 222, 사용자 요청 `#5827` "몹이 30마리 이상 생성되면 층 하락").
 *  상한에 닿아 30마리가 되면 **10초 유예** 뒤 한 층 내려간다(1층에는 내려갈 곳이 없어 상한만 지킨다).
 *  밸런스 v2의 목표 생존 수 젠(3/5/7) 아래에서는 좀처럼 닿지 않는 안전망이다. */
export const MOB_CAP = 30;
/** 30마리가 된 뒤 층을 내리기까지 버티는 시간(초) — 한 번의 몰림으로 층이 깎이지 않게. */
export const MOB_CAP_GRACE_SECONDS = 10;
/** 필드에 목표로 세워 두는 몹 수(밸런스 v2) — 1~5층 3, 6~15층 5, 16층+ 7. */
export function targetAliveCount(floor: number): number {
  return floor >= 16 ? 7 : floor >= 6 ? 5 : 3;
}
/** 한 번의 리필에 부르는 몹 수 — 9층부터 2마리(그 전 1마리). */
export function spawnsPerRefill(floor: number): number { return floor >= 9 ? 2 : 1; }
/** 리필 간격(초) — 1층 1.02초에서 층마다 0.03초씩 짧아져 20층 0.45초. 9~10층만 0.90초로 두어
 *  9층의 수입 급증(리필 1→2마리 전환)을 완만하게 만든다(밸런스 v2 권장안). 40층+ 0.30초. */
export function spawnRefillSeconds(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  if (depth === 9 || depth === 10) return .90;
  return Math.max(.30, 1.05 - depth * .03);
}
/** 그 층의 초당 젠 수 — 목표 생존 수를 채우는 속도(경제 시뮬레이션과 방치 정산이 함께 쓴다). */
export function fieldSpawnRate(floor: number): number { return spawnsPerRefill(floor) / spawnRefillSeconds(floor); }
/** 몹 한 마리의 **방어 전** 공격력 — 1~5층은 입문 완화(EARLY_EASE), 보스는 별도 곡선. */
export function enemyRawHit(floor: number, boss: boolean): number {
  const raw = boss ? 20 + floor * 5.5 + Math.pow(floor, 1.3) * 1.2 : 7 + floor * 2.4 + Math.pow(floor, 1.25) * .5;
  return boss ? raw : raw * earlyEaseScale(floor);
}
/** 방어력이 막아 주는 비율(밸런스 v2) — `def / (def + 50 × (1 + 층/2))`, 상한 62%.
 *  예전 `방어 × 0.2`를 빼던 식은 20층 표준 장비(방어 531)에서 피해를 1로 만들어 사실상 무적이었다. */
export const DAMAGE_REDUCTION_CAP = .62;
export function damageReduction(defense: number, floor: number): number {
  const value = Math.max(0, defense);
  return Math.min(DAMAGE_REDUCTION_CAP, value / (value + 50 * (1 + Math.max(0, floor) / 2)));
}
/** 군집 타격(밸런스 v2) — 2~3마리가 동시에 때리는 대신 한 대의 위력을 0.55로 낮춘다.
 *  11~15층 2마리, 16층+ 3마리(`swarmCount`). */
export const MOB_DAMAGE_SWARM_SCALE = .55;
/** 그 층에서 한 번의 피격 창(0.85초)에 동시에 때리는 몹 수 — 1 / 2 / 3. */
export function swarmCount(floor: number): number { return floor >= 16 ? 3 : floor >= 11 ? 2 : 1; }
/**
 * 적 한 대의 피해 — 방어 % 감소를 적용하고, 일반 몹은 군집 배율(×0.55)을 곱한다.
 *
 * `swarmed=false`는 군집 없이 한 마리만 때리는 자리(던전 — 한 번에 한 마리만 0.9초마다 때린다)가 쓴다.
 * 1~8층은 입문 완화가 `enemyRawHit`에 이미 들어 있어 종전보다 가볍다.
 */
export function enemyHitDamage(floor: number, boss: boolean, defense: number, swarmed = true): number {
  const raw = enemyRawHit(floor, boss) * (!boss && swarmed ? MOB_DAMAGE_SWARM_SCALE : 1);
  return Math.max(1, Math.round(raw * (1 - damageReduction(defense, floor))));
}
/** 광폭 버프(블러드 레이지·호크아이·아케인 실드)의 공격속도 배율(작업 216).
 *  +20%에서 시작해 스킬 레벨당 +1%, 상한 1.5배 — `heroMotion.costumePlaybackRate`가 같은 식을 쓴다. */
export function berserkSpeedScale(level: number): number { return Math.min(1.5, 1.2 + (Math.max(1, level) - 1) * .01); }
/** 같은 버프의 공격력 배율 — +20%에서 시작해 스킬 레벨당 +1.5%(상한 없음, Lv.30 1.635배). */
export function berserkAttackScale(level: number): number { return 1.2 + (Math.max(1, level) - 1) * .015; }
