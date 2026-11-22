import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { isDowngradeForHero, isUpgradeForHero, itemPower, pouchItem } = await import('../src/game/items.ts');
const {
  downgradeArrowMarkup, downgradeArrowNode, appendDowngradeArrow,
  DOWNGRADE_ARROW_CLASS, DOWNGRADE_ARROW_ART, DOWNGRADE_ARROW_COLOR, DOWNGRADE_ARROW_LABEL
} = await import('../src/ui/upgradeBadge.ts');
const { Journey } = await import('../src/game/journey.ts');

// 사용자 요청(2026-11-21) "장비창에 내꺼보다 수치 낮은 거는 빨간색으로 화살표 아래 표시" 및
// "장비창 중간에 있는 게 이름이랑 템이랑 글씨가 대칭이 안 되어 있어 정렬해줘",
// "주간보상·일일보상 들어오는 게 늦네 확인 필요" — 한 PR의 세 수정을 한 파일에서 고정한다.
const equipment = (slot, stats, extra = {}) => ({ id: `${slot}-${Math.random()}`, name: slot, slot, rarity: 'rare', stats, ...extra });
const sword = (stats) => equipment('weapon', stats, { name: '낡은 두손검' });
const bow = (stats) => equipment('weapon', stats, { name: '사냥꾼의 활' });
const book = () => ({ id: 'book', name: '[스킬북] 회전참격', slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'spin', stats: {} });

// ── 빨간 아래 화살표 판정 ───────────────────────────────────────────────────
test('같은 부위·같은 직업 장비가 지금 낀 것보다 약할 때만 다운그레이드다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { helmet: equipment('helmet', { defense: 20 }) };
  assert.equal(isDowngradeForHero(save, equipment('helmet', { defense: 10 })), true, '약하면 다운그레이드');
  assert.equal(isDowngradeForHero(save, equipment('helmet', { defense: 20 })), false, '같으면 어느 화살표도 아니다');
  assert.equal(isDowngradeForHero(save, equipment('helmet', { defense: 21 })), false, '세면 업그레이드 쪽이다');
  assert.equal(isUpgradeForHero(save, equipment('helmet', { defense: 21 })), true);
  save.equipment = {};
  assert.equal(isDowngradeForHero(save, equipment('helmet', { defense: 1 })), false, '빈 칸은 무엇이든 이득이라 다운그레이드가 아니다');
});

test('타직업 전용 장비·스킬북·보물 주머니에는 빨간 화살표를 달지 않는다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { weapon: sword({ attack: 50 }) };
  assert.equal(isDowngradeForHero(save, bow({ attack: 1 })), false, '전사는 활을 낄 수 없다 — 비교 자체가 뜻이 없다');
  assert.equal(isDowngradeForHero(save, sword({ attack: 10 })), true);
  assert.equal(isDowngradeForHero(save, book()), false);
  assert.equal(isDowngradeForHero(save, pouchItem('pouch-1')), false);
  const archer = freshSave('female', 'archer');
  archer.equipment = { weapon: bow({ attack: 50 }) };
  assert.equal(isDowngradeForHero(archer, sword({ attack: 1 })), false, '궁수에게 대검은 장착 불가');
});

test('반지는 약한 쪽(또는 빈 칸)보다 약할 때만 다운그레이드다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { ring1: equipment('ring1', { attack: 30 }), ring2: equipment('ring2', { attack: 10 }) };
  assert.equal(isDowngradeForHero(save, equipment('ring1', { attack: 5 })), true, '약한 반지(10)보다 약하다');
  assert.equal(isDowngradeForHero(save, equipment('ring1', { attack: 10 })), false, '약한 반지와 같으면 바꿔도 손해가 아니다');
  assert.equal(isDowngradeForHero(save, equipment('ring1', { attack: 20 })), false, '약한 반지보다 세면 업그레이드 쪽');
  delete save.equipment.ring2;
  assert.equal(isDowngradeForHero(save, equipment('ring2', { attack: 1 })), false, '빈 반지 칸이 있으면 무엇이든 업그레이드다');
});

test('업그레이드와 다운그레이드는 서로 배타적이다(한 칸에 화살표 두 개가 붙지 않는다)', () => {
  const save = freshSave('male', 'warrior');
  const worn = equipment('armor', { defense: 20 });
  save.equipment = { armor: worn };
  const items = [
    equipment('armor', { defense: 20 }, { rarity: 'epic' }),
    equipment('armor', { defense: 20 }, { rarity: 'common' }),
    equipment('armor', { defense: 21 }),
    equipment('armor', { defense: 19 }),
    equipment('armor', { defense: 20 })
  ];
  for (const item of items) {
    assert.equal(isUpgradeForHero(save, item) && isDowngradeForHero(save, item), false, `${itemPower(item)} 전투력이 두 화살표를 함께 받지 않는다`);
  }
});

// ── 빨간 아래 화살표 마크업·요소 ────────────────────────────────────────────
test('빨간 화살표는 180° 뒤집은 같은 셰브론 PNG를 쓴다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { helmet: equipment('helmet', { defense: 50 }) };
  const markup = downgradeArrowMarkup(save, equipment('helmet', { defense: 5 }));
  assert.match(markup, new RegExp(`class="${DOWNGRADE_ARROW_CLASS}"`));
  assert.match(markup, new RegExp(`src="${DOWNGRADE_ARROW_ART.replace(/[/.]/g, '\\$&')}"`), 'PNG 경로');
  assert.match(markup, /aria-hidden="true"/, '낭독기에는 카드 라벨로 알린다');
  assert.match(markup, new RegExp(`title="${DOWNGRADE_ARROW_LABEL}"`));
  assert.equal(DOWNGRADE_ARROW_CLASS, 'downgrade-arrow');
  assert.equal(DOWNGRADE_ARROW_COLOR, '#f87171', '빨간색(#f87171)');
  assert.equal(DOWNGRADE_ARROW_LABEL, '지금 장착한 장비보다 약한 장비');
  assert.equal(downgradeArrowMarkup(save, equipment('helmet', { defense: 500 })), '', '더 좋은 장비에는 붙지 않는다');
  assert.equal(downgradeArrowMarkup(save, book()), '', '스킬북은 빈 문자열');
});

test('DOM 없이도 요소를 만들고 붙일 수 있다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { helmet: equipment('helmet', { defense: 50 }) };
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ className: '', src: '', alt: '', title: '', draggable: true, attrs: {}, children: [], setAttribute(name, value) { this.attrs[name] = value; }, append(child) { this.children.push(child); } }) };
    const node = downgradeArrowNode();
    assert.equal(node.className, DOWNGRADE_ARROW_CLASS);
    assert.equal(node.src, DOWNGRADE_ARROW_ART);
    assert.equal(node.alt, '', '장식용 이미지');
    assert.equal(node.attrs['aria-hidden'], 'true');
    const host = { children: [], append(child) { this.children.push(child); } };
    assert.equal(appendDowngradeArrow(host, save, equipment('helmet', { defense: 1 })), true);
    assert.equal(host.children.length, 1);
    assert.equal(appendDowngradeArrow(host, save, equipment('helmet', { defense: 51 })), false, '더 좋은 장비에는 붙이지 않는다');
  } finally { globalThis.document = previous; }
});

test('빨간 화살표 PNG는 투명 64×64이고 초록 화살표와 다른 파일이다', () => {
  const red = readFileSync(new URL('../public/assets/icons/downgrade-arrow-slim.png', import.meta.url));
  const green = readFileSync(new URL('../public/assets/icons/upgrade-arrow-slim.png', import.meta.url));
  assert.equal(red.toString('ascii', 1, 4), 'PNG');
  assert.equal(red.readUInt32BE(16), 64);
  assert.equal(red.readUInt32BE(20), 64);
  assert.equal(red[25], 6, 'RGBA(컬러 타입 6) — 배경이 투명하다');
  assert.equal(red.equals(green), false, '원본 초록 화살표를 덮어쓰지 않고 따로 구웠다');
  assert.equal(green.toString('ascii', 1, 4), 'PNG', '원본은 그대로 남아 있다');
});

// ── 화면 배선·CSS ────────────────────────────────────────────────────────
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const warehouseSource = readFileSync(new URL('../src/ui/modals/warehouseModal.ts', import.meta.url), 'utf8');
const modalCss = modalStyles();

function rule(source, selector) {
  const index = source.indexOf(`${selector} {`);
  assert.notEqual(index, -1, `${selector} 규칙이 없다`);
  return source.slice(index, source.indexOf('}', index) + 1);
}

test('가방·공용창고가 같은 판정 헬퍼로 빨간 화살표를 붙인다', () => {
  assert.match(equipSource, /import \{ downgradeArrowMarkup, upgradeArrowMarkup \} from '\.\.\/upgradeBadge'/);
  assert.match(equipSource, /const downgrade = downgradeArrowMarkup\(save, item\);/);
  assert.match(equipSource, /if \(downgrade\) cell\.classList\.add\('has-downgrade'\);/);
  assert.match(equipSource, /지금 장착한 장비보다 약함/);
  assert.match(warehouseSource, /const downgrade = downgradeArrowMarkup\(ui\.world\.save, item\);/);
  assert.match(warehouseSource, /if \(downgrade\) cell\.classList\.add\('has-downgrade'\);/);
  assert.match(warehouseSource, /지금 장착한 장비보다 약함/);
});

test('빨간 화살표는 초록 화살표와 같은 우측 상단에 작게(9px 이하) + 빨간 발광', () => {
  const arrow = rule(modalCss, '.downgrade-arrow');
  assert.match(arrow, /position: absolute/);
  assert.match(arrow, /top: 2px/);
  assert.match(arrow, /right: 2px/);
  assert.match(arrow, /width: clamp\(7px, 1\.9vw, 9px\)/, '초록 화살표와 같은 크기');
  assert.match(arrow, /drop-shadow\(0 0 3px rgba\(248, 113, 113, \.85\)\)/);
  assert.match(arrow, /drop-shadow\(0 0 6px rgba\(220, 38, 38, \.5\)\)/);
  assert.match(arrow, /pointer-events: none/);
  // 잠금 배지가 함께 있는 칸은 초록 화살표와 같이 잠금만 아래로 내린다.
  assert.match(rule(modalCss, '.bag-item.has-downgrade .bag-lock-badge'), /bottom: 1px/);
});

test('장착 칸 부위 이름은 아이콘과 같은 중심에 서고 `+N`만 이름 줄 위로 올라간다', () => {
  const part = rule(modalCss, '.equipment-slot .slot-part');
  assert.match(part, /grid-row: 2/);
  assert.doesNotMatch(part, /padding/, '왼쪽만 비우면 이름이 아이콘 중심에서 6.5px 밀린다');
  assert.match(rule(modalCss, '.equipment-slot .item-plus-badge'), /bottom: 13px/);
});

test('장비창 중간 요약(레벨·층·경험치·금화)이 아래 스탯 표와 같은 두 열에 선다', () => {
  const summary = rule(modalCss, '.equipment-summary');
  assert.match(summary, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(summary, /gap: 3px/, '스탯 표와 같은 열 간격');
  assert.match(summary, /padding: 4px 0/, '좌우 여백은 칸이 갖는다(표와 같은 세로줄)');
  assert.match(summary, /outline: 1px solid/, '테두리는 레이아웃 폭을 먹지 않는 outline');
  assert.doesNotMatch(summary, /border:/);
  const stats = rule(modalCss, '.equipment-info-stats');
  assert.match(stats, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(stats, /gap: 3px/);
  const cell = rule(modalCss, '.equipment-summary > span');
  assert.match(cell, /justify-content: space-between/, '라벨은 왼쪽, 값은 오른쪽');
  assert.match(cell, /padding: 0 6px/);
  assert.match(rule(modalCss, '.equipment-summary .is-value'), /justify-content: flex-end/);
  // 렌더 쪽도 같은 구조로 그린다.
  assert.match(equipSource, /<span><small>LV<\/small><b>/);
  assert.match(equipSource, /class="is-value"><b>\$\{save\.floor\}층<\/b>/);
  assert.match(equipSource, /class="summary-gold">\$\{goldMarkup\(save\.gold\)\}<em>· 강화석 \$\{save\.stones\}<\/em>/);
});

// ── 일일·주간 진행 즉시 반영 ───────────────────────────────────────────────
const listBody = { daily: [], weekly: [], achievements: [], mail: [], periods: {}, now: 1 };

test('여정 목록은 읽기 전에 이 기기의 저장을 먼저 흘려보낸다', async () => {
  const original = globalThis.fetch, order = [];
  try {
    const save = freshSave();
    let release;
    const sync = {
      save, session: { token: 't', characterSlot: 1 }, revision: 1,
      flushIfDirty: async () => { order.push('flush'); await new Promise(resolve => { release = resolve; }); order.push('flush-done'); return true; }
    };
    globalThis.fetch = async () => { order.push('fetch'); return { ok: true, status: 200, json: async () => listBody }; };
    const journey = new Journey(sync, { save, player: { hp: 100 }, onChange() {} });
    const request = journey.load();
    assert.deepEqual(order, ['flush'], '저장이 끝나기 전에는 목록을 읽지 않는다');
    release();
    await request;
    assert.deepEqual(order, ['flush', 'flush-done', 'fetch'], '저장 → 조회 순서');
    assert.equal(journey.loading, false);
    assert.equal(journey.error, '');
  } finally { globalThis.fetch = original; }
});

test('저장이 막혀 있어도(가방 가득·거래 중) 목록 조회는 그대로 된다', async () => {
  const original = globalThis.fetch, requests = [];
  try {
    const save = freshSave();
    const sync = { save, session: { token: 't', characterSlot: 1 }, revision: 1, flushIfDirty: async () => false };
    globalThis.fetch = async () => { requests.push('list'); return { ok: true, status: 200, json: async () => listBody }; };
    const journey = new Journey(sync, { save, player: { hp: 100 }, onChange() {} });
    await journey.load();
    assert.equal(requests.length, 1);
    assert(journey.data, '목록을 받았다');
    assert.equal(journey.error, '');
  } finally { globalThis.fetch = original; }
});

test('여정 창은 열 때 저장을 먼저 흘려보내고, 배경 조회는 2분 간격이다', () => {
  const registry = readFileSync(new URL('../src/ui/modalRegistry.ts', import.meta.url), 'utf8');
  const start = registry.indexOf('const journeyLoad');
  assert.notEqual(start, -1, 'journeyLoad가 없다');
  const body = registry.slice(start, registry.indexOf('};', start));
  assert.match(body, /await ui\.journey\.sync\.flushIfDirty\(\);/);
  assert.match(body, /await ui\.journey\.load\(\);/);
  assert.ok(body.indexOf('flushIfDirty') < body.indexOf('ui.journey.load()'), '저장이 조회보다 먼저다');
  for (const kind of ['mail', 'rewards', 'achievements']) {
    const spec = registry.slice(registry.indexOf(`  ${kind}: {`));
    assert.match(spec.slice(0, 400), /load: journeyLoad/, `${kind} 창이 같은 입구를 쓴다`);
  }
  const wiring = readFileSync(new URL('../src/ui/interfaceWiring.ts', import.meta.url), 'utf8');
  assert.match(wiring, /window\.setInterval\(\(\) => \{ if \(!document\.hidden\) void ui\.journey\.load\(\); \}, 120000\)/);
  assert.doesNotMatch(wiring, /300000/, '5분 간격은 사라졌다');
});
