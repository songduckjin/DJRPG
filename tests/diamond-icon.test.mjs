import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import './ts-loader.mjs';
const { diamondIconMarkup, diamondMarkup, diamondNode } = await import('../src/ui/currency.ts');
const { renderShop, DIAMOND_PACK_ART } = await import('../src/ui/modals/shopModal.ts');

const ROOT = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, ROOT), 'utf8');
/** 주석은 뺀 코드만 본다 — 주석에는 옛 `◆` 표기를 작업 기록으로 남겨 두었다. */
const codeOnly = text => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*(\/\/|\*)/.test(line)).join('\n');
const UI_FILES = ['src/ui/currency.ts', 'src/ui/hud.ts', 'src/ui/interface.ts', 'src/ui/modals/shopModal.ts', 'src/ui/modals/charactersModal.ts', 'src/ui/modals/utilityModal.ts'];

function node(tag = 'div') {
  const n = { tag, children: [], dataset: {}, attrs: {}, className: '', textContent: '', innerHTML: '', src: '', alt: '', disabled: false,
    append(...children) { this.children.push(...children); },
    setAttribute(k, v) { this.attrs[k] = v; },
    classList: { add(c) { n.className += ` ${c}`; }, toggle(c, on) { if (on) n.className += ` ${c}`; } } };
  return n;
}
function findAll(n, test, out = []) { if (!n || typeof n !== 'object') return out; if (test(n)) out.push(n); for (const child of n.children ?? []) findAll(child, test, out); return out; }
function find(n, test) { return findAll(n, test)[0]; }
function withDoc(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: node };
  try { return run(); } finally { globalThis.document = previous; }
}

test('다이아 그림은 금화와 같은 방식의 18px PNG 이고 글자 ◆ 가 아니다 (작업 261)', () => {
  assert.equal(diamondIconMarkup, '<img class="currency-icon currency-diamond" src="/assets/icons/diamond.png" alt="다이아">');
  assert.equal(diamondIconMarkup.includes('◆'), false, '평면 마름모 글자를 쓰지 않는다');
  assert.match(diamondIconMarkup, /alt="다이아"/, '그림이라 화면 읽기용 이름은 alt가 맡는다');
  const asset = new URL('public/assets/icons/diamond.png', ROOT);
  const stat = statSync(asset);
  assert.ok(stat.size > 0 && stat.size <= 60 * 1024, `diamond.png ${stat.size}B — 금화(18KB)와 같은 급으로 가볍다`);
  const head = readFileSync(asset).subarray(0, 8);
  assert.equal(head.subarray(0, 4).toString('hex'), '89504e47', 'PNG 시그니처');
  // 128×128 RGBA — 18px로 줄여도 컷·광택이 남고 투명 배경 위에 얹힌다.
  const png = readFileSync(asset);
  assert.equal(png.readUInt32BE(16), 128, '너비 128px');
  assert.equal(png.readUInt32BE(20), 128, '높이 128px');
  assert.equal(png[25], 6, 'RGBA(컬러 + 알파)');
});

test('diamondMarkup 은 그림 + 천 단위 숫자이고 접두·접미사를 붙일 수 있다', () => {
  assert.equal(diamondMarkup(1500), `${diamondIconMarkup}<span>1,500</span>`);
  assert.equal(diamondMarkup(1500, { suffix: '개' }), `${diamondIconMarkup}<span>1,500개</span>`);
  assert.equal(diamondMarkup(1000, { prefix: '다이아 ', suffix: '개' }), `${diamondIconMarkup}<span>다이아 1,000개</span>`);
  assert.equal(diamondMarkup(-5), `${diamondIconMarkup}<span>0</span>`, '음수는 0');
  assert.equal(diamondMarkup(Number.NaN), `${diamondIconMarkup}<span>0</span>`, '숫자가 아니면 0');
});

test('diamondNode 는 금화(goldNode)와 같은 모양의 currency-amount span 을 만든다', () => {
  withDoc(() => {
    const plain = diamondNode(1000);
    assert.equal(plain.className, 'currency-amount');
    assert.equal(plain.innerHTML, diamondMarkup(1000));
    const labelled = diamondNode(4000, '다이아 ', '개');
    assert.equal(labelled.innerHTML, diamondMarkup(4000, { prefix: '다이아 ', suffix: '개' }));
    assert.equal(labelled.innerHTML.includes('◆'), false);
  });
});

test('HUD·상점·캐릭터·우편 어디에도 ◆ 글자 마크업이 남지 않는다', () => {
  for (const path of UI_FILES) {
    const code = codeOnly(source(path));
    assert.equal(code.includes('◆'), false, `${path} 에 ◆ 가 남아 있다`);
  }
});

test('상단 HUD 다이아는 diamondMarkup 으로 그린다', () => {
  const code = codeOnly(source('src/ui/hud.ts'));
  assert.match(code, /import \{[^}]*diamondMarkup[^}]*\} from '\.\/currency'/);
  assert.match(code, /class="diamonds"[\s\S]{0,120}\$\{diamondMarkup\(this\.shopCatalog\?\.wallet\.diamonds \?\? 0\)\}/);
  assert.match(code, /aria-label="다이아 \$\{this\.shopCatalog\?\.wallet\.diamonds \?\? 0\}개"/, '읽어 줄 이름은 그대로 둔다');
});

test('우측 상점 버튼(.shop-entry)은 ◆ 대신 다이아 상자 그림을 쓴다', () => {
  const code = codeOnly(source('src/ui/interface.ts'));
  assert.match(code, /import \{[^}]*DIAMOND_PACK_ART[^}]*\} from '\.\/modals\/shopModal'/, '상점 대표 그림과 같은 에셋 상수를 쓴다');
  assert.doesNotMatch(code, /shopEntry\.textContent/, '버튼에 글자를 넣지 않는다');
  assert.match(code, /shopEntryArt\.src = DIAMOND_PACK_ART/, '상자 그림을 버튼에 넣는다');
  assert.match(code, /shopEntry\.append\(shopEntryArt\)/);
  assert.match(code, /shopEntry\.setAttribute\('aria-label', '상점'\)/, '그림 버튼이라 이름은 그대로 둔다');
  assert.equal(DIAMOND_PACK_ART, '/assets/shop/diamond_pack_v1.webp');
});

test('상점 잔액·다이아 카드·패키지 카드는 그림과 숫자로 그린다', () => {
  const catalog = {
    wallet: { diamonds: 1250, maxSlots: 3 },
    diamondPacks: [{ id: 'diamond_500', diamonds: 500, price: 5500 }],
    packages: [{ id: 'slot', name: '캐릭터 슬롯 추가', diamonds: 500, available: true }],
    paymentReady: true
  };
  withDoc(() => {
    for (const tab of ['diamonds', 'packages']) {
      const dialog = node(), ui = { shopCatalog: catalog, shopTab: tab, renderModal() {} };
      renderShop(ui, dialog);
      const balance = find(dialog, n => n.className === 'shop-balance');
      assert.ok(balance.innerHTML.includes('currency-diamond'), '잔액 줄에 다이아 그림');
      assert.match(balance.innerHTML, /src="\/assets\/icons\/diamond\.png"/);
      assert.match(balance.innerHTML, /보유 다이아 1,250개/);
      assert.equal(balance.innerHTML.includes('◆'), false);
      const amounts = findAll(dialog, n => String(n.innerHTML).includes('currency-diamond') && n !== balance);
      assert.equal(amounts.length, 1, `${tab} 탭 카드 금액 한 곳`);
      assert.match(amounts[0].innerHTML, /<span>500개<\/span>/);
      assert.equal(amounts[0].innerHTML.includes('◆'), false);
    }
  });
});

test('캐릭터 슬롯 추가 버튼과 우편 보상도 같은 그림을 쓴다', () => {
  const characters = codeOnly(source('src/ui/modals/charactersModal.ts'));
  assert.match(characters, /addSlot\.innerHTML = `＋ 슬롯 추가 · \$\{diamondMarkup\(500\)\}`/);
  assert.match(characters, /addSlot\.setAttribute\('aria-label', '캐릭터 슬롯 추가 · 다이아 500개'\)/);
  const utility = codeOnly(source('src/ui/modals/utilityModal.ts'));
  assert.match(utility, /import \{[^}]*diamondNode[^}]*\} from '\.\.\/currency'/);
  assert.match(utility, /reward\.append\(diamondNode\(mail\.diamonds,'다이아 ','개'\)\)/);
});

test('CSS — 다이아 그림 정렬과 상점 버튼 그림 채우기', () => {
  const base = source('src/styles/base.css');
  assert.match(base, /\.currency-diamond\s*\{[^}]*vertical-align:\s*middle/, '금화와 같은 세로 정렬');
  const hud = source('src/styles/hud.css');
  assert.match(hud, /\.diamonds\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*gap:\s*4px/, '금화 줄과 같은 정렬');
  assert.match(hud, /\.utility-nav \.shop-entry\s*\{[^}]*padding:\s*0[^}]*overflow:\s*hidden[^}]*border:\s*1px solid #6aa9ce/, '파란 테두리 유지 + 그림이 넘치지 않게');
  assert.doesNotMatch(hud, /\.utility-nav \.shop-entry\s*\{[^}]*text-shadow/, '글자 시절 그림자를 남기지 않는다');
  assert.match(hud, /\.utility-nav \.shop-entry img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/);
});
