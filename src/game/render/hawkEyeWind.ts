import { Graphics, type Container } from 'pixi.js';
import type { CombatEngine } from '../combat/engine';
import { jobOrDefault } from '../skills';

/**
 * 궁수 호크아이(`hawkEye`) — 궁수 몸 주변에 **살짝 휘감기는 미풍** — [작업 261]
 *
 * 확정 시안 1안("은은한 미풍")을 그대로 옮겼다:
 *  - 옅은 청록·민트 바람결 **두 줄**이 발목에서 어깨로 나선으로 감기며 천천히 올라간다.
 *  - 줄은 방위각의 `sin` 부호로 몸 앞/몸 뒤를 갈라 그린다. 몸 뒤쪽 줄은 몸에 가려 실루엣 밖으로만
 *    비치고, 몸 앞쪽 줄은 몸통 가운데를 지날 때 옅어져 "가로지르는 사선"이 아니라 "옆구리를 타는
 *    바람"으로 읽힌다. 얼굴 높이에서는 앞쪽 줄을 그리지 않는다(표정을 덮지 않는다).
 *  - 작은 바람 알갱이가 함께 떠오른다.
 *  - **몸에 빛무리(글로우)는 깔지 않는다** — 발동 중에도 궁수 몸은 빛나지 않고, 리본과 알갱이만 돈다.
 *  - 발밑에 눕는 마법진 링은 없다(전사 블러드 레이지와 같은 처리 — `field.ts`·`entities.ts`).
 *
 * 좌표는 화면 픽셀이고 `body`는 캐릭터 머리~발 높이다(`heroBodyFraction`). 발끝이 `(x, y)`이며
 * 위쪽이 음수다. 선 굵기는 `body`에 비례하되 게임 배율(몸높이 75px 안팎)에서 1.2~2.2px가 되게 잡았다.
 */

/** 바람 색 — 가산 합성에서 흰 쪽이 밝은 결, 청록이 바람의 결. */
export const WIND_COLORS = { bright: 0xdcf7ff, cool: 0x9ee8ff, deep: 0x7fd8f2 } as const;

/** 발동 직후 이 시간(초) 동안 바람이 감긴다. */
export const WIND_FADE_IN = .32;
/** 버프 종료 전 이 시간(초) 동안 바람이 옅어지며 풀린다. */
export const WIND_FADE_OUT = .8;
/** 리본 한 줄을 이루는 선분 수 — 많을수록 매끄럽고 무겁다. */
export const WIND_RIBBON_STEPS = 18;
/** 동시에 떠도는 바람 알갱이 수. */
export const WIND_MOTE_COUNT = 7;
/** 몸 앞쪽 줄을 그리지 않는 높이(`body` 배율) — 얼굴 위로는 뒤로 돌린다. */
export const WIND_FRONT_CUT = .70;

/** 리본 한 줄의 성격. 값은 모두 `body`(머리~발 높이) 배율 또는 라디안. */
export type WindRibbon = {
  /** 시작 방위각(rad). */
  phase: number;
  /** 위로 감기는 총 각도(rad). */
  twist: number;
  /** 초당 회전 속도(rad/s, 음수면 반대로 돈다). */
  speed: number;
  /** 올라가는 높이(`body` 배율). */
  reach: number;
  /** 밑동 높이(`body` 배율). */
  foot: number;
  /** 가운데에서 몸에서 떨어지는 거리(`body` 배율). */
  bulge: number;
  /** 밝기(0~1) — 가산이라 0.6을 넘기면 갑옷 위가 하얗게 뜬다. */
  alpha: number;
  /** 색(`WIND_COLORS`). */
  tint: number;
};

/**
 * 시안 1안의 두 줄 — 한 줄은 발목에서 어깨까지 크게 감기고,
 * 다른 줄은 허리에서 반대로 짧게 돈다. 두 줄이 같은 속도로 돌지 않아 살아 있어 보인다.
 */
export const windRibbons: readonly WindRibbon[] = [
  { phase: .35, twist: 7.0, speed: .55, reach: .62, foot: .20, bulge: .190, alpha: .80, tint: WIND_COLORS.bright },
  { phase: 3.15, twist: -5.6, speed: -.38, reach: .52, foot: .12, bulge: .160, alpha: .70, tint: WIND_COLORS.cool }
];

/** 그려야 할 선분 하나 — 순수 계산이라 테스트와 시안 렌더가 그대로 쓴다. */
export type WindSegment = {
  x1: number; y1: number; x2: number; y2: number;
  width: number; alpha: number;
  /** 몸 앞(`true`)인지 몸 뒤(`false`)인지. */
  front: boolean;
  tint: number;
};

/** 떠도는 바람 알갱이 하나. */
export type WindMote = { x: number; y: number; size: number; alpha: number; tint: number };

/** 바람의 세기(0~1) — 발동 직후 감기고, 버프가 끝나기 전에 풀린다. */
export function hawkEyeWindIntensity(berserk: number, castAge?: number): number {
  if (!(berserk > 0)) return 0;
  const out = Math.min(1, berserk / WIND_FADE_OUT);
  const inBy = castAge === undefined ? 1 : Math.min(1, Math.max(0, castAge) / WIND_FADE_IN);
  return Math.max(0, Math.min(1, out * inBy));
}

/** 게임 배율(몸높이 75px)에서 1.2~2.2px가 되는 선 굵기 배율. */
function strokeScale(body: number): number {
  return Math.max(.8, Math.min(2.4, body / 75));
}

/**
 * 리본 한 줄의 선분들. 위로 갈수록 몸에서 살짝 벌어졌다 다시 조여들고,
 * 앞/뒤는 방위각의 `sin` 부호로 갈라 몸을 감싸는 것처럼 보이게 한다.
 */
export function windRibbonSegments(ribbon: WindRibbon, time: number, intensity: number, body: number): WindSegment[] {
  const scale = strokeScale(body);
  const points: { x: number; y: number; front: boolean; u: number; angle: number }[] = [];
  for (let step = 0; step <= WIND_RIBBON_STEPS; step++) {
    const u = step / WIND_RIBBON_STEPS;
    const angle = ribbon.phase + u * ribbon.twist + time * ribbon.speed;
    const radius = body * (ribbon.bulge * (.55 + .45 * Math.sin(Math.PI * Math.min(1, u * 1.08))));
    points.push({
      x: Math.cos(angle) * radius,
      // 발끝에서 위로 감기며, 앞쪽(카메라 가까운 쪽)은 살짝 아래로 처진다.
      y: -body * (ribbon.foot + u * ribbon.reach) + Math.sin(angle) * body * .022,
      front: Math.sin(angle) > 0 && u < WIND_FRONT_CUT,
      u,
      angle
    });
  }
  const segments: WindSegment[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1];
    if (a.front !== b.front) continue; // 레이어를 넘는 선분은 그리지 않는다(몸통에서 끊긴다).
    const mid = (a.u + b.u) / 2;
    // 양 끝은 가늘고 옅어져 바람이 스며들듯 사라진다.
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, mid * 1.04 + .02)), .55);
    // 몸 앞을 가로지르는 대목(선이 몸통 가운데를 지난다)은 옅게 — 굵은 사선이 아니라
    // 몸 옆을 타고 흐르는 바람으로 읽히게 한다.
    const sideways = Math.pow(Math.abs(Math.cos((a.angle + b.angle) / 2)), 2.2);
    segments.push({
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      width: (1.1 + .9 * taper) * scale,
      alpha: intensity * ribbon.alpha * (.30 + .30 * taper) * (.28 + .72 * sideways) * (a.front ? 1 : .62),
      front: a.front,
      tint: ribbon.tint
    });
  }
  return segments;
}

/** 바람 알갱이 — 시간만으로 자리가 정해져(난수 없음) 프레임이 끊겨도 튀지 않는다. */
export function windMotes(time: number, intensity: number, body: number): WindMote[] {
  const motes: WindMote[] = [];
  for (let index = 0; index < WIND_MOTE_COUNT; index++) {
    const period = 1.6 + (index % 4) * .29;
    const t = ((time / period) + index * .37) % 1;
    const angle = index * 2.399 + time * (.8 + index * .06) + t * 2.2;
    const radius = body * (.15 + .09 * Math.sin(Math.PI * t)) * (index % 2 ? 1 : -1);
    const lift = .08 + t * (.52 + (index % 3) * .12);
    motes.push({
      x: Math.cos(angle) * radius,
      y: -body * lift + Math.sin(angle) * body * .018,
      size: Math.max(.7, body * .010 * (.75 + (index % 4) * .18)),
      alpha: intensity * .46 * Math.sin(Math.PI * t),
      tint: index % 3 === 0 ? WIND_COLORS.bright : WIND_COLORS.cool
    });
  }
  return motes;
}

/** 오라를 그리는 데 필요한 뷰의 두 레이어 — 둘 다 가산(`add`)이다(히어로 뒤/앞). */
export type HawkEyeWindView = { windBack: Container; windFront: Container };

type WindState = { back: Graphics; front: Graphics };

/**
 * 상태 캐시 키는 `view`(호출부가 프레임마다 새로 만드는 래퍼)가 아니라 `view.windBack`
 * (`render.ts`가 계속 들고 있는 레이어)이다. 래퍼로 캐시하면 매 프레임 `Graphics`를 새로 붙여
 * 그 오브젝트가 화면에 영원히 쌓였다 — 사용자 신고 "궁수한테 빛이 계속 따라다녀"([핫픽스]).
 */
const windStates = new WeakMap<Container, WindState>();

function windStateFor(view: HawkEyeWindView): WindState {
  const key = view.windBack;
  const existing = windStates.get(key);
  if (existing) return existing;
  const back = new Graphics();
  const front = new Graphics();
  back.blendMode = 'add';
  front.blendMode = 'add';
  view.windBack.addChild(back);
  view.windFront.addChild(front);
  const state: WindState = { back, front };
  windStates.set(key, state);
  return state;
}

/**
 * 호크아이 바람 오라를 그린다. `drawEntities`가 히어로를 그린 **직후** 호출한다.
 * 궁수가 아니면 아무것도 그리지 않는다(전사 블러드 레이지·마법사 아케인 실드는 그대로).
 */
export function drawHawkEyeWindAura(
  view: HawkEyeWindView, world: CombatEngine, x: number, y: number, time: number, _dt: number, body: number
): void {
  const state = windStateFor(view);
  state.back.clear();
  state.front.clear();
  const cast = world.effects.find(effect => effect.kind === 'hawk');
  const intensity = jobOrDefault(world.save.job) === 'archer' ? hawkEyeWindIntensity(world.player.berserk, cast?.age) : 0;
  // ① 옅은 바람 리본 두 줄 — 몸에 빛무리는 깔지 않는다(리본·알갱이만).
  for (const ribbon of windRibbons) {
    for (const segment of windRibbonSegments(ribbon, time, intensity, body)) {
      if (!(segment.alpha > 0)) continue;
      (segment.front ? state.front : state.back)
        .moveTo(x + segment.x1, y + segment.y1).lineTo(x + segment.x2, y + segment.y2)
        .stroke({ color: segment.tint, width: segment.width, alpha: Math.min(1, segment.alpha) });
    }
  }
  // ② 바람 알갱이.
  for (const mote of windMotes(time, intensity, body)) {
    if (!(mote.alpha > 0)) continue;
    state.front.circle(x + mote.x, y + mote.y, mote.size).fill({ color: mote.tint, alpha: mote.alpha });
  }
}
