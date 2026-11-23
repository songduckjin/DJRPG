import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createClient } from '@libsql/client';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

// `.ts`를 먼저 훅으로 읽어야 하므로 서버·게임 모듈은 정적 import로 미리 링크하지 않는다(훅 등록 뒤 동적 import).
const { schema, account } = await import('../server/database.mjs');
const { default: accountHandler } = await import('../api/account.mjs');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { totalStats } = await import('../src/game/items.ts');
const { combatPower } = await import('../src/game/power.ts');
const { characterPower, characterPowerReader } = await import('../server/character-power.mjs');
const { renderCharacters } = await import('../src/ui/modals/charactersModal.ts');

const css = modalStyles();

/**
 * 캐릭터 선택 카드의 전투력(백로그 11 · B안) — 서버·클라 계산 패리티.
 *
 * 카드는 접속 중이 아닌 캐릭터의 세이브를 갖고 있지 않으므로(이름·직업·레벨·층·장비 이름만 내려온다)
 * 전투력은 `characters` 응답의 `power`로만 알 수 있다. 이 값은 서버가 `parseSave`→`totalStats`→
 * `combatPower`를 그대로 불러 계산하므로 화면(HUD·내 정보·상세 스탯)과 같은 숫자여야 한다.
 * 여기서 고정하는 계약은 셋이다.
 *  1. 서버 `power` == 클라 `combatPower(totalStats(parseSave(원문)))` (장비·추가옵션·패시브·스탯북·직업 배율 포함)
 *  2. `characters` 응답의 슬롯마다 `power`가 실려 온다(접속 중이 아닌 슬롯 포함)
 *  3. 읽지 못한 세이브는 목록을 깨뜨리지 않고 그 카드의 전투력만 비운다
 */

/** 장비·패시브·스탯북이 붙은 세이브 — 화면이 쓰는 모든 배율을 지나가게 한다. */
const gearedSave = {
  version: 1, name: '지존전사94', gender: 'male', job: 'warrior', auto: true, autoClimb: true,
  level: 47, exp: 120, gold: 980, floor: 32, maxFloor: 32, floorKills: 3, kills: 4200, health: 1200,
  equipment: {
    weapon: { id: 'w-1', name: '전설 대검', slot: 'weapon', rarity: 'legendary', stats: { attack: 210, crit: 12, speed: 8 }, plus: 3, job: 'warrior' },
    armor: { id: 'a-1', name: '전설 갑옷', slot: 'armor', rarity: 'legendary', stats: { defense: 96, health: 420 }, plus: 2, job: 'warrior' },
    helmet: { id: 'h-1', name: '전설 투구', slot: 'helmet', rarity: 'epic', stats: { defense: 48, health: 140 }, plus: 1 }
  },
  bag: [], equipmentCollection: [], tutorial: 3, stones: 0, skillPoints: 12,
  learned: ['slash2'], passives: ['body', 'instinct'], quickSlots: ['slash2', null, null],
  skillLevels: { slash2: 5, body: 4, instinct: 3 },
  dungeonFloor: 6, dungeonClearAt: 0, bossRetryFloor: 0,
  statBooks: { attack: 3, defense: 1, health: 2, skill: 0 }
};

/** 옛 장비(추가옵션·`sec` 없음)와 마법사 — `parseSave`가 id 시드로 추가옵션을 되살리는 경로를 지난다. */
const oldMageSave = {
  version: 1, name: '빙결마도사', gender: 'male', job: 'mage', auto: true, autoClimb: true,
  level: 24, exp: 0, gold: 0, floor: 15, maxFloor: 15, floorKills: 0, kills: 10, health: 600,
  equipment: {
    weapon: { id: 'old-staff', name: '고대 지팡이', slot: 'weapon', rarity: 'rare', stats: { attack: 54 } },
    armor: { id: 'old-robe', name: '고대 로브', slot: 'armor', rarity: 'rare', stats: { defense: 22, health: 60 } }
  },
  bag: [], equipmentCollection: [], tutorial: 3, stones: 0, skillPoints: 0,
  learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {}
};

/** 장비도 패시브도 없는 새 캐릭터 — 카드가 0이 아니라 기본 스탯 전투력을 보여야 한다. */
const bareArcher = freshSave('female', 'archer');

test('서버 전투력은 클라 combatPower(totalStats(save))와 정확히 같다', async () => {
  for (const [label, save] of [['장비·패시브·스탯북', gearedSave], ['옛 장비 마법사', oldMageSave], ['장비 없는 궁수', bareArcher]]) {
    const client = combatPower(totalStats(parseSave(structuredClone(save))));
    assert.equal(await characterPower(structuredClone(save)), client, `${label}: 서버·클라 패리티`);
    assert(Number.isInteger(client) && client > 0, `${label}: 전투력은 양의 정수`);
  }
  // 직업·레벨이 다르면 숫자도 달라야 한다 — 세 슬롯이 같은 값을 보이는 사고를 막는다.
  assert.notEqual(await characterPower(structuredClone(gearedSave)), await characterPower(structuredClone(oldMageSave)));
  assert.notEqual(await characterPower(structuredClone(oldMageSave)), await characterPower(structuredClone(bareArcher)));
});

test('읽지 못한 세이브는 전투력만 비우고 던지지 않는다', async () => {
  const powerOf = await characterPowerReader();
  assert.equal(powerOf({ version: 1, name: '깨진' }), await characterPower({ version: 1, name: '깨진' }), '읽히는 세이브는 같은 값');
  assert.equal(powerOf({ hello: 'world' }), undefined, '버전이 없는 세이브는 undefined');
  assert.equal(powerOf(null), undefined);
  assert.equal(powerOf('not json'), undefined);
  await assert.rejects(characterPower({ hello: 'world' }), '엄격한 쪽은 던진다(테스트·호출자 판단용)');
});

test('characters 응답은 슬롯마다 power를 싣고, 값은 그 세이브의 클라 계산과 같다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-characters-'));
  const url = `file:${join(directory, 'character-power.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-character-power-test';
  const db = createClient({ url });
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(gearedSave), new Date().toISOString()] });
    // 1번 슬롯(접속 중)은 계정 행의 세이브에서, 2번 슬롯은 이 행에서 내려간다.
    await account(db, 'hero');
    await db.execute({ sql: 'INSERT INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 2, JSON.stringify(oldMageSave), new Date().toISOString()] });
    const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const result = {};
    const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
    await accountHandler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { action: 'characters' } }, res);
    assert.equal(result.status, 200);
    const rows = result.body.characters;
    assert.deepEqual(rows.map(row => row.slot), [1, 2]);
    for (const row of rows) {
      const stored = (await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=?', args: ['hero', row.slot] })).rows[0];
      const client = combatPower(totalStats(parseSave(JSON.parse(stored.save_json))));
      assert.equal(typeof row.power, 'number', `${row.slot}번 슬롯에 power가 있다`);
      assert.equal(row.power, client, `${row.slot}번 슬롯: 서버 power == 클라 계산`);
    }
    // 접속 중(1번)과 다른 슬롯(2번)이 서로 다른 숫자를 보여야 한다 — 서버가 슬롯별로 계산했는지 확인.
    assert.notEqual(rows[0].power, rows[1].power);
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await removeTempDbDirectory(directory);
  }
});

/* ── 카드 렌더 ───────────────────────────────────────────────────────────── */

class Node {
  children = []; attributes = {}; className = ''; textContent = ''; type = ''; onclick = null; disabled = false;
  append(...nodes) { this.children.push(...nodes); }
  classList = { toggle() {}, add() {}, remove() {} };
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelectorAll() { return []; }
}
const visit = node => [node, ...(node.children || []).filter(child => child && typeof child === 'object').flatMap(visit)];
const text = node => visit(node).map(entry => (typeof entry === 'string' ? entry : entry.textContent)).join(' ');
const withDocument = (body, run) => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node(), createTextNode: value => ({ textContent: value }), body };
  try { return run(); } finally { globalThis.document = original; }
};
const uiFixture = (overrides = {}) => ({
  characterList: { characters: [
    { slot: 1, name: '지존전사94', gender: 'male', job: 'warrior', level: 47, floor: 32, power: 12480 },
    { slot: 2, name: '달빛궁수', gender: 'female', job: 'archer', level: 39, floor: 27, power: 9860 }
  ], activeSlot: 1, maxSlots: 3, revision: 3 },
  characterPage: 0,
  // 1번 슬롯이 접속 중 — 카드 전투력은 서버 값이 아니라 지금 화면 세이브로 계산된다.
  session: { characterSlot: 1 },
  world: { save: { ...freshSave('male', 'warrior'), autoClimb: false }, onChange() {} },
  messages: [], message(value) { this.messages.push(value); },
  opened: [], open(kind) { this.opened.push(kind); }, renderModal() {},
  ...overrides
});
const cards = dialog => visit(dialog).filter(node => /(^|\s)character-slot(\s|$)/.test(node.className || ''));

test('카드 정보줄은 이름·직업만, 레벨·층과 전투력은 하단 배지 한 줄에 온다', () => withDocument(new Node(), () => {
  const ui = uiFixture();
  const dialog = new Node(); renderCharacters(ui, dialog);
  const [first, second] = cards(dialog);
  const firstSelect = visit(first).find(node => node.className === 'character-select');
  assert.equal(firstSelect.children.at(-1).textContent, '지존전사94 · 전사', '정보줄에서 Lv·층을 뺀다');
  assert.doesNotMatch(text(firstSelect), /Lv\.|층/, '카드 그림·이름 위에는 레벨·층 표기가 남지 않는다');

  const firstBadge = visit(first).find(node => node.className === 'character-power');
  assert(firstBadge, '배지 띠가 카드에 있다');
  const meta = visit(firstBadge).find(node => node.className === 'character-power-meta');
  assert.equal(meta.textContent, 'Lv.47 · 32층', '배지 왼쪽 = 레벨·층');
  const value = visit(firstBadge).find(node => node.className === 'character-power-value');
  assert(value, '배지 오른쪽 = 전투력');
  const live = combatPower(totalStats(ui.world.save));
  assert.equal(text(value).replace(/\s+/g, ' ').trim(), `⚔ ${live.toLocaleString('ko-KR')}`, '접속 중인 슬롯은 지금 세이브의 전투력(장비를 갈아입으면 바로 바뀐다)');
  assert.equal(visit(value).find(node => node.tagName === undefined && node.textContent === '⚔').attributes['aria-hidden'], 'true', '⚔는 장식');

  // 다른 슬롯은 서버가 계산한 power를 그대로 쓴다.
  const secondBadge = visit(second).find(node => node.className === 'character-power');
  assert.equal(visit(secondBadge).find(node => node.className === 'character-power-meta').textContent, 'Lv.39 · 27층');
  assert.equal(text(visit(secondBadge).find(node => node.className === 'character-power-value')).replace(/\s+/g, ' ').trim(), `⚔ ${(9860).toLocaleString('ko-KR')}`);
  // 빈 슬롯에는 배지가 없다.
  assert.equal(cards(dialog)[2] && visit(cards(dialog)[2]).some(node => node.className === 'character-power'), false, '빈 슬롯에는 배지를 그리지 않는다');
}));

test('펼친 카드에서도 배지는 선택·방치·삭제 버튼 바로 위에 남는다', () => withDocument(new Node(), () => {
  const ui = uiFixture(); ui.characterFocus = 1;
  const dialog = new Node(); renderCharacters(ui, dialog);
  const first = cards(dialog)[0];
  const own = first.children.filter(node => node && typeof node === 'object');
  const badge = own.findIndex(node => node.className === 'character-power');
  const connect = own.findIndex(node => node.className === 'character-connect');
  const select = own.findIndex(node => node.className === 'character-select');
  assert(select >= 0 && select < badge, '배지는 카드 그림·이름 아래에 온다');
  assert.equal(badge + 1, connect, '배지 바로 다음이 선택 버튼이다(버튼 위 고정)');
  const idle = own.findIndex(node => node.className === 'character-idle');
  const remove = own.findIndex(node => node.className === 'character-delete');
  assert(idle > connect && remove > idle, '선택·방치·삭제 순서는 그대로');
  // 펼친 카드에서 정보 영역이 늘어나 배지가 버튼 위로 밀려나지 않게 하는 규칙.
  assert.match(css, /\.character-slot\.focused \.character-select \{ flex: 1 1 auto; \}/, '펼친 카드에서도 정보 영역이 남는 높이를 먹는다');
  assert.doesNotMatch(css, /\.character-slot\.focused \.character-select \{ flex: 0 0 auto; \}/);
}));

test('배지 띠는 카드 폭을 채우고, 긴 문구는 단어 중간에서 끊지 않는다', () => {
  assert.match(css, /\.character-power \{[^}]*margin: auto -8px -8px;/, '좌우·아래 음수 마진으로 테두리까지 채운다(카드 padding 8px)');
  assert.match(css, /\.character-power \{[^}]*white-space: nowrap;/, '레벨·층과 전투력은 한 줄에 둔다');
  assert.match(css, /\.character-slot \{[^}]*word-break: keep-all;/, '이름·직업이 단어 중간에서 끊기지 않는다');
});

test('서버가 전투력을 주지 않아도 배지는 레벨·층만으로 그려진다', () => withDocument(new Node(), () => {
  // 구서버·손상된 세이브: `power`가 없는 목록. 접속 중이 아닌 슬롯(9번)이라 화면 세이브로도 계산할 수 없다.
  const ui = uiFixture({ session: { characterSlot: 9 }, characterList: { characters: [
    { slot: 1, name: '지존전사94', gender: 'male', job: 'warrior', level: 47, floor: 32 }
  ], activeSlot: 1, maxSlots: 3, revision: 3 } });
  const dialog = new Node(); renderCharacters(ui, dialog);
  const badge = visit(cards(dialog)[0]).find(node => node.className === 'character-power');
  assert.equal(visit(badge).find(node => node.className === 'character-power-value'), undefined, '전투력이 없으면 숫자를 그리지 않는다');
  assert.equal(badge.attributes['aria-label'], 'Lv.47 · 32층');
}));
