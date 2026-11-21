import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Container, Rectangle, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  windRibbons, windGlows, windMotes, windRibbonSegments, hawkEyeWindIntensity,
  drawHawkEyeWindAura, WIND_FRONT_CUT, WIND_MOTE_COUNT, WIND_FADE_IN, WIND_FADE_OUT
} = await import('../src/game/render/hawkEyeWind.ts');

const BODY = 70;
const FEET = { x: 180, y: 420 };
const glowTexture = () => new Texture({ source: Texture.EMPTY.source, frame: new Rectangle(0, 0, 192, 192) });

function auraView() {
  return { windBack: new Container(), windFront: new Container() };
}

function fakeWorld({ berserk = 0, castAge, job = 'archer' } = {}) {
  return {
    save: { job },
    player: { berserk },
    effects: castAge === undefined ? [] : [{ kind: 'hawk', age: castAge, duration: .9, x: 0, y: 0 }]
  };
}

function draw(view, world, time = 1.2) {
  drawHawkEyeWindAura(view, world, FEET.x, FEET.y, time, 1 / 60, BODY, glowTexture());
  return view;
}

/** Graphics 대신 그리기 명령 수를 세기 위한 뷰 — 실제 Graphics 를 써서 컨텍스트를 집계한다. */
function strokes(view) {
  let total = 0;
  for (const child of [...view.windBack.children, ...view.windFront.children]) {
    if (child.constructor?.name === 'Graphics') total += child.context.instructions.length;
  }
  return total;
}

test('바람 세기 — 발동 직후 감기고 버프 끝에서 풀린다', () => {
  assert.equal(hawkEyeWindIntensity(0), 0, '버프가 없으면 그리지 않는다');
  assert.equal(hawkEyeWindIntensity(3), 1, '지속 중에는 가득 찬다');
  assert.ok(Math.abs(hawkEyeWindIntensity(3, WIND_FADE_IN / 2) - .5) < 1e-9, '발동 반쯤에서 절반');
  assert.equal(hawkEyeWindIntensity(3, WIND_FADE_IN * 2), 1, '발동 페이드가 끝나면 가득');
  assert.ok(Math.abs(hawkEyeWindIntensity(WIND_FADE_OUT / 2) - .5) < 1e-9, '종료 직전엔 절반까지 옅어진다');
  assert.equal(hawkEyeWindIntensity(0, .05), 0, '버프가 끝나면 이펙트가 남아 있어도 0');
});

test('바람 리본은 두 줄이고 몸 높이 안에서 감긴다', () => {
  assert.equal(windRibbons.length, 2, '확정 시안대로 두 줄');
  for (const ribbon of windRibbons) {
    for (const time of [0, .4, 1.1, 2.7]) {
      const segments = windRibbonSegments(ribbon, time, 1, BODY);
      assert.ok(segments.length > 8, `${ribbon.phase}@${time}: 선분이 충분하다`);
      for (const segment of segments) {
        const values = [segment.x1, segment.y1, segment.x2, segment.y2, segment.width, segment.alpha];
        assert.ok(values.every(Number.isFinite), `${ribbon.phase}: 수치`);
        assert.ok(segment.x1 >= -BODY * .35 && segment.x1 <= BODY * .35, `${ribbon.phase}: 몸 폭을 벗어나지 않는다`);
        assert.ok(segment.y1 <= 0 && segment.y1 >= -BODY * 1.02, `${ribbon.phase}: 발끝~머리 높이 안`);
        assert.ok(segment.width >= .8 && segment.width <= 2.6, `${ribbon.phase}: 1.2~2.2px 대의 가는 선`);
        assert.ok(segment.alpha > 0 && segment.alpha <= .62, `${ribbon.phase}: 갑옷을 덮지 않는 알파`);
      }
    }
  }
});

test('바람 리본은 몸 앞과 뒤를 나눠 그리고, 앞쪽 줄은 얼굴 높이에서 뒤로 돌린다', () => {
  const segments = windRibbons.flatMap(ribbon => windRibbonSegments(ribbon, 1.1, 1, BODY));
  assert.ok(segments.some(segment => segment.front), '몸 앞줄이 있다');
  assert.ok(segments.some(segment => !segment.front), '몸 뒤줄이 있다');
  // 앞쪽 선분은 모두 허리~가슴 높이(얼굴 아래)에 머문다 — 앞을 가로지르는 선이 표정을 덮지 않는다.
  for (const segment of segments.filter(segment => segment.front)) {
    assert.ok(segment.y1 >= -BODY * WIND_FRONT_CUT - 1, `앞줄이 얼굴 높이(${segment.y1.toFixed(1)})까지 올라가지 않는다`);
  }
  // 몸통 가운데를 지나는 대목은 옅고, 옆구리로 도는 대목은 진하다.
  const strong = Math.max(...segments.map(segment => segment.alpha));
  const faint = Math.min(...segments.map(segment => segment.alpha));
  assert.ok(strong > faint * 1.8, '가로지르는 대목이 옆구리보다 확실히 옅다');
});

test('바람 리본은 프레임마다 자리가 바뀐다(감기며 돈다)', () => {
  const ribbon = windRibbons[0];
  const first = windRibbonSegments(ribbon, 1.0, 1, BODY);
  const later = windRibbonSegments(ribbon, 1.35, 1, BODY);
  assert.notEqual(first[0].x1, later[0].x1, '방위각이 시간에 따라 돈다');
  const weak = windRibbonSegments(ribbon, 1.0, .3, BODY);
  assert.ok(Math.max(...weak.map(segment => segment.alpha)) < Math.max(...first.map(segment => segment.alpha)), '세기가 약하면 옅다');
});

test('바람 알갱이는 시간만으로 자리가 정해지고 위로 떠오른다', () => {
  const motes = windMotes(1.2, 1, BODY);
  assert.equal(motes.length, WIND_MOTE_COUNT);
  assert.deepEqual(windMotes(1.2, 1, BODY), motes, '난수 없이 같은 값이 나온다');
  for (const mote of motes) {
    assert.ok([mote.x, mote.y, mote.size, mote.alpha].every(Number.isFinite));
    assert.ok(mote.alpha >= 0 && mote.alpha <= .5, '알갱이는 옅다');
    assert.ok(Math.abs(mote.x) <= BODY * .3, '몸 주변에 머문다');
    assert.ok(mote.y <= 0 && mote.y >= -BODY * .9, '발끝~머리 높이 안');
  }
  const heights = (time) => windMotes(time, 1, BODY).map(mote => mote.y);
  assert.notDeepEqual(heights(1.2), heights(2.0), '시간이 흐르면 자리가 바뀐다');
});

test('호크아이 중인 궁수에게만 바람 오라를 그린다', () => {
  const view = draw(auraView(), fakeWorld({ berserk: 4 }));
  assert.ok(strokes(view) > 20, '리본과 알갱이가 그려진다');
  const glows = view.windBack.children.filter(child => child.constructor?.name === 'Sprite');
  assert.equal(glows.length, windGlows.length);
  assert.ok(glows.every(glow => glow.visible && glow.alpha > 0), '몸의 빛무리가 켜진다');
  assert.ok(glows.every(glow => glow.blendMode === 'add'), '가산이라 갑옷 색을 덮지 않는다');

  for (const job of ['warrior', 'mage']) {
    const other = draw(auraView(), fakeWorld({ berserk: 4, job }));
    assert.equal(strokes(other), 0, `${job}: 바람 리본을 그리지 않는다`);
    const otherGlows = other.windBack.children.filter(child => child.constructor?.name === 'Sprite');
    assert.ok(otherGlows.every(glow => !glow.visible && glow.alpha === 0), `${job}: 빛무리도 없다`);
  }

  const idle = draw(auraView(), fakeWorld({ berserk: 0 }));
  assert.equal(strokes(idle), 0, '버프가 없으면 아무것도 그리지 않는다');
});

test('발동 직후에는 바람이 옅게 시작해 감긴다', () => {
  const early = draw(auraView(), fakeWorld({ berserk: 4, castAge: WIND_FADE_IN * .25 }));
  const settled = draw(auraView(), fakeWorld({ berserk: 4, castAge: WIND_FADE_IN * 3 }));
  const alphaOf = view => view.windBack.children.filter(child => child.constructor?.name === 'Sprite')
    .reduce((sum, glue) => sum + glue.alpha, 0);
  assert.ok(alphaOf(early) < alphaOf(settled), '발동 직후엔 빛무리가 옅다');
});

test('궁수 호크아이는 발밑 마법진 대신 몸 주변 바람 오라를 쓴다', () => {
  const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
  assert.ok(entities.includes('drawHawkEyeWindAura'), '몸 주변 바람 오라를 그린다');
  assert.ok(entities.includes("jobOrDefault(world.save.job) === 'mage'"), '발밑 마법진은 마법사만 쓴다');
  const field = readFileSync(new URL('../src/game/render/field.ts', import.meta.url), 'utf8');
  assert.ok(field.includes("jobOrDefault(world.save.job) === 'mage'"), '지면 링도 마법사 버프만 남는다');
  const vfx = readFileSync(new URL('../src/game/render/vfx.ts', import.meta.url), 'utf8');
  const hawkEye = vfx.slice(vfx.indexOf('export function drawHawkEye'), vfx.indexOf('export function drawDragon'));
  assert.ok(hawkEye.includes('0x9ee8ff') && hawkEye.includes('0xdcf7ff'), '발동 순간에도 청록 바람 나선이 솟는다');
  assert.ok(/for \(let step = 0; step <= 11; step\+\+\)/.test(hawkEye), '나선을 따라 올라간다');
});
