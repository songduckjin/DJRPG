import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// HUD 번들 — ① 닉네임 아래 전투력 ② 월드보스 동그라미 아래 `월드보스` 라벨 ③ 오른쪽 레일 `캐릭터`
// ④ LV 배지 → `상세 스탯` ⑤ 화면 배율에 따라 줄어드는 레일·하단 메뉴(겹침 0).
const { combatPower } = await import('../src/game/power.ts');
const { statSheet, attacksPerSecond } = await import('../src/game/statSheet.ts');
const { renderStats } = await import('../src/ui/modals/statsModal.ts');
const { renderStatus } = await import('../src/ui/hud.ts');
const { railMarkup } = await import('../src/ui/interface.ts');
const { MODALS } = await import('../src/ui/modalRegistry.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { cooldowns } = await import('../src/game/world.ts');
const { CRIT_CHANCE_CAP, CRIT_DAMAGE_SCALE, damageReduction } = await import('../src/game/battle/formulas.ts');
// HUD 숫자도 **기념 버프 밖** 값으로 본다 — 버프가 켜진 동안은 공·방·체가 1.3배다(`patchBuff.ts`).
const patchBuff = await import('../src/game/patchBuff.ts');
patchBuff.setPatchBuffClock(() => patchBuff.PATCH_BUFF_START - 1);

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hudSource = read('src/ui/hud.ts');
const interfaceSource = read('src/ui/interface.ts');
const equipSource = read('src/ui/modals/equipModal.ts');
const statsModalSource = read('src/ui/modals/statsModal.ts');
const hudStyles = read('src/styles/hud.css');
const worldBossStyles = read('src/styles/world-boss.css');
const statsStyles = read('src/styles/modals/stats.css');

/** 가짜 DOM — `renderStatus`·`renderStats`가 만지는 자리만 흉내 낸다(실제 DOM 없이 숫자만 본다). */
function element(tag = 'div') {
  const listeners = {};
  const node = {
    tag, children: [], dataset: {}, attrs: {}, hidden: false, className: '', textContent: '', innerHTML: '', title: '',
    style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    addEventListener(kind, handler) { (listeners[kind] ??= []).push(handler); },
    removeEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    click() { for (const handler of listeners.click ?? []) handler(); },
    classList: { add() {}, remove() {}, toggle() {} }
  };
  return node;
}

function hud(save = freshSave('male', 'warrior')) {
  const nodes = { '.hero-name': element('span'), '.level-badge': element('button'), '.floor-button': element('button'), '.hp': element('div'), '.hp b': element('b') };
  const ui = {
    top: element('div'), banner: element('div'), world: { save, player: { hp: 80 }, bossRetryReady: false },
    opened: [], open(kind) { this.opened.push(kind); },
    get(selector) { return nodes[selector]; }
  };
  return { ui, nodes };
}

/** CSS에서 그 선택자의 규칙 본문들을 모두 꺼내, `must`를 담은 마지막 규칙을 쓴다(뒤에 덧붙은 규칙이 이긴다). */
function ruleBody(styles, selector, must) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const bodies = [...styles.matchAll(pattern)].map(match => match[1]);
  const found = must ? bodies.filter(body => body.includes(must)) : bodies;
  assert.ok(found.length, `${selector} 규칙이 있다${must ? ` (${must})` : ''}`);
  return found[found.length - 1];
}
const px = (body, pattern) => {
  const value = body.match(pattern);
  assert.ok(value, `값이 있다: ${pattern}`);
  return Number(value[1]);
};
const clampOf = body => {
  const found = body.match(/clamp\(\s*([\d.]+)px\s*,\s*min\(\s*([\d.]+)vw\s*,\s*([\d.]+)dvh\s*\)\s*,\s*([\d.]+)px\s*\)/);
  assert.ok(found, 'clamp(min, min(vw, dvh), max) 꼴');
  return { min: Number(found[1]), vw: Number(found[2]), dvh: Number(found[3]), max: Number(found[4]) };
};
/** 그 화면에서 clamp가 고르는 값 — 브라우저와 같은 규칙(min·max)으로 계산한다. */
const clampAt = (spec, width, height) => Math.min(spec.max, Math.max(spec.min, Math.min(width * spec.vw / 100, height * spec.dvh / 100)));
const flatClamp = (body, property, unit = 'px') => {
  const found = body.match(new RegExp(`${property}: clamp\\(([\\d.]+)px, ([\\d.]+)(vw|dvh), ([\\d.]+)px\\)`));
  assert.ok(found, `${property} clamp`);
  return { min: Number(found[1]), value: Number(found[2]), unit: found[3], max: Number(found[4]) };
};
const flatClampAt = (spec, width, height) => Math.min(spec.max, Math.max(spec.min, spec.unit === 'vw' ? width * spec.value / 100 : height * spec.value / 100));

test('전투력은 내 정보·HUD·상세 스탯이 같은 `combatPower` 한 식을 쓴다', () => {
  // 공격×3 + 방어×2 + 체력×0.2 + 치명×2 + 공속×2 (반올림)
  assert.equal(combatPower({ attack: 10, defense: 5, health: 100, crit: 4, speed: 2 }), 72);
  assert.equal(combatPower({ attack: 0, defense: 0, health: 0, crit: 0, speed: 0 }), 0);
  assert.equal(combatPower({ attack: 10, defense: 3, health: 100, crit: 2, speed: 0 }), 60, 'Lv1 전사 기본값 60');

  // 식은 한 곳에만 — 내 정보 창은 인라인 식 대신 모듈을 부른다.
  assert.match(equipSource, /const power = combatPower\(stats\);/, '내 정보 창이 combatPower를 쓴다');
  assert.doesNotMatch(equipSource, /stats\.attack \* 3/, '내 정보 창에 인라인 전투력 식이 남지 않았다');
  assert.match(hudSource, /combatPower\(totalStats\(save\)\)/, 'HUD가 같은 식을 쓴다');
  assert.match(statsModalSource, /statSheet\(save,/, '상세 스탯도 같은 계산을 쓴다');
});

test('HUD는 이름판 바로 아래에 `⚔ 전투력 N` 한 줄을 그린다', () => {
  const { ui } = hud();
  renderStatus.call(ui);
  const html = ui.top.innerHTML;
  assert.match(html, /<span class="hero-power" aria-label="전투력 \d+"><i aria-hidden="true">⚔<\/i><span>전투력<\/span><b>[\d,]+<\/b><\/span>/, '전투력 필 마크업');
  assert.ok(html.indexOf('class="hero-name"') < html.indexOf('class="hero-power"'), '이름판 다음');
  assert.ok(html.indexOf('class="hero-power"') < html.indexOf('class="health-bar'), 'HP 바 앞');

  // 숫자는 지금 세이브의 전투력 그대로, 천 단위는 쉼표(1,320).
  const save = freshSave('male', 'warrior'); save.level = 30;
  for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots']) save.equipment[slot] = { id: slot, name: slot, slot, rarity: 'legendary', stats: { attack: 40, defense: 30, health: 200, crit: 5, speed: 5 } };
  const expected = combatPower(totalStats(save));
  const next = hud(save);
  renderStatus.call(next.ui);
  assert.match(next.ui.top.innerHTML, new RegExp(`<b>${expected.toLocaleString('ko-KR')}</b>`), '장비를 더한 전투력');
  assert.ok(expected >= 1000, '천 단위 예시');
  // 초기 세이브(Lv1 전사)는 68 — 레벨 기본값만으로도 0이 아니어야 한다.
  // (밸런스 v2에서 Lv.1 기본 체력이 100 → 140이 되어 60 → 68로 올랐다.)
  const fresh = hud(); renderStatus.call(fresh.ui);
  assert.match(fresh.ui.top.innerHTML, /<b>68<\/b>/);
});

test('LV 배지는 상세 스탯을 열고, 캐릭터 전환은 오른쪽 레일 버튼이 맡는다', () => {
  const { ui, nodes } = hud();
  renderStatus.call(ui);
  nodes['.level-badge'].click();
  assert.deepEqual(ui.opened, ['stats'], 'LV → 상세 스탯');
  assert.match(ui.top.innerHTML, /<button class="level-badge" type="button" aria-label="상세 스탯 열기">/, '배지 읽기 이름');
  assert.doesNotMatch(hudSource, /open\('characters'\)/, 'HUD가 더 이상 캐릭터 선택을 열지 않는다');

  assert.equal(MODALS.stats.title, '상세 스탯');
  assert.deepEqual(MODALS.stats.dialogClasses, ['stats-modal']);
  assert.equal(MODALS.stats.quietWhileHunting, true, '사냥 중 매 처치마다 다시 그리지 않는다');

  // 오른쪽 아이콘 레일 — `캐릭터`가 맨 위, 아이콘은 새로 넣은 금빛 투구.
  const rail = railMarkup();
  assert.match(rail, /^<button type="button" data-modal="characters" aria-label="캐릭터" title="캐릭터"><img src="\/assets\/icons\/utility_characters\.png"/, '레일 맨 위 캐릭터 버튼');
  assert.doesNotMatch(rail, /data-utility-dot="characters"/, '캐릭터 버튼에는 새 소식 점을 달지 않는다');
  for (const modal of ['notice', 'settings', 'mail', 'rewards', 'achievements', 'dungeon']) assert.match(rail, new RegExp(`data-modal="${modal}"`), `${modal} 유지`);
  assert.match(interfaceSource, /<nav class="utility-nav" aria-label="편의 메뉴">\$\{railMarkup\(\)\}<\/nav>/, '레일이 railMarkup을 쓴다');
  // 아이콘 파일은 128×128 RGBA PNG(다른 유틸 아이콘과 같은 크기·형식).
  const png = readFileSync(new URL('../public/assets/icons/utility_characters.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 128, '너비 128');
  assert.equal(png.readUInt32BE(20), 128, '높이 128');
  assert.equal(png[25], 6, 'RGBA');
});

test('상세 스탯은 전투가 쓰는 값 그대로 계산한다(방어 감소·치명 상한·초당 공격 포함)', () => {
  const save = freshSave('male', 'warrior'); save.level = 5;
  const sheet = statSheet(save, { currentHp: 120, attackInterval: cooldowns.attack });
  const rows = Object.fromEntries(sheet.groups.flatMap(group => group.rows).map(row => [row.key, row]));
  const stats = totalStats(save);
  assert.equal(sheet.power, combatPower(stats));
  assert.equal(rows.attack.value, stats.attack.toLocaleString('ko-KR'));
  assert.equal(rows.defense.value, stats.defense.toLocaleString('ko-KR'));
  // 방어는 밸런스 v2의 **% 피해 감소**로 설명한다(예전 `방어 × 0.2` 고정 감소는 폐기).
  const reduction = damageReduction(stats.defense, save.floor);
  assert.equal(rows.defense.note, `피해 감소 ${Math.round(reduction * 1000) / 10}% · ${save.floor}층 기준`, '방어력은 % 피해 감소로 설명');
  assert.equal(rows.health.value, stats.health.toLocaleString('ko-KR'));
  assert.equal(rows.critChance.value, `${stats.crit}%`);
  assert.equal(rows.critDamage.value, `${CRIT_DAMAGE_SCALE * 100}%`, '치명타 피해 180%');
  assert.equal(rows.attackSpeed.value, `${stats.speed}%`);
  assert.equal(rows.attackSpeed.note, `초당 ${attacksPerSecond(stats.speed, cooldowns.attack).toFixed(2)}회`);
  // 스킬 쿨타임 감소(밸런스 v2) — 전투가 쓰는 `stats.cdr` 그대로, 상한 35%.
  assert.equal(rows.cdr.value, `${Math.round(stats.cdr)}%`, '쿨감 줄이 있다');
  const cdrRich = freshSave('male', 'mage');
  cdrRich.equipment.weapon = { id: 'w', name: '룬 지팡이', slot: 'weapon', rarity: 'legendary', stats: { cdr: 60 } };
  const cdrSheet = statSheet(cdrRich, { currentHp: 100, attackInterval: cooldowns.attack });
  const cdrRow = cdrSheet.groups.flatMap(group => group.rows).find(row => row.key === 'cdr');
  assert.equal(cdrRow.value, '35%', '쿨감은 35%에서 자른다');
  assert.equal(cdrRow.note, '상한 35%');
  assert.equal(rows.lifesteal.value, '0%'); assert.equal(rows.evasion.value, '0%');
  assert.equal(rows.regen.value, '0%/5초'); assert.equal(rows.bonusDamage.value, '0%');
  assert.equal(sheet.currentHp, 120); assert.equal(sheet.maxHp, Math.round(stats.health));
  assert.equal(rows.skillPoints, undefined, '쓰는 곳 없는 스킬 포인트는 띄우지 않는다');

  // 초당 공격 — 공속 0%면 0.48초에 한 번, 100%면 두 배.
  assert.equal(Number(attacksPerSecond(0, .48).toFixed(2)), 2.08);
  assert.equal(Number(attacksPerSecond(100, .48).toFixed(2)), 4.17);

  // 장비의 치명이 상한을 넘으면 80%로 자르고 이유를 적는다.
  const rich = freshSave('male', 'warrior');
  rich.equipment.ring1 = { id: 'r', name: '치명 반지', slot: 'ring1', rarity: 'legendary', stats: { crit: 120 } };
  const capped = statSheet(rich, { currentHp: 100, attackInterval: cooldowns.attack });
  const critRow = capped.groups.flatMap(group => group.rows).find(row => row.key === 'critChance');
  assert.equal(critRow.value, `${CRIT_CHANCE_CAP}%`);
  assert.equal(critRow.note, `상한 ${CRIT_CHANCE_CAP}%`);

  // 세이브의 체력이 최대를 넘어도 표는 최대까지만(음수는 0).
  assert.equal(statSheet(save, { currentHp: 1e6, attackInterval: .48 }).currentHp, Math.round(stats.health));
  assert.equal(statSheet(save, { currentHp: -5, attackInterval: .48 }).currentHp, 0);
});

test('상세 스탯 창은 머리·큰 전투력·3그룹 11칸을 그린다', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave('female', 'mage'); save.name = '별빛마녀'; save.level = 9; save.floor = 6;
    save.equipment.weapon = { id: 'w', name: '수정 지팡이', slot: 'weapon', rarity: 'epic', stats: { attack: 22, crit: 3 } };
    const world = { save, player: { hp: 300 } };
    const dialog = element('div');
    renderStats.call({ world }, dialog);
    const content = dialog.children[0];
    assert.equal(content.className, 'stats-content');
    const [head, power] = content.children;
    assert.equal(head.children[0].children[0].textContent, '마법사', '직업 태그');
    assert.equal(head.children[0].children[1].textContent, '별빛마녀', '닉네임 textContent');
    const expected = statSheet(save, { currentHp: 300, attackInterval: cooldowns.attack });
    assert.equal(head.children[1].textContent, `LV 9 · 6층 · HP ${expected.currentHp}/${expected.maxHp}`, '레벨·층·HP(현재 체력은 최대에서 자른다)');
    assert.equal(power.className, 'stats-power');
    const powerValue = power.children.find(child => child.tag === 'b');
    assert.equal(powerValue.textContent, expected.power.toLocaleString('ko-KR'));
    assert.equal(power.attrs['aria-label'], `전투력 ${expected.power}`);

    const groups = content.children.filter(child => child.className === 'stats-group');
    assert.deepEqual(groups.map(group => group.dataset.group), ['battle', 'chance', 'survival']);
    const cells = groups.flatMap(group => group.children[1].children);
    assert.deepEqual(cells.map(cell => cell.dataset.stat), ['attack', 'defense', 'health', 'critChance', 'critDamage', 'attackSpeed', 'cdr', 'lifesteal', 'evasion', 'regen', 'bonusDamage']);
    for (const cell of cells) {
      assert.ok(cell.attrs['aria-label'], `${cell.dataset.stat} 읽기 이름`);
      assert.equal(cell.children[0].textContent.length > 0, true, `${cell.dataset.stat} 이름`);
      assert.ok(typeof cell.children[1].textContent === 'string' && cell.children[1].textContent.length, `${cell.dataset.stat} 값`);
    }
    const hint = content.children[content.children.length - 1];
    assert.equal(hint.className, 'stats-hint');
    assert.match(hint.textContent, /추가옵션을 모두 더한 값/);
  } finally { globalThis.document = original; }
});

test('월드보스 동그라미 아래에 `월드보스` 라벨이 붙고, 3/3과 겹치지 않는다', () => {
  assert.match(interfaceSource, /<span class="wb-entry-count" aria-hidden="true">3\/3<\/span><span class="wb-entry-label" aria-hidden="true">월드보스<\/span>/, '원 안 3/3 다음에 라벨');
  assert.match(interfaceSource, /aria-label="월드보스 미리보기"/, '버튼 읽기 이름 유지');

  const label = ruleBody(worldBossStyles, '.world-boss-entry .wb-entry-label');
  assert.equal(px(label, /top:(\d+)px/), 71, '동그라미(70px) 바로 아래');
  assert.equal(px(label, /height:(\d+)px/), 14);
  assert.match(label, /pointer-events:none/, '동그라미 탭을 막지 않는다');
  assert.match(label, /white-space:nowrap/);
  // 3/3은 원 안 50~67px, 라벨은 71~85px.
  const count = ruleBody(worldBossStyles, '.world-boss-entry .wb-entry-count', 'top:50px');
  const countTop = px(count, /top:(\d+)px/), countHeight = px(count, /height:(\d+)px/);
  assert.ok(countTop + countHeight <= 71, `3/3(${countTop + countHeight}px) 아래에 라벨(71px)`);
});

test('좌상단 세로줄은 배지→닉네임→전투력→HP→월드보스→라벨→튜토리얼 순서로 3px 이상 여유를 둔다', () => {
  const badge = ruleBody(hudStyles, '.level-badge');
  const name = ruleBody(hudStyles, '.hero-name');
  const power = ruleBody(hudStyles, '.hero-power');
  const health = ruleBody(hudStyles, '.health-bar');
  const tutorial = ruleBody(hudStyles, '.tutorial');
  const boss = ruleBody(worldBossStyles, '.world-boss-entry', 'top:calc(env(safe-area-inset-top, 0px) + 111px)');
  const label = ruleBody(worldBossStyles, '.world-boss-entry .wb-entry-label');

  const badgeTop = px(badge, /top: (-?\d+)px/), badgeHeight = px(badge, /height: (\d+)px/);
  const nameTop = px(name, /top: (\d+)px/), nameHeight = px(name, /height: ([\d.]+)px/);
  const powerTop = px(power, /top: (\d+)px/), powerHeight = px(power, /height: ([\d.]+)px/);
  const healthTop = px(health, /top: (\d+)px/), healthHeight = px(health, /height: (\d+)px/);
  const bossTop = px(boss, /top:calc\(env\(safe-area-inset-top, 0px\) \+ (\d+)px\)/);
  const labelTop = px(label, /top:(\d+)px/), labelHeight = px(label, /height:(\d+)px/);
  const tutorialTop = px(tutorial, /top: calc\(env\(safe-area-inset-top\) \+ (\d+)px\)/);

  assert.ok(nameTop >= badgeTop + badgeHeight, '닉네임은 배지 원 아래');
  assert.ok(powerTop - (nameTop + nameHeight) >= 2, `이름판 아래 ${powerTop - (nameTop + nameHeight)}px`);
  assert.ok(healthTop - (powerTop + powerHeight) >= 3, `전투력과 HP 사이 ${healthTop - (powerTop + powerHeight)}px`);
  assert.ok(bossTop - (healthTop + healthHeight) >= 3, `HP와 월드보스 사이 ${bossTop - (healthTop + healthHeight)}px`);
  assert.ok(tutorialTop - (bossTop + 70 + labelHeight) >= 3, '라벨과 튜토리얼 배너 사이');
  assert.ok(12 + 140 < 360, '닉네임·전투력 140px 상한은 360px 화면 안');
  assert.match(power, /font: 700 9\.5px/, '전투력 필은 이름판보다 작은 글자');
  assert.match(statsModalSource, /이름|전투력/, '상세 스탯도 같은 전투력을 보여 준다');
});

test('오른쪽 레일·하단 메뉴는 화면 배율에 따라 줄되 겹치지 않는다(360×640·390×844·540×800)', () => {
  // 레일: 버튼 = clamp(34px, min(11.5vw, 7.2dvh), 48px), 간격 = clamp(2px, .9dvh, 6px)
  const rail = ruleBody(hudStyles, '.utility-nav', '--rail-btn');
  const button = clampOf(rail.match(/--rail-btn: ([^;]+);/)[1]);
  const gap = flatClamp(rail, 'gap');
  for (const [width, height] of [[360, 640], [390, 844], [540, 800], [320, 568]]) {
    const size = clampAt(button, width, height), space = flatClampAt(gap, width, height);
    assert.ok(size <= 48 && size >= 34, `${width}×${height} 버튼 ${size.toFixed(1)}px`);
    // 캐릭터·설정·우편함·보상·업적·던전 + 상점 = 7칸
    const total = 7 * size + 6 * space;
    const bottom = 64 + total;
    assert.ok(bottom <= height - 170, `${width}×${height} 레일 끝 ${bottom.toFixed(0)}px — 하단 공격 패드(아래 170px) 위`);
  }
  // 버튼이 작아지면 아이콘도 같이 작아진다(100%).
  assert.match(ruleBody(hudStyles, '.utility-nav img'), /width: 100%; height: 100%/, '아이콘이 버튼을 채운다');
  assert.match(ruleBody(hudStyles, '.utility-nav button', 'var(--rail-btn)'), /width: var\(--rail-btn\); height: var\(--rail-btn\)/);

  // 하단 메뉴: 버튼 = clamp(40px, 12.5vw, 48px), 간격 = clamp(3px, 1vw, 6px)
  const nav = ruleBody(hudStyles, '.bottom-nav', '--nav-btn');
  const navButton = flatClamp(nav, '--nav-btn');
  const navGap = flatClamp(nav, 'gap');
  for (const [width, height] of [[360, 640], [390, 844], [540, 800], [320, 568]]) {
    const size = flatClampAt(navButton, width, height), space = flatClampAt(navGap, width, height);
    assert.ok(size >= 40 && size <= 48, `${width}px 하단 버튼 ${size.toFixed(1)}px(40px 터치 하한)`);
    const navRight = 10 + 4 * size + 3 * space;
    assert.ok(navRight <= width - 8, `${width}px 하단 메뉴가 화면 안(${navRight.toFixed(0)}px)`);
    // 오른쪽 아래 공격 패드(폭 150px, 좌하단에서 bottom 12px — 399px 이하 화면은 68px)와
    // 가로·세로가 **동시에** 겹치지 않아야 한다.
    const padLeft = width - (width <= 359 ? 6 : 10) - 150, padBottom = width <= 399 ? 68 : 12;
    const navTop = height - 16 - size, navBottom = height - 16, padTop = height - padBottom - 150;
    const bothOverlap = navRight > padLeft && navBottom > padTop && navTop < height - padBottom;
    assert.ok(!bothOverlap, `${width}×${height} 하단 메뉴와 공격 패드가 겹치지 않는다`);
  }
  // 예전 고정 크기 규칙은 남기지 않는다 — 화면이 작아져도 42px로 고정되던 자리.
  assert.doesNotMatch(hudStyles, /\.utility-nav button \{ width: 42px/, '낮은 화면에서도 clamp를 쓴다');
  assert.doesNotMatch(hudStyles, /\.bottom-nav button \{ flex-basis: 42px/, '하단 메뉴도 clamp를 쓴다');

  // 상세 스탯 창은 2열을 유지하고 좁은 화면에서 글자·여백을 줄인다.
  assert.match(statsStyles, /\.stats-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, '2열');
  assert.match(statsStyles, /@media \(max-width: 359px\) \{[\s\S]*\.stats-row \{ padding: 4px 5px; font-size: 10px; \}/, '좁은 화면 축소');
});
