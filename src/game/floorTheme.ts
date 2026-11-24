/**
 * 층 테마 단일 창구 — 1~20층 잿빛 황무지, 21~40층 「해골 군주의 성(흑요석 성채)」.
 *
 * 화면(`src/game/render*`)·진행 화면(`fieldProgress`)·테스트가 **같은 표**를 읽는다. 그래서 몹 이름·
 * 보스 이름·틴트·구역 조명·배경 경로가 한 곳에만 있고, 층이 바뀔 때 그림 파일을 갈아 끼우지 않는다.
 *
 * 설계(기획 `djrpg_floor_21_40_plan.md` v2 확정안):
 *  · 20층 = 1구간 = 1테마. 21~40층 전체가 성 하나이고 **배경은 1장**(월드보스 흑요석 투기장 재활용,
 *    신규 배경 0장)이다. 1~20층이 배경 1장 + 몹 1종 + 보스 1종으로 20층을 버틴 것과 같은 밀도다.
 *  · 성 안은 4개 구역(성문 21~25 / 회랑·예배당 26~30 / 지하 감옥·수문 31~35 / 왕좌 36~40)으로
 *    나누되 **배경은 그대로** 두고 ①상단 조명 틴트 ②안개 밀도 ③불씨 좌표·색만 바꾼다.
 *  · 21~39층 보스는 기존 `skeleton_boss` 시트의 틴트·배율 변형(신규 0장), 40층 최종 보스
 *    「해골 군주 아르케온」만 신규 그림이다.
 *
 * 이 파일은 순수 모듈이다 — pixi·DOM·다른 게임 모듈을 import하지 않으므로 서버·테스트가 그대로 쓴다.
 */

/** 성(흑요석 성채)이 시작하는 층 — 이 층부터 배경·몹·보스가 성 안이다. */
export const CASTLE_FIRST_FLOOR = 21;
/** 성의 마지막 층 — 지금은 게임 상한(`MAX_FLOOR`)과 같다. */
export const CASTLE_LAST_FLOOR = 40;

/** 필드 배경 1장 — 발카론 투기장으로 쓰던 흑요석 성을 그대로 재활용한다(신규 배경 0장). */
export const castleScene = { path: '/assets/world-boss/obsidian-arena-v1.png', width: 941, height: 1672 } as const;

export type FloorZoneId = 'gate' | 'chapel' | 'prison' | 'throne';

export type ZoneFire = { x: number; y: number; radius: number };

/** 성 안 한 구역 — 조명·안개·불씨만 다르고 배경·몹 계보는 같다. */
export type FloorZone = {
  id: FloorZoneId;
  lo: number;
  hi: number;
  /** 구역 이름 — 층 선택 창·메시지에 쓴다. */
  name: string;
  /** 상단 조명 틴트(가산 워시)와 그 세기. */
  sky: number;
  skyAlpha: number;
  /** 안개 색과 밀도(아래쪽 띠에 깔린다). */
  fog: number;
  fogAlpha: number;
  /** 불씨·재 파티클 색. */
  ember: number;
  /** 화면을 덮는 어둠(비네트) 색. */
  dark: number;
  /** 불빛·불씨 좌표(배경 이미지 기준 0~1). */
  fires: ZoneFire[];
  /** 그 구역의 정예 이름 — 일반 몹 확대 + 금빛 오라(기존 코드 동작)에 이름만 바꾼다. */
  eliteName: string;
};

/** 성 안 4개 구역 — 21층부터 5층씩. 좌표는 `castleScene` 비율이다. */
export const castleZones: readonly FloorZone[] = [
  {
    id: 'gate', lo: 21, hi: 25, name: '성문 안뜰',
    sky: 0x5f86b8, skyAlpha: .11, fog: 0x9fb7cc, fogAlpha: .07, ember: 0xffa447, dark: 0x0b111a,
    fires: [{ x: .14, y: .55, radius: 34 }, { x: .86, y: .55, radius: 34 }, { x: .5, y: .40, radius: 22 }],
    eliteName: '성문 파수꾼'
  },
  {
    id: 'chapel', lo: 26, hi: 30, name: '회랑·예배당',
    sky: 0xd8a256, skyAlpha: .10, fog: 0xc9b28a, fogAlpha: .05, ember: 0xffd08a, dark: 0x171009,
    fires: [{ x: .5, y: .44, radius: 30 }, { x: .24, y: .52, radius: 22 }, { x: .76, y: .52, radius: 22 }],
    eliteName: '사슬 인도자'
  },
  {
    id: 'prison', lo: 31, hi: 35, name: '지하 감옥·수문',
    sky: 0x4e9a94, skyAlpha: .14, fog: 0x7fb3ae, fogAlpha: .10, ember: 0x8fe6dc, dark: 0x06110f,
    fires: [{ x: .5, y: .66, radius: 40 }, { x: .18, y: .58, radius: 24 }, { x: .82, y: .58, radius: 24 }],
    eliteName: '사슬 인도자'
  },
  {
    id: 'throne', lo: 36, hi: 40, name: '왕좌',
    sky: 0xb23f34, skyAlpha: .13, fog: 0x8a4a44, fogAlpha: .06, ember: 0xff7a4a, dark: 0x140608,
    fires: [{ x: .16, y: .50, radius: 38 }, { x: .84, y: .50, radius: 38 }, { x: .5, y: .26, radius: 26 }],
    eliteName: '왕좌의 근위'
  }
] as const;

/** 이 층이 성 안인가 — 21층부터. */
export function isCastle(floor: number): boolean {
  const value = Number.isFinite(floor) ? Math.floor(floor) : 1;
  return value >= CASTLE_FIRST_FLOOR;
}

/** 이 층의 구역 — 황무지(1~20층)면 `undefined`. 범위를 벗어난 값은 가까운 끝으로 다듬는다. */
export function zoneOf(floor: number): FloorZone | undefined {
  const value = Number.isFinite(floor) ? Math.floor(floor) : 1;
  if (value < CASTLE_FIRST_FLOOR) return undefined;
  return castleZones.find(zone => value >= zone.lo && value <= zone.hi) ?? castleZones[castleZones.length - 1];
}

/** 일반 몹 그림 계보 — 성벽병은 기존 해골 재사용, 사슬 망자·흑요석 기사는 신규 시트다. */
export type MobKind = 'wallguard' | 'wretch' | 'knight';

export type MobArt = { idle: string; walk: string; name: string };

/**
 * 몹 그림·이름 표.
 *  · `wallguard` — 기존 `skeleton_warrior`/`walk8_skeleton` + 회청 틴트(신규 0장).
 *  · `wretch` — 신규 `castle/wretch_*` (사슬 망자: 창백 청록, 끊어진 사슬).
 *  · `knight` — 신규 `castle/knight_*` (흑요석 기사: 큰 판금 + 뿔 투구).
 */
export const mobArt: Record<MobKind, MobArt> = {
  wallguard: { idle: '/assets/skeleton_warrior.png', walk: '/assets/walk8_skeleton.png', name: '녹슨 성벽병' },
  wretch: { idle: '/assets/castle/wretch_idle_v1.png', walk: '/assets/castle/walk8_wretch_v1.png', name: '사슬 망자' },
  knight: { idle: '/assets/castle/knight_idle_v1.png', walk: '/assets/castle/walk8_knight_v1.png', name: '흑요석 기사' }
};

/** 몹 틴트 — 새 그림은 원색 그대로, 재사용 해골만 회청으로 물들인다. */
export const mobTint: Record<MobKind, number> = { wallguard: 0x9fb3c4, wretch: 0xffffff, knight: 0xffffff };

/**
 * 층별 일반 몹 구성(21~40층, 기획 표 그대로). 한 층에 2종이 섞이고 첫 번째가 주력이다.
 * 정예는 이 중 하나를 1.22배로 키워 금빛 오라를 두른다(신규 그림 0장).
 */
const castleRosters: readonly (readonly MobKind[])[] = [
  ['wretch', 'wallguard'], // 21
  ['wretch', 'wallguard'], // 22
  ['knight', 'wretch'],    // 23
  ['knight', 'wallguard'], // 24
  ['knight', 'wretch'],    // 25
  ['knight', 'wretch'],    // 26
  ['wretch', 'knight'],    // 27
  ['knight', 'wallguard'], // 28
  ['knight', 'wretch'],    // 29
  ['knight', 'wretch'],    // 30
  ['wretch', 'knight'],    // 31
  ['knight', 'wretch'],    // 32
  ['knight', 'wallguard'], // 33
  ['wretch', 'knight'],    // 34
  ['knight', 'wretch'],    // 35
  ['knight', 'wallguard'], // 36
  ['knight', 'wretch'],    // 37
  ['knight', 'wallguard'], // 38
  ['knight', 'wretch'],    // 39
  ['knight', 'wretch']     // 40
] as const;

/** 그 층에 서는 몹 계보 — 황무지(1~20층)는 해골 병사 하나다. */
export function mobRoster(floor: number): readonly MobKind[] {
  const value = Number.isFinite(floor) ? Math.floor(floor) : 1;
  const index = value - CASTLE_FIRST_FLOOR;
  if (index < 0) return ['wallguard'];
  return castleRosters[Math.min(castleRosters.length - 1, index)];
}

/** 스폰마다 도는 몹 계보 — `seed`는 이미 뽑힌 난수(0~1)라 새 난수를 쓰지 않는다. */
export function mobKindFor(floor: number, seed: number): MobKind {
  const roster = mobRoster(floor);
  const unit = Number.isFinite(seed) ? Math.abs(seed) % 1 : 0;
  return roster[Math.min(roster.length - 1, Math.floor(unit * roster.length))];
}

/** 보스 그림 계보 — 수문장(틴트)·그림자(틴트+배율)·아르케온(신규 시트). */
export type BossArt = { idle: string; walk: string; name: string; tint: number; scale: number };

/** 그 층 보스의 이름·그림·틴트·배율. */
export function bossArtFor(floor: number): BossArt {
  const value = Number.isFinite(floor) ? Math.floor(floor) : 1;
  if (value >= CASTLE_LAST_FLOOR) {
    return { idle: '/assets/castle/archon_idle_v1.png', walk: '/assets/castle/walk8_archon_v1.png', name: '해골 군주 아르케온', tint: 0xffffff, scale: 1 };
  }
  if (value >= 30) {
    // 30층 중간 보스부터 39층까지는 같은 시트를 키워 '군주의 그림자'로 쓴다(신규 0장).
    const scale = Math.round((1.12 + Math.min(8, value - 30) * .01) * 100) / 100;
    return { idle: '/assets/skeleton_boss.png', walk: '/assets/walk8_boss.png', name: '군주의 그림자', tint: 0x6f5a8c, scale };
  }
  if (value >= CASTLE_FIRST_FLOOR) {
    return { idle: '/assets/skeleton_boss.png', walk: '/assets/walk8_boss.png', name: '성채의 수문장', tint: 0x8ea4b8, scale: 1 };
  }
  return { idle: '/assets/skeleton_boss.png', walk: '/assets/walk8_boss.png', name: '해골 군주', tint: 0xcfcac5, scale: 1 };
}

/** 그 층 보스 이름 — 메시지·이름표가 같은 값을 말한다. */
export function bossName(floor: number): string { return bossArtFor(floor).name; }

/** 일반 몹 대표 이름 — 그 층 주력 몹이다. */
export function mobName(floor: number): string { return mobArt[mobRoster(floor)[0]].name; }

/** 정예 이름 — 성 안은 구역마다 다르고, 황무지는 종전대로 `정예 해골`이다. */
export function eliteName(floor: number): string {
  const zone = zoneOf(floor);
  return zone ? zone.eliteName : '정예 해골';
}

/** `이/가`, `은/는` 같은 조사 — 받침 여부로 고른다(메시지가 몹·보스 이름을 쓰기 때문에 필요). */
export function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}

/** 화면에 한 줄로 띄우는 테마 이름 — 로비·층 선택 창이 쓴다. */
export function realmName(floor: number): string {
  return isCastle(floor) ? '해골 군주의 성' : '잿빛 황무지';
}
