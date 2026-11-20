import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { LegendBoard, LEGEND_ANNOUNCEMENT_WINDOW_MS, LEGEND_BANNER_MS, LEGEND_QUEUE_LIMIT, isLegendaryPouchResult, legendAnnouncementText, readLegendAnnouncement } = await import('../src/game/legendBoard.ts');

const row = (id, character, item, createdAt) => ({ id, character, item, createdAt });

test('전광판 문구는 정해진 한 줄 그대로다', () => {
  assert.equal(legendAnnouncementText('가람', '영원의 패왕의 성검'), '🎉 가람님이 보물 주머니에서 [영원의 패왕의 성검]을(를) 획득했습니다!');
  // 5~6초 머문다(사용자 확정).
  assert(LEGEND_BANNER_MS >= 5000 && LEGEND_BANNER_MS <= 6000);
});

test('레전드 장비일 때만 전광판에 올린다 — 금화·스킬북·다른 등급은 조용히 지나간다', () => {
  const legendary = { kind: 'equipment', item: { name: '영원의 패왕의 성검', rarity: 'legendary' } };
  assert.equal(isLegendaryPouchResult(legendary), true);
  assert.equal(isLegendaryPouchResult({ kind: 'equipment', item: { name: '황혼의 패왕의 성검', rarity: 'rare' } }), false);
  assert.equal(isLegendaryPouchResult({ kind: 'gold', gold: 3000 }), false);
  assert.equal(isLegendaryPouchResult({ kind: 'skillbook', item: { name: '[스킬북] 소드 슬래시' } }), false);
  assert.equal(isLegendaryPouchResult(undefined), false);
});

test('이미 본 id는 다시 띄우지 않고, 받은 순서대로 하나씩 5.5초씩 보여 준다', () => {
  const board = new LegendBoard(1000), now = 1_000_000;
  assert.equal(board.accept([row('a', '가람', '영원의 검', now - 20), row('b', '나래', '영원의 활', now - 10)], now), 2);
  assert.equal(board.accept([row('a', '가람', '영원의 검', now - 20)], now), 0, '같은 id는 두 번 세지 않는다');
  const first = board.current(now);
  assert.equal(first.id, 'a'); assert.equal(board.current(now + 900).id, 'a', '아직 1초가 지나지 않았다');
  assert.equal(board.current(now + 1001).id, 'b', '시간이 끝나면 다음 줄');
  assert.equal(board.current(now + 2500), undefined, '대기열이 비면 배너가 사라진다');
});

test('창(5분) 밖의 오래된 공지는 띄우지 않되 기억은 해 둔다', () => {
  const board = new LegendBoard(1000), now = 2_000_000;
  assert.equal(board.accept([row('old', '가람', '영원의 검', now - LEGEND_ANNOUNCEMENT_WINDOW_MS - 1)], now), 0);
  assert.equal(board.current(now), undefined);
  assert.equal(board.seen.has('old'), true);
});

test('내가 뽑은 레전드는 맨 앞에 서고, 대기열은 정해진 길이를 넘지 않는다', () => {
  const board = new LegendBoard(1000), now = 3_000_000;
  for (let index = 0; index < LEGEND_QUEUE_LIMIT + 3; index++) board.accept([row(`poll-${index}`, '나래', '영원의 활', now - 100 + index)], now);
  assert.equal(board.waiting, LEGEND_QUEUE_LIMIT, '오래된 줄부터 버린다');
  assert.equal(board.show(row('mine', '검은여우', '영원의 패왕의 성검', now)), true);
  assert.equal(board.current(now).id, 'mine', '내 소식이 먼저 뜬다');
  assert.equal(board.show(row('mine', '검은여우', '영원의 패왕의 성검', now)), false, '같은 줄은 두 번 띄우지 않는다');
});

test('서버가 준 줄은 모양을 다듬고, 쓸 수 없는 줄은 버린다', () => {
  assert.deepEqual(readLegendAnnouncement({ id: 'x', character: ' 가람 ', item: ' 영원의  검 ', createdAt: 5 }), { id: 'x', character: '가람', item: '영원의  검', createdAt: 5 });
  assert.equal(readLegendAnnouncement({ id: '', character: '가람', item: '검', createdAt: 5 }), undefined);
  assert.equal(readLegendAnnouncement({ id: 'x', character: '', item: '검', createdAt: 5 }), undefined);
  assert.equal(readLegendAnnouncement({ id: 'x', character: '가람', item: '', createdAt: 5 }), undefined);
  assert.equal(readLegendAnnouncement(null), undefined); assert.equal(readLegendAnnouncement('nope'), undefined);
  const long = readLegendAnnouncement({ id: 'x', character: '가'.repeat(40), item: '가'.repeat(80), createdAt: 5 });
  assert.equal(long.character.length, 24); assert.equal(long.item.length, 60);
});
