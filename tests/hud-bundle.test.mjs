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
/**
 * CSS 길이 → **배율 1.0(390px)** 기준 값. HUD는 `calc(N * var(--u))`를 쓰고,
 * 세로 위치가 `env(safe-area-inset-top)`을 더하는 규칙도 있다. 옛 `Npx`도 같이 읽어
 * "390px에서 지금과 같은가"를 같은 숫자로 비교한다.
 */
const len = (body, property) => {
  const number = '(-?[\\d.]+)';
  const patterns = [
    new RegExp(`${property}:\\s*calc\\(env\\([^)]*\\) \\+ ${number}(?:px| \\* var\\(--u\\))\\)`),
    new RegExp(`${property}:\\s*calc\\(${number} \\* var\\(--u\\)\\)`),
    new RegExp(`${property}:\\s*${number}px`)
  ];
  for (const pattern of patterns) {
    const found = body.match(pattern);
    if (found) return Number(found[1]);
  }
  assert.fail(`${property} 길이를 읽는다`);
};
/** `--u` 토큰 — `base.css`의 `.game-shell`이 정하는 한 곳(`clamp(0.8px, 100vw × k, 1.1px)`). */
const uSpec = (() => {
  const found = read('src/styles/base.css').match(/--u:\s*clamp\(([\d.]+)px, calc\(100vw \* ([\d.]+)\), ([\d.]+)px\)/);
  assert.ok(found, '`.game-shell`에 `--u` 토큰이 있다');
  return { min: Number(found[1]), factor: Number(found[2]), max: Number(found[3]) };
})();
const uAt = width => Math.min(uSpec.max, Math.max(uSpec.min, width * uSpec.factor));

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
  for (const modal of ['settings', 'mail', 'rewards', 'achievements', 'dungeon']) assert.match(rail, new RegExp(`data-modal="${modal}"`), `${modal} 유지`);
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
  assert.equal(len(label, 'top'), 71, '동그라미(70u) 바로 아래');
  assert.equal(len(label, 'height'), 14);
  assert.match(label, /pointer-events:none/, '동그라미 탭을 막지 않는다');
  assert.match(label, /white-space:nowrap/);
  // 3/3은 원 안 50~67u, 라벨은 71~85u.
  const count = ruleBody(worldBossStyles, '.world-boss-entry .wb-entry-count', 'top:calc(50 * var(--u))');
  const countTop = len(count, 'top'), countHeight = len(count, 'height');
  assert.ok(countTop + countHeight <= 71, `3/3(${countTop + countHeight}u) 아래에 라벨(71u)`);
});

test('좌상단 세로줄은 배지→닉네임→전투력→HP→월드보스→라벨→튜토리얼 순서로 3u 이상 여유를 둔다', () => {
  // 자리·크기는 모두 `calc(N * var(--u))`라 390px에서 보면 N = 지금 px 값 그대로다(비율은 폭이 달라도 같다).
  const badge = ruleBody(hudStyles, '.level-badge');
  const name = ruleBody(hudStyles, '.hero-name');
  const power = ruleBody(hudStyles, '.hero-power');
  const health = ruleBody(hudStyles, '.health-bar');
  const tutorial = ruleBody(hudStyles, '.tutorial');
  const boss = ruleBody(worldBossStyles, '.world-boss-entry', 'top:calc(env(safe-area-inset-top, 0px) + 111 * var(--u))');
  const label = ruleBody(worldBossStyles, '.world-boss-entry .wb-entry-label');

  const badgeTop = len(badge, 'top'), badgeHeight = len(badge, 'height');
  const nameTop = len(name, 'top'), nameHeight = len(name, 'height');
  const powerTop = len(power, 'top'), powerHeight = len(power, 'height');
  const healthTop = len(health, 'top'), healthHeight = len(health, 'height');
  const bossTop = len(boss, 'top');
  const labelTop = len(label, 'top'), labelHeight = len(label, 'height');
  const tutorialTop = len(tutorial, 'top');
  assert.ok(labelTop > 0, '라벨 위치');

  assert.ok(nameTop >= badgeTop + badgeHeight, '닉네임은 배지 원 아래');
  assert.ok(powerTop - (nameTop + nameHeight) >= 2, `이름판 아래 ${powerTop - (nameTop + nameHeight)}u`);
  assert.ok(healthTop - (powerTop + powerHeight) >= 3, `전투력과 HP 사이 ${healthTop - (powerTop + powerHeight)}u`);
  assert.ok(bossTop - (healthTop + healthHeight) >= 3, `HP와 월드보스 사이 ${bossTop - (healthTop + healthHeight)}u`);
  assert.ok(tutorialTop - (bossTop + 70 + labelHeight) >= 3, '라벨과 튜토리얼 배너 사이');
  assert.ok(12 + 140 < 360, '닉네임·전투력 140u 상한은 360px 화면 안');
  assert.match(power, /font: 700 calc\(9\.5 \* var\(--u\)\)/, '전투력 필은 이름판보다 작은 글자');
  assert.match(statsModalSource, /이름|전투력/, '상세 스탯도 같은 전투력을 보여 준다');
});

test('오른쪽 레일·하단 메뉴는 화면 배율(--u)을 따라 줄되 320·360·390·430·540에서 겹치지 않는다', () => {
  // HUD 길이는 `calc(N * var(--u))` — 버튼처럼 손가락이 닿는 곳만 `max(40px, …)`·`max(34px, …)`로 하한을 지킨다.
  const rail = ruleBody(hudStyles, '.utility-nav', '--rail-btn');
  const railToken = rail.match(/--rail-btn: max\((\d+)px, calc\((\d+) \* var\(--u\)\)\)/);
  assert.ok(railToken, '레일 버튼 = max(34px, calc(46 * var(--u)))');
  assert.equal(Number(railToken[1]), 34, '레일 터치 하한 34px');
  const railFloor = Number(railToken[1]), railBase = Number(railToken[2]);
  assert.equal(railBase, 46, '390px에서 예전 44.85px 자리');
  const railGap = len(rail, 'gap'), railTop = len(rail, 'top');

  const nav = ruleBody(hudStyles, '.bottom-nav', '--nav-btn');
  const navToken = nav.match(/--nav-btn: max\((\d+)px, calc\((\d+) \* var\(--u\)\)\)/);
  assert.ok(navToken, '하단 버튼 = max(40px, calc(48 * var(--u)))');
  const navFloor = Number(navToken[1]), navBase = Number(navToken[2]);
  assert.equal(navFloor, 40, '하단 메뉴 터치 하한 40px');
  assert.equal(navBase, 48, '390px에서 예전 48px');
  const navGap = len(nav, 'gap'), navLeft = len(nav, 'left');
  assert.equal(navLeft, 10, '왼쪽 여백 10u');

  // 오른쪽 아래 공격 패드 — 폭 150u, 아래 12u(399px 이하 62u), 오른쪽 10u.
  const pad = ruleBody(hudStyles, '.action-pad', 'width: calc(150 * var(--u))');
  const padWidth = len(pad, 'width');
  const padShortBottom = Number(hudStyles.match(/@media \(max-width: 399px\) \{ \.action-pad \{ bottom: calc\((\d+) \* var\(--u\)\); \} \}/)?.[1]);
  assert.equal(padShortBottom, 62, '좁은 화면은 패드를 메뉴 위로 올린다');

  for (const width of [320, 360, 390, 430, 540]) {
    const u = uAt(width);
    const railSize = Math.max(railFloor, railBase * u);
    const railEnd = railTop * u + 7 * railSize + 6 * railGap * u;
    assert.ok(railSize >= 34, `${width}px 레일 버튼 ${railSize.toFixed(1)}px(터치 하한)`);
    // 844px 높이 기준으로 레일 끝이 하단 공격 패드(아래 170px)보다 위여야 한다.
    assert.ok(railEnd <= 844 - 170, `${width}px 레일 끝 ${railEnd.toFixed(0)}px — 하단 패드 위`);

    const navSize = Math.max(navFloor, navBase * u);
    assert.ok(navSize >= 40, `${width}px 하단 버튼 ${navSize.toFixed(1)}px(터치 하한)`);
    const navRight = navLeft * u + 4 * navSize + 3 * navGap * u;
    assert.ok(navRight <= width - 8, `${width}px 하단 메뉴가 화면 안(${navRight.toFixed(0)}px)`);
    // 공격 패드와 가로·세로가 **동시에** 겹치지 않아야 한다(높이 640px로 가장 좁은 경우를 본다).
    const height = width <= 360 ? 640 : 844;
    const padRight = width - (padWidth + 10) * u;
    const padBottom = width <= 399 ? padShortBottom * u : 12 * u;
    const navTop = height - 16 * u - navSize, navBottom = height - 16 * u;
    const padTop = height - padBottom - padWidth * u;
    const bothOverlap = navRight > padRight && navBottom > padTop && navTop < height - padBottom;
    assert.ok(!bothOverlap, `${width}×${height} 하단 메뉴와 공격 패드가 겹치지 않는다`);
  }

  // 배율 토큰은 한 곳(`.game-shell`)에만 있고, 390px=1.0 · 360px≈0.92 · 430px 이상 1.10이다.
  assert.equal(uAt(390).toFixed(3), '0.998', '390px ≈ 1.0');
  assert.equal(uAt(360).toFixed(3), '0.922', '360px ≈ 0.92');
  assert.equal(uAt(430), 1.1, '430px = 1.10');
  assert.equal(uAt(320).toFixed(3), '0.819', '320px ≈ 0.82 (0.8 하한보다 위)');
  assert.doesNotMatch(hudStyles, /clamp\(40px, 12\.5vw, 48px\)/, '옛 clamp 배율은 토큰으로 옮겼다');
  assert.doesNotMatch(hudStyles, /--rail-btn: clamp\(/, '레일도 토큰을 쓴다');

  // 상세 스탯 창은 2열을 유지하고 좁은 화면에서 글자·여백을 줄인다.
  assert.match(statsStyles, /\.stats-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, '2열');
  assert.match(statsStyles, /@media \(max-width: 359px\) \{[\s\S]*\.stats-row \{ padding: 4px 5px; font-size: 10px; \}/, '좁은 화면 축소');
});
