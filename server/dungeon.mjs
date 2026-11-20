import {account,assertSession,assertSessionId,transaction,fail} from './database.mjs';
import {dungeonSchema,DUNGEON_MAX_FLOOR} from './dungeon-schema.mjs';
import {requiredClearSeconds,replayDungeonFloor,DUNGEON_MIN_SECONDS} from './dungeon-verify.mjs';

// 순위 근거는 클라이언트가 보낸 층이 아니라 **서버가 들고 있는 계정 세이브의 최고층**이고, 그 세이브는
// 다시 **서버가 검증한 기록(+1층)**까지만 저장된다(`server/database.mjs` `writeSave`). 즉 최고층을 올리는
// 유일한 길은 이 파일의 `submit`이며, `submit`은 `start`로 받은 서버 시각과 리플레이가 계산한 최소
// 클리어 시간을 함께 본다(작업 209).
const floorOf = save => {
  const floor = Number(save?.dungeonFloor);
  return Number.isInteger(floor) && floor > 0 ? Math.min(DUNGEON_MAX_FLOOR, floor) : 0;
};
const nameOf = (save,id) => typeof save?.name === 'string' && save.name.trim() ? save.name.slice(0,16) : id;
// 상위 10명 + 내 기록. 동률이면 서버가 먼저 기록한 사람(먼저 깬 사람)이 위로 온다.
async function standing(reader,id){
  const [rows,total] = await reader.batch([
    {sql:`WITH ranked AS (
      SELECT account_id,name,cleared_floor,cleared_at,ROW_NUMBER() OVER (ORDER BY cleared_floor DESC,cleared_at,account_id) AS rank
      FROM djrpg_dungeon_records WHERE cleared_floor>0
    ), mine AS (SELECT rank FROM ranked WHERE account_id=? COLLATE NOCASE)
    SELECT r.* FROM ranked r LEFT JOIN mine m ON 1=1 WHERE r.rank<=10 OR r.rank=m.rank ORDER BY r.rank`,args:[id]},
    {sql:'SELECT COUNT(*) AS n FROM djrpg_dungeon_records WHERE cleared_floor>0',args:[]}
  ],'read');
  const lower = String(id).toLowerCase();
  const map = row => ({rank:Number(row.rank),name:row.name,clearedFloor:Number(row.cleared_floor),clearedAt:Number(row.cleared_at),mine:String(row.account_id).toLowerCase()===lower});
  const own = rows.rows.find(row => String(row.account_id).toLowerCase() === lower);
  return {top:rows.rows.filter(row => Number(row.rank) <= 10).map(map),mine:own?map(own):undefined,total:Number(total.rows[0]?.n ?? 0)};
}
/**
 * 순위 조회는 **읽기 연결만** 쓴다 — 예전에는 list도 쓰기 트랜잭션을 열어 두 번째 인자(정산·쓰기)와
 * 같은 잠금을 두고 줄을 세웠다. 지금은 계정 한 줄과 순위 쿼리를 읽기 배치 한 번으로 끝낸다.
 */
async function listing(db,id,sid){
  await assertSessionId(db,id,sid);
  const [rows] = await db.batch([
    {sql:'SELECT password_hash FROM djrpg_accounts WHERE id=?',args:[id]}
  ],'read');
  const guest = rows.rows[0]?.password_hash === 'guest';
  const page = await standing(db,id);
  return {standing:page,guest,recorded:Math.max(page.mine?.clearedFloor ?? 0,0),now:Date.now()};
}
export async function dungeonOperation(db,id,input={},sid,now=Date.now(),schemaKey){
  await dungeonSchema(db,schemaKey);
  const action = input.action ?? 'list';
  if(!['list','start','submit'].includes(action))fail(400,'INVALID_ACTION','지원하지 않는 던전 요청입니다.');
  if(action==='list')return listing(db,id,sid);
  return transaction(db,async tx=>{
    const owner = await account(tx,id);assertSession(owner,sid);
    const guest = owner.password_hash === 'guest';
    if(guest)fail(403,'GUEST_READ_ONLY','던전 순위는 정식 계정으로 로그인하면 기록됩니다.');
    if(action==='start'){
      // 도전 시작 시각은 **서버**가 적는다. 같은 층을 다시 열면 이미 적힌 시각을 그대로 두어,
      // 화면을 다시 그렸다는 이유로 검증 시간이 초기화되지 않게 한다.
      const claimed = Number(input.floor);
      const floor = Number.isInteger(claimed) ? Math.min(DUNGEON_MAX_FLOOR, Math.max(1, claimed)) : Math.min(DUNGEON_MAX_FLOOR, floorOf(owner.save) + 1);
      const existing = (await tx.execute({sql:'SELECT floor,started_at FROM djrpg_dungeon_attempts WHERE account_id=?',args:[id]})).rows[0];
      const startedAt = existing && Number(existing.floor) === floor ? Number(existing.started_at) : now;
      await tx.execute({sql:'INSERT INTO djrpg_dungeon_attempts(account_id,floor,started_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET floor=excluded.floor,started_at=excluded.started_at,updated_at=excluded.updated_at',args:[id,floor,startedAt,now]});
      return {started:true,floor,startedAt,now};
    }
    const claim = floorOf(owner.save);
    const row = (await tx.execute({sql:'SELECT cleared_floor,cleared_at FROM djrpg_dungeon_records WHERE account_id=?',args:[id]})).rows[0];
    const current = Math.max(0, Number(row?.cleared_floor ?? 0));
    let recorded = current;
    if(claim===0){
      // 계정 초기화처럼 세이브의 진행이 지워졌으면 순위 기록도 남기지 않는다.
      if(row)await tx.execute({sql:'DELETE FROM djrpg_dungeon_records WHERE account_id=?',args:[id]});
      await tx.execute({sql:'DELETE FROM djrpg_dungeon_attempts WHERE account_id=?',args:[id]});
      recorded = 0;
    }else if(claim<=current){
      // 이미 검증된 층 — 다시 보내도 기록은 그대로이고 경과 시간을 요구하지 않는다(멱등).
      if(nameOf(owner.save,id)!==row.name)await tx.execute({sql:'UPDATE djrpg_dungeon_records SET name=?,updated_at=? WHERE account_id=?',args:[nameOf(owner.save,id),now,id]});
      recorded = current;
    }else if(claim>current+1){
      fail(409,'DUNGEON_OUT_OF_ORDER','던전은 한 층씩만 기록할 수 있습니다. 최신 진행을 다시 불러오세요.');
    }else{
      const attempt = (await tx.execute({sql:'SELECT floor,started_at FROM djrpg_dungeon_attempts WHERE account_id=?',args:[id]})).rows[0];
      if(!attempt||Number(attempt.floor)!==claim)fail(409,'DUNGEON_NOT_STARTED','던전 도전 시작이 서버에 기록되지 않았습니다. 층에 다시 들어가 주세요.');
      const required = requiredClearSeconds(owner.save,claim);
      const elapsed = (now-Number(attempt.started_at))/1000;
      if(elapsed+1<required)fail(409,'DUNGEON_TOO_FAST',`${claim}층 클리어로 확인하기에 시간이 부족합니다. 잠시 뒤 다시 시도해 주세요.`);
      // 최고층은 오르기만 하고, 같은 층을 다시 올리면 처음 기록한 시각을 그대로 둔다(동률 순서 보존).
      await tx.execute({sql:'INSERT INTO djrpg_dungeon_records VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,cleared_floor=excluded.cleared_floor,cleared_at=excluded.cleared_at,updated_at=excluded.updated_at',args:[id,nameOf(owner.save,id),claim,now,now]});
      await tx.execute({sql:'DELETE FROM djrpg_dungeon_attempts WHERE account_id=?',args:[id]});
      recorded = claim;
    }
    return {standing:await standing(tx,id),guest,recorded,now,verified:recorded>current};
  });
}
export {replayDungeonFloor,DUNGEON_MIN_SECONDS};
