import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

// 공지사항 (2026-11-22, 대장님 확정 1안) — ① `notices.json` 원문·첫 공지 본문 ② 파서(이상한 줄 건너뛰기·
// 고정 공지 정렬) ③ 읽음 기록과 레일 `NEW` ④ 레일 버튼(캐릭터 바로 아래 2번째 칸) ⑤ 목록형 모달.
const { parseNotices, fetchNotices, readSeenNoticeIds, saveSeenNoticeIds, hasUnreadNotices, markAllNoticesSeen, NOTICES_URL, NOTICES_READ_KEY, NOTICE_TAG_NEW } = await import('../src/game/notices.ts');
const { railEntries, railMarkup } = await import('../src/ui/interface.ts');
const { MODALS } = await import('../src/ui/modalRegistry.ts');
const noticeModalSource = readFileSync(new URL('../src/ui/modals/noticeModal.ts', import.meta.url), 'utf8');
const noticeStyles = readFileSync(new URL('../src/styles/modals/notice.css', import.meta.url), 'utf8');
const modalsStyles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
const chromeSource = readFileSync(new URL('../src/ui/modalChrome.ts', import.meta.url), 'utf8');
const hudStyles = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** 노드 테스트 환경에는 `localStorage`가 없으므로, 기기 저장과 같은 모양의 가짜를 만들어 끼운다. */
function withStorage(run) {
  const store = new Map();
  const fake = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  };
  const had = 'localStorage' in globalThis;
  const backup = globalThis.localStorage;
  globalThis.localStorage = fake;
  try { store.clear(); return run(); } finally { if (had) globalThis.localStorage = backup; else delete globalThis.localStorage; }
}

/** 가짜 `fetch` — `fetchNotices`가 실제 네트워크 없이 `notices.json`의 형식을 검증하게 한다. */
function fakeFetch(body, ok = true) {
  return async () => ({ ok, json: async () => body });
}

test('notices.json의 첫 공지 본문은 확정 문구와 글자 단위로 같다', () => {
  const raw = JSON.parse(read('public/notices.json'));
  const notices = parseNotices(raw);
  assert.equal(notices.length, 1, '첫 공지 1건');
  const first = notices[0];
  assert.equal(first.title, '정식 시즌 오픈 안내');
  // 대장님 확정 원문 — 한 글자라도 다르면 안 된다(공백 포함).
  assert.equal(first.body, '정식 시즌 오픈 시 현재 랭킹 1등에게는 시즌 시작 시 막대한 보상을 지급합니다');
  assert.equal(first.author, '운영팀');
  assert.equal(first.date, '2026.11.22');
  assert.equal(first.tag, 'NEW');
  assert.equal(first.pinned, true);
});

test('공지 아이콘은 다른 유틸 아이콘과 같은 128×128 RGBA PNG다', () => {
  const png = readFileSync(new URL('../public/assets/icons/utility_notice.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 128, '너비 128');
  assert.equal(png.readUInt32BE(20), 128, '높이 128');
  assert.equal(png[25], 6, 'RGBA');
});

test('파서는 이상한 줄을 버리고, 같은 id를 한 번만 남기고, 고정 공지를 앞으로 세운다', () => {
  const notices = parseNotices({
    version: 2,
    notices: [
      { id: 'b', title: '일반 공지', date: '2026.11.20', tag: '', pinned: false, body: '일반', author: '운영팀' },
      { id: 'a', title: '고정 공지', pinned: true, body: '고정' },
      { id: 'a', title: '중복 공지', pinned: false, body: '중복' },
      { title: 'id 없음' },
      { id: '', title: '빈 id' },
      '문자열 한 줄',
      null,
      { id: 'c', title: '   ' }
    ]
  });
  assert.deepEqual(notices.map(notice => notice.id), ['a', 'b'], '고정 공지가 앞, 중복은 한 번만');
  const fixed = notices.find(notice => notice.id === 'a');
  assert.equal(fixed.tag, '', '없는 칸은 빈 문자열');
  assert.equal(fixed.pinned, true);
  assert.deepEqual(parseNotices(null), [], '파일이 아니면 빈 목록');
  assert.deepEqual(parseNotices({}), [], '공지가 없으면 빈 목록');
  assert.deepEqual(parseNotices({ notices: '문자열' }), [], '배열이 아니면 빈 목록');
});

test('fetchNotices는 실패하면 null을 돌려주고 성공하면 공지 목록을 돌려준다', async () => {
  const good = await fetchNotices(fakeFetch({ version: 1, notices: [{ id: 'x', title: '공지', body: '내용' }] }));
  assert.equal(good.length, 1);
  assert.equal(good[0].id, 'x');
  assert.equal(await fetchNotices(fakeFetch({}, false)), null, '404는 null');
  assert.equal(await fetchNotices(async () => { throw new Error('network'); }), null, '네트워크 오류는 null');
});

test('읽음 기록과 레일 NEW — 기록 없으면 NEW, 읽으면 사라지고 새 id가 오면 다시 붙는다', () => {
  withStorage(() => {
    const notices = [
      { id: 'n1', title: '첫 공지', date: '2026.11.22', tag: 'NEW', pinned: true, body: '본문', author: '운영팀' },
      { id: 'n2', title: '둘째 공지', date: '', tag: '', pinned: false, body: '', author: '' }
    ];
    assert.deepEqual([...readSeenNoticeIds()], [], '기록은 비어 시작한다');
    assert.equal(hasUnreadNotices(notices, readSeenNoticeIds()), true, '처음엔 NEW');
    const seen = markAllNoticesSeen(notices, readSeenNoticeIds());
    assert.equal(saveSeenNoticeIds(seen), true, '기기에 남긴다');
    assert.equal(hasUnreadNotices(notices, readSeenNoticeIds()), false, '다 읽으면 NEW 없음');
    const next = [...readSeenNoticeIds()].sort();
    assert.deepEqual(next, ['n1', 'n2'], '두 공지 모두 기록');
    const added = [...notices, { id: 'n3', title: '셋째 공지', date: '', tag: 'NEW', pinned: false, body: '', author: '' }];
    assert.equal(hasUnreadNotices(added, readSeenNoticeIds()), true, '새 공지가 오면 다시 NEW');
  });
});

test('레일에서 공지 버튼은 캐릭터 바로 아래(2번째 칸)고 NEW 뱃지 마크업을 싣는다', () => {
  assert.deepEqual(railEntries.map(entry => entry.modal), ['characters', 'notice', 'settings', 'mail', 'rewards', 'achievements', 'dungeon'], '캐릭터 다음, 설정 앞');
  assert.equal(railEntries[1].label, '공지사항');
  const rail = railMarkup();
  // 2번째 칸 = 캐릭터 버튼 바로 다음에 오는 버튼.
  const second = rail.match(/<\/button><button type="button" data-modal="([^"]+)"/);
  assert.equal(second?.[1], 'notice', '캐릭터 바로 아래(2번째 칸)');
  assert.match(rail, /src="\/assets\/icons\/utility_notice\.png"/, '확성기 아이콘');
  assert.match(rail, /<b class="notice-new-badge" data-notice-badge="notice" hidden><\/b>/, 'NEW 뱃지는 처음에 숨어 있다');
  assert.match(rail, /aria-label="공지사항"/, '읽기 이름');
  // 다른 유틸 버튼에는 NEW 뱃지를 달지 않는다.
  assert.doesNotMatch(rail, /data-notice-badge="settings"/, '설정 버튼에는 뱃지가 없다');
});

test('공지 모달은 등록부에 목록형으로 등록된다', () => {
  const spec = MODALS.notice;
  assert.equal(spec.title, '공지사항');
  assert.deepEqual(spec.dialogClasses, ['notice-modal']);
  assert.equal(spec.quietWhileHunting, true, '사냥 중 매 처치마다 다시 그리지 않는다');
  // 창틀 공통 규칙을 건드리지 않는다 — 클래스만 갈아 끼운다.
  assert.match(chromeSource, /'notice-modal'/, 'modalChrome이 notice-modal 클래스를 갈아 끼운다');
  // 열면(prepare) 지금 목록을 모두 읽은 것으로 남기고 레일 NEW를 내린다.
  assert.match(noticeModalSource, /export function prepareNotices/, 'prepare: 열리는 순간 읽음 기록');
  assert.match(noticeModalSource, /export function loadNotices/, 'load: 열 때 notices.json을 다시 읽는다');
  // `NOTICE` 머리글 라벨은 공통 창틀을 고치지 않고 CSS로 붙인다.
  assert.match(noticeStyles, /h2::after \{ content: 'NOTICE'/, '머리글 옆 NOTICE 라벨');
  // 모달 스타일 진입점 — base.css(공통 정규화)보다 앞에서 읽힌다.
  const noticeImport = modalsStyles.indexOf("./modals/notice.css");
  const baseImport = modalsStyles.indexOf("./modals/base.css");
  assert(noticeImport >= 0 && baseImport > noticeImport, 'notice.css는 base.css 앞에서 읽힌다');
  assert.match(modalsStyles, /@import '\.\/modals\/notice\.css';/);
});

test('공지 모달은 목록 머리·카드(NEW·제목·날짜·본문·작성자)·안내문·확인 버튼을 그린다', () => {
  // 목록 머리
  assert.match(noticeModalSource, /전체 \$\{notices\.length\}건/, '전체 N건');
  assert.match(noticeModalSource, /새 공지 \$\{unread\}/, '새 공지 N');
  // 카드
  assert.match(noticeModalSource, /notice-card/, '공지 카드');
  assert.match(noticeModalSource, /NOTICE_TAG_NEW/, 'NEW 뱃지 조건');
  assert.match(noticeModalSource, /notice-title/, '제목');
  assert.match(noticeModalSource, /notice-date/, '날짜');
  assert.match(noticeModalSource, /notice-body/, '본문');
  assert.match(noticeModalSource, /notice-author/, '작성자 줄');
  assert.match(noticeModalSource, /운영팀/, '작성자 기본값 운영팀');
  // 안내문·버튼
  assert.match(noticeModalSource, /새 공지가 등록되면 이 목록에 쌓입니다/, '안내문');
  assert.match(noticeModalSource, /notice-confirm/, '확인 버튼');
  assert.match(noticeModalSource, /ui\.open\(null\)/, '확인은 창을 닫는다');
  // 스타일 — 금테 + 왼쪽 금색 바, 폭 380px
  assert.match(noticeStyles, /\.modal-dialog\.notice-modal \{ width: min\(100%, 380px\)/, '폭 380px');
  assert.match(noticeStyles, /inset 3px 0 #b38c52/, '왼쪽 금색 바');
  assert.match(noticeStyles, /notice-tag[^{]*\{[^}]*#cf5340/, '붉은 NEW 뱃지');
  // 레일 NEW 뱃지 규칙은 hud 레일과 같은 자리 규칙을 따른다.
  assert.match(noticeStyles, /\.utility-nav \.notice-new-badge[^{]*\{[^}]*position: absolute/, '레일 뱃지 absolute');
});

test('notices.json은 maintenance.json과 같은 방식의 정적 자산이다', () => {
  const source = read('src/game/notices.ts');
  assert.match(source, /export const NOTICES_URL = '\/notices\.json'/, '정적 자산 경로');
  assert.match(source, /cache: 'no-store'/, '캐시 없이 다시 읽는다');
  assert.match(source, /localStorage/, '읽음 기록은 이 기기 저장소');
  // 저장소 키는 다른 기기 저장 키와 같은 djrpg 계열이다.
  assert.match(NOTICES_READ_KEY, /^djrpg/);
  // 세이브 계약을 건드리지 않는다 — server·store.ts 수정 없음.
  const interfaceSource = read('src/ui/interface.ts');
  assert.match(interfaceSource, /reloadNotices/, '시작할 때·열 때 다시 읽는다');
  assert.equal(NOTICES_URL, '/notices.json');
  assert.equal(NOTICE_TAG_NEW, 'NEW');
});
