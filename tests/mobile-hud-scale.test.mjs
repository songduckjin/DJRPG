import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// 휴대폰 배율 맞춤 HUD·아이콘·레이아웃 조절(백로그 4번 개선안, 2026-11-22)
//   ① 길이 토큰 `--u` 하나로 HUD 전체가 폭에 비례해 줄어든다(390px = 1.0).
//   ② 460px 미만에서 문맥 버튼(⚔ 보스 도전·▲ 최고층)은 아이콘만, 340px 미만은 층 버튼의 처치 수도 접는다.
//   ③ 버프 알약은 상태 줄·우측 레일을 비켜 **HP 바 아래 빈 자리**로 내려간다.
const { renderStatus } = await import('../src/ui/hud.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const baseStyles = read('src/styles/base.css');
const hudStyles = read('src/styles/hud.css');
const worldBossStyles = read('src/styles/world-boss.css');

/** CSS에서 그 선택자의 규칙 본문들을 모두 꺼내, `must`를 담은 마지막 규칙을 쓴다(뒤에 덧붙은 규칙이 이긴다). */
function ruleBody(styles, selector, must) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const bodies = [...styles.matchAll(pattern)].map(match => match[1]);
  const found = must ? bodies.filter(body => body.includes(must)) : bodies;
  assert.ok(found.length, `${selector} 규칙이 있다${must ? ` (${must})` : ''}`);
  return found[found.length - 1];
}
/** `calc(N * var(--u))` 또는 옛 `Npx` → 배율 1.0 기준 숫자(N). */
function length(body, property) {
  // `Npx` / `calc(N * var(--u))` / `calc(env(safe-area-inset-top) + N * var(--u))` 모두 읽는다.
  const value = body.match(new RegExp(`${property}:\\s*(?:calc\\(\\s*)?(?:env\\([^)]*\\) \\+ )?(-?[\\d.]+)(?: \\* var\\(--u\\))?`));
  assert.ok(value, `${property} 길이`);
  return Number(value[1]);
}
/** 배율 토큰 — `base.css` `.game-shell`의 clamp 그대로. */
const token = (() => {
  const found = baseStyles.match(/--u:\s*clamp\(([\d.]+)px, calc\(100vw \* ([\d.]+)\), ([\d.]+)px\)/);
  assert.ok(found, '`.game-shell`에 `--u`가 있다');
  return { min: Number(found[1]), factor: Number(found[2]), max: Number(found[3]) };
})();
const scaleAt = width => Math.min(token.max, Math.max(token.min, width * token.factor));

test('길이 토큰 `--u`는 `.game-shell` 한 곳에 있고 390px=1.0 · 360px≈0.92 · 430px=1.10이다', () => {
  assert.match(baseStyles, /:root \{[^}]*--u: 1px/, ':root 기본값 — 셸 밖에서 값이 깨지지 않는다');
  assert.match(baseStyles, /\.game-shell \{ --u: clamp\(0\.8px, calc\(100vw \* 0\.00256\), 1\.1px\)/, '배율 토큰');
  assert.equal(scaleAt(390).toFixed(3), '0.998', '390px ≈ 1.0');
  assert.equal(scaleAt(360).toFixed(3), '0.922', '360px ≈ 0.92');
  assert.equal(scaleAt(430), 1.1, '430px = 1.10');
  assert.equal(scaleAt(540), 1.1, '넓은 화면은 1.10에서 멈춘다');
  assert.equal(scaleAt(300), 0.8, '좁은 화면은 0.80에서 멈춘다');
});

test('HUD의 모든 길이(배지·HP·레일·하단 메뉴·액션·스킬 원·알약)가 토큰을 쓴다', () => {
  const tokens = [
    [hudStyles, '.level-badge', ['left', 'top', 'width', 'height']],
    [hudStyles, '.hero-name', ['top', 'height', 'max-width']],
    [hudStyles, '.hero-power', ['top', 'height']],
    [hudStyles, '.health-bar', ['top', 'left', 'width', 'height']],
    [hudStyles, '.utility-nav', ['right', 'gap']],
    [hudStyles, '.bottom-nav', ['left', 'bottom', 'gap']],
    [hudStyles, '.action-pad', ['right', 'bottom', 'width', 'height']],
    [hudStyles, '.action', ['width', 'height', 'border']],
    [hudStyles, '.action-attack', ['width', 'height']],
    [hudStyles, '.patch-buff-pill', ['left', 'top', 'padding', 'font']]
  ];
  for (const [styles, selector, properties] of tokens) {
    // 같은 선택자의 규칙이 여럿이면(미디어 쿼리 덧붙임) 그 속성을 모두 가진 본문을 쓴다.
    const bodies = [...styles.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g'))].map(match => match[1]);
    const body = bodies.filter(candidate => properties.every(property => candidate.includes(`${property}:`))).pop();
    assert.ok(body, `${selector} 규칙`);
    for (const property of properties) {
      const value = body.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1];
      assert.ok(value, `${selector} ${property} 값`);
      assert.match(value, /var\(--u\)/, `${selector} ${property}가 배율을 따른다`);
    }
  }
  // 손가락이 닿는 버튼만 터치 하한을 지킨다 — 나머지는 순수 비례.
  assert.match(ruleBody(hudStyles, '.utility-nav', '--rail-btn'), /--rail-btn: max\(34px, calc\(46 \* var\(--u\)\)\)/);
  assert.match(ruleBody(hudStyles, '.bottom-nav', '--nav-btn'), /--nav-btn: max\(40px, calc\(48 \* var\(--u\)\)\)/);
  // 상태 줄에 끼어 있던 옛 고정 px는 남기지 않는다(층 버튼·문맥 버튼·이름판).
  for (const selector of ['.floor-button', '.boss-retry', '.floor-return']) {
    const body = ruleBody(hudStyles, selector, 'min-height');
    assert.match(body, /min-height: calc\(30 \* var\(--u\)\)/, `${selector} 높이`);
    assert.match(body, /font-size: calc\(11 \* var\(--u\)\)/, `${selector} 글자`);
    // 여백·간격도 배율을 따른다(테두리·발광 같은 1px 선만 그대로 둔다).
    assert.match(body, /padding: calc\(2 \* var\(--u\)\)/, `${selector} 여백`);
    assert.match(body, /gap: calc\(\d+ \* var\(--u\)\)/, `${selector} 간격`);
  }
});

test('상태 줄은 한 줄 — 460px 미만은 문맥 버튼 아이콘만, 340px 미만은 처치 수도 접는다', () => {
  // 한 줄 유지의 뼈대: 줄바꿈 금지 + 층·보스·최고층 덩어리는 줄지 않는다.
  const main = ruleBody(hudStyles, '.status-main');
  assert.match(main, /flex-wrap: nowrap/);
  assert.match(ruleBody(hudStyles, '.status-floor', 'flex: none'), /flex: none/, '문맥 버튼 덩어리는 줄지 않는다');

  const narrow = hudStyles.match(/@media \(max-width: 459px\) \{([\s\S]*?)\n\}/);
  assert.ok(narrow, '460px 미만 규칙');
  assert.match(narrow[1], /\.status-main \.ctx-label \{ display: none; \}/, '글자를 접는다');
  assert.match(narrow[1], /\.boss-retry, \.floor-return \{ padding: calc\(2 \* var\(--u\)\) calc\(7 \* var\(--u\)\); \}/, '아이콘만 남은 폭에 맞춘 여백');
  assert.match(hudStyles, /@media \(max-width: 339px\) \{ \.floor-button \.kills \{ display: none; \} \}/, '340px 미만은 처치 수 접기');

  // 아이콘만 남아도 뜻이 남도록 마크업이 title·aria-label을 함께 들고 있다.
  const node = () => ({
    dataset: {}, style: { setProperty() {} }, classList: { toggle() {} }, textContent: '', hidden: false,
    addEventListener() {}, setAttribute() {}, prepend() {}, replaceChildren() {}, querySelector() { return null; }
  });
  const top = { innerHTML: '', querySelector() { return node(); } };
  const save = freshSave();
  save.floor = 4; save.maxFloor = 9;
  const ui = { world: new World(save), top, root: { querySelector: () => node() }, banner: node(), message() {}, get: () => node() };
  ui.world.bossRetryAvailable = true;
  renderStatus.call(ui);
  const html = ui.top.innerHTML;
  assert.match(html, /class="boss-retry" type="button" aria-label="최고층 9층 보스에게 다시 도전" title="최고층 9층 보스에게 다시 도전"><span aria-hidden="true">⚔<\/span><span class="ctx-label">보스 도전<\/span>/);
  assert.match(html, /class="floor-return" type="button" aria-label="최고층 9층으로 이동" title="최고층 9층으로 바로 이동"><span aria-hidden="true">▲<\/span><span class="ctx-label">최고층<\/span>/);
  assert.match(html, /<span class="kills"> · \d+\/\d+<\/span>/, '처치 수는 접을 수 있게 따로 감싼다');
});

test('버프 알약은 HP 바 아래 빈 자리로 내려가 레일·월드보스 원과 겹치지 않는다', () => {
  const pill = ruleBody(hudStyles, '.patch-buff-pill', 'position: absolute');
  const health = ruleBody(hudStyles, '.health-bar');
  const boss = ruleBody(worldBossStyles, '.world-boss-entry', 'top:calc(env(safe-area-inset-top, 0px) + 111 * var(--u))');

  const pillLeft = length(pill, 'left'), pillTop = length(pill, 'top');
  const healthTop = length(health, 'top'), healthHeight = length(health, 'height');
  const bossLeft = length(boss, 'left'), bossWidth = length(boss, 'width');
  const rail = ruleBody(hudStyles, '.utility-nav', '--rail-btn');
  const railRight = length(rail, 'right');
  const railButton = Number(rail.match(/--rail-btn: max\(\d+px, calc\((\d+) \* var\(--u\)\)\)/)[1]);
  assert.equal(length(rail, 'top'), 64, '레일은 safe-area + 64u에서 시작');

  assert.equal(pillLeft, 90, 'HP 바 아래 왼쪽에서 90u');
  assert.equal(pillTop, 115, 'HP 바(92~107u) 아래 8u 띄움');
  assert.ok(pillTop >= healthTop + healthHeight + 3, 'HP 바와 3u 이상 여유');
  assert.ok(pillLeft >= bossLeft + bossWidth, `왼쪽 월드보스 원(${bossLeft + bossWidth}u)을 비켜난다`);

  // 알약이 길어져도 우측 레일(오른쪽 8u + 버튼 46u) 앞에서 멈춘다 — 남는 폭에서만 말줄임.
  const maxWidth = pill.match(/max-width: calc\(100% - (\d+) \* var\(--u\)\)/);
  assert.ok(maxWidth, '알약 최대 폭은 토큰 기준');
  const pillRightLimit = pillLeft + Number(maxWidth[1]) - pillLeft; // 100% 폭 중 잘라 쓰는 양
  assert.ok(Number(maxWidth[1]) >= railRight + railButton, `알약이 레일(${railRight + railButton}u)까지 가지 않는다`);
  assert.equal(pillRightLimit, Number(maxWidth[1]));
  assert.match(pill, /pointer-events: none/, '누를 수 없는 표시');
  assert.match(ruleBody(hudStyles, '.patch-buff-pill .patch-buff-label'), /text-overflow: ellipsis/, '길면 말줄임');
  // 예전 오른쪽 위 자리(상태 줄·레일과 경쟁)는 남기지 않는다.
  assert.doesNotMatch(pill, /right: 62px/);
});
