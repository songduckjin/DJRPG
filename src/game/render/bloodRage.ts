import { Graphics, Sprite, type Container, type Texture } from 'pixi.js';
import type { CombatEngine } from '../combat/engine';
import { jobOrDefault } from '../skills';

/**
 * 블러드 레이지(`warcry`) 붉은 투기 오라 — [작업 214]
 *
 * 확정 시안(`downloads/skill_blood_rage/opt_b.png`)은 발밑에 눕는 타원 링이 아니라
 * **몸 윤곽과 대검을 따라 진홍~주황 불꽃이 위로 일렁이고 불티가 튀는** 모습이다.
 * 예전의 마법진 스프라이트(발밑 타원)와 버프 유지 중의 지면 링을 없애고,
 * ① 몸 뒤쪽 붉은 광휘(`rageBack`) ② 몸 앞쪽 불꽃 혀(`rageFront`) 두 겹으로 그린다.
 *
 * 두 레이어 모두 가산(`add`)이고, 광휘·불꽃은 한 장짜리 텍스처를 늘려 쓴다
 * (`public/assets/fx_rage_glow_v1.png`·`fx_rage_flame_v1.png`, `scripts/build-rage-*.py`).
 * 도형 채우기(`Graphics.ellipse`)는 가장자리가 딱 잘려 '붉은 원판'처럼 보이므로 광휘에는 쓰지 않는다.
 * 덕분에 갑옷·얼굴 디테일을 덮지 않고 달아오르게 하면서, 실루엣 가장자리가 부드럽다.
 *
 * 좌표는 모두 **화면 픽셀**이고 `body`는 캐릭터의 머리~발 높이다(`heroBodyFraction`).
 * 발끝이 `(x, y)`이고 위쪽이 음수라, 아래 비율 값은 모두 `body` 기준이다.
 */

/** 몸통·대검을 따라 세운 불꽃 혀 하나. 값은 모두 `body`(머리~발 높이) 배율이다. */
export type RageFlame = {
  /** 발끝 중심에서 좌우로 떨어진 거리(음수 = 왼쪽). */
  x: number;
  /** 불꽃 밑동 높이(발끝 = 0). */
  base: number;
  /** 불꽃 길이. */
  height: number;
  /** 밑동 폭(텍스처 가로 배율). */
  width: number;
  /** 일렁임 위상 — 이웃한 혀가 같이 흔들리지 않게 서로 다른 값을 준다. */
  phase: number;
  /** 위로 갈수록 기우는 방향비(얼굴 쪽은 바깥으로 비켜 세운다). */
  drift: number;
  /** 속불이 밝은 혀인지(주황색이 더 뜨겁다). */
  core: boolean;
};

/**
 * 확정 시안의 불꽃 배치 — 얼굴 정면은 비우고 어깨·옆구리·다리·대검 쪽에 세운다.
 * 시안은 몸 전체를 감싸지만, 게임에서는 스프라이트가 작아 얼굴을 덮으면 표정이 사라지므로
 * 정면은 뒤쪽 광휘로만 처리한다.
 */
export const rageFlames: readonly RageFlame[] = [
  // 몸통 좌우 윤곽을 따라 타는 얇고 긴 혀(실루엣 테두리 역할)
  { x: -.145, base: .02, height: .94, width: .034, phase: .40, drift: -.07, core: true },
  { x: .145, base: .02, height: .94, width: .034, phase: 3.35, drift: .07, core: true },
  // 왼쪽 어깨 뒤에서 가장 크게 타오르는 혀
  { x: -.30, base: .40, height: .86, width: .150, phase: .15, drift: -.20, core: true },
  // 왼쪽 옆구리(짧은 혀)
  { x: -.225, base: .52, height: .52, width: .095, phase: .85, drift: -.12, core: false },
  // 왼쪽 허리~가슴
  { x: -.19, base: .24, height: .66, width: .105, phase: 1.45, drift: -.07, core: true },
  // 왼쪽 다리
  { x: -.15, base: .02, height: .40, width: .080, phase: 2.10, drift: -.04, core: false },
  // 왼쪽 바깥 잔불
  { x: -.375, base: .16, height: .50, width: .080, phase: 2.60, drift: -.14, core: false },
  // 오른쪽 어깨 뒤
  { x: .30, base: .38, height: .82, width: .145, phase: 2.95, drift: .18, core: true },
  // 오른쪽 옆구리
  { x: .225, base: .50, height: .50, width: .090, phase: 3.60, drift: .10, core: false },
  // 오른쪽 허리~가슴
  { x: .19, base: .22, height: .64, width: .100, phase: 4.15, drift: .06, core: true },
  // 오른쪽 다리
  { x: .15, base: .02, height: .38, width: .075, phase: 4.75, drift: .03, core: false },
  // 머리 양옆(얼굴을 비켜 세운 짧은 혀)
  { x: -.185, base: .70, height: .40, width: .058, phase: 5.25, drift: -.26, core: false },
  { x: .185, base: .70, height: .38, width: .056, phase: .55, drift: .26, core: false },
  // 대검 쪽 — 칼자루 아래로 길게 일렁이는 불길
  { x: .36, base: .14, height: .70, width: .115, phase: 1.75, drift: .16, core: true },
  { x: .44, base: .32, height: .42, width: .070, phase: 5.85, drift: .18, core: false },
  // 발치 가운데(낮게 깔리는 잔불)
  { x: -.06, base: .05, height: .30, width: .060, phase: 3.30, drift: .00, core: false }
];

/** 발동 순간 위로 치솟는 불기둥 — 얼굴 정면을 비켜 몸 양옆에서 솟고, 가운데는 낮다. */
export const rageSurges = [
  { x: -.21, height: 1.18, width: .28, phase: 0 },
  { x: .21, height: 1.12, width: .27, phase: 1.7 },
  { x: .02, height: .70, width: .18, phase: 3.1 }
] as const;

/** 몸 뒤 광휘 — 가장자리로 스러지는 방사형 텍스처를 늘려 쓴다. */
export const rageGlows = [
  { x: 0, y: .54, rx: .50, ry: .52, alpha: .55, color: 0x8e1610 },
  { x: 0, y: .34, rx: .34, ry: .38, alpha: .40, color: 0xb0200e },
  { x: 0, y: .10, rx: .34, ry: .18, alpha: .45, color: 0x7a1008 },
  { x: .30, y: .26, rx: .20, ry: .26, alpha: .35, color: 0xc22a10 }
] as const;

/** 초당 불티 수(버프 유지 중). */
export const RAGE_EMBER_RATE = 30;
/** 버프가 켜진 순간의 불티 폭발량(초당). */
export const RAGE_EMBER_BURST_RATE = 260;
/** 화면에 동시에 남는 불티 상한 — 저사양에서도 프레임이 떨어지지 않게. */
export const RAGE_EMBER_LIMIT = 64;
/** 버프 종료 전 이 시간(초) 동안 오라가 옅어지며 사라진다. */
export const RAGE_FADE_OUT = .7;
/** 발동 직후 이 시간(초) 동안 불꽃이 피어오른다. */
export const RAGE_FADE_IN = .22;

export type RageEmber = {
  x: number; y: number; vx: number; vy: number;
  age: number; duration: number; size: number; hot: boolean;
};

/** 그려야 할 불꽃 혀 하나의 자세 — 순수 계산이라 테스트가 그대로 확인한다. */
export type RageFlamePose = { x: number; y: number; width: number; height: number; rotation: number; alpha: number; tint: number };

/** 오라를 그리는 데 필요한 뷰의 레이어 — 둘 다 가산(`add`) 블렌딩이다. */
export type RageAuraView = { rageBack: Container; rageFront: Container };

type RageState = { embers: RageEmber[]; budget: number; glows: Sprite[]; flash: Sprite; flames: Sprite[]; surges: Sprite[]; overlay: Graphics };

const rageStates = new WeakMap<object, RageState>();

/** 불꽃 혀 색 — 진한 혀와 뜨거운 혀를 섞어 같은 그림으로도 색 폭을 만든다. */
const flameTints = [0xffffff, 0xffd2a8, 0xff9a68, 0xffe8c8];

function sprite(texture: Texture, tint = 0xffffff): Sprite {
  const created = new Sprite(texture);
  created.anchor.set(.5, 1);
  created.blendMode = 'add';
  created.tint = tint;
  created.alpha = 0;
  created.visible = false;
  return created;
}

/**
 * 뷰별 상태(광휘·불꽃·불티)를 만든다. 뷰가 사라지면 함께 수거된다.
 * `flameTexture`·`glowTexture`는 불꽃 혀와 방사형 광휘 한 장씩이다.
 */
export function rageStateFor(view: RageAuraView, flameTexture: Texture, glowTexture: Texture): RageState {
  const existing = rageStates.get(view);
  if (existing) return existing;
  const glows = rageGlows.map(glow => {
    const created = sprite(glowTexture, glow.color);
    created.anchor.set(.5);
    view.rageBack.addChild(created);
    return created;
  });
  const flash = sprite(glowTexture, 0xe03a12);
  flash.anchor.set(.5);
  view.rageBack.addChild(flash);
  const flames = rageFlames.map((_flame, index) => {
    const created = sprite(flameTexture, flameTints[index % flameTints.length]);
    view.rageFront.addChild(created);
    return created;
  });
  const surges = rageSurges.map(() => {
    const created = sprite(flameTexture);
    view.rageFront.addChild(created);
    return created;
  });
  // 불티는 불꽃 위에 얹는다(마지막 자식).
  const overlay = new Graphics();
  overlay.blendMode = 'add';
  view.rageFront.addChild(overlay);
  const state: RageState = { embers: [], budget: 0, glows, flash, flames, surges, overlay };
  rageStates.set(view, state);
  return state;
}

/**
 * 오라의 세기(0~1). 발동 직후 `RAGE_FADE_IN` 동안 피어오르고,
 * 버프가 끝나기 `RAGE_FADE_OUT` 전부터 옅어져 사라진다.
 * `castAge`는 방금 터진 `warcry` 이펙트의 나이(초)이고, 없으면 지속 중으로 본다.
 */
export function rageIntensity(berserk: number, castAge?: number): number {
  if (!(berserk > 0)) return 0;
  const out = Math.min(1, berserk / RAGE_FADE_OUT);
  const inBy = castAge === undefined ? 1 : Math.min(1, Math.max(0, castAge) / RAGE_FADE_IN);
  return Math.max(0, Math.min(1, out * inBy));
}

/** 불꽃 혀 하나의 자세 — 위로 갈수록 좁아지고 바람에 흔들리며, 세기가 약하면 짧아진다. */
export function rageFlamePose(flame: RageFlame, time: number, intensity: number, body: number): RageFlamePose {
  const flick = .78 + .14 * Math.sin(time * 9.3 + flame.phase * 3.1) + .08 * Math.sin(time * 21.7 + flame.phase);
  const height = flame.height * body * (.74 + .26 * flick) * (.5 + .5 * intensity);
  const width = flame.width * body * (.86 + .22 * flick);
  const sway = Math.sin(time * 5.2 + flame.phase) * body * .022 + flame.drift * body * .10 * (height / body);
  return {
    x: flame.x * body + sway,
    y: -flame.base * body,
    width,
    height,
    rotation: sway / Math.max(1, height) * .55,
    alpha: (flame.core ? .84 : .58) * intensity * (.82 + .18 * flick),
    tint: flameTints[Math.abs(Math.round(flame.phase * 10)) % flameTints.length]
  };
}

/** 발동 순간 불기둥의 자세 — 위로 솟을수록 좁아지고, `surge`가 줄면 짧아진다. */
export function rageSurgePose(flame: typeof rageSurges[number], time: number, surge: number, body: number): RageFlamePose {
  const grow = .62 + .38 * surge;
  const flick = .85 + .15 * Math.sin(time * 13 + flame.phase);
  return {
    x: flame.x * body,
    y: 0,
    width: flame.width * body * (.8 + .25 * (1 - surge)),
    height: flame.height * body * grow * flick,
    rotation: Math.sin(time * 8 + flame.phase) * .06,
    alpha: Math.min(1, .9 * surge),
    tint: 0xffffff
  };
}

/** 몸 주변에서 불티를 하나 뿌린다. `burst`면 발동 순간처럼 세게 솟는다. */
export function spawnRageEmber(x: number, y: number, body: number, random: () => number, burst = false): RageEmber {
  const speed = body * (burst ? 1.75 : 1.05) * (.55 + random() * .7);
  return {
    x, y,
    vx: (random() - .5) * body * .3,
    vy: -speed,
    age: 0,
    duration: .45 + random() * .5,
    size: Math.max(1, body * .016 * (.7 + random() * .9)),
    hot: random() < .35
  };
}

/** 불티를 한 프레임 진행시킨다(위로 솟으며 흔들리고, 수명이 다한 것은 버린다). */
export function stepRageEmbers(embers: RageEmber[], body: number, dt: number): RageEmber[] {
  for (const ember of embers) {
    ember.age += dt;
    ember.x += (ember.vx + Math.sin(ember.age * 13 + ember.size * 9) * body * .22) * dt;
    ember.y += ember.vy * dt;
    ember.vy *= 1 - Math.min(.9, dt * .6);
  }
  return embers.filter(ember => ember.age < ember.duration);
}

/** 버프 중 몸(어깨~무릎)에서 불티가 올라오는 자리를 고른다. */
function emberOrigin(x: number, y: number, body: number, random: () => number): [number, number] {
  const side = random() < .5 ? -1 : 1;
  const height = .08 + random() * .86;
  return [x + side * body * (.05 + random() * .28), y - body * height];
}

/**
 * 블러드 레이지 오라를 그린다. `drawEntities`가 히어로를 그린 **직후** 호출한다.
 * `body`는 캐릭터 머리~발 높이(px), `dt`는 초 단위 프레임 간격,
 * `flameTexture`·`glowTexture`는 불꽃 혀·방사형 광휘 텍스처다.
 */
export function drawBloodRageAura(
  view: RageAuraView, world: CombatEngine, x: number, y: number, time: number, dt: number, body: number,
  flameTexture: Texture, glowTexture: Texture
): void {
  const state = rageStateFor(view, flameTexture, glowTexture);
  const cast = world.effects.find(effect => effect.kind === 'warcry');
  // 블러드 레이지는 전사 스킬이다 — 궁수 호크아이·마법사 아케인 실드는 종전의 발밑 마법진을 쓴다.
  const intensity = jobOrDefault(world.save.job) === 'warrior' ? rageIntensity(world.player.berserk, cast?.age) : 0;
  const surge = cast && intensity > 0 ? Math.max(0, 1 - cast.age / cast.duration) : 0;
  state.overlay.clear();

  // ① 몸 뒤 광휘 — 몸통이 가장 밝고 가장자리로 스러지는 빛(가산이라 갑옷을 덮지 않는다).
  const pulse = .88 + .12 * Math.sin(time * 6.4);
  for (const [index, glow] of rageGlows.entries()) {
    const created = state.glows[index];
    created.visible = intensity > 0;
    created.position.set(x + glow.x * body, y - glow.y * body);
    created.scale.set(glow.rx * 2 * body / glowTexture.width, glow.ry * 2 * body / glowTexture.height);
    created.alpha = glow.alpha * intensity * (index === 0 ? pulse : 1);
  }
  // 발동 순간에는 몸 뒤로 붉은 섬광이 한 번 번진다.
  state.flash.visible = surge > 0;
  state.flash.position.set(x, y - body * .50);
  const flashSize = 1 + .45 * (1 - surge);
  state.flash.scale.set(body * 1.05 * flashSize / glowTexture.width, body * 1.30 * flashSize / glowTexture.height);
  state.flash.alpha = .55 * surge;

  // ② 몸 앞쪽 불꽃 혀.
  for (const [index, flame] of rageFlames.entries()) {
    const pose = rageFlamePose(flame, time, intensity, body);
    const created = state.flames[index];
    created.visible = pose.alpha > 0;
    created.position.set(x + pose.x, y + pose.y);
    created.scale.set(pose.width / flameTexture.width, pose.height / flameTexture.height);
    created.rotation = pose.rotation;
    created.alpha = pose.alpha;
    created.tint = pose.tint;
  }

  // ③ 발동 순간 — 발끝에서 머리 위로 솟는 투기 불기둥.
  for (const [index, flame] of rageSurges.entries()) {
    const pose = rageSurgePose(flame, time, surge, body);
    const created = state.surges[index];
    created.visible = surge > 0;
    created.position.set(x + pose.x, y + pose.y);
    created.scale.set(pose.width / flameTexture.width, pose.height / flameTexture.height);
    created.rotation = pose.rotation;
    created.alpha = pose.alpha;
    created.tint = pose.tint;
  }

  // ④ 불티 — 버프 중에는 계속, 발동 순간에는 한꺼번에 솟는다.
  const rate = intensity > 0 ? RAGE_EMBER_RATE * intensity + RAGE_EMBER_BURST_RATE * surge : 0;
  state.budget = Math.min(6, state.budget + rate * dt);
  while (state.budget >= 1 && state.embers.length < RAGE_EMBER_LIMIT) {
    const [ox, oy] = emberOrigin(x, y, body, Math.random);
    state.embers.push(spawnRageEmber(ox, oy, body, Math.random, surge > .5));
    state.budget -= 1;
  }
  state.embers = stepRageEmbers(state.embers, body, dt);
  for (const ember of state.embers) {
    const fade = Math.max(0, 1 - ember.age / ember.duration);
    state.overlay.circle(ember.x, ember.y, ember.size * (.6 + fade * .8))
      .fill({ color: ember.hot ? 0xffd27a : 0xff5422, alpha: .58 * fade });
    if (ember.hot) {
      state.overlay.moveTo(ember.x, ember.y).lineTo(ember.x - ember.vx * .04, ember.y - ember.vy * .04)
        .stroke({ color: 0xff7a2e, width: Math.max(1, ember.size * .7), alpha: .28 * fade });
    }
  }
}
