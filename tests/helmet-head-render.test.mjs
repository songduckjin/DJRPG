import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { existsSync, readFileSync } from 'node:fs';
import './ts-loader.mjs';

const {
  helmetArtFor, helmetArtList, helmetArtPath, helmetArtPaths, helmetAttackArtList, helmetAttackArtPaths,
  helmetPlacement, helmetIdlePlacement, headlessBodyPaths
} = await import('../src/game/render/helmets.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItemIndex, baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentPortraitHelmet } = await import('../src/ui/equipmentPortrait.ts');
const { renderAssetPaths } = await import('../src/game/render.ts');

const helmetItem = name => ({ id: name, slot: 'helmet', name, rarity: 'common', stats: {} });
const fileOf = path => new URL(`../public${path}`, import.meta.url);

test('투구 10종 이름이 모두 기본형 인덱스 0~9 로 매핑된다', () => {
  assert.equal(baseItems.helmet.length, 10);
  baseItems.helmet.forEach((name, index) => {
    assert.equal(baseItemIndex(helmetItem(name)), index, name);
    assert.equal(baseItemIndex(helmetItem(`서리의 ${name}`)), index, `접두사가 붙은 ${name}`);
  });
  // 레거시 이름은 심연의 뿔투구(7번)로 취급한다.
  assert.equal(baseItemIndex(helmetItem('낡은 투구')), 7);
});

test('여성은 오픈페이스 0~2번만 여성용 시안을 쓰고 3~9번은 공용이다', () => {
  for (let index = 0; index <= 9; index++) {
    assert.equal(helmetArtFor('male', index), `helm_${index}`);
    assert.equal(helmetArtFor('female', index), index <= 2 ? `helm_female_${index}` : `helm_${index}`);
  }
  assert.equal(helmetArtFor('male', -1), undefined);
  assert.equal(helmetArtFor('male', 10), undefined);
  assert.equal(helmetArtFor('female', 1.5), undefined);
  assert.equal(new Set(helmetArtList).size, 13);
});

test('투구 머리 파츠 PNG 가 모두 존재하고 투명도를 가진다', () => {
  for (const art of helmetArtList) {
    const path = fileOf(helmetArtPaths[art]);
    assert(existsSync(path), `${art} 파일이 없습니다`);
    const data = readFileSync(path);
    assert.equal(data.toString('ascii', 1, 4), 'PNG', art);
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    assert(width >= 40 && width <= 140, `${art} 폭 ${width}`);
    assert(height >= 40 && height <= 140, `${art} 높이 ${height}`);
    const colorType = data[25];
    assert(colorType === 6 || (colorType === 3 && data.includes('tRNS')), `${art} 알파 채널`);
  }
});

test('투구 파츠는 부팅 때 함께 프리로드된다', () => {
  for (const art of helmetArtList) assert(renderAssetPaths.includes(helmetArtPaths[art]), art);
  assert.equal(new Set(renderAssetPaths).size, renderAssetPaths.length, '중복 경로가 없어야 한다');
});

test('공격 3/4 투구 파츠 80장이 성별·인덱스·프레임마다 존재한다', () => {
  assert.equal(helmetAttackArtList.length, 80);
  assert.equal(new Set(helmetAttackArtList).size, 80);
  for (const gender of ['male', 'female']) {
    for (let index = 0; index <= 9; index++) {
      for (let frame = 0; frame < 4; frame++) {
        const art = helmetArtFor(gender, index, 'attack', frame);
        assert.equal(art, `atk_${gender}_${index}_f${frame}`);
        const path = helmetArtPath(art);
        assert(path.includes(`/helmets/atk/${gender}_${index}_f${frame}.png`), path);
        assert(renderAssetPaths.includes(path), `${art} 프리로드 누락`);
        const file = fileOf(path);
        assert(existsSync(file), `${art} 파일이 없습니다`);
        const data = readFileSync(file);
        assert.equal(data.toString('ascii', 1, 4), 'PNG', art);
        const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
        assert(width >= 40 && width <= 170, `${art} 폭 ${width}`);
        assert(height >= 40 && height <= 170, `${art} 높이 ${height}`);
        assert(data[25] === 6 || data[25] === 3, `${art} 알파 채널`);
      }
    }
  }
  // 서기·걷기는 정면 파츠를 그대로 쓰고, 프레임은 4로 접힌다.
  assert.equal(helmetArtFor('male', 6, 'idle'), 'helm_6');
  assert.equal(helmetArtFor('male', 6, 'walk', 3), 'helm_6');
  assert.equal(helmetArtFor('female', 1, 'idle'), 'helm_female_1');
  assert.equal(helmetArtFor('female', 1, 'attack', 2), 'atk_female_1_f2');
  assert.equal(helmetArtFor('male', 6, 'attack', 5), 'atk_male_6_f1');
  assert.equal(helmetArtFor('male', 6, 'attack', -1), 'atk_male_6_f3');
  assert.equal(helmetArtFor('male', 10, 'attack', 0), undefined);
  assert.equal(new Set(renderAssetPaths).size, renderAssetPaths.length, '중복 경로가 없어야 한다');
});

test('프레임 앵커는 성별·동작·프레임마다 유한한 값을 준다', () => {
  for (const gender of ['male', 'female']) {
    for (const motion of ['idle', 'walk', 'attack']) {
      const idles = [0, 1, 2, 3, 4, 5, 6, 7].map(frame => helmetPlacement(gender, motion, frame));
      for (const place of idles) {
        assert(Number.isFinite(place.x) && Number.isFinite(place.y), `${gender} ${motion}`);
        assert(place.scale > .5 && place.scale <= 1.2, `${gender} ${motion} 배율 ${place.scale}`);
        assert(place.x > 120 && place.x < 300, `${gender} ${motion} x ${place.x}`);
        // 공격 3/4 파츠는 고개를 숙인 프레임에서 크롭 아래가 목·칼라까지 내려간다(작업 154).
        assert(place.y > 60 && place.y < 260, `${gender} ${motion} y ${place.y}`);
      }
      // 걷기는 4포즈를 8프레임으로 반복 재생한다.
      if (motion === 'walk') assert.deepEqual(helmetPlacement(gender, motion, 4), helmetPlacement(gender, motion, 0));
      const idle = helmetPlacement(gender, 'idle', 3);
      assert.deepEqual(idle, helmetIdlePlacement(gender));
    }
  }
});

test('공격 4프레임은 3/4 옆모습 파츠를 회전·숙임 없이 배치한다', () => {
  for (const gender of ['male', 'female']) {
    for (let index = 0; index <= 9; index++) {
      const frames = [0, 1, 2, 3].map(frame => helmetPlacement(gender, 'attack', frame, index));
      for (const [frame, place] of frames.entries()) {
        assert(Number.isFinite(place.x) && Number.isFinite(place.y), `${gender} ${index} ${frame}`);
        assert.equal(place.scale, 1, `${gender} ${index} ${frame} 배율`);
        assert.equal(place.scaleY, 1, `${gender} ${index} ${frame} 세로 배율`);
        assert.equal(place.rotation, 0, `${gender} ${index} ${frame} 회전`);
        assert(place.x > 120 && place.x < 300, `${gender} ${index} ${frame} x ${place.x}`);
        assert(place.y > 60 && place.y < 260, `${gender} ${index} ${frame} y ${place.y}`);
      }
      // 고개를 숙이는 3·4프레임은 그림 자체가 아래로 내려가 있다(정면 파츠를 얹던 153 이전 값보다 낮다).
      assert(frames[3].y > frames[0].y + 20, `${gender} ${index} 4프레임 숙임`);
    }
    // 크롭이 투구마다 조금씩 달라도 목 밑동은 원본 자리에 그대로 선다 — 인덱스별 앵커가 필요하다.
    assert.notEqual(helmetPlacement(gender, 'attack', 3, 7).x, helmetPlacement(gender, 'attack', 3, 0).x);
  }
  // 프레임 번호는 4로 접힌다.
  assert.deepEqual(helmetPlacement('male', 'attack', 4, 2), helmetPlacement('male', 'attack', 0, 2));
  assert.deepEqual(helmetPlacement('male', 'attack', -1, 2), helmetPlacement('male', 'attack', 3, 2));
});

const texture = () => new Texture({ source: new TextureSource({ width: 362, height: 362 }) });

function view() {
  const layer = new Container();
  const hero = new Sprite(Texture.EMPTY);
  hero.anchor.set(.5, .97); // render.ts 와 같은 본체 앵커
  layer.addChild(hero);
  const helmetTextures = new Map([...Object.values(helmetArtPaths), ...Object.values(helmetAttackArtPaths)].map(path => [path, Texture.EMPTY]));
  return {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures, heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: {
      pilotMale: texture(), pilotFemale: texture(),
      pilotMaleHeadless: texture(), pilotFemaleHeadless: texture()
    },
    animations: {
      pilotMaleWalk: Array.from({ length: 8 }, texture),
      pilotFemaleWalk: Array.from({ length: 8 }, texture),
      pilotMaleAttack: Array.from({ length: 4 }, texture),
      pilotFemaleAttack: Array.from({ length: 4 }, texture),
      pilotMaleWalkHeadless: Array.from({ length: 8 }, texture),
      pilotFemaleWalkHeadless: Array.from({ length: 8 }, texture),
      pilotMaleAttackHeadless: Array.from({ length: 4 }, texture),
      pilotFemaleAttackHeadless: Array.from({ length: 4 }, texture)
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    // 작업 156: 무기는 0번(기본 검)이라 파츠를 그리지 않는다.
    armorFrame: () => undefined, prefetchBody: () => {}, lastBodyTier: '',
    swordlessBodyFrame: () => undefined, weaponPart: () => undefined, prefetchWeapon: () => {}, lastWeaponTier: 0, heroWeapon: undefined
  };
}

function world(save) {
  return { save, player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 }, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
}

test('투구를 착용하면 필드에 머리 파츠가 얹히고, 벗으면 숨는다', () => {
  const save = freshSave('male');
  const game = view();
  const walking = world(save);
  drawHero.call(game, walking, 100, 100, 0);
  assert.equal(game.heroHelmet, undefined, '투구가 없으면 그리지 않는다');

  save.equipment.helmet = helmetItem('용린 투구');
  drawHero.call(game, walking, 100, 100, .1);
  const sprite = game.heroHelmet;
  assert(sprite, '투구 스프라이트가 생긴다');
  assert.equal(sprite.texture, game.helmetTextures.get(helmetArtPaths.helm_6));
  assert.equal(sprite.alpha, 1);
  assert(sprite.visible);
  const idlePlace = helmetIdlePlacement('male');
  assert.equal(sprite.position.x, idlePlace.x - game.hero.texture.width * game.hero.anchor.x);
  assert.equal(sprite.position.y, idlePlace.y - game.hero.texture.height * game.hero.anchor.y);
  assert.equal(sprite.anchor.x, .5);
  assert.equal(sprite.anchor.y, 1, '아래 중앙(목 밑동) 앵커');
  assert.equal(sprite.scale.x, idlePlace.scale);
  assert.equal(sprite.tint, 0xffffff);

  // 피격 tint 는 본체와 같은 값을 쓴다.
  walking.player.hit = .2;
  drawHero.call(game, walking, 100, 100, .2);
  assert.equal(sprite.tint, 0xffd4cf);
  assert.equal(game.hero.tint, sprite.tint);

  // 걷기 프레임은 자기 앵커로 따라간다.
  walking.player.hit = 0;
  walking.activeMove.x = 1;
  walking.player.x = 1;
  drawHero.call(game, walking, 100, 100, .3);
  const walkPlace = helmetPlacement('male', 'walk', 0);
  assert.equal(sprite.position.x, walkPlace.x - game.hero.texture.width * game.hero.anchor.x);
  assert.equal(sprite.scale.x, walkPlace.scale);

  save.equipment.helmet = undefined;
  drawHero.call(game, walking, 100, 100, .4);
  assert.equal(sprite.visible, false, '투구를 벗으면 숨긴다');
  game.heroLayer.destroy({ children: true });
});

test('공격 프레임에서는 3/4 옆모습 투구 파츠로 바뀌고 서기로 돌아오면 정면 파츠로 돌아온다', () => {
  const save = freshSave('male');
  const game = view();
  const animated = world(save);
  save.equipment.helmet = helmetItem('기사 헬름');
  // attackPose .32 → 0프레임, .08 → 3프레임 (drawHero 의 프레임 계산과 같은 식)
  for (const [attackPose, frame] of [[.32, 0], [.24, 1], [.16, 2], [.08, 3]]) {
    animated.attackPose = attackPose;
    drawHero.call(game, animated, 100, 100, attackPose);
    const sprite = game.heroHelmet;
    const place = helmetPlacement('male', 'attack', frame, 3);
    assert(sprite, `공격 ${frame}프레임 투구 스프라이트`);
    assert.equal(sprite.texture, game.helmetTextures.get(helmetAttackArtPaths[`atk_male_3_f${frame}`]), `공격 ${frame}프레임 3/4 파츠`);
    assert.equal(sprite.rotation, 0, `공격 ${frame}프레임 회전 없음`);
    assert.equal(sprite.scale.x, 1, `공격 ${frame}프레임 가로 배율`);
    assert.equal(sprite.scale.y, 1, `공격 ${frame}프레임 세로 배율`);
    assert.equal(sprite.position.x, place.x - game.hero.texture.width * game.hero.anchor.x, `공격 ${frame}프레임 x`);
    assert.equal(sprite.position.y, place.y - game.hero.texture.height * game.hero.anchor.y, `공격 ${frame}프레임 y`);
  }
  // 서기로 돌아오면 정면 파츠·서기 앵커로 복귀한다.
  animated.attackPose = 0;
  drawHero.call(game, animated, 100, 100, 0);
  assert.equal(game.heroHelmet.texture, game.helmetTextures.get(helmetArtPaths.helm_3), '서기는 정면 파츠');
  assert.equal(game.heroHelmet.rotation, 0, '서기에서는 회전 없음');
  assert.equal(game.heroHelmet.scale.y, helmetIdlePlacement('male').scale, '서기 세로 배율');
  game.heroLayer.destroy({ children: true });
});

test('여성 전사는 오픈페이스 0~2번에서 여성용 시안을 쓴다', () => {
  const save = freshSave('female');
  const game = view();
  const idle = world(save);
  save.equipment.helmet = helmetItem('가죽 두건');
  drawHero.call(game, idle, 100, 100, 0);
  assert.equal(game.heroHelmet.texture, game.helmetTextures.get(helmetArtPaths.helm_female_0));
  save.equipment.helmet = helmetItem('기사 헬름');
  drawHero.call(game, idle, 100, 100, .1);
  assert.equal(game.heroHelmet.texture, game.helmetTextures.get(helmetArtPaths.helm_3), '3번은 남녀 공용');
  game.heroLayer.destroy({ children: true });
});

test('머리 없는 본체 시트 6장이 본체 시트와 같은 크기로 존재한다', () => {
  const pairs = [
    ['male', 'idle'], ['male', 'walk'], ['male', 'attack'],
    ['female', 'idle'], ['female', 'walk'], ['female', 'attack']
  ];
  for (const [gender, motion] of pairs) {
    const path = headlessBodyPaths[gender][motion];
    assert(path.includes(`/headless/warrior_${gender}_${motion}_v1.png`), path);
    const file = fileOf(path);
    assert(existsSync(file), `${path} 파일이 없습니다`);
    const data = readFileSync(file);
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    const source = readFileSync(fileOf(`/assets/pilot-25d/warrior_${gender}_${motion}_v1.png`));
    assert.equal(width, source.readUInt32BE(16), `${gender} ${motion} 폭`);
    assert.equal(height, source.readUInt32BE(20), `${gender} ${motion} 높이`);
    assert(data[25] === 6 || data[25] === 3, `${path} 알파 채널`);
    assert(renderAssetPaths.includes(path), `${path} 프리로드 누락`);
  }
});

test('투구를 쓰면 머리 없는 본체로 갈아 끼우고 벗으면 원래 본체로 돌아온다', () => {
  const save = freshSave('male');
  const game = view();
  const idle = world(save);
  drawHero.call(game, idle, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.pilotMale, '맨얼굴일 때는 머리 있는 본체');

  save.equipment.helmet = helmetItem('기사 헬름');
  drawHero.call(game, idle, 100, 100, .1);
  assert.equal(game.hero.texture, game.textures.pilotMaleHeadless, '투구를 쓰면 머리 없는 본체');

  // 걷기 프레임도 머리 없는 걷기 시트를 같은 프레임 번호로 쓴다.
  idle.activeMove.x = 1; idle.player.x = 1;
  drawHero.call(game, idle, 100, 100, .2);
  const walkIndex = Math.floor(game.heroWalkDistance / 12) % 8;
  assert.equal(game.hero.texture, game.animations.pilotMaleWalkHeadless[walkIndex]);

  save.equipment.helmet = undefined;
  drawHero.call(game, idle, 100, 100, .3);
  assert.equal(game.hero.texture, game.animations.pilotMaleWalk[walkIndex], '벗으면 원래 걷기 시트');
  game.heroLayer.destroy({ children: true });
});

test('여성 투구도 머리 없는 여성 본체를 쓴다', () => {
  const save = freshSave('female');
  const game = view();
  const idle = world(save);
  save.equipment.helmet = helmetItem('가죽 두건');
  drawHero.call(game, idle, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.pilotFemaleHeadless);
  idle.attackPose = .3;
  drawHero.call(game, idle, 100, 100, .5);
  assert(game.animations.pilotFemaleAttackHeadless.includes(game.hero.texture), '공격 프레임도 머리 없는 시트');
  game.heroLayer.destroy({ children: true });
});

test('장비창 초상화는 착용 투구를 키와 합성 계획에 담는다', () => {
  const save = freshSave('female');
  const bare = equipmentPortraitPlan(save);
  assert.equal(bare.helmet, undefined);
  assert.equal(bare.key, 'pilot:female:a-1:-:-', '갑옷·투구·검 파츠가 모두 없음');

  save.equipment.helmet = helmetItem('사슬 코이프');
  const withHelmet = equipmentPortraitPlan(save);
  assert(withHelmet.helmet, '합성 계획에 투구가 들어간다');
  assert(withHelmet.base.includes('/headless/'), '투구를 쓰면 머리 없는 본체 위에 합성한다');
  assert(!bare.base.includes('/headless/'), '맨얼굴은 머리 있는 본체');
  assert.equal(withHelmet.helmet.path, helmetArtPaths.helm_female_2);
  assert.equal(withHelmet.helmet.x, helmetIdlePlacement('female').x);
  assert.equal(withHelmet.helmet.y, helmetIdlePlacement('female').y);
  assert.notEqual(withHelmet.key, bare.key, '투구가 바뀌면 초상화 캐시 키도 바뀐다');
  assert(withHelmet.key.includes(helmetArtPaths.helm_female_2));

  save.equipment.helmet = helmetItem('불멸의 왕관');
  assert.equal(equipmentPortraitHelmet(save).path, helmetArtPaths.helm_9);
  assert.notEqual(equipmentPortraitPlan(save).key, withHelmet.key);

  save.equipment.helmet = undefined;
  assert.equal(equipmentPortraitHelmet(save), undefined);
});
