import { client, schema, transaction, account, assertRevision, assertSession, assignSession, healStaleLoadItems, reconcileItems, writeSave, fail } from '../database.mjs';
import { initialSave, jobOf, jobs } from '../save-seed.mjs';
import { runSeasonReset } from '../season.mjs';
import { deleteAccountData } from '../account-delete.mjs';
import { sharedConnection } from '../connection.mjs';
import { createTrace, logRequest } from '../metrics.mjs';
import { elapsedSince } from '../save-guard.mjs';
import { randomUUID } from 'node:crypto';
import { tokenPayload, tokenFor, hashPassword, verifyPassword, needsPasswordUpgrade } from '../auth.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';

const namePattern = /^[가-힣a-zA-Z0-9_]{2,16}$/;
const bad = (_res, status, code, error) => json({ code, error }, status);
/**
 * 캐릭터 목록 카드의 외형용 최소 장비 정보(작업 210).
 *
 * 카드는 필드·장비창과 같은 합성 초상화(투구·갑옷/로브·무기/활/지팡이)를 그리므로 장비 **이름**이
 * 필요하다. 세이브 전체를 내려보내지 않고 외형 슬롯 3개의 이름만 짧게 잘라 보낸다(능력치·가방·계정
 * 정보 없음). 이름은 외형 티어 판별(`baseItemIndex`)에만 쓰인다.
 */
const portraitEquipment = save => {
  const pick = slot => {
    const item = save?.equipment?.[slot];
    const name = item && typeof item === 'object' && typeof item.name === 'string' ? item.name.trim().slice(0, 40) : '';
    return name ? { name } : null;
  };
  return { helmet: pick('helmet'), armor: pick('armor'), weapon: pick('weapon') };
};
/**
 * 신규 가입 직후의 **아직 만들지 않은 캐릭터**(작업 216).
 *
 * 가입 단계에서는 아이디·비밀번호만 받으므로 이름·직업·성별이 없다. 계정 행은 `initialSave`를 그대로
 * 들고 있지만(세션 응답 형식·`account()` 자기 복구 계약 유지) 이 표시가 붙은 세이브는 캐릭터가 없는
 * 것으로 본다: 목록에서 빼고, `load`는 `needsCharacter: true`로 알리며, `createCharacter`가 그 슬롯을
 * 덮어쓸 수 있게 한다. 세이브를 읽는 쪽은 이 필드를 모르는 채 지나가므로 기존 세이브와 호환된다.
 */
const isUncreated = save => save?.uncreated === true;
const uncreatedIn = json => { try { return isUncreated(JSON.parse(json)); } catch { return false; } };
const offlineSeconds = updatedAt => {
  const elapsed = Math.floor((Date.now() - Date.parse(String(updatedAt))) / 1000);
  return Number.isFinite(elapsed) && elapsed >= 60 ? Math.min(43_200, elapsed) : 0;
};
const idleSecondsUntil = (updatedAt, end) => {
  const elapsed = Math.floor((end - Date.parse(String(updatedAt))) / 1000);
  return Number.isFinite(elapsed) && elapsed >= 60 ? Math.min(43_200, elapsed) : 0;
};
const pendingOfflineSeconds = async (db, id, slot, updatedAt) => {
  const claim = (await db.execute({ sql: 'SELECT quantity FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key=?', args: [id, `idle_claim_${slot}`] })).rows[0];
  return claim ? Math.min(43_200, Number(claim.quantity) + offlineSeconds(updatedAt)) : offlineSeconds(updatedAt);
};
/**
 * 요청 한 건의 계측(작업 209)을 둘러 입힌 입구. `Server-Timing` 헤더와 구조화 로그 한 줄을 남기고,
 * 세이브 본문·토큰은 로그에 넣지 않는다.
 */
export async function accountEndpoint(request, options = {}) {
  const context = { trace: createTrace(), action: '', code: '', clamped: 0 };
  const response = await accountHandler(request, options, context);
  try { response?.headers?.set('Server-Timing', context.trace.header()); } catch { /* 헤더를 못 붙여도 응답은 그대로 */ }
  logRequest({ path: '/api/account', action: context.action, status: response?.status, trace: context.trace, code: context.code, clamped: context.clamped });
  return response;
}
async function accountHandler(request, { env = runtimeEnv(), createDbClient, legacyVerifier } = {}, context) {
  const res = { status: status => ({ json: body => json(body, status) }) };
  const req = { method: request.method, headers: { authorization: request.headers.get('authorization') }, body: await readBody(request) };
  if (req.method !== 'POST') return bad(res, 405, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용합니다.');
  const outdated = versionGuard(request);
  if (outdated) return outdated;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return bad(res, 503, 'DB_NOT_CONFIGURED', '서버 DB가 설정되지 않았습니다. 관리자에게 문의하세요.');
  let db;
  try {
    db = createDbClient ? createDbClient(env) : await sharedConnection(env);
    if (createDbClient) await context.trace.step('schema', () => schema(db, env));
    // 시즌 초기화(작업 206): 운영 호스트에서만, `season_epoch`가 오를 때 딱 한 번 돈다.
    await runSeasonReset(db, request, env);
    const body = req.body ?? {};
    const action = body.action;
    context.action = typeof action === 'string' ? action : '';
    if (action === 'register' || action === 'guest') {
      const id = action === 'guest' ? `guest_${randomUUID()}` : String(body.loginId ?? '').trim();
      const password = body.password;
      const gender = body.gender === 'female' ? 'female' : 'male';
      // [작업 216] 신규 가입은 **아이디·비밀번호만** 받는다(직업·성별은 캐릭터 생성 화면에서 고른다).
      // 예전 클라이언트가 gender·job을 함께 보내면 그대로 받아 자리표시자에 넣어 두되, 필수는 아니다.
      if (action === 'register' && (!namePattern.test(id) || typeof password !== 'string' || password.length < 8 || password.length > 72 || (body.gender !== undefined && !['male', 'female'].includes(body.gender)) || (body.job !== undefined && !jobs.includes(body.job)))) return bad(res, 400, 'INVALID_ACCOUNT', '아이디는 한글·영문·숫자·밑줄 2~16자, 비밀번호는 8~72자로 입력하세요.');
      // 가입 직후에는 캐릭터가 **0개**다 — 계정 행의 세이브는 자리표시자(`uncreated`)이고
      // `djrpg_characters`에는 행을 넣지 않는다. 게스트는 종전대로 1번 슬롯 캐릭터를 바로 만든다.
      const needsCharacter = action === 'register';
      const save = needsCharacter
        ? { ...initialSave(id, gender, id, body.job), uncreated: true }
        : initialSave(id, gender, '모험가', body.job);
      const sid = randomUUID();
      try {
        const statements = [
          { sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at,session_id) VALUES (?,?,?,?,?)', args: [id, action === 'guest' ? 'guest' : await hashPassword(password), JSON.stringify(save), new Date().toISOString(), sid] },
          { sql: 'INSERT INTO djrpg_account_profiles(account_id,shared_gold,active_slot) VALUES (?,?,1)', args: [id, 0] },
          { sql: 'INSERT INTO djrpg_shop_wallet(account_id,customer_key) VALUES (?,?)', args: [id, randomUUID()] }
        ];
        // 가입 직후 캐릭터 0개 — 자리표시자는 계정 행에만 있고, 캐릭터 생성 때 그 슬롯을 덮어쓴다.
        if (!needsCharacter) statements.push({ sql: 'INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,1,?,?)', args: [id, JSON.stringify({ ...save, gold: undefined }), new Date().toISOString()] });
        await db.batch(statements, 'write');
      }
      catch (error) { if (/UNIQUE|constraint/i.test(String(error))) return bad(res, 409, 'ACCOUNT_EXISTS', '이미 사용 중인 아이디입니다.'); throw error; }
      return res.status(200).json({ accountId: id, loginId: action === 'guest' ? '게스트' : id, gender, job: save.job, guest: action === 'guest', token: tokenFor(id, env, sid), save, revision: 0, characterSlot: 1, ...(needsCharacter ? { needsCharacter: true } : {}) });
    }
    if (action === 'login') {
      const id = String(body.loginId ?? '').trim();
      if (!namePattern.test(id) || typeof body.password !== 'string') return bad(res, 400, 'INVALID_ACCOUNT', '아이디와 비밀번호를 입력하세요.');
      const row = (await db.execute({ sql: 'SELECT id,password_hash,save_json,updated_at FROM djrpg_accounts WHERE id = ?', args: [id] })).rows[0];
      const legacy = row && needsPasswordUpgrade(row.password_hash);
      // 작업 224(`#6466`·`#6486`·`#6510`): 구형 `salt:hex` 해시는 **서버 안에서** 직접 검증한다.
      // 예전에는 외부 Vercel(`legacyVerifier`)에 먼저 물었는데, Workers의 `fetch`가 `cache:'no-store'`를
      // 거부해 틀린 비밀번호도 503이 됐다. 이제 서버 scrypt(순수 JS 폴백 포함)로 결정하고,
      // 내부 검증이 아예 돌지 않는 런타임에서만 외부 검증을 마지막 수단으로 쓴다.
      let valid = false;
      if (row) {
        if (!legacy) valid = await verifyPassword(body.password, row.password_hash);
        else {
          let local;
          try { local = await verifyPassword(body.password, row.password_hash); }
          catch { local = undefined; }
          valid = local !== undefined ? local : legacyVerifier ? await legacyVerifier(row.id, body.password, env) : false;
        }
      }
      if (!valid) return bad(res, 401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
      if (needsPasswordUpgrade(row.password_hash)) {
        const upgraded = await hashPassword(body.password);
        await db.execute({ sql: 'UPDATE djrpg_accounts SET password_hash=? WHERE id=? AND password_hash=?', args: [upgraded, row.id, row.password_hash] });
      }
      const latest = await account(db, row.id);
      const save = latest.save;
      const sid = await assignSession(db, row.id);
      return res.status(200).json({ revision: latest.revision, accountId: row.id, loginId: row.id, gender: save.gender, job: jobOf(save.job), guest: false, token: tokenFor(row.id, env, sid), save, characterSlot: latest.slot, needsSetup: save.needsSetup === true, offlineSeconds: await pendingOfflineSeconds(db, row.id, latest.slot, latest.character_updated_at), ...(isUncreated(save) ? { needsCharacter: true } : {}) });
    }
    const signed = tokenPayload(request, env);
    if (!signed) return bad(res, 401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    const id = signed.id;
    const row = await account(db, id);
    assertSession(row, signed.sid);
    if (action === 'load') {
      // 소유권 테이블과 어긋난 유령 아이템을 내려보내지 않는다. 그대로 내려보내면 클라이언트의 다음 save가 영구 409가 된다.
      const save = await healStaleLoadItems(db, row);
      return res.status(200).json({ revision: row.revision, accountId: row.id, loginId: row.password_hash === 'guest' ? '게스트' : row.id, gender: save.gender, job: jobOf(save.job), guest: row.password_hash === 'guest', token: req.headers.authorization.slice(7), save, characterSlot: row.slot, needsSetup: save.needsSetup === true, offlineSeconds: await pendingOfflineSeconds(db, row.id, row.slot, row.character_updated_at), ...(isUncreated(save) ? { needsCharacter: true } : {}) });
    }
    if (action === 'characters') {
      const characters = (await db.execute({ sql: `SELECT slot, save_json, json_extract(save_json,'$.name') AS name, json_extract(save_json,'$.gender') AS gender, json_extract(save_json,'$.job') AS job,
        json_extract(save_json,'$.level') AS level, json_extract(save_json,'$.floor') AS floor, updated_at FROM djrpg_characters WHERE account_id=? ORDER BY slot`, args: [id] })).rows;
      // 자리표시자(가입 직후 아직 만들지 않은 슬롯)는 캐릭터로 세지 않는다 — 목록에서 빼면 그 슬롯이
      // `+ 새 캐릭터 만들기`로 보여 그대로 생성 화면으로 이어진다(작업 216).
      const created = characters.filter(character => !uncreatedIn(character.save_json));
      const entitlement = (await db.execute({ sql: "SELECT expires_at FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key='all_idle_30d'", args: [id] })).rows[0];
      const claims = (await db.execute({ sql: "SELECT entitlement_key,quantity FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key LIKE 'idle_claim_%'", args: [id] })).rows;
      const claimBySlot = new Map(claims.map(claim => [Number(String(claim.entitlement_key).slice('idle_claim_'.length)), Number(claim.quantity)]));
      const allIdleExpiresAt = Number(entitlement?.expires_at ?? 0);
      const now = Date.now();
      return res.status(200).json({ characters: created.map(({ save_json, updated_at, ...character }) => {
        const save = JSON.parse(save_json);
        return { ...character, job: jobOf(character.job), equipment: portraitEquipment(save), itemCount: (Array.isArray(save.bag) ? save.bag.length : 0) + Object.values(save.equipment ?? {}).filter(Boolean).length,
          idleSeconds: Number(character.slot) !== row.slot ? Math.min(43_200, (claimBySlot.get(Number(character.slot)) ?? 0) +
            (allIdleExpiresAt > Date.parse(String(updated_at)) ? idleSecondsUntil(updated_at, Math.min(now, allIdleExpiresAt)) : 0)) : 0 };
      }), activeSlot: row.slot, maxSlots: Number(row.max_slots ?? 3), revision: row.revision, allIdleExpiresAt });
    }
    if (action === 'deleteCharacter') {
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 9) return bad(res, 400, 'INVALID_SLOT', '캐릭터 슬롯이 올바르지 않습니다.');
      const result = await transaction(db, async tx => {
        const latest = await account(tx, id);
        assertSession(latest, signed.sid);
        assertRevision(latest, body.revision);
        if (slot === latest.slot) fail(409, 'ACTIVE_CHARACTER', '현재 사용 중인 캐릭터는 다른 캐릭터를 선택한 뒤 삭제하세요.');
        const target = (await tx.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=?', args: [id, slot] })).rows[0];
        if (!target) fail(404, 'EMPTY_SLOT', '이미 비어 있는 슬롯입니다.');
        const count = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_characters WHERE account_id=?', args: [id] })).rows[0];
        if (Number(count.n) <= 1) fail(409, 'LAST_CHARACTER', '마지막 캐릭터는 삭제할 수 없습니다.');
        const name = JSON.parse(target.save_json).name;
        if (body.name !== name) fail(400, 'CHARACTER_NAME_MISMATCH', '캐릭터 이름을 다시 확인하세요.');
        await tx.execute({ sql: `UPDATE djrpg_item_owners SET location='consumed' WHERE account_id=? AND location='inventory' AND item_id IN
          (SELECT item_id FROM djrpg_character_item_owners WHERE account_id=? AND slot=?)`, args: [id, id, slot] });
        await tx.execute({ sql: 'DELETE FROM djrpg_character_item_owners WHERE account_id=? AND slot=?', args: [id, slot] });
        await tx.execute({ sql: 'DELETE FROM djrpg_characters WHERE account_id=? AND slot=?', args: [id, slot] });
        await tx.execute({ sql: 'DELETE FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key=?', args: [id, `idle_claim_${slot}`] });
        await tx.execute({ sql: 'INSERT INTO djrpg_save_versions(account_id,revision) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision', args: [id, latest.revision + 1] });
        return { ok: true, revision: latest.revision + 1 };
      });
      return res.status(200).json(result);
    }
    if (action === 'deleteAccount') {
      // 계정 탈퇴(작업 223): 지금 로그인한 세션 + 비밀번호 재확인 + 아이디 확인을 모두 통과해야 한다.
      // 지운 뒤에는 같은 아이디로 바로 다시 가입할 수 있어야 하므로, 계정에 매달린 표를 한 트랜잭션에서
      // 모두 비운다(`server/account-delete.mjs`). 게스트는 비밀번호가 없어 토큰(세션)만으로 확인한다.
      const guest = row.password_hash === 'guest';
      const expected = guest ? '게스트' : row.id;
      if (!guest && (typeof body.password !== 'string' || !body.password || !(await verifyPassword(body.password, row.password_hash)))) return bad(res, 401, 'INVALID_CREDENTIALS', '비밀번호가 올바르지 않습니다.');
      if (String(body.confirmId ?? '').trim().toLocaleLowerCase('ko-KR') !== String(expected).toLocaleLowerCase('ko-KR')) return bad(res, 400, 'ACCOUNT_ID_MISMATCH', `확인을 위해 ${guest ? '게스트' : '아이디'}를 정확히 입력하세요.`);
      const deleted = await transaction(db, async tx => {
        const latest = await account(tx, id);
        assertSession(latest, signed.sid);
        return deleteAccountData(tx, id);
      });
      return res.status(200).json({ ok: true, deleted });
    }
    if (action === 'selectCharacter' || action === 'createCharacter') {
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 9) return bad(res, 400, 'INVALID_SLOT', '캐릭터 슬롯이 올바르지 않습니다.');
      const result = await transaction(db, async tx => {
        const latest = await account(tx, id);
        assertSession(latest, signed.sid);
        assertRevision(latest, body.revision);
        if (slot > Number(latest.max_slots ?? 3)) fail(403, 'SLOT_LOCKED', '추가 슬롯을 먼저 구매하세요.');
        // 방금 고른·만든 캐릭터의 세이브를 그대로 응답에 실어 보낸다(작업 226). 예전에는 트랜잭션 끝에
        // `account()`를 한 번 더 읽어 같은 행을 다시 가져왔다.
        let characterSave;
        let switchedAt;
        if (action === 'createCharacter') {
          const name = String(body.name ?? '').trim();
          if (!namePattern.test(name) || !['male', 'female'].includes(body.gender) || (body.job !== undefined && !jobs.includes(body.job))) fail(400, 'INVALID_CHARACTER', '이름은 한글·영문·숫자·밑줄 2~16자로 입력하고 성별과 직업을 선택하세요.');
          const exists = (await tx.execute({ sql: 'SELECT slot, save_json FROM djrpg_characters WHERE account_id=? AND slot=?', args: [id, slot] })).rows[0];
          // 가입 직후의 자리표시자는 캐릭터가 아니다 — 그 슬롯은 새 캐릭터로 덮어쓴다(작업 216).
          const placeholder = exists && uncreatedIn(exists.save_json);
          if (exists && !placeholder) fail(409, 'SLOT_OCCUPIED', '이미 사용 중인 슬롯입니다. 목록을 새로 확인하세요.');
          const save = initialSave(id, body.gender, name, body.job);
          characterSave = { ...save, gold: undefined };
          switchedAt = new Date().toISOString();
          if (placeholder) {
            // 계정 행의 자리표시자도 같은 세이브로 바꿔 둔다(자기 복구 경로가 자리표시자를 다시 만들지 않게).
            await tx.execute({ sql: 'UPDATE djrpg_characters SET save_json=?, updated_at=? WHERE account_id=? AND slot=?', args: [JSON.stringify(characterSave), switchedAt, id, slot] });
            await tx.execute({ sql: 'UPDATE djrpg_accounts SET save_json=?, updated_at=? WHERE id=?', args: [JSON.stringify(save), switchedAt, id] });
          }
          else await tx.execute({ sql: 'INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: [id, slot, JSON.stringify(characterSave), switchedAt] });
        } else {
          const exists = (await tx.execute({ sql: 'SELECT slot,updated_at,save_json FROM djrpg_characters WHERE account_id=? AND slot=?', args: [id, slot] })).rows[0];
          if (!exists || uncreatedIn(exists.save_json)) fail(404, 'EMPTY_SLOT', '빈 슬롯입니다. 캐릭터를 먼저 생성하세요.');
          characterSave = JSON.parse(exists.save_json);
          switchedAt = String(exists.updated_at);
          if (slot !== latest.slot) {
            const entitlement = (await tx.execute({ sql: "SELECT expires_at FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key='all_idle_30d'", args: [id] })).rows[0];
            const now = Date.now();
            const expiresAt = Number(entitlement?.expires_at ?? 0);
            const seconds = expiresAt > Date.parse(String(exists.updated_at)) ? idleSecondsUntil(exists.updated_at, Math.min(now, expiresAt)) : 0;
            if (seconds > 0) await tx.execute({ sql: `INSERT INTO djrpg_shop_entitlements(account_id,entitlement_key,quantity,expires_at,updated_at) VALUES (?,?,?,NULL,?)
              ON CONFLICT(account_id,entitlement_key) DO UPDATE SET quantity=MIN(43200,quantity+excluded.quantity),updated_at=excluded.updated_at`, args: [id, `idle_claim_${slot}`, seconds, now] });
            switchedAt = new Date(now).toISOString();
            await tx.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot=?', args: [switchedAt, id, slot] });
          }
        }
        await tx.batch([
          { sql: 'UPDATE djrpg_account_profiles SET active_slot=? WHERE account_id=?', args: [slot, id] },
          { sql: 'INSERT INTO djrpg_save_versions(account_id,revision) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision', args: [id, latest.revision + 1] }
        ]);
        const save = { ...characterSave, gold: Number(latest.shared_gold ?? characterSave.gold ?? 0) };
        // 그동안 방치한 시간의 보상은 새로고침 없이 넘어온 클라이언트가 바로 정산할 수 있게 함께 보낸다.
        const offlineSeconds = action === 'selectCharacter' && slot !== latest.slot
          ? await pendingOfflineSeconds(tx, id, slot, switchedAt)
          : 0;
        return { characterSlot: slot, revision: latest.revision + 1, save, characterName: save.name, offlineSeconds };
      });
      return res.status(200).json(result);
    }
    if (action === 'completeSetup') {
      // 시즌 초기화로 직업·성별을 비운 계정이 새 1층 캐릭터를 만든다(작업 206). 이미 설정이 끝난
      // 계정에는 아무것도 하지 않는다 — 오래된 기기의 완료 요청이 진행을 덮어쓰지 않는다.
      const gender = body.gender === 'male' || body.gender === 'female' ? body.gender : undefined;
      if (!gender || !jobs.includes(body.job)) return bad(res, 400, 'INVALID_CHARACTER', '직업과 성별을 선택하세요.');
      const result = await transaction(db, async tx => {
        const latest = await account(tx, id);
        assertSession(latest, signed.sid);
        if (latest.save.needsSetup !== true) fail(409, 'SETUP_DONE', '이미 새 시즌 설정이 끝났습니다. 새로고침해 주세요.');
        const save = initialSave(id, gender, latest.save.name || id, body.job);
        const saved = await writeSave(tx, latest, save, [], false);
        await tx.execute({ sql: 'UPDATE djrpg_accounts SET save_json=?, updated_at=? WHERE id=?', args: [JSON.stringify(save), new Date().toISOString(), id] });
        return { ok: true, ...saved, slot: latest.slot };
      });
      return res.status(200).json({ revision: result.revision, accountId: id, loginId: row.password_hash === 'guest' ? '게스트' : row.id, gender, job: jobOf(body.job), guest: false, token: req.headers.authorization.slice(7), save: result.save, characterSlot: result.slot, needsSetup: false, offlineSeconds: 0 });
    }
    if (action === 'save' || action === 'reset') {
      const result = await context.trace.step('tx', () => transaction(db, async tx => {
        const latest = await account(tx, id);
        assertSession(latest, signed.sid);
        // 새 시즌 설정 전에는 어떤 클라이언트도 세이브로 그 상태를 덮어쓸 수 없다(작업 206).
        if (latest.save.needsSetup === true) fail(409, 'SEASON_SETUP_REQUIRED', '새 시즌 직업·성별 선택이 필요합니다. 로그인 화면에서 선택해 주세요.');
        if (Number(body.characterSlot ?? 1) !== latest.slot) fail(409, 'CHARACTER_CONFLICT', '다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
        if (action === 'save' && typeof body.requestId === 'string') {
          const replay = (await tx.execute({ sql: 'SELECT * FROM djrpg_save_requests WHERE account_id=?', args: [id] })).rows[0];
          if (replay?.request_id === body.requestId) {
            assertRevision(latest, Number(replay.revision));
            return { ok: true, save: latest.save, revision: latest.revision, offlineSeconds: 0 };
          }
        }
        // 아직 만들지 않은 자리표시자 캐릭터에는 세이브를 받지 않는다(작업 216) — 캐릭터 생성이 먼저다.
        if (isUncreated(latest.save)) fail(409, 'CHARACTER_REQUIRED', '캐릭터를 먼저 만드세요.');
        assertRevision(latest, body.revision);
        const save = action === 'reset' ? { ...initialSave(id, latest.save.gender === 'female' ? 'female' : 'male', latest.save.name, latest.save.job), gold: latest.save.gold } : body.save;
        if (!save || typeof save !== 'object' || Array.isArray(save) || save.version !== 1 || JSON.stringify(save).length > 1_000_000) fail(400, 'INVALID_SAVE', '저장 데이터 형식이 올바르지 않습니다.');
        if (action === 'reset') {
          const open = (await tx.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active'", args: [id] })).rows[0];
          const inbox = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL', args: [id] })).rows[0];
          if (Number(open.n) || Number(inbox.n)) fail(409, 'MARKET_PENDING', '등록 매물과 미수령 거래가 있어 초기화할 수 없습니다. 먼저 거래소를 정리하세요.');
        }
        await reconcileItems(tx, id, latest.save, save, { slot: latest.slot, elapsedSeconds: elapsedSince(latest.character_updated_at) });
        const saved = await writeSave(tx, latest, save, [], action !== 'reset');
        await tx.execute({ sql: 'DELETE FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key=?', args: [id, `idle_claim_${latest.slot}`] });
        if (action === 'save' && typeof body.requestId === 'string' && body.requestId.length <= 80) await tx.execute({ sql: 'INSERT INTO djrpg_save_requests VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET request_id=excluded.request_id, revision=excluded.revision', args: [id, body.requestId, saved.revision] });
        if (saved.clamped?.length) context.clamped = saved.clamped.length;
        return { ok: true, ...saved, offlineSeconds: 0 };
      }));
      return res.status(200).json(result);
    }
    return bad(res, 400, 'INVALID_ACTION', '지원하지 않는 요청입니다.');
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return errorResponse(error); }
  finally { if (createDbClient) await db?.close(); }
}
