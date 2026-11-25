import { test } from 'node:test';
import assert from 'node:assert/strict';
import { element, byClass, installDocument } from './helpers/dom.mjs';
import './ts-loader.mjs';

// 사용자 요청(`#28802`): 레벨을 보여 주는 세 곳 모두 만렙에서도 `MAX`가 아니라 숫자(`LV 30`)로 적는다.
// HUD LV 배지 · 상세 스탯 머리 · 내 정보 레벨 줄 — 세 곳이 같은 숫자를 쓴다.
const { freshSave, MAX_LEVEL } = await import('../src/game/store.ts');
const { renderStatus } = await import('../src/ui/hud.ts');
const { renderStats } = await import('../src/ui/modals/statsModal.ts');
const { renderAccount } = await import('../src/ui/modals/accountModal.ts');

/** `renderStatus`가 만지는 자리만 흉내 내는 HUD 스텁. */
function hudUi(save) {
  const nodes = {
    '.hero-name': element('span'), '.level-badge': element('button'), '.floor-button': element('button'),
    '.hp': element('div'), '.hp b': element('b')
  };
  for (const node of Object.values(nodes)) {
    node.style.setProperty = (key, value) => { node.style[key] = value; };
    node.addEventListener = () => {};
  }
  const top = element('div');
  top.querySelector = () => null;
  return {
    top, banner: element('div'), world: { save, player: { hp: 100 }, bossRetryReady: false },
    opened: [], open(kind) { this.opened.push(kind); },
    get(selector) { return nodes[selector]; }
  };
}

test('HUD LV 배지는 만렙에서도 `MAX` 대신 숫자 30을 보여 준다', () => {
  const save = freshSave('male', 'warrior'); save.level = MAX_LEVEL; save.exp = 0;
  const ui = hudUi(save);
  renderStatus.call(ui);
  assert.match(ui.top.innerHTML, /<span>LV<\/span><b>30<\/b>/, 'LV 30');
  assert.doesNotMatch(ui.top.innerHTML, />MAX</, 'MAX 문구는 없다');
});

test('상세 스탯 머리도 만렙에서 `LV 30`으로 적는다', () => {
  const restore = installDocument();
  try {
    const save = freshSave('female', 'mage'); save.level = MAX_LEVEL; save.floor = 7;
    const dialog = element('div');
    renderStats.call({ world: { save, player: { hp: 100 } } }, dialog);
    const meta = byClass(dialog, 'stats-meta')[0];
    assert.match(meta.textContent, /^LV 30 · 7층/, 'LV 30 · 7층');
    assert.doesNotMatch(meta.textContent, /MAX/);
  } finally { restore(); }
});

test('내 정보 레벨 줄도 만렙에서 `LV 30` · `100%`로 적는다', () => {
  const previousDocument = globalThis.document;
  // `renderAccount`는 `innerHTML`로 만든 줄을 `querySelector('b')`로 다시 찾는다 — 실제 DOM처럼 빈 `<b>`를 돌려준다.
  globalThis.document = { createElement: tag => Object.assign(element(tag), { querySelector: () => element('b') }) };
  try {
    const save = freshSave('male', 'warrior'); save.level = MAX_LEVEL; save.exp = 0;
    const dialog = element('div');
    const ui = {
      world: { save }, session: { loginId: 'tester' }, saveStatus: '연결됨', confirmReset: false,
      message() {}, renderModal() {}, onReset() {}
    };
    renderAccount.call(ui, dialog);
    const progress = byClass(dialog, 'account-progress')[0];
    assert.match(progress.innerHTML, /<b>LV 30<\/b>/, 'LV 30');
    assert.match(progress.innerHTML, /<span>100%<\/span>/, '경험치 보조 문구는 100%');
    assert.doesNotMatch(progress.innerHTML, /MAX/, 'MAX 문구는 없다');

    // 만렙이 아니면 지금처럼 레벨 숫자와 경험치/필요 경험치를 보여 준다.
    const low = freshSave('male', 'warrior'); low.level = 29;
    const lowDialog = element('div');
    renderAccount.call({ ...ui, world: { save: low } }, lowDialog);
    const lowProgress = byClass(lowDialog, 'account-progress')[0];
    assert.match(lowProgress.innerHTML, /<b>LV 29<\/b>/);
    assert.match(lowProgress.innerHTML, /EXP<\/span>/);
  } finally { globalThis.document = previousDocument; }
});
