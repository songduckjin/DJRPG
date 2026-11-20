import { randomUUID } from 'node:crypto';
import { account, transaction, assertRevision, validateSave, reconcileItems, writeSave, fail, inventoryOwnerQuery } from './database.mjs';
import { journeyState, journeyOperation, journeyView, dailyTasks, pouchItem } from './journey-state.mjs';
import { rollRewardSkillBook } from './skill-ids.mjs';
function rewards(save, entries) {
  const books = entries.reduce((sum,entry)=>sum+Number(entry.books??0),0);
  // 보물 주머니(작업 207): 전체 완료 보상에 붙은 수량만큼 가방에 넣는다. 주머니는 장비 40칸을 쓰지 않는다.
  const pouches = entries.reduce((sum,entry)=>sum+Number(entry.pouches??0),0);
  save.gold += entries.reduce((sum,entry)=>sum+entry.gold,0);
  save.bag ??= [];
  // 우편·보상 스킬북도 세 직업 33종에서 고른다(작업 209) — 예전에는 전사 11종만 나왔다.
  for(let i=0;i<books;i++) {
    const {skillId,name}=rollRewardSkillBook();
    save.bag.push({id:randomUUID(),kind:'skillbook',slot:'skillbook',skillId,rarity:'rare',name,stats:{}});
  }
  for(let i=0;i<pouches;i++) save.bag.push(pouchItem(randomUUID()));
}
export async function snapshot(db,id,options={}) {
  return transaction(db,async tx=>{
    const row=await account(tx,id),state=await journeyState(tx,row,row.save,Date.now(),Boolean(options.preview));
    await tx.execute(journeyOperation(row.id,state)); return journeyView(state,row.save);
  });
}
export async function mutate(db,id,input,options={}) {
  return transaction(db,async tx=>{
    const row=await account(tx,id);
    if(Number(input.characterSlot??1)!==row.slot)fail(409,'CHARACTER_CONFLICT','다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
    if (row.password_hash==='guest') fail(403,'GUEST_READ_ONLY','보상 수령은 정식 계정에서 이용할 수 있습니다.');
    if(typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>80)fail(400,'INVALID_REQUEST','요청 ID를 확인하세요.');
    const reads=await tx.batch([
      {sql:'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?',args:[id,input.requestId]},
      {sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[id]},
      inventoryOwnerQuery(id,input.progress)
    ]);
    row.journeyRecord=reads[1].rows[0]??null;
    const replay=reads[0].rows[0];
    if(replay)return {...JSON.parse(replay.response_json),save:row.save,revision:row.revision,journey:journeyView(await journeyState(tx,row,row.save,Date.now(),Boolean(options.preview)),row.save)};
    assertRevision(row,input.revision); if(input.progress!==undefined)validateSave(input.progress);
    const operations=[];
    const save=structuredClone(input.progress??row.save);await reconcileItems(tx,id,row.save,save,{slot:row.slot,owned:reads[2].rows,operations});
    const now=Date.now(),state=await journeyState(tx,row,save,now,Boolean(options.preview)),view=journeyView(state,save,now);
    const beforeRewardIds=new Set(save.bag.map(item=>item.id));
    let selected=[];
    if(input.action==='journey-claim'){
      if(!['daily','weekly','achievements','mail'].includes(input.kind))fail(400,'INVALID_KIND','보상 분류를 확인하세요.');
      if(input.kind==='mail'){
        selected=state.mail.filter(entry=>(input.id==='all'||entry.id===input.id)&&!entry.claimedAt&&(entry.expiresAt===null||entry.expiresAt>now));
        if(!selected.length)fail(409,'NOT_AVAILABLE','수령할 우편 보상이 없습니다.');
        rewards(save,selected);for(const entry of selected){entry.claimedAt=now;entry.read=true;}
      }else{
        const available=view[input.kind].filter(entry=>!entry.claimed&&entry.current>=entry.target);
        selected=available.filter(entry=>input.id==='all'||entry.id===input.id);
        if(!selected.length)fail(409,'NOT_READY','아직 달성하지 않았거나 이미 수령한 보상입니다.');
        rewards(save,selected);const claims=input.kind==='achievements'?state.achievements:state[input.kind].claims;
        claims.push(...selected.map(entry=>entry.id));
        if(input.kind==='daily'&&!state.daily.completed&&dailyTasks.every(task=>state.daily.claims.includes(task.id))){state.daily.completed=true;state.weekly.days=(state.weekly.days??0)+1;}
      }
    }else if(input.action==='journey-read'){
      const entry=state.mail.find(entry=>entry.id===input.id);if(!entry)fail(404,'NOT_FOUND','우편을 찾을 수 없습니다.');entry.read=true;
    }else if(input.action==='journey-delete'){
      state.mail=state.mail.filter(entry=>!entry.claimedAt); // unclaimed/expired attachments never silently disappear
    }else fail(400,'INVALID_ACTION','지원하지 않는 요청입니다.');
    const ops=[...operations,journeyOperation(id,state)];
    if (input.action === 'journey-claim') {
      const diamondMails = selected.filter(entry => Number(entry.diamonds ?? 0) > 0);
      if (diamondMails.length) {
        await tx.execute({ sql: 'INSERT OR IGNORE INTO djrpg_shop_wallet(account_id,customer_key) VALUES (?,?)', args: [id, randomUUID()] });
        for (const entry of diamondMails) {
          const amount = Number(entry.diamonds);
          if (!Number.isSafeInteger(amount) || amount <= 0) fail(409, 'INVALID_REWARD', '우편 보상이 올바르지 않습니다.');
          ops.push({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'mail', entry.id, amount, now] });
          ops.push({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=diamonds+? WHERE account_id=?', args: [amount, id] });
        }
      }
    }
    for(const item of save.bag.filter(item=>!beforeRewardIds.has(item.id))){
      ops.push({sql:'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)',args:[item.id,id,'inventory',JSON.stringify(item)]});
      ops.push({sql:'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)',args:[item.id,id,row.slot]});
    }
    const message=input.action==='journey-claim'?`${selected.length}개 보상을 수령했습니다.`:input.action==='journey-delete'?'수령 완료 우편을 삭제했습니다.':'우편을 확인했습니다.';
    ops.push({sql:'INSERT INTO djrpg_market_requests VALUES (?,?,?)',args:[id,input.requestId,JSON.stringify({ok:true,message})]});
    const saved=await writeSave(tx,{...row,skipJourney:true},save,ops);
    const result={ok:true,...saved,message,journey:journeyView(state,save,now)};
    return result;
  });
}
