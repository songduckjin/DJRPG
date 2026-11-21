import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 작업 218 — 장비 등급색 발광. 유니크·전설만 필드 캐릭터와 장착 화면의 착용 부위(투구·갑옷·무기)에서
// 숨쉬고, 일반·매직·래어·에픽은 아무 효과도 없다. 값(색·주기·세기)은 `src/game/render/gearGlow.ts` 한 곳이 기준이다.
// 작업 231 — 사용자 요청 "발광 색·세기를 지금보다 훨씬 진하게": 색을 더 진하게 바꾸고 peak 를 0.92·1.0 으로
// 올렸으며, 필드는 [진한 색 multiply → 가산 발광 → 번지는 후광] 3겹, 장착 화면은 몸 위 레이어 + drop-shadow 로 키웠다.
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

test('색은 진한 주황·선명한 빨강, 세기는 0.92·1.0 이고 주기는 그대로다(작업 231)', () => {
  assert.match(glow, /unique: \{ color: 0xff7a00, cycle: 2\.6, peak: 0\.92 \}/, '유니크 진한 주황 #ff7a00 · 2.6초 · peak 0.92');
  assert.match(glow, /legendary: \{ color: 0xef1a1a, cycle: 2\.3, peak: 1 \}/, '전설 선명한 빨강 #ef1a1a · 2.3초 · peak 1.0');
  // 작업 218의 세기(0.58·0.64)로 되돌아가지 않았는지 — 요청의 핵심은 "훨씬 진하게"다.
  assert.doesNotMatch(glow, /peak: 0\.58/);
  assert.doesNotMatch(glow, /peak: 0\.64/);
});

test('빛은 0 → 최대 → 0 파동이라 끝에서는 원래 색으로 돌아온다', () => {
  const body = glow.match(/export function gearGlowAmount\(([\s\S]*?)\n\}/)?.[1];
  assert.ok(body, 'gearGlowAmount 정의');
  assert.match(body, /Math\.cos\(phase \* Math\.PI \* 2\)/, '코사인 파동');
  assert.match(body, /\(1 - Math\.cos/, '0초에 0(원래 색)에서 시작한다');
  assert.match(body, /wave \* wave \* \(3 - 2 \* wave\) \* tone\.peak/, 'smoothstep 뒤 최대 세기를 곱한다');
});

test('발광은 진한 색·가산 빛·번지는 후광 세 겹으로 나뉜다', () => {
  const table = glow.match(/gearGlowLayers[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
  assert.ok(table, 'gearGlowLayers 표가 있다');
  const layers = [...table.matchAll(/\{ mode: '(\w+)', weight: ([.\d]+), scale: ([\d.]+), source: '(\w+)' \}/g)]
    .map(match => ({ mode: match[1], weight: Number(match[2]), scale: Number(match[3]), source: match[4] }));
  assert.deepEqual(layers.map(layer => layer.mode), ['multiply', 'add', 'add'], '곱하기 1겹 + 가산 2겹');
  assert.deepEqual(layers.map(layer => layer.source), ['flat', 'emissive', 'emissive'],
    '곱하기는 원본 텍스처(명암 유지), 가산은 밝기 비례 발광 텍스처');
  assert.ok(layers[2].scale > 1, '후광은 조금 크게 키워 실루엣 밖으로 번지게 한다');
  for (const layer of layers) assert.ok(layer.weight > 0 && layer.weight <= 1, '겹마다 세기가 있다');
});

test('발광 텍스처는 밝기 비례 등급색으로 굽고 색 채널은 1.25배까지만 올린다', () => {
  const body = glow.match(/export function glowGearTexture\(([\s\S]*?)\n\}/)?.[1];
  assert.ok(body, 'glowGearTexture 정의');
  assert.match(glow, /GLOW_TEXTURE_DIVISOR = 3/, '원본의 1/3 크기로 굽는다(비용·메모리)');
  assert.match(body, /const lum = \(0\.299 \* pixels\[index\] \+ 0\.587 \* pixels\[index \+ 1\] \+ 0\.114 \* pixels\[index \+ 2\]\) \/ 255;/,
    '픽셀 밝기를 광량으로 쓴다');
  assert.match(body, /const light = Math\.min\(1\.25, \.45 \+ 1\.55 \* lum\);/, '광량 곡선과 상한(색이 노랗게 날아가지 않게)');
  assert.match(body, /Texture\.from\(canvas\)/, '캔버스를 텍스처로 굽는다');
  assert.match(glow, /const GLOW_TEXTURE_CACHE = \d+;/, '캐시로 프레임마다 다시 굽지 않는다');
});

test('필드는 부위마다 세 겹을 얹고, 곱하기는 원본·가산은 발광 텍스처를 쓴다', () => {
  const fn = entities.match(/function syncGearGlow\(([\s\S]*?)\n\}/)?.[1];
  assert.ok(fn ?? entities.includes('gearGlowLayers.forEach'), 'syncGearGlow 정의');
  assert.match(entities, /const glowTexture = glowGearTexture\(source\.texture, tone\.color, String\(source\.texture\.uid\)\);/);
  assert.match(entities, /const emissive = layer\.source === 'emissive' && glowTexture;/, '가산 겹만 발광 텍스처');
  assert.match(entities, /const ratio = emissive \? source\.texture\.width \/ glowTexture\.width : 1;/, '1/3 크기를 키워 원본과 같은 크기로');
  assert.match(entities, /glow\.blendMode = layer\.mode;/, '겹마다 블렌드');
  assert.match(entities, /glow\.alpha = Math\.min\(1, amount \* layer\.weight\);/, '겹마다 파동 세기 × 비율');
  assert.match(entities, /glow\.tint = emissive \? 0xffffff : tone\.color;/, '곱하기 겹은 등급색 tint');
  // [작업 256] 투구는 파츠 모양 마스크를 함께 넘긴다 — 갑옷은 목선, 투구는 알파 마스크.
  assert.match(entities, /syncGearGlow\(this, 'armor', this\.hero, save\.equipment\.armor\?\.rarity, time, \{ neckY \}\)/, '갑옷');
  assert.match(entities, /syncGearGlow\(this, 'helmet', helmetGlowReady \? wornHelmet : undefined, save\.equipment\.helmet\?\.rarity, time, \{ mask: helmetGlowMask \}\)/, '투구');
  assert.match(entities, /syncGearGlow\(this, 'weapon', wornWeapon, save\.equipment\.weapon\?\.rarity, time\)/, '무기');
  assert.match(entities, /job === 'archer'\) return view\.heroBow/, '궁수는 활 파츠');
  assert.match(entities, /job === 'mage'\) return view\.heroStaff/, '마법사는 지팡이 파츠');
});

test('갑옷 발광은 목 아래로만 번져 맨 얼굴은 원래 색으로 남는다', () => {
  assert.match(entities, /if \(key === 'armor' && options\.neckY !== undefined\)/, '갑옷에만 목선 마스크');
  assert.match(entities, /glow\.mask = mask \?\? null;/, '마스크를 발광 복제본에 건다');
  assert.match(entities, /const top = options\.neckY - height \* source\.anchor\.y;/, '목 밑동 좌표를 셀 좌표로 옮긴다');
  assert.match(render, /heroGlowMask\?: Sprite;/, 'GameView.heroGlowMask');
});

test('빛 복제본은 잔상 복제에서 빠진다', () => {
  assert.match(entities, /child\.label !== GEAR_GLOW_LABEL/, 'cloneHeroLayers 가 발광 복제본을 건너뛴다');
  assert.match(entities, /export const GEAR_GLOW_LABEL = 'gear-glow';/);
});

test('필드 렌더러는 부위별 발광 스프라이트 겹을 보관한다', () => {
  assert.match(render, /heroGlow = new Map<string, Sprite\[\]>\(\)/, 'GameView.heroGlow — 부위별 겹 목록');
});

test('장착 화면은 부위별 투명 발광 레이어를 따로 만든다', () => {
  assert.match(portrait, /export async function renderEquipmentGlowLayers\(/, '공개 API');
  assert.match(portrait, /\{ slot: 'armor'[\s\S]*\{ slot: 'helmet'[\s\S]*\{ slot: 'weapon'/, '세 부위를 차례로 만든다');
  assert.match(portrait, /gearGlowTone\(save\.equipment\.(\w+)\?\.rarity\)/, '등급 표에서 톤을 읽는다');
  assert.match(portrait, /const helmetPart = !!\(plan\.helmet \|\| plan\.archerHelm \|\| plan\.mageHelm\)/, '파츠가 있을 때만 투구 발광');
  assert.match(portrait, /const weaponPart = !!\(plan\.weapon \|\| plan\.bow \|\| plan\.staff\)/, '파츠가 있을 때만 무기 발광');
  assert.match(portrait, /const light = Math\.min\(1\.25, \.45 \+ 1\.55 \* lum\);/, '광량 상한을 1.25로 두어 진한 등급색 유지(작업 231)');
  assert.match(portrait, /pixels\[index\] = Math\.min\(255, rgb\[0\] \* light\);/, '픽셀별 등급색 빛');
  assert.match(portrait, /context\.shadowBlur = Math\.max\(4, Math\.round\(width \* \.045 \* aura\)\);/, '후광(shadowBlur) 확대(작업 231) · 투구는 aura 로 줄인다(작업 256)');
  assert.match(portrait, /context\.globalCompositeOperation = 'destination-out'/, '갑옷 발광에서 맨 얼굴은 도려낸다');
});

test('장착 화면은 발광 레이어를 몸 위에 얹고 CSS로 숨쉬게 한다', () => {
  assert.match(equipModal, /glowLayer\.className = 'showcase-glow'/);
  assert.match(equipModal, /image\.className = 'showcase-glow-layer'/);
  assert.match(equipModal, /--gear-cycle/, '레이어마다 등급별 주기를 넘긴다');
  assert.match(equipModal, /--gear-color/, '레이어마다 등급색을 넘긴다(drop-shadow 후광)');
  assert.match(modalStyles, /\.showcase-glow \{ position: absolute; inset: 0; z-index: 2;/, '발광은 몸 그림(z-index 1) 위에 얹는다(작업 231)');
  assert.match(modalStyles, /\.showcase-glow-layer \{[^}]*mix-blend-mode: screen;[^}]*filter: saturate\(1\.3\) brightness\(1\.08\) drop-shadow\(0 0 7px var\(--gear-color, #ff7a00\)\);[^}]*animation: gear-rarity-pulse var\(--gear-cycle, 2\.6s\) ease-in-out infinite; \}/);
  assert.match(modalStyles, /@keyframes gear-rarity-pulse \{ 0%, 100% \{ opacity: 0; \} 50% \{ opacity: 1; \} \}/);
  assert.match(modalStyles, /prefers-reduced-motion: reduce\) \{ \.showcase-glow-layer \{ animation: none; opacity: \.7; \} \}/, '움직임을 줄인 기기에서는 은은하게 고정');
});

test('마법사 투구 발광은 얼굴·목선 아래로 번지지 않는다(작업 247)', () => {
  // 파츠에 얼굴이 함께 들어 있어 그대로 두면 유니크·전설 투구에서 얼굴이 등급색 덩어리가 되고,
  // 파츠가 목선에서 끊긴 자리에 직선으로 잘린 발광 띠가 남는다 → 성별 발광 마스크를 건다.
  assert.match(entities, /else if \(maskTexture\)/, '투구 발광에도 마스크를 건다');
  assert.match(entities, /mask\.texture = maskTexture;[\s\S]*mask\.anchor\.set\(source\.anchor\.x, source\.anchor\.y\);[\s\S]*mask\.scale\.set\(source\.scale\.x, source\.scale\.y\);/, '마스크를 파츠와 같은 앵커·위치·배율로 얹는다');
  assert.match(entities, /mageHelmGlowMaskTexture\(save\.gender\)/, '성별 마스크를 고른다');
  assert.match(render, /heroHelmGlowMask\?: Sprite;/, 'GameView.heroHelmGlowMask');
  assert.match(portrait, /globalCompositeOperation = 'destination-in'[\s\S]{0,200}drawImage\(mask/, '장착 화면도 마스크로 도려낸다');
  assert.match(portrait, /glow \? mageHelmGlowMaskCanvas\(mageHelm\.gender\) : undefined/, '투구 발광일 때만 마스크');
  // 마스크는 새 파일을 받지 않고 캔버스로 굽는다(캐시는 성별당 1장).
  const mageHelmets = readFileSync(new URL('../src/game/render/mageHelmets.ts', import.meta.url), 'utf8');
  assert.match(mageHelmets, /const glowMaskTextures = new Map/, '성별당 1장 캐시');
  assert.match(mageHelmets, /export function mageHelmGlowMaskTexture/, '필드용 텍스처');
  assert.doesNotMatch(mageHelmets, /mage_helm_glow_mask_\w*\.png/, '마스크 PNG 파일을 따로 받지 않는다');
});
