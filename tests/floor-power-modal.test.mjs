import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

// 「층 선택」 10층 구간 아코디언 + 권장 전투력(밸런스 v2).
// 권장값은 별도 표가 아니라 지금 층 곡선(`enemyMaxHp`·`enemyHitDamage`·`swarmCount`)에서 나온다.
const F = await import('../src/game/floorPower.ts');
const { renderFloor, resetFloorGroups, FARM_LOSS_BADGE_PCT } = await import('../src/ui/modals/floorModal.ts');
const { bestFarmFloor, killsPerHourAt } = await import('../src/game/offline.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { basicAttackPower, CRIT_DAMAGE_SCALE, enemyMaxHp } = await import('../src/game/battle/formulas.ts');
const { MAX_FLOOR } = await import('../src/game/progress.ts');
const css = modalStyles();

class Node {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attributes = {}; this.className = '';
    this.textContent = ''; this._html = ''; this.hidden = false; this.disabled = false;
    this.type = ''; this.onclick = null; this.id = '';
    const self = this;
    const classes = () => self.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add(...names) { for (const name of names) if (!classes().includes(name)) self.className = [...classes(), name].join(' '); },
      remove(...names) { self.className = classes().filter(name => !names.includes(name)).join(' '); },
      contains(name) { return classes().includes(name); },
      toggle(name, force) {
        const want = force === undefined ? !classes().includes(name) : !!force;
        if (want) this.add(name); else this.remove(name);
        return want;
      }
    };
  }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html; }
  append(...nodes) { for (const node of nodes) this.children.push(node); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const visit = node => [node, ...node.children.flatMap(child => (child && typeof child === 'object' ? visit(child) : []))];
const hasClass = (node, name) => (node.className || '').split(/\s+/).includes(name);
const withDocument = run => {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => new Node(tag), createTextNode: text => ({ textContent: text }) };
  try { return run(); } finally { globalThis.document = original; }
};
const fixture = save => {
  const ui = {
    world: { save, onChange() {}, travelToFloor(floor) { this.moved = floor; return { ok: true, message: `${floor}층으로 이동했습니다.` }; } },
    messages: [], opened: [],
    message(text) { this.messages.push(text); },
    open(kind) { this.opened.push(kind); }
  };
  return ui;
};
const power = save => F.combatPower(totalStats(save));

test('권장 전투력은 그 층 몹 곡선에서 나오고 1층은 장비 없는 새 캐릭터와 같다', () => {
  // 1층은 입문 완화 구간이라 기준 빌드가 기본 스탯 그대로다 — 새 캐릭터가 곧 `적정`이다.
  assert.equal(F.recommendedFloorPower(1), F.combatPower(F.baseStats(1)), '1층 권장값 = 장비 없는 1레벨');
  assert.equal(F.recommendedFloorPower(1), 68);
  let previous = 0;
  for (let floor = 1; floor <= MAX_FLOOR; floor++) {
    const value = F.recommendedFloorPower(floor);
    assert.ok(Number.isInteger(value), `${floor}층은 정수`);
    assert.ok(value >= previous, `${floor}층 권장값이 내려갔다`);
    previous = value;
  }
  assert.ok(F.recommendedFloorPower(MAX_FLOOR) > F.recommendedFloorPower(1) * 10, '20층은 1층보다 훨씬 높다');
  // 기준 빌드의 공격력은 그 층 몹을 `KILL_HITS`대 안에 잡는다(권장값이 몹 곡선을 따라간다는 증거).
  const crit = 1 + F.REFERENCE_CRIT / 100 * (CRIT_DAMAGE_SCALE - 1);
  for (const floor of [1, 5, 10, 15, 20]) {
    const attack = F.recommendedBuild(floor).attack;
    assert.ok(enemyMaxHp(floor, false) / (attack * basicAttackPower * crit) <= F.KILL_HITS + 1e-9, `${floor}층 ${F.KILL_HITS}타`);
  }
  // 층 범위를 벗어난 값은 경계로 다듬는다.
  assert.equal(F.recommendedFloorPower(0), F.recommendedFloorPower(1));
  assert.equal(F.recommendedFloorPower(Number.NaN), F.recommendedFloorPower(1));
  assert.equal(F.recommendedFloorPower(MAX_FLOOR + 5), F.recommendedFloorPower(MAX_FLOOR));
});

test('여유·적정·위험은 권장값 대비 배율로 갈린다', () => {
  for (const floor of [1, 7, 12, 20]) {
    const recommended = F.recommendedFloorPower(floor);
    assert.equal(F.floorPowerState(recommended * F.EASY_RATIO, floor), 'easy');
    assert.equal(F.floorPowerState(recommended * (F.EASY_RATIO - .05), floor), 'okay');
    assert.equal(F.floorPowerState(recommended, floor), 'okay');
    assert.equal(F.floorPowerState(recommended * F.DANGER_RATIO, floor), 'okay');
    assert.equal(F.floorPowerState(recommended * (F.DANGER_RATIO - .05), floor), 'danger');
    assert.equal(F.floorPowerState(0, floor), 'danger');
  }
  // 새 캐릭터는 1층에서 `적정` — 시작 층이 빨간 카드가 되면 안 된다.
  assert.equal(F.floorPowerState(F.combatPower(F.baseStats(1)), 1), 'okay');
});

test('★ 추천 층은 위험하지 않은 가장 깊은 층이고 최고 층을 넘지 않는다', () => {
  assert.equal(F.recommendedFloorFor(0), 1, '아무 층도 못 넘으면 1층');
  assert.equal(F.recommendedFloorFor(1e9), MAX_FLOOR, '최고 층까지만');
  assert.equal(F.recommendedFloorFor(1e9, 7), 7, '최고 층이 7층이면 7층까지');
  for (const value of [68, 150, 320, 640, 1000, 1500, 2600]) {
    const floor = F.recommendedFloorFor(value);
    assert.notEqual(F.floorPowerState(value, floor), 'danger', `${value}: 추천 층은 위험이 아니다`);
    if (floor < MAX_FLOOR) assert.equal(F.floorPowerState(value, floor + 1), 'danger', `${value}: 한 층 위는 위험`);
  }
});

test('구간은 10층 단위로 MAX_FLOOR까지만 만든다', () => {
  const groups = F.floorGroups();
  assert.deepEqual(groups.map(group => group.label), ['1~10층', '11~20층', '21~30층', '31~40층']);
  assert.deepEqual(groups.map(group => [group.lo, group.hi]), [[1, 10], [11, 20], [21, 30], [31, 40]]);
  assert.equal(F.groupStart(1), 1);
  assert.equal(F.groupStart(10), 1);
  assert.equal(F.groupStart(11), 11);
  assert.equal(F.groupStart(20), 11);
  const range = F.groupPowerRange(groups[1]);
  assert.equal(range.lo, F.recommendedFloorPower(11));
  assert.equal(range.hi, F.recommendedFloorPower(20));
});

test('창은 내 전투력·시간당 최다 층을 보여 주고 그 층 구간만 펼친다', () => withDocument(() => {
  resetFloorGroups();
  const save = freshSave(); save.level = 12; save.floor = 8; save.maxFloor = 12;
  const ui = fixture(save);
  const dialog = new Node();
  renderFloor.call(ui, dialog);
  const mine = power(save);
  const bestFloor = bestFarmFloor(save);
  const bestRate = killsPerHourAt(save, bestFloor);
  const nodes = visit(dialog);

  const banner = nodes.find(node => hasClass(node, 'floor-power'));
  assert.ok(banner, '상단 배너');
  assert.match(banner.children[0].innerHTML, /내 전투력 <b>[\d,]+<\/b>/);
  // 1안: `★ 추천`은 전투력이 아니라 **시간당 처치가 가장 많은 층**이다.
  assert.equal(banner.children[1].textContent, `★ 추천 ${bestFloor}층`);
  const tip = nodes.find(node => hasClass(node, 'floor-farm-tip'));
  assert.ok(tip, '배너 아래 한 줄');
  assert.match(tip.textContent, /^⏱ \d+층 [\d,]+마리\/시간 — 지금 스펙에서 가장 빠른 층$/);
  assert(tip.textContent.includes(`${bestFloor}층 ${bestRate.toLocaleString('ko-KR')}마리/시간`));

  const sections = nodes.filter(node => hasClass(node, 'floor-group'));
  assert.equal(sections.length, 4, '1~10층·11~20층·21~30층·31~40층 네 구간');
  for (const section of sections) {
    const head = section.children[0], grid = section.children[1];
    const shouldOpen = section.children[1].id === `floor-group-${F.groupStart(bestFloor)}`;
    assert.equal(grid.hidden, !shouldOpen, shouldOpen ? '가장 빠른 층 구간을 펼친다' : '접는다');
    assert.equal(head.attributes['aria-expanded'], String(shouldOpen));
    assert.equal(grid.children.length, 10, '구간마다 10칸');
    assert.equal(head.attributes['aria-controls'], grid.id);
    assert.doesNotMatch(head.innerHTML, /내 권장 층 포함/, '전투력 기준 표시는 1안에서 뺐다');
    assert.match(head.innerHTML, /권장 [\d,]+ ~ [\d,]+/, '구간 머리에 권장 전투력 범위는 남는다');
  }

  // 카드: 층 이름 · (보스 왕관) · (★ 최다 / 현재) · 상태 + `시간당 N 마리` (+▼N%).
  const cards = nodes.filter(node => hasClass(node, 'floor-card'));
  assert.equal(cards.length, MAX_FLOOR, '층 1~40 전부');
  for (const card of cards) {
    assert.match(card.innerHTML, /<b>\d+층<\/b>/);
    assert.match(card.innerHTML, /<span class="floor-card-state">(여유|적정|위험)<\/span>/);
    assert.match(card.innerHTML, /<span class="floor-card-rate"><small>시간당<\/small><strong>[\d,]+<\/strong><small>마리<\/small>/, '시간당 처치 줄');
    assert.doesNotMatch(card.innerHTML, /권장 전투력<\/small>/, '카드에서 권장 전투력은 빠졌다');
    assert.match(card.innerHTML, /<span class="floor-card-head">/, '머리 줄');
  }
  for (const floor of [5, 10, 15, 20]) assert.match(cards[floor - 1].innerHTML, /👑/, `${floor}층 왕관`);
  assert.doesNotMatch(cards[0].innerHTML, /👑/, '1층은 왕관 없음');

  // `★ 최다`는 가장 빠른 층 카드 하나에만, `▼N%`는 손해가 큰 층에만.
  const bestCards = cards.filter(card => card.innerHTML.includes('★ 최다'));
  assert.equal(bestCards.length, 1, '★ 최다는 하나');
  assert.equal(Number(bestCards[0].innerHTML.match(/<b>(\d+)층<\/b>/)[1]), bestFloor);
  for (const card of cards) {
    const floor = Number(card.innerHTML.match(/<b>(\d+)층<\/b>/)[1]);
    const rate = killsPerHourAt(save, floor), loss = Math.round((1 - rate / bestRate) * 100);
    const badge = card.innerHTML.includes('floor-card-loss');
    assert.equal(badge, loss >= FARM_LOSS_BADGE_PCT, `${floor}층 손해 배지(${loss}%)`);
    if (badge) assert.match(card.innerHTML, new RegExp(`▼${loss}%`), `${floor}층 손해율`);
  }

  // 현재 층 배지와 잠긴 층(최고 층 위) 처리.
  const current = cards[save.floor - 1];
  assert.match(current.innerHTML, /class="floor-card-badge">현재</);
  assert.equal(current.attributes['aria-current'], 'location');
  assert.ok(hasClass(current, 'current'));
  for (const card of cards) {
    const floor = Number(card.innerHTML.match(/<b>(\d+)층<\/b>/)[1]);
    assert.equal(hasClass(card, 'locked'), floor > save.maxFloor, `${floor}층 잠금 여부`);
    assert.equal(card.disabled, floor > save.maxFloor);
  }
  // 상태 색은 카드 클래스로만 정한다(권장 전투력 판정 그대로).
  for (const card of cards) {
    const state = card.innerHTML.match(/floor-card-state">(여유|적정|위험)/)[1];
    assert.ok(hasClass(card, { 여유: 'easy', 적정: 'okay', 위험: 'danger' }[state]), `${state} 카드 클래스`);
  }
}));

test('구간 머리를 누르면 접히고 펼쳐지며, 층 카드를 누르면 그 층으로 이동한다', () => withDocument(() => {
  resetFloorGroups();
  const save = freshSave(); save.level = 12; save.floor = 3; save.maxFloor = 20;
  const ui = fixture(save);
  const dialog = new Node();
  renderFloor.call(ui, dialog);
  const nodes = visit(dialog);
  const sections = nodes.filter(node => hasClass(node, 'floor-group'));
  const collapsed = sections.find(section => section.children[1].hidden);
  assert.ok(collapsed, '접힌 구간이 하나 있다');
  const head = collapsed.children[0], grid = collapsed.children[1];
  head.onclick();
  assert.equal(grid.hidden, false, '누르면 펼친다');
  assert.equal(head.attributes['aria-expanded'], 'true');
  assert.ok(hasClass(collapsed, 'open'));
  head.onclick();
  assert.equal(grid.hidden, true, '다시 누르면 접힌다');

  const card = nodes.filter(node => hasClass(node, 'floor-card')).find(node => !hasClass(node, 'locked') && !hasClass(node, 'current'));
  card.onclick();
  assert.equal(ui.world.moved, Number(card.innerHTML.match(/<b>(\d+)층<\/b>/)[1]), '누른 층으로 이동');
  assert.deepEqual(ui.opened, [null], '이동하면 창을 닫는다');
  assert.match(ui.messages.at(-1), /층으로 이동했습니다/);
}));

test('층 카드는 2열 같은 높이이고 상태별 색과 시간당 처치·손해 배지를 CSS가 정한다', () => {
  assert.match(css, /\.floor-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.floor-grid\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.floor-card \{[^}]*min-height: 52px/, '카드 높이 52px — 20장이 한 화면에 들어온다');
  for (const state of ['easy', 'okay', 'danger']) assert.ok(css.includes(`.floor-card.${state} {`), `${state} 카드 색`);
  assert.match(css, /\.floor-card-rate \{[^}]*display: flex/, '시간당 처치 줄');
  assert.match(css, /\.floor-card-loss \{[^}]*margin-left: auto/, '손해 배지는 오른쪽');
  assert.match(css, /\.floor-card-loss\.danger \{[^}]*color: #ff6f61/, '큰 손해는 붉게');
  assert.match(css, /\.floor-card-badge\.best \{[^}]*border-color: #d9c186/, '★ 최다 배지');
  assert.match(css, /\.floor-farm-tip \{[^}]*border-left: 3px solid #6f9f5a/, '배너 아래 초록 한 줄');
  assert.match(css, /\.floor-group\.open \.floor-group-caret \{ transform: rotate\(90deg\); \}/, '펼친 구간 화살표');
  assert.match(css, /\.floor-power-rec \{[^}]*border-radius: 999px/, '추천 층 배지');
});
