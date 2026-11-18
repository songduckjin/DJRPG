import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const {
  COSTUME_MANIFEST_SCHEMA_VERSION, costumeAtlasUrl, costumeManifestUrl
} = await import('../src/game/costume/manifest.ts');
const {
  costumeMotionTemplates, resolveSkillMotion, skillMotionTemplates
} = await import('../src/game/costume/skillMotion.ts');
const {
  costumeFrameIndex, costumeFramesPerPart, costumeMotionFrames, costumeMotionOrder, costumeMotionSlot,
  costumePlaybackRate, heroCostumeMotion
} = await import('../src/game/render/heroMotion.ts');
const {
  applyCostumeHeroRuntime, costumeAtlasPageName, costumeBodyParts, costumeGhostSources, costumeLayerAnchor,
  costumeLayerCell, costumeLayerPageIndex, createCostumeHeroState, hideCostumeHero,
  planHeroCostume, renderCostumeHero, costumeAtlasCellsPerPage, costumeVariantsPerPage
} = await import('../src/game/render/costumeHero.ts');
const { drawHero, updateAfterimages } = await import('../src/game/render/entities.ts');

const item = (slot, name) => ({ id: slot, slot, name, rarity: 'common', stats: {} });

/**
 * 장비 부위별 코스튬 매니페스트. 본체 파츠(torso·arms·legs)는 매니페스트 항목이 아니라
 * `atlas/body-<gender>.png`의 고정 3변형이다(§4·§6.2).
 */
const manifest = {
  schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION,
  costumes: [
    { costumeId: 'boots-t4', slot: 'boots', animMode: 'attach', anchor: { x: 0, y: 0 } },
    { costumeId: 'armor-t2', slot: 'armor', animMode: 'frames', anchor: { x: .5, y: .9 }, fit: { x: 4, y: -6, scaleX: 1.1, scaleY: 1.2, rotation: .1 } },
    { costumeId: 'armor-t3', slot: 'armor', animMode: 'frames', anchor: { x: .5, y: .9 } },
    { costumeId: 'helmet-t1', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 }, zOrder: 33 },
    { costumeId: 'gloves-t3', slot: 'gloves', animMode: 'attach', anchor: { x: 0, y: 0 } },
    { costumeId: 'weapon-t0', slot: 'weapon', animMode: 'attach', anchor: { x: 0, y: 0 } },
    { costumeId: 'offhand-t1', slot: 'offhand', animMode: 'attach', anchor: { x: 0, y: 0 } }
  ]
};
const loadOk = { ok: true, manifest, url: costumeManifestUrl(), fallback: false, reason: 'none' };
const pageTexture = () => new Texture({ source: new TextureSource({ width: 2048, height: 2048 }) });

/** 계획에 나오는 페이지를 모두 채운 텍스처 표. */
function atlasFor(save) {
  const plan = planHeroCostume(save, loadOk);
  assert.equal(plan.ok, true);
  const textures = new Map();
  for (const layer of plan.layers) {
    const url = costumeAtlasUrl(costumeAtlasPageName(layer.page, costumeLayerPageIndex(layer)));
    if (!textures.has(url)) textures.set(url, pageTexture());
  }
  return textures;
}

function fullEquipment(save) {
  save.equipment = {
    weapon: item('weapon', '두손검'), helmet: item('helmet', '철제 바시넷'), armor: item('armor', '사슬 갑옷'),
    gloves: item('gloves', '강철 건틀릿'), boots: item('boots', '기사의 사바톤'), offhand: item('offhand', '강철 문장'),
    necklace: item('necklace', '은빛 로켓'), belt: item('belt', '가죽 벨트'), ring1: item('ring1', '은 반지')
  };
  return save;
}

test('스킬 8종은 4대 템플릿으로, 기본 공격은 attack 모션으로 해석된다', () => {
  for (const [skillId, template] of Object.entries(skillMotionTemplates)) {
    const resolved = resolveSkillMotion(skillId);
    assert.equal(resolved.motion, template);
    assert.equal(resolved.skillId, skillId);
    assert.equal(resolved.template, template);
    assert(costumeMotionTemplates.includes(template));
  }
  assert.deepEqual(resolveSkillMotion('slash'), { motion: 'attack', skillId: null, template: null });
  assert.equal(resolveSkillMotion('hit'), null);
  assert.equal(resolveSkillMotion('death'), null);
});

test('대기·걷기 8프레임·기본 공격·스킬 4종이 모션 표 하나로 연결된다', () => {
  assert.equal(costumeMotionFrames.idle, 1);
  assert.equal(costumeMotionFrames.walk, 8);
  assert.equal(costumeMotionFrames.attack, 4);
  assert.equal(costumeFramesPerPart, 30);
  assert.deepEqual([...costumeMotionOrder], ['idle', 'walk', 'attack', 'slash', 'spin', 'smash', 'cast']);
  assert.equal(costumeMotionOrder.reduce((sum, motion) => sum + costumeMotionFrames[motion], 0), costumeFramesPerPart);

  assert.equal(heroCostumeMotion({ moving: true, attackPose: .2, skill: 'spin' }), 'walk');
  for (const template of costumeMotionTemplates) assert.equal(heroCostumeMotion({ moving: false, attackPose: 0, skill: template }), template);
  assert.equal(heroCostumeMotion({ moving: false, attackPose: .2 }), 'attack');
  assert.equal(heroCostumeMotion({ moving: false, attackPose: 0 }), 'idle');

  // 프레임 슬롯은 모션 오프셋 + 프레임이며 범위를 벗어나면 양끝으로 고정된다.
  assert.equal(costumeMotionSlot('idle', 0), 0);
  assert.equal(costumeMotionSlot('walk', 0), 1);
  assert.equal(costumeMotionSlot('walk', 7), 8);
  assert.equal(costumeMotionSlot('walk', 99), 8);
  assert.equal(costumeMotionSlot('attack', 3), 12);
  assert.equal(costumeMotionSlot('cast', 2), 29);
});

test('공격 속도 배율은 시각 재생 배율로만 쓰이고 월드 쿨다운과 역수 관계다', () => {
  assert.equal(costumePlaybackRate({ speed: 0 }), 1);
  assert.equal(costumePlaybackRate({ speed: 50 }), 1.5);
  assert.equal(costumePlaybackRate({ speed: 100, berserk: 1, berserkLevel: 1 }), 3);
  assert.equal(costumePlaybackRate({ speed: 0, berserk: 1, berserkLevel: 1 }), 1.5);
  assert.equal(costumePlaybackRate({ speed: Number.NaN }), 1);
  // world.ts: cooldown = 0.48 / (1 + speed/100) * (berserk ? 1/(1.5+(level-1)*.08) : 1)
  for (const speed of [0, 20, 45]) for (const berserkLevel of [1, 3]) {
    const rate = costumePlaybackRate({ speed, berserk: 1, berserkLevel });
    const cooldown = .48 / (1 + speed / 100) / (1.5 + (berserkLevel - 1) * .08);
    assert(Math.abs(cooldown * rate - .48) < 1e-9, `쿨다운 × 시각 배율 = 기본 쿨다운 (speed ${speed}, 광폭 ${berserkLevel})`);
  }
  // 빠른 공격일수록 같은 진행도에서 더 뒤 프레임에 도달하고, 마지막 프레임을 넘지 않는다.
  assert.equal(costumeFrameIndex('attack', .1, 1), 0);
  assert.equal(costumeFrameIndex('attack', .1, 2), 0);
  assert(costumeFrameIndex('attack', .3, 1), 1);
  assert.equal(costumeFrameIndex('attack', .95, 3), 3);
  assert.equal(costumeFrameIndex('idle', .5, 3), 0);
});

test('매니페스트가 없으면 계획이 서지 않고 폴백 사유를 남긴다', () => {
  const save = freshSave('male');
  const missing = planHeroCostume(save, undefined);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'manifest-missing');
  const broken = planHeroCostume(save, { ok: false, manifest: null, url: costumeManifestUrl(), fallback: true, reason: 'manifest-parse', detail: 'x' });
  assert.equal(broken.reason, 'manifest-parse');
  const state = createCostumeHeroState();
  assert.equal(renderCostumeHero({ heroLayer: new Container() }, state, save, { motion: 'idle', frame: 0 }), false);
});

for (const gender of ['male', 'female']) test(`${gender}: 본체 3영역이 같은 코드 경로로 계획되고 갑옷은 몸통 파츠를 교체한다`, () => {
  const bare = freshSave(gender);
  const bodyOnly = planHeroCostume(bare, loadOk);
  assert.equal(bodyOnly.ok, true);
  assert.deepEqual(bodyOnly.layers.map(layer => layer.role), ['legs', 'torso', 'arms']);
  assert.deepEqual([...costumeBodyParts], ['torso', 'arms', 'legs']);
  for (const layer of bodyOnly.layers) {
    assert.equal(layer.page, `body-${gender}`);
    assert.equal(layer.variant, costumeBodyParts.indexOf(layer.role));
  }

  const armored = planHeroCostume(fullEquipment(freshSave(gender)), loadOk);
  assert.equal(armored.ok, true);
  assert(!armored.layers.some(layer => layer.role === 'torso'), '갑옷 착용 시 맨몸 몸통 파츠는 빠진다(파츠 교체)');
  assert(armored.layers.some(layer => layer.role === 'armor'), '갑옷 파츠가 몸통 자리에 들어간다');
  const roles = armored.layers.map(layer => layer.role);
  for (const role of ['legs', 'arms', 'boots', 'gloves', 'helmet', 'offhand', 'weapon']) assert(roles.includes(role), `${role} 레이어 누락`);
  assert(!roles.includes('necklace') && !roles.includes('belt') && !roles.includes('ring'), '목걸이·벨트·반지는 필드 미표시(§3.1)');
  // zOrder 오름차순으로 그려야 앞뒤가 맞는다.
  const orders = armored.layers.map(layer => layer.zOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  const helmet = armored.layers.find(layer => layer.role === 'helmet');
  assert.equal(helmet.zOrder, 33, '매니페스트 zOrder가 기본값보다 우선한다');
  const armor = armored.layers.find(layer => layer.role === 'armor');
  assert.equal(armor.costumeId, 'armor-t2');
  assert.equal(armor.variant, 0, '같은 부위 매니페스트 순서가 페이지 변형 인덱스다');
  assert.deepEqual(armor.offset, { x: 4, y: -6 });
  assert.deepEqual(armor.scale, { x: 1.1, y: 1.2 });
  assert.equal(armor.rotation, .1);
  assert(Math.abs(armor.anchor.x - .5) < 1e-9 && Math.abs(armor.anchor.y - .9) < 1e-9);
});

test('매핑·매니페스트가 어긋나면 부분 합성 없이 전체 폴백한다', () => {
  const unmapped = freshSave('male');
  unmapped.equipment = { weapon: item('weapon', '알 수 없는 검') };
  const plan = planHeroCostume(unmapped, loadOk);
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'unmapped-costume');

  const notInManifest = freshSave('male');
  notInManifest.equipment = { weapon: item('weapon', '패왕의 성검') }; // weapon-t9 — 매니페스트에 없음
  const missingEntry = planHeroCostume(notInManifest, loadOk);
  assert.equal(missingEntry.ok, false);
  assert.equal(missingEntry.reason, 'unmapped-costume');
});

test('아틀라스 앵커는 정규화 피벗 또는 셀 픽셀 모두 받아 0..1로 고정된다', () => {
  assert.deepEqual(costumeLayerAnchor({ x: 0, y: 0 }), { x: .5, y: .96 });
  assert.deepEqual(costumeLayerAnchor({ x: .25, y: .75 }), { x: .25, y: .75 });
  assert.deepEqual(costumeLayerAnchor({ x: 117, y: 121 }), { x: .5, y: .5 });
  // 1보다 큰 값은 셀 아트 픽셀로 보고 0..1로 고정한다.
  const pixels = costumeLayerAnchor({ x: 234, y: 500 });
  assert.equal(pixels.x, 1);
  assert.equal(pixels.y, 1);
  const negative = costumeLayerAnchor({ x: -234, y: -500 });
  assert.equal(negative.x, 0);
  assert.equal(negative.y, 0);
});

test('아틀라스 셀은 변형·모션·프레임마다 하나씩 떨어지고 페이지를 넘지 않는다', () => {
  const save = fullEquipment(freshSave('male'));
  const plan = planHeroCostume(save, loadOk);
  assert.equal(plan.ok, true);
  const seen = new Set();
  for (const layer of plan.layers) {
    for (const motion of costumeMotionOrder) for (let frame = 0; frame < costumeMotionFrames[motion]; frame++) {
      const cell = costumeLayerCell(layer, motion, frame);
      assert(cell >= 0 && cell < costumeAtlasCellsPerPage, `${layer.role} ${motion} ${frame} 셀이 페이지 밖`);
      const page = costumeLayerPageIndex(layer);
      assert(Math.floor(cell / costumeAtlasCellsPerPage) === 0, '변형은 페이지 경계를 넘지 않는다');
      const key = `${layer.page}#${page}:${cell}`;
      assert(!seen.has(key), `${key} 셀이 중복된다`);
      seen.add(key);
    }
  }
  assert.equal(costumeVariantsPerPage, 2);
  assert.equal(costumeAtlasPageName('armor', 0), 'armor');
  assert.equal(costumeAtlasPageName('armor', 1), 'armor-2');
  assert.equal(costumeAtlasUrl('armor-2'), '/assets/costume/v1/atlas/armor-2.png');
});

for (const gender of ['male', 'female']) test(`${gender}: 매니페스트와 텍스처가 있으면 레이어로 그리고 폴백 본체는 숨긴다`, () => {
  const save = fullEquipment(freshSave(gender));
  const before = JSON.stringify(save.equipment);
  const plan = planHeroCostume(save, loadOk);
  assert.equal(plan.ok, true);
  const heroLayer = new Container(), hero = new Sprite(Texture.EMPTY);
  heroLayer.addChild(hero);
  const state = createCostumeHeroState();
  applyCostumeHeroRuntime(state, loadOk, atlasFor(save));

  const drawn = renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'walk', frame: 3 });
  assert.equal(drawn, true);
  assert.equal(hero.visible, false, '코스튬 모드에서는 통합 바디가 보이면 안 된다');
  const sprites = [...state.sprites.values()];
  assert.equal(sprites.length, plan.layers.length);
  assert.equal(heroLayer.children.length, plan.layers.length + 1);
  assert.equal(heroLayer.sortableChildren, true);
  const byRole = new Map(plan.layers.map(layer => [layer.role, layer]));
  for (const [role, sprite] of state.sprites) {
    const layer = byRole.get(role);
    assert(layer, `${role} 레이어가 계획에 없다`);
    assert.equal(sprite.zIndex, layer.zOrder);
    assert(Math.abs(sprite.anchor.x - layer.anchor.x) < 1e-9 && Math.abs(sprite.anchor.y - layer.anchor.y) < 1e-9);
    assert(Number.isFinite(sprite.position.x) && Number.isFinite(sprite.position.y));
    assert.equal(sprite.visible, true);
    assert.equal(sprite.width, 234 * layer.scale.x);
    assert.equal(sprite.height, 242 * layer.scale.y);
    assert.equal(sprite.texture.frame.width, 234);
    assert.equal(sprite.texture.frame.height, 242);
  }
  assert.equal(JSON.stringify(save.equipment), before, '렌더러는 Save를 바꾸지 않는다');

  // 모션·프레임이 바뀌면 프레임 셀도 바뀐다(걷기 8프레임 · 기본 공격 4프레임 · 스킬 4종).
  const walkFrame = state.sprites.get('legs').texture;
  renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'walk', frame: 4 });
  assert.notEqual(state.sprites.get('legs').texture, walkFrame);
  const idleFrame = state.sprites.get('legs').texture;
  renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'idle', frame: 0 });
  assert.notEqual(state.sprites.get('legs').texture, idleFrame);
  for (const motion of ['attack', 'slash', 'spin', 'smash', 'cast']) {
    assert.equal(renderCostumeHero({ heroLayer, hero }, state, save, { motion, frame: 1 }), true, `${motion} 모션이 그려지지 않는다`);
  }

  // 피격 연출(tint)은 코스튬 모드에서도 모든 레이어에 적용된다.
  renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'idle', frame: 0, tint: 0xffd4cf });
  for (const sprite of state.sprites.values()) assert.equal(sprite.tint, 0xffd4cf);

  // 잔상은 보이는 레이어 전체를 복제한다(그림자·피격 연출 호환 요구 4).
  const sources = costumeGhostSources(state);
  assert.equal(sources.length, plan.layers.length);

  // 폴백으로 돌아가면 통합 바디가 다시 보인다.
  hideCostumeHero({ heroLayer, hero }, state);
  assert.equal(hero.visible, true);
  for (const sprite of state.sprites.values()) assert.equal(sprite.visible, false);
});

test('아틀라스가 일부만 있으면 아무것도 그리지 않고 기존 본체로 폴백한다', () => {
  const save = fullEquipment(freshSave('male'));
  const state = createCostumeHeroState();
  const textures = new Map();
  const bodyUrl = costumeAtlasUrl(costumeAtlasPageName('body-male', 0));
  textures.set(bodyUrl, pageTexture()); // 본체만 있고 장비 아틀라스는 없음
  applyCostumeHeroRuntime(state, loadOk, textures);
  for (const url of [costumeAtlasUrl('helmet'), costumeAtlasUrl('armor'), costumeAtlasUrl('gloves'), costumeAtlasUrl('boots'), costumeAtlasUrl('weapon'), costumeAtlasUrl('offhand')]) state.failed.add(url);
  const heroLayer = new Container(), hero = new Sprite(Texture.EMPTY);
  heroLayer.addChild(hero);
  assert.equal(renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'idle', frame: 0 }), false);
  assert.equal(state.sprites.size, 0, '부분 레이어를 남기지 않는다');
  assert.equal(hero.visible, true, '폴백 본체가 계속 보인다');
});

test('매니페스트 로드 실패 상태는 재시도 없이 폴백으로 굳는다', () => {
  const state = createCostumeHeroState();
  state.status = 'fallback';
  state.reason = 'manifest-missing';
  const save = freshSave('female');
  const heroLayer = new Container(), hero = new Sprite(Texture.EMPTY);
  assert.equal(renderCostumeHero({ heroLayer, hero }, state, save, { motion: 'idle', frame: 0 }), false);
  assert(state.status === 'fallback');
});

/**
 * 필드 렌더러 전체 경로(`drawHero`)가 코스튬 모드와 폴백 모드를 모두 통과하는지 확인한다.
 * 가짜 뷰는 `hero-weapon-render.test.mjs`와 같은 최소 구성이다.
 */
function fakeView(extra = {}) {
  const layer = new Container(), hero = new Sprite(Texture.EMPTY);
  layer.addChild(hero);
  return {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: new Proxy({}, { get: () => Texture.EMPTY }), animations: new Proxy({}, { get: () => Array(8).fill(Texture.EMPTY) }),
    app: { screen: { height: 800 } },
    ground: { ellipse() { return { fill() {} }; } },
    glow: { circle() { return { fill() {} }; } },
    ...extra
  };
}

test('drawHero는 코스튬 상태가 없으면 기존 통합 바디로 그린다(무중단 폴백)', () => {
  const save = freshSave('male');
  const view = fakeView();
  const world = { save, player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 1 }, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
  drawHero.call(view, world, 100, 100, 0);
  assert.equal(view.hero.visible, true);
  assert.equal(view.heroLayer.children.length, 1);
});

for (const gender of ['male', 'female']) test(`${gender}: drawHero가 코스튬 레이어로 그리고 스킬 모션은 world 이펙트에서 온다`, () => {
  const save = fullEquipment(freshSave(gender));
  const view = fakeView({ costume: createCostumeHeroState() });
  applyCostumeHeroRuntime(view.costume, loadOk, atlasFor(save));
  const player = { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 1 };
  const world = { save, player, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
  drawHero.call(view, world, 100, 100, 0);
  assert.equal(view.hero.visible, false, '코스튬 모드에서 통합 바디가 남아 있다');
  const idleCell = view.costume.sprites.get('legs').texture;

  // world.ts 드래곤 트위스터 이펙트 → spin 템플릿 프레임
  world.effects.push({ x: 0, y: 0, kind: 'spin', age: .3, duration: 1.2, angle: 0 });
  drawHero.call(view, world, 100, 100, .1);
  assert.notEqual(view.costume.sprites.get('legs').texture, idleCell);

  // 피격 연출(tint) 호환
  world.effects.length = 0;
  player.hit = .3;
  drawHero.call(view, world, 100, 100, .2);
  for (const sprite of view.costume.sprites.values()) assert.equal(sprite.tint, 0xffd4cf);
  assert.equal(view.hero.visible, false);
});
