import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { claimDungeonRewards, dungeonKillGold, dungeonClearStones, dungeonFirstClearStones, DUNGEON_STONES_PER_FLOOR, DUNGEON_FIRST_CLEAR_STONES } = await import('../src/game/dungeonRewards.ts');
const { dungeonRewardMarkup, dungeonPrizePanel } = await import('../src/ui/dungeonRewardMarkup.ts');

const equipment = (id, slot, rarity = 'common', stats = {}) => ({ id, name: `시험 장비 ${id}`, slot, rarity, stats });
const book = (id, skillId) => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });
const fillBag = (save, count) => { for (let index = 0; index < count; index++) save.bag.push(equipment(`bag-${index}`, 'helmet', 'common', { defense: 1 })); };

test('the floor pays what its kills were worth, and the stones climb with the floor', () => {
  // 일반 층은 7마리 × (3 + 층), 보스 층은 70 × 층 (던전 드롭 규칙 그대로).
  assert.equal(dungeonKillGold(1), 7 * 4);
  assert.equal(dungeonKillGold(4), 7 * 7);
  assert.equal(dungeonKillGold(5), 70 * 5);
  assert.equal(dungeonKillGold(10), 70 * 10);
  // 강화석: 층 비례분 + 최초 클리어 보너스.
  assert.equal(dungeonFirstClearStones(1), DUNGEON_FIRST_CLEAR_STONES + 1 * 3);
  assert.equal(dungeonClearStones(1), 1 * DUNGEON_STONES_PER_FLOOR + dungeonFirstClearStones(1));
  assert.equal(dungeonClearStones(10), 10 * DUNGEON_STONES_PER_FLOOR + dungeonFirstClearStones(10));
  assert.equal(dungeonClearStones(1, false), 1 * DUNGEON_STONES_PER_FLOOR);
  assert(dungeonClearStones(10) > dungeonClearStones(1));
});

test('a clear really moves the gold, the stones and the dropped items into the account save', () => {
  const save = freshSave();
  save.gold = 500; save.stones = 3;
  const dropped = [equipment('drop-1', 'helmet', 'rare', { defense: 12 }), book('drop-2', 'fireBolt')];
  const receipt = claimDungeonRewards(save, 1, { gold: dungeonKillGold(1), items: dropped });
  assert.equal(receipt.gold, 28);
  assert.equal(save.gold, 528);
  assert.equal(receipt.stones, dungeonClearStones(1));
  assert.equal(save.stones, 3 + dungeonClearStones(1));
  assert.equal(receipt.firstClear, true);
  assert.equal(receipt.missed, 0);
  // 떨어진 그 아이템이 가방에 그대로 들어간다(새로 만들지 않는다).
  assert.deepEqual(save.bag, dropped);
  assert.equal(receipt.items.length, 2);
});

test('only the first clear adds the bonus, and the save floor is the evidence', () => {
  const save = freshSave();
  save.dungeonFloor = 3;
  // 3층까지 깬 세이브에서 4층을 깨면 최초 클리어다.
  const first = claimDungeonRewards(save, 4, { gold: 0, items: [] });
  assert.equal(first.firstClear, true);
  assert.equal(first.stones, dungeonClearStones(4, true));
  // 이미 깬 3층을 다시 돈 것으로 계산하면 보너스가 없다(구조상 로비가 열어 주지 않는 경로).
  const again = claimDungeonRewards(save, 3, { gold: 0, items: [] }, { firstClear: false });
  assert.equal(again.firstClear, false);
  assert.equal(again.stones, 3 * DUNGEON_STONES_PER_FLOOR);
});

test('a full bag keeps nothing — skill books take a slot too and everything is reported as missed (작업 248)', () => {
  const save = freshSave();
  fillBag(save, 40);
  const receipt = claimDungeonRewards(save, 2, { gold: 0, items: [equipment('extra', 'boots'), book('extra-book', 'spin'), equipment('extra-2', 'ring1')] });
  assert.equal(receipt.missed, 3);
  assert.equal(receipt.items.length, 0);
  assert.equal(save.bag.length, 40, '가방은 40칸을 넘지 않는다');
  // 39칸이면 스킬북이 40번째 칸으로 들어간다.
  const room = freshSave();
  fillBag(room, 39);
  const kept = claimDungeonRewards(room, 2, { gold: 0, items: [book('room-book', 'spin')] });
  assert.equal(kept.missed, 0);
  assert.equal(room.bag.length, 40);
  assert.equal(room.bag.at(-1).id, 'room-book');
});

test('live auto-salvage takes a weak drop the way the field does, and it never reaches the bag', () => {
  const save = freshSave();
  save.equipment.weapon = equipment('worn', 'weapon', 'epic', { attack: 400 });
  const bagBefore = save.bag.length, stonesBefore = save.stones;
  const receipt = claimDungeonRewards(save, 1, { gold: 0, items: [equipment('weak', 'weapon', 'common', { attack: 3 }), book('keep-book', 'slash2')] },
    { autoSalvage: 'legendary', autoSalvagePlus: 4 });
  assert.equal(receipt.salvaged.count, 1);
  assert.equal(receipt.salvaged.gold, 3);
  assert.equal(receipt.salvaged.stones, 1);
  assert.equal(save.gold, 3);
  assert.equal(save.stones, stonesBefore + dungeonClearStones(1) + 1);
  // 스킬북은 자동 분해 대상이 아니므로 가방에 들어간다.
  assert.equal(save.bag.length, bagBefore + 1);
  assert.equal(save.bag[0].id, 'keep-book');
  // 스위치가 꺼져 있으면(옵션 없음) 같은 장비도 가방으로 간다.
  const kept = freshSave();
  kept.equipment.weapon = equipment('worn', 'weapon', 'epic', { attack: 400 });
  const keptReceipt = claimDungeonRewards(kept, 1, { gold: 0, items: [equipment('weak-2', 'weapon', 'common', { attack: 3 })] });
  assert.equal(keptReceipt.salvaged.count, 0);
  assert.equal(kept.bag.length, 1);
});

test('the result screen reports the gold, stones, items and what was missed', () => {
  const receipt = { floor: 3, firstClear: true, gold: 1200, stones: 19, items: [equipment('a', 'helmet', 'rare'), book('b', 'arrowRain')], missed: 1, salvaged: { count: 2, gold: 6, stones: 2 } };
  const html = dungeonRewardMarkup(receipt);
  assert.match(html, /획득 금화 <strong>1,200<\/strong>/);
  assert.match(html, /강화석 <strong>\+19<\/strong>/);
  assert.match(html, /최초 클리어 보너스 포함/);
  assert.match(html, /시험 장비 a/);
  assert.match(html, /arrowRain/);
  assert.match(html, /자동 분해 2개 → 금화 6 · 강화석 2/);
  assert.match(html, /가방이 가득 차 아이템 1개를 놓쳤습니다/);
  // 아이템이 없으면 그 사실을 적고, 놓침·분해가 없으면 그 줄은 없다.
  const empty = dungeonRewardMarkup({ floor: 1, firstClear: false, gold: 28, stones: 2, items: [], missed: 0, salvaged: { count: 0, gold: 0, stones: 0 } });
  assert.doesNotMatch(empty, /최초 클리어 보너스 포함/);
  assert.match(empty, /떨어진 아이템은 없습니다/);
  assert.doesNotMatch(empty, /자동 분해|놓쳤습니다/);
});

test('the lobby shows the real prize instead of "보상 수량은 전투 연결 시 확정됩니다"', () => {
  const normal = dungeonPrizePanel(1, false), boss = dungeonPrizePanel(10, true);
  assert.doesNotMatch(normal, /확정됩니다/);
  assert.match(normal, new RegExp(`<span>${dungeonKillGold(1)}</span>`));
  assert.match(normal, new RegExp(`<span>${dungeonClearStones(1, true)}</span>`));
  assert.match(normal, /처치마다 15% 확률로 장비·스킬북/);
  // 보스 층은 5개 랜덤템·10무더기와 층 비례 금화·강화석을 보여 준다.
  assert.match(boss, new RegExp(`<span>${70 * 10}</span>`));
  assert.match(boss, new RegExp(`<span>${dungeonClearStones(10, true)}</span>`));
  assert.match(boss, /랜덤 장비·스킬북 5개와 금화 10무더기/);
  assert.match(boss, /실패·시간 초과에는 지급되지 않습니다/);
});

test('the battlefield pays the rewards once, only on a clear, and saves the account', () => {
  const source = readFileSync(new URL('../src/ui/dungeonField.ts', import.meta.url), 'utf8');
  // 보상 지급은 clear 분기 안에서 한 번, `clearRewards()`(실패·시간 초과는 undefined)를 거쳐 일어난다.
  assert.match(source, /if\(battle\.outcome==='clear'\)\{/);
  assert.match(source, /const save=ui\.world\.save,rewards=battle\.clearRewards\(\)/);
  assert.match(source, /claimDungeonRewards\(save,floor,rewards,\{firstClear:floor>dungeonClearedFloor\(save\)/);
  // 클리어는 세이브에 적고(변했을 때만 저장), HUD·가방 배지는 항상 다시 그린다.
  assert.match(source, /if\(ui\.dungeon\.clear\(save,floor\)\)ui\.onSave\(\);/);
  assert.match(source, /ui\.renderStatus\(\);ui\.renderBagBadge\(\)/);
  assert.match(source, /autoSalvage:ui\.autoSalvage\?ui\.salvageRarity:undefined,autoSalvagePlus:ui\.salvagePlus/);
  // 결과창은 실제 영수증을 그린다.
  assert.match(source, /dungeonRewardMarkup\(receipt\)/);
  // 미리보기 시절의 임시 문구는 남지 않는다.
  assert.doesNotMatch(source, /보상은 준비 중|드롭 50% 테스트|미리보기/);
  const modal = readFileSync(new URL('../src/ui/modals/dungeonModal.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(modal, /보상 수량은 전투 연결 시 확정됩니다/);
  assert.match(modal, /dungeonPrizePanel\(floor\.floor, floor\.boss\)/);
});
