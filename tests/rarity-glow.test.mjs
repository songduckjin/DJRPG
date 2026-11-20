import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 작업 217 — 장비 등급색 펄스 글로우. 화면에서 실제로 보이는 규칙(등급색·숨쉬기·접근성)을
// CSS 텍스트로 확인한다. 값(색·번짐·주기)은 `src/styles/rarity.css` 한 곳이 기준이다.
const rarityStyles = readFileSync(new URL('../src/styles/rarity.css', import.meta.url), 'utf8');
const mainStyles = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const modalStyles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
const marketStyles = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
const codexStyles = readFileSync(new URL('../src/styles/codex.css', import.meta.url), 'utf8');
const equipModal = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const marketModal = readFileSync(new URL('../src/ui/modals/marketModal.ts', import.meta.url), 'utf8');
const codexModal = readFileSync(new URL('../src/ui/modals/codexModal.ts', import.meta.url), 'utf8');
const equippedDetail = readFileSync(new URL('../src/ui/equippedDetail.ts', import.meta.url), 'utf8');

const grades = ['magic', 'rare', 'epic', 'unique', 'legendary'];
const palette = { magic: '#60a5fa', rare: '#facc15', epic: '#c084fc', unique: '#fb923c', legendary: '#f87171' };

/** `--rp-*` 토큰을 담은 규칙 블록을 등급별로 꺼낸다. */
function tokenBlocks() {
  const blocks = {};
  for (const chunk of rarityStyles.split('}')) {
    const grade = grades.find(name => new RegExp(`\\.${name},?\\s*$|\\.${name}\\s*\\{`, 'm').test(chunk.split('{')[0]) && chunk.includes('--rp-ink'));
    if (!grade) continue;
    const body = chunk.slice(chunk.indexOf('{') + 1);
    const token = name => body.match(new RegExp(`--rp-${name}:\\s*([^;]+);`))?.[1].trim();
    blocks[grade] = {
      ink: token('ink'), soft: token('soft'), bloom: token('bloom'),
      inner: parseFloat(token('in')), innerBloom: parseFloat(token('in-bloom')),
      outer: parseFloat(token('out')), outerBloom: parseFloat(token('out-bloom')),
      cycle: parseFloat(token('cycle'))
    };
  }
  return blocks;
}

function alphaOf(hex) {
  assert.match(hex, /^#[0-9a-f]{8}$/, `${hex}는 8자리 hex(투명도 포함)여야 한다`);
  return parseInt(hex.slice(7, 9), 16);
}

test('등급 글로우 스타일은 다른 화면 스타일 뒤에 실려 같은 선택자를 덮어쓴다', () => {
  const order = [...mainStyles.matchAll(/@import '\.\/([\w-]+)\.css';/g)].map(match => match[1]);
  assert.ok(order.includes('rarity'), 'main.css가 rarity.css를 부른다');
  assert.ok(order.indexOf('rarity') > order.indexOf('modals'), '가방·장착 슬롯 규칙보다 뒤');
  assert.ok(order.indexOf('rarity') > order.indexOf('market'), '거래소 규칙보다 뒤');
  assert.ok(order.indexOf('rarity') > order.indexOf('codex'), '도감 규칙보다 뒤');
  assert.equal(order.at(-1), 'rarity', '맨 마지막에 실려 같은 특이도에서 이긴다');
});

test('숨쉬기 키프레임은 테두리 안쪽·바깥쪽 두 겹을 같은 순서로 오간다', () => {
  const keyframes = rarityStyles.match(/@keyframes rarity-pulse \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(keyframes, '@keyframes rarity-pulse 정의');
  const rest = keyframes.match(/0%, 100% \{ box-shadow: ([^;]+); \}/)?.[1];
  const bloom = keyframes.match(/50% \{ box-shadow: ([^;]+); \}/)?.[1];
  assert.ok(rest && bloom, '0%/100%(원래대로)와 50%(빛이 들어옴) 두 지점');
  for (const value of [rest, bloom]) {
    const layers = value.split(/,\s*(?=inset|0 0)/);
    assert.equal(layers.length, 2, '안쪽·바깥쪽 두 겹');
    assert.match(layers[0], /^inset 0 0 var\(--rp-in(-\w+)?\) var\(--rp-(soft|bloom)\)$/);
    assert.match(layers[1], /^0 0 var\(--rp-out(-\w+)?\) var\(--rp-(soft|bloom)\)$/);
  }
  assert.match(rest, /var\(--rp-in\) var\(--rp-soft\)/, '쉴 때는 짧고 옅은 빛');
  assert.match(bloom, /var\(--rp-in-bloom\) var\(--rp-bloom\)/, '들어올 때는 길고 진한 빛');
});

test('애니메이션은 등급별 주기로 2.4~3.2초 ease-in-out 무한 반복이다', () => {
  const rule = rarityStyles.match(/animation: rarity-pulse ([^;]+);/)?.[1];
  assert.equal(rule, 'var(--rp-cycle) ease-in-out infinite');
  const blocks = tokenBlocks();
  assert.deepEqual(Object.keys(blocks).sort(), [...grades].sort(), '다섯 등급 토큰이 모두 있다');
  const cycles = grades.map(grade => blocks[grade].cycle);
  for (const cycle of cycles) assert.ok(cycle >= 2.4 && cycle <= 3.2, `주기 ${cycle}s는 2.4~3.2초`);
  for (let index = 1; index < cycles.length; index += 1) {
    assert.ok(cycles[index] < cycles[index - 1], '등급이 오를수록 숨이 조금 빨라진다');
  }
});

test('등급이 오를수록 색은 그대로 두고 번짐·진하기만 강해진다', () => {
  const blocks = tokenBlocks();
  for (const grade of grades) {
    const block = blocks[grade];
    assert.equal(block.ink, palette[grade], `${grade} 등급색은 기존 팔레트와 같다`);
    assert.match(block.soft, new RegExp(`^${palette[grade]}[0-9a-f]{2}$`), '옅은 빛도 같은 등급색');
    assert.match(block.bloom, new RegExp(`^${palette[grade]}[0-9a-f]{2}$`), '진한 빛도 같은 등급색');
    assert.ok(alphaOf(block.bloom) > alphaOf(block.soft), `${grade}: 빛이 들어올 때가 쉴 때보다 진하다`);
    assert.ok(alphaOf(block.bloom) < 0xdd, `${grade}: 아이콘·글자를 덮지 않을 만큼 옅다`);
    assert.ok(block.innerBloom > block.inner && block.outerBloom > block.outer, `${grade}: 번짐이 커진다`);
    assert.ok(block.inner <= 7 && block.innerBloom <= 12, `${grade}: 작은 칸(36px)을 덮지 않는 크기`);
  }
  for (let index = 1; index < grades.length; index += 1) {
    const lower = blocks[grades[index - 1]], higher = blocks[grades[index]];
    assert.ok(alphaOf(higher.soft) > alphaOf(lower.soft), `${grades[index]}가 ${grades[index - 1]}보다 은은하게 더 진하다`);
    assert.ok(higher.innerBloom >= lower.innerBloom && higher.outerBloom >= lower.outerBloom, `${grades[index]}가 더 넓게 번진다`);
  }
});

test('가방·장착 슬롯·상세·거래소·도감 카드가 모두 같은 토큰을 쓴다', () => {
  const animationTargets = rarityStyles.match(/border-color: var\(--rp-ink\);\n  animation: rarity-pulse/);
  assert.ok(animationTargets, '테두리와 숨쉬기를 함께 건다');
  for (const selector of ['.bag-item', '.equipment-slot', '.item-detail', '.market-pick', '.codex-card', '.codex-detail']) {
    assert.ok(rarityStyles.includes(selector), `${selector}가 대상이다`);
  }
  assert.match(rarityStyles, /:is\(\.market-pick, \.codex-card, \.codex-detail\)\.rarity-magic \{/, '거래소·도감은 rarity- 접두 클래스로 묶인다');
});

test('일반 등급은 빛 효과 없이 기본 상태 그대로다', () => {
  assert.doesNotMatch(rarityStyles, /\.common\b|rarity-common/, 'rarity.css는 일반 등급을 건드리지 않는다');
  assert.match(modalStyles, /\.bag-item\.common, \.equipment-slot\.common \{ border-color: #9ca3af; box-shadow: inset 0 0 7px #9ca3af44; \}/, '가방 일반 등급은 기존 정적 상태 유지');
  assert.match(codexStyles, /\.codex-card\.rarity-common, \.codex-detail\.rarity-common \{ border-color: #9ca3af; box-shadow: inset 0 0 8px #9ca3af30; \}/, '도감 일반 등급은 기존 정적 상태 유지');
});

test('기존 화면 스타일은 등급 글로우를 rarity.css에 넘기고 테두리만 남긴다', () => {
  for (const grade of grades) {
    assert.doesNotMatch(modalStyles, new RegExp(`\\.bag-item\\.${grade}, \\.equipment-slot\\.${grade} \\{[^}]*box-shadow`), `modals.css ${grade} 정적 글로우 제거`);
    assert.match(modalStyles, new RegExp(`\\.bag-item\\.${grade}, \\.equipment-slot\\.${grade} \\{ border-color: ${palette[grade]}; \\}`));
    assert.doesNotMatch(codexStyles, new RegExp(`\\.codex-card\\.rarity-${grade}, \\.codex-detail\\.rarity-${grade} \\{[^}]*box-shadow`), `codex.css ${grade} 정적 글로우 제거`);
    assert.match(marketStyles, new RegExp(`\\.market-pick\\.rarity-${grade} \\{ border-color: ${palette[grade]}; \\}`), `market.css ${grade} 테두리 유지`);
  }
});

test('움직임을 줄인 기기에서는 숨쉬기를 멈추고 등급색만 남긴다', () => {
  const block = rarityStyles.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\n\}/)?.[1];
  assert.ok(block, 'prefers-reduced-motion 블록');
  assert.match(block, /animation: none;/);
  assert.match(block, /box-shadow: inset 0 0 var\(--rp-in-bloom\) var\(--rp-soft\), 0 0 var\(--rp-out-bloom\) var\(--rp-soft\);/);
});

test('렌더 코드는 등급 클래스를 그대로 붙여 CSS가 따라갈 수 있게 한다', () => {
  assert.match(equipModal, /cell\.className = `bag-item \$\{book \? 'skillbook-item' : item\.rarity\}/, '가방 칸은 등급 이름 클래스');
  assert.match(equipModal, /cell\.className = `equipment-slot \$\{item\?\.rarity \?\? 'empty-slot'\}`/, '장착 슬롯도 등급 이름 클래스');
  assert.match(equipModal, /panel\.className = `item-detail \$\{isSkillBook\(item\) \? 'skillbook-detail' : item\.rarity\}`/, '가방 상세 카드');
  assert.match(equippedDetail, /panel\.className = `item-detail equipped-detail \$\{item\.rarity\}`/, '장착 상세 카드');
  assert.match(marketModal, /pick\.className = `market-pick rarity-\$\{item\.rarity\}/, '거래소 목록·등록 카드');
  assert.match(codexModal, /`codex-card rarity-\$\{grade\}/, '도감 카드');
  assert.match(codexModal, /`codex-detail rarity-\$\{grade\}`/, '도감 상세');
});
