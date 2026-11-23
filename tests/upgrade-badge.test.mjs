import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { isUpgradeForHero, itemPower, pouchItem } = await import('../src/game/items.ts');
const { upgradeArrowMarkup, upgradeArrowNode, appendUpgradeArrow, UPGRADE_ARROW_CLASS, UPGRADE_ARROW_ART, UPGRADE_ARROW_COLOR, UPGRADE_ARROW_LABEL } = await import('../src/ui/upgradeBadge.ts');

// [작업 241] 업그레이드 초록 화살표 — 가방·공용창고·거래소에서 **내 직업이 낄 수 있는 장비 중
// 현재 착용보다 좋은 장비**에만 붙는다. 판정은 `isUpgradeForHero` 한 곳.
const equipment = (slot, stats, extra = {}) => ({ id: `${slot}-${Math.random()}`, name: slot, slot, rarity: 'rare', stats, ...extra });
const sword = (stats, name = '낡은 두손검') => equipment('weapon', stats, { name });
const bow = (stats) => equipment('weapon', stats, { name: '사냥꾼의 활' });
const staff = (stats) => equipment('weapon', stats, { name: '견습생의 지팡이' });
const book = (name = '[스킬북] 회전참격') => ({ id: 'book', name, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'spin', stats: {} });

test('빈 슬롯은 무엇이든 업그레이드, 같은 부위는 더 강해야 업그레이드', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = {};
  assert.equal(isUpgradeForHero(save, equipment('helmet', { defense: 1 })), true, '빈 칸은 업그레이드');
  save.equipment.helmet = equipment('helmet', { defense: 10 });
  assert.equal(isUpgradeForHero(save, equipment('helmet', { defense: 11 })), true, '조금이라도 강하면 업그레이드');
  assert.equal(isUpgradeForHero(save, equipment('helmet', { defense: 10 })), false, '같으면 바꿔도 이득이 없다');
  assert.equal(isUpgradeForHero(save, equipment('helmet', { defense: 9 })), false, '약하면 아니다');
});

test('타직업 전용 무기는 절대 업그레이드가 아니다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = {};
  assert.equal(isUpgradeForHero(save, bow({ attack: 999 })), false, '전사에게 활은 장착 불가');
  assert.equal(isUpgradeForHero(save, staff({ attack: 999 })), false, '전사에게 지팡이는 장착 불가');
  assert.equal(isUpgradeForHero(save, sword({ attack: 1 })), true, '전사에게 대검은 업그레이드');
  const archer = freshSave('female', 'archer');
  archer.equipment = {};
  assert.equal(isUpgradeForHero(archer, sword({ attack: 999 })), false, '궁수에게 대검은 장착 불가');
  assert.equal(isUpgradeForHero(archer, bow({ attack: 1 })), true, '궁수에게 활은 업그레이드');
  const mage = freshSave('male', 'mage');
  mage.equipment = {};
  assert.equal(isUpgradeForHero(mage, sword({ attack: 999 })), false, '마법사에게 대검은 장착 불가');
  assert.equal(isUpgradeForHero(mage, staff({ attack: 1 })), true, '마법사에게 지팡이는 업그레이드');
});

test('스킬북·보물 주머니는 장비가 아니라 화살표 대상이 아니다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = {};
  assert.equal(isUpgradeForHero(save, book()), false);
  assert.equal(isUpgradeForHero(save, pouchItem('pouch-1')), false);
});

test('반지는 두 칸 중 약한 쪽(또는 빈 칸)과 견준다', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = {};
  save.equipment.ring1 = equipment('ring1', { attack: 30 });
  save.equipment.ring2 = equipment('ring2', { attack: 10 });
  assert.equal(isUpgradeForHero(save, equipment('ring1', { attack: 11 })), true, '약한 반지(10)보다 세면 업그레이드');
  assert.equal(isUpgradeForHero(save, equipment('ring1', { attack: 10 })), false, '약한 반지와 같으면 아니다');
  assert.equal(isUpgradeForHero(save, equipment('ring1', { attack: 9 })), false, '약한 반지보다 약하면 아니다');
  save.equipment.ring2 = equipment('ring2', { attack: 40 });
  assert.equal(isUpgradeForHero(save, equipment('ring1', { attack: 31 })), true, '두 번째 반지가 세도 약한 칸(30)과 견준다');
  delete save.equipment.ring2;
  assert.equal(isUpgradeForHero(save, equipment('ring1', { attack: 1 })), true, '빈 반지 칸이 있으면 무엇이든 업그레이드');
  const empty = freshSave('male', 'warrior'); empty.equipment = {};
  assert.equal(isUpgradeForHero(empty, equipment('ring2', { attack: 1 })), true);
});

test('강화(+)·등급도 itemPower로 함께 견준다', () => {
  const save = freshSave('male', 'warrior');
  const worn = equipment('armor', { defense: 20 });
  save.equipment = { armor: worn };
  const better = equipment('armor', { defense: 20 }, { rarity: 'epic' });
  assert(itemPower(better) > itemPower(worn));
  assert.equal(isUpgradeForHero(save, better), true, '같은 수치라도 등급이 높으면 업그레이드');
  const weak = equipment('armor', { defense: 20 }, { rarity: 'common' });
  assert.equal(isUpgradeForHero(save, weak), false, '낮은 등급은 아니다');
});

// ── 화면 배선 ────────────────────────────────────────────────────────────
// 판정이 셋으로 갈리지 않도록, 세 화면이 모두 같은 헬퍼를 부르는지 소스로 확인한다.
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const warehouseSource = readFileSync(new URL('../src/ui/modals/warehouseModal.ts', import.meta.url), 'utf8');
const marketSource = readFileSync(new URL('../src/ui/modals/marketModal.ts', import.meta.url), 'utf8');
const modalsCss = modalStyles();
const marketCss = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');

function rule(source, selector) {
  const index = source.indexOf(`${selector} {`);
  assert.notEqual(index, -1, `${selector} 규칙이 없다`);
  return source.slice(index, source.indexOf('}', index) + 1);
}

test('세 화면(가방·장착 칸·공용창고·거래소)이 같은 판정 헬퍼로 화살표를 붙인다', () => {
  assert.match(equipSource, /import \{ downgradeArrowMarkup, upgradeArrowMarkup \} from '\.\.\/upgradeBadge'/, '가방은 innerHTML 헬퍼를 쓴다');
  assert.match(equipSource, /const upgrade = upgradeArrowMarkup\(save, item\);/);
  assert.match(equipSource, /cell\.innerHTML = itemIcon\.call\(this, item\.slot, item, 'item-icon'\) \+ upgrade \+ downgrade \+ plus \+ rarity;/);
  // [정렬/약한 장비] 다운그레이드 화살표가 같은 자리에 함께 붙는다 — 문자열 순서는 초록·빨강·`+N`·등급 배지.
  assert.match(equipSource, /const downgrade = downgradeArrowMarkup\(save, item\);/);
  assert.match(warehouseSource, /const upgrade = upgradeArrowMarkup\(ui\.world\.save, item\);/);
  assert.match(warehouseSource, /cell\.innerHTML = cellIcon\(ui, item\) \+ upgrade \+ downgrade;/);
  assert.match(marketSource, /import \{ appendUpgradeArrow \} from '\.\.\/upgradeBadge'/);
  assert.match(marketSource, /function icon\(item: Item, save\?: Save\)/);
  assert.match(marketSource, /if \(save\) appendUpgradeArrow\(node, save, item\);/);
  // 거래소에서 화살표가 붙는 곳 — 판매 중·거래 완료·내 거래 목록, 수령함, 판매 등록 칸.
  assert.match(marketSource, /row\.append\(icon\(sale\.item, ui\.world\.save\), itemInfo\(sale\.item\)\);/);
  assert.match(marketSource, /row\.append\(icon\(delivery\.item, this\.world\.save\), itemInfo\(delivery\.item\)\)/);
  // 판매 등록 칸은 **칸**에 화살표를 붙여 칸의 오른쪽 위에 고정한다(작업 248).
  assert.match(marketSource, /pick\.append\(icon\(item\)\);/);
  assert.match(marketSource, /appendUpgradeArrow\(pick, ui\.world\.save, item\);/);
});

test('화살표는 3번 슬림 셰브론 PNG를 쓴다(글자 `▲` 제거, 작업 246)', () => {
  const save = freshSave('male', 'warrior');
  save.equipment = { helmet: equipment('helmet', { defense: 50 }) };
  const markup = upgradeArrowMarkup(save, equipment('helmet', { defense: 500 }));
  assert.match(markup, new RegExp(`class="${UPGRADE_ARROW_CLASS}"`));
  assert.match(markup, new RegExp(`src="${UPGRADE_ARROW_ART.replace(/[/.]/g, '\\$&')}"`), 'PNG 경로');
  assert.match(markup, /aria-hidden="true"/, '낭독기에는 카드 라벨로 알린다');
  assert.match(markup, /title="지금 장착한 장비보다 좋은 장비 · 방어 \+/);
  assert.doesNotMatch(markup, /▲/, '큰 글자 화살표는 더 이상 쓰지 않는다');
  assert.equal(upgradeArrowMarkup(save, book()), '', '스킬북은 빈 문자열');
  assert.equal(UPGRADE_ARROW_COLOR, '#34d399', '주변 발광은 초록');
  assert.equal(UPGRADE_ARROW_LABEL, '지금 장착한 장비보다 좋은 장비');
  // DOM 없이도 요소를 만들 수 있는지 — 최소 스텁으로 확인한다.
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ className: '', src: '', alt: '', title: '', draggable: true, attrs: {}, children: [], setAttribute(name, value) { this.attrs[name] = value; }, append(child) { this.children.push(child); } }) };
    const node = upgradeArrowNode();
    assert.equal(node.className, UPGRADE_ARROW_CLASS);
    assert.equal(node.src, UPGRADE_ARROW_ART);
    assert.equal(node.alt, '', '장식용 이미지');
    assert.equal(node.attrs['aria-hidden'], 'true');
    const host = { children: [], append(child) { this.children.push(child); } };
    assert.equal(appendUpgradeArrow(host, save, equipment('helmet', { defense: 51 })), true);
    assert.equal(host.children.length, 1);
    assert.equal(appendUpgradeArrow(host, save, equipment('helmet', { defense: 1 })), false, '약한 장비에는 붙이지 않는다');
  } finally { globalThis.document = previous; }
});

test('화살표는 우측 상단에 작게(12px 이하) + 초록 발광, `+N`은 왼쪽 아래에 그린다(작업 246)', () => {
  const arrow = rule(modalsCss, '.upgrade-arrow');
  assert.match(arrow, /position: absolute/);
  assert.match(arrow, /top: 2px/);
  assert.match(arrow, /right: 2px/);
  assert.match(arrow, /width: clamp\(7px, 1\.9vw, 9px\)/, '기존 글자(11~14px)와 아이콘 상자에서 확실히 작다');
  assert.doesNotMatch(arrow, /font-size/, '글자가 아니라 그림이다');
  assert.match(arrow, /drop-shadow\(0 0 3px rgba\(52, 211, 153, \.8\)\)/);
  assert.match(arrow, /drop-shadow\(0 0 6px rgba\(16, 185, 129, \.5\)\)/);
  assert.match(arrow, /pointer-events: none/);
  // 좌상단 타직업 배지·우하단 `+N`/잠금과 겹치지 않게 잠금 배지만 아래로 내린다.
  assert.match(rule(modalsCss, '.bag-item.has-upgrade .bag-lock-badge'), /bottom: 1px/);
  // `+N` 강화 배지는 모든 칸에서 왼쪽 아래 한 자리(작업 246).
  const plus = rule(modalsCss, '.bag-item .item-plus-badge, .equipment-slot .item-plus-badge, .market-pick .item-plus-badge');
  assert.match(plus, /position: absolute/);
  assert.match(plus, /left: 3px/);
  assert.match(plus, /bottom: 2px/);
  // 거래소는 아이콘 상자 자체가 기준 상자가 되어야 화살표가 아이콘 모서리에 붙는다.
  assert.match(rule(marketCss, '.market-icon'), /position: relative/);
});
