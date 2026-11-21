/**
 * 게스트 계정 24시간 자동 삭제 — 작업 259.
 *
 * 게스트(`djrpg_accounts.password_hash='guest'`)는 비밀번호가 없어 다시 로그인할 수 없고, 토큰을 잃으면
 * 그대로 버려진다. 그래서 놀다 나간 게스트의 세이브·캐릭터·창고 행이 DB에 영원히 쌓였다(계정 89건 중
 * 상당수가 게스트). 마지막 활동(`updated_at`)이 24시간보다 오래된 게스트를 계정 탈퇴와 **같은 한 벌**
 * (`deleteAccountData`)로 지운다 — 표를 하나라도 남기면 다음 게스트가 같은 id를 물려받는 일이 생긴다.
 *
 * `updated_at`은 세이브(`writeSave`)·캐릭터 생성/선택 때 서버 시각으로 갱신되고, 클라이언트는 바뀐 진행을
 * 10초마다 저장한다(`src/main.ts` `sync.flushIfDirty`). 그래서 24시간 동안 갱신이 없었다 = 그동안
 * 접속하지 않았다로 본다. 토큰을 24시간 넘게 들고 있는 게스트가 놀던 도중에 지워지지 않도록 `load`가
 * `updated_at`이 1시간 넘게 낡았으면 갱신한다(`touchGuestActivity`).
 *
 * 언제 도나 — 요청마다 DB를 치지 않도록 워커 아이솔레이트 안에서 5분 쿨다운을 둔다.
 * ① 게스트 입장(`action:'guest'`)이 새 게스트를 만들기 전에 최대 `limit`건(기본 5 — 입장 지연을 묶는다).
 * ② 관리자 포털(`view=status|accounts`)은 `force`로 최대 25건을 먼저 정리하고 나서 집계·목록을 낸다.
 */

import { transaction } from './database.mjs';
import { deleteAccountData } from './account-delete.mjs';

/** 게스트 계정 수명 — 마지막 활동에서 이만큼 지나면 지운다. */
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** 같은 아이솔레이트에서 정리를 다시 돌리기까지의 최소 간격. */
export const GUEST_CLEANUP_COOLDOWN_MS = 5 * 60 * 1000;
/** 게스트 `load`가 `updated_at`을 다시 찍는 간격(살아 있는 게스트가 지워지지 않게). */
export const GUEST_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
/** 한 번에 지우는 기본 상한 — 게스트 입장 응답이 오래 걸리지 않을 만큼. */
export const GUEST_CLEANUP_LIMIT = 5;
/** 관리자 포털이 한 번에 정리하는 상한(화면을 열 때 한 번만 돈다). */
export const GUEST_ADMIN_CLEANUP_LIMIT = 25;

/**
 * 아이솔레이트별 마지막 정리 시각. 아이솔레이트가 살아 있는 동안만 유지되는 값이라 여러 워커가
 * 각자 한 번씩은 돌지만, 그 이상 요청마다 DB를 치지 않게 막아 준다.
 */
let lastCleanupAt = 0;

const logError = (event, id, error) => console.error(JSON.stringify({
  event,
  ...(id ? { id: String(id).slice(0, 64) } : {}),
  name: error?.name ?? 'Error',
  message: String(error?.message ?? error).slice(0, 160)
}));

/**
 * 마지막 활동이 `now - GUEST_TTL_MS`보다 오래된 게스트를 지운다.
 *
 * - `limit`: 이번에 지울 최대 건수(1~200으로 자른다).
 * - `cooldownMs`·`force`: 쿨다운. `force`면 쿨다운을 건너뛴다(관리자 포털).
 * - 계정 하나가 실패해도 나머지는 계속 지운다(`guest_cleanup_error` 로그 한 줄, id만 남기고 세이브·토큰은 넣지 않는다).
 * - 정리 실패가 게스트 입장·관리자 조회를 막지 않도록 이 함수는 던지지 않는다.
 */
export async function cleanupExpiredGuests(db, { now = Date.now(), limit = GUEST_CLEANUP_LIMIT, cooldownMs = GUEST_CLEANUP_COOLDOWN_MS, force = false } = {}) {
  if (!force && lastCleanupAt > 0 && now - lastCleanupAt < cooldownMs) return { deletedCount: 0, deletedIds: [], skipped: true };
  // 조회 전에 시각을 적어 둔다 — 같은 아이솔레이트로 들어온 동시 요청이 같은 정리를 또 돌리지 않게.
  lastCleanupAt = now;
  const take = Math.max(1, Math.min(200, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : GUEST_CLEANUP_LIMIT));
  let rows;
  try {
    // `updated_at`은 `new Date().toISOString()`(UTC ISO-8601)이라 사전순 비교가 곧 시간 비교다.
    rows = (await db.execute({
      sql: "SELECT id FROM djrpg_accounts WHERE password_hash='guest' AND updated_at < ? ORDER BY updated_at ASC LIMIT ?",
      args: [new Date(now - GUEST_TTL_MS).toISOString(), take]
    })).rows;
  } catch (error) {
    logError('guest_cleanup_query_failed', undefined, error);
    return { deletedCount: 0, deletedIds: [], failed: true };
  }
  const deletedIds = [];
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id) continue;
    try {
      await transaction(db, tx => deleteAccountData(tx, id));
      deletedIds.push(id);
    } catch (error) {
      logError('guest_cleanup_error', id, error);
    }
  }
  return { deletedCount: deletedIds.length, deletedIds };
}

/**
 * 게스트가 `load`할 때 활동 시각을 다시 찍는다 — 1시간 안에 이미 찍었으면 아무것도 하지 않는다(읽기 경로에
 * 쓰기를 더하지 않는다). 일반 계정은 대상이 아니다(24시간 정리의 대상이 아니다).
 */
export async function touchGuestActivity(db, row, now = Date.now()) {
  if (String(row?.password_hash ?? '') !== 'guest') return false;
  const id = typeof row?.id === 'string' ? row.id : '';
  if (!id) return false;
  const last = Date.parse(String(row?.updated_at ?? ''));
  if (Number.isFinite(last) && now - last < GUEST_TOUCH_INTERVAL_MS) return false;
  try {
    await db.execute({ sql: 'UPDATE djrpg_accounts SET updated_at=? WHERE id=?', args: [new Date(now).toISOString(), id] });
    return true;
  } catch (error) {
    logError('guest_touch_error', id, error);
    return false;
  }
}
