import type { Interface } from '../interface';
import { NOTICE_TAG_NEW, type Notice } from '../../game/notices';

/**
 * 공지사항 창 (2026-11-22, 대장님 확정 1안 — 목록형 모달).
 *
 * 오른쪽 레일의 확성기 버튼(`캐릭터` 바로 아래)이 여는 창이다. 공지 원문은 `public/notices.json`에서
 * 오고(`game/notices.ts`), 목록 카드의 붉은 `NEW` 뱃지는 **이 기기에서 아직 안 본 공지**에만 붙는다.
 * 창을 열면 그 시점의 목록을 모두 읽은 것으로 기록해 레일 `NEW`를 내리고, 같은 기기에서는 다시 붙지
 * 않는다(`notices.json`에 새 `id`가 오면 다시 붙는다).
 */

/** 목록 머리의 안내 문구 — 새 공지가 쌓이는 규칙과 NEW가 사라지는 규칙을 한 줄로 알린다. */
const NOTICE_HINT = '새 공지가 등록되면 이 목록에 쌓입니다. 한 번 열어 보면 붉은 NEW 표시가 사라집니다.';

/** 공지가 하나도 없을 때의 안내 — 파일이 비었거나 아직 못 읽었을 때 창이 텅 비어 보이지 않게 한다. */
const NOTICE_EMPTY = '등록된 공지가 없습니다.';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** 본문의 `\n` 줄을 그대로 화면 줄로 옮긴다 — 운영자가 파일에서 나눈 줄이 그대로 보인다. */
function bodyParagraphs(notice: Notice): HTMLElement[] {
  return notice.body.split('\n').map(line => element('p', 'notice-body-line', line));
}

export function renderNotice(ui: Interface, dialog: HTMLElement): void {
  const notices = ui.notices ?? [];
  const seen = ui.noticeSeen;
  const section = element('section', 'notice-content');

  // ── 목록 머리: 전체 N건 · 새 공지 N ────────────────────────────────────────
  const unread = notices.filter(notice => !seen.has(notice.id)).length;
  const summary = element('div', 'notice-summary');
  summary.append(element('span', 'notice-total', `전체 ${notices.length}건`));
  const fresh = element('span', 'notice-fresh-count');
  const dot = element('i', 'notice-fresh-dot');
  dot.hidden = unread === 0;
  fresh.append(dot, element('span', '', `새 공지 ${unread}`));
  fresh.hidden = unread === 0;
  summary.append(fresh);
  section.append(summary);

  // ── 공지 목록 ──────────────────────────────────────────────────────────────
  if (!notices.length) section.append(element('p', 'notice-note', NOTICE_EMPTY));
  for (const notice of notices) {
    const unreadNotice = !seen.has(notice.id);
    const card = element('article', `notice-card${notice.pinned ? ' notice-pinned' : ''}${unreadNotice ? ' notice-unread' : ''}`);
    const head = element('div', 'notice-card-head');
    if (notice.tag) {
      const tag = element('b', `notice-tag${notice.tag === NOTICE_TAG_NEW ? ' is-new' : ''}`, notice.tag);
      tag.hidden = !unreadNotice;
      head.append(tag);
    }
    head.append(element('b', 'notice-title', notice.title));
    if (notice.date) head.append(element('span', 'notice-date', notice.date));
    card.append(head);
    if (notice.body) {
      const body = element('div', 'notice-body');
      body.append(...bodyParagraphs(notice));
      card.append(body);
    }
    if (notice.author || notice.date) {
      card.append(element('small', 'notice-author', `${notice.author || '운영팀'}${notice.date ? ` · ${notice.date}` : ''}`));
    }
    section.append(card);
  }

  // ── 안내문 + 확인 버튼 ─────────────────────────────────────────────────────
  section.append(element('p', 'notice-note', NOTICE_HINT));
  const footer = element('div', 'notice-footer');
  footer.append(element('p', 'notice-source', '공지는 notices.json에서 읽어 목록에 쌓습니다'));
  const confirm = document.createElement('button');
  confirm.className = 'notice-confirm';
  confirm.textContent = '확인';
  confirm.type = 'button';
  confirm.onclick = () => ui.open(null);
  confirm.onclick = () => ui.open(null);
  footer.append(confirm);
  section.append(footer);
  dialog.append(section);
}

/**
 * 창을 열 때의 기록 갱신 — **열리는 순간** 지금 목록의 공지를 모두 읽은 것으로 남긴다.
 * `notice.json`을 아직 못 읽었으면(빈 목록) 기록을 바꾸지 않는다: 파일이 늦게 도착하면 그때 다시
 * 새 공지로 세어야 하므로.
 */
export function prepareNotices(ui: Interface): void {
  if (!ui.notices?.length) return;
  ui.noticeSeen = ui.markNoticesSeen();
  ui.renderNoticeBadge();
}

/** 공지 목록을 다시 읽은 뒤 레일 `NEW`를 다시 그린다. */
export function loadNotices(ui: Interface): void {
  void ui.reloadNotices();
}
