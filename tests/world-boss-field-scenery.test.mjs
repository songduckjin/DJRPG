import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 월드보스 전용 필드의 배경 레이어 계약 (2026-11-26 사용자 제보 "월드보스배경은왜바꿨어?").
 *
 * `GameView.draw()`는 매 프레임 `drawTerrain` → `placeFieldScene` → `mountAmbientScene`을 거치며
 * **현재 층의 일반 사냥 배경**을 `view.ambientLayer`에 올린다(1~20층 잿빛 황무지, 21~40층 핏빛 성채 전당).
 * `worldBossField`는 투기장(`obsidian-arena-v1.png`)을 `stage` 0번에 깔고 그 위에서 전투를 그리므로,
 * 이 레이어를 끄지 않으면 사냥 배경이 투기장을 덮는다 — 실제로 `floor`·`terrainLayer`만 끄고
 * `ambientLayer`를 빠뜨려 21~40층에서 월드보스 배경이 사냥 배경으로 바뀌어 보였다.
 *
 * 같은 전용 화면인 던전(`dungeonField`)·무한 방어전(`defenseField`)은 이미 다섯 레이어를 모두 끈다.
 * 여기서는 셋이 같은 목록을 끄는지 소스 계약으로 고정한다(전용 화면은 사냥 배경을 그리지 않는다).
 */

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** 화면마다 다른 표기(`for…of` 목록 순회 / 한 줄 나열)를 같은 목록으로 읽는다. */
function hiddenLayers(file) {
  const text = source(file);
  const loop = text.match(/for\s*\(const layer of \[([^\]]+)\]\)\s*layer\.visible\s*=\s*false/);
  if (loop) return [...new Set([...loop[1].matchAll(/view\.(\w+)/g)].map(match => match[1]))];
  const line = text.match(/^.*\.visible\s*=\s*false;$/m);
  assert(line, `${file}: 배경 레이어 숨김 코드를 찾지 못했다`);
  return [...new Set([...line[0].matchAll(/view\.(\w+)\.visible\s*=\s*false/g)].map(match => match[1]))];
}

const SCENERY = ['floor', 'terrainLayer', 'ambientLayer', 'glow', 'shade'];

test('월드보스 필드는 일반 사냥 배경 레이어(ambientLayer)까지 전부 끈다', () => {
  const hidden = hiddenLayers('src/ui/worldBossField.ts');
  assert.deepEqual(SCENERY.filter(layer => !hidden.includes(layer)), [],
    'ambientLayer를 끄지 않으면 draw()가 매 프레임 올린 사냥 배경이 투기장 위를 덮는다');
});

test('전용 화면 셋(월드보스·던전·무한 방어전)이 같은 배경 레이어 목록을 끈다', () => {
  const files = ['src/ui/worldBossField.ts', 'src/ui/dungeonField.ts', 'src/ui/defenseField.ts'];
  const lists = files.map(file => [file, hiddenLayers(file)]);
  for (const [file, hidden] of lists) {
    assert.deepEqual(SCENERY.filter(layer => !hidden.includes(layer)), [], `${file}가 사냥 배경을 남긴다`);
  }
});

test('투기장은 ambientLayer보다 아래(무대 0번)에 깔린다 — 숨김 대상이 투기장이 아니다', () => {
  const text = source('src/ui/worldBossField.ts');
  assert.match(text, /stage\.addChildAt\(arenaSprite,\s*0\)/,
    '투기장은 stage 0번에 있어야 배경 레이어를 끄면 그대로 보인다');
  assert.match(text, /Assets\.load<Texture>\('\/assets\/world-boss\/obsidian-arena-v1\.png'\)/);
});

test('장면 마운트는 ambientLayer를 다시 켜지 않는다 — 한 번 끄면 유지된다', () => {
  const scene = source('src/game/ambientScene.ts');
  assert.match(scene, /view\.ambientLayer\.addChild\(mesh, sparks\)/);
  assert.doesNotMatch(scene, /ambientLayer\.visible\s*=\s*true/,
    '장면이 층 경계에서 다시 붙을 때 visible을 켜면 월드보스 투기장이 또 가려진다');
});
