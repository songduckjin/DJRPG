// 21~40층 확장「해골 군주의 성」 — 층 상한·테마 표·에셋 규격·화면 배선을 한 파일에서 잠근다.
//
// 기획 확정안(`downloads/djrpg_floor_21_40_plan.md` v2): 20층×1구간 단일 테마, 배경 1장 재활용,
// 구역별 조명만 교체, 층당 처치 목표 현행 공식 유지(40층 2,841), 신규 티어 없음, MAX_LEVEL 30 유지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { MAX_FLOOR, MAX_LEVEL, killsToBoss, afterBossWin, afterFloorClear } = await import('../src/game/progress.ts');
const theme = await import('../src/game/floorTheme.ts');
const F = await import('../src/game/floorPower.ts');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

/** PNG 헤더에서 크기와 색 형식을 읽는다(의존성 없이). */
async function pngInfo(relative) {
  const buffer = await readFile(join(root, relative));
  assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG', `${relative}는 PNG`);
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const colorType = buffer[25]; // 6 = RGBA, 4 = gray+alpha
  return { width, height, alpha: colorType === 6 || colorType === 4, byteLength: buffer.length };
}

test('층 상한은 40 — 곡선·처치 목표·레벨 상한은 그대로 이어진다', () => {
  assert.equal(MAX_FLOOR, 40);
  assert.equal(MAX_LEVEL, 30, 'MAX_LEVEL은 30 유지(기획 확정 6번)');
  assert.equal(killsToBoss(40), 150, '마지막 층은 150 예외(2026-11-25 사망 예산 곡선)');
  assert.equal(killsToBoss(21), 41);
  assert.equal(killsToBoss(41), 72, '상한 밖도 30~40층 기울기로 계속 계산된다');
  // 21~40층 권장 전투력 상한 해제 — clampFloor가 더 이상 20에서 자르지 않는다.
  assert.equal(F.clampFloor(40), 40);
  assert.equal(F.clampFloor(99), 40);
  assert.equal(F.recommendedFloorPower(21), 1556);
  assert.equal(F.recommendedFloorPower(40), 2878);
  assert.ok(F.recommendedFloorPower(40) > F.recommendedFloorPower(20) * 1.9);
  assert.equal(F.recommendedFloorFor(1e9), 40, '추천 층도 40층까지');
  assert.deepEqual(F.floorGroups().map(group => group.label), ['1~10층', '11~20층', '21~30층', '31~40층']);
});

test('층 진행 — 39층 보스를 잡으면 40층으로 오르고, 40층에서는 그 층에 머문다', () => {
  const save = freshSave();
  save.floor = 39; save.maxFloor = 39; save.floorKills = killsToBoss(39);
  const won = afterBossWin(save);
  assert.equal(won.climbed, true);
  assert.equal(save.floor, 40);
  assert.equal(save.maxFloor, 40);
  const capped = afterBossWin(save);
  assert.equal(capped.capped, true);
  assert.equal(save.floor, 40, '마지막 층에서는 머문다');
  // 보스가 없는 아래층 진행도 40층에서 멈춘다.
  save.floor = 39; save.floorKills = killsToBoss(39);
  assert.equal(afterFloorClear(save, { climb: true }).floor, 40);
  save.floor = 40; save.floorKills = killsToBoss(40);
  assert.equal(afterFloorClear(save, { climb: true }).climbed, false, '40층 위로는 오르지 않는다');
  assert.equal(save.floor, 40);
});

test('21~40층 세이브는 그대로 살아남고 41층부터는 40으로 당긴다', () => {
  const save = freshSave();
  for (const floor of [21, 27, 33, 40]) {
    const loaded = parseSave({ ...save, floor, maxFloor: floor });
    assert.equal(loaded.floor, floor, `${floor}층 유지`);
    assert.equal(loaded.maxFloor, floor);
  }
  const over = parseSave({ ...save, floor: 41, maxFloor: 41 });
  assert.equal(over.floor, 40);
  assert.equal(over.maxFloor, 40);
});

test('테마 — 21층부터 성 안, 5층씩 네 구역, 배경은 1장', () => {
  assert.equal(theme.isCastle(20), false);
  assert.equal(theme.isCastle(21), true);
  assert.equal(theme.zoneOf(20), undefined, '황무지는 구역이 없다');
  const bands = [[21, 25, '성문 안뜰', 'gate'], [26, 30, '회랑·예배당', 'chapel'], [31, 35, '지하 감옥·수문', 'prison'], [36, 40, '왕좌', 'throne']];
  for (const [lo, hi, name, id] of bands) {
    for (const floor of [lo, Math.round((lo + hi) / 2), hi]) {
      const zone = theme.zoneOf(floor);
      assert.equal(zone.id, id, `${floor}층 구역`);
      assert.equal(zone.name, name);
      assert.equal(zone.lo, lo); assert.equal(zone.hi, hi);
      assert.ok(zone.fires.length >= 2, `${name}: 불빛 좌표`);
    }
  }
  // 모든 구역이 같은 배경 파일을 쓴다(테마당 배경 1장).
  assert.equal(theme.castleScene.path, '/assets/castle/hall-b-bright-v1.png');
  assert.equal(theme.castleScene.width, 964, '1~20층 배경과 같은 규격');
  assert.equal(theme.castleScene.height, 1632);
  // 구역마다 조명·안개·불씨 색이 실제로 다르다.
  const colors = new Set(theme.castleZones.map(zone => `${zone.sky}:${zone.fog}:${zone.ember}:${zone.dark}`));
  assert.equal(colors.size, 4, '네 구역의 조명 조합이 서로 다르다');
});

test('몹 — 테마마다 일반 2종 랜덤 + 전용 정예 1종', () => {
  assert.deepEqual(theme.mobRoster(1), ['skeleton', 'bonelancer'], '1~20층은 해골 병사 + 뼈 창병');
  assert.deepEqual(theme.mobRoster(20), ['skeleton', 'bonelancer']);
  assert.deepEqual(theme.mobRoster(21), ['knight', 'priest'], '21~40층은 흑요석 기사 + 핏빛 교단 사제');
  assert.deepEqual(theme.mobRoster(40), ['knight', 'priest']);
  assert.equal(theme.mobArt.skeleton.name, '해골 병사');
  assert.equal(theme.mobArt.bonelancer.name, '뼈 창병');
  assert.equal(theme.mobArt.knight.name, '흑요석 기사');
  assert.equal(theme.mobArt.priest.name, '핏빛 교단 사제');
  // 스폰 난수(0~1)로만 계보를 고르고, 두 종이 실제로 반반 나온다(새 난수를 쓰지 않는다).
  for (const seed of [0, .25, .5, .75, .999]) assert.equal(theme.mobKindFor(24, seed), theme.mobKindFor(24, seed));
  assert.equal(theme.mobKindFor(24, 0), theme.mobRoster(24)[0]);
  assert.equal(theme.mobKindFor(24, .75), theme.mobRoster(24)[1]);
  for (const floor of [1, 10, 20, 21, 30, 40]) {
    const seeds = [.05, .25, .45];
    assert.deepEqual(seeds.map(seed => theme.mobKindFor(floor, seed)), [theme.mobRoster(floor)[0], theme.mobRoster(floor)[0], theme.mobRoster(floor)[0]]);
    assert.equal(theme.mobKindFor(floor, .55), theme.mobRoster(floor)[1], `${floor}층 두 번째 종`);
  }
  // 전용 정예 — 테마마다 1종, 일반 로스터에 없는 그림을 쓴다.
  assert.equal(theme.eliteKindFor(10), 'bonebrute');
  assert.equal(theme.eliteKindFor(23), 'executioner');
  assert.equal(theme.eliteName(1), '뼈 거한');
  assert.equal(theme.eliteName(20), '뼈 거한');
  assert.equal(theme.eliteName(21), '성채 처형자');
  assert.equal(theme.eliteName(40), '성채 처형자');
  assert.equal(theme.eliteArtFor(5).idle, '/assets/castle/bonebrute_idle_v1.png');
  assert.equal(theme.eliteArtFor(35).walk, '/assets/castle/walk8_executioner_v1.png');
});

test('보스 — 1~20층 해골 군주, 21~40층 전체 「성채 패왕」 한 종', () => {
  for (let floor = 21; floor <= 40; floor++) {
    const boss = theme.bossArtFor(floor);
    assert.equal(boss.name, '성채 패왕', `${floor}층 보스는 성채 패왕`);
    assert.equal(boss.idle, '/assets/castle/warlord_idle_v1.png');
    assert.equal(boss.walk, '/assets/castle/walk8_warlord_v1.png');
    assert.equal(boss.tint, 0xffffff, '층별 틴트 변형 없음');
    assert.equal(boss.scale, 1, '층별 배율 변형 없음');
  }
  assert.equal(theme.bossArtFor(20).name, '해골 군주', '1~20층 보스 이름은 그대로');
  assert.equal(theme.bossArtFor(1).idle, '/assets/skeleton_boss.png', '1~20층은 기존 보스 시트');
});

test('신규 에셋 규격 — 투명 알파, 기존 해골·보스 시트와 같은 크기 계열', async () => {
  const wallIdle = await pngInfo('public/assets/skeleton_warrior.png');
  const wallWalk = await pngInfo('public/assets/walk8_skeleton.png');
  const bossIdle = await pngInfo('public/assets/skeleton_boss.png');
  const bossWalk = await pngInfo('public/assets/walk8_boss.png');
  const specs = [
    ['knight', theme.mobArt.knight, wallIdle, wallWalk],
    ['priest', theme.mobArt.priest, wallIdle, wallWalk],
    ['bonelancer', theme.mobArt.bonelancer, wallIdle, wallWalk],
    ['bonebrute', theme.eliteArt.bonebrute, wallIdle, wallWalk],
    ['executioner', theme.eliteArt.executioner, wallIdle, wallWalk]
  ];
  for (const [name, art, idle, walk] of specs) {
    const idleInfo = await pngInfo(art.idle.replace('/assets/', 'public/assets/'));
    const walkInfo = await pngInfo(art.walk.replace('/assets/', 'public/assets/'));
    assert.equal(idleInfo.width, idle.width, `${name} 서기 폭`);
    assert.equal(idleInfo.height, idle.height, `${name} 서기 높이`);
    assert.ok(idleInfo.alpha, `${name} 서기 알파`);
    assert.equal(walkInfo.width, walk.width, `${name} 걷기 시트 폭(4칸×2줄)`);
    assert.equal(walkInfo.height, walk.height, `${name} 걷기 시트 높이`);
    assert.ok(walkInfo.alpha, `${name} 걷기 알파`);
    assert.ok(walkInfo.byteLength > 100_000, `${name} 걷기 시트가 8프레임을 담는다`);
  }
  // 성채 패왕 — 보스 규격(214×240 서기 / 708×354 걷기).
  const warlord = theme.bossArtFor(21);
  const warlordIdle = await pngInfo(warlord.idle.replace('/assets/', 'public/assets/'));
  const warlordWalk = await pngInfo(warlord.walk.replace('/assets/', 'public/assets/'));
  assert.equal(warlordIdle.width, bossIdle.width);
  assert.equal(warlordIdle.height, bossIdle.height);
  assert.ok(warlordIdle.alpha);
  assert.equal(warlordWalk.width, bossWalk.width);
  assert.equal(warlordWalk.height, bossWalk.height);
  assert.ok(warlordWalk.alpha);
  // 배경 1장도 실제 파일이고 1~20층 배경과 같은 규격(964×1632)이다.
  const scene = await pngInfo('public/assets/castle/hall-b-bright-v1.png');
  const wasteland = await pngInfo('public/assets/wasteland-scene.png');
  assert.equal(scene.width, wasteland.width);
  assert.equal(scene.height, wasteland.height);
  assert.ok(scene.byteLength > 100_000);
});

test('화면 배선 — 적 이름·틴트·시트가 테마 표를 읽는다', async () => {
  const entities = await readFile(join(root, 'src/game/render/entities.ts'), 'utf8');
  assert.match(entities, /from '\.\.\/floorTheme'/, 'entities가 테마 표를 import');
  assert.match(entities, /bossArtFor\(floor\)/);
  assert.match(entities, /mobKindFor\(floor/);
  assert.doesNotMatch(entities, /enemy\.boss \? '해골 군주'/, '보스 이름 하드코딩 제거');
  assert.doesNotMatch(entities, /'정예 해골'/, '정예 이름 하드코딩 제거');
  const field = await readFile(join(root, 'src/game/render/field.ts'), 'utf8');
  assert.match(field, /zoneOf\(world\.save\.floor\)/, '구역 조명이 층을 읽는다');
  assert.match(field, /placeFieldScene\(this, world\.player, world\.save\.floor\)/);
  const render = await readFile(join(root, 'src/game/render.ts'), 'utf8');
  for (const path of ['/assets/castle/knight_idle_v1.png', '/assets/castle/walk8_knight_v1.png', '/assets/castle/priest_idle_v1.png',
    '/assets/castle/walk8_priest_v1.png', '/assets/castle/bonelancer_idle_v1.png', '/assets/castle/walk8_bonelancer_v1.png',
    '/assets/castle/bonebrute_idle_v1.png', '/assets/castle/walk8_bonebrute_v1.png', '/assets/castle/executioner_idle_v1.png',
    '/assets/castle/walk8_executioner_v1.png', '/assets/castle/warlord_idle_v1.png', '/assets/castle/walk8_warlord_v1.png',
    '/assets/castle/hall-b-bright-v1.png']) {
    assert.match(render, new RegExp(path.replace(/[/.]/g, '\\$&')), `부팅 프리로드 목록에 ${path}`);
  }
  assert.match(entities, /eliteArtFor\(floor\)/, '정예가 전용 그림을 읽는다');
  assert.match(entities, /mobTint\[kind\]/, '일반 몹 틴트가 테마 표를 읽는다');
  const wasteland = await readFile(join(root, 'src/game/wasteland.ts'), 'utf8');
  assert.match(wasteland, /castleLayoutFor/);
  assert.match(wasteland, /zone\.fires\.map/, '구역 불빛 좌표만 교체');
  const progressField = await readFile(join(root, 'src/game/fieldProgress.ts'), 'utf8');
  assert.match(progressField, /floorBossName\(this\.save\.floor\)/, '보스 등장·재도전 메시지가 테마 이름');
  assert.doesNotMatch(progressField, /해골 군주에게 다시 도전/, '재도전 문구 하드코딩 제거');
});

test('월드 — 40층 보스 처치가 40층에 머물고 안내 문구가 40층을 말한다', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 40; save.maxFloor = 40;
    save.floorKills = killsToBoss(40);
    const world = new World(save);
    const messages = []; world.onMessage = text => messages.push(text);
    world.kill({ ...world.enemies[0], boss: true, hp: 0 });
    assert.equal(save.floor, 40);
    assert.equal(save.maxFloor, 40);
    assert.ok(messages.some(text => text.includes('최고 40층')), messages.join(' / '));
    // 21층 보스는 '성채 패왕'으로 불린다.
    const mid = freshSave(); mid.tutorial = 1; mid.autoClimb = true; mid.floor = 21; mid.maxFloor = 21;
    mid.floorKills = killsToBoss(21) - 1;
    const midWorld = new World(mid);
    const midMessages = []; midWorld.onMessage = text => midMessages.push(text);
    midWorld.kill({ ...midWorld.enemies[0], boss: false, hp: 0 });
    assert.equal(midWorld.bossPending, true, '목표를 채우면 다음 스폰에서 보스가 온다');
    assert.ok(midMessages.some(text => text.includes('성채 패왕')), midMessages.join(' / '));
  } finally { Math.random = originalRandom; }
});
