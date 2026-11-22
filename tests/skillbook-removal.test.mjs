import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import './ts-loader.mjs';

/**
 * 스킬북 전면 폐지 확인 (2026-11-22 파트 B).
 *
 * 스킬북은 **드랍·상점·우편·거래소·도감·분해·합성 어디에서도** 나오지 않아야 하고, 남아 있는 옛 세이브는
 * 읽기에서 조용히 버려야 한다(오류로 계정이 잠기면 안 된다). 이 파일은 그 두 가지를 소스와 동작 양쪽에서 본다.
 */
const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const walk = (dir, files = []) => {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    const stat = statSync(join(root, path));
    if (stat.isDirectory()) { if (name !== 'node_modules' && name !== 'dist') walk(path, files); }
    else if (/\.(ts|mjs)$/.test(name)) files.push(path);
  }
  return files;
};
const sourceFiles = [...walk('src'), ...walk('server'), ...walk('functions'), ...walk('api'), ...walk('scripts')];

test('스킬북을 만드는 코드가 남아 있지 않다 — 드랍·우편·상점·보상 어디에도 없다', () => {
  const offenders = sourceFiles.filter(path => /kind\s*:\s*['"]skillbook['"]/.test(read(path))
    // 읽기에서 버리는 자리(`migrateItem`)와 서버 검증 주석만 남는다.
    && !['src/game/items.ts', 'server/database.mjs'].includes(path));
  assert.deepEqual(offenders, [], `스킬북 아이템을 만드는 코드: ${offenders.join(', ')}`);
  // 확률·드랍 함수도 사라졌다.
  for (const name of ['rollSkillBook', 'rollSkillBookFor', 'rollItemKind', 'skillBookDropChance', 'SKILLBOOK_DROP_SHARE', 'rollRewardSkillBook', 'useSkillBook', 'skillBookStatus', 'hasSkillUpgrade', 'synthesizeSkillBooks']) {
    assert.doesNotMatch(read('src/game/items.ts'), new RegExp(name), `${name} 은 items.ts에 없다`);
  }
  assert.doesNotMatch(read('server/stat-books.mjs'), /rollRewardSkillBook|skillBookIdSet/, '서버도 스킬북을 지급하지 않는다');
  // 스킬북 전용 모듈은 파일 자체가 없다.
  for (const path of ['src/game/skillProgress.ts', 'src/game/skillSynth.ts', 'src/ui/skillBooks.ts', 'src/ui/skillbookBag.ts', 'src/ui/skillBookArt.ts', 'src/ui/modals/synthModal.ts', 'server/skill-ids.mjs', 'scripts/list-consumed-skillbooks.mjs']) {
    assert.equal(existsSync(join(root, path)), false, `${path} 는 삭제됐다`);
  }
  // `server/stat-books.mjs`는 "skill-ids.mjs 삭제"를 주석으로 적는다 — import가 아닌 언급은 뺀다.
  const imports = sourceFiles.filter(path => /from\s+['"][^'"]*(skillProgress|skillSynth|skillBooks|skillbookBag|skillBookArt|synthModal|skill-ids)[^'"]*['"]/.test(read(path)));
  assert.deepEqual(imports, [], `삭제된 모듈을 import하는 파일: ${imports.join(', ')}`);
});

test('보물 주머니·보스·사냥·던전 어느 경로도 스킬북을 뽑지 않는다', () => {
  assert.doesNotMatch(read('src/game/pouch.ts'), /skillbook/, '주머니에 스킬북 분류 없음');
  assert.match(read('src/game/pouch.ts'), /statbook/, '그 자리는 영구 스탯북이다');
  assert.doesNotMatch(read('src/game/bossLoot.ts'), /rollSkillBook|skillBookDropChance/);
  assert.doesNotMatch(read('src/game/world.ts'), /rollSkillBook|rollItemKind/);
  assert.doesNotMatch(read('src/game/offline.ts'), /rollSkillBook|rollItemKind/);
  assert.doesNotMatch(read('src/ui/dungeonBattle.ts'), /rollSkillBook|skillBookDropChance/);
  // 우편 보상은 `pouches`만 아이템으로 넣는다(옛 `books` 값은 무시).
  const journey = read('server/journey.mjs');
  assert.match(journey, /entry\.pouches/);
  assert.doesNotMatch(journey, /rollRewardSkillBook|kind:\s*'skillbook'/);
  // 상점 카탈로그에도 스킬북 상품이 없다.
  const shop = existsSync(join(root, 'server/endpoints/shop.mjs')) ? read('server/endpoints/shop.mjs') : '';
  assert.doesNotMatch(shop, /skillbook/, '상점에 스킬북 상품 없음');
});

test('거래소·가방·도감·분해가 스킬북 대신 영구 스탯북을 다룬다', () => {
  assert.match(read('server/market.mjs'), /'statbook'/, '거래소 등록 슬롯에 statbook');
  assert.doesNotMatch(read('server/market.mjs'), /skillbook/, '거래소에 skillbook 슬롯 없음');
  assert.doesNotMatch(read('src/game/market.ts'), /'skillbook'/, '화면 필터도 statbook');
  assert.match(read('src/game/codex.ts'), /스탯북/, '도감은 스탯북을 대상에서 뺀다');
  assert.match(read('src/game/inventory.ts'), /'statbook'/, '자동 분해가 스탯북을 보호한다');
  assert.match(read('src/game/bagCapacity.ts'), /statbook|Boolean\(item\)/, '가방 칸 규칙이 모든 아이템 1칸');
});

test('옛 스킬북이 든 세이브를 읽어도 오류 없이 게임에 들어간다 — 책만 조용히 사라진다', async () => {
  const { parseSave, freshSave } = await import('../src/game/store.ts');
  const save = { ...freshSave(), level: 12, floor: 6, statBooks: { attack: 3, defense: 1, health: 0 } };
  save.bag = [
    { id: 'gear', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } },
    { id: 'book1', name: '[스킬북] 회오리 베기', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} },
    { id: 'book2', name: '[스킬북] 강인한 육체', slot: 'skillbook', kind: 'skillbook', skillId: 'body', rarity: 'rare', stats: {} }
  ];
  const parsed = parseSave(save);
  assert.equal(parsed.level, 12, '진행은 그대로');
  assert.equal(parsed.floor, 6);
  assert.deepEqual(parsed.statBooks, { attack: 3, defense: 1, health: 0 }, '스탯북 사용 권수도 그대로');
  assert.deepEqual(parsed.bag.map(item => item.id), ['gear'], '죽은 스킬북만 빠진다');
  // 서버 응답(`save`)에 남아 있어도 같은 결과다.
  assert.deepEqual(parseSave({ ...save, bag: [...save.bag] }).bag.map(item => item.id), ['gear']);
});
