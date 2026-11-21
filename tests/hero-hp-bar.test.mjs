import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// 작업 233 — 내 캐릭터 머리 위 초록 체력바. 값·좌표는 `src/game/render/heroHpBar.ts` 한 곳이 기준이고,
// 몹 머리 위 빨간 바(`drawEntities` 의 `effects`)와 달리 해상도·효과 설정에 흔들리지 않는 전용 레이어에 그린다.
const {
  HERO_HP_BAR, heroHpRatio, heroHpBarBox, paintHeroHpBar, drawHeroHpBar
} = await import('../src/game/render/heroHpBar.ts');
const { heroScale, heroBodyPx, heroBodyFraction } = await import('../src/game/render/heroScale.ts');

const bar = readFileSync(new URL('../src/game/render/heroHpBar.ts', import.meta.url), 'utf8');
const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');

/** Graphics 대역 — 그린 도형·스타일을 순서대로 기록한다. */
function fakeGraphics() {
  const ops = [];
  let shape = null;
  const g = {
    ops,
    clear() { ops.length = 0; },
    rect(x, y, width, height) { shape = { kind: 'rect', x, y, width, height }; return g; },
    roundRect(x, y, width, height, radius) { shape = { kind: 'roundRect', x, y, width, height, radius }; return g; },
    fill(style) { ops.push({ shape, style }); return g; },
    stroke(style) { ops.push({ shape, style }); shape = null; return g; }
  };
  return g;
}

function view({ x = 195, y = 500, scaleY = .2, alpha = 1, visible = true } = {}) {
  const heroHpBar = fakeGraphics();
  return {
    heroHpBar,
    heroLayer: { position: { x, y }, scale: { x: scaleY, y: scaleY }, alpha, visible }
  };
}

const save = { level: 12, equipment: {}, passives: [], skillLevels: {} };
const health = 100 + (12 - 1) * 12; // totalStats(save).health

test('체력 비율은 0~100%로 잘린다', () => {
  assert.equal(heroHpRatio(50, 100), .5);
  assert.equal(heroHpRatio(280, 280), 1);
  assert.equal(heroHpRatio(999, 280), 1, '상한을 넘어도 100%');
  assert.equal(heroHpRatio(-30, 280), 0, '음수는 0%');
  assert.equal(heroHpRatio(Number.NaN, 280), 0);
  assert.equal(heroHpRatio(120, 0), 0, '상한이 0이면 비율을 만들지 않는다');
  assert.equal(heroHpRatio(120, -5), 0);
});

test('죽었거나 캐릭터 높이를 모르면 바를 그리지 않는다', () => {
  const base = { centerX: 195, headTopY: 420, bodyScreenHeight: 66, maxHp: health };
  assert.ok(heroHpBarBox({ ...base, hp: health }), '살아 있으면 그린다');
  assert.equal(heroHpBarBox({ ...base, hp: 0 }), undefined, '쓰러지면 지운다');
  assert.equal(heroHpBarBox({ ...base, hp: -4 }), undefined, '음수 체력도 지운다');
  assert.equal(heroHpBarBox({ ...base, hp: 10, maxHp: 0 }), undefined, '체력 상한이 없으면 그린다면 비율을 못 만든다');
  assert.equal(heroHpBarBox({ ...base, hp: 10, bodyScreenHeight: 0 }), undefined, '본체 높이 0');
  assert.equal(heroHpBarBox({ ...base, hp: 10, headTopY: Number.NaN }), undefined);
  assert.equal(heroHpBarBox({ ...base, hp: 10, centerX: Number.POSITIVE_INFINITY }), undefined);
});

test('바는 머리 꼭대기 바로 위에 앉고 캐릭터 가운데에 놓인다', () => {
  const body = 66;
  const box = heroHpBarBox({ centerX: 195, headTopY: 420, bodyScreenHeight: body, hp: 50, maxHp: 100 });
  const gap = Math.round(body * HERO_HP_BAR.gapOfBody);
  assert.equal(box.width, Math.round(body * HERO_HP_BAR.widthOfBody), '폭은 몸 높이 비율');
  assert.equal(box.height, Math.max(3, Math.round(box.width * HERO_HP_BAR.heightOfWidth)), '높이는 폭 비율');
  assert.equal(box.y + box.height, 420 - gap, '바 아래끝이 머리 꼭대기에서 간격만큼 위');
  assert.ok(gap >= HERO_HP_BAR.minGap, '간격 하한');
  assert.ok(Math.abs(box.x + box.width / 2 - 195) <= .5, '캐릭터 중심(홀수 폭은 반 픽셀 허용)');
  assert.equal(box.ratio, .5);
});

test('폭은 상·하한 안에서만 커지고 작아진다', () => {
  const tiny = heroHpBarBox({ centerX: 100, headTopY: 300, bodyScreenHeight: 20, hp: 1, maxHp: 1 });
  const huge = heroHpBarBox({ centerX: 100, headTopY: 300, bodyScreenHeight: 240, hp: 1, maxHp: 1 });
  assert.equal(tiny.width, HERO_HP_BAR.minWidth);
  assert.equal(huge.width, HERO_HP_BAR.maxWidth);
  assert.ok(tiny.height >= 3 && huge.height >= 3, '높이는 3px 아래로 내려가지 않는다');
});

test('마법사 고깔모자처럼 머리 위로 솟는 장식은 추가 간격으로 피한다', () => {
  const base = { centerX: 195, headTopY: 420, bodyScreenHeight: 66, hp: 5, maxHp: 10 };
  const plain = heroHpBarBox({ ...base });
  const lifted = heroHpBarBox({ ...base, headroom: 9.7 });
  assert.equal(plain.y - lifted.y, 10, '관모 높이(반올림 10px)만큼 더 띄운다');
  assert.equal(heroHpBarBox({ ...base, headroom: 0 }).y, plain.y, '관모가 없으면 그대로');
  assert.equal(heroHpBarBox({ ...base, headroom: -20 }).y, plain.y, '음수는 무시');
  assert.equal(heroHpBarBox({ ...base, headroom: Number.NaN }).y, plain.y, '값이 없으면 무시');
  assert.ok(HERO_HP_BAR.hatLiftArtPx >= 44, '가장 높은 여성 고깔모자(정수리 위 50px)를 덮는다');
});

test('3직업 남녀 × 서기·걷기·공격 × 투구 착용 모두 머리를 가리지 않는다', () => {
  const arts = Object.keys(heroBodyPx).filter(art => /^(pilot|archer|mage)(Male|Female)(Walk|Attack)?$/.test(art));
  assert.ok(arts.length >= 18, '세 직업 남녀의 서기·걷기·공격 표가 모두 있다');
  for (const screenHeight of [667, 700, 844, 932]) {
    for (const art of arts) {
      const scale = heroScale(screenHeight, art, 362);
      const bodyScreenHeight = scale * heroBodyPx[art];
      // 몸 높이는 화면 높이의 일정 비율(heroBodyFraction)로 수렴한다 — 시트마다 배율이 달라도 같다.
      assert.ok(Math.abs(bodyScreenHeight - screenHeight * heroBodyFraction) < 1.5, `${art}@${screenHeight} 몸 높이`);
      const box = heroHpBarBox({ centerX: 195, headTopY: 500 - bodyScreenHeight, bodyScreenHeight, hp: 70, maxHp: 100 });
      assert.ok(box, `${art} 바가 그려진다`);
      assert.ok(box.y + box.height <= 500 - bodyScreenHeight - HERO_HP_BAR.minGap + .5,
        `${art} 바 아래끝이 머리 꼭대기 위(간격 ${HERO_HP_BAR.minGap}px 이상)`);
      assert.ok(box.width >= HERO_HP_BAR.minWidth && box.width <= HERO_HP_BAR.maxWidth, `${art} 폭 한계`);
    }
  }
});

test('게이지는 트랙·초록 채움·상단 하이라이트·1px 테두리 순서로 그린다', () => {
  const g = fakeGraphics();
  paintHeroHpBar(g, { x: 170, y: 400, width: 40, height: 7, ratio: .5 });
  assert.equal(g.ops.length, 4, '트랙 → 채움 → 하이라이트 → 테두리');
  const [track, fill, top, border] = g.ops;
  assert.equal(track.shape.kind, 'roundRect');
  assert.equal(track.style, HERO_HP_BAR.track, '어두운 트랙');
  assert.equal(fill.style, HERO_HP_BAR.fill, '초록 게이지 #38b25c');
  assert.equal(HERO_HP_BAR.fill, 0x38b25c);
  assert.equal(Math.round(fill.shape.width * 2) / 2, 19, '남은 체력 50%만 채운다(안쪽 폭 38의 절반)');
  assert.equal(fill.shape.x, 171, '테두리 안쪽에서 시작');
  assert.equal(fill.shape.height, 5, '테두리 안쪽 높이');
  assert.equal(top.style.color, HERO_HP_BAR.fillTop);
  assert.equal(top.style.alpha, .55);
  assert.equal(top.shape.height, 2, '하이라이트는 게이지 위쪽 1~2px');
  assert.equal(border.style.width, 1, '1px 테두리');
  assert.equal(border.style.color, HERO_HP_BAR.border);
});

test('가득 차면 게이지가 트랙 안쪽을 다 덮는다', () => {
  const g = fakeGraphics();
  paintHeroHpBar(g, { x: 170, y: 400, width: 40, height: 7, ratio: 1 });
  const fill = g.ops.find(op => op.style === HERO_HP_BAR.fill);
  assert.equal(fill.shape.width, 38, '폭 40 − 테두리 2');
  assert.ok(fill.shape.x + fill.shape.width <= 170 + 40 - 1, '테두리를 넘지 않는다');
});

test('drawHeroHpBar — 레이어 위치·세로 배율에서 머리 꼭대기를 잰다', () => {
  const v = view({ x: 180, y: 520, scaleY: .2 });
  drawHeroHpBar(v, { save, player: { hp: health } }, 335);
  const box = v.heroHpBar.ops.find(op => op.style === HERO_HP_BAR.fill).shape;
  const bodyScreen = .2 * 335;
  const expected = heroHpBarBox({ centerX: 180, headTopY: 520 - bodyScreen, bodyScreenHeight: bodyScreen, hp: health, maxHp: health });
  assert.equal(box.x, expected.x + 1);
  assert.equal(box.width, (expected.width - 2) * 1, '100%면 가득');
});

test('drawHeroHpBar — 죽음·숨김 프레임은 이전 바를 지우기만 한다', () => {
  for (const world of [{ save, player: { hp: 0 } }]) {
    const v = view();
    drawHeroHpBar(v, world, 335);
    assert.equal(v.heroHpBar.ops.length, 0, '쓰러지면 아무것도 남기지 않는다');
  }
  for (const options of [{ alpha: 0 }, { visible: false }]) {
    const v = view(options);
    drawHeroHpBar(v, { save, player: { hp: health } }, 335);
    assert.equal(v.heroHpBar.ops.length, 0, `캐릭터가 숨겨지면(${JSON.stringify(options)}) 지운다`);
  }
});

test('필드 렌더러가 머리 위 체력바를 그리고 전용 레이어에 올린다', () => {
  assert.match(entities, /drawHeroHpBar\(this, world, bodyPx, hatLift\)/, 'drawHero 가 매 프레임 그린다');
  assert.match(entities, /const hatLift = mage && mageHelmIndexFor\(save\) >= 0 \? HERO_HP_BAR\.hatLiftArtPx : 0;/, '마법사 모자만 추가 간격');
  assert.match(render, /heroHpBar = new Graphics\(\)/, '효과 레이어와 분리한 Graphics');
  assert.match(render, /this\.effects, this\.heroHpBar, this\.labels/, '몹 바(effects) 위, 이름표(labels) 아래');
  assert.doesNotMatch(bar, /preferences/, '효과 설정으로 흐려지지 않는다');
  assert.match(bar, /Math\.max\(1, totalStats\(world\.save\)\.health\)/, '실제 체력 상한을 쓴다');
});
