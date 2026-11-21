/**
 * 밸런스·UI 개편 패치 보상(2026-11-22) — 꾸러미 5개 우편 + 종일 공·방·체 +30% 버프.
 *
 * 사용자 요청(2026-11-21 23:38 KST): "밸런스패치보상 주자 꾸러미5개랑 일일 버프 공 방 체 30퍼 종일 버프".
 *
 * ① 우편: `server/journey-state.mjs` `grantPatchReward` — 계정당 한 번, 무작위 보물 주머니 5개,
 *    지급은 2026-11-22 02:00 KST ~ 2026-11-23 05:00 KST, 수령 만료는 지급일부터 7일.
 * ② 버프: `src/game/patchBuff.ts` — 같은 구간에 공격력·방어력·최대 체력 ×1.3, 끝나면 1.0.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import './ts-loader.mjs';

const buff = await import('../src/game/patchBuff.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { CombatEngine } = await import('../src/game/combat/engine.ts');
const { schema, account } = await import('../server/database.mjs');
const { snapshot, mutate } = await import('../server/journey.mjs');
const { clampSaveProgress } = await import('../server/save-guard.mjs');
const {
  PATCH_REWARD_ID, PATCH_REWARD_FROM, PATCH_REWARD_UNTIL, PATCH_REWARD_POUCHES, PATCH_REWARD_DAYS,
  advanceJourney, grantPatchReward
} = await import('../server/journey-state.mjs');

const DAY = 86_400_000;
const START = buff.PATCH_BUFF_START, END = buff.PATCH_BUFF_END;
const save = (bag = []) => ({ version: 1, name: '전사', gender: 'male', job: 'warrior', gold: 0, bag, equipment: {}, equipmentCollection: [], kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, learned: [], passives: [], skillLevels: {} });
const gear = () => ({ id: randomUUID(), name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });

test('종일 버프 구간은 2026-11-22 02:00 KST부터 2026-11-23 05:00 KST까지다', () => {
  assert.equal(new Date(START).toISOString(), '2026-11-21T17:00:00.000Z', '2026-11-22 02:00 KST');
  assert.equal(new Date(END).toISOString(), '2026-11-22T20:00:00.000Z', '2026-11-23 05:00 KST(일일 초기화)');
  assert.equal(buff.PATCH_BUFF_PERCENT, 30);
  assert.equal(buff.PATCH_BUFF_SCALE, 1.3);
  assert.equal(buff.isPatchBuffActive(START - 1), false, '배포 전에는 꺼져 있다');
  assert.equal(buff.isPatchBuffActive(START), true, '시작 시각 포함');
  assert.equal(buff.isPatchBuffActive(START + DAY), true, '하루 종일 유지');
  assert.equal(buff.isPatchBuffActive(END - 1), true, '종료 1ms 전까지');
  assert.equal(buff.isPatchBuffActive(END), false, '종료 시각부터 꺼진다');
  assert.equal(buff.patchBuffScale(START), 1.3);
  assert.equal(buff.patchBuffScale(END), 1, '끝나면 배율이 깨끗하게 1.0');
  assert.equal(buff.patchBuffRemainingMs(END), 0);
  assert.equal(buff.patchBuffRemainingMs(START), 27 * 3_600_000);
  assert.equal(buff.patchBuffRemainingText(START + 60_000), '26시간 59분');
  assert.equal(buff.patchBuffRemainingText(END - 20_000), '1분');
});

test('버프는 공격력·방어력·최대 체력만 30% 올리고 치명타·공속은 건드리지 않는다', () => {
  const base = { attack: 101, defense: 37, health: 251, crit: 12, speed: 6 };
  const buffed = buff.applyPatchBuff({ ...base }, START);
  assert.equal(buffed.attack, 132, '101 × 1.3 = 131.3 → 올림 132');
  assert.equal(buffed.defense, 49, '37 × 1.3 = 48.1 → 49');
  assert.equal(buffed.health, 327, '251 × 1.3 = 326.3 → 327');
  assert.equal(buffed.crit, base.crit, '치명타는 그대로');
  assert.equal(buffed.speed, base.speed, '공속은 그대로');
  assert.deepEqual(buff.applyPatchBuff({ ...base }, END), base, '기간이 끝나면 한 값도 바뀌지 않는다');
});

test('기간 안에서만 totalStats가 +30%를 곱한다 — 화면·전투·던전·방치가 함께 쓰는 한 곳', () => {
  const hero = freshSave('male', 'warrior');
  hero.level = 10;
  const plain = totalStats(hero, START - 1);
  const during = totalStats(hero, START + 1000);
  assert.equal(during.attack, Math.ceil(plain.attack * 1.3));
  assert.equal(during.defense, Math.ceil(plain.defense * 1.3));
  assert.equal(during.health, Math.ceil(plain.health * 1.3));
  assert.equal(during.crit, plain.crit);
  assert.equal(during.speed, plain.speed);
  assert.deepEqual(totalStats(hero, END), plain, '종료 뒤에는 버프 전 값 그대로');
  // 시계를 고정하면(스냅샷 테스트가 쓰는 방식) 같은 시각에 항상 같은 값이다.
  buff.setPatchBuffClock(() => START + 1000);
  try {
    assert.deepEqual(totalStats(hero), during);
    buff.setPatchBuffClock(() => END);
    assert.deepEqual(totalStats(hero), plain);
  } finally { buff.setPatchBuffClock(); }
  // 시계를 되돌리면 **실제 시각**을 다시 쓴다 — 배포일 당일에는 그 시각이 구간 안이라 값이 1.3배다.
  const realNow = Date.now();
  assert.deepEqual(totalStats(hero), totalStats(hero, realNow), '시계를 되돌리면 다시 실제 시각을 쓴다');
});

test('버프로 늘어난 체력은 저장 검증(안티치트)과 부딪히지 않는다', () => {
  const hero = freshSave('male', 'warrior');
  hero.level = 10;
  const maxHp = totalStats(hero, START).health;
  const previous = { ...hero, health: maxHp };
  const incoming = { ...hero, health: maxHp };
  const result = clampSaveProgress(previous, incoming, { elapsedSeconds: 0 });
  assert.deepEqual(result.clamped, [], '버프 최대 체력은 클램프 대상이 아니다');
  assert.equal(incoming.health, maxHp);
  // 실제로 어떤 필드도 잘리지 않는지 — 30% 늘어난 체력이 그대로 저장된다.
  for (const field of ['gold', 'kills', 'exp', 'level', 'health', 'floor', 'maxFloor', 'stones']) {
    assert.equal(incoming[field], previous[field], `${field} 불변`);
  }
});

test('사냥 도중 버프가 끝나면 그 프레임에 체력이 새 최대치로 잘린다', () => {
  const hero = freshSave('male', 'warrior');
  hero.tutorial = 3;
  buff.setPatchBuffClock(() => START + 1000);
  try {
    const engine = new CombatEngine(hero);
    const buffedMax = totalStats(hero).health;
    // 밸런스 v2의 Lv.1 기본 체력은 140(#307) — 그 1.3배가 버프 중 최대 체력이다.
    assert.equal(buffedMax, 182, 'Lv.1 체력 140 × 1.3');
    engine.player.hp = buffedMax;
    buff.setPatchBuffClock(() => END);
    engine.update(.016);
    assert.equal(totalStats(hero).health, 140, '끝난 뒤 최대 체력은 원래 값');
    assert.equal(engine.player.hp, 140, '넘치던 체력이 그 프레임에 새 상한으로 잘린다');
  } finally { buff.setPatchBuffClock(); }
});

test('HUD 알약은 켜진 동안만 뜨고 문구·남은 시간이 들어간다', () => {
  assert.equal(buff.patchBuffPillMarkup(START - 1), '', '꺼져 있으면 요소를 만들지 않는다');
  assert.equal(buff.patchBuffPillMarkup(END), '');
  const markup = buff.patchBuffPillMarkup(START + 60_000);
  assert.match(markup, /class="patch-buff-pill"/);
  assert.match(markup, /🔥 패치 버프 공·방·체 \+30%/, '사용자가 정한 문구 그대로');
  assert.match(markup, /26시간 59분/, '남은 시간이 알약 안에 있다');
  assert.match(markup, /title="🔥 패치 버프 공·방·체 \+30% · 26시간 59분 남음"/, '툴팁에 남은 시간');
  assert.match(markup, /role="status"/);
  const summary = buff.patchBuffSummaryMarkup(START + 60_000);
  assert.match(summary, /equipment-info-buff/);
  assert.match(summary, /패치 버프 공·방·체 \+30%/);
  assert.equal(buff.patchBuffSummaryMarkup(END), '', '장비창 한 줄도 기간이 끝나면 사라진다');
});

test('기념 보상 우편은 계정당 한 번, 보물 주머니 5개이고 지급일부터 7일 뒤 만료다', () => {
  assert.equal(PATCH_REWARD_ID, 'patch-balance-v2-20261122');
  assert.equal(PATCH_REWARD_POUCHES, 5);
  assert.equal(new Date(PATCH_REWARD_FROM).toISOString(), new Date(START).toISOString(), '지급 시작 = 버프 시작');
  assert.equal(new Date(PATCH_REWARD_UNTIL).toISOString(), new Date(END).toISOString(), '지급 마감 = 버프 종료');
  const now = START + 60_000;
  const state = { achievements: [], mail: [] };
  assert.equal(grantPatchReward(state, now), true);
  const mail = state.mail.find(entry => entry.id === PATCH_REWARD_ID);
  assert(mail, '한 통 지급된다');
  assert.equal(mail.title, '밸런스·UI 개편 감사 보상');
  assert.equal(mail.sender, '운영팀');
  assert.equal(mail.body, '대규모 밸런스·UI 개편을 기념해 보물 주머니 5개와 오늘 종일 공·방·체 +30% 버프를 드립니다!');
  assert.equal(mail.gold, 0); assert.equal(mail.books, 0); assert.equal(mail.pouches, 5);
  assert.equal(mail.expiresAt, now + PATCH_REWARD_DAYS * DAY);
  assert.equal(mail.expiresAt - now, 7 * DAY, '지급일부터 7일');
  assert.equal(mail.claimedAt, null); assert.equal(mail.read, false);
  assert.equal(grantPatchReward(state, now + 1000), false, '두 번 붙지 않는다');
  assert.equal(grantPatchReward({ achievements: [], mail: [] }, PATCH_REWARD_FROM - 1), false, '배포 전 계정에는 붙지 않는다');
  assert.equal(grantPatchReward({ achievements: [], mail: [] }, PATCH_REWARD_UNTIL), false, '종료 뒤 새로 온 계정에도 붙지 않는다');
});

test('advanceJourney가 그 구간에 접속한 계정에 우편을 붙이고, 지운 뒤에도 다시 붙이지 않는다', () => {
  const now = START + 60_000;
  const first = advanceJourney(undefined, save(), save(), now);
  assert.equal(first.mail.filter(entry => entry.id === PATCH_REWARD_ID).length, 1);
  assert(first.notices.includes(PATCH_REWARD_ID), '지급 이력을 남긴다');
  const again = advanceJourney(first, save(), save(), now + 1000);
  assert.equal(again.mail.filter(entry => entry.id === PATCH_REWARD_ID).length, 1);
  const cleaned = advanceJourney({ ...first, mail: first.mail.filter(entry => entry.id !== PATCH_REWARD_ID) }, save(), save(), now + 2000);
  assert.equal(cleaned.mail.filter(entry => entry.id === PATCH_REWARD_ID).length, 0, '수령해 지운 계정에 다시 붙지 않는다');
  const before = advanceJourney(undefined, save(), save(), PATCH_REWARD_FROM - 1);
  assert.equal(before.mail.filter(entry => entry.id === PATCH_REWARD_ID).length, 0, '배포 전에는 붙지 않는다');
  const afterWindow = advanceJourney(undefined, save(), save(), PATCH_REWARD_UNTIL);
  assert.equal(afterWindow.mail.filter(entry => entry.id === PATCH_REWARD_ID).length, 0, '구간이 지나면 붙지 않는다');
});

// ── 실제 수령 경로(서버 여정 API) ────────────────────────────────────────────────
let db, directory;
const claim = async (id, mailId) => { const row = await account(db, id); return mutate(db, id, { action: 'journey-claim', kind: 'mail', id: mailId, revision: row.revision, requestId: randomUUID() }); };
/** 계정을 만들고 그 계정의 여정 상태에 기념 우편을 **직접** 넣는다(지급 시각과 무관하게 수령만 시험한다). */
async function seedPatchMail(id, bag = []) {
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 'test-password-hash', JSON.stringify(save(bag)), new Date().toISOString()] });
  await snapshot(db, id);
  const row = (await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] })).rows[0];
  const state = JSON.parse(row.state_json), now = Date.now();
  // 실제 지급 기간(2026-11-22)에 이 테스트가 돌면 `snapshot`이 이미 한 통 붙여 두었을 수 있다 —
  // 같은 ID가 둘이 되지 않게 지우고 다시 넣는다(수령은 언제나 한 통이다).
  state.notices = state.notices.filter(notice => notice !== PATCH_REWARD_ID); state.notices.push(PATCH_REWARD_ID);
  state.mail = state.mail.filter(entry => entry.id !== PATCH_REWARD_ID);
  state.mail.push({ id: PATCH_REWARD_ID, title: '밸런스·UI 개편 감사 보상', sender: '운영팀', body: '대규모 밸런스·UI 개편을 기념해 보물 주머니 5개와 오늘 종일 공·방·체 +30% 버프를 드립니다!', createdAt: now, expiresAt: now + 7 * DAY, gold: 0, books: 0, pouches: 5, claimedAt: null, read: false });
  await db.execute({ sql: 'UPDATE djrpg_journey SET state_json=? WHERE account_id=?', args: [JSON.stringify(state), id] });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-patch-gift-'));
  db = createClient({ url: `file:${join(directory, 'gift.db')}` });
  await schema(db);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

test('우편을 받으면 보물 주머니 5개가 가방에 들어가고 두 번 받을 수 없다', async () => {
  await seedPatchMail('gift');
  const result = await claim('gift', PATCH_REWARD_ID);
  assert.equal(result.message, '1개 보상을 수령했습니다.');
  const row = await account(db, 'gift');
  const pouches = row.save.bag.filter(item => item.slot === 'pouch');
  assert.equal(pouches.length, 5, '보물 주머니 정확히 5개');
  assert(pouches.every(item => item.name === '무작위 보물 주머니' && item.kind === 'pouch'));
  assert.equal(row.save.gold, 0, '금화는 주지 않는다');
  assert.equal(row.save.bag.filter(item => item.slot === 'skillbook').length, 0, '스킬북은 주지 않는다');
  const owners = await db.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_item_owners WHERE account_id='gift' AND location='inventory'", args: [] });
  assert.equal(Number(owners.rows[0].n), 5, '주머니 5개가 소유 기록에 들어간다');
  await assert.rejects(claim('gift', PATCH_REWARD_ID), error => error.code === 'NOT_AVAILABLE', '같은 우편을 두 번 받을 수 없다');
  assert.equal((await account(db, 'gift')).save.bag.filter(item => item.slot === 'pouch').length, 5, '재시도로 늘지 않는다');
});

test('가방 36칸이면 기념 우편은 409 BAG_FULL로 막히고 미수령으로 남는다', async () => {
  await seedPatchMail('gift-full', Array.from({ length: 36 }, gear));
  await assert.rejects(claim('gift-full', PATCH_REWARD_ID), error => error.code === 'BAG_FULL');
  const row = await account(db, 'gift-full');
  assert.equal(row.save.bag.length, 36, '가방은 그대로');
  const state = JSON.parse((await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: ['gift-full'] })).rows[0].state_json);
  assert.equal(state.mail.find(entry => entry.id === PATCH_REWARD_ID).claimedAt, null, '미수령으로 남는다');
});

test('가방 35칸(남은 5칸)이면 기념 우편이 정확히 40칸을 채운다', async () => {
  await seedPatchMail('gift-edge', Array.from({ length: 35 }, gear));
  await claim('gift-edge', PATCH_REWARD_ID);
  const row = await account(db, 'gift-edge');
  assert.equal(row.save.bag.length, 40, '35 + 주머니 5 = 40칸');
  assert.equal(row.save.bag.filter(item => item.slot === 'pouch').length, 5);
});
