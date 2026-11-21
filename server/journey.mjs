import { account, transaction, assertRevision, validateSave, reconcileItems, writeSave, fail, inventoryOwnerQuery, countedBagItems, EQUIPMENT_BAG_LIMIT } from './database.mjs';
import { elapsedSince } from './save-guard.mjs';
import { journeyState, journeyOperation, journeyView, dailyTasks } from './journey-state.mjs';
import { journeyRequestReads, journeyRequestReceipt } from './journey-requests.mjs';
import { BAG_SLOT_LIMIT, RewardGrantError, bagSlotCount, diamondGrantOperations, grantRewardsToSave, planRewards, rewardSlotNeed } from './core/rewardGrant.mjs';
export async function snapshot(db,id,options={}) {
  return transaction(db,async tx=>{
    const row=await account(tx,id),state=await journeyState(tx,row,row.save);
    await tx.execute(journeyOperation(row.id,state));
    // 거래소 수령함에 남은 건수(작업 247) — 메인 화면 거래소 아이콘의 빨간 점은 이 값을 120초 폴링에
    // 얹어 알린다(거래소 창을 열지 않아도 보이게 하려고 거래소 API를 따로 부르지 않는다).
    const inbox=(await tx.execute({sql:'SELECT COUNT(*) AS n FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL',args:[id]})).rows[0];
    return {...journeyView(state,row.save),marketInbox:Number(inbox?.n??0)};
  });
}
export async function mutate(db,id,input,options={}) {
  return transaction(db,async tx=>{
    const row=await account(tx,id);
    if(Number(input.characterSlot??1)!==row.slot)fail(409,'CHARACTER_CONFLICT','다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
    if (row.password_hash==='guest') fail(403,'GUEST_READ_ONLY','보상 수령은 정식 계정에서 이용할 수 있습니다.');
    if(typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>80)fail(400,'INVALID_REQUEST','요청 ID를 확인하세요.');
    // 멱등 응답은 여정 요청 표(`djrpg_journey_requests`)에서 찾는다 — 거래소 요청 표와 분리했다(작업 260).
    // 구번들·구경로가 거래소 표에 남긴 같은 요청도 함께 본다(한 릴리스, `journey-requests.mjs`).
    const reads=await tx.batch([
      {sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[id]},
      ...journeyRequestReads(id,input.requestId),
      inventoryOwnerQuery(id,input.progress)
    ]);
    row.journeyRecord=reads[0].rows[0]??null;
    const replay=reads[1].rows[0]??reads[2].rows[0];
    if(replay)return {...JSON.parse(replay.response_json),save:row.save,revision:row.revision,journey:journeyView(await journeyState(tx,row,row.save),row.save)};
    assertRevision(row,input.revision); if(input.progress!==undefined)validateSave(input.progress);
    const operations=[];
    const save=structuredClone(input.progress??row.save);await reconcileItems(tx,id,row.save,save,{slot:row.slot,owned:reads[3].rows,operations,elapsedSeconds:elapsedSince(row.character_updated_at)});
    const now=Date.now(),state=await journeyState(tx,row,save,now),view=journeyView(state,save,now);
    const beforeRewardIds=new Set(save.bag.map(item=>item.id));
    let selected=[], goldCredit=0, mailSkipped=0;
    if(input.action==='journey-claim'){
      if(!['daily','weekly','achievements','mail'].includes(input.kind))fail(400,'INVALID_KIND','보상 분류를 확인하세요.');
      if(input.kind==='mail'){
        const wanted=state.mail.filter(entry=>(input.id==='all'||entry.id===input.id)&&!entry.claimedAt&&(entry.expiresAt===null||entry.expiresAt>now));
        if(!wanted.length)fail(409,'NOT_AVAILABLE','수령할 우편 보상이 없습니다.');
        // 가방 40칸이 꽉 차거나 이번 우편의 아이템 때문에 넘어가면 받지 않는다(작업 248, 사용자 확정).
        // `모두 받기`는 자리가 없는 아이템 우편만 건너뛰어 미수령으로 남기고, 금화만 있는 우편은 그대로 받는다.
        const bagLimit=BAG_SLOT_LIMIT, all=input.id==='all';
        let slots=bagSlotCount(save);
        selected=wanted.filter(entry=>{
          const need=rewardSlotNeed([entry], save.job);
          if(!need||slots+need<=bagLimit){slots+=need;return true;}
          if(!all)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요.');
          mailSkipped++;return false;
        });
        if(!selected.length)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요.');
        // 자리는 위에서 확인했다 — 지급은 공통 창구가 한 번에 반영한다(`onOverflow:'keep'`: 받을 것을 잃지 않게).
        goldCredit=grantRewardsToSave(save,selected,{bagLimit,onOverflow:'keep'}).gold;
        for(const entry of selected){entry.claimedAt=now;entry.read=true;}
      }else{
        const available=view[input.kind].filter(entry=>!entry.claimed&&entry.current>=entry.target);
        selected=available.filter(entry=>input.id==='all'||entry.id===input.id);
        if(!selected.length)fail(409,'NOT_READY','아직 달성하지 않았거나 이미 수령한 보상입니다.');
        // 일일·주간 전체 완료·업적 보상도 보물 주머니를 줄 수 있다 — 가방 자리가 없으면 받지 않는다(작업 248).
        if(!planRewards(save,selected,{bagLimit:BAG_SLOT_LIMIT}).fits)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 보상을 받아주세요.');
        goldCredit=grantRewardsToSave(save,selected,{bagLimit:BAG_SLOT_LIMIT}).gold;const claims=input.kind==='achievements'?state.achievements:state[input.kind].claims;
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
      // 다이아는 세이브가 아니라 지갑에 있다 — 금액 검사와 원장 기록도 공통 창구가 맡는다.
      try { ops.push(...diamondGrantOperations(id, selected, { now, sourceType: 'mail' })); }
      catch (error) {
        if (!(error instanceof RewardGrantError)) throw error;
        fail(409, error.code, error.message);
      }
    }
    for(const item of save.bag.filter(item=>!beforeRewardIds.has(item.id))){
      ops.push({sql:'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)',args:[item.id,id,'inventory',JSON.stringify(item)]});
      ops.push({sql:'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)',args:[item.id,id,row.slot]});
    }
    // 가방이 40칸을 넘으면 화면이 왜 장비를 못 줍는지 알 수 있게 함께 알린다(작업 246).
    const overBag = input.action === 'journey-claim' && countedBagItems(save.bag, save.job) > EQUIPMENT_BAG_LIMIT
      ? ` 가방이 ${countedBagItems(save.bag, save.job)}칸이 되어 새 장비를 주울 수 없습니다. 분해·판매로 자리를 비워 주세요.` : '';
    const skippedNote = mailSkipped ? ` 가방이 가득 차 ${mailSkipped}개 우편은 받지 못했습니다.` : '';
    const message=input.action==='journey-claim'?`${selected.length}개 보상을 수령했습니다.${skippedNote}${overBag}`:input.action==='journey-delete'?'수령 완료 우편을 삭제했습니다.':'우편을 확인했습니다.';
    ops.push(journeyRequestReceipt(id,input.requestId,JSON.stringify({ok:true,message})));
    const saved=await writeSave(tx,{...row,skipJourney:true},save,ops,true,{goldCredit});
    const result={ok:true,...saved,message,journey:journeyView(state,save,now)};
    return result;
  });
}
