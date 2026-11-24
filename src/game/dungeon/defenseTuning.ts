/**
 * 무한 방어전 v2 밸런스 표 (2026-11-24 확정).
 *
 * `defenseBattle.ts`가 쓰는 수치를 한 파일에 모은다 — 밸런스 PR은 이 표와 근거 테스트만 보면 된다.
 * 값은 `downloads/djrpg_defense_dungeon/wave_balance_proposal_v2.md` §8 구현 상수 표와 같고,
 * 같은 표로 돌린 시뮬레이션(`sim_v2/`)이 Lv.20 전투력 ~2,000 세 직업 30~35웨이브를 확인했다.
 *
 * v2의 핵심: **방어선(성벽) 규칙을 없앴다.** 적이 스폰 뒤 캐릭터에게 직접 다가와 60에서 서고,
 * 25%는 사수형(사거리 215)·20%는 돌진형(3초 2.1배속)이다. 난이도는 적 1타 위력(필드 1타의 90%)으로 만든다.
 */
export const DEFENSE_TUNING = {
  /** 보스 웨이브 주기 — 5웨이브마다. */
  bossEvery: 5,
  /** 보스 웨이브의 호위 수 — 보스 1 + 호위 6 = 7마리. */
  bossEscorts: 6,
  /** 웨이브당 몹 수 곡선 — 1웨이브 8 → 10웨이브 14 → 30웨이브 18, 이후 5웨이브마다 +1, 상한 24. */
  mobsEarly: 8,
  mobsMid: 14,
  mobsLate: 18,
  mobsMax: 24,
  mobRamp1: 10,
  mobRamp2: 30,
  /** 스폰 간격(초) — 1.30초에서 웨이브마다 0.02초씩 줄고 0.55초에서 멈춘다. */
  spawnStart: 1.3,
  spawnStep: .02,
  spawnMin: .55,
  /** 적 스폰 자리(화면 위 바깥, v). */
  spawnV: -940,
  /** 적 추격 속도(월드 단위/초) — 110에서 웨이브마다 +1.2, 상한 190(캐릭터 125보다 빠르다). */
  chaseStart: 110,
  chaseStep: 1.2,
  chaseMax: 190,
  /** 돌진형 — 스폰 뒤 3초 동안 2.1배속으로 좁힌다. */
  chargerPct: 20,
  chargerSpeedScale: 2.1,
  chargerSeconds: 3,
  /** 사수형 — 215에서 쏘고(접근 중에도) 1타 위력 ×0.8. 궁수 견제의 핵심 부품이다. */
  rangedPct: 25,
  rangedAttackRange: 215,
  rangedDmgScale: .8,
  /** 적 타격 창(초)과 한 타격 창에 함께 때리는 마릿수 — 던전과 같은 결로 한 마리씩. */
  strikeInterval: .9,
  maxStrikers: 1,
  /** 적 기준 층 — `2 + 0.55 × (웨이브-1)`, 상한 60(필드 120층 상당). */
  enemyFloorStart: 2,
  enemyFloorStep: .55,
  enemyFloorCap: 60,
  /** 몹 체력 배율 — 필드 곡선(`enemyMaxHp`)을 그대로 쓰되 여기서 한 번 더 조절한다. */
  hpScale: 1,
  /** 적 1타 위력 — 필드 1타의 90%. 방어선이 없어 항상 붙어 있으므로 위력으로 난이도를 만든다. */
  dmgScale: .9,
  /** 1~3웨이브 입문 완화 — 신규 캐릭터가 3~4웨이브(50~60초)는 보게 한다. */
  earlyDmgScale: .55,
  earlyWaves: 3,
  /** 정예 웨이브 주기 — 3의 배수 웨이브(보스 웨이브 제외) 마지막 1마리가 체력 ×2·피해 ×2. */
  eliteEvery: 3,
  /** 동시 생존 상한 — 실측 최대 11마리라 넉넉한 안전장치다. */
  maxAlive: 24,
  /** 웨이브를 막았을 때 회복하는 최대 체력 비율(%) — 다음 웨이브로 넘어가기 전에 한 번. */
  healClearPct: 15,
  /** 보상 기준 층 — 1웨이브부터 1.5웨이브마다 1층, 20층에서 포화(30웨이브). */
  rewardStart: 1,
  rewardWavesPerFloor: 1.5,
  rewardCap: 20,
  /** 근접 몹이 캐릭터를 때릴 수 있는 거리 — 전사 평타 사거리와 같다. */
  enemyAttackRange: 90,
  /** 적끼리 최소 간격 — 한 점에 겹치지 않게 밀어낸다(결정적, 목록 순서 고정). */
  separation: 24
} as const;

/** 사수형 투사체 연출 값 — 전투 판정에는 쓰지 않는다(화면 가독성만). */
export const DEFENSE_RANGED_FX = {
  /** 투사체 속도(월드 단위/초). */
  projectileSpeed: 520,
  /** 발사 전 조준 예고(초). */
  telegraphSeconds: .25
} as const;
