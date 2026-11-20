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
const { pouchRatesPanel, pouchResultCard, openPouchWindow, pouchGlowInk, POUCH_OPEN_MS, POUCH_FRAME_AT, POUCH_RESULT_MS } = await import('../src/ui/modals/pouchModal.ts');
const pouchArt = await import('../src/ui/pouchArt.ts');
const { itemDetail, renderInventory } = await import('../src/ui/modals/equipModal.ts');
const css = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');

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
    const again = find(api.overlay, node => node.textContent === '한 번 더 열기');
    assert(again,'더 남으면 [한 번 더 열기]');
    again.onclick();
    assert.equal(pouch.pouchCount(save), 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    const actions = find(api.overlay, node => node.className === 'pouch-window-actions');
    const primary = actions.children[0], closeAction = actions.children[1];
    assert.equal(primary.textContent, '확인','주머니가 없으면 [열기]가 [확인]이 된다');
    assert.equal(closeAction.className, 'pouch-close');
    closeAction.onclick();
    assert.equal(ui.root.children.length, 0,'[확인]으로 닫힌다');
  } finally { globalThis.document = previous; }
});

test('개봉 그림 4장은 투명 배경 512×512 PNG이고 가방 아이콘은 닫힌 주머니를 쓴다', () => {
  assert.deepEqual([...pouchArt.POUCH_FRAME_URLS], [
    '/assets/icons/treasure_pouch_v2.png', '/assets/icons/treasure_pouch_step2_v2.png',
    '/assets/icons/treasure_pouch_step3_v2.png', '/assets/icons/treasure_pouch_open_v2.png'
  ],'닫힘 → 끈 헐거워짐 → 빛 새어 나옴 → 활짝');
  assert.equal(new Set(pouchArt.POUCH_FRAME_URLS).size, 4,'네 장은 서로 다른 파일');
  assert.equal(pouchArt.POUCH_ART_URL, pouchArt.POUCH_FRAME_URLS[0],'개봉 창은 닫힌 주머니로 시작');
  assert.equal(pouchArt.POUCH_ICON_URL, pouchArt.POUCH_FRAME_URLS[0],'가방 아이콘도 닫힌 주머니');
  assert.equal(pouchArt.pouchFrameUrl(0), pouchArt.POUCH_FRAME_URLS[0]);
  assert.equal(pouchArt.pouchFrameUrl(3), pouchArt.POUCH_FRAME_URLS[3]);
  assert.equal(pouchArt.pouchFrameUrl(9), pouchArt.POUCH_FRAME_URLS[3],'범위를 넘으면 마지막 단계');
  assert.equal(pouchArt.pouchFrameUrl(-2), pouchArt.POUCH_FRAME_URLS[0],'음수는 1단계');
  for (const url of pouchArt.POUCH_FRAME_URLS) {
    assert.match(url, /^\/assets\/icons\/treasure_pouch(_step\d|_open)?_v2\.png$/,'캐시를 피하는 새 이름');
    const file = readFileSync(new URL(`../public${url}`, import.meta.url));
    assert.equal(file.toString('ascii', 1, 4), 'PNG', `${url} PNG`);
    assert.equal(file.readUInt32BE(16), 512, `${url} 가로 512`);
    assert.equal(file.readUInt32BE(20), 512, `${url} 세로 512`);
    assert.equal(file[25], 6, `${url} RGBA(투명 배경)`);
  }
});

test('개봉은 0.2·0.42·0.64초에 그림이 4단계로 바뀌고 0.9초에 결과 카드가 뜨며 모션 감소도 대응한다', () => {
  assert.deepEqual([...POUCH_FRAME_AT], [0, 200, 420, 640], '그림이 바뀌는 시각');
  assert.equal(POUCH_RESULT_MS, 900, '보상 카드 등장');
  assert(POUCH_OPEN_MS >= 800 && POUCH_OPEN_MS <= 1000, `연출 ${POUCH_OPEN_MS}ms`);
  // CSS 애니메이션 지연이 위 시각과 같아야 한다(같은 박자로 움직인다).
  assert(/pouch-shake 200ms/.test(css), '1단계 흔들림은 0.20초');
  assert(/pouch-burst 700ms 200ms/.test(css), '2~4단계 부풀기는 0.20초부터 0.90초까지');
  assert(/pouch-glow 520ms[^;]*420ms both/.test(css), '빛은 끈이 풀리는 0.42초부터');
  assert(/pouch-flash 300ms[^;]*620ms both/.test(css), '섬광은 활짝 열리는 0.64초 언저리');
  assert(/pouch-reveal 420ms[^;]*900ms both/.test(css), '결과 등장은 빛이 퍼진 뒤(0.90초) 시작');
  for (const name of ['pouch-shake', 'pouch-burst', 'pouch-glow', 'pouch-flash', 'pouch-reveal']) assert(css.includes(`@keyframes ${name}`), `${name} 키프레임`);
  assert(css.includes('.pouch-window-stage.is-opening .pouch-art'),'단계 전환은 주머니 그림에');
  assert(css.includes('.pouch-window-stage.is-opening .pouch-glow'),'빛은 글로우 레이어에');
  assert(css.includes('.pouch-flash'),'섬광 레이어');
  assert(css.includes('.pouch-window-stage.is-opening .pouch-window-result'),'결과 카드는 늦게 등장');
  assert(css.includes('mix-blend-mode: screen'),'빛은 주머니 위에 screen으로 얹는다');
  // 배경을 지운 투명 PNG라 사각 상자 그림자가 남지 않게 알파를 따라가는 shadow를 쓴다.
  assert(/img\.pouch-art\s*\{[^}]*drop-shadow/.test(css) && !/img\.pouch-art\s*\{[^}]*box-shadow:\s*0 8px 22px/.test(css),'투명 그림에는 drop-shadow');
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert(reduce.includes('.pouch-window-stage.is-opening .pouch-art') && reduce.includes('.pouch-glow') && reduce.includes('.pouch-flash'),'모션 감소 대응');
  // 빛 색은 보상 종류를 따른다 — 금화·스킬북은 황금빛, 장비는 그 등급 색.
  const goldSave = withPouches(1), gold = pouch.openPouch(goldSave, undefined, constant([.10, .10]));
  assert.equal(pouchGlowInk(gold.result), '#ffd977');
  const gearSave = withPouches(1), gear = pouch.openPouch(gearSave, undefined, constant([.60, .70]));
  assert.equal(pouchGlowInk(gear.result), pouch.POUCH_RARITY_INK.rare);
});

test('큰 개봉 창은 [열기]에서 닫힌 주머니부터 4단계로 그림을 갈아 끼운다(0.2·0.42·0.64초)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(2);
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message() {}, world: { save, onChange() {} } };
    const api = openPouchWindow(ui, undefined, { delay: 30 });
    const stage = find(api.overlay, node => node.className === 'pouch-window-stage');
    const art = find(api.overlay, node => typeof node.className === 'string' && node.className.includes('pouch-art'));
    assert(stage && art, '주머니 그림과 연출 무대');
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[0], '처음에는 닫힌 주머니');
    assert.equal(stage.dataset.frame, '1');
    const open = find(api.overlay, node => node.textContent === '열기');
    open.onclick();
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[0], '누른 직후에도 1단계(흔들림)');
    await new Promise(resolve => setTimeout(resolve, 260));
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[1], '0.2초 — 끈 헐거워짐');
    assert.equal(stage.dataset.frame, '2');
    await new Promise(resolve => setTimeout(resolve, 220));
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[2], '0.42초 — 끈 풀리고 빛이 새어 나옴');
    await new Promise(resolve => setTimeout(resolve, 220));
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[3], '0.64초 — 활짝 열림');
    assert.equal(stage.dataset.frame, '4');
    await new Promise(resolve => setTimeout(resolve, 300));
    // `한 번 더 열기`는 다시 닫힌 주머니(1단계)부터 새로 시작한다.
    const again = find(api.overlay, node => node.textContent === '한 번 더 열기');
    assert(again, '[한 번 더 열기]');
    again.onclick();
    assert.equal(art.src, pouchArt.POUCH_FRAME_URLS[0], '다시 1단계부터');
    assert.equal(stage.dataset.frame, '1');
    await new Promise(resolve => setTimeout(resolve, 10));
    api.close();
  } finally { globalThis.document = previous; }
});

test('개봉 결과 카드는 금화는 금화로, 장비·스킬북은 등급 색 이름으로 보여 준다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const gold = pouchResultCard({ kind: 'gold', gold: 3000 });
    assert(gold.className.includes('pouch-result-gold'));
    assert(toString(gold).includes('3,000'));
    const gearSave = withPouches(1);
    const gear = pouch.openPouch(gearSave, undefined, constant([.60, .70]));
    const card = pouchResultCard(gear.result);
    const name = find(card, node => node.className?.includes('pouch-result-name'));
    assert(name.className.includes('rarity-rare'),'등급 색');
    assert(name.textContent.includes('황혼의'),'이름');
    const book = pouch.openPouch(withPouches(1), undefined, constant([.98]));
    assert(toString(pouchResultCard(book.result)).includes('스킬북 획득'));
  } finally { globalThis.document = previous; }
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
