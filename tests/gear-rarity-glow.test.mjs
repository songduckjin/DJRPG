import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 작업 218 — 장비 등급색 발광. 유니크·전설만 필드 캐릭터와 장착 화면의 착용 부위(투구·갑옷·무기)에서
// 숨쉬고, 일반·매직·래어·에픽은 아무 효과도 없다. 값(색·주기)은 `src/game/render/gearGlow.ts` 한 곳이 기준이다.
const glow = readFileSync(new URL('../src/game/render/gearGlow.ts', import.meta.url), 'utf8');
const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
const render = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
const portrait = readFileSync(new URL('../src/ui/equipmentPortrait.ts', import.meta.url), 'utf8');
const equipModal = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const modalStyles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');

test('빛이 나는 등급은 유니크·전설 둘뿐이다', () => {
  const table = glow.match(/gearGlowTones[^{]*\{([\s\S]*?)\n\};/)?.[1];
  assert.ok(table, 'gearGlowTones 표가 있다');
  const grades = [...table.matchAll(/^\s{2}(\w+):\s*\{/gm)].map(match => match[1]);
  assert.deepEqual(grades, ['unique', 'legendary'], '유니크·전설만 표에 있다');
  for (const silent of ['common', 'magic', 'rare', 'epic']) {
    assert.doesNotMatch(table, new RegExp(`\\b${silent}:\\s*\\{`), `${silent}은 빛이 없다`);
  }
});

test('색과 주기는 확정 시안 v2 그대로다', () => {
  assert.match(glow, /unique: \{ color: 0xfb923c, cycle: 2\.6, peak: [\d.]+ \}/, '유니크 주황 #fb923c · 2.6초');
  assert.match(glow, /legendary: \{ color: 0xdc2626, cycle: 2\.3, peak: [\d.]+ \}/, '전설 진한 빨강 #dc2626 · 2.3초');
});

test('빛은 0 → 최대 → 0 파동이라 끝에서는 원래 색으로 돌아온다', () => {
  const body = glow.match(/export function gearGlowAmount\(([\s\S]*?)\n\}/)?.[1];
  assert.ok(body, 'gearGlowAmount 정의');
  assert.match(body, /Math\.cos\(phase \* Math\.PI \* 2\)/, '코사인 파동');
  assert.match(body, /\(1 - Math\.cos/, '0초에 0(원래 색)에서 시작한다');
  assert.match(body, /wave \* wave \* \(3 - 2 \* wave\) \* tone\.peak/, 'smoothstep 뒤 최대 세기를 곱한다');
});

test('필드는 파츠 복제본을 가산 블렌드로 얹어 발광한다', () => {
  const fn = entities.match(/function syncGearGlow\(([\s\S]*?)\n\}/)?.[1];
  assert.ok(fn, 'syncGearGlow 정의');
  assert.match(fn, /new Sprite\(source\.texture\)/, '같은 텍스처를 복제한다');
  assert.match(fn, /blendMode = 'add'/, '가산 블렌드');
  assert.match(fn, /glow\.alpha = amount/, 'alpha 를 파동 세기로 흔든다');
  assert.match(fn, /glow\.tint = tone\.color/, '등급색으로 물들인다');
  assert.match(entities, /syncGearGlow\(this, 'armor', this\.hero, save\.equipment\.armor\?\.rarity, time, neckY\)/, '갑옷');
  assert.match(entities, /syncGearGlow\(this, 'helmet', wornHelmet, save\.equipment\.helmet\?\.rarity, time\)/, '투구');
  assert.match(entities, /syncGearGlow\(this, 'weapon', wornWeapon, save\.equipment\.weapon\?\.rarity, time\)/, '무기');
  assert.match(entities, /job === 'archer'\) return view\.heroBow/, '궁수는 활 파츠');
  assert.match(entities, /job === 'mage'\) return view\.heroStaff/, '마법사는 지팡이 파츠');
});

test('갑옷 발광은 목 아래로만 번져 맨 얼굴은 원래 색으로 남는다', () => {
  assert.match(entities, /if \(key === 'armor' && neckY !== undefined\)/, '갑옷에만 목선 마스크');
  assert.match(entities, /glow\.mask = mask;/, '마스크를 발광 복제본에 건다');
  assert.match(entities, /const top = neckY - height \* source\.anchor\.y;/, '목 밑동 좌표를 셀 좌표로 옮긴다');
  assert.match(render, /heroGlowMask\?: Sprite;/, 'GameView.heroGlowMask');
});

test('빛 복제본은 잔상 복제에서 빠진다', () => {
  assert.match(entities, /child\.blendMode !== 'add'/, 'cloneHeroLayers 가 발광 복제본을 건너뛴다');
});

test('필드 렌더러는 부위별 발광 스프라이트를 보관한다', () => {
  assert.match(render, /heroGlow = new Map<string, Sprite>\(\)/, 'GameView.heroGlow');
});

test('장착 화면은 부위별 투명 발광 레이어를 따로 만든다', () => {
  assert.match(portrait, /export async function renderEquipmentGlowLayers\(/, '공개 API');
  assert.match(portrait, /\{ slot: 'armor'[\s\S]*\{ slot: 'helmet'[\s\S]*\{ slot: 'weapon'/, '세 부위를 차례로 만든다');
  assert.match(portrait, /gearGlowTone\(save\.equipment\.(\w+)\?\.rarity\)/, '등급 표에서 톤을 읽는다');
  assert.match(portrait, /const helmetPart = !!\(plan\.helmet \|\| plan\.archerHelm \|\| plan\.mageHelm\)/, '파츠가 있을 때만 투구 발광');
  assert.match(portrait, /const weaponPart = !!\(plan\.weapon \|\| plan\.bow \|\| plan\.staff\)/, '파츠가 있을 때만 무기 발광');
  assert.match(portrait, /const light = Math\.min\(1\.6, \.3 \+ 1\.2 \* lum\);/, '원본 밝기를 광량으로 쓴다(물감칠 아님)');
  assert.match(portrait, /pixels\[index\] = Math\.min\(255, rgb\[0\] \* light\);/, '픽셀별 등급색 빛');
  assert.match(portrait, /context\.globalCompositeOperation = 'destination-out'/, '갑옷 발광에서 맨 얼굴은 도려낸다');
});

test('장착 화면은 발광 레이어를 겹쳐 CSS로 숨쉬게 한다', () => {
  assert.match(equipModal, /glowLayer\.className = 'showcase-glow'/);
  assert.match(equipModal, /image\.className = 'showcase-glow-layer'/);
  assert.match(equipModal, /--gear-cycle/, '레이어마다 등급별 주기를 넘긴다');
  assert.match(modalStyles, /\.showcase-glow-layer \{[^}]*mix-blend-mode: screen;[^}]*animation: gear-rarity-pulse var\(--gear-cycle, 2\.6s\) ease-in-out infinite; \}/);
  assert.match(modalStyles, /@keyframes gear-rarity-pulse \{ 0%, 100% \{ opacity: 0; \} 50% \{ opacity: 1; \} \}/);
  assert.match(modalStyles, /prefers-reduced-motion: reduce\) \{ \.showcase-glow-layer \{ animation: none; opacity: \.5; \} \}/, '움직임을 줄인 기기에서는 은은하게 고정');
});
