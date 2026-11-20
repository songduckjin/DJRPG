import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const { skills, skillOrder, skillRange } = await import('../src/game/skills.ts');
const { skillMotionTemplate, resolveSkillMotion } = await import('../src/game/costume/skillMotion.ts');
const { costumeMotionFrames } = await import('../src/game/render/heroMotion.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const enemy = (x, y) => ({ x, y, hp: 1e9, maxHp: 1e9, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });

test('회전참격 — 이름·설명·위력은 360° 회전 베기, ID·레벨·쿨다운은 그대로다', () => {
  const hell = skills.hell;
  assert.equal(hell.id, 'hell', '기존 세이브 호환을 위해 스킬 ID는 유지한다');
  assert.equal(hell.name, '회전참격');
  assert.equal(hell.level, 14, '작업 212에서 전사 스킬 해금 레벨이 앞당겨졌다');
  assert.equal(hell.cooldown, 16);
  assert.equal(skillRange('hell', 1), 185);
  assert.match(hell.description, /360/);
  assert.match(hell.description, /회전/);
  assert.match(hell.description, /사방|주변/);
  assert.match(hell.power, /360/);
  assert.match(hell.power, /3\.2/);
  // 옛 이름이 남아 있으면 스킬 목록·HUD·문서가 서로 다른 이름을 보여 준다.
  for (const path of ['src/game/skills.ts', 'src/ui/hud.ts', 'src/game/costume/skillMotion.ts', 'src/game/render/vfx.ts']) {
    assert.ok(!/헬\s?파이어/.test(source(path)), `${path}에 옛 이름이 남아 있다`);
  }
});

test('스킬 순서에는 hell 자리가 그대로 있고 8종이 중복 없이 남는다', () => {
  assert.equal(skillOrder.length, 8);
  assert.equal(new Set(skillOrder).size, 8);
  assert(skillOrder.includes('hell'));
  assert.deepEqual(Object.keys(skills).filter(id => skillOrder.includes(id)).length, 8);
});

test('회전참격은 발동 자세가 아니라 회전(spin) 모션 템플릿을 쓴다', () => {
  assert.equal(skillMotionTemplate('hell'), 'spin');
  assert.deepEqual(resolveSkillMotion('hell'), { motion: 'spin', skillId: 'hell', template: 'spin' });
  assert.equal(costumeMotionFrames.spin, 6, '코스튬 아틀라스의 회전 템플릿 프레임 수');
  assert.equal(skillMotionTemplate('warcry'), 'cast', '블러드 레이지는 종전대로 발동 자세');
});

test('시전하면 사방(360°)의 적을 모두 때리고 사거리 밖은 건드리지 않는다', () => {
  const save = freshSave();
  save.learned = ['hell'];
  save.quickSlots = ['hell', null, null];
  const world = new World(save);
  world.enemies = [enemy(150, 0), enemy(-150, 0), enemy(0, 150), enemy(0, -150), enemy(420, 0)];
  world.action('hell');
  const effect = world.effects.find(entry => entry.kind === 'hell');
  assert(effect, '회전참격 이펙트가 생기지 않았다');
  assert.equal(effect.angle, 0);
  for (const hit of world.enemies.slice(0, 4)) assert(hit.hp < 1e9, '사방의 적이 맞지 않았다');
  assert.equal(world.enemies[4].hp, 1e9, '사거리 밖의 적이 맞았다');
});

test('이펙트는 새 혈풍 회오리 텍스처를 쓰고 옛 불기둥(fx_hell_fire)은 쓰지 않는다', () => {
  const render = source('src/game/render.ts');
  const vfx = source('src/game/render/vfx.ts');
  assert.match(render, /fxWhirl: '\/assets\/fx_whirl_slash_ring\.png'/);
  assert.match(vfx, /export function drawWhirlSlash/);
  assert.match(vfx, /effect\.kind === 'hell'\) \{ drawWhirlSlash\.call/);
  assert.ok(!/fxHell/.test(vfx), '옛 불기둥 아트가 회전참격에 남아 있다');
  // 지면 회오리는 눌린 컨테이너 안에서 돌려야 바닥 원근이 유지된다(스프라이트를 직접 돌리면 기운다).
  assert.match(vfx, /floor\.scale\.set\(1, \.52\)/);
  assert.match(vfx, /outer\.rotation = -\.6 - effect\.age \* 7\.4/);
  assert.match(vfx, /inner\.rotation = effect\.age \* 10\.5/);
  const path = new URL('../public/assets/fx_whirl_slash_ring.png', import.meta.url);
  assert.ok(existsSync(path), '혈풍 회오리 에셋이 없다');
  const data = readFileSync(path), header = data.subarray(0, 26);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  assert.equal(header.readUInt32BE(16), 512);
  assert.equal(header.readUInt32BE(20), 512);
  assert.ok(data.length <= 200 * 1024, `에셋이 부팅 프리로드에 크다: ${data.length}B`);
});

/** 폴백 바디 경로(`hero-weapon-render`·`costume-field-render`와 같은 최소 구성). */
function fakeView() {
  const layer = new Container(), hero = new Sprite(Texture.EMPTY);
  layer.addChild(hero);
  return {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: new Proxy({}, { get: () => Texture.EMPTY }), animations: new Proxy({}, { get: () => Array(8).fill(Texture.EMPTY) }),
    app: { screen: { height: 800 } },
    ground: { ellipse() { return { fill() {} }; } },
    glow: { circle() { return { fill() {} }; } },
    armorFrame: () => undefined, prefetchBody: () => {}, lastBodyTier: '',
    swordlessBodyFrame: () => undefined, weaponPart: () => undefined, prefetchWeapon: () => {}, lastWeaponTier: 0, heroWeapon: undefined
  };
}

test('시전 중 히어로는 제자리에서 한 바퀴 돈다 — 가로 배율이 cos로 줄었다가 뒤집혀 돌아온다', () => {
  const save = freshSave('male');
  save.learned = ['hell'];
  save.quickSlots = ['hell', null, null];
  const player = { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 1 };
  const world = { save, player, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
  const view = fakeView();
  drawHero.call(view, world, 100, 100, 0);
  const resting = Math.abs(view.heroLayer.scale.x);
  assert(resting > 0);

  // 한 바퀴(.46초)의 1/4 지점에는 몸이 옆으로 서서 거의 사라진다.
  world.effects.push({ x: 0, y: 0, kind: 'hell', age: .115, duration: 1.1, angle: 0, level: 1 });
  drawHero.call(view, world, 100, 100, .115);
  const edgeOn = Math.abs(view.heroLayer.scale.x);
  assert(edgeOn < resting * .2, `회전 중 몸이 줄지 않았다(${edgeOn} vs ${resting})`);

  // 반 바퀴 지점에는 뒤집힌 채(음수 배율) 돌고, 한 바퀴가 끝나면 원래대로 선다.
  world.effects[0].age = .23;
  drawHero.call(view, world, 100, 100, .23);
  assert(view.heroLayer.scale.x < 0, '뒤쪽을 향하는 구간이 뒤집히지 않았다');
  world.effects[0].age = .6;
  drawHero.call(view, world, 100, 100, .6);
  assert.equal(Math.sign(view.heroLayer.scale.x), 1);
  assert(Math.abs(view.heroLayer.scale.x - resting) < resting * .05, '한 바퀴 뒤 자세가 돌아오지 않았다');

  // 이펙트가 끝나면 회전 상태가 남지 않는다.
  world.effects.length = 0;
  drawHero.call(view, world, 100, 100, 1.4);
  assert(Math.abs(view.heroLayer.scale.x - resting) < resting * .05);
});
