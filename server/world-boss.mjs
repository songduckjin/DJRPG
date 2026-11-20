import {account,assertSession,transaction,fail} from './database.mjs';
import {periods,advanceJourney,journeyOperation,recordJourneyMetric} from './journey-state.mjs';
import {parseSave} from '../src/game/store.ts';
import {WorldBossRehearsal} from '../src/game/worldBossRehearsal.ts';
import {worldBossSchema} from './world-boss-schema.mjs';
export {worldBossSchema} from './world-boss-schema.mjs';

export const WORLD_BOSS_HP=10000000;
// 하루 도전 횟수(작업 210, 사용자 지시 `#4445` "월드보스 3번 치게 해야지"): 207에서 1회로 줄였던 것을 **3회로 복구**.
// `remaining`·안내 문구·테스트가 이 값 하나를 본다.
export const WORLD_BOSS_DAILY_ATTEMPTS=3;
// Re-run the same combat rules from the frozen server-owned loadout. Client damage is never trusted.
export function replayBoss(save,seconds,dodges=[]){
  const session=new WorldBossRehearsal(parseSave(save,save.accountId));
  const ticks=Math.floor(Math.max(0,Math.min(60,seconds))*20+1e-6);let cursor=0;
  for(let i=0;i<ticks&&!session.finished;i++){
    while(cursor<dodges.length&&dodges[cursor]<=session.elapsed+1e-6){session.dodge();cursor++;}
    session.advance(.05);
  }
  return session;
}
// Derive the record from server-credited attempts, including days saved by the old sum rule.
const bestScores=`SELECT s.day,s.account_id,s.name,s.joined_at,MAX(a.credited) AS damage
  FROM djrpg_boss_scores s JOIN djrpg_boss_attempts a ON a.day=s.day AND a.account_id=s.account_id
  WHERE s.day=? GROUP BY s.day,s.account_id HAVING MAX(a.credited)>0`;
export function tier(rank){return rank===1?[10000,4]:rank<=3?[8000,3]:rank<=10?[6000,2]:rank<=50?[4000,1]:rank<=100?[3000,1]:[2000,1];}
async function settle(tx,day,now){
  if(day.settled_at||(!day.killed_at&&now<Number(day.ends_at)))return;
  const scores=(await tx.execute({sql:`SELECT s.*,j.state_json FROM (${bestScores}) s LEFT JOIN djrpg_journey j ON j.account_id=s.account_id
    ORDER BY s.damage DESC,s.joined_at,s.account_id`,args:[day.day]})).rows;
  const existing=new Set((await tx.execute({sql:'SELECT account_id,kind FROM djrpg_boss_rewards WHERE day=?',args:[day.day]})).rows.map(r=>JSON.stringify([r.account_id.toLowerCase(),r.kind])));
  const operations=[];
  for(let i=0;i<scores.length;i++){
    const score=scores[i],id=score.account_id,[gold,pouches]=tier(i+1),state=advanceJourney(score.state_json?JSON.parse(score.state_json):undefined,undefined,undefined,now);
    const rewards=[['rank',`월드보스 ${i+1}위 보상`,gold,pouches]];
    if(day.killed_at)rewards.push(['shared','월드보스 공동 처치 보상',1500,1]);
    if(day.killer===id)rewards.push(['last','월드보스 마지막 타격 보상',2000,0]);
    let changed=false;
    for(const [kind,title,gold,pouches] of rewards){
      if(existing.has(JSON.stringify([id.toLowerCase(),kind])))continue;
      operations.push({sql:'INSERT OR IGNORE INTO djrpg_boss_rewards VALUES (?,?,?)',args:[day.day,id,kind]});
      state.mail.push({id:`boss:${day.day}:${kind}`,title,sender:'월드보스 토벌대',body:`잿불의 군주 발카론 · ${title}. 우편에서 보상을 받아 주세요.`,gold,books:0,pouches,createdAt:now,expiresAt:now+30*86400000,claimedAt:null,read:false});changed=true;
    }
    if(changed)operations.push(journeyOperation(id,state));
  }
  // Keep one atomic settlement, but avoid one network round trip per reward/participant.
  for(let i=0;i<operations.length;i+=100)await tx.batch(operations.slice(i,i+100));
  await tx.execute({sql:'UPDATE djrpg_boss_days SET settled_at=? WHERE day=? AND settled_at IS NULL',args:[now,day.day]});
}
async function dayRow(tx,key){return (await tx.execute({sql:'SELECT * FROM djrpg_boss_days WHERE day=?',args:[key]})).rows[0];}
async function credit(tx,attempt,now,finish=false){
  let day=await dayRow(tx,attempt.day);
  const elapsed=Math.min(60,Math.max(0,(Math.min(now,Number(day.ends_at),day.killed_at??Infinity,attempt.ended_at??Infinity)-Number(attempt.started_at))/1000));
  const battle=replayBoss(JSON.parse(attempt.save_json),elapsed,JSON.parse(attempt.dodges_json));
  if(!attempt.ended_at){
    const delta=day.settled_at?0:Math.min(Number(day.hp),Math.max(0,battle.damage-Number(attempt.credited)));
    if(delta>0){
      await tx.execute({sql:'UPDATE djrpg_boss_days SET hp=hp-?,killer=CASE WHEN hp<=? THEN ? ELSE killer END,killed_at=CASE WHEN hp<=? THEN ? ELSE killed_at END WHERE day=?',args:[delta,delta,attempt.account_id,delta,now,day.day]});
      const save=JSON.parse(attempt.save_json);
      await tx.execute({sql:`INSERT INTO djrpg_boss_scores VALUES (?,?,?,MAX(?,(SELECT COALESCE(MAX(credited),0) FROM djrpg_boss_attempts WHERE day=? AND account_id=?)),?)
        ON CONFLICT(day,account_id) DO UPDATE SET damage=excluded.damage`,args:[day.day,attempt.account_id,save.name,Number(attempt.credited)+delta,day.day,attempt.account_id,Number(attempt.started_at)]});
    }
    const ended=finish||battle.finished||elapsed>=59.999||now>=Number(day.ends_at)||Number(day.hp)<=delta||!!day.killed_at;
    await tx.execute({sql:'UPDATE djrpg_boss_attempts SET credited=credited+?,ended_at=? WHERE id=?',args:[delta,ended?now:null,attempt.id]});
    attempt={...attempt,credited:Number(attempt.credited)+delta,ended_at:ended?now:null};
    day=await dayRow(tx,day.day);
  }
  return {attempt,battle,day};
}
async function standing(tx,day,id){
  const rows=(await tx.execute({sql:`WITH ranked AS (
    SELECT account_id,name,damage,ROW_NUMBER() OVER (ORDER BY damage DESC,joined_at,account_id) AS rank FROM (${bestScores})
  ),mine AS (SELECT rank FROM ranked WHERE account_id=? COLLATE NOCASE)
  SELECT r.* FROM ranked r LEFT JOIN mine m ON 1=1 WHERE r.rank<=10 OR r.rank BETWEEN m.rank-9 AND m.rank+1 ORDER BY r.rank`,args:[day,id]})).rows;
  const mine=rows.find(r=>r.account_id.toLowerCase()===id.toLowerCase());
  const map=r=>({rank:Number(r.rank),name:r.name,damage:Number(r.damage),mine:r.account_id.toLowerCase()===id.toLowerCase()});
  return {top:rows.filter(r=>Number(r.rank)<=10).map(map),mine:mine?map(mine):undefined,nearMine:mine?rows.filter(r=>Number(r.rank)>=Number(mine.rank)-9&&Number(r.rank)<=Number(mine.rank)+1).map(map):[]};
}
export async function worldBossOperation(db,id,input={},sid,now=Date.now(),schemaKey){
  await worldBossSchema(db,schemaKey);
  if(!['list','start','tick','dodge','finish'].includes(input.action))fail(400,'INVALID_ACTION','지원하지 않는 월드보스 요청입니다.');
  return transaction(db,async tx=>{
    const owner=await account(tx,id);assertSession(owner,sid);
    const {daily,dailyEnd}=periods(now);
    await tx.execute({sql:'INSERT OR IGNORE INTO djrpg_boss_days(day,max_hp,hp,ends_at) VALUES (?,?,?,?)',args:[daily,WORLD_BOSS_HP,WORLD_BOSS_HP,dailyEnd]});
    // Settle expired battles before closing their day so disconnected participants keep earned credit.
    const expired=(await tx.execute({sql:'SELECT * FROM djrpg_boss_attempts WHERE ended_at IS NULL AND (day<>? OR account_id=? COLLATE NOCASE)',args:[daily,id]})).rows;
    for(const attempt of expired)if(attempt.day!==daily||now-Number(attempt.started_at)>=60000)await credit(tx,attempt,now);
    const due=(await tx.execute({sql:'SELECT * FROM djrpg_boss_days WHERE settled_at IS NULL AND (ends_at<=? OR hp<=0)',args:[now]})).rows;
    for(const day of due)await settle(tx,day,now);
    let battleResult,attempt,freshDay,freshCount;
    if(input.action==='start'){
      if(owner.password_hash==='guest')fail(403,'GUEST_READ_ONLY','실전 도전은 정식 계정으로 로그인해 주세요.');
      if(typeof input.requestId!=='string'||! /^[\w-]{16,80}$/.test(input.requestId))fail(400,'INVALID_REQUEST','도전 요청 번호가 올바르지 않습니다.');
      // 여정 상태도 같이 읽어 두면 도전 1회를 적을 때 추가 SELECT가 없다(작업 207).
      const [dayResult,attemptResult,journeyResult]=await tx.batch([
        {sql:'SELECT * FROM djrpg_boss_days WHERE day=?',args:[daily]},
        {sql:'SELECT * FROM djrpg_boss_attempts WHERE account_id=? AND (request_id=? OR day=?)',args:[id,input.requestId,daily]},
        {sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[id]}
      ]);
      attempt=attemptResult.rows.find(a=>a.request_id===input.requestId);
      if(!attempt){
        const day=dayResult.rows[0];
        if(Number(day.hp)<=0)fail(409,'BOSS_DEFEATED','오늘의 월드보스가 처치되었습니다.');
        if(Number(input.characterSlot)!==owner.slot)fail(409,'CHARACTER_CONFLICT','선택 캐릭터가 변경되었습니다.');
        const attempts=attemptResult.rows.filter(a=>a.day===daily);
        if(attempts.some(a=>!a.ended_at))fail(409,'BOSS_ALREADY_ACTIVE','진행 중인 월드보스 도전이 있습니다.');
        if(attempts.length>=WORLD_BOSS_DAILY_ATTEMPTS)fail(409,'BOSS_LIMIT',`오늘 도전 ${WORLD_BOSS_DAILY_ATTEMPTS}회를 모두 사용했습니다.`);
        const save=parseSave(owner.save,id);save.auto=true;
        attempt={id:crypto.randomUUID(),account_id:id,day:daily,request_id:input.requestId,save_json:JSON.stringify(save),started_at:now,dodges_json:'[]',credited:0,ended_at:null};
        await tx.execute({sql:'INSERT INTO djrpg_boss_attempts VALUES (?,?,?,?,?,?,?,?,?)',args:Object.values(attempt)});
        // `월드보스 N회 도전` 미션(작업 207): 시도가 성립한 이 순간 1회. 같은 requestId 재시도는 위에서 걸러져 두 번 세지 않는다.
        await recordJourneyMetric(tx,{...owner,journeyRecord:journeyResult.rows[0]??null},'worldBoss',save,now);
        // Fresh starts have zero elapsed time and damage: no credit write/re-read is needed.
        freshDay=day;freshCount=attempts.length+1;
        battleResult={attempt,day,battle:replayBoss(save,0)};
      }
    }else if(input.action!=='list'){
      if(typeof input.attemptId!=='string')fail(400,'INVALID_REQUEST','전투 번호가 올바르지 않습니다.');
      attempt=(await tx.execute({sql:'SELECT * FROM djrpg_boss_attempts WHERE id=? AND account_id=?',args:[input.attemptId,id]})).rows[0];
      if(!attempt)fail(404,'BOSS_ATTEMPT_NOT_FOUND','내 월드보스 전투를 찾을 수 없습니다.');
    }
    if(attempt&&!battleResult){
      if(input.action==='dodge'&&!attempt.ended_at){
        const dodges=JSON.parse(attempt.dodges_json),elapsed=Math.max(0,(now-Number(attempt.started_at))/1000);
        if(elapsed<60&&(dodges.length===0||elapsed-dodges[dodges.length-1]>=4)){
          dodges.push(Math.ceil(elapsed*20)/20);attempt.dodges_json=JSON.stringify(dodges);
          await tx.execute({sql:'UPDATE djrpg_boss_attempts SET dodges_json=? WHERE id=?',args:[attempt.dodges_json,attempt.id]});
        }
      }
      battleResult=await credit(tx,attempt,now,input.action==='finish');attempt=battleResult.attempt;
      await settle(tx,battleResult.day,now);
    }
    const day=freshDay??await dayRow(tx,daily),count=freshCount===undefined?(await tx.execute({sql:'SELECT COUNT(*) AS n FROM djrpg_boss_attempts WHERE account_id=? AND day=?',args:[id,daily]})).rows[0]:{n:freshCount};
    const result={day:daily,hp:Number(day.hp),maxHp:Number(day.max_hp),endsAt:Number(day.ends_at),maxAttempts:WORLD_BOSS_DAILY_ATTEMPTS,remaining:Math.max(0,WORLD_BOSS_DAILY_ATTEMPTS-Number(count.n)),killed:!!day.killed_at,guest:owner.password_hash==='guest',standing:await standing(tx,attempt?.day??daily,id),now};
    if(attempt)result.battle={id:attempt.id,startedAt:Number(attempt.started_at),damage:Number(attempt.credited),elapsed:battleResult.battle.elapsed,hp:battleResult.battle.world.player.hp,finished:!!attempt.ended_at,defeated:battleResult.battle.defeated,...(input.action==='start'?{save:JSON.parse(attempt.save_json)}:{})};
    if(attempt?.ended_at){
      const previous=Number((await tx.execute({sql:'SELECT COALESCE(MAX(credited),0) AS damage FROM djrpg_boss_attempts WHERE day=? AND account_id=? AND id<>?',args:[attempt.day,id,attempt.id]})).rows[0].damage);
      const damage=Number(attempt.credited);
      result.battle.record={status:damage>previous?(previous>0?'improved':'first'):'unchanged',previousBestDamage:previous,bestDamage:Math.max(previous,damage)};
    }
    return result;
  });
}
