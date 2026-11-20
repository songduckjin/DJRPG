import {account,assertSession,transaction,fail} from './database.mjs';
import {dungeonSchema,DUNGEON_MAX_FLOOR} from './dungeon-schema.mjs';

// 순위 근거는 클라이언트가 보낸 층이 아니라 **서버가 들고 있는 계정 세이브의 최고층**이다.
const floorOf = save => {
  const floor = Number(save?.dungeonFloor);
  return Number.isInteger(floor) && floor > 0 ? Math.min(DUNGEON_MAX_FLOOR, floor) : 0;
};
const nameOf = (save,id) => typeof save?.name === 'string' && save.name.trim() ? save.name.slice(0,16) : id;
// 상위 10명 + 내 기록. 동률이면 서버가 먼저 기록한 사람(먼저 깬 사람)이 위로 온다.
async function standing(tx,id){
  const [rows,total] = await tx.batch([
    {sql:`WITH ranked AS (
      SELECT account_id,name,cleared_floor,cleared_at,ROW_NUMBER() OVER (ORDER BY cleared_floor DESC,cleared_at,account_id) AS rank
      FROM djrpg_dungeon_records WHERE cleared_floor>0
    ), mine AS (SELECT rank FROM ranked WHERE account_id=? COLLATE NOCASE)
    SELECT r.* FROM ranked r LEFT JOIN mine m ON 1=1 WHERE r.rank<=10 OR r.rank=m.rank ORDER BY r.rank`,args:[id]},
    {sql:'SELECT COUNT(*) AS n FROM djrpg_dungeon_records WHERE cleared_floor>0',args:[]}
  ]);
  const lower = String(id).toLowerCase();
  const map = row => ({rank:Number(row.rank),name:row.name,clearedFloor:Number(row.cleared_floor),clearedAt:Number(row.cleared_at),mine:String(row.account_id).toLowerCase()===lower});
  const own = rows.rows.find(row => String(row.account_id).toLowerCase() === lower);
  return {top:rows.rows.filter(row => Number(row.rank) <= 10).map(map),mine:own?map(own):undefined,total:Number(total.rows[0]?.n ?? 0)};
}
export async function dungeonOperation(db,id,input={},sid,now=Date.now(),schemaKey){
  await dungeonSchema(db,schemaKey);
  const action = input.action ?? 'list';
  if(!['list','submit'].includes(action))fail(400,'INVALID_ACTION','지원하지 않는 던전 요청입니다.');
  return transaction(db,async tx=>{
    const owner = await account(tx,id);assertSession(owner,sid);
    const guest = owner.password_hash === 'guest';
    let recorded = 0;
    if(action==='submit'){
      if(guest)fail(403,'GUEST_READ_ONLY','던전 순위는 정식 계정으로 로그인하면 기록됩니다.');
      const floor = floorOf(owner.save);
      const row = (await tx.execute({sql:'SELECT cleared_floor,cleared_at FROM djrpg_dungeon_records WHERE account_id=?',args:[id]})).rows[0];
      if(floor===0){
        // 계정 초기화처럼 세이브의 진행이 지워졌으면 순위 기록도 남기지 않는다.
        if(row)await tx.execute({sql:'DELETE FROM djrpg_dungeon_records WHERE account_id=?',args:[id]});
      }else{
        // 최고층은 오르기만 하고, 같은 층을 다시 올리면 처음 기록한 시각을 그대로 둔다(동률 순서 보존).
        if(!row||floor>Number(row.cleared_floor))await tx.execute({sql:'INSERT INTO djrpg_dungeon_records VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,cleared_floor=excluded.cleared_floor,cleared_at=excluded.cleared_at,updated_at=excluded.updated_at',args:[id,nameOf(owner.save,id),floor,now,now]});
        else if(nameOf(owner.save,id)!==row.name)await tx.execute({sql:'UPDATE djrpg_dungeon_records SET name=?,updated_at=? WHERE account_id=?',args:[nameOf(owner.save,id),now,id]});
        recorded = Math.max(floor,Number(row?.cleared_floor ?? 0));
      }
    }
    return {standing:await standing(tx,id),guest,recorded,now};
  });
}
