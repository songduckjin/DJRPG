import { randomUUID } from 'node:crypto';

/**
 * 보물 주머니 레전드 전광판 (작업 208, `#3965`).
 *
 * 정식 계정이 보물 주머니에서 **레전드 장비**를 뽑으면 `djrpg_announcements`에 한 줄을 남기고,
 * 접속 중인 모든 계정은 짧은 폴링(`action:'announcements'`)으로 최근 공지를 받아 화면 위 전광판에
 * 띄운다. 게스트는 서버에 쓰지 않고 자기 화면에만 보여 준다.
 */
/** 이보다 오래된 공지는 내려보내지 않는다 — 접속이 늦은 사람에게 지난 소식이 쏟아지지 않게. */
export const ANNOUNCEMENT_WINDOW_MS = 5 * 60_000;
/** 표는 하루치만 남긴다(전광판은 최근 몇 분만 쓰므로 정리용이다). */
export const ANNOUNCEMENT_KEEP_MS = 24 * 3600_000;
export const ANNOUNCEMENT_MAX_ITEM = 60;
export const ANNOUNCEMENT_MAX_CHARACTER = 24;
/** 같은 계정이 5초 안에 두 번 올린 것은 한 번으로 본다(연타·재전송 방지). */
export const ANNOUNCEMENT_DEDUPE_MS = 5_000;

export const announcementView = row => ({ id: String(row.id), character: String(row.character), item: String(row.item), createdAt: Number(row.created_at) });

/** 최근 공지 — 오래된 것부터(그 순서대로 띄운다) 최대 20줄. */
export async function recentAnnouncements(db, now = Date.now()) {
  const rows = (await db.execute({
    sql: 'SELECT id,character,item,created_at FROM djrpg_announcements WHERE created_at>=? ORDER BY created_at ASC, id ASC LIMIT 20',
    args: [now - ANNOUNCEMENT_WINDOW_MS]
  })).rows;
  return { now, windowMs: ANNOUNCEMENT_WINDOW_MS, announcements: rows.map(announcementView) };
}

/** 아이템 이름을 전광판에 쓸 수 있는 한 줄로 다듬는다. 쓸 수 없으면 undefined. */
export function announcedItemName(value, maxLength = ANNOUNCEMENT_MAX_ITEM) {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/\s+/g, ' ').trim();
  return name && name.length <= maxLength ? name : undefined;
}

export function announcedCharacterName(value) {
  const name = announcedItemName(value, ANNOUNCEMENT_MAX_CHARACTER);
  return name || '모험가';
}

/**
 * 레전드 획득 공지를 적는다. 같은 계정의 직전 공지가 5초 안이면 새로 적지 않고 그 줄을 돌려준다
 * (요청 재전송·연타로 두 줄이 뜨지 않게). `db`는 쓰기 연결이어야 한다.
 */
export async function announcePouchLegend(db, { accountId, character, item }, now = Date.now()) {
  const recent = (await db.execute({
    sql: 'SELECT id,character,item,created_at FROM djrpg_announcements WHERE account_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 1',
    args: [accountId, now - ANNOUNCEMENT_DEDUPE_MS]
  })).rows[0];
  if (recent) return { ok: true, duplicate: true, announcement: announcementView(recent) };
  const row = { id: randomUUID(), account_id: accountId, character: announcedCharacterName(character), item, created_at: now };
  await db.batch([
    { sql: 'INSERT INTO djrpg_announcements(id,account_id,character,item,created_at) VALUES (?,?,?,?,?)', args: [row.id, row.account_id, row.character, row.item, row.created_at] },
    { sql: 'DELETE FROM djrpg_announcements WHERE created_at<?', args: [now - ANNOUNCEMENT_KEEP_MS] }
  ]);
  return { ok: true, duplicate: false, announcement: announcementView(row) };
}
