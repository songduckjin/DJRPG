import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture } from 'pixi.js';
import { existsSync, readFileSync } from 'node:fs';
import './ts-loader.mjs';

const { helmetArtFor, helmetArtList, helmetArtPaths, helmetPlacement, helmetIdlePlacement } = await import('../src/game/render/helmets.ts');
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

test('프레임 앵커는 성별·동작·프레임마다 유한한 값을 준다', () => {
  for (const gender of ['male', 'female']) {
    for (const motion of ['idle', 'walk', 'attack']) {
      const idles = [0, 1, 2, 3, 4, 5, 6, 7].map(frame => helmetPlacement(gender, motion, frame));
      for (const place of idles) {
        assert(Number.isFinite(place.x) && Number.isFinite(place.y), `${gender} ${motion}`);
        assert(place.scale > .5 && place.scale <= 1.2, `${gender} ${motion} 배율 ${place.scale}`);
        assert(place.x > 120 && place.x < 300, `${gender} ${motion} x ${place.x}`);
        assert(place.y > 60 && place.y < 200, `${gender} ${motion} y ${place.y}`);
      }
      // 걷기는 4포즈를 8프레임으로 반복 재생한다.
      if (motion === 'walk') assert.deepEqual(helmetPlacement(gender, motion, 4), helmetPlacement(gender, motion, 0));
      const idle = helmetPlacement(gender, 'idle', 3);
      assert.deepEqual(idle, helmetIdlePlacement(gender));
    }
  }
});

function view() {
  const layer = new Container();
  const hero = new Sprite(Texture.EMPTY);
  hero.anchor.set(.5, .97); // render.ts 와 같은 본체 앵커
  layer.addChild(hero);
  const helmetTextures = new Map(Object.values(helmetArtPaths).map(path => [path, Texture.EMPTY]));
  return {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures, heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { pilotMale: Texture.EMPTY, pilotFemale: Texture.EMPTY },
    animations: {
      pilotMaleWalk: Array.from({ length: 8 }, () => Texture.EMPTY),
      pilotFemaleWalk: Array.from({ length: 8 }, () => Texture.EMPTY),
      pilotMaleAttack: Array.from({ length: 4 }, () => Texture.EMPTY),
      pilotFemaleAttack: Array.from({ length: 4 }, () => Texture.EMPTY)
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) }
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

test('장비창 초상화는 착용 투구를 키와 합성 계획에 담는다', () => {
  const save = freshSave('female');
  const bare = equipmentPortraitPlan(save);
  assert.equal(bare.helmet, undefined);
  assert.equal(bare.key, 'pilot:female:-');

  save.equipment.helmet = helmetItem('사슬 코이프');
  const withHelmet = equipmentPortraitPlan(save);
  assert(withHelmet.helmet, '합성 계획에 투구가 들어간다');
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
