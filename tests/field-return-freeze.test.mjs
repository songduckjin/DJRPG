/**
 * 전용 필드(월드보스·던전)에서 나올 때 **메인 필드가 멈춰 서지 않는** 계약 (2026-11-28 사용자 제보).
 *
 * 재현·원인: 1~40층 비주얼 개편(`#378`)이 `ambientScene`에 `stage.once('destroyed', …)` 정리를 붙였는데,
 * PixiJS v8의 `app.destroy(true, …)`는 **ticker를 먼저 없앤 뒤** stage를 파괴한다. 그래서 그 정리가
 * `view.app.ticker.remove(update)`에서 `TypeError: Cannot read properties of null (reading 'remove')`로
 * 터졌고, 이 예외가 `cleanup()`의 `view.app.destroy(...)` 자리에서 올라와 그 뒤의 `restoreMain()`
 * (`ui.world.paused` 해제·티커 재개)이 실행되지 않았다 — 화면을 닫아도 캐릭터와 몹이 그대로 멈췄다.
 *
 * 확인하는 것
 *  ① 티커가 이미 `null`이 된 stage `'destroyed'`에서도 장면 정리가 예외 없이 끝나고 자식이 모두 빠진다.
 *  ② `'destroyed'` 훅은 뷰마다 한 번만 걸리고, 층 경계에서 장면을 갈아 끼워도 마지막 장면을 정리한다.
 *  ③ `releaseField`는 파괴·해제가 예외를 내도 `restore`(메인 필드 복원)를 반드시 실행한다.
 *  ④ 월드보스·던전·무한 방어전 셋이 그 순서(파괴 → 해제 → 복원)를 실제로 쓴다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { Container, Texture, Ticker } from 'pixi.js';
const { mountAmbientScene } = await import('../src/game/ambientScene.ts');
const { releaseField } = await import('../src/ui/fieldTeardown.ts');

const layout = () => ({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, fires: [] });

/** `GameView`가 장면을 붙이는 데 쓰는 만큼만 흉내 낸 실제 PixiJS 무대. */
function fieldView() {
  const stage = new Container();
  const floor = new Container();
  stage.addChild(floor);
  const ambientLayer = new Container();
  stage.addChild(ambientLayer);
  const ticker = new Ticker();
  const view = { app: { stage, ticker, screen: { width: 390, height: 844 } }, floor, ambientLayer };
  return { view, stage, ambientLayer, ticker };
}

/** PixiJS v8 `app.destroy(true, …)`가 하는 순서 그대로 — ticker 정리 → stage 파괴. */
function destroyLikePixi({ view, stage, ticker }) {
  ticker.destroy();
  view.app.ticker = null;
  stage.destroy({ children: true });
}

test('티커가 이미 null이 된 stage 파괴에서도 장면 정리는 예외 없이 끝난다', () => {
  const field = fieldView();
  mountAmbientScene(field.view, 'wasteland', Texture.WHITE, layout);
  assert.equal(field.ambientLayer.children.length, 2, '배경 메시와 불씨가 붙어 있어야 한다');

  assert.doesNotThrow(() => destroyLikePixi(field),
    'app.destroy가 ticker를 먼저 없앤 뒤 stage를 파괴한다 — 여기서 터지면 호출한 쪽 cleanup이 끊긴다');
  assert.equal(field.ambientLayer.children.length, 0, '정리가 끝나면 배경 자식이 남지 않는다');
});

test('stage destroyed 훅은 뷰마다 한 번만 걸리고 마지막 장면을 정리한다', () => {
  const field = fieldView();
  mountAmbientScene(field.view, 'wasteland', Texture.WHITE, layout);
  mountAmbientScene(field.view, 'castle', Texture.WHITE, layout);
  assert.equal(field.stage.listenerCount('destroyed'), 1, '층 경계마다 장면을 갈아 끼워도 리스너는 쌓이지 않는다');
  assert.equal(field.ambientLayer.children.length, 2, '갈아 끼운 장면 하나만 남는다');

  assert.doesNotThrow(() => destroyLikePixi(field));
  assert.equal(field.ambientLayer.children.length, 0);
});

test('releaseField는 렌더러 파괴가 예외를 내도 메인 필드 복원을 실행한다', () => {
  const calls = [];
  assert.throws(() => releaseField({
    destroy: () => { calls.push('destroy'); throw new TypeError("Cannot read properties of null (reading 'remove')"); },
    release: () => calls.push('release'),
    restore: () => calls.push('restore')
  }), TypeError);
  assert.deepEqual(calls, ['destroy', 'release', 'restore'], '파괴가 터져도 해제·복원 순서는 그대로다');
});

test('releaseField는 텍스처 해제가 예외를 내도 복원을 실행한다', () => {
  const calls = [];
  assert.throws(() => releaseField({
    destroy: () => calls.push('destroy'),
    release: () => { calls.push('release'); throw new Error('texture destroyed'); },
    restore: () => calls.push('restore')
  }), /texture destroyed/);
  assert.deepEqual(calls, ['destroy', 'release', 'restore']);
});

test('releaseField는 해제 단계가 없어도 복원하고, 성공한 경우에도 한 번씩만 부른다', () => {
  const calls = [];
  releaseField({ destroy: () => calls.push('destroy'), restore: () => calls.push('restore') });
  assert.deepEqual(calls, ['destroy', 'restore']);
});

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('월드보스·던전·무한 방어전 정리는 파괴와 복원을 releaseField로 묶는다', () => {
  const fields = [
    ['src/ui/worldBossField.ts', /restore\s*:\s*\(\)\s*=>\s*\{\s*restoreMain\(\)/],
    ['src/ui/dungeonField.ts', /restore\s*:\s*\(\)\s*=>\s*\{\s*ui\.world\.paused\s*=/],
    ['src/ui/defenseField.ts', /restore\s*:\s*\(\)\s*=>\s*\{\s*ui\.world\.paused\s*=/]
  ];
  for (const [file, restoreStep] of fields) {
    const text = source(file);
    assert.match(text, /destroy\s*:\s*\(\)\s*=>\s*\{[^}]*view\.app\.destroy\(/, `${file}: 파괴는 destroy 단계가 맡는다`);
    assert.match(text, restoreStep, `${file}: 메인 필드 복원은 restore 단계가 맡는다`);
  }
});
