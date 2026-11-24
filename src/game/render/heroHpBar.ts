/**
 * 내 캐릭터 머리 위 초록 체력바 (작업 233).
 *
 * 몬스터 머리 위 빨간 바(`drawEntities` 의 `enemy.hp / enemy.maxHp`)와 짝을 이루는 **내 캐릭터**
 * 표시다. 확정 시안 `downloads/hp_orb/rec_1_hero_bar.jpg` 대로 어두운 테두리·어두운 트랙 위에
 * 선명한 초록 게이지(`#38b25c`)를 채우고 게이지 위쪽에 밝은 하이라이트 한 줄을 얹는다.
 *
 * 위치는 캐릭터의 **실제 머리 꼭대기**에서 잰다. `drawHero` 가 몸 높이표(`heroBodyPx`)와 배율로
 * 계산한 머리 꼭대기 화면 y(발밑 기준)에서 간격만큼 위가 바의 아래끝이고, 바의 폭·높이·간격도
 * 모두 그 몸 높이의 비율이다. 그래서 3직업(전사·궁수·마법사) × 남녀 × 서기·걷기·공격 ×
 * 투구 착용 어디에서나 같은 비율로 머리 바로 위에 앉는다(투구의 고깔·후광이 머리 위로 솟아도
 * 간격이 그만큼을 덮는다).
 *
 * 그리기 자체는 `paintHeroHpBar` 하나가 맡고, 값 계산(`heroHpBarBox`)과 분리해 두어 단위
 * 테스트가 픽셀 없이 좌표만 검증한다.
 */
import type { Graphics } from 'pixi.js';
import type { CombatEngine } from '../combat/engine';
import { totalStats } from '../items';
import type { GameView } from '../render';

export const HERO_HP_BAR = {
  /** 바 폭 = 화면 캐릭터 머리~발 높이 × 이 값. */
  widthOfBody: .62,
  /** 바 높이 = 폭 × 이 값. */
  heightOfWidth: .18,
  /** 머리 꼭대기 ↔ 바 아래끝 = 화면 캐릭터 높이 × 이 값. */
  gapOfBody: .10,
  /** 폭 상한·하한(px) — 아주 작은 화면에서도 읽히고, 큰 화면에서 캐릭터보다 넓어지지 않는다. */
  minWidth: 26,
  maxWidth: 48,
  /** 머리 위 최소 간격(px). 아주 작은 화면에서도 머리·투구를 가리지 않는다. */
  minGap: 4,
  /**
   * 마법사 고깔모자·후광처럼 **머리 위로 솟는 관모**의 최대 높이(아트 px).
   *
   * 셀 좌표에서 정수리 위로 가장 높이 솟는 파츠가 `female_7` 의 50px(정수리 14 − 파츠 상단 −36)라
   * 그만큼 더 띄운다 — 가로가 아니라 세로로 솟으므로 바 폭으로는 피할 수 없다.
   */
  hatLiftArtPx: 50,
  /** 게이지 초록(확정 시안) — 위에서 아래로 밝은 하이라이트 → 본색. */
  fill: 0x38b25c,
  fillTop: 0x9ce9b6,
  /** 빈 트랙(어두운 갈색)과 테두리(거의 검정). */
  track: 0x241714,
  border: 0x070505
} as const;

export type HeroHpBarBox = {
  /** 바의 왼쪽 위 모서리(화면 px, 정수). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 남은 체력 비율 0~1. */
  ratio: number;
};

/** 체력 비율 0~1 클램프. 값이 없거나 상한이 0 이하면 0. */
export function heroHpRatio(hp: number, maxHp: number): number {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, hp / maxHp));
}

/**
 * 바의 화면 좌표·크기. 그리지 않아야 할 때(죽음·상한 없음·캐릭터 높이 0)는 `undefined`.
 *
 * `centerX`·`headTopY` 는 캐릭터 레이어의 화면 좌표(발밑 기준 y 에서 몸 높이를 뺀 머리 꼭대기),
 * `bodyScreenHeight` 는 화면에 그려진 머리~발 높이(px)다.
 */
export function heroHpBarBox(input: {
  centerX: number;
  headTopY: number;
  bodyScreenHeight: number;
  hp: number;
  maxHp: number;
  /** 머리 위로 솟은 관모·투구 높이(화면 px) — 이만큼 더 띄운다(없으면 0). */
  headroom?: number;
}): HeroHpBarBox | undefined {
  const { centerX, headTopY, bodyScreenHeight, hp, maxHp } = input;
  if (!Number.isFinite(centerX) || !Number.isFinite(headTopY) || !Number.isFinite(bodyScreenHeight)) return undefined;
  if (bodyScreenHeight <= 0) return undefined;
  // 쓰러진 상태(0 이하)나 체력 상한을 모를 때는 머리 위에 아무것도 띄우지 않는다.
  if (!Number.isFinite(hp) || hp <= 0 || !Number.isFinite(maxHp) || maxHp <= 0) return undefined;
  const width = Math.round(Math.max(HERO_HP_BAR.minWidth, Math.min(HERO_HP_BAR.maxWidth, bodyScreenHeight * HERO_HP_BAR.widthOfBody)));
  const height = Math.max(3, Math.round(width * HERO_HP_BAR.heightOfWidth));
  const headroom = Number.isFinite(input.headroom) ? Math.max(0, input.headroom as number) : 0;
  const gap = Math.max(HERO_HP_BAR.minGap, Math.round(bodyScreenHeight * HERO_HP_BAR.gapOfBody)) + Math.round(headroom);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(headTopY - gap - height),
    width,
    height,
    ratio: heroHpRatio(hp, maxHp)
  };
}

/**
 * 바를 그린다 — 테두리 있는 어두운 트랙 → 초록 게이지 → 게이지 위쪽 하이라이트 → 1px 테두리.
 * `ratio` 가 0 이어도 트랙은 남기지 않는다(그 경우는 `heroHpBarBox` 가 `undefined`).
 */
export function paintHeroHpBar(graphics: Graphics, box: HeroHpBarBox, shieldRatio = 0): void {
  const { x, y, width, height, ratio } = box;
  const radius = Math.min(Math.max(1, Math.round(height * .32)), Math.floor(height / 2));
  const innerWidth = (width - 2) * ratio;
  graphics.roundRect(x, y, width, height, radius).fill(HERO_HP_BAR.track);
  if (innerWidth > 0) {
    const innerRadius = Math.min(radius, Math.floor(innerWidth / 2));
    graphics.roundRect(x + 1, y + 1, innerWidth, height - 2, innerRadius).fill(HERO_HP_BAR.fill);
    // 상단 하이라이트 — 게이지 윗변을 밝게 훑어 다크 판타지 금속 감을 준다.
    graphics.rect(x + 1, y + 1, innerWidth, Math.max(1, Math.round((height - 2) * .32))).fill({ color: HERO_HP_BAR.fillTop, alpha: .55 });
  }
  graphics.roundRect(x, y, width, height, radius).stroke({ width: 1, color: HERO_HP_BAR.border, alpha: .95 });
  if (shieldRatio > 0) {
    graphics.roundRect(x, y - 4, width, 3, 1).fill({ color: 0x18243e, alpha: .9 });
    graphics.roundRect(x, y - 4, Math.max(2, width * Math.min(1, shieldRatio)), 3, 1)
      .fill({ color: 0x87c7ff, alpha: .96 });
  }
}

/**
 * `drawHero` 가 매 프레임 부른다. 캐릭터가 그려진 자리(레이어 위치·세로 배율)에서 머리 꼭대기를
 * 계산해 바를 새로 그린다. 죽었거나 캐릭터가 숨겨진 프레임은 이전 바를 지우기만 한다.
 */
export function drawHeroHpBar(view: GameView, world: CombatEngine, bodyPx: number, headroomArtPx = 0): void {
  const layer = view.heroLayer;
  const graphics = view.heroHpBar;
  // 테스트·초기화 도구는 GameView 의 일부 멤버만 흉내 낸 대역을 쓴다 — 레이어가 없으면 넘어간다.
  if (!graphics) return;
  graphics.clear();
  if (!layer.visible || layer.alpha <= .05) return;
  const scaleY = Math.abs(layer.scale.y);
  const bodyScreenHeight = scaleY * bodyPx;
  const box = heroHpBarBox({
    centerX: layer.position.x,
    headTopY: layer.position.y - bodyScreenHeight,
    bodyScreenHeight,
    hp: world.player.hp,
    maxHp: Math.max(1, totalStats(world.save).health),
    headroom: Math.max(0, headroomArtPx) * scaleY
  });
  if (!box) return;
  paintHeroHpBar(graphics, box, world.player.shield / Math.max(1, totalStats(world.save).health));
}
