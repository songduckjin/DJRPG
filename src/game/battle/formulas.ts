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
/** 치명타(작업 245) — 장비 추가옵션 `치명타 확률`·패시브를 합산한 스탯 `crit`이 곧 발동 확률(%)이다.
 *  배수는 1.8배, 확률 상한은 80%(넘는 값은 80%로 자른다). */
export const CRIT_CHANCE_CAP = 80;
export const CRIT_DAMAGE_SCALE = 1.8;
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
const HP_RAMP_FROM = 8, HP_RAMP_BY = 25;
/** The boss weight the game had before 작업 198 (floor 78: ~41,700, 2.7x a normal mob): a geared
 *  player deleted a boss in one combo, which made its 2.2% drop feel handed out. */
export function earlyBossHp(floor: number): number { return 220 + floor * 95 + Math.pow(floor, 1.6) * 32; }
/** A boss stands at six normal mobs of its floor, so 78층 lands at ~329,000. (작업 198) */
const BOSS_HP_RATIO = 6;
/** Health of a mob on a floor: the early curve and the deep one blended over `HP_RAMP_FROM`~`BY`, and
 *  a boss blended the same way from its old weight into six times its mob — 1~8층 보스는 그대로다. */
export function enemyMaxHp(floor: number, boss: boolean): number {
  const ramp = Math.min(1, Math.max(0, (floor - HP_RAMP_FROM) / (HP_RAMP_BY - HP_RAMP_FROM)));
  if (boss) return Math.round(earlyBossHp(floor) + (deepMobHp(floor) * BOSS_HP_RATIO - earlyBossHp(floor)) * ramp);
  return Math.round(offlineMobHp(floor) + (deepMobHp(floor) - offlineMobHp(floor)) * ramp);
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
 *  상한에 닿아 30마리가 되면 더 싸우지 않고 한 층 내려간다(1층에는 내려갈 곳이 없어 상한만 지킨다). */
export const MOB_CAP = 30;
export function enemyHitDamage(floor: number, boss: boolean, defense: number): number { return Math.max(1, Math.round(boss ? 20 + floor * 5.5 + Math.pow(floor, 1.3) * 1.2 : 7 + floor * 2.4 + Math.pow(floor, 1.25) * .5) - defense * .2); }
/** 광폭 버프(블러드 레이지·호크아이·아케인 실드)의 공격속도 배율(작업 216).
 *  +20%에서 시작해 스킬 레벨당 +1%, 상한 1.5배 — `heroMotion.costumePlaybackRate`가 같은 식을 쓴다. */
export function berserkSpeedScale(level: number): number { return Math.min(1.5, 1.2 + (Math.max(1, level) - 1) * .01); }
/** 같은 버프의 공격력 배율 — +20%에서 시작해 스킬 레벨당 +1.5%(상한 없음, Lv.30 1.635배). */
export function berserkAttackScale(level: number): number { return 1.2 + (Math.max(1, level) - 1) * .015; }
