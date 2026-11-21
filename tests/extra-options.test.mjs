// 장비 추가옵션(작업 238) — 에픽 1 · 유니크 2 · 전설 3개, 9종 1~3%, 기존 지급 장비 자동 부여,
// 회피 30% 상한·5초 회복·피흡·추가 데미지의 실제 전투 동작, 서버 검증·정규화까지 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const extra = await import('../src/game/extraOptions.ts');
const items = await import('../src/game/items.ts');
const store = await import('../src/game/store.ts');
const worldModule = await import('../src/game/world.ts');
const serverExtra = await import('../server/extra-options.mjs');
const { itemWithinBounds } = await import('../server/save-guard.mjs');

const {
  EXTRA_EVASION_CAP, EXTRA_REGEN_CAP, EXTRA_LIFESTEAL_CAP, extraOptionKeys, extraOptionCount, extraOptionCounts,
  deriveExtraOptions, extraOptionsFor, normalizeExtraOptions, effectiveExtraOptions, extraOptionTotals, extraOptionLines,
  extraOptionPower
} = extra;
const { rollItem, totalStats, itemPower, autoEquipBest, migrateItem } = items;
const { freshSave, parseSave } = store;
const { World } = worldModule;

const equipment = (id, slot, rarity, stats, extraOptions) => {
  const item = { id, name: `${rarity} ${slot}`, slot, rarity, stats };
  if (extraOptions) item.extraOptions = extraOptions;
  normalizeExtraOptions(item);
  return item;
};

// ── 1. 등급별 개수·풀·범위 ────────────────────────────────────────────────────
test('추가옵션 개수는 에픽 1 · 유니크 2 · 전설 3이고 일반·매직·레어는 0이다', () => {
  assert.deepEqual(extraOptionCounts, { common: 0, magic: 0, rare: 0, epic: 1, unique: 2, legendary: 3 });
  for (const [rarity, count] of Object.entries(extraOptionCounts)) assert.equal(extraOptionCount(rarity), count);
  assert.equal(extraOptionCount('nope'), 0);
});

test('추가옵션 10종은 한 아이템 안에서 중복 없이 1~3%(쿨감은 1~2%) 정수로 뽑힌다', () => {
  assert.deepEqual([...extraOptionKeys], ['regenPct', 'bonusDmgPct', 'lifestealPct', 'attackPct', 'critPct', 'defensePct', 'healthPct', 'evasionPct', 'speedPct', 'cdrPct']);
  for (const rarity of ['epic', 'unique', 'legendary']) {
    const wanted = extraOptionCount(rarity);
    for (let index = 0; index < 400; index++) {
      const id = crypto.randomUUID(), options = deriveExtraOptions(rarity, id);
      const keys = Object.keys(options);
      assert.equal(keys.length, wanted, `${rarity}는 ${wanted}개`);
      assert.equal(new Set(keys).size, keys.length, '중복 없음');
      for (const key of keys) {
        assert(extraOptionKeys.includes(key), `${key}는 풀의 키`);
        // 밸런스 v2: 쿨감(`cdrPct`)만 1~2%, 나머지는 1~3% 정수다.
        const max = key === 'cdrPct' ? 2 : 3;
        assert(Number.isInteger(options[key]) && options[key] >= 1 && options[key] <= max, `${key}=${options[key]}는 1~${max} 정수`);
      }
    }
  }
  for (const rarity of ['common', 'magic', 'rare']) assert.deepEqual(deriveExtraOptions(rarity, crypto.randomUUID()), {});
});

test('같은 id면 언제 계산해도 같은 옵션이 나온다(기존 장비도 그대로)', () => {
  for (let index = 0; index < 50; index++) {
    const id = crypto.randomUUID();
    assert.deepEqual(deriveExtraOptions('unique', id), deriveExtraOptions('unique', id));
  }
  // 다른 id가 전부 같은 조합이면 시드가 동작하지 않는 것이다.
  const seen = new Set(Array.from({ length: 60 }, () => JSON.stringify(deriveExtraOptions('legendary', crypto.randomUUID()))));
  assert(seen.size > 20, `조합이 id마다 달라진다 (${seen.size}종)`);
});

test('서버 사본과 클라이언트가 같은 옵션을 계산한다', () => {
  for (const rarity of ['epic', 'unique', 'legendary']) {
    for (let index = 0; index < 60; index++) {
      const id = crypto.randomUUID();
      assert.deepEqual(serverExtra.deriveExtraOptions(rarity, id), deriveExtraOptions(rarity, id), `${rarity} ${id}`);
    }
  }
});

// ── 2. 기존 지급 장비 자동 부여 ──────────────────────────────────────────────
test('이미 지급된 에픽·유니크·전설 장비는 로드에서 추가옵션을 얻는다', () => {
  const save = freshSave();
  save.equipment = {
    weapon: { id: 'old-legend', name: '영원의 룬 블레이드', slot: 'weapon', rarity: 'legendary', stats: { attack: 200 } },
    helmet: { id: 'old-unique', name: '고대의 바이저 투구', slot: 'helmet', rarity: 'unique', stats: { defense: 80 } },
    ring1: { id: 'old-epic', name: '비전의 군주의 반지', slot: 'ring1', rarity: 'epic', stats: { attack: 50 } },
    boots: { id: 'old-common', name: '낡은 부츠', slot: 'boots', rarity: 'common', stats: { defense: 5 } }
  };
  save.bag = [{ id: 'old-rare', name: '황혼의 클레이모어', slot: 'weapon', rarity: 'rare', stats: { attack: 40 } }];
  const parsed = parseSave(save);
  assert.equal(Object.keys(parsed.equipment.weapon.extraOptions).length, 3);
  assert.equal(Object.keys(parsed.equipment.helmet.extraOptions).length, 2);
  assert.equal(Object.keys(parsed.equipment.ring1.extraOptions).length, 1);
  assert.equal(parsed.equipment.boots.extraOptions, undefined, '일반은 없다');
  assert.equal(parsed.bag[0].extraOptions, undefined, '레어는 없다');
  // 저장된 옵션이 없던 장비도 다시 읽으면 같은 옵션(결정적).
  assert.deepEqual(parsed.equipment.weapon.extraOptions, parseSave(save).equipment.weapon.extraOptions);
});

test('저장된 옵션이 규칙에 맞으면 그대로 유지하고, 어긋나면 id로 다시 계산한다', () => {
  const kept = migrateItem({ id: 'fixed-id', name: '비전의 두손검', slot: 'weapon', rarity: 'epic', stats: { attack: 10 }, extraOptions: { speedPct: 2 } });
  assert.deepEqual(kept.extraOptions, { speedPct: 2 });
  const forged = migrateItem({ id: 'fixed-id-2', name: '비전의 두손검', slot: 'weapon', rarity: 'epic', stats: { attack: 10 }, extraOptions: { speedPct: 2, attackPct: 3 } });
  assert.deepEqual(forged.extraOptions, deriveExtraOptions('epic', 'fixed-id-2'), '개수가 틀리면 다시 뽑는다');
  const badValue = migrateItem({ id: 'fixed-id-3', name: '영원의 두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 10 }, extraOptions: { attackPct: 9 } });
  assert.deepEqual(badValue.extraOptions, deriveExtraOptions('legendary', 'fixed-id-3'), '범위 밖 값은 다시 뽑는다');
});

test('새로 떨어지는 장비도 등급에 맞는 추가옵션을 달고 나온다', () => {
  const previous = Math.random;
  Math.random = () => .0001; // 전설 확률 구간에 걸리게 한다
  try {
    for (let index = 0; index < 20; index++) {
      const item = rollItem(20, false, true, 'warrior');
      const count = extraOptionCount(item.rarity);
      assert.equal(Object.keys(extraOptionsFor(item)).length, count, `${item.rarity} ${count}개`);
      assert.deepEqual(item.extraOptions, deriveExtraOptions(item.rarity, item.id), 'id 시드와 같은 값');
    }
  } finally { Math.random = previous; }
  assert.equal(rollItem(1, true).extraOptions, undefined, '튜토리얼 확정 드롭(일반)에는 없다');
});

// ── 3. 스탯·전투력·자동 장착 ─────────────────────────────────────────────────
test('% 스탯은 보정이 끝난 최종 공격·방어·체력에 곱해지고 치명타·공속은 더해진다', () => {
  const base = totalStats(freshSave());
  const save = freshSave();
  save.equipment = {
    weapon: equipment('w1', 'weapon', 'epic', { attack: 0 }, { attackPct: 3 }),
    helmet: equipment('h1', 'helmet', 'unique', { defense: 0 }, { defensePct: 2, healthPct: 3 }),
    ring1: equipment('r1', 'ring1', 'legendary', { attack: 0 }, { critPct: 3, speedPct: 2, evasionPct: 3 })
  };
  const stats = totalStats(save);
  // 장비 스탯이 0이라 레벨 기본값만 남는다 — 거기에 %만 곱한다.
  assert.equal(stats.attack, Math.ceil(base.attack * 1.03));
  assert.equal(stats.defense, Math.ceil(base.defense * 1.02));
  assert.equal(stats.health, Math.ceil(base.health * 1.03));
  assert.equal(stats.crit, base.crit + 3);
  assert.equal(stats.speed, base.speed + 2);
  // 합계도 같은 값이다.
  const totals = extraOptionTotals(save.equipment);
  assert.equal(totals.attackPct, 3);
  assert.equal(totals.defensePct, 2);
  assert.equal(totals.evasionPct, 3);
});

test('회피 30% · 체력회복 12%/5초 · 피흡 5% · 치명·공속 10% · 쿨감 6% 합산 상한이 걸린다', () => {
  const save = freshSave();
  const slots = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2'];
  // 10부위에 3%씩 = 30% 회피·회복·피흡을 만들 수는 없다(키 중복 금지) — 부위마다 다른 조합으로 쌓는다.
  save.equipment = Object.fromEntries(slots.map((slot, index) => [slot, equipment(`cap-${index}`, slot, 'legendary',
    { defense: 0 }, index % 2 ? { evasionPct: 3, regenPct: 3, lifestealPct: 3 } : { evasionPct: 3, regenPct: 3, lifestealPct: 2 })]));
  const raw = extraOptionTotals(save.equipment);
  assert(raw.evasionPct >= 30);
  const effective = effectiveExtraOptions(save.equipment);
  assert.equal(effective.evasionPct, EXTRA_EVASION_CAP);
  assert.equal(effective.regenPct, EXTRA_REGEN_CAP);
  assert.equal(effective.lifestealPct, EXTRA_LIFESTEAL_CAP);
});

test('전투력이 추가옵션 몫을 더해, 같은 스탯이면 옵션 좋은 장비가 이긴다', () => {
  // 같은 등급·같은 스탯 — 옵션만 다르다(낮은 옵션 vs 공격력 +3%).
  const plain = equipment('plain', 'weapon', 'epic', { attack: 50 }, { defensePct: 1 });
  const loud = equipment('loud', 'weapon', 'epic', { attack: 50 }, { attackPct: 3 });
  assert(extraOptionPower(plain) > 0);
  assert(extraOptionPower(loud) > 0);
  assert(itemPower(loud) > itemPower(plain));
  const save = freshSave();
  save.equipment.weapon = plain;
  save.bag = [loud];
  assert.equal(autoEquipBest(save), 1, '자동 장착이 옵션 좋은 장비를 고른다');
  assert.equal(save.equipment.weapon.id, 'loud');
});

// ── 4. 실제 전투 ─────────────────────────────────────────────────────────────
const heroSave = (extraOptions, rarity = 'epic') => {
  const save = freshSave('male', 'warrior');
  save.tutorial = 3;
  save.level = 10;
  // 입문 구간(1~4층)의 자연 회복과 섮이지 않게 6층으로 둔다(밸런스 v2 온보딩).
  save.floor = 6;
  save.health = 100000;
  save.equipment = { weapon: equipment(`w-${JSON.stringify(extraOptions)}`, 'weapon', rarity, { attack: 40 }, extraOptions) };
  return save;
};
const target = (world, distance = 60) => {
  const enemy = { x: world.player.x + distance, y: world.player.y, hp: 1e9, maxHp: 1e9, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies = [enemy];
  return enemy;
};

test('추가 데미지는 최종 피해를, 피흡은 가한 피해의 N%를 회복한다', () => {
  const save = heroSave({ bonusDmgPct: 3, lifestealPct: 3 }, 'unique');
  const world = new World(save);
  world.critRoll = () => 1; // 치명타가 끼어들지 않게 — 이 테스트는 추가 데미지·피흡만 본다
  const maxHp = totalStats(save).health;
  world.player.hp = Math.floor(maxHp / 2);
  const enemy = target(world);
  world.damage(90, 100, 0, Math.PI, 0, 0, world.player, 1);
  assert.equal(Math.round(enemy.hp), 1e9 - 103, '+3% 추가 데미지');
  // 밸런스 v2: 피흡은 한 타에 최대 체력의 0.4%까지만 찬다(최대 체력 22만·Lv.10 → 1).
  const heal = Math.min(Math.round(103 * 3 / 100), Math.max(1, Math.ceil(maxHp * .004)));
  assert.equal(Math.round(world.player.hp), Math.floor(maxHp / 2) + heal, '피흡 3%');
  assert(world.effects.some(effect => effect.kind === 'heal'), '회복 숫자를 띄운다');
  // 한 번의 타격 회복은 최대 체력의 0.4%를 넘지 않는다.
  world.player.hp = 1;
  world.damage(90, maxHp * 10, 0, Math.PI, 0, 0, world.player, 1);
  assert.equal(Math.round(world.player.hp - 1), Math.ceil(maxHp * .004), '0.4% 상한');
});

test('추가옵션이 없으면 피해·회복이 예전 그대로다', () => {
  const save = freshSave('male', 'warrior');
  save.tutorial = 3;
  const world = new World(save);
  world.player.hp = 50;
  const enemy = target(world);
  world.damage(90, 100, 0, Math.PI, 0, 0, world.player, 1);
  assert.equal(Math.round(enemy.hp), 1e9 - 100);
  assert.equal(world.player.hp, 50, '피흡이 없으면 차지 않는다');
});

test('회피율은 맞을 순간 굴려 피해를 무시하고 `회피`를 띄운다', () => {
  const save = heroSave({ evasionPct: 3 });
  const world = new World(save);
  world.spawnTimer = Infinity;
  world.player.hit = 0;
  world.player.hp = 1000;
  const enemy = target(world, 30);
  enemy.hp = 1e9;
  const previous = Math.random;
  Math.random = () => 0; // 3% 굴림에서 언제나 회피
  try { world.update(1 / 60); } finally { Math.random = previous; }
  assert.equal(world.player.hp, 1000, '회피하면 체력 그대로');
  assert(world.effects.some(effect => effect.kind === 'evade'));
  world.effects = [];
  world.player.hit = 0;
  Math.random = () => .99; // 굴림 실패 → 그대로 맞는다
  try { world.update(1 / 60); } finally { Math.random = previous; }
  assert(world.player.hp < 1000, '굴림에 실패하면 맞는다');
  assert(!world.effects.some(effect => effect.kind === 'evade'));
});

test('체력회복력은 5초마다 최대 체력의 N%를 회복한다', () => {
  const save = heroSave({ regenPct: 2 });
  const world = new World(save);
  world.spawnTimer = Infinity;
  world.enemies = []; // 맞지 않게 — 이 테스트는 회복만 본다
  const maxHp = totalStats(save).health, start = Math.floor(maxHp * .5);
  world.player.hp = start;
  for (let index = 0; index < 299; index++) world.update(.016); // 4.78초
  assert.equal(world.player.hp, start, '5초 전에는 차지 않는다');
  for (let index = 0; index < 20; index++) world.update(.016); // 5.1초
  assert.equal(world.player.hp, start + Math.ceil(maxHp * .02), '5초 뒤 2% 회복');
  assert(world.effects.some(effect => effect.kind === 'heal'));
});

test('던전 전투도 같은 World 규칙이라 추가 데미지가 보스 클리어를 앞당긴다', async () => {
  const { runDungeonBattle } = await import('../src/game/dungeon/battle.ts');
  const dungeonSave = extraOptions => {
    const save = freshSave('male', 'warrior');
    save.level = 20; save.tutorial = 3;
    // 던전 몹·보스 공격력 정상화(작업 248) — 5층 보스를 버티려면 실제 플레이어처럼 방어구가 있어야 한다.
    // (이 테스트는 생존이 아니라 추가 데미지가 클리어를 앞당기는지만 본다.)
    // 밸런스 v2로 던전 5층 보스 HP가 6,720(몹 224 × 30)이 되어, 장비를 낮춰 여러 대를 때리게 한다.
    save.equipment = {
      weapon: { id: `dungeon-${JSON.stringify(extraOptions)}`, name: '비전의 룬 블레이드', slot: 'weapon', rarity: 'epic', stats: { attack: 60 }, plus: 0, extraOptions },
      armor: { id: `dungeon-armor-${JSON.stringify(extraOptions)}`, name: '시험 갑옷', slot: 'armor', rarity: 'rare', stats: { defense: 400, health: 2000 }, plus: 0 },
      helmet: { id: `dungeon-helmet-${JSON.stringify(extraOptions)}`, name: '시험 투구', slot: 'helmet', rarity: 'rare', stats: { defense: 100, health: 500 }, plus: 0 }
    };
    save.health = totalStats(save).health;
    return save;
  };
  for (const seed of [11, 22]) {
    const plain = runDungeonBattle(dungeonSave({ defensePct: 1 }), 5, seed);
    const buffed = runDungeonBattle(dungeonSave({ bonusDmgPct: 3 }), 5, seed);
    assert.equal(plain.outcome, 'clear');
    assert.equal(buffed.outcome, 'clear');
    assert(buffed.elapsed < plain.elapsed, `5층 보스 ${seed}: ${buffed.elapsed} < ${plain.elapsed}`);
  }});

test('월드보스 연습도 같은 세이브·같은 순서면 같은 피해를 낸다(회피 굴림 고정)', async () => {
  const { WorldBossRehearsal } = await import('../src/game/worldBossRehearsal.ts');
  const save = heroSave({ evasionPct: 3, bonusDmgPct: 2 }, 'unique');
  const twice = [0, 1].map(() => {
    const battle = new WorldBossRehearsal(save);
    for (let index = 0; index < 200; index++) battle.advance(.05);
    return { damage: battle.damage, defeated: battle.defeated, evaded: battle.evaded };
  });
  assert.deepEqual(twice[0], twice[1]);
});

// ── 5. 서버 검증·정규화 ─────────────────────────────────────────────────────
test('save-guard는 규칙에 맞는 추가옵션만 통과시킨다', () => {
  const epic = { id: 'guard-epic', name: '비전의 두손검', slot: 'weapon', rarity: 'epic', stats: { attack: 10 }, extraOptions: deriveExtraOptions('epic', 'guard-epic') };
  assert(itemWithinBounds(epic, 5));
  const missing = { ...epic }; delete missing.extraOptions;
  assert(itemWithinBounds(missing, 5), '옛 장비(옵션 없음)도 통과한다');
  assert(!itemWithinBounds({ ...epic, extraOptions: { attackPct: 4 } }, 5), '값 범위 밖');
  assert(!itemWithinBounds({ ...epic, extraOptions: { attackPct: 2, speedPct: 2 } }, 5), '등급보다 많은 개수');
  assert(!itemWithinBounds({ ...epic, extraOptions: { attack: 2 } }, 5), '허용되지 않는 키');
  assert(!itemWithinBounds({ ...epic, rarity: 'rare' }, 5), '레어에 옵션이 붙으면 거부');
  const legendary = { id: 'guard-legend', name: '영원의 두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 10 }, extraOptions: deriveExtraOptions('legendary', 'guard-legend') };
  assert(itemWithinBounds(legendary, 5));
  assert(serverExtra.extraOptionsWithin(legendary));
  assert(!serverExtra.extraOptionsWithin({ ...legendary, extraOptions: { attackPct: 3 } }), '전설은 3개여야 한다');
});

const serverModule = fileURLToPath(new URL('../server/database.mjs', import.meta.url));
test('서버는 저장·거래로 들어온 추가옵션을 id 기준으로 다시 계산해 덮어쓴다(조작 불가)', async t => {
  if (!existsSync(serverModule)) { t.skip('server/** 가 sparse 체크아웃 밖이라 건너뛴다(전체 체크아웃·CI에서 실행)'); return; }
  const { createClient } = await import('@libsql/client');
  const { schema, account, transaction, reconcileItems } = await import('../server/database.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-extra-options-'));
  const url = `file:${join(directory, 'extra.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-extra-options-test';
  const db = createClient({ url });
  const save = freshSave();
  save.floor = 20; save.maxFloor = 20;
  const forged = { id: 'forged-epic', name: '비전의 두손검', slot: 'weapon', rarity: 'epic', stats: { attack: 10 }, extraOptions: { attackPct: 3 } };
  save.bag = [forged];
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(save), new Date().toISOString()] });
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
    const owner = (await db.execute({ sql: 'SELECT item_json FROM djrpg_item_owners WHERE item_id=?', args: ['forged-epic'] })).rows[0];
    assert.deepEqual(JSON.parse(owner.item_json).extraOptions, deriveExtraOptions('epic', 'forged-epic'), '서버가 다시 계산한 값으로 저장');
    // 클라이언트처럼 정규화한 세이브는 409 없이 통과한다.
    const client = parseSave((await transaction(db, async tx => (await account(tx, 'hero')).save)), 'hero');
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, client); });
    // 범위 밖 값을 보내도 저장되는 값은 서버가 계산한 값이다 — 조작이 남지 않는다.
    const tampered = structuredClone(client);
    tampered.bag.push({ id: 'tampered-legend', name: '영원의 두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 10 }, extraOptions: { attackPct: 9, speedPct: 9, critPct: 9 } });
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, tampered); });
    const forgedRow = (await db.execute({ sql: 'SELECT item_json FROM djrpg_item_owners WHERE item_id=?', args: ['tampered-legend'] })).rows[0];
    assert.deepEqual(JSON.parse(forgedRow.item_json).extraOptions, deriveExtraOptions('legendary', 'tampered-legend'));
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

// ── 6. 화면 ──────────────────────────────────────────────────────────────────
function node(tag = 'div') {
  return { tag, children: [], className: '', textContent: '', attrs: {}, dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener() {}, remove() {},
    classList: { add() {}, toggle() {} } };
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => node(tag), createTextNode: text => ({ textContent: text, children: [] }), body: node('body') };
  try { return work(); } finally { globalThis.document = previous; }
}
const allText = root => [root.textContent, ...(root.children ?? []).map(allText)].filter(Boolean).join(' ');
const css = modalStyles();

test('장비 상세는 추가옵션을 `✨ 이름 +N%` 한 줄씩 보여 준다', async () => {
  const { itemDetail } = await import('../src/ui/modals/equipModal.ts');
  const upItem = equipment('ui-legend', 'weapon', 'legendary', { attack: 120 }, { attackPct: 3, evasionPct: 3, lifestealPct: 3 });
  withDocument(() => {
    const ui = { world: { save: freshSave(), onChange() {} }, message() {} };
    const detail = itemDetail.call(ui, ui.world.save, upItem);
    const text = allText(detail);
    for (const line of extraOptionLines(upItem)) assert(text.includes(line), `${line} 표시`);
    assert.equal(extraOptionLines(upItem).length, 3);
    assert(text.includes('✨ 공격력 +3%'));
    const plain = equipment('ui-common', 'weapon', 'common', { attack: 4 });
    assert(!allText(itemDetail.call(ui, ui.world.save, plain)).includes('✨'), '일반 장비에는 줄이 없다');
  });
  assert.match(css, /\.item-detail \.item-extra \{[^}]*color: #d9c2ff/, '추가옵션 줄 색');
});
