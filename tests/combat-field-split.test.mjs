/**
 * PR-2B — `world.ts`를 `CombatEngine`(싸우는 규칙)과 `FieldProgress`(스폰·보스·층·드롭)로 나눈 결과의 계약.
 *
 * 확인하는 것
 *  ① 서버 런타임 클로저(server·api·functions에서 값 import로 도달하는 전체)에 **필드 모듈**이 없다:
 *     `world.ts`·`arena.ts`·`loot.ts`·`inventory.ts`·`bossLoot.ts`·`bagCapacity.ts`.
 *     던전·월드보스는 `CombatEngine`(과 `combat/bounds`·`combat/bossLoot`)만 쓴다.
 *  ② `World`는 `FieldProgress`의 이름뿐인 껍데기이고, `FieldProgress`는 `CombatEngine`을 상속한다 —
 *     필드가 엔진의 단계 메서드 사이에 자기 단계를 끼우는 구조가 유지된다.
 *  ③ 던전이 쓰는 전투 세계(`DungeonBattle.world`)는 `CombatEngine`이지 `World`가 아니며, 필드 전용
 *     상태(스폰 타이머·보스 예약·정예 카운터)를 갖지 않는다.
 *  ④ 그래도 필드는 예전 그대로다 — `World`는 스폰 타이머·보스 예약을 그대로 들고 있다.
 *  ⑤ 옛 import 경로(`src/game/world.ts`의 타입·상수, `src/game/bossLoot.ts`)가 살아 있다.
 *
 * 전투 결과의 동일성은 `tests/progress-parity.test.mjs`(고정 시드 스냅샷)와 던전·필드 테스트가 맡는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';
import { chainTo, lineCount, serverClosure } from './server-closure.mjs';

const FIELD_MODULES = ['src/game/world.ts', 'src/game/arena.ts', 'src/game/loot.ts', 'src/game/inventory.ts', 'src/game/bossLoot.ts', 'src/game/bagCapacity.ts'];

const closure = serverClosure();

test('서버 런타임 클로저에 필드 모듈(월드·아레나·전리품·가방)이 없다', () => {
  const leaked = FIELD_MODULES.filter(file => closure.has(file)).map(file => chainTo(closure, file));
  assert.deepEqual(leaked, [],
    '던전·월드보스는 CombatEngine만 써야 한다 — 필드 모듈이 서버 번들에 딸려 오면 배포 계약이 화면·가방 규칙에 묶인다.');
});

test('서버 클로저는 전투 엔진과 그 의존(경계·보스 드랍)만 src에서 가져온다', () => {
  const src = [...closure.keys()].filter(file => file.startsWith('src/'));
  for (const file of ['src/game/combat/engine.ts', 'src/game/combat/bounds.ts', 'src/game/combat/bossLoot.ts', 'src/game/dungeon/battle.ts']) {
    assert(src.includes(file), `${file}이 서버 클로저에 있어야 한다(던전 리플레이가 이 파일들을 실제로 쓴다)`);
  }
  // 클로저 크기 회귀 가드 — PR-2B 직후 실측 17파일/3,196줄. 크게 늘면 필드 모듈이 다시 새어 들어온 것이다.
  // 2026-11-22 일괄 배포 뒤 실측 19파일/3,801줄: 밸런스 v2(`battle/formulas.ts`·`combat/engine.ts`)와
  // 기념 버프(`patchBuff.ts`)가 엔진·던전이 실제로 쓰는 의존이라 늘었다. 파일 수 상한이 누출을 잡는
  // 진짜 가드이고, 줄 수 상한은 그 위의 완만한 회귀선이다.
  // 2026-11-22 캐릭터 카드 전투력(백로그 11·B안) 뒤 실측 21파일/4,014줄: `characters` 응답이 접속 중이
  // 아닌 슬롯의 전투력도 세어야 해서 `server/character-power.mjs`가 `store.ts`(parseSave)·`items.ts`
  // (totalStats)·`power.ts`(combatPower)를 쓴다 — 화면과 **같은 식**으로 계산하려면 이 셋이 필요하다
  // (식을 서버에 다시 적으면 카드와 HUD가 갈라진다). 필드 모듈은 위 테스트가 그대로 막는다.
  // 2026-11-23 백로그 2·3 뒤 실측 21파일/4,123줄: `battle/formulas.ts` 치명타 피해 배수(+13줄)와
  // 추가옵션 키·상한(+20줄)이 늘었고, 유니크·전설 획득 띠(`raritySpotlight*`)는 화면 전용이라 서버가 닿지 않는다.
  // 작업 278: 판정·VFX 공용 순수 규격 skillAreas.ts가 엔진 의존으로 1파일 늘었다.
  // 2026-11-24 방치 사냥 개선: `progress.ts`가 마리당 보상 배율(`depthRewardScale`)을 위해 몹 HP 곡선
  // (`battle/formulas.ts`)을 읽는다 — 보상 배율을 두 벌로 적으면 또 어긋나기 때문이다. 둘 다 순수 밸런스
  // 모듈이라 서버 번들에 화면·가방 규칙은 들어오지 않는다.
  // 2026-11-24 무한 방어전: 순위 검증이 `src/game/dungeon/defenseBattle.ts`(고정 스텝 전투)를 그대로
  // 리플레이하므로 1파일이 늘었다. 필드 모듈은 위 테스트가 그대로 막는다.
  // 2026-11-24 무한 방어전 v2: 밸런스 표를 `dungeon/defenseTuning.ts`로 분리해 1파일(+~100줄)이 더 늘었고,
  // 엔진의 적 추격·종류(돌진/사수)·회복 규칙이 defenseBattle.ts에 붙어 줄 수가 늘었다. 셋 다 순수 전투
  // 모듈이라 서버 번들에 화면·가방 규칙은 들어오지 않는다 — 누출 가드는 위 파일 목록 테스트가 맡는다.
  const total = src.reduce((sum, file) => sum + lineCount(file), 0);
  assert(src.length <= 25, `서버가 닿는 src 파일이 ${src.length}개다 — 필드 모듈이 다시 들어왔는지 확인하라`);
  assert(total <= 5250, `서버가 닿는 src 코드가 ${total}줄이다 — 필드 모듈이 다시 들어왔는지 확인하라`);
});

const { CombatEngine } = await import('../src/game/combat/engine.ts');
const { FieldProgress } = await import('../src/game/fieldProgress.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');
const { DungeonBattle } = await import('../src/game/dungeon/battle.ts');
const { WorldBossRehearsal } = await import('../src/game/worldBossRehearsal.ts');

test('World는 FieldProgress의 껍데기이고, FieldProgress는 CombatEngine을 상속한다', () => {
  assert.equal(Object.getPrototypeOf(World.prototype), FieldProgress.prototype, 'World는 FieldProgress를 그대로 상속한다');
  assert.equal(Object.getPrototypeOf(FieldProgress.prototype), CombatEngine.prototype, 'FieldProgress는 CombatEngine 위에 얹힌다');
  assert.equal(World.prototype instanceof CombatEngine, true);
  // 껍데기에는 자기 메서드가 없어야 한다 — 필드 규칙은 FieldProgress 한 곳에 있다.
  const own = Object.getOwnPropertyNames(World.prototype).filter(name => name !== 'constructor');
  assert.deepEqual(own, [], `World가 자기 메서드를 갖고 있다: ${own.join(', ')}`);
});

test('필드(World)는 스폰·보스 상태를 그대로 들고 사냥한다', () => {
  const world = new World(freshSave());
  assert.equal(typeof world.spawnTimer, 'number', '필드는 스폰 타이머를 갖는다');
  assert.equal(typeof world.bossPending, 'boolean', '보스 예약도 필드의 것이다');
  assert.equal(typeof world.bossFloor, 'function');
  assert.equal(world.enemies.length, 1, '생성자는 첫 몹 한 마리를 세운다(예전과 같다)');
});

test('던전·월드보스 전투는 CombatEngine만 쓴다 — 필드 전용 상태가 없다', () => {
  const battle = new DungeonBattle(freshSave(), 1, 20261121);
  assert.equal(battle.world instanceof CombatEngine, true, '던전 세계는 엔진을 상속한다');
  assert.equal(battle.world instanceof World, false, '던전 세계는 필드(World)가 아니다');
  for (const fieldOnly of ['spawnTimer', 'bossPending', 'bossRetryAvailable', 'eliteKills', 'elitePending', 'autoSalvage']) {
    assert.equal(fieldOnly in battle.world, false, `던전 세계에 필드 전용 상태(${fieldOnly})가 있다 — 서버가 필드 규칙을 알게 된다`);
  }
  const rehearsal = new WorldBossRehearsal(freshSave());
  assert.equal(rehearsal.world instanceof CombatEngine, true);
  assert.equal('spawnTimer' in rehearsal.world, false, '월드보스 연습도 필드 스폰을 모른다');
  assert.equal(rehearsal.world.enemies.length, 1, '보스 한 마리만 세운다');
});

test('옛 import 경로가 그대로 살아 있다 (world.ts의 타입·상수, bossLoot.ts)', async () => {
  const legacy = await import('../src/game/world.ts');
  for (const name of ['World', 'cooldowns', 'crushHits', 'crushLabelOffset', 'enemyMaxHp', 'enemyMoveSpeed', 'MOB_CAP', 'ELITE_REWARD_SCALE', 'basicAttackPower', 'archerAttackRange', 'fireBoltCount', 'WEAPON_REQUIRED_NOTICE']) {
    assert(name in legacy, `world.ts가 ${name}을 더 이상 내보내지 않는다 — 기존 import가 깨진다`);
  }
  const boss = await import('../src/game/bossLoot.ts');
  assert.equal(typeof boss.bossGoldPiles, 'function');
  assert.equal(typeof boss.bossItems, 'function');
  assert.equal(existsSync(fileURLToPath(new URL('../src/game/combat/bossLoot.ts', import.meta.url))), true, '정의는 combat 쪽에 있다');
});
