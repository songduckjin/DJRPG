/**
 * 무한 방어전 순위 (2026-11-24).
 *
 * `POST /api/defense` 하나에 `action: 'list' | 'start' | 'submit'`을 담는다(던전과 같은 골격).
 *  · `list`   — 읽기 연결만. 상위 10명 + 내 순위(동점은 **먼저 도달한 사람**이 위).
 *  · `start`  — 쓰기. 판 번호(`runId`)·시드·시작 시각을 서버가 발급한다. 진행 중인 도전이 있으면 같은 값을
 *               그대로 돌려준다(새로고침으로 시드가 바뀌지 않게).
 *  · `submit` — 쓰기. `server/defense-verify.mjs`의 3단계 검증을 통과한 기록만 올린다.
 *
 * 순위의 근거는 이 파일이 검증해 `djrpg_defense_records`에 적은 값이고, 세이브의 `defenseStage`는 그
 * 기록 +1까지만 저장된다(`server/db/save.mjs`). 게스트는 `list`만 쓸 수 있다.
 */
import { randomUUID } from 'node:crypto';
import { account, assertSession, assertSessionId, transaction, fail } from './database.mjs';
import { defenseSchema, DEFENSE_MAX_STAGE } from './defense-schema.mjs';
import { verifyDefenseRun } from './defense-verify.mjs';
import { randomSeed } from '../src/game/rng.ts';

const stageOf = save => {
  const stage = Number(save?.defenseStage);
  return Number.isInteger(stage) && stage > 0 ? Math.min(DEFENSE_MAX_STAGE, stage) : 0;
};
const nameOf = (save, id) => typeof save?.name === 'string' && save.name.trim() ? save.name.slice(0, 16) : id;
const jobOf = save => (save?.job === 'archer' || save?.job === 'mage' ? save.job : 'warrior');
const levelOf = save => Number.isSafeInteger(Number(save?.level)) ? Math.max(1, Math.min(30, Number(save.level))) : 1;

/** 상위 10명 + 내 기록. 동률이면 먼저 도달한 사람(서버가 기록한 `reached_at`)이 위로 온다. */
async function standing(reader, id) {
  const [rows, total] = await reader.batch([
    { sql: `WITH ranked AS (
      SELECT account_id,name,job,level,best_stage,reached_at,verified,ROW_NUMBER() OVER (ORDER BY best_stage DESC,reached_at,account_id) AS rank
      FROM djrpg_defense_records WHERE best_stage>0
    ), mine AS (SELECT rank FROM ranked WHERE account_id=? COLLATE NOCASE)
    SELECT r.* FROM ranked r LEFT JOIN mine m ON 1=1 WHERE r.rank<=10 OR r.rank=m.rank ORDER BY r.rank`, args: [id] },
    { sql: 'SELECT COUNT(*) AS n FROM djrpg_defense_records WHERE best_stage>0', args: [] }
  ], 'read');
  const lower = String(id).toLowerCase();
  const map = row => ({
    rank: Number(row.rank), name: row.name, job: row.job ?? 'warrior', level: Number(row.level ?? 1),
    bestStage: Number(row.best_stage), reachedAt: Number(row.reached_at), verified: Number(row.verified) === 1,
    mine: String(row.account_id).toLowerCase() === lower
  });
  const own = rows.rows.find(row => String(row.account_id).toLowerCase() === lower);
  return {
    top: rows.rows.filter(row => Number(row.rank) <= 10).map(map),
    mine: own ? map(own) : undefined,
    total: Number(total.rows[0]?.n ?? 0)
  };
}

/** 순위 조회는 **읽기 연결만** 쓴다(던전과 같은 이유 — 쓰기 잠금을 잡지 않는다). */
async function listing(db, id, sid) {
  await assertSessionId(db, id, sid);
  const [rows] = await db.batch([{ sql: 'SELECT password_hash FROM djrpg_accounts WHERE id=?', args: [id] }], 'read');
  const guest = rows.rows[0]?.password_hash === 'guest';
  const page = await standing(db, id);
  return { standing: page, guest, recorded: Math.max(page.mine?.bestStage ?? 0, 0), now: Date.now() };
}

export async function defenseOperation(db, id, input = {}, sid, now = Date.now(), schemaKey) {
  await defenseSchema(db, schemaKey);
  const action = input.action ?? 'list';
  if (!['list', 'start', 'submit'].includes(action)) fail(400, 'INVALID_ACTION', '지원하지 않는 방어전 요청입니다.');
  if (action === 'list') return listing(db, id, sid);
  return transaction(db, async tx => {
    const owner = await account(tx, id);
    assertSession(owner, sid);
    const guest = owner.password_hash === 'guest';
    if (guest) fail(403, 'GUEST_READ_ONLY', '무한 방어전 순위는 정식 계정으로 로그인하면 기록됩니다.');
    if (action === 'start') {
      // 판 번호·시드·시작 시각은 서버가 정한다. 진행 중인 도전이 있으면 같은 값을 돌려주어
      // 새로고침으로 시드가 다시 뽑히거나 검증 시간이 초기화되지 않게 한다.
      const existing = (await tx.execute({ sql: 'SELECT run_id,seed,started_at FROM djrpg_defense_attempts WHERE account_id=?', args: [id] })).rows[0];
      const runId = existing?.run_id ? String(existing.run_id) : randomUUID();
      const seed = existing && Number.isSafeInteger(Number(existing.seed)) ? Number(existing.seed) >>> 0 : randomSeed();
      const startedAt = existing && Number.isFinite(Number(existing.started_at)) ? Number(existing.started_at) : now;
      await tx.execute({
        sql: 'INSERT INTO djrpg_defense_attempts(account_id,run_id,seed,started_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET run_id=excluded.run_id,seed=excluded.seed,started_at=excluded.started_at,updated_at=excluded.updated_at',
        args: [id, runId, seed, startedAt, now]
      });
      return { started: true, runId, seed, startedAt, now };
    }
    // submit — 판 번호·시드·경과 시간·요약을 모두 본다.
    const attempt = (await tx.execute({ sql: 'SELECT run_id,seed,started_at FROM djrpg_defense_attempts WHERE account_id=?', args: [id] })).rows[0];
    if (!attempt) fail(409, 'DEFENSE_NOT_STARTED', '방어전 도전 시작이 서버에 기록되지 않았습니다. 판에 다시 들어가 주세요.');
    if (String(input.runId ?? '') !== String(attempt.run_id)) fail(409, 'DEFENSE_RUN_MISMATCH', '이 판은 서버에 기록된 도전과 맞지 않습니다. 새로 도전해 주세요.');
    const stage = Number(input.stage);
    const elapsed = (now - Number(attempt.started_at)) / 1000;
    const seed = Number(attempt.seed) >>> 0;
    const verdict = verifyDefenseRun({ save: owner.save, stage, seed, summary: input.summary, elapsedSeconds: elapsed });
    try {
      console.log(JSON.stringify({ event: 'defense_verify', ...verdict.diagnostics, ok: verdict.ok, code: verdict.code ?? '' }));
    } catch { /* 로그 실패가 응답을 막지 않는다 */ }
    if (!verdict.ok) {
      fail(409, verdict.code,
        verdict.code === 'DEFENSE_TOO_FAST' ? `${Number.isFinite(stage) ? stage : '?'} 스테이지에 도달하기에 시간이 부족합니다. 잠시 뒤 다시 시도해 주세요.`
          : verdict.code === 'DEFENSE_SUMMARY_REQUIRED' ? '판 결과가 없어 기록을 확인할 수 없습니다. 다시 도전해 주세요.'
            : '판 기록이 서버 검증과 맞지 않습니다. 다시 도전해 주세요.');
    }
    const row = (await tx.execute({ sql: 'SELECT best_stage,reached_at FROM djrpg_defense_records WHERE account_id=?', args: [id] })).rows[0];
    const current = Math.max(0, Number(row?.best_stage ?? 0));
    const claimed = Math.max(1, Math.min(DEFENSE_MAX_STAGE, Math.floor(stage)));
    let recorded = current;
    if (claimed > current) {
      // 최고 스테이지는 오르기만 하고, 같은 스테이지를 다시 세우면 처음 도달한 시각을 그대로 둔다.
      const reachedAt = claimed > current ? now : Math.max(1, Number(row?.reached_at ?? now));
      await tx.execute({
        sql: 'INSERT INTO djrpg_defense_records(account_id,name,job,level,best_stage,reached_at,run_seconds,verified,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,job=excluded.job,level=excluded.level,best_stage=excluded.best_stage,reached_at=excluded.reached_at,run_seconds=excluded.run_seconds,verified=excluded.verified,updated_at=excluded.updated_at',
        args: [id, nameOf(owner.save, id), jobOf(owner.save), levelOf(owner.save), claimed, reachedAt, Math.round(Number(input.summary?.seconds) || 0), verdict.verified ? 1 : 0, now]
      });
      recorded = claimed;
    } else if (row) {
      // 같은 판을 다시 보내도(멱등) 이름·직업·레벨만 맞춘다.
      await tx.execute({ sql: 'UPDATE djrpg_defense_records SET name=?,job=?,level=?,updated_at=? WHERE account_id=?', args: [nameOf(owner.save, id), jobOf(owner.save), levelOf(owner.save), now, id] });
    }
    await tx.execute({ sql: 'DELETE FROM djrpg_defense_attempts WHERE account_id=?', args: [id] });
    return { standing: await standing(tx, id), guest, recorded, verified: verdict.verified && recorded > current, now, saveStage: Math.max(0, stageOf(owner.save)) };
  });
}

export { verifyDefenseRun, requiredDefenseSeconds } from './defense-verify.mjs';
