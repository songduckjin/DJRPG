/**
 * 층 테마 단일 창구 — 1~20층 잿빛 황무지, 21~40층 「핏빛 성채」.
 *
 * 화면(`src/game/render*`)·진행 화면(`fieldProgress`)·테스트가 **같은 표**를 읽는다. 그래서 몹 이름·
 * 보스 이름·틴트·구역 조명·배경 경로가 한 곳에만 있고, 층이 바뀔 때 그림 파일을 갈아 끼우지 않는다.
 *
 * 설계(2026-11-25 확정 로스터 개편):
 *  · 1~20층 잿빛 황무지 — 일반 2종 랜덤(해골 병사 · 뼈 창병), 전용 정예 1종(뼈 거한), 보스 해골 군주.
 *  · 21~40층 핏빛 성채 — 배경 1장(핏빛 성채 전당 B안), 일반 2종 랜덤(흑요석 기사 · 핏빛 교단 사제),
 *    전용 정예 1종(성채 처형자), 보스는 21~40층 전부 「성채 패왕」 한 종.
 *  · 성 안은 4개 구역(성문 21~25 / 회랑·예배당 26~30 / 지하 감옥·수문 31~35 / 왕좌 36~40)으로
 *    나누되 **배경은 그대로** 두고 ①상단 조명 틴트 ②안개 밀도 ③불씨 좌표·색만 바꾼다.
 *
 * 이 파일은 순수 모듈이다 — pixi·DOM·다른 게임 모듈을 import하지 않으므로 서버·테스트가 그대로 쓴다.
 */

/** 성(핏빛 성채)이 시작하는 층 — 이 층부터 배경·몹·보스가 성 안이다. */
export const CASTLE_FIRST_FLOOR = 21;
/** 성의 마지막 층 — 지금은 게임 상한(`MAX_FLOOR`)과 같다. */
export const CASTLE_LAST_FLOOR = 40;

/**
 * 21~40층 필드 배경 1장 — 신규 「핏빛 성채 전당」 B안.
 * 1~20층 배경(`wasteland-scene.png`)과 같은 규격(964×1632 PNG)으로 변환해 넣었다.
 */
export const castleScene = { path: '/assets/castle/hall-b-bright-v1.png', width: 964, height: 1632 } as const;

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
};

/** 성 안 4개 구역 — 21층부터 5층씩. 좌표는 `castleScene` 비율이다. */
export const castleZones: readonly FloorZone[] = [
  {
    id: 'gate', lo: 21, hi: 25, name: '성문 안뜰',
    sky: 0x5f86b8, skyAlpha: .10, fog: 0x9fb7cc, fogAlpha: .06, ember: 0xffa447, dark: 0x0b111a,
    fires: [{ x: .14, y: .55, radius: 34 }, { x: .86, y: .55, radius: 34 }, { x: .5, y: .40, radius: 22 }]
  },
  {
    id: 'chapel', lo: 26, hi: 30, name: '회랑·예배당',
    sky: 0xd8a256, skyAlpha: .09, fog: 0xc9b28a, fogAlpha: .04, ember: 0xffd08a, dark: 0x171009,
    fires: [{ x: .5, y: .44, radius: 30 }, { x: .24, y: .52, radius: 22 }, { x: .76, y: .52, radius: 22 }]
  },
  {
    id: 'prison', lo: 31, hi: 35, name: '지하 감옥·수문',
    sky: 0x4e9a94, skyAlpha: .12, fog: 0x7fb3ae, fogAlpha: .08, ember: 0x8fe6dc, dark: 0x06110f,
    fires: [{ x: .5, y: .66, radius: 40 }, { x: .18, y: .58, radius: 24 }, { x: .82, y: .58, radius: 24 }]
  },
  {
    id: 'throne', lo: 36, hi: 40, name: '왕좌',
    sky: 0xb23f34, skyAlpha: .11, fog: 0x8a4a44, fogAlpha: .05, ember: 0xff7a4a, dark: 0x140608,
    fires: [{ x: .16, y: .50, radius: 38 }, { x: .84, y: .50, radius: 38 }, { x: .5, y: .26, radius: 26 }]
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

/** 일반 몹 그림 계보 — 테마마다 2종이 랜덤으로 선다. */
export type MobKind = 'skeleton' | 'bonelancer' | 'knight' | 'priest';
/** 전용 정예 계보 — 테마마다 1종(일반 몹을 키우지 않고 전용 그림을 쓴다). */
export type EliteKind = 'bonebrute' | 'executioner';

export type MobArt = { idle: string; walk: string; name: string };

/**
 * 몹 그림·이름 표.
 *  · `skeleton` — 기존 `skeleton_warrior`/`walk8_skeleton`(해골 병사, 1~20층 주력).
 *  · `bonelancer` — 신규 `castle/bonelancer_*` (뼈 창병: 낡은 두건 + 뼈 낫창).
 *  · `knight` — 신규 `castle/knight_*` (흑요석 기사: 큰 판금 + 뿔 투구).
 *  · `priest` — 신규 `castle/priest_*` (핏빛 교단 사제: 진홍 로브 + 해골 가면 + 등불 지팡이).
 */
export const mobArt: Record<MobKind, MobArt> = {
  skeleton: { idle: '/assets/skeleton_warrior.png', walk: '/assets/walk8_skeleton.png', name: '해골 병사' },
  bonelancer: { idle: '/assets/castle/bonelancer_idle_v1.png', walk: '/assets/castle/walk8_bonelancer_v1.png', name: '뼈 창병' },
  knight: { idle: '/assets/castle/knight_idle_v1.png', walk: '/assets/castle/walk8_knight_v1.png', name: '흑요석 기사' },
  priest: { idle: '/assets/castle/priest_idle_v1.png', walk: '/assets/castle/walk8_priest_v1.png', name: '핏빛 교단 사제' }
};

/** 정예 그림·이름 표 — 일반 몹 확대가 아니라 전용 그림을 1.22배로 키워 금빛 오라를 두른다. */
export const eliteArt: Record<EliteKind, MobArt> = {
  bonebrute: { idle: '/assets/castle/bonebrute_idle_v1.png', walk: '/assets/castle/walk8_bonebrute_v1.png', name: '뼈 거한' },
  executioner: { idle: '/assets/castle/executioner_idle_v1.png', walk: '/assets/castle/walk8_executioner_v1.png', name: '성채 처형자' }
};

/** 몹 틴트 — 새 그림은 원색 그대로, 기존 해골만 종전의 뼈색으로 살짝 물들인다. */
export const mobTint: Record<MobKind, number> = { skeleton: 0xcfcac5, bonelancer: 0xffffff, knight: 0xffffff, priest: 0xffffff };

/**
 * 층별 일반 몹 구성 — 테마마다 2종이 반반으로 선다(스폰 난수 `variant`로 고른다).
 * 1~20층 해골 병사·뼈 창병 / 21~40층 흑요석 기사·핏빛 교단 사제.
 */
const wastelandRoster: readonly MobKind[] = ['skeleton', 'bonelancer'];
const castleRoster: readonly MobKind[] = ['knight', 'priest'];

/** 그 층에 서는 몹 계보 — 테마의 2종. */
export function mobRoster(floor: number): readonly MobKind[] {
  return isCastle(floor) ? castleRoster : wastelandRoster;
}

/** 스폰마다 도는 몹 계보 — `seed`는 이미 뽑힌 난수(0~1)라 새 난수를 쓰지 않는다. */
export function mobKindFor(floor: number, seed: number): MobKind {
  const roster = mobRoster(floor);
  const unit = Number.isFinite(seed) ? Math.abs(seed) % 1 : 0;
  return roster[Math.min(roster.length - 1, Math.floor(unit * roster.length))];
}

/** 그 층 전용 정예 계보 — 황무지는 뼈 거한, 성 안은 성채 처형자. */
export function eliteKindFor(floor: number): EliteKind {
  return isCastle(floor) ? 'executioner' : 'bonebrute';
}

/** 그 층 정예의 그림·이름. */
export function eliteArtFor(floor: number): MobArt {
  return eliteArt[eliteKindFor(floor)];
}

/** 보스 그림 계보 — 1~20층은 기존 해골 보스, 21~40층 전체는 성채 패왕(신규 시트). */
export type BossArt = { idle: string; walk: string; name: string; tint: number; scale: number };

/** 그 층 보스의 이름·그림·틴트·배율. */
export function bossArtFor(floor: number): BossArt {
  const value = Number.isFinite(floor) ? Math.floor(floor) : 1;
  if (value >= CASTLE_FIRST_FLOOR) {
    // 21~40층 보스는 전부 「성채 패왕」 한 종이다(층별 틴트·배율 변형 없음).
    return { idle: '/assets/castle/warlord_idle_v1.png', walk: '/assets/castle/walk8_warlord_v1.png', name: '성채 패왕', tint: 0xffffff, scale: 1 };
  }
  return { idle: '/assets/skeleton_boss.png', walk: '/assets/walk8_boss.png', name: '해골 군주', tint: 0xcfcac5, scale: 1 };
}

/** 그 층 보스 이름 — 메시지·이름표가 같은 값을 말한다. */
export function bossName(floor: number): string { return bossArtFor(floor).name; }

/** 일반 몹 대표 이름 — 그 층 주력 몹이다. */
export function mobName(floor: number): string { return mobArt[mobRoster(floor)[0]].name; }

/** 정예 이름 — 테마 전용 정예의 이름(황무지 뼈 거한 / 성 안 성채 처형자). */
export function eliteName(floor: number): string { return eliteArtFor(floor).name; }

/** `이/가`, `은/는` 같은 조사 — 받침 여부로 고른다(메시지가 몹·보스 이름을 쓰기 때문에 필요). */
export function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}

/** 화면에 한 줄로 띄우는 테마 이름 — 로비·층 선택 창이 쓴다. */
export function realmName(floor: number): string {
  return isCastle(floor) ? '핏빛 성채' : '잿빛 황무지';
}
