// 일괄 분해 전 확인 팝업 B안(내역형, 백로그 12번).
//
// [일괄 분해]는 한 번에 여러 개를 지운다. 2개 이상이면 실제 분해 직전에 한 번 멈춰 서서 등급별
// 개수와 예상 획득(강화석·금화)을 보여 주고, [분해하기]를 눌러야 분해한다. 1개 단품 분해는 묻지
// 않는다. 보호 팝업(더 좋은 장비)·빈 장착칸 경고와의 순서는 **그 뒤 마지막 단계**다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { salvageGold, salvageStones } = await import('../src/game/items.ts');
const { requestSalvage, renderSalvage, confirmSalvage } = await import('../src/ui/modals/salvageModal.ts');
const { salvageBreakdown, salvageReward } = await import('../src/ui/salvageConfirm.ts');

const gear = (id, slot, attack = 0, rarity = 'common') => ({ id, name: id, slot, rarity, stats: { attack } });
/** 장착 칸을 채워 '빈 장착칸 경고'가 끼어들지 않게 한다 — 확인 팝업만 보려는 경우에 쓴다. */
const equip = (save, ...slots) => { for (const slot of slots) save.equipment[slot] = gear(`worn-${slot}`, slot, 50); };

function node(tag = 'div') {
  return { tag, children: [], className: '', textContent: '', attrs: {}, dataset: {}, disabled: false, type: '',
    style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    classList: { add() {}, toggle() {} } };
}

/** 장비창이 열린 상태의 `Interface` 최소 스텁 — 팝업 노드는 `ui.root` 아래에 쌓인다. */
function popup(save, salvageRarity = 'rare') {
  return {
    world: { save, paused: false, onChange() {} },
    openModal: 'equipment', messages: [], salvageIds: undefined, salvageRarity,
    root: node('main'), modal: { hidden: false },
    open(kind) { this.openModal = kind; },
    message(text) { this.messages.push(text); },
  };
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: tag => node(tag),
    createTextNode: text => ({ textContent: text, children: [] }),
    body: node('body')
  };
  try { return work(); } finally { globalThis.document = previous; }
}
const findByClass = (root, name) => {
  if (root.className?.split(' ').includes(name)) return root;
  for (const child of root.children ?? []) { const found = findByClass(child, name); if (found) return found; }
  return undefined;
};
const findAllByClass = (root, name, found = []) => {
  if (root.className?.split(' ').includes(name)) found.push(root);
  for (const child of root.children ?? []) findAllByClass(child, name, found);
  return found;
};
/** 이어 붙인 글자 — 자기 글자와 자식 글자를 모두 모은다(테스트 스텁은 textContent를 합치지 않는다). */
const deepText = node => `${node.textContent ?? ''} ${(node.children ?? []).map(deepText).join(' ')}`.replace(/\s+/g, ' ').trim();
/** 팝업의 버튼 클릭도 `document`가 있는 동안 실행한다(클릭이 다음 팝업을 만든다). */
const click = node => withDocument(() => node.onclick());

test('등급별 내역은 실제 대상 등급만, 등급 순서대로 센다', () => {
  const items = [gear('a', 'weapon', 1, 'common'), gear('b', 'helmet', 1, 'rare'), gear('c', 'boots', 1, 'common')];
  assert.deepEqual(salvageBreakdown(items), [{ rarity: 'common', count: 2 }, { rarity: 'rare', count: 1 }], '0개 등급은 빠진다');
  assert.deepEqual(salvageReward(items), {
    gold: salvageGold.common * 2 + salvageGold.rare,
    stones: salvageStones.common * 2 + salvageStones.rare
  }, '보상은 분해와 같은 표를 쓴다');
});

test('2개 이상이면 분해 직전에 확인 팝업이 뜨고, 아직 아무것도 지우지 않는다', () => {
  const save = freshSave();
  equip(save, 'helmet', 'boots');
  save.bag = [gear('a', 'helmet'), gear('b', 'boots')];
  const gold = save.gold, ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['a', 'b']));
  const overlay = findByClass(ui.root, 'bulk-confirm');
  assert(overlay, '확인 팝업이 하나 얹힌다');
  assert.equal(overlay.attrs.role, 'dialog');
  assert.equal(overlay.attrs['aria-label'], '일괄 분해 확인');
  assert.equal(save.bag.length, 2, '세이브는 그대로');
  assert.equal(save.gold, gold, '보상도 아직 없다');
  assert.equal(ui.openModal, 'equipment', '장비창은 그대로 뒤에 있다');
});

test('팝업은 개수·등급별 내역·예상 획득·안내 줄을 B안대로 보여 준다', () => {
  const save = freshSave();
  equip(save, 'helmet', 'boots', 'gloves', 'belt', 'necklace');
  save.bag = [
    gear('a', 'helmet', 0, 'common'), gear('b', 'boots', 0, 'common'), gear('c', 'gloves', 0, 'common'),
    gear('d', 'belt', 0, 'magic'), gear('e', 'necklace', 0, 'rare')
  ];
  const ui = popup(save, 'rare');
  withDocument(() => requestSalvage.call(ui, save.bag.map(item => item.id)));
  const overlay = findByClass(ui.root, 'bulk-confirm');
  assert(findByClass(overlay, 'bulk-confirm-emblem'), '강화석 아이콘 자리가 있다');
  const title = deepText(findByClass(overlay, 'bulk-confirm-title'));
  assert(title.includes('일괄 분해'), `제목 (got "${title}")`);
  assert(title.includes('기준 레어 이하 · 장비 5개'), `부제에 기준 등급과 개수 (got "${title}")`);
  const question = deepText(findByClass(overlay, 'bulk-confirm-q'));
  assert(question.includes('총 5 개의 아이템이 분해됩니다.'), `질문 문구 (got "${question}")`);
  assert(question.includes('분해하시겠습니까?'), '한 번 더 묻는다');
  const rows = findAllByClass(overlay, 'bulk-confirm-row');
  assert.deepEqual(rows.map(row => deepText(row)), ['일반 3', '매직 1', '레어 1'], '포함된 등급만 순서대로');
  const gain = deepText(findByClass(overlay, 'bulk-confirm-gain'));
  const stones = salvageStones.common * 3 + salvageStones.magic + salvageStones.rare;
  const gold = salvageGold.common * 3 + salvageGold.magic + salvageGold.rare;
  assert(gain.includes(`강화석 +${stones}`), `예상 강화석 (got "${gain}")`);
  assert(gain.includes(`금화 +${gold}`), `예상 금화 (got "${gain}")`);
  const note = deepText(findByClass(overlay, 'bulk-confirm-note'));
  assert(note.includes('잠긴 장비'), '제외 안내 1줄');
  assert(note.includes('기준(레어)보다 높은 등급은 제외됩니다.'), `안내 문구 (got "${note}")`);
  const buttons = findByClass(overlay, 'bulk-confirm-actions').children;
  assert.deepEqual(buttons.map(button => button.textContent), ['취소', '분해하기'], '두 버튼');
});

test('[분해하기]를 눌러야 실제로 분해되고 보상이 들어온다', () => {
  const save = freshSave();
  equip(save, 'helmet', 'boots');
  save.bag = [gear('a', 'helmet', 0, 'common'), gear('b', 'boots', 0, 'rare')];
  const gold = save.gold, stones = save.stones, ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['a', 'b']));
  click(findByClass(ui.root, 'bulk-confirm-ok'));
  assert.equal(save.bag.length, 0, '둘 다 분해');
  assert.equal(save.gold, gold + salvageGold.common + salvageGold.rare, '금화 지급');
  assert.equal(save.stones, stones + salvageStones.common + salvageStones.rare, '강화석 지급');
  assert.equal(ui.openModal, 'equipment', '장비창으로 돌아온다');
  assert(ui.messages.some(text => text.includes('2개 분해 완료')), '완료 안내');
});

test('[취소]는 아무것도 지우지 않고 장비로 돌려보낸다', () => {
  const save = freshSave();
  equip(save, 'helmet', 'boots');
  save.bag = [gear('a', 'helmet'), gear('b', 'boots')];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['a', 'b']));
  click(findByClass(ui.root, 'bulk-confirm-cancel'));
  assert.equal(save.bag.length, 2, '잔존');
  assert.equal(ui.openModal, 'equipment');
});

test('1개 단품 분해는 확인하지 않고 바로 분해한다', () => {
  const save = freshSave();
  equip(save, 'helmet');
  save.bag = [gear('only', 'helmet', 0)];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['only']));
  assert.equal(findByClass(ui.root, 'bulk-confirm'), undefined, '팝업 없음');
  assert.equal(save.bag.length, 0, '바로 분해');
});

test('보호 팝업에서 빼고 나면 확인 팝업은 줄어든 개수로 뜬다', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.equipment.boots = gear('worn-boots', 'boots', 1);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'boots', 1), gear('junk2', 'boots', 1)];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk', 'junk2']));
  assert(findByClass(ui.root, 'salvage-protect'), '먼저 보호 팝업');
  assert.equal(findByClass(ui.root, 'bulk-confirm'), undefined, '그 전에는 확인 팝업이 없다');
  click(findByClass(ui.root, 'salvage-protect-actions').children[0]); // 이 아이템 분해 제외
  const overlay = findByClass(ui.root, 'bulk-confirm');
  assert(overlay, '보호 제외 뒤 마지막 단계로 확인 팝업');
  const question = deepText(findByClass(overlay, 'bulk-confirm-q'));
  assert(question.includes('총 2 개의 아이템이 분해됩니다.'), `줄어든 개수 (got "${question}")`);
  assert.equal(save.bag.length, 3, '아직 아무것도 지우지 않았다');
  click(findByClass(ui.root, 'bulk-confirm-ok'));
  assert.deepEqual(save.bag.map(item => item.id), ['better'], '보호한 장비만 남는다');
});

test('보호 팝업의 그대로 분해도 확인 팝업을 마지막에 거친다', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'boots', 1)];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk']));
  click(findByClass(ui.root, 'salvage-protect-actions').children[1]); // 그대로 분해
  assert(findByClass(ui.root, 'bulk-confirm'), '확인 팝업이 뜬다');
  assert.equal(save.bag.length, 2, '아직 그대로');
  click(findByClass(ui.root, 'bulk-confirm-ok'));
  assert.equal(save.bag.length, 0, '확인 뒤 전부 분해');
});

test('빈 장착칸 경고를 지난 뒤에도 확인 팝업이 마지막에 뜬다', () => {
  const save = freshSave();
  save.equipment.helmet = undefined; // 투구 칸이 비어 있다
  save.bag = [gear('helm', 'helmet', 1), gear('junk', 'boots', 1)];
  const ui = popup(save), dialog = node('div');
  withDocument(() => requestSalvage.call(ui, ['helm', 'junk']));
  assert.equal(ui.openModal, 'salvage', '먼저 빈 장착칸 경고');
  assert.equal(findByClass(ui.root, 'bulk-confirm'), undefined, '그 전에는 확인 팝업이 없다');
  withDocument(() => renderSalvage.call(ui, dialog));
  click(findByClass(dialog, 'salvage-confirm-actions').children[1]); // N개 분해
  const overlay = findByClass(ui.root, 'bulk-confirm');
  assert(overlay, '경고 뒤 확인 팝업');
  assert.equal(save.bag.length, 2, '아직 그대로');
  click(findByClass(ui.root, 'bulk-confirm-ok'));
  assert.equal(save.bag.length, 0, '확인 뒤 분해');
});

test('확인 팝업은 대상이 다시 1개가 되면 묻지 않고 곧장 분해한다', () => {
  const save = freshSave();
  save.bag = [gear('a', 'helmet', 1)];
  const ui = popup(save);
  withDocument(() => confirmSalvage.call(ui, ['a']));
  assert.equal(findByClass(ui.root, 'bulk-confirm'), undefined, '1개는 팝업 없음');
  assert.equal(save.bag.length, 0);
});
