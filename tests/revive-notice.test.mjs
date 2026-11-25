/**
 * 부활 대기 상태 카드 B안(2026-11-25) — 사망 후 5초 대기를 화면 중앙 카드로 보여 준다.
 *
 * 확인하는 것
 *  ① 상태 판정: 6층에서 5→4→…→1초 정수, 0초는 플래시, 입문 1~4층은 카드 없음(현행 유지).
 *  ② 문구: `쓰러졌습니다`·`{손실금화}금화 손실 · {층}층`·`{N}초 뒤 만혈로 부활합니다`·1~4층 각주.
 *  ③ 실제 손실 금화: 가진 금화가 10보다 적으면 그만큼만(`defeatPenalty` 반환값을 필드가 기억한다).
 *  ④ 토스트 중복 접기: 카드가 떠 있는 동안 같은 말은 토스트로 다시 띄우지 않는다(보스 안내는 남긴다).
 *  ⑤ 화면 계약: CSS·UI 배선(카드가 손가락을 막지 않고, 모달·토스트 아래에 앉는다).
 *  ⑥ 수정 전 코드에서 이 테스트가 실패함은 `src/game/reviveNotice.ts`가 없던 것과 `reviveLostGold`가
 *     없던 것으로 확인했다(아래 각 테스트가 그 심볼을 직접 부른다).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './patch-buff-off.mjs';

const {
  REVIVE_FLASH_SECONDS, REVIVE_CARD_DOWN, REVIVE_CARD_REVIVED, REVIVE_CARD_RESTART, REVIVE_CARD_NOTE,
  reviveNoticeState, reviveChipText, reviveCountdownText, reviveScreenReaderText, isReviveToastSuppressed
} = await import('../src/game/reviveNotice.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

test('6층 사망 — 남은 초를 5→1 정수로 보여 주고, 0초에는 부활 플래시다', () => {
  const start = reviveNoticeState(5, 6);
  assert.equal(start.kind, 'waiting');
  assert.equal(start.seconds, 5, '대기 시작은 5초');
  assert.equal(start.ratio, 1, '링·막대는 가득 찬 상태에서 시작한다');
  // 프레임마다 4.98, 4.5 … 로 줄어도 표시는 올림이라 5→4→3→2→1을 한 초씩 머문다.
  assert.equal(reviveNoticeState(4.99, 6).seconds, 5);
  assert.equal(reviveNoticeState(4.0, 6).seconds, 4);
  assert.equal(reviveNoticeState(3.2, 6).seconds, 4);
  assert.equal(reviveNoticeState(2.01, 6).seconds, 3);
  assert.equal(reviveNoticeState(1.01, 6).seconds, 2);
  assert.equal(reviveNoticeState(1.0, 6).seconds, 1);
  assert.equal(reviveNoticeState(0.01, 6).seconds, 1, '마지막 1초는 1로 남는다');
  const half = reviveNoticeState(2.5, 6);
  assert(Math.abs(half.ratio - .5) < 1e-9, '링은 남은 비율만큼 차 있다');
  // 0초 — 타이머만으로는 아무것도 아니고, 화면이 들고 있는 플래시 잔여가 있을 때만 `부활!`이다.
  assert.equal(reviveNoticeState(0, 6), null);
  const flash = reviveNoticeState(0, 6, REVIVE_FLASH_SECONDS);
  assert.equal(flash.kind, 'flash');
  assert.equal(REVIVE_FLASH_SECONDS, .9, '플래시는 0.9초');
});

test('입문 1~4층은 대기 자체가 0초라 카드를 띄우지 않는다(현행 유지)', () => {
  for (const floor of [1, 2, 3, 4]) {
    assert.equal(reviveNoticeState(5, floor), null, `${floor}층은 카드 없음`);
    assert.equal(reviveNoticeState(0, floor, 1), null, `${floor}층은 플래시도 없음`);
  }
  assert.equal(reviveNoticeState(5, 5).kind, 'waiting', '5층부터 카드가 뜬다');
});

test('비정상 값은 카드 없음/비율 0~1로 자른다', () => {
  assert.equal(reviveNoticeState(Number.NaN, 6), null);
  assert.equal(reviveNoticeState(Number.POSITIVE_INFINITY, 6), null);
  assert.equal(reviveNoticeState(-3, 6), null, '음수 타이머는 대기 아님');
  assert.equal(reviveNoticeState(99, 6).seconds, 5, '전체 대기(5초)를 넘지 않는다');
  assert.equal(reviveNoticeState(99, 6).ratio, 1);
  const tiny = reviveNoticeState(.0001, 6);
  assert.equal(tiny.seconds, 1);
  assert(tiny.ratio > 0);
});

test('카드 문구는 대장님 확정안 그대로다', () => {
  assert.equal(REVIVE_CARD_DOWN, '쓰러졌습니다');
  assert.equal(REVIVE_CARD_REVIVED, '부활!');
  assert.equal(REVIVE_CARD_RESTART, '부활하면 자동 사냥이 다시 시작됩니다.');
  assert.equal(REVIVE_CARD_NOTE, '1~4층은 대기 없이 바로 부활합니다.');
  assert.equal(reviveChipText(10, 6), '10금화 손실 · 6층');
  assert.equal(reviveChipText(4, 12), '4금화 손실 · 12층', '모자라면 실제 잃은 만큼');
  assert.equal(reviveChipText(Number.NaN, 6), '0금화 손실 · 6층');
  assert.equal(reviveCountdownText(4), '4초 뒤 만혈로 부활합니다');
  assert.equal(reviveCountdownText(0), '1초 뒤 만혈로 부활합니다', '0초를 넘겨도 문구는 1초');
  assert.equal(reviveScreenReaderText(10, 6, 4), '쓰러졌습니다. 10금화 손실 · 6층. 4초 뒤 만혈로 부활합니다.');
});

test('카드가 떠 있는 동안 같은 말은 토스트로 다시 띄우지 않는다(보스 안내는 남긴다)', () => {
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃었습니다. 5초 뒤 부활합니다.'), true);
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃었습니다. 5초 뒤 부활합니다. 자동 등반은 계속됩니다.'), true);
  assert.equal(isReviveToastSuppressed('부활했습니다.'), true);
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃었습니다. 5초 뒤 부활합니다. 1마리부터 다시 잡으면 보스가 다시 나타납니다.'), false, '보스 안내는 카드에 없는 정보라 토스트로 남긴다');
  assert.equal(isReviveToastSuppressed('5마리 처치! 해골 군주가 나타납니다!'), false);
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃고 부활했습니다.'), false, '입문 즉시 부활 안내는 카드가 없을 때 쓰인다');
});

test('쓰러져 실제로 잃은 금화를 필드가 기억한다 — 카드의 손실 표시가 사실과 맞는다', () => {
  const roomy = freshSave(); roomy.floor = 6; roomy.maxFloor = 6; roomy.gold = 50; roomy.tutorial = 1;
  const world = new World(roomy);
  world.onMessage = () => {};
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1;
  world.update(.01);
  assert.equal(world.reviveTimer > 0, true);
  assert.equal(world.reviveLostGold, 10, '가진 금화가 넉넉하면 10금화');
  assert.equal(reviveChipText(world.reviveLostGold, roomy.floor), '10금화 손실 · 6층');

  const broke = freshSave(); broke.floor = 6; broke.maxFloor = 6; broke.gold = 4; broke.tutorial = 1;
  const poor = new World(broke);
  poor.onMessage = () => {};
  poor.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  poor.player.hp = 1;
  poor.update(.01);
  assert.equal(broke.gold, 0, '가진 만큼만 잃는다');
  assert.equal(poor.reviveLostGold, 4, '카드도 4금화로 말한다');
  assert.equal(reviveChipText(poor.reviveLostGold, broke.floor), '4금화 손실 · 6층');
});

test('입문 1~4층은 손실만 있고 대기 카드는 없다', () => {
  const save = freshSave(); save.floor = 3; save.maxFloor = 3; save.gold = 50; save.tutorial = 1;
  const world = new World(save);
  world.onMessage = () => {};
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1;
  world.update(.01);
  assert.equal(world.reviveTimer, 0, '대기 없이 바로 부활');
  assert.equal(world.player.hp > 0, true);
  assert.equal(world.reviveLostGold, 10);
  assert.equal(reviveNoticeState(world.reviveTimer, save.floor, 0), null, '카드는 뜨지 않는다');
});

test('화면 계약 — 카드 CSS·배선이 시안(390×844)과 같다', () => {
  const css = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
  const cardRule = css.match(/\.revive-card \{[^}]*\}/)?.[0] ?? '';
  assert.match(cardRule, /position: absolute/);
  assert.match(cardRule, /width: calc\(272 \* var\(--u\)\)/, '카드 폭 272px(390 기준)');
  assert.match(cardRule, /top: 44%/, '화면 중앙(44%)');
  assert.match(cardRule, /z-index: 4/, '모달(5)·토스트(20) 아래, 오른쪽 레일(3) 위');
  assert.match(cardRule, /pointer-events: none/, '자동 사냥 화면을 막지 않는다');
  assert.match(css, /\.revive-card \.rvc-ring \{[^}]*calc\(92 \* var\(--u\)\)/, '92px 링');
  assert.match(css, /\.revive-card \.rvc-arc \{[^}]*#e0a468/);
  assert.match(css, /\.revive-card\.is-revived/, '0초 `부활!` 플래시');
  assert.match(css, /\.battle\.is-revive-down \.battle-canvas \{[^}]*saturate/);
  assert.match(css, /\.health-bar\.hp\.is-down/, 'HP 0 강조');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*revive-card\.is-revived \{ animation: none; \}/);

  const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
  assert.match(hud, /this\.revive\?\.render\(this\);/, '매 프레임 tick이 카드를 그린다');
  const ui = readFileSync(new URL('../src/ui/reviveNotice.ts', import.meta.url), 'utf8');
  assert.match(ui, /role="status" aria-live="polite"/, '상태 표시로 읽힌다');
  assert.match(ui, /aria-hidden="true"/, '매초 바뀌는 숫자는 스크린리더에서 감춘다');
  // 본문 첫 줄의 굵은 초는 `4초`처럼 숫자+초만 — 문장을 통째로 넣으면 `5초 뒤 … 5초 뒤 …`로 겹친다
  // (2026-11-25 프리뷰 실화면에서 잡아 고쳤다).
  assert.match(ui, /this\.descCount\.textContent !== `\$\{state\.seconds\}초`/);
  assert.doesNotMatch(ui, /descCount\.textContent = desc\b/);
  const iface = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
  assert.match(iface, /isReviveToastSuppressed\(text\)/, '카드가 떠 있으면 같은 문장의 토스트를 접는다');
});
