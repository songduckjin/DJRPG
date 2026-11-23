import type { Interface } from './interface';
import { hasUnreadNotices } from '../game/notices';

/**
 * 공지 레일 뱃지 (2026-11-22, 1안) — 오른쪽 레일 `공지사항` 버튼의 붉은 `NEW`.
 *
 * 읽지 않은 공지가 있을 때만 띄우고, 공지창(`noticeModal`)을 열어 읽으면 내려간다. 우편·보상의
 * 새 소식 점(`[data-utility-dot]`)과 같은 자리 규칙을 쓰지만, 그 점은 동그라미이고 이것은 글자
 * 뱃지라 별도 마크업(`[data-notice-badge]`)을 쓴다. 버튼이 아직 화면에 없으면(테스트 등) 조용히
 * 지나간다.
 */
export function renderNoticeBadge(this: Interface): void {
  const badge = this.root.querySelector<HTMLElement>('[data-notice-badge]');
  if (!badge) return;
  const unread = hasUnreadNotices(this.notices ?? [], this.noticeSeen);
  badge.hidden = !unread;
  badge.textContent = 'NEW';
}
