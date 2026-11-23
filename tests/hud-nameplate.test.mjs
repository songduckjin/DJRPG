import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// 작업 265 — 레벨 배지 아래 닉네임을 옵션 2 `다크 이름판`(`전사 │ 모험가` 한 줄)으로 바꾼다.
// renderStatus가 직업 이름을 `data-job`에 넣고, hud.css의 `::before`가 그 값을 금빛 태그로 그린다.
const { renderStatus } = await import('../src/ui/hud.ts');
const { freshSave } = await import('../src/game/store.ts');

const hudSource = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
const hudStyles = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');

function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    addEventListener() {}, removeEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove() {}, toggle(name, on) { if (on) this.className += ` ${name}`; } };
  return node;
}

/** 좌상단 HUD만 흉내 내는 최소 UI — renderStatus가 만지는 자리만 돌려준다. */
function hud() {
  const heroName = element('span');
  const nodes = {
    '.hero-name': heroName,
    '.level-badge': element('button'),
    '.floor-button': element('button'),
    '.hp': element('div'),
    '.hp b': element('b')
  };
  const ui = {
    top: element('div'), banner: element('div'),
    world: { save: freshSave('male', 'warrior'), player: { hp: 80 } },
    get(selector) { return nodes[selector]; }
  };
  return { ui, heroName };
}

/** `.hero-name` 규칙 하나의 본문을 CSS에서 꺼낸다(뒤에 덧붙은 규칙이 있으면 마지막 것을 쓴다). */
function ruleBody(selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const found = [...hudStyles.matchAll(pattern)];
  assert.ok(found.length, `${selector} 규칙이 있다`);
  return found[found.length - 1][1];
}

const px = (body, pattern) => {
  const value = body.match(pattern);
  assert.ok(value, `값이 있다: ${pattern}`);
  return Number(value[1]);
};
/** `calc(N * var(--u))` → N. HUD 길이는 폭 비례 토큰을 쓰므로 390px 기준값으로 비교한다(옛 Npx도 읽는다). */
const u = (body, property) => {
  const found = body.match(new RegExp(`${property}:\\s*calc\\(([\\d.]+) \\* var\\(--u\\)\\)`)) ?? body.match(new RegExp(`${property}:\\s*([\\d.]+)px`));
  assert.ok(found, `${property} 길이`);
  return Number(found[1]);
};

test('이름판의 직업 태그는 data-job으로만 넣고, 직업을 바꾸면 다음 렌더에서 바로 바뀐다(작업 265)', () => {
  const { ui, heroName } = hud();
  renderStatus.call(ui);
  assert.equal(heroName.textContent, '모험가', '닉네임은 textContent로 넣는다');
  assert.equal(heroName.dataset.job, '전사', '기본 직업(전사) 태그');

  for (const [job, label] of [['archer', '궁수'], ['mage', '마법사'], ['warrior', '전사']]) {
    ui.world.save.job = job;
    renderStatus.call(ui);
    assert.equal(heroName.dataset.job, label, `${job} → ${label}`);
    assert.equal(heroName.textContent, '모험가', '직업이 바뀌어도 닉네임은 그대로');
  }

  // 예전 세이브·알 수 없는 직업 값은 전사로 떨어진다(jobOrDefault).
  ui.world.save.job = undefined;
  renderStatus.call(ui);
  assert.equal(heroName.dataset.job, '전사', '직업 값이 없으면 전사');
});

test('직업 태그는 HTML이 아니라 data-job 속성으로 넘긴다 — 닉네임·직업 모두 textContent·attr 경로(작업 265)', () => {
  assert.match(hudSource, /heroName\.dataset\.job = jobLabel/, 'dataset으로만 직업을 넘긴다');
  assert.match(hudSource, /const jobLabel = jobNames\[jobOrDefault\(save\.job\)\]/, '직업 이름은 jobNames 표에서 온다');
  assert.doesNotMatch(hudSource, /heroName\.innerHTML/, '닉네임 자리에 innerHTML을 쓰지 않는다');
  assert.match(ruleBody('.hero-name::before'), /content: attr\(data-job\)/, 'CSS가 data-job을 그린다');

  // 특수문자가 든 닉네임도 그대로 남고, 읽기 이름에는 직업과 닉네임이 함께 들어간다.
  const { ui, heroName } = hud();
  ui.world.save.name = '<b>전사</b>&';
  ui.world.save.job = 'archer';
  renderStatus.call(ui);
  assert.equal(heroName.textContent, '<b>전사</b>&', '태그로 해석되지 않는다');
  assert.equal(heroName.dataset.job, '궁수');
  assert.equal(heroName.attrs['aria-label'], '캐릭터 닉네임 · 궁수 <b>전사</b>&');

  // 이름이 비면 기본 이름을 쓴다.
  ui.world.save.name = '   ';
  renderStatus.call(ui);
  assert.equal(heroName.textContent, '모험가');
  assert.equal(heroName.attrs['aria-label'], '캐릭터 닉네임 · 궁수 모험가');
});

test('이름판은 다크 필 + 1px 금빛 테두리 + 위쪽 하이라이트, 13px 닉네임 한 줄(작업 265)', () => {
  const pill = ruleBody('.hero-name');
  assert.match(pill, /border: 1px solid #d6af7288/, '1px 금빛 테두리');
  assert.match(pill, /box-shadow:[^;]*inset 0 1\.5px 0 #f6d28e55/, '위쪽 1.5px 금빛 하이라이트');
  assert.match(pill, /background: #120c12ad/, '반투명 다크 필(약 68%)');
  assert.match(pill, /font: 700 calc\(13 \* var\(--u\)\)\//, '13u(390px에서 13px) 굵은 닉네임');
  assert.match(pill, /color: #fff0d2/, '따뜻한 흰색 글자');
  assert.match(pill, /max-width: calc\(140 \* var\(--u\)\)/, '폭 상한 140u');
  assert.equal(u(pill, 'height'), 17.6, '높이 17.6u');
  assert.match(pill, /padding: 0 calc\(6 \* var\(--u\)\) 0 calc\(5 \* var\(--u\)\)/, '오른쪽 여백 6u');
  assert.match(pill, /overflow: hidden/, '넘치는 닉네임은 자른다');
  assert.match(pill, /text-overflow: ellipsis/, '긴 닉네임은 줄임표');
  assert.match(pill, /pointer-events: none/, '배지 클릭을 가로막지 않는다');
  assert.match(pill, /white-space: nowrap/, '한 줄');

  const tag = ruleBody('.hero-name::before');
  assert.match(tag, /font-size: calc\(7\.6 \* var\(--u\)\)/, '직업 태그 7.6u');
  assert.match(tag, /color: #eec57a/, '금빛 직업 태그');
  assert.match(tag, /border-right: 1px solid #d6af7280/, '태그와 닉네임 사이 얇은 구분선');
  assert.match(tag, /margin-right: calc\(5 \* var\(--u\)\); padding-right: calc\(5 \* var\(--u\)\)/, '구분선 좌우 여백');
});

test('이름판은 레벨 배지 아래·HP 바 위에 3px 이상 여유를 두고 들어간다(작업 234·265)', () => {
  const badge = ruleBody('.level-badge');
  const name = ruleBody('.hero-name');
  const health = ruleBody('.health-bar');
  const badgeTop = u(badge, 'top'), badgeHeight = u(badge, 'height');
  const nameTop = u(name, 'top'), nameHeight = u(name, 'height');
  const healthTop = u(health, 'top');
  assert.ok(nameTop >= badgeTop + badgeHeight, `이름판(${nameTop}u)은 배지 원(${badgeTop + badgeHeight}u) 아래`);
  assert.ok(healthTop - (nameTop + nameHeight) >= 3, `HP 바(${healthTop}u)와 이름판 아래(${nameTop + nameHeight}u) 사이 3u 이상`);
  assert.match(name, /left: calc\(12 \* var\(--u\)\)/, '배지 왼쪽에 맞춘다');
  // 가장 좁은 화면(320px)에서도 140px 상한이면 화면 안에 남는다.
  assert.ok(12 + 140 < 320, '폭 상한이 화면 밖으로 나가지 않는다');
  assert.doesNotMatch(hudStyles, /\.hero-name \{[^}]*translateX\(-50%\)/, '오른쪽으로만 늘어난다');
});
