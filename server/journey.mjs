import { randomUUID } from 'node:crypto';
import { account, transaction, assertRevision, validateSave, reconcileItems, writeSave, fail, inventoryOwnerQuery } from './database.mjs';
import { elapsedSince } from './save-guard.mjs';
import { journeyState, journeyOperation, journeyView, dailyTasks, pouchItem } from './journey-state.mjs';
import { countedInBag, rollRewardSkillBook, rollRewardSkillBookOfJob } from './skill-ids.mjs';
/** 우편·보상이 가방에 넣는 아이템 수 — 스킬북 `books` + 보물 주머니 `pouches`(작업 248). */
function rewardItemCount(entries) {
  return entries.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.books ?? 0) || 0)) + Math.max(0, Math.floor(Number(entry.pouches ?? 0) || 0)), 0);
}
/** 가방 40칸에 지금 차 있는 칸 수 — 장비·타직업 스킬북·보물 주머니(내 직업 스킬북 제외, 작업 253). */
function bagSlots(save) {
  return (save.bag ?? []).filter(item => countedInBag(item, save.job)).length;
}
function rewards(save, entries) {
  // 보물 주머니(작업 207): 전체 완료 보상에 붙은 수량만큼 가방에 넣는다. 주머니는 장비 40칸을 쓰지 않는다.
  const pouches = entries.reduce((sum,entry)=>sum+Number(entry.pouches??0),0);
  const gold = entries.reduce((sum,entry)=>sum+Number(entry.gold??0),0);
  save.gold += gold;
  save.bag ??= [];
  for (const entry of entries) {
    const books = Math.max(0, Math.floor(Number(entry.books??0) || 0));
    // [미리보기 전용 · main 운영 배포 금지] 합성 테스트 우편(`bookJobCycle`)은 지정한 직업 순서대로
    // 책을 만든다(작업 251). 필드가 없는 기존 우편은 그대로 33종 균등이다(기존 계약 불변).
    const cycle = Array.isArray(entry.bookJobCycle)
      ? entry.bookJobCycle.filter(job => job === 'warrior' || job === 'archer' || job === 'mage')
      : [];
    // 우편·보상 스킬북은 세 직업 33종에서 고른다(작업 209) — 예전에는 전사 11종만 나왔다.
    for (let i = 0; i < books; i++) {
      const {skillId,name} = cycle.length ? rollRewardSkillBookOfJob(cycle[i % cycle.length]) : rollRewardSkillBook();
      save.bag.push({id:randomUUID(),kind:'skillbook',slot:'skillbook',skillId,rarity:'rare',name,stats:{}});
    }
  }
  for(let i=0;i<pouches;i++) save.bag.push(pouchItem(randomUUID()));
  return gold;
}
export async function snapshot(db,id,options={}) {
  return transaction(db,async tx=>{
    const row=await account(tx,id),state=await journeyState(tx,row,row.save,Date.now(),options.preview ?? false);
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
    const reads=await tx.batch([
      {sql:'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?',args:[id,input.requestId]},
      {sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[id]},
      inventoryOwnerQuery(id,input.progress)
    ]);
    row.journeyRecord=reads[1].rows[0]??null;
    const replay=reads[0].rows[0];
    if(replay)return {...JSON.parse(replay.response_json),save:row.save,revision:row.revision,journey:journeyView(await journeyState(tx,row,row.save,Date.now(),options.preview ?? false),row.save)};
    assertRevision(row,input.revision); if(input.progress!==undefined)validateSave(input.progress);
    const operations=[];
    const save=structuredClone(input.progress??row.save);await reconcileItems(tx,id,row.save,save,{slot:row.slot,owned:reads[2].rows,operations,elapsedSeconds:elapsedSince(row.character_updated_at)});
    const now=Date.now(),state=await journeyState(tx,row,save,now,options.preview ?? false),view=journeyView(state,save,now);
    const beforeRewardIds=new Set(save.bag.map(item=>item.id));
    let selected=[], goldCredit=0, mailSkipped=0;
    if(input.action==='journey-claim'){
      if(!['daily','weekly','achievements','mail'].includes(input.kind))fail(400,'INVALID_KIND','보상 분류를 확인하세요.');
      if(input.kind==='mail'){
        const wanted=state.mail.filter(entry=>(input.id==='all'||entry.id===input.id)&&!entry.claimedAt&&(entry.expiresAt===null||entry.expiresAt>now));
        if(!wanted.length)fail(409,'NOT_AVAILABLE','수령할 우편 보상이 없습니다.');
        // 가방 40칸이 꽉 차거나 이번 우편의 아이템 때문에 넘어가면 받지 않는다(작업 248, 사용자 확정).
        // `모두 받기`는 자리가 없는 아이템 우편만 건너뛰어 미수령으로 남기고, 금화만 있는 우편은 그대로 받는다.
        const bagLimit=40, all=input.id==='all';
        let slots=bagSlots(save);
        selected=wanted.filter(entry=>{
          const need=rewardItemCount([entry]);
          if(!need||slots+need<=bagLimit){slots+=need;return true;}
          if(!all)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요.');
          mailSkipped++;return false;
        });
        if(!selected.length)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요.');
        goldCredit=rewards(save,selected);for(const entry of selected){entry.claimedAt=now;entry.read=true;}
      }else{
        const available=view[input.kind].filter(entry=>!entry.claimed&&entry.current>=entry.target);
        selected=available.filter(entry=>input.id==='all'||entry.id===input.id);
        if(!selected.length)fail(409,'NOT_READY','아직 달성하지 않았거나 이미 수령한 보상입니다.');
        // 일일·주간 전체 완료·업적 보상도 보물 주머니를 줄 수 있다 — 가방 자리가 없으면 받지 않는다(작업 248).
        if(bagSlots(save)+rewardItemCount(selected)>40)fail(409,'BAG_FULL','가방이 가득 찼습니다. 공간을 비운 뒤 보상을 받아주세요.');
        goldCredit=rewards(save,selected);const claims=input.kind==='achievements'?state.achievements:state[input.kind].claims;
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
    const message=input.action==='journey-claim'?`${selected.length}개 보상을 수령했습니다.${mailSkipped?` 가방이 가득 차 ${mailSkipped}개 우편은 받지 못했습니다.`:''}`:input.action==='journey-delete'?'수령 완료 우편을 삭제했습니다.':'우편을 확인했습니다.';
    ops.push({sql:'INSERT INTO djrpg_market_requests VALUES (?,?,?)',args:[id,input.requestId,JSON.stringify({ok:true,message})]});
    const saved=await writeSave(tx,{...row,skipJourney:true},save,ops,true,{goldCredit});
    const result={ok:true,...saved,message,journey:journeyView(state,save,now)};
    return result;
  });
}
