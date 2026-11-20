import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, floorKillTarget, parseSave, totalStats } = await import('../src/game/store.ts');
const { World, enemyMoveSpeed, enemyMaxHp, enemyHitDamage, basicAttackPower } = await import('../src/game/world.ts');

test('ordinary monsters approach more slowly and never outpace the player at deep floors', () => {
  assert.equal(enemyMoveSpeed(1, false), 38);
  assert(enemyMoveSpeed(10, false) < enemyMoveSpeed(30, false));
  assert.equal(enemyMoveSpeed(100, false), 64);
  assert.equal(enemyMoveSpeed(100, true), 28);
  const save = freshSave(); save.floor = 100;
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [{ x: 110, y: -10, hp: 1000, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.update(.1);
  assert(Math.hypot(world.player.x, world.player.y) > 0);
  assert(Math.abs(Math.hypot(world.enemies[0].x - 110, world.enemies[0].y + 10) - 6.4) < 1e-8);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > 0);
});
test('hero does not shuffle in place around a nearby enemy or short knockback', () => {
  const world = new World(freshSave()); world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0]; enemy.x = 80; enemy.y = 0; enemy.hp = enemy.maxHp = 10000;
  world.update(.1);
  assert.equal(world.player.x, 0); assert.equal(world.activeMove.x, 0);
  enemy.x = 120;
  let movingTicks = 0, stopped = false;
  for (let i = 0; i < 14; i++) {
    world.update(.1);
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    if (moving) { assert(!stopped, 'a short chase must not restart near the target'); movingTicks++; }
    else if (movingTicks) stopped = true;
  }
  assert(movingTicks >= 1); assert(stopped);
  const position = { x: world.player.x, y: world.player.y };
  enemy.x = world.player.x + 75; enemy.y = world.player.y;
  world.update(.1);
  assert.deepEqual({ x: world.player.x, y: world.player.y }, position);
  assert.equal(world.activeMove.x, 0);
});
test('automatic attacks and equipped skills start when the hero reaches attack range', () => {
  const save = freshSave(); save.learned = ['slash2']; save.quickSlots = ['slash2', null, null];
  const world = new World(save); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.x = 120; enemy.y = 0; enemy.hp = enemy.maxHp = 10000;
  world.update(.1);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > .05);
  assert.equal(enemy.hp, 10000);
  assert.equal(world.cooldown.attack, 0);
  assert.equal(world.cooldown.slash2, 0);
  assert(!world.effects.some(effect => effect.kind === 'slash' || effect.kind === 'slash2'));

  for (let i = 0; i < 6 && Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) > 90; i++) world.update(.1);
  world.update(.016);
  assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0);
  assert(Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) <= 90);
  assert(enemy.hp < 10000);
  assert(world.effects.some(effect => effect.kind === 'slash'));
  assert(world.effects.some(effect => effect.kind === 'slash2'));
  const afterBasicAttack = enemy.hp;
  enemy.x = world.player.x + 40; enemy.y = world.player.y;
  // 이단참(작업 213)은 발동 즉시 1타, 0.18초 뒤 2타가 들어간다 — 2타는 그 뒤 업데이트에 들어온다.
  world.update(.05);
  assert.equal(enemy.hp, afterBasicAttack, 'the second crescent is still winding up');
  world.update(.2);
  assert(enemy.hp < afterBasicAttack, 'the backhand second hit lands at 0.18s');
});
test('사거리 경계(89~90)에서 추격 플래그가 공격을 삼키지 않는다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 10000;
  for (const distance of [89.9, 89.5, 89, 85.2, 40]) {
    world.player.x = 0; world.player.y = 0;
    world.cooldown.attack = 0; world.attackPose = 0; world.effects = [];
    world.cooldown.slash2 = 0; world.cooldown.spin = 0; world.cooldown.crushing = 0; world.cooldown.slam = 0;
    enemy.x = distance; enemy.y = 0; enemy.knockX = 0; enemy.knockY = 0; enemy.hit = 0;
    // 추격해 들어오던 상태 그대로 — 예전 코드는 이 상태에서 경계에 걸치면 공격을 취소했다.
    world.chaseTarget = enemy; world.pursuing = true; world.activeMove = { x: 1, y: 0 };
    world.update(.016);
    assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0, `${distance}: 사거리 안에서는 걷지 않는다`);
    assert.equal(world.pursuing, false, `${distance}: 사거리 안이면 추격을 즉시 끈다`);
    assert(world.effects.some(effect => effect.kind === 'slash'), `${distance}: 사거리 안이면 바로 공격한다`);
    assert(world.cooldown.attack > 0, `${distance}: 공격이 실제로 나갔다`);
    assert(enemy.hp < 10000, `${distance}: 피해가 들어갔다`);
    assert.equal(world.player.x, 0, `${distance}: 제자리에서 때린다`);
  }
});

test('사거리 경계에서 때리다 멈추지 않고 쿨다운마다 계속 공격한다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 100000;
  enemy.x = 89.5; enemy.y = 0;
  world.chaseTarget = enemy; world.pursuing = true;   // 추격 중 경계에 들어온 상태에서 시작
  let attacks = 0;
  for (let i = 0; i < 60; i++) {   // 6초
    enemy.x = world.player.x + 89.5; enemy.y = world.player.y;   // 넉백·접근과 무관하게 경계 고정
    world.update(.1);
    attacks += world.effects.filter(effect => effect.kind === 'slash').length;
    world.effects = [];
    assert.equal(world.activeMove.x, 0, '경계에서도 걷기 시작하지 않는다');
  }
  assert.equal(world.player.x, 0);
  assert(attacks >= 8, `6초 동안 쿨다운마다 공격했다(실제 ${attacks}회)`);
});

test('a distant drop is pulled into the hero on its own and stored after the rest beat', () => {
  const world = new World(freshSave()); world.enemies = []; world.spawnTimer = 999;
  world.drops = [{ x: 90, y: 0, item: { id: 'loot', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }, age: 0, warned: false }];
  world.update(.1); assert.equal(world.player.x, 0, 'the hero keeps his ground instead of walking to the loot');
  for (let i = 0; i < 14; i++) world.update(.1);
  assert(world.drops.length === 1, 'the drop still rests on the ground before its 1.5 second beat');
  for (let i = 0; i < 10 && world.drops.length; i++) world.update(.1);
  assert(world.save.bag.some(item => item.id === 'loot'));
});

test('boss floor transition clears old enemies and pursuit but retains drops', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    for (const autoClimb of [true, false]) {
      const save = freshSave(); save.tutorial = 1; save.autoClimb = autoClimb; save.floorKills = floorKillTarget(save.floor);
      const world = new World(save), oldEnemy = world.enemies[0];
      const boss = { ...oldEnemy, boss: true, hp: 0 };
      world.chaseTarget = oldEnemy; world.pursuing = true; world.activeMove = { x: 1, y: 0 };
      world.kill(boss);
      assert.equal(world.drops.length, 1, 'the boss leaves its one chance item on the ground (한 마리당 1개, 작업 210)');
      assert.equal(save.floor, autoClimb ? 2 : 1);
      assert.equal(save.floorKills, 0);
      if (autoClimb) {
        assert.equal(world.enemies.length, 0); assert.equal(world.chaseTarget, undefined);
        assert.equal(world.pursuing, false); assert.deepEqual(world.activeMove, { x: 0, y: 0 });
        assert.equal(world.spawnTimer, .2);
      } else assert.equal(world.enemies[0], oldEnemy);
    }
  } finally { Math.random = originalRandom; }
});

test('death stops auto-climb while retaining the existing respawn behavior', () => {
  const save = freshSave(); save.autoClimb = true;
  const world = new World(save);
  assert.equal(world.bossRetryReady, false, '한 번도 지지 않았으면 버튼이 없다');
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1;
  world.update(.01);
  assert.equal(save.autoClimb, false);
  assert.equal(world.player.hp, totalStats(save).health);
  assert.equal(save.health, totalStats(save).health);
  assert.equal(world.bossRetryReady, false, '일반 몹에게 진 것으로는 버튼이 뜨지 않는다');
});

test('자동 등반을 끈 세이브로 접속해도 보스에게 지기 전에는 [⚔ 보스 도전]이 없다(작업 222, `#5781`)', () => {
  // 예전에는 `bossRetryAvailable = !save.autoClimb`로 시작해, 자동 등반을 끈 세이브로 들어오면
  // 보스에게 한 번도 지지 않았는데 최고 도달 층에서 버튼이 즉시 떴다.
  for (const autoClimb of [false, true]) {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = autoClimb;
    save.floor = 5; save.maxFloor = 5; save.floorKills = floorKillTarget(5);
    const world = new World(save);
    assert.equal(world.bossFloor(), true, '최고 도달 층');
    assert.equal(world.bossRetryAvailable, false, '생성자는 버튼 상태를 켜지 않는다');
    assert.equal(world.bossRetryReady, false, "자동 등반 설정과 무관하게 '보스 패배' 전에는 버튼이 없다");
    assert.equal(world.bossPending, autoClimb, '자동 등반을 끈 세이브는 보스를 저절로 소환하지도 않는다');
  }
});

test('일반·정예 몹에게 지면 최고 도달 층이어도 [⚔ 보스 도전]은 뜨지 않는다(작업 222, `#5792`)', () => {
  // 사용자 확인 `#5792` "각 층 끝까지 등반해서 실패해야 떠야되는데" — 버튼은 **보스에게 진 경우에만**.
  for (const elite of [false, true]) {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
    save.floor = 5; save.maxFloor = 5; save.floorKills = 3;
    const world = new World(save);
    assert.equal(world.bossFloor(), true);
    world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, elite, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
    world.player.hp = 1; world.update(.01);
    assert.equal(save.autoClimb, false, `${elite ? '정예' : '일반'} 몹에게 진 자동 등반 중단 규칙은 그대로`);
    assert.equal(world.bossRetryAvailable, false, '보스 패배가 아니면 버튼이 켜지지 않는다');
    assert.equal(world.bossRetryReady, false);
  }
  // 이미 보스에게 져서 켜져 있던 상태는 일반 몹에게 진 것으로 꺼지지 않는다.
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
  save.floor = 5; save.maxFloor = 5; save.floorKills = 3;
  const world = new World(save);
  world.bossRetryAvailable = true;
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1; world.update(.01);
  assert.equal(world.bossRetryReady, true, '보스에게 진 기록이 있으면 버튼은 남는다');
  // 아래층에서 보스도 아닌 몹에게 지면 여전히 버튼은 없다.
  const lower = freshSave(); lower.tutorial = 1; lower.autoClimb = true;
  lower.floor = 3; lower.maxFloor = 5; lower.floorKills = 0;
  const lowWorld = new World(lower);
  lowWorld.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  lowWorld.player.hp = 1; lowWorld.update(.01);
  assert.equal(lowWorld.bossRetryAvailable, false);
  assert.equal(lowWorld.bossRetryReady, false);
});

test('층 보스가 나타나는 순간 체력을 최대치로 회복한 뒤 싸운다(작업 222, 사용자 요청 `#5811`)', () => {
  const bossSave = () => {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
    save.floor = 5; save.maxFloor = 5; save.floorKills = floorKillTarget(5);
    return save;
  };
  // ① 자동 등반 중 목표 마릿수를 채워 보스가 소환될 때
  const auto = bossSave(); const world = new World(auto);
  const max = totalStats(auto).health;
  world.player.hp = 1; auto.health = 1;
  world.spawnTimer = 0; world.update(.001);
  assert(world.enemies.some(enemy => enemy.boss), '보스 등장');
  assert.equal(world.player.hp, max, '보스 등장과 동시에 체력이 최대치로');
  assert.equal(auto.health, max, '세이브의 현재 체력도 최대치로');
  // ② `⚔ 보스 도전` 재도전으로 보스가 나올 때도 같은 경로다.
  const retry = bossSave(); retry.floorKills = 0;
  const again = new World(retry);
  again.bossRetryAvailable = true;
  assert.equal(again.challengeBoss(), true);
  again.player.hp = 1; retry.health = 1;
  again.update(.05);
  assert(again.enemies.some(enemy => enemy.boss), '재도전 보스 등장');
  assert.equal(again.player.hp, max, '재도전도 체력을 채우고 시작한다');
  assert.equal(retry.health, max);
});

test('보스에게 진 기록은 세이브에 남아 새로고침·재접속에도 [⚔ 보스 도전]이 유지된다(작업 223, `#6086`)', () => {
  // 사용자 제보 `#6086` "3층 보스 실패했는데 보스도전버튼이 생겼다가 없어졌어 4층 넘어갈때까지 계속 있어야되는데"
  // — HUD 상태가 세션 메모리에만 있어 새로고침·재접속·버전 업데이트 리로드마다 사라졌다.
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
  save.floor = 3; save.maxFloor = 3; save.floorKills = 0;
  const world = new World(save);
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1; world.update(.01);
  assert.equal(world.bossRetryReady, true, '3층 보스에게 패배 → ⚔ 보스 도전');
  assert.equal(save.bossRetryFloor, 3, '진 층이 세이브에 남는다');

  // 새로고침·재접속 — 세이브를 JSON으로 한 번 돌려 다시 읽어도 버튼이 살아 있다.
  const reopen = () => new World(parseSave(JSON.parse(JSON.stringify(save))));
  const again = reopen();
  assert.equal(again.bossRetryReady, true, '다시 접속해도 ⚔ 보스 도전이 그대로');

  // 몹이 30마리 차 2층으로 내려가도 기록은 남고, 3층에 돌아오면 버튼이 다시 보인다(보스는 최고 층에서만).
  save.floor = 2;
  const dropped = reopen();
  assert.equal(dropped.bossRetryReady, false, '2층에서는 보스가 없으니 버튼도 없다');
  assert(dropped.travelToFloor(3).ok);
  assert.equal(dropped.bossRetryReady, true, '3층으로 돌아오면 바로 다시 도전할 수 있다');

  // 보스를 이겨 4층으로 올라가면 기록이 지워져 다시 접속해도 버튼이 없다.
  dropped.save.floorKills = floorKillTarget(3);
  dropped.challengeBoss();
  dropped.update(.05);
  const boss = dropped.enemies.find(enemy => enemy.boss);
  assert(boss, '재도전 보스가 나온다');
  dropped.kill(boss);
  assert.equal(dropped.save.floor, 4, '보스를 이기면 4층');
  assert.equal(dropped.save.bossRetryFloor, 0, '올라가면 기록을 지운다');
  assert.equal(new World(parseSave(JSON.parse(JSON.stringify(dropped.save)))).bossRetryReady, false, '새로고침해도 버튼이 돌아오지 않는다');

  // 옛 세이브(값 없음)는 0으로 읽고, 서버가 20층 밖의 값을 보내도 1~20 정수만 남긴다.
  assert.equal(parseSave({ ...save, bossRetryFloor: undefined }).bossRetryFloor, 0);
  assert.equal(parseSave({ ...save, bossRetryFloor: 99 }).bossRetryFloor, 20);
});

test('층 보스가 나타나면 스킬 쿨타임도 함께 0으로 돌아온다(작업 223, 사용자 요청 `#6108`)', () => {
  // 사용자 요청 `#6108` "보스 도전 때 스킬 쿨도 돌려줘" — 자동 소환과 ⚔ 재도전 모두 같은 스폰 블록을 지난다.
  const bossSave = () => {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
    save.floor = 5; save.maxFloor = 5; save.floorKills = floorKillTarget(5);
    return save;
  };
  const auto = bossSave(); const world = new World(auto);
  for (const kind of Object.keys(world.cooldown)) world.cooldown[kind] = 9;
  world.spawnTimer = 0; world.update(.001);
  assert(world.enemies.some(enemy => enemy.boss), '보스 등장');
  assert.deepEqual(Object.values(world.cooldown).filter(left => left !== 0), [], '모든 스킬·평타 쿨타임 0');

  const retry = bossSave(); retry.floorKills = 0;
  const again = new World(retry);
  again.bossRetryAvailable = true;
  assert(again.challengeBoss());
  for (const kind of Object.keys(again.cooldown)) again.cooldown[kind] = 9;
  again.update(.05);
  assert(again.enemies.some(enemy => enemy.boss), '재도전 보스 등장');
  assert.deepEqual(Object.values(again.cooldown).filter(left => left !== 0), [], '재도전도 쿨타임 0');
});

test('[⚔ 보스 도전]은 보스에게 쓰러진 뒤 살아나고, 자동 등반 중이어도 바로 재도전할 수 있다(작업 210 → 212)', async () => {
  const { readFileSync } = await import('node:fs');
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 5; save.maxFloor = 5; save.floorKills = 0;
  const world = new World(save);
  assert.equal(world.bossRetryReady, false, '살아 있는 동안에는 버튼이 없다');
  // 보스전에서 패배 — 자동 등반은 **켜진 채로** 두고, 1마리부터 다시 잡게 킬 카운트를 0으로(작업 212 `#5017`).
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1; world.update(.01);
  assert.equal(save.autoClimb, true, '자동 등반은 계속 켜져 있다');
  assert.equal(save.floorKills, 0, '킬 카운트는 1마리부터 다시');
  assert.equal(world.bossRetryReady, true, '최고 도달 층에서 패배 → ⚔ 보스 도전');
  assert(!world.enemies.some(enemy => enemy.boss), '보스는 물러난다');
  // 누르면 기존 몹을 정리하고 그 층 보스가 바로 나온다(일반 몹은 끼지 않는다).
  assert.equal(world.challengeBoss(), true);
  assert.equal(save.autoClimb, true);
  assert.equal(world.bossPending, true, '보스 예약');
  assert.equal(world.enemies.length, 0, '기존 몹 정리');
  world.update(.05);
  assert(world.enemies.some(enemy => enemy.boss), '다음 틱에 보스가 나온다');
  assert(!world.enemies.some(enemy => !enemy.boss), '보스전에는 일반 몹이 없다');
  // 또 지면 버튼이 다시 살아나 몇 번이든 재도전할 수 있다.
  const boss = world.enemies.find(enemy => enemy.boss);
  boss.x = 12; boss.y = 0; world.player.hp = 1; world.player.hit = 0; world.update(.01);
  assert.equal(world.bossRetryReady, true, '다시 패배하면 다시 도전 가능');
  assert.equal(world.challengeBoss(), true);
  world.update(.05);
  const reborn = world.enemies.find(enemy => enemy.boss);
  assert(reborn, '재도전 보스가 다시 나온다');
  // 보스를 이겨 다음 층으로 올라가면 버튼은 사라진다.
  world.kill(reborn);
  assert.equal(save.floor, 6, '보스를 이기면 다음 층');
  assert.equal(world.bossRetryReady, false, '올라가면 버튼이 사라진다');
  // HUD·CSS 계약 — 버튼은 .status-main에 붙고 금빛 테두리로 보인다.
  const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
  assert(hud.includes('boss-retry') && hud.includes('challengeBoss'), 'HUD 버튼과 도전 호출');
  assert(/\.boss-retry\s*\{[^}]*border:\s*1px solid #d79a4c/.test(css), '보스 도전 버튼 스타일');
  assert(css.includes('prefers-reduced-motion: reduce') && css.includes('.boss-retry { animation: none; }'), '모션 감소 대응');
});

test('보스전에는 일반 몹이 스폰되지 않고, 보스가 나타날 때 남은 일반 몹도 정리된다(작업 212 `#5017`)', () => {
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 5; save.maxFloor = 5; save.floorKills = 0;
  const world = new World(save);
  world.bossRetryAvailable = true;
  assert.equal(world.challengeBoss(), true);
  world.update(.05);
  assert.equal(world.enemies.length, 1, '보스 한 마리만');
  assert(world.enemies[0].boss);
  // 스폰 타이머를 계속 0으로 돌려도 일반 몹이 끼어들지 않는다.
  for (let tick = 0; tick < 15; tick++) {
    world.spawnTimer = 0;
    world.player.hp = totalStats(save).health; world.player.hit = 1;
    world.update(.001);
  }
  assert.equal(world.enemies.filter(enemy => !enemy.boss).length, 0, '보스전 내내 일반 몹 없음');
  assert.equal(world.enemies.filter(enemy => enemy.boss).length, 1, '보스는 그대로 한 마리');
  // 자동으로 뜨는 보스도 마찬가지 — 나올 때 남은 일반 몹을 정리한다.
  const auto = new World(freshSave()); auto.save.tutorial = 1; auto.save.floor = 5; auto.save.maxFloor = 5; auto.save.autoClimb = true;
  auto.enemies = [{ x: 300, y: 0, hp: 50, maxHp: 50, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  auto.bossPending = true; auto.spawnTimer = 0;
  auto.update(.001);
  assert(auto.enemies.some(enemy => enemy.boss), '보스 등장');
  assert.equal(auto.enemies.filter(enemy => !enemy.boss).length, 0, '일반 몹은 정리');
});

test('자동 등반 중 보스에게 지면 킬 카운트 0부터 다시 잡고, 목표를 채우면 보스가 저절로 다시 온다(작업 212 `#5017`)', () => {
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 5; save.maxFloor = 5;
  save.floorKills = floorKillTarget(5);
  const world = new World(save);
  const boss = { x: 10, y: 0, hp: 999, maxHp: 999, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies = [boss]; world.player.hp = 1; world.update(.01);
  assert.equal(save.floorKills, 0, '1마리부터 다시');
  assert.equal(save.autoClimb, true, '자동 등반 유지');
  // 일반 몹을 잡아 목표를 채우면 보스가 자동으로 다시 예약된다.
  world.bossPending = false;
  const mob = { x: 0, y: 0, hp: 0, maxHp: 1, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  for (let kill = 0; kill < floorKillTarget(5); kill++) world.kill({ ...mob });
  assert(world.save.floorKills >= floorKillTarget(5));
  assert.equal(world.bossPending, true, '목표를 채우면 보스가 다시 나타난다');
  world.spawnTimer = 0; world.update(.001);
  assert(world.enemies.some(enemy => enemy.boss), '보스 재등장');
});

test('아래층 파밍(floor < maxFloor)에서는 보스도 없고, 보스에게 진 것이 아니면 자동 등반 규칙이 그대로다(작업 212 `#5028`)', () => {
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 3; save.maxFloor = 5; save.floorKills = floorKillTarget(3);
  const world = new World(save);
  assert.equal(world.bossFloor(), false, '아래층에는 보스가 없다');
  assert.equal(world.bossRetryReady, false, '아래층에는 도전 버튼도 없다');
  // 아래층에서 일반 몹에게 지면 기존처럼 자동 등반이 꺼진다.
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1; world.update(.01);
  assert.equal(save.autoClimb, false, '아래층 패배는 기존 규칙대로');
  assert.equal(save.floorKills, floorKillTarget(3), '아래층 킬 카운트 규칙은 그대로');
  assert.equal(world.bossRetryReady, false, '아래층에는 버튼이 뜨지 않는다');
});

test('아래층 반복 사냥에는 보스가 나오지 않고 목표를 채우면 진행도만 0으로 돌린다(작업 210)', () => {
  const save = freshSave(); save.tutorial = 1; save.floor = 2; save.maxFloor = 7; save.floorKills = floorKillTarget(2) - 1;
  const world = new World(save);
  assert.equal(world.bossPending, false, '아래층에서는 보스 예약 없음');
  world.enemies = []; world.spawnTimer = 999;
  const mob = { x: 60, y: 20, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.kill(mob);
  assert.equal(world.bossPending, false, '목표를 채워도 보스가 나오지 않는다');
  assert.equal(save.floorKills, 0, '진행도만 0으로 돌려 계속 사냥');
  // 예약이 남아 있어도 아래층 스폰은 보스가 아니다.
  world.bossPending = true; world.spawnTimer = 0;
  world.update(.05);
  assert(!world.enemies.some(enemy => enemy.boss), '아래층에는 보스가 없다');
  assert(save.enemies === undefined, '세이브에는 전투 상태를 남기지 않는다');
});

test('normal difficulty health and damage match the floor curves', () => {
  for (const [floor, normalHp, bossHp, normalDamage, bossDamage] of [
    // 작업 196: floors 1~8 keep the old curve, the deep one takes over by 25; 작업 198 lifted the deep
    // curve to 78층 ≈ 54,800 and a boss to six mobs (78층 ≈ 329,000).
    [1, 40, 347, 10, 27], [10, 299, 2436, 40, 99],
    [30, 4713, 28281, 114, 285], [50, 17254, 103524, 193, 489]
  ]) {
    assert.equal(enemyMaxHp(floor, false), normalHp);
    assert.equal(enemyMaxHp(floor, true), bossHp);
    assert.equal(enemyHitDamage(floor, false, 0), normalDamage);
    assert.equal(enemyHitDamage(floor, true, 0), bossDamage);
    assert.equal(enemyHitDamage(floor, false, 10), normalDamage - 2);
  }
  assert.equal(enemyHitDamage(1, false, 1000), 1);
});

const dummyEnemy = (x, y, hp = 1000) => ({ x, y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });

test('평타는 사거리·부채꼴 안에서 가장 가까운 한 마리만 때린다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0);
  world.enemies = [far, near];   // 배열 순서와 무관하게 가까운 쪽이 맞는다
  world.action('attack');
  assert(near.hp < 1000, '가장 가까운 적이 맞았다');
  assert.equal(far.hp, 1000, '같은 사거리·부채꼴 안의 다른 적은 그대로다');
  assert.equal(world.effects.filter(effect => effect.kind === 'hit').length, 1, '피격 표시도 한 마리만');
  assert(near.hit > 0); assert.equal(far.hit, 0);
});

test('평타가 한 마리를 처치해도 사거리 안의 다른 적은 그대로 살아 있다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0, 1);
  world.enemies = [far, near];
  const kills = world.save.kills;
  world.action('attack');
  assert.equal(world.enemies.length, 1, '처치된 한 마리만 빠진다');
  assert.equal(world.enemies[0], far);
  assert.equal(world.save.kills, kills + 1);
});

test('액티브 스킬은 종전처럼 사거리 안의 모든 적을 때린다', () => {
  const save = freshSave(); save.learned = ['destroy']; save.quickSlots = ['destroy', null, null];
  const world = new World(save); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0);
  world.enemies = [far, near];
  world.action('destroy');
  assert(near.hp < 1000, '가까운 적이 맞았다');
  assert(far.hp < 1000, '먼 적도 함께 맞는다');
});

test('평타 한 방은 공격력 ×1.6으로 묵직하고, 한 번에 한 마리만 맞는다', () => {
  const save = freshSave();
  const world = new World(save); world.spawnTimer = 999;
  const near = dummyEnemy(40, 0), far = dummyEnemy(70, 4);
  world.enemies = [near, far];
  const attack = totalStats(save).attack;
  assert.equal(basicAttackPower, 1.6);
  world.action('attack');
  assert.equal(1000 - near.hp, attack * basicAttackPower, '가까운 한 마리에 공격력 1.6배가 들어간다');
  assert.equal(far.hp, 1000, '다른 적은 맞지 않아 평타 총피해가 늘지 않는다');
  const label = world.effects.find(effect => effect.kind === 'hit');
  assert.equal(label.amount, Math.round(attack * basicAttackPower), '피해 숫자도 1.6배로 표시된다');
});

test('평타 두 방이면 이전 광역 평타 두 방보다 한 대상에게 더 큰 피해를 준다', () => {
  const save = freshSave();
  const world = new World(save); world.spawnTimer = 999;
  const target = dummyEnemy(40, 0);
  world.enemies = [target];
  const attack = totalStats(save).attack;
  world.action('attack');
  const first = 1000 - target.hp;
  world.cooldown.attack = 0; world.attackPose = 0;
  world.action('attack');
  const total = 1000 - target.hp;
  assert.equal(first, attack * 1.6);
  assert.equal(total, attack * 3.2);
  assert(total > attack * 2, '같은 시간에 이전보다 1.6배 무겁다');
});

test('몹이 30마리까지 쌓이면 한 층 내려가고, 1층에서는 내려가지 않고 상한만 지킨다(작업 222, 사용자 요청 `#5827`)', async () => {
  const { MOB_CAP } = await import('../src/game/world.ts');
  const { rollItem } = await import('../src/game/items.ts');
  assert.equal(MOB_CAP, 30, '필드 몹 상한 30');
  const mob = i => ({ x: 300 - i, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  // ① 최고 도달 층에서 30마리 → 한 층 내려가고 필드가 정리된다. 바닥 드랍은 잃지 않는다.
  const save = freshSave(); save.tutorial = 1; save.autoClimb = true;
  save.floor = 5; save.maxFloor = 5; save.floorKills = 7;
  const world = new World(save);
  const npc = world.enemies[0];
  world.drops = [{ x: 0, y: 0, item: rollItem(5, false, false, 'warrior'), age: 0, warned: false }];
  world.enemies = Array.from({ length: MOB_CAP }, (_, i) => mob(i));
  world.spawnTimer = 999;
  world.bossPending = true; world.elitePending = true;
  world.chaseTarget = npc; world.pursuing = true;
  const messages = []; world.onMessage = text => messages.push(text);
  let changes = 0; world.onChange = () => changes++;
  world.update(.01);
  assert.equal(save.floor, 4, '한 층 내려간다');
  assert.equal(save.floorKills, 0, '킬 카운트 초기화');
  assert.equal(world.enemies.length, 0, '필드 정리');
  assert.equal(world.chaseTarget, undefined); assert.equal(world.pursuing, false);
  assert.equal(world.bossPending, false); assert.equal(world.elitePending, false);
  assert.equal(world.spawnTimer, .2, '곧 다시 채운다');
  assert.equal(world.drops.length, 1, '바닥 드랍은 그대로');
  assert.deepEqual(messages, ['적이 너무 많아 4층으로 내려갑니다.']);
  assert.equal(changes, 1, '화면 갱신');
  // ② 1층에서는 더 내려갈 층이 없어 1층 유지 — 정리도 하지 않고 30마리 상한만 지킨다.
  const bottom = freshSave(); bottom.tutorial = 1; bottom.floor = 1; bottom.maxFloor = 1; bottom.floorKills = 0;
  const low = new World(bottom);
  low.enemies = Array.from({ length: MOB_CAP }, (_, i) => mob(i));
  low.spawnTimer = 0;
  low.update(.01);
  assert.equal(bottom.floor, 1, '1층 유지');
  assert.equal(low.enemies.length, MOB_CAP, '31마리로 늘지 않는다');
  // ③ 상한 아래(29마리)에서는 그대로 사냥이 이어진다 — 30마리가 된 순간 내려간다.
  const field = freshSave(); field.tutorial = 1; field.floor = 3; field.maxFloor = 3;
  const hunt = new World(field);
  hunt.enemies = Array.from({ length: MOB_CAP - 2 }, (_, i) => mob(i));
  hunt.spawnTimer = .01;
  hunt.update(.05);
  assert.equal(hunt.enemies.length, MOB_CAP - 1, '29마리까지는 채운다');
  assert.equal(field.floor, 3, '29마리로는 내려가지 않는다');
});
