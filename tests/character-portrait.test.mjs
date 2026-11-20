import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import accountHandler from '../api/account.mjs';
import './ts-loader.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { baseItems, bowBases, staffBases } = await import('../src/game/items.ts');
const { equipmentFallbackPortrait, equipmentPortraitPlan, renderEquipmentPortrait } = await import('../src/ui/equipmentPortrait.ts');
const { characterPortraitSave, characterPortraitHeight, renderCharacters } = await import('../src/ui/modals/charactersModal.ts');

const item = (slot, name) => ({ id: `${slot}-${name}`, name, slot, rarity: 'rare', stats: { attack: 10, defense: 10 } });

/** 서버 `characters` 응답처럼 장비 **이름**만 담은 요약(작업 210). */
const summaryOf = (save, slot = 1) => ({
  slot, name: save.name, gender: save.gender, job: save.job, level: save.level, floor: save.floor,
  equipment: Object.fromEntries(['helmet', 'armor', 'weapon'].map(key => [key, save.equipment?.[key] ? { name: save.equipment[key].name } : null]))
});

test('characters response sends only the worn equipment names for the card portrait', async () => {
  // `removeTempDbDirectory`가 허용하는 접두사(공용 헬퍼) 안에서 만든다.
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-characters-card-'));
  const url = `file:${join(directory, 'card.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-card-portrait-test';
  const db = createClient({ url });
  const geared = {
    version: 1, name: '장비전사', gender: 'female', job: 'warrior', auto: true, autoClimb: true, level: 12, exp: 0, gold: 90,
    floor: 6, maxFloor: 6, floorKills: 0, kills: 0, health: 100,
    equipment: { helmet: item('helmet', baseItems.helmet[1]), armor: item('armor', baseItems.armor[2]), weapon: item('weapon', baseItems.weapon[3]) },
    equipmentCollection: [], bag: [], tutorial: 3, stones: 0, skillPoints: 0, lastActiveAt: Date.now(),
    learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {}, dungeonFloor: 0, dungeonClearAt: 0
  };
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(geared), new Date().toISOString()] });
    await db.execute({ sql: 'INSERT INTO djrpg_character_item_owners VALUES (?,?,?)', args: [geared.equipment.helmet.id, 'hero', 1] });
    await db.execute({ sql: 'INSERT INTO djrpg_character_item_owners VALUES (?,?,?)', args: [geared.equipment.armor.id, 'hero', 1] });
    await db.execute({ sql: 'INSERT INTO djrpg_character_item_owners VALUES (?,?,?)', args: [geared.equipment.weapon.id, 'hero', 1] });
    await db.execute({ sql: 'INSERT INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 1, JSON.stringify({ ...geared, gold: undefined }), new Date().toISOString()] });
    await db.execute({ sql: 'INSERT INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 2, JSON.stringify({ ...geared, name: '빈손마법사', job: 'mage', equipment: {}, gold: undefined }), new Date().toISOString()] });
    const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const result = {};
    const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
    await accountHandler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { action: 'characters' } }, res);
    assert.equal(result.status, 200);
    const [first, second] = result.body.characters;
    // 이름만 내려간다 — 능력치·세이브 본문·계정 정보는 응답에 없다.
    assert.deepEqual(first.equipment, {
      helmet: { name: baseItems.helmet[1] }, armor: { name: baseItems.armor[2] }, weapon: { name: baseItems.weapon[3] }
    });
    for (const entry of Object.values(first.equipment)) assert.deepEqual(Object.keys(entry), ['name']);
    assert.deepEqual(second.equipment, { helmet: null, armor: null, weapon: null });
    assert.equal(JSON.stringify(result.body).includes('save_json'), false);
    assert.equal(first.itemCount, 3);
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await removeTempDbDirectory(directory);
  }
});

test('a character summary draws the same worn-gear portrait as the live save for every job', () => {
  const cases = [
    { job: 'warrior', labels: { helmet: baseItems.helmet[1], armor: baseItems.armor[2], weapon: baseItems.weapon[3] } },
    { job: 'archer', labels: { helmet: baseItems.helmet[4], armor: baseItems.armor[5], weapon: bowBases[6] } },
    { job: 'mage', labels: { helmet: baseItems.helmet[7], armor: baseItems.armor[8], weapon: staffBases[9] } }
  ];
  for (const gender of ['male', 'female']) {
    for (const { job, labels } of cases) {
      const live = freshSave(gender, job);
      live.equipment = { helmet: item('helmet', labels.helmet), armor: item('armor', labels.armor), weapon: item('weapon', labels.weapon) };
      const card = characterPortraitSave(summaryOf(live));
      const fromLive = equipmentPortraitPlan(live), fromCard = equipmentPortraitPlan(card);
      assert.equal(card.gender, live.gender);
      assert.equal(card.job, job);
      assert.equal(fromCard.base, fromLive.base, `${job}/${gender} 전신 시트가 라이브 세이브와 같다`);
      assert.equal(fromCard.key, fromLive.key, `${job}/${gender} 합성 키가 라이브 세이브와 같다`);
      // 장비 파츠도 직업별로 그대로 붙는다(전사 대검·궁수 활/투구·마법사 지팡이/모자).
      if (job === 'warrior') { assert(fromCard.weapon); assert(fromCard.helmet); }
      if (job === 'archer') { assert(fromCard.bow); assert(fromCard.archerHelm); }
      if (job === 'mage') { assert(fromCard.staff); assert(fromCard.mageHelm); }
    }
  }
});

test('a bare character summary falls back to its job sheet and legacy base portraits are gone', () => {
  const bare = freshSave('female', 'archer');
  const card = characterPortraitSave({ slot: 2, name: '빈손', gender: 'female', job: 'archer', level: 3, floor: 2, equipment: { helmet: null, armor: null, weapon: null } });
  assert.equal(equipmentPortraitPlan(card).key, equipmentPortraitPlan(bare).key);
  assert.equal(equipmentFallbackPortrait(card), '/assets/pilot-25d/archer_female_idle_v1.png?v=2');
  // 서버가 장비 정보를 아직 안 보낸 응답(구버전 서버·guest)에서도 카드가 깨지지 않는다.
  const legacy = characterPortraitSave({ slot: 3, name: '옛캐릭', gender: 'male', level: 1, floor: 1 });
  assert.equal(equipmentFallbackPortrait(legacy), '/assets/pilot-25d/warrior_male_idle_v1.png');
  const source = readFileSync(new URL('../src/ui/modals/charactersModal.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('warrior_${gender}_base.png'), false, '구형 warrior_*_base 초상화를 쓰지 않는다');
});

test('character cards paint the composite portrait of the live slot and of the other slots', () => {
  const originals = { document: globalThis.document, Image: globalThis.Image };
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.className = ''; this.attributes = {}; this.classList = { toggle() {} }; this.isConnected = false; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener() {}
  }
  // 이미지 로딩은 끝나지 않게 둔다 — 첫 페인트(전신 시트)만 확인하면 된다.
  class PendingImage { set src(value) { this.current = value; } get src() { return this.current; } }
  globalThis.Image = PendingImage;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
  try {
    const live = freshSave('female');
    live.equipment = { armor: item('armor', baseItems.armor[2]), helmet: item('helmet', baseItems.helmet[1]) };
    const other = freshSave('male', 'mage');
    other.name = '다른마법사';
    other.equipment = { armor: item('armor', baseItems.armor[4]), weapon: item('weapon', staffBases[3]) };
    const ui = {
      characterList: { characters: [{ slot: 1, name: '지금', gender: 'female', job: 'warrior', level: 9, floor: 4 }, { ...summaryOf(other, 2), name: '다른마법사' }], activeSlot: 1, maxSlots: 3, loadedAt: Date.now() },
      characterPage: 0, session: { characterSlot: 1 }, world: { save: live },
      market: { sync: { flush: async () => true } }, message() {}, renderModal() {}
    };
    const dialog = new Element();
    renderCharacters(ui, dialog);
    const visit = node => [node, ...(node.children || []).filter(child => child && typeof child === 'object' && child.children).flatMap(visit)];
    const images = visit(dialog).filter(node => node.tagName === 'IMG');
    assert.equal(images.length, 2);
    assert.equal(images[0].className, 'character-portrait');
    assert.equal(images[0].src, equipmentFallbackPortrait(live), '접속 슬롯은 라이브 세이브(방금 바꾼 장비)를 쓴다');
    assert.equal(images[1].src, equipmentFallbackPortrait(characterPortraitSave(summaryOf(other, 2))), '다른 슬롯은 서버가 준 장비 이름으로 그린다');
    assert.notEqual(images[1].src, equipmentFallbackPortrait(freshSave('male', 'mage')), '다른 슬롯도 장비 티어를 반영한다');
  } finally {
    globalThis.document = originals.document; globalThis.Image = originals.Image;
  }
});

test('the card portrait is composited at the card height without touching the equipment modal cache', async () => {
  const originals = { document: globalThis.document, Image: globalThis.Image };
  const drawn = [];
  class Image2 {
    naturalWidth = 362; naturalHeight = 362;
    set src(value) { this.current = value; this.onload?.(); }
    get src() { return this.current; }
  }
  const context = {
    imageSmoothingEnabled: true, imageSmoothingQuality: '', scale() {}, translate() {}, save() {}, restore() {}, rotate() {}, drawImage(...args) { drawn.push(args); }
  };
  globalThis.Image = Image2;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,card' }) };
  try {
    const save = freshSave('female');
    save.equipment = { armor: item('armor', baseItems.armor[2]), weapon: item('weapon', baseItems.weapon[3]), helmet: item('helmet', baseItems.helmet[1]) };
    const dataUrl = await renderEquipmentPortrait(save, { height: characterPortraitHeight });
    assert.equal(dataUrl, 'data:image/png;base64,card');
    // 전신 1 + 투구 + 대검 = 3장을 그린다.
    assert.equal(drawn.length, 3);
    assert.equal(characterPortraitHeight, 360);
  } finally {
    globalThis.document = originals.document; globalThis.Image = originals.Image;
  }
});
