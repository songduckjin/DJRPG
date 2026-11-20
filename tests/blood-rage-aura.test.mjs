import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Container, Graphics, Rectangle, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  rageFlames, rageSurges, rageGlows, rageIntensity, rageFlamePose, rageSurgePose, spawnRageEmber, stepRageEmbers,
  drawBloodRageAura, rageStateFor, RAGE_EMBER_LIMIT, RAGE_FADE_IN, RAGE_FADE_OUT
} = await import('../src/game/render/bloodRage.ts');

const BODY = 70;
const FEET = { x: 180, y: 420 };
const texture = () => new Texture({ source: Texture.EMPTY.source, frame: new Rectangle(0, 0, 128, 224) });

/** Graphics 대역 — 호출 기록으로 "지면 링을 그렸는지"를 확인한다. */
function fakeGraphics() {
  const ops = [];
  let shape = null;
  const g = {
    ops,
    clear() { ops.length = 0; },
    ellipse(x, y, rx, ry) { shape = { kind: 'ellipse', x, y, rx, ry }; return g; },
    circle(x, y, radius) { shape = { kind: 'circle', x, y, radius }; return g; },
    moveTo(x, y) { shape = { kind: 'line', x, y }; return g; },
    lineTo(x, y) { shape = { kind: 'line', x, y }; return g; },
    fill(style) { ops.push({ shape, style }); return g; },
    stroke(style) { ops.push({ shape, style }); return g; }
  };
  return g;
}

function auraView() { return { rageBack: new Container(), rageFront: new Container() }; }
const glowTexture = () => new Texture({ source: Texture.EMPTY.source, frame: new Rectangle(0, 0, 192, 192) });

function fakeWorld({ berserk = 0, castAge, job = 'warrior' } = {}) {
  return {
    save: { job },
    player: { berserk, berserkLevel: 1 },
    effects: castAge === undefined ? [] : [{ kind: 'warcry', age: castAge, duration: .7, x: 0, y: 0 }]
  };
}

function draw(view, world, time = 1.2, dt = 1 / 60, tex = texture(), glow = glowTexture()) {
  drawBloodRageAura(view, world, FEET.x, FEET.y, time, dt, BODY, tex, glow);
  return rageStateFor(view, tex, glow);
}

test('오라 세기 — 발동 직후 피어오르고 버프 끝에서 옅어진다', () => {
  assert.equal(rageIntensity(0), 0, '버프가 없으면 그리지 않는다');
  assert.equal(rageIntensity(3), 1, '지속 중에는 가득 찬다');
  assert.ok(Math.abs(rageIntensity(3, RAGE_FADE_IN / 2) - .5) < 1e-9, '발동 반쯤에서 절반');
  assert.equal(rageIntensity(3, RAGE_FADE_IN * 2), 1, '발동 페이드가 끝나면 가득');
  assert.ok(Math.abs(rageIntensity(RAGE_FADE_OUT / 2) - .5) < 1e-9, '종료 직전엔 절반까지 옅어진다');
  assert.equal(rageIntensity(0, .05), 0, '버프가 끝나면 이펙트가 남아 있어도 0');
});

test('불꽃 혀는 몸을 따라 위로 솟고 시간에 따라 일렁인다', () => {
  for (const flame of rageFlames) {
    const pose = rageFlamePose(flame, 1.3, 1, BODY);
    assert.ok([pose.x, pose.y, pose.width, pose.height, pose.rotation, pose.alpha].every(Number.isFinite), `${flame.phase}: 수치`);
    assert.ok(pose.y <= 0, `${flame.phase}: 발끝 아래로 내려가지 않는다`);
    assert.ok(pose.height > 0 && pose.width > 0);
    assert.ok(pose.alpha > 0 && pose.alpha <= .85, `${flame.phase}: 갑옷을 덮지 않는 알파`);
    const later = rageFlamePose(flame, 1.6, 1, BODY);
    assert.notEqual(pose.height, later.height, `${flame.phase}: 프레임마다 타오르는 길이가 바뀐다`);
    const weak = rageFlamePose(flame, 1.3, .2, BODY);
    assert.ok(weak.height < pose.height, `${flame.phase}: 세기가 약하면 불꽃이 짧다`);
    assert.ok(weak.alpha < pose.alpha, `${flame.phase}: 세기가 약하면 옅다`);
  }
  // 몸 좌우(±.45) 안에서 실루엣을 감싼다.
  assert.ok(rageFlames.every(flame => Math.abs(flame.x) <= .45), '불꽃이 몸 주변을 벗어나지 않는다');
  // 얼굴 높이에는 정면 혀를 세우지 않는다.
  assert.ok(rageFlames.every(flame => Math.abs(flame.x) > .12 || flame.base < .3), '얼굴 위 정면에는 혀를 세우지 않는다');
});

test('불티는 위로 솟아 오르다 수명이 끝나면 사라진다', () => {
  const ember = spawnRageEmber(FEET.x, FEET.y - 30, BODY, () => .5);
  const startY = ember.y;
  let embers = stepRageEmbers([ember], BODY, 1 / 60);
  assert.equal(embers.length, 1);
  assert.ok(embers[0].y < startY, '불티는 위로 올라간다');
  for (let i = 0; i < 120; i++) embers = stepRageEmbers(embers, BODY, 1 / 60);
  assert.equal(embers.length, 0, '수명이 끝나면 정리된다');
  const burst = spawnRageEmber(FEET.x, FEET.y - 30, BODY, () => .5, true);
  const calm = spawnRageEmber(FEET.x, FEET.y - 30, BODY, () => .5, false);
  assert.ok(Math.abs(burst.vy) > Math.abs(calm.vy), '발동 순간 불티가 더 세게 솟는다');
});

test('버프 중에는 몸 주변 불꽃이 켜지고 지면 타원 링은 그리지 않는다', () => {
  const view = auraView();
  const state = draw(view, fakeWorld({ berserk: 3 }));
  assert.equal(state.flames.length, rageFlames.length);
  assert.equal(view.rageFront.children.filter(child => child.constructor?.name === 'Sprite').length, rageFlames.length + rageSurges.length);
  const lit = state.flames.filter(sprite => sprite.alpha > 0);
  assert.equal(lit.length, rageFlames.length, '모든 혀가 켜진다');
  for (const sprite of state.flames) {
    assert.equal(sprite.blendMode, 'add', '불꽃은 가산으로 탄다');
    assert.ok(sprite.position.x > FEET.x - BODY * .6 && sprite.position.x < FEET.x + BODY * .6, '몸 주변에 붙어 있다');
    assert.ok(sprite.position.y <= FEET.y && sprite.position.y > FEET.y - BODY, '발끝부터 몸 높이 안');
    assert.ok(sprite.height > 0 && sprite.width > 0);
  }
  assert.ok(state.flames.some(sprite => sprite.position.y - sprite.height < FEET.y - BODY * .98), '머리 위까지 불꽃이 올라온다');
  // 몸 뒤 광휘는 가장자리가 스러지는 방사형 스프라이트 — 지면에 눕는 테두리(링)가 없다.
  assert.equal(state.glows.length, rageGlows.length);
  assert.ok(state.glows.every(sprite => sprite.alpha > 0 && sprite.visible), '몸 뒤 붉은 광휘가 켜진다');
  assert.ok(state.glows.every(sprite => sprite.blendMode === 'add'), '광휘도 가산이다');
  assert.ok(state.glows.every(sprite => Math.abs(sprite.position.x - FEET.x) <= BODY * .4), '광휘가 몸 뒤에 붙어 있다');
  assert.equal(state.flash.visible, false, '지속 중에는 발동 섬광이 없다');
});

test('버프가 없으면 불꽃이 꺼지고 남은 불티만 사라진다', () => {
  const view = auraView();
  const tex = texture();
  const state = draw(view, fakeWorld({ berserk: 0 }), 1, 1 / 60, tex);
  assert.ok(state.flames.every(sprite => sprite.alpha === 0 && sprite.visible === false), '불꽃이 꺼져 있다');
  assert.ok(state.glows.every(sprite => sprite.visible === false), '광휘도 꺼져 있다');

  for (let frame = 0; frame < 30; frame++) draw(view, fakeWorld({ berserk: 2 }), 1 + frame / 60, 1 / 60, tex);
  assert.ok(state.embers.length > 0, '버프 중에는 불티가 생긴다');
  for (let frame = 0; frame < 120; frame++) draw(view, fakeWorld({ berserk: 0 }), 2 + frame / 60, 1 / 60, tex);
  assert.equal(state.embers.length, 0, '버프가 끝나면 불티가 모두 사라진다');
  assert.equal(state.overlay.instructionCount ?? 0, 0, '불티 레이어도 비워진다');
});

test('발동 순간에는 위로 솟는 투기 불기둥이 더해진다', () => {
  const calm = auraView(), cast = auraView();
  const calmState = draw(calm, fakeWorld({ berserk: 6 }), 2);
  const castState = draw(cast, fakeWorld({ berserk: 6, castAge: .12 }), 2);
  assert.ok(calmState.surges.every(sprite => sprite.alpha === 0), '지속 중에는 불기둥이 없다');
  assert.ok(castState.surges.every(sprite => sprite.alpha > 0 && sprite.visible), '발동 순간 불기둥이 켜진다');
  assert.ok(castState.flash.visible && castState.flash.alpha > 0, '발동 순간 몸 뒤 섬광이 번진다');
  const tallest = Math.max(...castState.surges.map(sprite => sprite.height));
  assert.ok(tallest > BODY, '불기둥이 머리 위까지 솟는다');
  assert.ok(Math.max(...castState.surges.map(sprite => Math.abs(sprite.x - FEET.x))) > BODY * .1, '불기둥은 얼굴 정면을 비켜 몸 옆에서 솟는다');
  const late = rageSurgePose(rageSurges[0], 2, .2, BODY);
  const early = rageSurgePose(rageSurges[0], 2, 1, BODY);
  assert.ok(late.height < early.height && late.alpha < early.alpha, '이펙트가 끝나며 짧고 옅어진다');

  // 불티 폭발량도 늘어난다.
  const many = auraView();
  for (let frame = 0; frame < 10; frame++) draw(many, fakeWorld({ berserk: 6, castAge: frame / 60 }), 2 + frame / 60);
  assert.ok(rageStateFor(many, texture(), glowTexture()).embers.length > rageStateFor(calm, texture(), glowTexture()).embers.length, '발동 순간 불티가 더 많이 뿌려진다');
});

test('불티 수는 상한을 넘지 않고 뷰마다 따로 관리된다', () => {
  const first = auraView(), second = auraView();
  const tex = texture(), glow = glowTexture();
  for (let frame = 0; frame < 400; frame++) draw(first, fakeWorld({ berserk: 8 }), frame / 60, 1 / 60, tex, glow);
  assert.ok(rageStateFor(first, tex, glow).embers.length <= RAGE_EMBER_LIMIT, `상한 ${RAGE_EMBER_LIMIT}`);
  assert.equal(rageStateFor(second, tex, glow).embers.length, 0, '다른 뷰의 불티를 끌어오지 않는다');
});

test('전사가 아닌 직업의 버프는 전사 오라를 쓰지 않는다', () => {
  for (const job of ['archer', 'mage']) {
    const view = auraView();
    const state = draw(view, fakeWorld({ berserk: 3, castAge: .1, job }));
    assert.ok(state.flames.every(sprite => sprite.alpha === 0), `${job}: 불꽃이 켜지지 않는다`);
    assert.ok(state.surges.every(sprite => sprite.alpha === 0), `${job}: 불기둥도 없다`);
    assert.ok(state.glows.every(sprite => sprite.visible === false), `${job}: 붉은 광휘도 없다`);
  }
});

test('예전 발밑 타원 링은 전사 블러드 레이지에서 사라졌다', () => {
  const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
  assert.ok(entities.includes('drawBloodRageAura'), '몸 주변 오라를 그린다');
  assert.ok(entities.includes("jobOrDefault(world.save.job) !== 'warrior'"), '마법진은 전사가 아닌 직업만 쓴다');
  const field = readFileSync(new URL('../src/game/render/field.ts', import.meta.url), 'utf8');
  assert.ok(!field.includes("'warcry'"), '블러드 레이지는 지면 링 목록에서 빠졌다');
  assert.ok(field.includes('jobOrDefault'), '다른 직업 버프의 링은 그대로 둔다');
  const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  assert.ok(render.includes("this.rageFront.blendMode = 'add'"), '불꽃·불티 레이어는 가산이다');
  assert.ok(render.includes("this.rageBack.blendMode = 'add'"), '몸 뒤 광휘 레이어도 가산이다');
  assert.ok(render.includes('fx_rage_glow_v1.png'), '광휘 텍스처를 받는다');
  assert.ok(!/rageBack\.ellipse/.test(render), '광휘에 도형 채우기를 쓰지 않는다(가장자리가 잘린다)');
  assert.ok(render.includes('fx_rage_flame_v1.png'), '불꽃 혀 텍스처를 받는다');
});
