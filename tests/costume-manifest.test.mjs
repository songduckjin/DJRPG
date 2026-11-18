import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { baseItems, baseItemIndex, slots, rarityPrefixes } = await import('../src/game/items.ts');
const {
  COSTUME_NONE, costumeFieldVisible, costumeMapping, costumeMappingEntries, costumeSlotGroup,
  costumeSlotGroups, costumeIdFor, legacyCostumeAliases, lookupCostume
} = await import('../src/game/costume/mapping.ts');
const {
  COSTUME_ASSET_VERSION, COSTUME_MANIFEST_SCHEMA_VERSION, cachedCostumeManifest, costumeAssetUrl,
  costumeAtlasLoadResult, costumeAtlasUrl, costumeFallbackReasons, costumeManifestUrl, loadCostumeManifest,
  planCostume, resetCostumeManifestCache, validateCostumeManifest
} = await import('../src/game/costume/manifest.ts');
const { costumeMotionTemplateNames, costumeMotionTemplates, motionTemplateSkills, skillMotionTemplate, skillMotionTemplates } = await import('../src/game/costume/skillMotion.ts');
const { passiveOrder, skillOrder } = await import('../src/game/skills.ts');

/** `baseItems`의 고유 장비 이름. `ring1`·`ring2`는 같은 5종을 공유하므로 `ring` 하나로 센다. */
function uniqueBaseNames() {
  const seen = new Set(), out = [];
  for (const slot of slots) for (const name of baseItems[slot]) {
    const key = `${costumeSlotGroup(slot)}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slot, group: costumeSlotGroup(slot), name });
  }
  return out;
}

const validManifest = {
  schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION,
  costumes: [
    { costumeId: 'helmet-t7', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 }, zOrder: 30 },
    { costumeId: 'armor-t3', slot: 'armor', animMode: 'frames', anchor: { x: 0, y: 0 }, fit: { x: 1, y: -4, scaleX: 1, scaleY: 1, rotation: 0 } }
  ]
};

function fetchReturning(payload) {
  const calls = { count: 0, urls: [] };
  const fetch = async (url) => { calls.count++; calls.urls.push(url); return { ok: true, status: 200, json: async () => payload }; };
  return { fetch, calls };
}

function fetchFailing(error) {
  const fetch = async () => { throw error; };
  return fetch;
}

test('baseItems 고유 장비 이름 75종이 모두 costumeId 또는 none으로 매핑된다', () => {
  const names = uniqueBaseNames();
  assert.equal(names.length, 75);
  const entries = costumeMappingEntries();
  assert.equal(entries.length, 75);
  assert.equal(costumeSlotGroups.reduce((sum, group) => sum + costumeMapping[group].length, 0), 75);

  for (const { slot, group, name } of names) {
    const entry = costumeMapping[group].find(candidate => candidate.name === name);
    assert(entry, `${group} ${name} 누락`);
    const lookup = lookupCostume({ name, slot });
    assert.equal(lookup.ok, true, `${name} 미매핑`);
    assert.equal(lookup.costumeId, entry.costumeId);
    assert.equal(lookup.slotGroup, group);
  }

  // 코스튬이 있는 부위와 없는 부위를 표에서 명시적으로 구분한다.
  for (const group of costumeSlotGroups) for (const entry of costumeMapping[group]) {
    if (costumeFieldVisible[group]) {
      assert.notEqual(entry.costumeId, COSTUME_NONE, `${group} ${entry.name}는 필드 표시 부위인데 none이다`);
      assert.match(entry.costumeId, new RegExp(`^${group}-t\\d+$`));
    } else assert.equal(entry.costumeId, COSTUME_NONE, `${group} ${entry.name}는 필드 미표시 부위인데 costumeId가 있다`);
  }

  const visibleIds = costumeMappingEntries().filter(entry => entry.costumeId !== COSTUME_NONE).map(entry => entry.costumeId);
  assert.equal(visibleIds.length, 55);
  assert.equal(new Set(visibleIds).size, 55);
});

test('이름 대조는 baseItemIndex와 같은 규칙(NFKC·공백 제거·완전일치/endsWith)을 쓴다', () => {
  for (const { slot, group, name } of uniqueBaseNames()) {
    const index = baseItemIndex({ name, slot });
    assert(index >= 0, `${name} baseItemIndex 실패`);
    const expected = costumeFieldVisible[group] ? `${group}-t${index}` : COSTUME_NONE;
    assert.equal(costumeIdFor({ name, slot }), expected, `${name} → ${expected}`);

    for (const prefix of Object.values(rarityPrefixes)) {
      assert.equal(costumeIdFor({ name: `${prefix} ${name}`, slot }), expected, `${prefix} ${name}`);
    }  }
  // 등급 접두사·제로폭 문자·NFKC 변형이 섞여도 같은 costumeId로 모인다.
  assert.equal(costumeIdFor({ name: '영원의 가죽\u200b두건', slot: 'helmet' }), 'helmet-t0');
  assert.equal(costumeIdFor({ name: '고대의  혈빛\u00a0대검', slot: 'weapon' }), 'weapon-t6');
  assert.equal(costumeIdFor({ name: '패왕의 성검', slot: 'weapon' }), 'weapon-t9');
});

test("레거시 '낡은 투구'는 '심연의 뿔투구'로 본다", () => {
  assert.deepEqual(legacyCostumeAliases.map(alias => alias.name), ['낡은 투구']);
  const lookup = lookupCostume({ name: '낡은 투구', slot: 'helmet' });
  assert.equal(lookup.ok, true);
  assert.equal(lookup.costumeId, 'helmet-t7');
  assert.equal(lookup.baseName, '심연의 뿔투구');
  assert.equal(lookup.matchedBy, 'legacy');
  assert.equal(costumeIdFor({ name: '낡은 투구', slot: 'helmet' }), `helmet-t${baseItems.helmet.indexOf('심연의 뿔투구')}`);
  // 다른 부위의 같은 이름은 투구 예외를 쓰지 않는다.
  assert.equal(lookupCostume({ name: '낡은 투구', slot: 'gloves' }).ok, false);
});

test('매핑표에 없는 이름은 예외 없이 미매핑으로 돌려준다', () => {
  for (const item of [{ name: '존재하지 않는 투구', slot: 'helmet' }, { name: '', slot: 'weapon' }, { name: '두손검', slot: 'armor' }]) {
    assert.equal(costumeIdFor(item), undefined);
    assert.deepEqual(lookupCostume(item), { ok: false, reason: 'unmapped-costume', slotGroup: costumeSlotGroup(item.slot), fieldVisible: costumeFieldVisible[costumeSlotGroup(item.slot)], baseName: null });
  }
});

test('매니페스트 검증은 필수 필드와 타입을 강제한다', () => {
  const valid = validateCostumeManifest(validManifest);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.manifest.costumes[0], { costumeId: 'helmet-t7', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 }, zOrder: 30 });
  assert.deepEqual(valid.manifest.costumes[1].fit, { x: 1, y: -4, scaleX: 1, scaleY: 1, rotation: 0 });

  const broken = [
    null,
    [],
    {},
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION + 1, costumes: [] },
    { missingSchemaVersion: true, costumes: [] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: {} },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: ['nope'] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 } }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'ring3', animMode: 'attach', anchor: { x: 0, y: 0 } }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'blend', anchor: { x: 0, y: 0 } }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'attach' }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: null } }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 }, fit: { x: 0, y: 0 } }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 }, zOrder: 'top' }] },
    { schemaVersion: COSTUME_MANIFEST_SCHEMA_VERSION, costumes: [{ costumeId: 'x', slot: 'helmet', animMode: 'attach', anchor: { x: 0, y: 0 } }, { costumeId: 'x', slot: 'armor', animMode: 'attach', anchor: { x: 0, y: 0 } }] }
  ];
  for (const payload of broken) {
    const result = validateCostumeManifest(payload);
    assert.equal(result.ok, false, JSON.stringify(payload));
    assert.equal(typeof result.error, 'string');
    assert(result.error.length > 0);
  }
});

test('매니페스트는 한 번만 받아 캐시하고 force로 다시 받는다', async () => {
  resetCostumeManifestCache();
  const { fetch, calls } = fetchReturning(validManifest);
  const first = await loadCostumeManifest({ fetch });
  assert.equal(first.ok, true);
  assert.equal(first.fallback, false);
  assert.equal(first.reason, 'none');
  assert.equal(calls.urls[0], costumeManifestUrl());
  await loadCostumeManifest({ fetch });
  assert.equal(calls.count, 1);
  assert.deepEqual(cachedCostumeManifest()?.costumes.length, 2);

  const forced = await loadCostumeManifest({ fetch, force: true });
  assert.equal(forced.ok, true);
  assert.equal(calls.count, 2);
  resetCostumeManifestCache();
  assert.equal(cachedCostumeManifest(), undefined);
});

test('동시 호출은 같은 요청을 공유한다', async () => {
  resetCostumeManifestCache();
  const { fetch, calls } = fetchReturning(validManifest);
  const [a, b] = await Promise.all([loadCostumeManifest({ fetch }), loadCostumeManifest({ fetch })]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(calls.count, 1);
  resetCostumeManifestCache();
});

test('폴백 ①: 매니페스트가 없으면 본체 폴백으로 계획한다', async () => {
  resetCostumeManifestCache();
  const network = await loadCostumeManifest({ fetch: fetchFailing(new Error('network down')) });
  assert.equal(network.ok, false);
  assert.equal(network.fallback, true);
  assert.equal(network.reason, 'manifest-missing');
  assert.equal(network.manifest, null);
  const notFound = await loadCostumeManifest({ fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.equal(notFound.reason, 'manifest-missing');

  const plan = planCostume({ name: '낡은 가죽 두건', slot: 'helmet' }, network);
  assert.equal(plan.bodyFallback, true);
  assert.equal(plan.reason, 'manifest-missing');
  assert.equal(plan.definition, null);
  assert.equal(plan.costumeId, 'helmet-t0');
  // 로드 자체를 하지 않은 상태도 같은 경로다.
  assert.equal(planCostume({ name: '가죽 두건', slot: 'helmet' }, undefined).reason, 'manifest-missing');
  resetCostumeManifestCache();
});

test('폴백 ②: JSON 파싱·스키마 실패도 본체 폴백이다', async () => {
  resetCostumeManifestCache();
  const parseError = await loadCostumeManifest({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
  assert.equal(parseError.ok, false);
  assert.equal(parseError.reason, 'manifest-parse');
  const invalid = await loadCostumeManifest({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ schemaVersion: 99, costumes: [] }) }) });
  assert.equal(invalid.reason, 'manifest-parse');
  assert.equal(planCostume({ name: '미스릴 아머', slot: 'armor' }, invalid).bodyFallback, true);
  // 실패는 캐시하지 않는다(다음 시도에서 복구 가능).
  assert.equal(cachedCostumeManifest(), undefined);
  resetCostumeManifestCache();
});

test('폴백 ③: costumeId 미매핑(이름·매니페스트 누락·부위 불일치)은 본체 폴백이다', async () => {
  resetCostumeManifestCache();
  const unmapped = planCostume({ name: '정체불명의 투구', slot: 'helmet' }, undefined);
  assert.equal(unmapped.reason, 'unmapped-costume');
  assert.equal(unmapped.bodyFallback, true);
  assert.equal(unmapped.costumeId, null);

  const load = await loadCostumeManifest({ fetch: fetchReturning(validManifest).fetch });
  assert.equal(load.ok, true);
  const absent = planCostume({ name: '영원의 패왕의 전갑', slot: 'armor' }, load);
  assert.equal(absent.costumeId, 'armor-t9');
  assert.equal(absent.reason, 'unmapped-costume');
  assert.equal(absent.bodyFallback, true);
  // 매니페스트가 다른 부위로 적힌 항목도 붙이지 않는다.
  const mismatched = planCostume({ name: '심연의 뿔투구', slot: 'helmet' }, { ok: true, manifest: { schemaVersion: 1, costumes: [{ costumeId: 'helmet-t7', slot: 'armor', animMode: 'attach', anchor: { x: 0, y: 0 } }] }, url: 'u', fallback: false, reason: 'none' });
  assert.equal(mismatched.reason, 'unmapped-costume');
  assert.equal(mismatched.bodyFallback, true);
  resetCostumeManifestCache();
});

test('폴백 ④: 아틀라스 로드 실패 계약은 URL과 폴백 플래그를 함께 돌려준다', () => {
  const failed = costumeAtlasLoadResult(false);
  assert.equal(failed.bodyFallback, true);
  assert.equal(failed.reason, 'atlas-load');
  assert.equal(failed.atlasUrl, costumeAtlasUrl());
  const loaded = costumeAtlasLoadResult(true, 'warrior');
  assert.equal(loaded.bodyFallback, false);
  assert.equal(loaded.reason, 'none');
  assert.equal(costumeFallbackReasons.filter(reason => reason !== 'none').length, 4);
  assert.deepEqual([...costumeFallbackReasons].slice(1), ['manifest-missing', 'manifest-parse', 'unmapped-costume', 'atlas-load']);
});

test('정상 계획은 매니페스트의 animMode·anchor·fit·zOrder를 그대로 넘긴다', async () => {
  resetCostumeManifestCache();
  const load = await loadCostumeManifest({ fetch: fetchReturning(validManifest).fetch });
  const helmet = planCostume({ name: '영원의 심연의 뿔투구', slot: 'helmet' }, load);
  assert.equal(helmet.bodyFallback, false);
  assert.equal(helmet.reason, 'none');
  assert.equal(helmet.fieldVisible, true);
  assert.equal(helmet.costumeId, 'helmet-t7');
  assert.equal(helmet.definition.animMode, 'attach');
  assert.deepEqual(helmet.definition.anchor, { x: 0, y: 0 });
  assert.equal(helmet.definition.zOrder, 30);

  const armor = planCostume({ name: '강철 브레스트플레이트', slot: 'armor' }, load);
  assert.equal(armor.definition.animMode, 'frames');
  assert.deepEqual(armor.definition.fit, { x: 1, y: -4, scaleX: 1, scaleY: 1, rotation: 0 });

  for (const item of [{ name: '구리 펜던트', slot: 'necklace' }, { name: '군주의 반지', slot: 'ring2' }, { name: '삼베 허리띠', slot: 'belt' }]) {
    const plan = planCostume(item, load);
    assert.equal(plan.costumeId, COSTUME_NONE);
    assert.equal(plan.fieldVisible, false);
    assert.equal(plan.bodyFallback, false);
    assert.equal(plan.reason, 'none');
  }
  resetCostumeManifestCache();
});

test('캐시 버스터: 매니페스트·아틀라스 URL이 한 버전 상수에서 나온다', () => {
  assert.equal(COSTUME_ASSET_VERSION, 2);
  assert.equal(costumeManifestUrl(), `/assets/costume/v${COSTUME_ASSET_VERSION}/manifest.json`);
  assert.equal(costumeAtlasUrl(), `/assets/costume/v${COSTUME_ASSET_VERSION}/atlas/warrior.png`);
  assert.equal(costumeAtlasUrl('boss'), `/assets/costume/v${COSTUME_ASSET_VERSION}/atlas/boss.png`);
  assert.equal(costumeAssetUrl('/x/y.png'), `/assets/costume/v${COSTUME_ASSET_VERSION}/x/y.png`);
  assert.equal(costumeAssetUrl('y.png', 2), '/assets/costume/v2/y.png');
  assert.notEqual(costumeManifestUrl(1), costumeManifestUrl(2));
  // 버전 없는 URL(immutable 캐시에 고정되는 경로)은 만들지 않는다.
  for (const url of [costumeManifestUrl(), costumeAtlasUrl(), costumeAssetUrl('a.png')]) assert.match(url, /^\/assets\/costume\/v\d+\//);
});

test('스킬 8종이 4대 템플릿에 모두 매핑된다', () => {
  assert.equal(skillOrder.length, 8);
  assert.deepEqual(Object.keys(skillMotionTemplates).sort(), [...skillOrder].sort());
  assert.equal(costumeMotionTemplates.length, 4);
  assert.equal(new Set(Object.values(skillMotionTemplates)).size, 4);
  assert.deepEqual({ ...skillMotionTemplates }, {
    slash2: 'slash', power: 'slash', destroy: 'slash',
    spin: 'spin',
    crushing: 'smash', slam: 'smash',
    warcry: 'cast', hell: 'cast'
  });
  for (const id of skillOrder) assert(costumeMotionTemplates.includes(skillMotionTemplate(id)));
  // 패시브 3종은 모션이 없어 매핑 대상이 아니다.
  assert.equal(passiveOrder.length, 3);
  for (const id of passiveOrder) assert.equal(skillMotionTemplates[id], undefined);
  assert.deepEqual(motionTemplateSkills('slash'), ['slash2', 'power', 'destroy']);
  assert.deepEqual(motionTemplateSkills('smash'), ['crushing', 'slam']);
  assert.deepEqual(motionTemplateSkills('cast'), ['warcry', 'hell']);
  assert.deepEqual(costumeMotionTemplates.map(template => costumeMotionTemplateNames[template]), ['베기', '회전', '내려찍기', '발동 자세']);
});
