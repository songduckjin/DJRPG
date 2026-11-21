/**
 * 계정 행·세션·revision (작업 260 — `server/database.mjs` 5분할).
 *
 * 옮긴 것이 목적이므로 SQL·에러 코드는 종전과 같다. 특히 다음 네 가지는 **바꾸면 안 되는 계약**이다.
 *  - `assertRevision` → `409 SAVE_CONFLICT`
 *  - `assertSession`/`assertSessionId` → `401 SESSION_REPLACED`(세션 번호가 없는 예전 계정은 통과)
 *  - `decodeAccount`가 골드를 `djrpg_account_profiles.shared_gold`로 덮어쓴다(캐릭터 세이브에 골드가 없다)
 *  - `account()`가 행이 없으면 프로필·캐릭터 1번 행을 만들어 준다(가입 직후 자기 복구 경로)
 */
import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';

/**
 * 계정 한 행 읽기 — `account()`와 **같은 SELECT**를 다른 읽기와 한 묶음(`tx.batch`)에 넣을 수 있게 문장으로 노출한다
 * (작업 258 — 공용창고가 계정·재요청·창고·소유권·여정 상태를 왕복 1번으로 읽는다). 행이 없으면 `account()`를
 * 그대로 불러 프로필·캐릭터 행을 만들어 주는 예전 경로를 탄다.
 */
export const accountQuery = id => ({ sql: `SELECT a.*, p.shared_gold, p.active_slot, COALESCE(w.max_slots,3) AS max_slots, c.save_json AS character_json, c.updated_at AS character_updated_at, COALESCE(v.revision,0) AS revision,
      d.cleared_floor AS dungeon_record_floor, d.cleared_at AS dungeon_record_at
    FROM djrpg_accounts a JOIN djrpg_account_profiles p ON p.account_id=a.id
    JOIN djrpg_characters c ON c.account_id=a.id AND c.slot=p.active_slot
    LEFT JOIN djrpg_shop_wallet w ON w.account_id=a.id
    LEFT JOIN djrpg_save_versions v ON v.account_id=a.id
    LEFT JOIN djrpg_dungeon_records d ON d.account_id=a.id WHERE a.id=?`, args: [id] });

export async function account(tx, id) {
  // 던전 기록도 같은 읽기에 실어 둔다 — `writeSave`가 세이브의 최고층을 검증된 기록과 대조해야 하는데,
  // 저장마다 왕복을 하나 더 쓰지 않기 위해서다.
  const query = accountQuery(id);
  let row = (await tx.execute(query)).rows[0];
  if (row) return decodeAccount(row);
  await tx.batch([
    { sql: `INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot)
      SELECT id,COALESCE(CAST(json_extract(save_json,'$.gold') AS INTEGER),0),1 FROM djrpg_accounts WHERE id=? AND json_valid(save_json)`, args: [id] },
    { sql: `INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at)
      SELECT id,1,json_remove(save_json,'$.gold'),updated_at FROM djrpg_accounts WHERE id=? AND json_valid(save_json)`, args: [id] }
  ]);
  row = (await tx.execute(query)).rows[0];
  return decodeAccount(row);
}

export function decodeAccount(row) {
  if (!row) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  const save = JSON.parse(row.character_json ?? row.save_json);
  save.gold = Number(row.shared_gold ?? save.gold ?? 0);
  return { ...row, revision: Number(row.revision), slot: Number(row.active_slot ?? 1), save };
}

export const sessionReplaced = () => fail(401, 'SESSION_REPLACED', '다른 기기에서 로그인되어 접속이 해제되었습니다.');

// 세션 번호가 없는 예전 계정・모킹 행은 기존 토큰을 그대로 허용하고, 번호가 있는 계정만 마지막 로그인 토큰을 인정한다.
export function assertSession(row, sid) {
  const current = row?.session_id;
  if (current === undefined || current === null || current === '') return;
  if (typeof sid !== 'string' || sid !== current) sessionReplaced();
}

export async function assertSessionId(db, id, sid) {
  const row = (await db.execute({ sql: 'SELECT session_id FROM djrpg_accounts WHERE id=?', args: [id] })).rows[0];
  if (!row) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  assertSession(row, sid);
}

// register・guest・login마다 새 세션 번호를 발급해 이전 기기 토큰을 무효화한다.
export async function assignSession(db, id) {
  const sid = randomUUID();
  await db.execute({ sql: 'UPDATE djrpg_accounts SET session_id=? WHERE id=?', args: [sid, id] });
  return sid;
}

export function assertRevision(row, revision) {
  if (!Number.isSafeInteger(revision) || revision !== row.revision) fail(409, 'SAVE_CONFLICT', '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 새로고침하여 최신 데이터를 불러오세요.');
}
