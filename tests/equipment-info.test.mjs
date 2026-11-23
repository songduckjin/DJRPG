import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles as readModalStyles } from './helpers/modal-styles.mjs';

const { equipmentInfoSlots, equipmentSlotColumns } = await import('../src/ui/modals/equipModal.ts');
const interfaceSource = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../src/ui/modals/accountModal.ts', import.meta.url), 'utf8');
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
const statsSource = readFileSync(new URL('../src/ui/modals/statsModal.ts', import.meta.url), 'utf8');
const modalStyles = readModalStyles();

test('bottom navigation contains only the unified info, skills, market, and warehouse tabs', () => {
  const nav = interfaceSource.match(/<nav class="bottom-nav"[^>]*>(.*?)<\/nav>/)?.[1];
  assert(nav, 'bottom navigation template exists');
  assert.deepEqual([...nav.matchAll(/<button data-modal="([^"]+)"/g)].map(match => match[1]), ['equipment', 'skills', 'market', 'warehouse']);
  assert.match(nav, /data-modal="equipment" type="button" aria-label="내 정보" title="내 정보"/);
  assert.match(nav, /data-modal="market" type="button" aria-label="거래소" title="거래소"[\s\S]*data-modal="warehouse" type="button" aria-label="공용창고" title="공용창고"/);
  assert.match(interfaceSource, /warehouse: '<img class="nav-icon" src="\/assets\/icons\/nav_warehouse_v1\.png"/);
  assert.doesNotMatch(interfaceSource, /\brenderCharacter\b|statusModal|openModal === 'status'|status: '내 상태'/);
  assert.equal(existsSync(new URL('../src/ui/modals/statusModal.ts', import.meta.url)), false);
});

test('warehouse nav icon ships at the same 128px spec as the other nav icons', () => {
  const iconPath = new URL('../public/assets/icons/nav_warehouse_v1.png', import.meta.url);
  assert.equal(existsSync(iconPath), true);
  const png = readFileSync(iconPath);
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  // IHDR: 8바이트 시그니처 + 4바이트 길이 + 'IHDR' 뒤가 width/height다.
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 128);
});

test('gender is fixed after character creation and gender switch UI is removed', () => {
  assert.doesNotMatch(accountSource, /account-gender|save\.gender\s*=/);
  assert.doesNotMatch(modalStyles, /gender-switch|account-gender|status-modal/);
});

test('내 정보 — 장착 10칸은 좌 5칸(무기·투구·갑옷·장갑·신발) / 우 5칸(문장·목걸이·벨트·반지1·반지2)로 갈린다', () => {
  assert.deepEqual(equipmentInfoSlots, ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2']);
  assert.deepEqual(equipmentSlotColumns.map(column => [...column]), [
    ['weapon', 'helmet', 'armor', 'gloves', 'boots'],
    ['offhand', 'necklace', 'belt', 'ring1', 'ring2']
  ]);
  // 렌더는 좌 기둥 → 가운데 캐릭터 → 우 기둥 순서로 붙인다(좌우 대칭).
  assert.match(equipSource, /showcase\.append\(columns\[0\], center, columns\[1\]\)/);
  assert.match(equipSource, /column\.className = `equipment-slot-col \$\{index === 0 \? 'is-left' : 'is-right'\}`/);
});

test('내 정보 — 위쪽 6칸 능력치 표도, 요약 한 줄도 없다(2026-11-23 1안)', () => {
  // ① 스탯 표(6칸)는 코드·CSS 양쪽에서 사라졌다.
  assert.doesNotMatch(equipSource, /equipmentInfoStats|equipment-info-stats|<span>\$\{label\}<\/span>/);
  assert.equal(modalStyles.includes('.equipment-info-stats'), false);
  // ② 요약 한 줄(LV·층·EXP·금화 + 전투력 알약)도 1안에서 없앴다 — 같은 값을 메인 HUD가 보여 준다.
  assert.equal(modalStyles.includes('.equip-topline'), false);
  assert.equal(modalStyles.includes('.equipment-summary'), false);
  assert.equal(modalStyles.includes('.equip-powerpill'), false);
  assert.doesNotMatch(equipSource, /equip-topline|equipment-summary|equip-powerpill/);
  // ③ 머리글 아래에 곧바로 캐릭터·장착 칸이 온다.
  assert.match(equipSource, /dialog\.append\(showcase\)/);
});

test('상세 능력치는 HUD `LV` 배지가 여는 상세 스탯 창이 그대로 전담한다', () => {
  assert.match(hudSource, /class="level-badge" type="button" aria-label="상세 스탯 열기"/);
  assert.match(hudSource, /levelBadge\.addEventListener\('click', \(\) => this\.open\('stats'\)\)/);
  // 스탯 창은 statSheet 한 곳의 숫자를 그리고, 장비·패시브·추가옵션 합계임을 밝힌다.
  assert.match(statsSource, /export function renderStats\(this: Interface, dialog: HTMLElement\)/);
  assert.match(statsSource, /statSheet\(save, \{ currentHp: this\.world\.player\.hp, attackInterval: cooldowns\.attack \}\)/);
  assert.match(statsSource, /stats-power/);
});
