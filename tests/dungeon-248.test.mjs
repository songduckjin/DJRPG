import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// 작업 248 — 던전 몹·보스 공격력 정상화, 전 층 고정 드롭(아이템 드롭 B안으로 0.5%), 보스 확정 1개, 10층 구간 등급 확률, 결과창 정리.
const items = await import('../src/game/items.ts');
const world = await import('../src/game/world.ts');
const bossLoot = await import('../src/game/bossLoot.ts');
const battle = await import('../src/game/dungeon/battle.ts');
const markup = await import('../src/ui/dungeonRewardMarkup.ts');
const { freshSave } = await import('../src/game/store.ts');
const css = readFileSync(new URL('../src/styles/dungeon.css', import.meta.url), 'utf8');

const gear = id => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 9 } });
/** 영구 스탯북(파트 B) — 스킬북 자리를 이어받은 1칸짜리 소모품. 같은 `book` 종류가 한 줄로 묶인다. */
const book = (id, kind = 'attack') => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind], slot: 'statbook', kind: 'statbook', book: kind, rarity: 'unique', stats: {} });

test('던전 적 피해는 필드 2×층 공격력을 쓴다 — 군집 배율 없이 한 마리씩(밸런스 v2)', () => {
  // 밸런스 v2: 던전 몹 HP가 필드 `2 × 층` 곡선이므로 적 피해도 `enemyHitDamage(2 × 층)`이다.
  // 던전은 0.9초에 한 마리만 때리므로 군집 배율(×0.55)을 쓰지 않는다(`swarmed=false`).
  // 10층 1타가 44(방어 400)·56(방어 200)이라 현재의 1에서 "한 번의 실수가 곰 실패"로 바뀐다.
  assert.equal(battle.dungeonHitDamage(10, false, 400), 44);
  assert.equal(battle.dungeonHitDamage(10, false, 200), 56);
  assert.equal(battle.dungeonHitDamage(3, false, 400), 10);
  for (let floor = 1; floor <= 10; floor++) {
    assert.equal(battle.dungeonHitDamage(floor, false, 0), world.enemyHitDamage(floor * 2, false, 0, false), `${floor}층은 필드 ${floor * 2}층`);
  }
  assert.equal(battle.dungeonHitDamage(5, true, 400), world.enemyHitDamage(10, true, 400, false), '보스도 같은 층 기준');
  assert.equal(battle.dungeonHitDamage(1, false, 0, true), world.enemyHitDamage(2, false, 0, false) * 2, '정예는 2배');
  // 10층 밑은 초반 보호가 유지된다(1층 5).
  assert(battle.dungeonHitDamage(1, false, 400) <= 5);
  assert(battle.dungeonHitDamage(10, false, 400) > 100 * .008 * 4, '한 대가 최대 체력의 0.8%를 훌쩍 넘는다');
  // 서버 리플레이는 클라이언트 전투를 그대로 다시 돌린다 — 피해 식이 두 곳에 따로 있으면 안 된다.
  const verify = readFileSync(new URL('../server/dungeon-verify.mjs', import.meta.url), 'utf8');
  assert.match(verify, /from '\.\.\/src\/game\/dungeon\/battle\.ts'/);
  assert.doesNotMatch(verify, /enemyHitDamage/, '서버가 피해 식을 따로 갖고 있지 않다');
});

test('던전 일반 몹 드롭률은 모든 층 0.5% 고정이다(아이템 드롭 B안 2026-11-23)', () => {
  assert.equal(battle.DUNGEON_DROP_CHANCE_BASE, .005);
  assert.equal(battle.DUNGEON_DROP_CHANCE_STEP, 0);
  assert.equal(battle.DUNGEON_DROP_CHANCE_MAX, .005);
  for (let floor = 1; floor <= 10; floor++) assert.equal(battle.dungeonDropChance(floor), .005, `${floor}층`);
});

test('던전 몹 HP는 필드 2×층 곡선이다 — 5~10층은 밸런스 v2에서 함께 내려갔다', () => {
  // 1·2층은 입문 완화가 적용된 필드 2·4층 곡선(43·91)이다 — 3층부터 종전 그대로다.
  assert.deepEqual([...battle.DUNGEON_MOB_HP], [43, 91, 160, 220, 224, 305, 418, 575, 791, 1083]);
  for (let floor = 1; floor <= 10; floor++) assert.equal(battle.DUNGEON_MOB_HP[floor - 1], world.enemyMaxHp(floor * 2, false), `${floor}층`);
});

test('던전 보스는 아이템 1개를 확정으로 떨어뜨린다(아이템 드롭 B안 2026-11-23)', () => {
  assert.equal(bossLoot.BOSS_ITEM_DROPS, 1);
  assert.equal(bossLoot.bossItems(5).length, 1);
  assert.equal(bossLoot.bossItems(10).length, 1);
});

test('등급 확률은 10층 구간마다 상위 등급이 두터워진다(작업 248)', () => {
  assert.equal(items.dungeonRarityTier(1), 0);
  assert.equal(items.dungeonRarityTier(10), 0);
  assert.equal(items.dungeonRarityTier(11), 1);
  assert.equal(items.dungeonRarityTier(20), 1);
  assert.equal(items.dungeonRarityTier(21), 2);
  assert.equal(items.dungeonRarityTier(35), 3);
  // 0구간은 지금 던전(10층) 값 그대로 — 전설/유니크가 쏟아지지 않는다.
  assert.deepEqual(items.DUNGEON_RARITY_TIERS[0], { legendary: .0025, rare: .0240, magic: .1500 });
  assert.deepEqual(items.DUNGEON_BOSS_RARITY_TIERS[0], { legendary: .0220, rare: .1490, magic: .5400 });
  // 구간이 깊어질수록 전설·레어·매직 몫이 모두 커지고, 매직 > 레어 > 전설 순서는 유지된다.
  for (const table of [items.DUNGEON_RARITY_TIERS, items.DUNGEON_BOSS_RARITY_TIERS]) {
    for (let index = 1; index < table.length; index++) {
      const prev = table[index - 1], row = table[index];
      assert(row.legendary > prev.legendary, `전설 ${index}`);
      assert(row.rare > prev.rare, `레어 ${index}`);
      assert(row.magic > prev.magic, `매직 ${index}`);
      assert(row.legendary < row.rare && row.rare < row.magic, `순서 ${index}`);
    }
  }
  // 같은 난수라도 깊은 층이 더 높은 등급을 준다.
  const rarityAt = (floor, draw, boss = false) => items.dungeonRarityFor(floor, boss, () => draw);
  assert.equal(rarityAt(1, .003), 'unique', '1층 0.3%는 구간 0의 전설(0.25%) 아래 → 유니크');
  assert.equal(rarityAt(21, .003), 'legendary', '21층 0.3%는 구간 2의 전설(1.1%) 안');
  assert.equal(rarityAt(1, .02), 'rare');
  assert.equal(rarityAt(21, .02), 'unique', '같은 2%가 깊은 층에서는 유니크');
  assert.equal(rarityAt(1, .03), 'magic');
  assert.equal(rarityAt(21, .03), 'epic', '같은 3%가 깊은 층에서는 에픽');
  assert.equal(rarityAt(1, .2), 'common');
  assert.equal(rarityAt(21, .2), 'magic', '같은 20%가 깊은 층에서는 매직');
  assert.equal(rarityAt(11, .06, true), 'epic', '보스 6%는 11층에서 에픽');
  assert.equal(rarityAt(21, .06, true), 'unique', '보스 6%는 21층에서 유니크');
  // 던전 장비 뽑기는 이 표를 쓴다(필드 `rollItem`과 같은 조립, 등급만 다르다).
  const rolled = items.rollDungeonItem(21, false);
  assert.equal(rolled.slot === 'skillbook', false);
  assert(rolled.id.length > 0);
});

test('결과창은 등급색·등급 이름·장비 먼저/영구 스탯북 묶음을 보여 준다(작업 248 → 파트 B)', () => {
  const receipt = {
    floor: 3, firstClear: false, gold: 100, stones: 10,
    items: [book('b1', 'attack'), gear('w1'), book('b2', 'attack'), { ...gear('w2'), rarity: 'legendary', name: '황혼의 두손검' }, book('b3', 'health')],
    missed: 0, salvaged: { count: 0, gold: 0, stones: 0 }
  };
  const html = markup.dungeonRewardMarkup(receipt);
  // 등급색 클래스(기존 `.rarity-*` CSS) — 장비·스킬북 모두. 유니크·전설 **장비**에는 백로그 3번의
  // 상위 노출 클래스(`is-spotlight`)와 꼬리표가 함께 붙는다(스탯북은 등급이 높아도 빛을 주지 않는다).
  assert.match(html, /class="rarity-legendary is-spotlight"/);
  assert.match(html, /class="rarity-unique"/);
  assert.match(html, /<b class="dungeon-result-spot">\[전설\]<\/b>/);
  // 이름 앞 등급 표기.
  assert.match(html, /<b class="dungeon-result-grade">\[레전드\]<\/b>황혼의 두손검/);
  assert.match(html, /<b class="dungeon-result-grade">\[유니크\]<\/b>/);
  // 장비 먼저, 영구 스탯북은 아래 묶음 — 같은 책은 ×2로 묶는다.
  const order = [...html.matchAll(/<li class="rarity-[a-z]+(?: is-spotlight)?">/g)].length;
  assert.equal(order, 4, '장비 2 + 스탯북 2줄(×2, ×1)');
  const equipmentIndex = html.indexOf('황혼의 두손검'), bookIndex = html.indexOf('공격의 서');
  assert(equipmentIndex >= 0 && bookIndex > equipmentIndex, '장비가 스탯북보다 먼저');
  assert.match(html, /스탯북 ×2/);
  assert.match(html, /스탯북<\/small>/, '한 권짜리 스탯북은 수량 없이');
  assert.doesNotMatch(html, /황혼의 두손검.*공격의 서.*강철 쯔바이핸드/s, '스탯북 뒤에 장비가 다시 오지 않는다');
  // CSS: 여섯 등급 모두 색이 있고, 목록의 기본 색이 등급색을 덮지 않는다.
  for (const rarity of ['common', 'magic', 'rare', 'epic', 'unique', 'legendary']) {
    assert.match(css, new RegExp(`\\.dungeon-result-items li\\.rarity-${rarity}\\{`), `${rarity} 색`);
  }
  assert.match(css, /\.dungeon-result-grade\{/);
  assert.match(markup.dungeonPrizePanel(10, true), /랜덤 장비 1개\(보스 확률로 영구 스탯북\)/);
});

test('보스 확정 1개는 던전 5·10층에서 실제로 하나가 떨어진다(아이템 드롭 B안 2026-11-23)', () => {
  const battleSave = freshSave();
  battleSave.equipment.weapon = gear('weapon');
  const floor = new battle.DungeonBattle(battleSave, 5);
  const boss = floor.world.enemies[0];
  assert(boss.boss);
  floor.world.kill(boss);
  assert.equal(floor.world.loot.filter(entry => entry.kind === 'item').length, 1);
  assert.equal(floor.world.loot.filter(entry => entry.kind === 'gold').length, bossLoot.BOSS_GOLD_PILES);
});
