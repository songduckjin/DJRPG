// [작업 143] 코스튬 아틀라스 v3 배포본 검사.
//
// 매니페스트가 `mapping.ts`의 55종 `costumeId`를 빠짐없이 담고 있는지, 각 변형이 가리키는
// 아틀라스 페이지 파일이 실제로 `public/assets/costume/v3/atlas/`에 있는지 확인한다.
// 렌더러의 페이지 규칙(`costumeAtlasPageName`·`costumeLayerPageIndex`)을 그대로 써서
// 코드와 배포 파일이 같은 규칙을 따르는지도 함께 고정한다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import './ts-loader.mjs';

const { costumeMappingEntries, COSTUME_NONE } = await import('../src/game/costume/mapping.ts');
const { validateCostumeManifest, COSTUME_ASSET_VERSION } = await import('../src/game/costume/manifest.ts');
const { costumeVariantsPerPage, costumeAtlasPageName } = await import('../src/game/render/costumeHero.ts');

const root = new URL('../public/assets/costume/v3/', import.meta.url);
const manifestPath = new URL('manifest.json', root);
const atlasDir = new URL('atlas/', root);

function pngSize(path) {
  const data = readFileSync(path);
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${path} is not a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/** 셀 234×242 격자에 정확히 맞고 8×8=64칸을 담을 수 있어야 한다(§7.2). */
function assertCellGrid(name, size) {
  assert.equal(size.width % 234, 0, `${name} 폭이 셀 단위가 아닙니다: ${size.width}`);
  assert.equal(size.height % 242, 0, `${name} 높이가 셀 단위가 아닙니다: ${size.height}`);
  assert.ok(size.width / 234 >= 8, `${name} 열 수 부족`);
  assert.ok(size.height / 242 >= 8, `${name} 행 수 부족`);
}

const pages = (slot, gender, variants) => {
  const names = [];
  for (let variant = 0; variant < variants; variant++) {
    const page = `${slot}-${gender}`;
    names.push(costumeAtlasPageName(page, Math.floor(variant / costumeVariantsPerPage)));
  }
  return names;
};

test('v3 매니페스트가 매핑 55종을 모두 담는다', () => {
  assert.equal(COSTUME_ASSET_VERSION, 3);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const validated = validateCostumeManifest(manifest);
  assert.ok(validated.ok, validated.ok ? '' : validated.error);

  const expected = costumeMappingEntries().filter(entry => entry.costumeId !== COSTUME_NONE);
  assert.equal(expected.length, 55);
  const byId = new Map(manifest.costumes.map(entry => [entry.costumeId, entry]));
  for (const entry of expected) {
    const found = byId.get(entry.costumeId);
    assert.ok(found, `매니페스트에 ${entry.costumeId}(${entry.name})가 없습니다.`);
    assert.equal(found.slot, entry.slotGroup, `${entry.costumeId} 부위 불일치`);
    assert.equal(found.animMode, 'frames');
    assert.equal(typeof found.zOrder, 'number');
  }
  assert.equal(manifest.costumes.length, expected.length, '매니페스트에 매핑 밖 항목이 있습니다.');
});

test('모든 변형의 아틀라스 페이지가 셀 격자(8×8) PNG로 존재한다', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // `helmet-body-*`는 갑옷을 입지 않은 조합용 투구 페이지다(§7.5 2D 머리 정렬).
  const counts = { weapon: 10, offhand: 5, helmet: 10, 'helmet-body': 10, armor: 10, gloves: 10, boots: 10 };
  const checked = new Set();
  for (const [slot, variants] of Object.entries(counts)) {
    for (const gender of ['male', 'female']) {
      for (const name of pages(slot, gender, variants)) {
        const path = new URL(`${name}.png`, atlasDir);
        assert.ok(existsSync(path), `아틀라스 페이지가 없습니다: atlas/${name}.png`);
        const size = pngSize(path);
        assertCellGrid(name, size);
        checked.add(name);
      }
    }
  }
  for (const gender of ['male', 'female']) {
    for (const name of [`body-${gender}`, `body-${gender}-2`]) {
      const path = new URL(`${name}.png`, atlasDir);
      assert.ok(existsSync(path), `본체 아틀라스가 없습니다: atlas/${name}.png`);
      assertCellGrid(name, pngSize(path));
      checked.add(name);
    }
  }
  // 배포 폴더에 검사 대상 밖의 페이지가 남아 있으면 캐시·용량만 늘어난다.
  const shipped = readdirSync(atlasDir).filter(name => name.endsWith('.png')).map(name => name.slice(0, -4));
  const orphans = shipped.filter(name => !checked.has(name));
  assert.deepEqual(orphans, [], `쓰지 않는 아틀라스 페이지: ${orphans.join(', ')}`);
  assert.equal(shipped.length, checked.size);
});
