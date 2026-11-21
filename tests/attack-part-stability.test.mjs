import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

/**
 * [작업 250] 공격 파츠 안정화 — ① 사격·공격 프레임에서 무기 파츠가 본체와 같은 배율로 줄어드는지,
 * ② 직업을 바꿨을 때 이전 직업의 파츠(활·지팡이·모자)가 화면에 남지 않는지, ③ 캐릭터 전환에서
 * 뷰의 파츠·발광·잔상이 비워지는지.
 *
 * 사용자 제보: `#21151` "전직업 공격할때 … 파츠별로 분리되는현상", `#21206` "전사인데 다른캐릭도
 * 보이고 활도 떠다니고".
 */
const { bowPlacement, bowPose, bowIndexFor } = await import('../src/game/render/bows.ts');
const { staffPlacement, staffPose } = await import('../src/game/render/staffs.ts');
const { weaponPose } = await import('../src/game/render/weapons.ts');
const { archerHelmPlacement } = await import('../src/game/render/archerHelmets.ts');
const { mageHelmPlacement } = await import('../src/game/render/mageHelmets.ts');
const { drawHero, resetHeroLayers } = await import('../src/game/render/entities.ts');
const { GameView } = await import('../src/game/render.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems, bowBases, staffBases } = await import('../src/game/items.ts');

function texture() {
  const canvas = {
    width: 362, height: 362,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
  };
  return new Texture({ source: new (Object.getPrototypeOf(Texture.EMPTY.source).constructor)({ resource: canvas }) });
}

/** `drawHero` 가 쓰는 만큼만 갖춘 뷰(직업 전환·파츠 숨김 검사용). */
function view() {
  const layer = new Container();
  const hero = new Sprite(texture());
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const frames = n => Array.from({ length: n }, () => texture());
  const t = () => texture();
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined, heroWeapon: undefined, heroBow: undefined,
    heroStaff: undefined, heroMageHelm: undefined, heroGlow: new Map(), heroGlowMask: undefined,
    ghosts: new Container(), afterimages: [], crushTrails: new Map(),
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0, heroSwitchEpoch: 0,
    textures: { pilotMale: t(), pilotFemale: t(), archerMale: t(), archerFemale: t(), mageMale: t(), mageFemale: t() },
    animations: {
      pilotMaleWalk: frames(8), pilotFemaleWalk: frames(8),
      pilotMaleAttack: frames(4), pilotFemaleAttack: frames(4),
      archerMaleWalk: frames(8), archerFemaleWalk: frames(8),
      archerMaleAttack: frames(4), archerFemaleAttack: frames(4),
      mageMaleWalk: frames(8), mageFemaleWalk: frames(8),
      mageMaleAttack: frames(4), mageFemaleAttack: frames(4)
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1,
    bowSheets: new Map(), bowLoading: new Set(), bowTierOrder: [], lastBowTier: -1,
    staffSheets: new Map(), staffLoading: new Set(), staffTierOrder: [], lastStaffTier: -1,
    robeTierOrder: [], lastRobeTier: '',
    lastArcherHelm: -1, lastArcherHelmBow: '', lastMageHelm: -1, lastMageHelmStaff: '',
    lastArcherArmorTier: '', archerArmorOrder: []
  };
  for (const name of ['armorFrame', 'bodySheetFrame', 'swordlessBodyFrame', 'bowBodyFrame', 'archerHeadlessFrame',
    'mageHeadlessFrame', 'staffBodyFrame', 'robeFrame', 'archerArmorFrame', 'weaponPart', 'bowPart', 'staffPart']) {
    if (typeof GameView.prototype[name] === 'function') game[name] = GameView.prototype[name].bind(game);
  }
  for (const name of ['loadArmorSheet', 'loadWeaponPart', 'loadBowPart', 'loadStaffPart', 'prefetchBody',
    'prefetchWeapon', 'prefetchBow', 'prefetchStaff', 'prefetchArcherHeadless', 'prefetchMageHeadless',
    'prefetchRobe', 'prefetchArcherArmor']) {
    if (typeof GameView.prototype[name] === 'function') game[name] = () => {};
  }
  return game;
}

function worldOf(save) {
  return {
    save,
    switchEpoch: 0,
    player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 },
    activeMove: { x: 0, y: 0 }, attackPose: 0, effects: []
  };
}

function saveWith(job, gender, equipment = {}) {
  const save = freshSave(gender, job);
  save.knockback = undefined;
  Object.assign(save.equipment, equipment);
  return save;
}

const item = (slot, name, extra = {}) => ({ id: `${slot}:${name}`, slot, name, rarity: 'rare', stats: {}, ...extra });

test('활 파츠는 사격·걷기 프레임에서 본체와 같은 배율로 줄고 그립 점은 그대로다', () => {
  for (const gender of ['male', 'female']) {
    assert.deepEqual(bowPlacement(gender, 'idle', 0), { ...bowPose(gender, 'idle', 0), scale: 1 }, '서기는 파츠 PNG 그대로');
    for (const motion of ['walk', 'attack']) {
      for (let frame = 0; frame < 4; frame++) {
        const place = bowPlacement(gender, motion, frame);
        const pose = bowPose(gender, motion, frame);
        // 그립 점은 배율과 무관하게 같은 좌표(앵커라 손에서 미끄러지지 않는다).
        assert.equal(place.x, pose.x);
        assert.equal(place.y, pose.y);
        assert.equal(place.rot, pose.rot);
        // 배율의 단일 기준은 궁수 투구 정합이 잰 본체 아트 배율이다.
        assert.equal(place.scale, archerHelmPlacement(gender, motion, frame).scale,
          `${gender} ${motion}${frame} 활 배율이 본체 배율과 다릅니다`);
        assert(place.scale < .99, `${gender} ${motion}${frame} 활이 축소되지 않았습니다`);
      }
    }
    // 사격은 서기의 0.66~0.72배로 그려진 판이라 배율이 1에 가까우면 활만 40% 커진다.
    assert(bowPlacement(gender, 'attack', 0).scale <= .75, `${gender} 사격 활 배율`);
    assert(bowPlacement(gender, 'walk', 0).scale > bowPlacement(gender, 'attack', 0).scale, '걷기가 사격보다 크다');
    // 프레임은 4로 접힌다.
    assert.deepEqual(bowPlacement(gender, 'attack', 4), bowPlacement(gender, 'attack', 0));
  }
});

test('지팡이 파츠도 자세별 본체 배율을 따르고 서기 참조값은 그대로다', () => {
  for (const gender of ['male', 'female']) {
    const idleRef = gender === 'male' ? .83525 : 1;
    assert.equal(staffPlacement(gender, 'idle', 0).scale, idleRef, '서기 배율(작업 204 본체 재굽기 보정)은 유지');
    assert.equal(staffPlacement(gender, 'idle', 0).x, staffPose(gender, 'idle', 0).x);
    for (const motion of ['walk', 'attack']) {
      for (let frame = 0; frame < 4; frame++) {
        const place = staffPlacement(gender, motion, frame);
        const helm = mageHelmPlacement(gender, motion, frame).scale;
        assert(Math.abs(place.scale - idleRef * helm) < 1e-9,
          `${gender} ${motion}${frame} 지팡이 배율 ${place.scale} (기대 ${idleRef * helm})`);
        assert(place.scale > .7 && place.scale < 1.01, `${gender} ${motion}${frame} 지팡이 배율 범위`);
      }
    }
  }
});

test('전사 검 파츠는 배율을 갖지 않는다(공격 시트도 서기와 같은 아트 배율)', () => {
  for (const gender of ['male', 'female']) {
    for (const motion of ['idle', 'walk', 'attack']) {
      for (let frame = 0; frame < 4; frame++) {
        assert.equal('scale' in weaponPose(gender, motion, frame), false);
      }
    }
  }
});

test('전사로 그릴 때 이전 직업의 활·지팡이·마법사 모자가 숨는다', () => {
  const game = view();
  const planted = [new Sprite(texture()), new Sprite(texture()), new Sprite(texture())];
  for (const sprite of planted) { sprite.visible = true; game.heroLayer.addChild(sprite); }
  [game.heroBow, game.heroStaff, game.heroMageHelm] = planted;
  const running = worldOf(saveWith('warrior', 'male', { weapon: item('weapon', '기사의 대검') }));
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.heroBow.visible, false, '전사인데 이전 캐릭터의 활이 남아 있습니다');
  assert.equal(game.heroStaff.visible, false, '전사인데 이전 캐릭터의 지팡이가 남아 있습니다');
  assert.equal(game.heroMageHelm.visible, false, '전사인데 이전 캐릭터의 마법사 모자가 남아 있습니다');
});

test('궁수·마법사로 그릴 때 다른 직업의 파츠가 숨는다', () => {
  const archer = view();
  const archerStaff = new Sprite(texture()); archerStaff.visible = true;
  const archerHat = new Sprite(texture()); archerHat.visible = true;
  archer.heroLayer.addChild(archerStaff, archerHat);
  archer.heroStaff = archerStaff; archer.heroMageHelm = archerHat;
  drawHero.call(archer, worldOf(saveWith('archer', 'male', { weapon: item('weapon', bowBases[0]) })), 100, 100, 0);
  assert.equal(archer.heroStaff.visible, false, '궁수인데 지팡이가 남아 있습니다');
  assert.equal(archer.heroMageHelm.visible, false, '궁수인데 마법사 모자가 남아 있습니다');

  const mage = view();
  const mageHelmet = new Sprite(texture()); mageHelmet.visible = true;
  const mageSword = new Sprite(texture()); mageSword.visible = true;
  const mageBow = new Sprite(texture()); mageBow.visible = true;
  mage.heroLayer.addChild(mageHelmet, mageSword, mageBow);
  mage.heroHelmet = mageHelmet; mage.heroWeapon = mageSword; mage.heroBow = mageBow;
  drawHero.call(mage, worldOf(saveWith('mage', 'female', { weapon: item('weapon', staffBases[0]) })), 100, 100, 0);
  assert.equal(mage.heroHelmet.visible, false, '마법사인데 전사·궁수 투구 파츠가 남아 있습니다');
  assert.equal(mage.heroWeapon.visible, false, '마법사인데 검 파츠가 남아 있습니다');
  assert.equal(mage.heroBow.visible, false, '마법사인데 활이 남아 있습니다');
});

test('캐릭터 전환은 뷰의 파츠·발광·잔상을 비운다', () => {
  const game = view();
  const bow = new Sprite(texture()); bow.visible = true;
  game.heroLayer.addChild(bow); game.heroBow = bow;
  game.afterimages.push({ sprites: [], x: 0, y: 0, age: 0, duration: .2 });
  game.ghosts.addChild(new Sprite(texture()));
  game.heroGear.set('weapon', { path: 'x', sprite: new Sprite(texture()) });
  game.heroGlow.set('weapon', [new Sprite(texture())]);

  resetHeroLayers(game);

  assert.equal(game.heroBow, undefined, '활 스프라이트를 버린다');
  assert.equal(bow.destroyed, true, '활 스프라이트를 파괴한다');
  assert.equal(bow.parent, null, '레이어에서 뺀다');
  assert.equal(game.afterimages.length, 0);
  assert.equal(game.ghosts.children.length, 0);
  assert.equal(game.heroGear.size, 0);
  assert.equal(game.heroGlow.size, 0);
  assert.equal(game.lastWeaponTier, -1, '미리 받기 기억을 비운다');

  // 세대가 바뀌면 drawHero가 먼저 비운다(전환 응답으로 세이브만 갈아탄 경우).
  const world = new World(saveWith('archer', 'male'));
  const before = world.switchEpoch;
  world.adoptSave(saveWith('warrior', 'female'));
  assert.equal(world.switchEpoch, before + 1, 'adoptSave가 전환 세대를 올린다');
  const view2 = view();
  const stale = new Sprite(texture()); stale.visible = true;
  view2.heroLayer.addChild(stale); view2.heroStaff = stale;
  drawHero.call(view2, world, 100, 100, 0);
  assert.equal(stale.destroyed, true, '전환 세대가 바뀌면 이전 파츠를 파괴한다');
  assert.equal(view2.heroSwitchEpoch, world.switchEpoch);
});
