import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

const items = await import('../src/game/items.ts');
const pouch = await import('../src/game/pouch.ts');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { salvagePlan, salvageItems, autoSalvageBlock, autoSalvageRecovered } = await import('../src/game/inventory.ts');
const { canStoreItem, equipmentCount } = await import('../src/game/bagCapacity.ts');
const { autoEquipBest, salvageByRarity } = await import('../src/game/items.ts');
const { filterSaleItems } = await import('../src/ui/itemOrder.ts');
const { equipmentCodexKey } = await import('../src/game/codex.ts');
const { pouchRatesPanel, pouchResultCard, openPouchWindow, pouchGlowInk, POUCH_OPEN_MS, POUCH_FRAME_AT, POUCH_BURST_MS, POUCH_RESULT_MS } = await import('../src/ui/modals/pouchModal.ts');
const pouchArt = await import('../src/ui/pouchArt.ts');
const { itemDetail, renderInventory } = await import('../src/ui/modals/equipModal.ts');
const css = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
// 주석에 적힌 말("`pouch-shake` 삭제")에 걸리지 않도록, 규칙만 남긴 사본으로 금지 규칙을 검사한다.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 결정적인 난수(같은 순서면 같은 결과) — 분포 검사에 쓴다. */
function seeded(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const sum = table => table.reduce((total, entry) => total + entry.rate, 0);
const close = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

test('확률표는 55/40/5 분류·세부 확률·전체 10항목이 모두 100%로 닫힌다', () => {
  assert.deepEqual(pouch.POUCH_CATEGORIES.map(entry => [entry.kind, entry.rate]), [['gold', .55], ['equipment', .40], ['skillbook', .05]]);
  assert.deepEqual(pouch.POUCH_GOLD_TIERS.map(entry => [entry.gold, entry.rate]), [[1500, .55], [3000, .32], [5000, .13]]);
  assert.deepEqual(pouch.POUCH_RARITY_TIERS.map(entry => [entry.rarity, entry.rate]), [['common', .34], ['magic', .30], ['rare', .20], ['epic', .11], ['unique', .04], ['legendary', .01]]);
  assert.equal(sum(pouch.POUCH_CATEGORIES), 1,'분류 합 100%');
  assert.equal(sum(pouch.POUCH_GOLD_TIERS), 1,'금화 세부 합 100%');
  assert.equal(sum(pouch.POUCH_RARITY_TIERS), 1,'등급 세부 합 100%');
  // 사용자 확정 10항목(전체 확률) — 내림차순, 합 100.00%.
  assert.deepEqual(pouch.POUCH_OVERALL_RATES.map(entry => [entry.label, entry.rate]), [
    ['1,500G', .3025], ['3,000G', .1760], ['일반 장비', .1360], ['매직 장비', .1200], ['레어 장비', .0800],
    ['5,000G', .0715], ['무작위 스킬북 1권', .0500], ['에픽 장비', .0440], ['유니크 장비', .0160], ['레전드 장비', .0040]
  ]);
  assert.equal(Math.round(sum(pouch.POUCH_OVERALL_RATES) * 10000) / 10000, 1,'전체 합 100.00%');
  assert(pouch.POUCH_OVERALL_RATES.every((entry, index, list) => index === 0 || list[index - 1].rate >= entry.rate),'높은 확률 순');
  // 전체 확률 = 분류 확률 × 세부 확률(정확히).
  assert.equal(pouch.POUCH_OVERALL_RATES[0].rate, Math.round(.55 * .55 * 10000) / 10000,'1,500G = 55% × 55%');
  assert.equal(pouch.POUCH_OVERALL_RATES[2].rate, Math.round(.40 * .34 * 10000) / 10000,'일반 장비 = 40% × 34%');
  assert.equal(pouch.POUCH_OVERALL_RATES[6].rate, .05,'스킬북');
});

test('2만 번 개봉에서 분류·금화·등급 분포가 표를 따른다', () => {
  const random = seeded(7), counts = { gold: 0, equipment: 0, skillbook: 0 }, golds = new Map(), rarities = new Map(), rolls = 20000;
  for (let index = 0; index < rolls; index++) {
    const result = pouch.rollPouch(20, random);
    counts[result.kind]++;
    if (result.kind === 'gold') golds.set(result.gold, (golds.get(result.gold) ?? 0) + 1);
    if (result.kind === 'equipment') rarities.set(result.item.rarity, (rarities.get(result.item.rarity) ?? 0) + 1);
  }
  assert(close(counts.gold / rolls, .55, .02),`금화 ${counts.gold / rolls}`);
  assert(close(counts.equipment / rolls, .40, .02),`장비 ${counts.equipment / rolls}`);
  assert(close(counts.skillbook / rolls, .05, .01),`스킬북 ${counts.skillbook / rolls}`);
  for (const [gold, rate] of [[1500, .55], [3000, .32], [5000, .13]]) assert(close((golds.get(gold) ?? 0) / counts.gold, rate, .04),`${gold}G`);
  for (const [rarity, rate] of [['common', .34], ['magic', .30], ['rare', .20], ['epic', .11], ['unique', .04], ['legendary', .01]]) {
    const expected = Math.max(rate, .01);
    assert(close((rarities.get(rarity) ?? 0) / counts.equipment, rate, Math.max(.04, expected * .6)),`${rarity}`);
  }
});

test('확률표는 전체 확률 10줄을 높은 확률 순으로 렌더하고 등급 색·요약을 유지한다', () => {
  const document = { createElement: tag => element(tag) };
  const previous = globalThis.document;
  globalThis.document = document;
  try {
    const panel = pouchRatesPanel();
    const table = panel.children.find(node => node.className === 'pouch-rate-table');
    assert(table,'10줄 표');
    assert.equal(table.children.length, 10);
    // fake 노드는 이름·확률을 각각 자식(span/em)의 textContent로 지닌다.
    const rows = table.children.map(row => [row.children.map(child => child.textContent ?? '').join(''), row.className]);
    assert.deepEqual(rows.map(([text]) => text.replace(/[0-9.,%]/g, '')), ['G', 'G', '일반 장비', '매직 장비', '레어 장비', 'G', '무작위 스킬북 권', '에픽 장비', '유니크 장비', '레전드 장비'],'높은 확률 순');
    assert.deepEqual(rows.map(([text]) => text.match(/[0-9.]+%$/)?.[0]), ['30.25%','17.60%','13.60%','12.00%','8.00%','7.15%','5.00%','4.40%','1.60%','0.40%'],'소수 둘째 자리');
    assert.deepEqual(rows.slice(2,5).concat(rows.slice(7)).map(([, cls]) => cls.match(/rarity-(\w+)/)?.[1]), ['common','magic','rare','epic','unique','legendary'],'등급 색 유지');
    assert(!rows[0][1].includes('rarity-'),'금화 줄은 등급 색이 없다');
    const summary = panel.children.find(node => node.className === 'pouch-rate-summary');
    assert(summary && summary.textContent === '합계 100% · 장비·스킬북은 3직업 균등','요약 한 줄');
    assert(css.includes('.pouch-rate-table') && css.includes('.pouch-rate-summary'),'표·요약 스타일');
    for (const rarity of ['common', 'magic', 'rare', 'epic', 'unique', 'legendary']) assert(css.includes(`.pouch-rate-row.rarity-${rarity}`),`${rarity} 색 규칙`);
  } finally { globalThis.document = previous; }
});

test('주머니 1개를 열면 소모되고 결과가 세이브에 반영된다', () => {
  // 금화: 1,500G
  const goldSave = withPouches(1);
  const gold = pouch.openPouch(goldSave, undefined, constant([.10, .10]));
  assert.equal(gold.ok, true); assert.equal(gold.result.kind, 'gold'); assert.equal(gold.result.gold, 1500);
  assert.equal(goldSave.gold, 1500,'금화 지급'); assert.equal(pouch.pouchCount(goldSave), 0,'주머니 소모');
  // 장비: 레어 (분류 55% 구간 뒤 equipment — 금화 55% · 장비 40% · 스킬북 5%)
  const gearSave = withPouches(1);
  const gear = pouch.openPouch(gearSave, undefined, constant([.60, .70]));
  assert.equal(gear.result.kind, 'equipment'); assert.equal(gear.result.item.rarity, 'rare');
  assert.equal(pouch.pouchCount(gearSave), 0); assert.equal(gearSave.bag.filter(item => item.slot !== 'pouch').length, 1,'가방에 장비 1개');
  assert(gearSave.bag.some(item => item.rarity === 'rare' && item.slot !== 'pouch'));
  // 장비 `+단계`·스탯 규칙: 20층 기준이면 `+1`까지 열려 있다.
  assert(gear.result.item.plus <= items.maxPlusFor(20));
  // 스킬북: 분류 .98 → skillbook (금화 55% · 장비 40% 뒤의 마지막 5%)
  const bookSave = withPouches(1);
  const book = pouch.openPouch(bookSave, undefined, constant([.98]));
  assert.equal(book.result.kind, 'skillbook'); assert.equal(book.result.item.kind, 'skillbook');
  assert.equal(bookSave.bag.filter(item => item.kind === 'skillbook').length, 1);
  assert.equal(pouch.pouchCount(bookSave), 0);
  // 여러 개를 이어서: 남은 수가 줄어든다.
  const manySave = withPouches(3);
  const first = pouch.openPouch(manySave, undefined, constant([.10, .10]));
  assert.equal(first.remaining, 2);
  const second = pouch.openPouch(manySave, undefined, constant([.10, .10]));
  assert.equal(second.remaining, 1);
  assert.equal(manySave.gold, 3000,'열 때마다 금화가 쌓인다');
  // 마지막 한 개까지 열면 주머니가 없어 더는 열 수 없다.
  assert.equal(pouch.openPouch(manySave, undefined, constant([.10, .10])).remaining, 0);
  assert.equal(manySave.gold, 4500);
  assert.equal(pouch.openPouch(manySave).ok, false);
});

test('다른 종류 결과를 노린 난수도 같은 규칙으로 지급된다', () => {
  const random = seeded(99);
  for (let index = 0; index < 300; index++) {
    const save = withPouches(1), before = save.gold, result = pouch.openPouch(save, undefined, random);
    assert.equal(result.ok, true);
    assert.equal(pouch.pouchCount(save), 0);
    if (result.result.kind === 'gold') assert.equal(save.gold, before + result.result.gold);
    else assert.equal(save.bag.length, 1,'장비·스킬북은 가방으로');
  }
});

test('가방이 가득 차면 주머니를 그대로 두고 열지 않는다', () => {
  const save = freshSave();
  save.bag = [...Array.from({ length: 40 }, (_, index) => ({ id: `g${index}`, name: '두손검', slot: 'weapon', rarity: 'common', stats: { attack: 1 }, plus: 0 })), items.pouchItem('p1')];
  const result = pouch.openPouch(save);
  assert.equal(result.ok, false); assert(result.message.includes('가득'));
  assert.equal(pouch.pouchCount(save), 1,'주머니는 사라지지 않는다');
  assert.equal(save.bag.length, 41);
});

test('주머니는 자동 장착·자동/일괄 분해·경매장 판매·도감 어디에도 끼지 않는다', () => {
  const save = withPouches(2);
  save.bag.push({ id: 'blade', name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 9 }, plus: 0 });
  assert.equal(equipmentCount(save.bag), 1,'주머니는 장비 40칸에 세지 않는다');
  assert.equal(canStoreItem(save.bag, items.pouchItem('new')), true);
  assert.equal(autoSalvageBlock(save, items.pouchItem('x'), 'unique'), 'pouch','자동 분해 제외');
  assert.equal(autoSalvageRecovered(save, items.pouchItem('x'), 'unique'), undefined);
  const plan = salvagePlan(save, save.bag.map(item => item.id));
  assert.deepEqual(plan.items.map(item => item.id), ['blade'],'일괄 분해 대상에 주머니가 없다');
  const before = pouch.pouchCount(save);
  salvageByRarity(save, 'unique');
  assert.equal(pouch.pouchCount(save), before,'일괄 분해로 주머니가 사라지지 않는다');
  salvageItems(save, ['p1', 'p2']);
  assert.equal(pouch.pouchCount(save), before);
  autoEquipBest(save);
  assert.equal(pouch.pouchCount(save), before,'자동 장착이 주머니를 건드리지 않는다');
  assert.equal(filterSaleItems(save.bag, '', '').some(item => item.kind === 'pouch'), false,'경매장 판매 목록 제외');
  assert.equal(equipmentCodexKey(items.pouchItem('c')), undefined,'도감 제외');
  assert.equal(items.itemPower(items.pouchItem('p')), 0);
  assert.equal(items.itemDisplayName(items.pouchItem('p')), '무작위 보물 주머니');
});

test('세이브 파싱이 주머니를 보존하고 장비 40칸과 분리해 읽는다', () => {
  const save = freshSave();
  save.bag = [...Array.from({ length: 40 }, (_, index) => ({ id: `g${index}`, name: '두손검', slot: 'weapon', rarity: 'common', stats: { attack: 1 }, plus: 0 })), items.pouchItem('p1'), items.pouchItem('p2')];
  const parsed = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(pouch.pouchCount(parsed), 2,'장비가 가득 차도 주머니는 남는다');
  assert.equal(equipmentCount(parsed.bag), 40);
  assert.equal(parsed.bag.find(item => item.id === 'p1').kind, 'pouch');
  assert.equal(parsed.bag.find(item => item.id === 'p1').name, '무작위 보물 주머니');
  // 옛 클라이언트가 보낸 slot 만 있는 항목도 주머니로 읽는다.
  assert.equal(items.migrateItem({ id: 'z', slot: 'pouch', name: '무작위 보물 주머니' }).kind, 'pouch');
});

test('가방 칸은 주머니를 한 칸에 ×N으로 모으고 상세에 [열기] 버튼이 있다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(3);
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const cells = grid.children.filter(node => node.className?.includes('bag-item'));
    assert.equal(cells.length, 1,'주머니 3개는 한 칸');
    assert(cells[0].className.includes('pouch-item'));
    assert(toString(cells[0]).includes('×3'),'수량 배지');
    const detail = itemDetail.call(ui, save, save.bag[0]);
    assert(detail.className.includes('pouch-detail'));
    const open = detail.children.find(node => node.className === 'detail-actions').children[0];
    assert.equal(open.textContent, '열기');
    assert.equal(open.disabled, false,'열기는 잠기지 않는다');
  } finally { globalThis.document = previous; }
});

test('큰 개봉 창은 왼쪽 위 [확률표]를 펼치고 [열기]로 주머니를 까서 결과를 보여 준다', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(2), messages = [];
    let changes = 0;
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message(text) { messages.push(text); }, world: { save, onChange() { changes++; } } };
    const api = openPouchWindow(ui, undefined, { delay: 0 });
    assert.equal(ui.root.children.length, 1,'장비창 위에 한 겹으로 얹힌다');
    assert.equal(api.rates.hidden, true,'확률표는 처음에 접혀 있다');
    const toggle = find(api.overlay, node => node.className === 'pouch-rates-toggle');
    toggle.onclick();
    assert.equal(api.rates.hidden, false,'[확률표]를 누르면 펼쳐진다');
    assert.equal(toggle.attrs['aria-expanded'], 'true');
    assert(find(api.overlay, node => node.className === 'pouch-window-title').textContent === '무작위 보물 주머니');
    const open = find(api.overlay, node => node.textContent === '열기');
    // 연출 중 두 번 눌러도 한 번만 깐다(중복 차감 방지).
    open.onclick(); open.onclick();
    assert.equal(pouch.pouchCount(save), 1,'한 번 열면 하나 소모');
    assert.equal(open.disabled, true,'연출 중에는 버튼이 잠긴다');
    assert(api.result.children.length, '결과 카드는 연출과 함께 자리에 들어간다');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(api.result.children.length, 1,'결과 카드가 창 안에 뜬다');
    assert.equal(changes, 1,'세이브 반영');
    assert(messages.some(text => text.includes('무작위 보물 주머니')),'토스트 안내');
    const actions = find(api.overlay, node => node.className === 'pouch-window-actions');
    const primary = actions.children[0], closeAction = actions.children[1];
    // 작업 212(`#4951`): 남은 주머니가 있으면 [1개 더 열기], 곁에는 언제든 나갈 수 있는 [닫기].
    const again = find(api.overlay, node => node.textContent === '1개 더 열기');
    assert(again,'더 남으면 [1개 더 열기]');
    assert.equal(primary, again,'주 버튼이 [1개 더 열기]로 바뀐다');
    assert.equal(closeAction.textContent, '닫기','보조 [닫기] 버튼은 늘 남는다');
    assert.equal(closeAction.className, 'pouch-close');
    again.onclick();
    assert.equal(pouch.pouchCount(save), 0,'[1개 더 열기]로 다음 주머니를 이어서 깐다');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(primary.textContent, '확인','주머니가 없으면 [확인]이 된다');
    assert.equal(primary.disabled, false,'연출이 끝나면 버튼이 풀린다');
    closeAction.onclick();
    assert.equal(ui.root.children.length, 0,'[닫기]로 닫힌다');
  } finally { globalThis.document = previous; }
});

test('상단 한 줄에 `확률표`·`보물 주머니` 제목·`×`가 나란히 앉는다(작업 213 `#5057`)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(1);
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message() {}, world: { save, onChange() {} } };
    const api = openPouchWindow(ui, undefined, { delay: 0 });
    const top = find(api.overlay, node => node.className === 'pouch-window-top');
    assert(top, '상단 줄');
    assert.equal(top.children.length, 3, '왼쪽 확률표·가운데 제목·오른쪽 ×');
    assert.equal(top.children[0].className, 'pouch-rates-toggle');
    assert.equal(top.children[1].className, 'pouch-window-title');
    assert.equal(top.children[1].textContent, '무작위 보물 주머니');
    assert.equal(top.children[2].className, 'pouch-window-close');
    // 제목이 상단 줄 밖(별도 줄)에 또 있지 않다 — 카드 바로 아래는 무대다.
    const card = find(api.overlay, node => node.className === 'pouch-window-card');
    assert.equal(card.children[0].className, 'pouch-window-top');
    assert.equal(card.children[1].className, 'pouch-window-stage', '상단 줄 다음이 바로 주머니 무대');
    assert(!card.children.some(node => node.className === 'pouch-window-title'), '제목은 상단 줄 안에만');
    const cssTop = css.match(/\.pouch-window-top \{([^}]*)\}/);
    assert(cssTop && /display: grid/.test(cssTop[1]) && /grid-template-columns: auto minmax\(0, 1fr\) auto/.test(cssTop[1]), '세 칸 한 줄');
    const cssTitle = css.match(/\.pouch-window-title \{([^}]*)\}/);
    assert(cssTitle && /text-align: center/.test(cssTitle[1]), '가운데 정렬');
  } finally { globalThis.document = previous; }
});

test('개봉 그림은 모양이 변하지 않는 핵심 3장(투명 512×512 PNG)이고 금화 뭉치도 같은 규격이며 가방 아이콘은 닫힌 주머니를 쓴다(작업 215)', () => {
  assert.deepEqual([...pouchArt.POUCH_FRAME_URLS], [
    '/assets/icons/treasure_pouch_v2.png',
    '/assets/icons/treasure_pouch_slump0_v3.png',
    '/assets/icons/treasure_pouch_slump2_v2.png'
  ],'닫힘 → 풀리며 무너짐 → 바닥에 납작');
  assert.equal(new Set(pouchArt.POUCH_FRAME_URLS).size, 3,'세 컷은 서로 다른 파일');
  // 작업 215 `#5297`: AI로 만든 중간 컷(step1b·step2·step2b·step3·step3b·open)은 각도·배 둘레·문양이
  // 조금씩 달라 넘길수록 주머니가 울렁거렸다 — 그 컷들은 다시 쓰지 않는다.
  for (const dropped of ['step1b', 'step2', 'step2b', 'step3', 'step3b', 'open']) {
    assert(!pouchArt.POUCH_FRAME_URLS.some(url => url.includes(`treasure_pouch_${dropped}`)), `모양이 달랐던 중간 컷 제외: ${dropped}`);
  }
  assert.equal(pouchArt.POUCH_ART_URL, pouchArt.POUCH_FRAME_URLS[0],'개봉 창은 닫힌 주머니로 시작');
  assert.equal(pouchArt.POUCH_ICON_URL, pouchArt.POUCH_FRAME_URLS[0],'가방 아이콘도 닫힌 주머니');
  assert.equal(pouchArt.POUCH_GOLD_PILE_URL, '/assets/icons/pouch_gold_pile_v2.png','금화 뭉치 그림');
  assert.equal(pouchArt.pouchFrameUrl(0), pouchArt.POUCH_FRAME_URLS[0]);
  assert.equal(pouchArt.pouchFrameUrl(2), pouchArt.POUCH_FRAME_URLS[2]);
  assert.equal(pouchArt.pouchFrameUrl(5), pouchArt.POUCH_FRAME_URLS[2],'범위를 넘으면 마지막 컷');
  assert.equal(pouchArt.pouchFrameUrl(-2), pouchArt.POUCH_FRAME_URLS[0],'음수는 1컷');
  for (const url of [...pouchArt.POUCH_FRAME_URLS, pouchArt.POUCH_GOLD_PILE_URL]) {
    assert.match(url, /^\/assets\/icons\/(treasure_pouch(_slump\d)?|pouch_gold_pile)_v[23]\.png$/,'캐시를 피하는 새 이름');
    const file = readFileSync(new URL(`../public${url}`, import.meta.url));
    assert.equal(file.toString('ascii', 1, 4), 'PNG', `${url} PNG`);
    assert.equal(file.readUInt32BE(16), 512, `${url} 가로 512`);
    assert.equal(file.readUInt32BE(20), 512, `${url} 세로 512`);
    assert.equal(file[25], 6, `${url} RGBA(투명 배경)`);
  }
});

test('3컷 개봉은 바닥 축 탄성으로 0.92초 절정까지 버티고, 섬광 속에서 그림이 바뀐 뒤 0.3초 만에 보상이 뜬다(작업 215)', () => {
  // 3컷 타임라인 — 쪼으는 구간 0.92초, 절정 뒤 보상은 0.3초, 전체 1.55초.
  assert.deepEqual([...POUCH_FRAME_AT], [0, 920, 1080], '그림이 바뀌는 시각');
  assert.equal(POUCH_FRAME_AT.length, pouchArt.POUCH_FRAME_URLS.length, '컷 수와 시각 수가 같다');
  assert.equal(POUCH_BURST_MS, 920, '절정(흰빛이 가장 밝은 = 2번 컷으로 넘어가는) 시각');
  assert.equal(POUCH_RESULT_MS, 1220, '보상 카드 등장 = 절정 + 0.3초');
  assert.equal(POUCH_OPEN_MS, 1550, '연출 전체 길이 약 1.55초');
  assert(POUCH_BURST_MS >= 880 && POUCH_BURST_MS <= 980, '쪼으는 구간이 0.88~0.98초');
  assert(POUCH_RESULT_MS - POUCH_BURST_MS >= 250 && POUCH_RESULT_MS - POUCH_BURST_MS <= 350, '절정 뒤 0.25~0.35초 안에 보상');
  assert(POUCH_OPEN_MS - POUCH_RESULT_MS >= 250 && POUCH_OPEN_MS - POUCH_RESULT_MS <= 400, '보상 뒤 0.25~0.4초에 버튼 잠금 해제');
  assert(POUCH_FRAME_AT[2] > POUCH_FRAME_AT[1] && POUCH_FRAME_AT[1] > POUCH_FRAME_AT[0], '시각은 늘어난다');
  // 컷 사이 전환 — 두 장을 겹쳐 두고 opacity로 넘기며, 1→2번 180ms·2→3번 200ms로 짧게 끝낸다.
  const fade = css.match(/img\.pouch-art\s*\{[^}]*transition: opacity (\d+)ms ([a-z-]+)/);
  assert(fade && Number(fade[1]) >= 80 && Number(fade[1]) <= 180 && fade[2] === 'linear', '기본 크로스페이드 80~180ms');
  assert(/\.pouch-art-stack\[data-pouch-frame="1"\] img\.pouch-art\s*\{[^}]*transition-duration: 180ms/.test(css), '1→2번 컷 180ms');
  assert(/\.pouch-art-stack\[data-pouch-frame="2"\] img\.pouch-art\s*\{[^}]*transition-duration: 200ms/.test(css), '2→3번 컷 200ms');
  assert(/img\.pouch-art\s*\{[^}]*opacity: 0/.test(css),'두 장이 겹쳐 opacity로 넘어간다');
  // 사용자 피드백: 좌우로 흔들지 않는다 — 흔들기·부풀리기 키프레임은 없고 그림 자체에도 애니메이션을 걸지 않는다.
  assert(!/pouch-shake/.test(rules), '좌우로 흔들던 애니메이션 제거');
  assert(!/@keyframes pouch-shake/.test(rules) && !/@keyframes pouch-burst/.test(rules), '흔들기·부풀리기 키프레임 제거');
  assert(!/\.pouch-window-stage\.is-opening img\.pouch-art\s*\{/.test(rules), '그림 자체에 애니메이션을 걸지 않는다');
  // 대신 **바닥(50% 92%)을 축으로 한 탄성** — scaleX/scaleY를 번갈아 주고 `rotate`는 쓰지 않는다.
  const squashRule = css.match(/\.pouch-window-stage\.is-opening \.pouch-art-stack\s*\{([^}]*)\}/);
  assert(squashRule, '탄성 애니메이션 규칙');
  assert(/transform-origin: 50% 92%/.test(squashRule[1]), '바닥을 축으로');
  assert(/animation: pouch-squash 920ms/.test(squashRule[1]), '쪼으는 구간은 절정(0.92초)까지');
  assert(/pouch-settle 320ms[^;]*1080ms forwards/.test(squashRule[1]), '바닥으로 가라앉는 마무리는 1.08초부터');
  assert(css.includes('@keyframes pouch-squash') && css.includes('@keyframes pouch-settle'), '탄성·가라앉기 키프레임');
  const squash = css.slice(css.indexOf('@keyframes pouch-squash'), css.indexOf('@keyframes pouch-settle'));
  assert(/scale\(1\.04,\s*\.95\)/.test(squash) && /scale\(\.96,\s*1\.05\)/.test(squash) && /scale\(1\.06,\s*\.93\)/.test(squash), '부풀었다 눌렸다 반복');
  assert(/scale\(1\.08,\s*1\.08\)/.test(squash), '0.9초쯤 힘을 모은다');
  assert(!/rotate/.test(squash), '좌우 회전 없음');
  const settle = css.slice(css.indexOf('@keyframes pouch-settle'));
  assert(/translateY\(2px\)/.test(settle) && /scaleY|scale\(1\.05,\s*\.97\)/.test(settle), '아래로 가라앉는 translateY·scaleY');
  // 보상 카드는 절정 뒤 1.22초에 뜬다(애니메이션 지연 = 타임라인).
  assert(/pouch-reveal \d+ms[^;]*1220ms both/.test(css), '결과 등장 1.22초');
  assert(css.includes('@keyframes pouch-reveal'), '결과 등장 키프레임');
  assert(css.includes('mix-blend-mode: screen'),'빛은 주머니 위에 screen으로 얹는다');
  // 배경을 지운 투명 PNG라 사각 상자 그림자가 남지 않게 알파를 따라가는 shadow를 쓴다.
  assert(/\.pouch-art-stack\s*\{[^}]*drop-shadow/.test(css) && !/img\.pouch-art\s*\{[^}]*box-shadow:\s*0 8px 22px/.test(css),'투명 그림에는 drop-shadow');
  // 작업 212(`#4973`): 아담한 카드 + 카드·무대 `overflow: visible` — 빛이 팝업 밖까지 퍼진다.
  assert(/\.pouch-window-card\s*\{[^}]*overflow: visible/.test(css),'카드가 빛을 자르지 않는다');
  assert(/\.pouch-window-stage\s*\{[^}]*overflow: visible/.test(css),'무대가 빛을 자르지 않는다');
  assert(/\.pouch-window-card\s*\{[^}]*width: min\(100%, 330px\)/.test(css),'카드를 아담하게');
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert(reduce.includes('.pouch-light') && reduce.includes('display: none'), '모션 감소면 Canvas 빛을 그리지 않는다');
  assert(/\.pouch-window-stage\.is-opening \.pouch-art-stack\s*\{[^}]*animation: none/.test(reduce), '모션 감소면 탄성도 끈다');
  // 작업 213(`#5057`): 빛은 보상 종류·등급과 무관하게 **깨끗한 흰빛**이다.
  assert.equal(pouchGlowInk(), '#ffffff', '빛은 순백색');
  const gearSave = withPouches(1), gear = pouch.openPouch(gearSave, undefined, constant([.60, .70]));
  assert.equal(pouchGlowInk(), '#ffffff', '레전드·레어도 흰빛');
  assert(gear.result.kind === 'equipment');
});

test('빛은 각진 conic 부채꼴·단단한 흰 원판 없이 Canvas가 그린다(작업 214 `#5204`)', async () => {
  // ① CSS에는 뾰족한 살(conic)·흰 원판(glow/flash/halo)·밝기 고정 레이어가 남아 있지 않다.
  assert(!/conic-gradient/.test(rules), '각진 conic-gradient 완전 제거');
  for (const name of ['pouch-glow', 'pouch-flash', 'pouch-halo']) {
    assert(!new RegExp(`\\.${name}[\\s:{]`).test(rules), `${name} CSS 레이어 제거`);
  }
  assert(!/@keyframes pouch-glow/.test(rules) && !/@keyframes pouch-flash/.test(rules) && !/@keyframes pouch-halo/.test(rules), 'CSS 빛 키프레임 제거');
  // ② 대신 팝업보다 살짝 큰 투명 Canvas 한 장 — 누름을 막지 않고 screen으로 얹는다.
  const rule = css.match(/\.pouch-light\s*\{([^}]*)\}/);
  assert(rule, '.pouch-light 규칙');
  assert(/pointer-events: none/.test(rule[1]), '누름을 막지 않는다');
  assert(/mix-blend-mode: screen/.test(rule[1]), '빛으로만 얹는다');
  assert(/position: absolute/.test(rule[1]) && !/position: fixed/.test(rule[1]), '화면 전체가 아니라 무대 안쪽 절대 위치');
  const width = rule[1].match(/width: (\d+)px/);
  assert(width && Number(width[1]) >= 480 && Number(width[1]) <= 640, '팝업(330px)보다 살짝 큰 480~640px');
  // ③ Canvas는 60fps rAF로만 그리고, 빛은 순백색 하나만 쓴다.
  const light = await import('../src/ui/pouchLight.ts');
  assert(light.POUCH_LIGHT_MOTES >= 20 && light.POUCH_LIGHT_MOTES <= 30, '모여드는 가루 20~30개');
  assert(light.POUCH_LIGHT_SPARKS >= 30 && light.POUCH_LIGHT_SPARKS <= 40, '사방으로 흩어지는 입자 30~40개');
  const inks = [];
  const ctx = {
    setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    createRadialGradient() { return { addColorStop(_stop, color) { inks.push(color); } }; },
    set fillStyle(value) { if (typeof value === 'string') inks.push(value); }, get fillStyle() { return ''; },
    set strokeStyle(value) { if (typeof value === 'string') inks.push(value); }, get strokeStyle() { return ''; }, set lineWidth(_value) {},
    globalCompositeOperation: 'source-over',
  };
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const frames = [];
  globalThis.document = { createElement: tag => { const node = element(tag); if (tag === 'canvas') node.getContext = () => ctx; return node; } };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const handle = light.createPouchLight('#ffffff');
    assert(handle, 'Canvas 빛 핸들');
    assert.equal(handle.canvas.className, 'pouch-light');
    assert.equal(handle.canvas.attrs['aria-hidden'], 'true', '보조기기에서 숨긴다');
    assert.equal(handle.canvas.width, light.POUCH_LIGHT_SIZE);
    handle.start(POUCH_BURST_MS, POUCH_OPEN_MS);   // 920ms 절정 · 1550ms 종료
    assert(frames.length >= 1, 'rAF로 첫 프레임을 예약한다');
    const startedAt = globalThis.performance.now();
    /** 한 프레임을 그리고, 그 프레임에서 가장 밝은 흰빛의 알파를 돌려준다. */
    const paintAt = (time) => {
      inks.length = 0;
      frames.shift()(startedAt + time);
      assert(frames.length >= 1, '다음 프레임을 이어서 예약한다');
      const alphas = inks.map(ink => Number(ink.match(/,([\d.]+)\)$/)?.[1] ?? '0'));
      return Math.max(0, ...alphas);
    };
    const build = paintAt(520);                // 쪼으는 구간
    assert(inks.length >= 4, '가우시안 빛을 여러 겹 그린다');
    for (const ink of inks) assert(/^rgba\(255,255,255,[\d.]+\)$/.test(ink), `순백색만: ${ink}`);
    const beforeBurst = paintAt(POUCH_BURST_MS - 60);
    const atBurst = paintAt(POUCH_BURST_MS);   // 절정 — 순백 섬광이 가장 밝다
    assert(atBurst > beforeBurst && atBurst > build, '빛의 피크가 정확히 0.92초 절정에 온다');
    assert(atBurst >= .2, '절정은 팝업을 감싸는 밝은 섬광');
    paintAt(POUCH_BURST_MS + 80);
    assert(paintAt(POUCH_BURST_MS + 300) < atBurst, '섬광은 곧 가라앉는다');
    inks.length = 0;
    frames.shift()(startedAt + POUCH_BURST_MS + 25);   // 절정 + 25ms — 입자가 사방으로 흩어진다
    const dots = inks.filter(ink => ink !== undefined).length;
    assert(dots > light.POUCH_LIGHT_SPARKS, '절정에 입자를 그린다');
    for (const ink of inks) assert(/^rgba\(255,255,255,[\d.]+\)$/.test(ink), '입자도 순백색만');
    handle.stop();
  } finally {
    globalThis.document = previousDocument;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('2D 컨텍스트가 없으면 Canvas 빛 없이 조용히 연출하고, 개봉 창에는 Canvas 한 장만 얹힌다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(1);
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message() {}, world: { save, onChange() {} } };
    const api = openPouchWindow(ui, undefined, { delay: 0 });
    const stage = find(api.overlay, node => node.className === 'pouch-window-stage');
    assert(stage, '연출 무대');
    // Canvas 스텁에는 getContext가 없으므로 빛 없이 그림·결과만 남는다(브라우저가 아니어도 터지지 않는다).
    assert(!find(api.overlay, node => node.className === 'pouch-light'), '컨텍스트가 없으면 Canvas를 만들지 않는다');
    assert(!find(api.overlay, node => String(node.className).includes('pouch-glow')), 'CSS 글로우 레이어 없음');
    assert(!find(api.overlay, node => String(node.className).includes('pouch-flash')), 'CSS 섬광 레이어 없음');
    assert(!find(api.overlay, node => String(node.className).includes('pouch-halo')), 'CSS 후광 레이어 없음');
    assert(!find(api.overlay, node => node.className === 'pouch-flash-screen'), '전체 화면 섬광은 없다');
    api.close();
  } finally { globalThis.document = previous; }
});

test('큰 개봉 창은 [열기]에서 3컷을 0.92초·1.08초에 차례로 겹쳐 넘긴다(작업 215)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(2);
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message() {}, world: { save, onChange() {} } };
    const api = openPouchWindow(ui, undefined, { delay: 30 });
    const stage = find(api.overlay, node => node.className === 'pouch-window-stage');
    const stack = find(api.overlay, node => node.className === 'pouch-art-stack');
    assert(stage && stack, '주머니 그림과 연출 무대');
    const layers = () => stack.children.filter(child => child.tag === 'img');
    assert.equal(layers().length, 2, '그림 두 장을 겹쳐 둔다');
    const front = () => layers().find(child => String(child.className).includes('is-front'));
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[0], '처음에는 닫힌 주머니');
    assert.equal(stage.dataset.frame, '1');
    const open = find(api.overlay, node => node.textContent === '열기');
    open.onclick();
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[0], '누른 직후에는 1컷(닫힘)');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    // 0.92초 지점까지는 1번 컷 한 장 그대로(모양이 움직이지 않는다), 그 뒤 1.08초에 3번 컷.
    await wait(POUCH_BURST_MS - 120);
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[0], '절정 직전까지 1컷(닫힘) 유지');
    await wait(200);
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[1], `${POUCH_FRAME_AT[1]}ms — 2컷(풀리며 무너짐)`);
    assert.equal(stage.dataset.frame, '2');
    await wait(POUCH_FRAME_AT[2] - POUCH_FRAME_AT[1] + 120);
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[2], `${POUCH_FRAME_AT[2]}ms — 3컷(바닥에 납작)`);
    assert.equal(stage.dataset.frame, '3');
    assert.equal(stack.dataset.pouchFrame, '2', '넘긴 컷 번호가 스택에 남는다(전환 길이 규칙이 읽는다)');
    // `1개 더 열기`는 다시 닫힌 주머니(1컷)부터 새로 시작한다(두 장 모두 되돌린다).
    const again = find(api.overlay, node => node.textContent === '1개 더 열기');
    assert(again, '[1개 더 열기]');
    again.onclick();
    assert.equal(front().src, pouchArt.POUCH_FRAME_URLS[0], '다시 1컷부터');
    assert.equal(stack.dataset.pouchFront, '0', '되돌릴 때는 앞 장을 다시 1번 레이어로');
    api.close();
  } finally { globalThis.document = previous; }
});

test('결과 토스트·레전드 전광판은 누른 즉시가 아니라 보상 카드가 뜨는 1.22초에 나간다(작업 214 `#5228` → 215)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(1);
    const messages = [];
    const shared = [];
    const ui = {
      root: element(), modal: element(), openModal: 'equipment', renderModal() {},
      message(text) { messages.push(text); }, sharePouchLegend(name) { shared.push(name); },
      world: { save, onChange() {} }
    };
    const api = openPouchWindow(ui);            // 실제 연출 길이(1.8초)
    const open = find(api.overlay, node => node.textContent === '열기');
    open.onclick();
    assert.equal(messages.length, 0, '누른 직후에는 정답을 알려 주지 않는다(스포일러 없음)');
    assert.equal(shared.length, 0, '전광판도 아직');
    await new Promise(resolve => setTimeout(resolve, POUCH_RESULT_MS - 200));
    assert.equal(messages.length, 0, '절정 직후에도 아직 결과를 알리지 않는다');
    await new Promise(resolve => setTimeout(resolve, 340));
    assert.equal(messages.length, 1, '보상 카드가 뜨는 시각에 결과 토스트');
    assert(messages[0].includes('무작위 보물 주머니'), '주머니 이름과 결과');
    api.close();
  } finally { globalThis.document = previous; }
});

test('가방 칸 수량 배지는 스킬북은 오른쪽 아래·주머니는 오른쪽 위에 붙고 칸은 모두 1:1 정사각형이다(작업 212 `#4936`·`#4960`·`#5006`)', () => {
  // 스킬북 칸에서 세로로 길쭉하게 만들던 규칙은 없어졌다(다른 칸과 같은 정사각형).
  assert(!/\.bag-item\.skillbook-item\s*\{[^}]*aspect-ratio: auto/.test(css), '스킬북 칸 aspect-ratio: auto 제거');
  assert(!/\.bag-item\.skillbook-item\s*\{[^}]*min-height: 84px/.test(css), '스킬북 칸 min-height: 84px 제거');
  assert(/\.bag-item\.skillbook-item\s*\{[^}]*aspect-ratio: 1/.test(css), '스킬북 칸도 1:1 정사각형');
  // 직업 배지(왼쪽 위)와 `×1`이 겹치지 않게 스킬북 수량은 오른쪽 아래로.
  assert(/\.bag-item\.skillbook-item \.skillbook-count\s*\{[^}]*bottom: 1px/.test(css), '스킬북 ×1은 오른쪽 아래');
  assert(/\.bag-item\.skillbook-item \.skillbook-count\s*\{[^}]*right: 2px/.test(css), '스킬북 ×1은 오른쪽');
  // 주머니 칸은 `×100` 같은 세 자리도 들어가게 오른쪽 위 그대로.
  assert(/\.skillbook-count\s*\{[^}]*top: 2px[^}]*right: 2px/.test(css), '주머니 ×N은 오른쪽 위');
  assert(/\.skillbook-count\s*\{[^}]*white-space: nowrap/.test(css), '세 자리 수량이 줄바꿈되지 않는다');
  // 가방 10칸은 셀에서도 수량 배지를 단다(스킬북 ×1 유지 — `#4960`).
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(100);
    save.job = 'warrior';
    save.bag.push({ id: 'b1', name: '[스킬북] 더블 샷', slot: 'skillbook', kind: 'skillbook', skillId: 'doubleShot', rarity: 'rare', stats: {} });
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const pouchCell = grid.children.find(node => String(node.className).includes('pouch-item'));
    assert(toString(pouchCell).includes('×100'), '주머니 100개도 ×100으로 표시');
    const bookCell = grid.children.find(node => String(node.className).includes('skillbook-item'));
    assert(bookCell, '스킬북 칸');
    assert(toString(bookCell).includes('×1'), '스킬북도 ×1 표시');
  } finally { globalThis.document = previous; }
});

test('가방에서 주머니 그림을 한 번 누르면 상세 패널 없이 바로 개봉 창이 열린다(작업 212 `#4984`)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag), body: element() };
  try {
    const save = withPouches(2);
    const modal = element(); modal.querySelector = () => undefined;
    const ui = { root: element(), modal, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', renderModal() {}, message() {}, world: { save, onChange() {} }, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const cell = grid.children.find(node => String(node.className).includes('pouch-item'));
    assert(cell, '가방의 주머니 칸');
    cell.onclick();
    assert.equal(ui.root.children.length, 1, '한 번 누르면 개봉 창이 바로 얹힌다');
    const overlay = ui.root.children[0];
    assert(String(overlay.className).includes('pouch-window'));
    assert(find(overlay, node => node.textContent === '열기'), '가운데 [열기] 버튼');
    assert.equal(find(overlay, node => node.className === 'pouch-window-title').textContent, '무작위 보물 주머니');
  } finally { globalThis.document = previous; }
});

test('개봉 결과 카드는 획득·등급 글자 없이 그림과 등급 색 이름만 보여 준다(작업 213 `#5057`)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const gold = pouchResultCard({ kind: 'gold', gold: 3000 });
    assert(gold.className.includes('pouch-result-gold'));
    assert(toString(gold).includes('3,000'));
    // 작업 212(`#4936`): 금화 당첨도 장비·스킬북처럼 큰 그림으로 드러난다 — 우리 게임 금화 뭉치.
    const pile = find(gold, node => node.tag === 'img' && node.src === pouchArt.POUCH_GOLD_PILE_URL);
    assert(pile, '금화 뭉치 그림');
    assert(find(gold, node => String(node.className).includes('pouch-result-pile')), '금화는 큰 그림 자리');
    assert(css.includes('.pouch-result-art.pouch-result-pile img'), '금화 뭉치 크기 규칙');
    // `금화 획득` 같은 분류 문구가 없다.
    assert(!toString(gold).includes('획득'), '금화 획득 문구 없음');
    assert(!find(gold, node => String(node.className).includes('pouch-result-label')), '분류 라벨 없음');
    const gearSave = withPouches(1);
    const gear = pouch.openPouch(gearSave, undefined, constant([.60, .70]));
    const card = pouchResultCard(gear.result);
    const name = find(card, node => node.className?.includes('pouch-result-name'));
    assert(name.className.includes('rarity-rare'),'등급 색은 이름 색으로 유지');
    assert(name.textContent.includes('황혼의'),'이름');
    // `장비 획득` 문구도, `레어` 같은 등급 글자도 없다.
    const text = toString(card);
    assert(!text.includes('획득'), '장비 획득 문구 없음');
    assert(!text.includes('레어'), '등급 글자 없음');
    assert(!find(card, node => String(node.className).includes('pouch-result-grade')), '등급 라벨 없음');
    assert(!find(card, node => String(node.className).includes('pouch-result-label')), '분류 라벨 없음');
    // 카드 안에는 그림과 이름 둘뿐이다.
    assert.equal(card.children.length, 2, '그림 + 이름');
    const book = pouch.openPouch(withPouches(1), undefined, constant([.98]));
    const bookCard = pouchResultCard(book.result);
    assert(!toString(bookCard).includes('스킬북 획득'), '스킬북 획득 문구 없음');
    assert(!toString(bookCard).includes('획득'));
    // CSS에 라벨·등급 규칙도 남지 않는다.
    assert(!css.includes('.pouch-result-label') && !css.includes('.pouch-result-grade'), '없어진 라벨 CSS도 제거');
  } finally { globalThis.document = previous; }
});

test('결과 카드의 이름·수치 글자는 그림보다 작다 — 그림이 주인공(작업 213 `#5069`)', () => {
  const art = css.match(/\.pouch-result-art img, \.pouch-result-sheet \{([^}]*)\}/);
  const name = css.match(/\.pouch-result-name \{([^}]*)\}/);
  const gold = css.match(/\.pouch-result-gold \{([^}]*)\}/);
  assert(art && name && gold, '그림·이름·금화 규칙');
  const artSize = Number(art[1].match(/width: (\d+)px/)[1]);
  const nameSize = Number(name[1].match(/font-size: ([\d.]+)px/)[1]);
  const goldSize = Number(gold[1].match(/font-size: ([\d.]+)px/)[1]);
  assert(artSize >= 52, `보상 그림은 52px 이상 (${artSize}px)`);
  assert(nameSize < artSize / 3, `이름 글자는 그림의 1/3 미만 (${nameSize}px < ${artSize}px)`);
  assert(goldSize < artSize / 3, `금화 수치도 그림의 1/3 미만 (${goldSize}px)`);
  assert(/line-height: 1\.2/.test(name[1]), '이름 줄간격을 단정하게');
  assert(/overflow-wrap: anywhere/.test(name[1]), '긴 이름은 줄바꿈');
  // 예전 14px/15px 이름·수치보다 확실히 작다.
  assert(nameSize <= 12 && goldSize <= 12.5, '이름·수치 12px 내외');
});

// ── helpers ──────────────────────────────────────────────────────────────────
function withPouches(count) {
  const save = freshSave();
  save.maxFloor = 20; save.floor = 20;
  save.bag = Array.from({ length: count }, (_, index) => items.pouchItem(`p${index + 1}`));
  return save;
}
function constant(values) { let index = 0; return () => values[Math.min(index++, values.length - 1)]; }
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false, disabled: false, offsetWidth: 1,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); }, setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    remove() { const parent = this.parent; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parent = undefined; },
    addEventListener() {}, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove(name) { node.className = node.className.replace(new RegExp(`(^|\\s)${name}(?=\\s|$)`), ' '); }, toggle(name, on) { if (on) this.add(name); } };
  Object.defineProperty(node, 'childElementCount', { get() { return node.children.length; } });
  return node;
}
function find(node, test) { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node; for (const child of node.children ?? []) { const hit = find(child, test); if (hit) return hit; } return undefined; }
function toString(node) {
  if (!node || typeof node !== 'object') return String(node ?? '');
  return (node.textContent ?? '') + (node.innerHTML ?? '') + (node.children ?? []).map(toString).join('');
}
