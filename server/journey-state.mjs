const HOUR = 3600000, DAY = 24 * HOUR;
// 2026-11-20 업데이트 안내 + 점검 보상 우편(사용자 확정: 금화 3,000 + 스킬북 2권).
export const UPDATE_NOTICE_ID = 'update-2026-11-20';
/** 우편 만료 = 2026-11-28 00:00 KST. 이 시각을 넘겨 처음 접속한 계정에는 보상을 붙이지 않는다. */
export const UPDATE_NOTICE_UNTIL = Date.UTC(2026, 10, 27, 15, 0, 0);
const UPDATE_NOTICE_TITLE = '[업데이트 안내] 전투·가방 편의성 및 끝없는 던전 개선';
const UPDATE_NOTICE_BODY = `안녕하세요, 모험가님!
더 쾌적한 사냥과 파밍을 위해 아래 내용이 업데이트되었습니다.

1. 금화 드롭 & 보스 연출 개선
- 바닥에 떨어지는 금화 표현을 다크 판타지 분위기에 맞게 다듬었습니다.
- 보스 몬스터 처치 시 금화 무더기가 보스 주변으로 시원하게 흩뿌려집니다. (던전 보스는 추가 장비와 함께 드롭됩니다.)

2. 가방·분해 편의 기능 추가
- 일괄 분해 기준 유지: 설정한 등급 기준이 창을 닫거나 재접속해도 그대로 유지됩니다.
- 자동 분해 추가: 장비창과 설정에서 켤 수 있으며, 접속 중 사냥 시 설정 등급 이하 장비를 자동으로 분해합니다. (미접속 방치 보상은 기존처럼 가방에 보관됩니다.)
- 좋은 장비 분해 보호: 현재 장착 중인 장비보다 더 좋은 장비가 포함되면 분해 전 확인 팝업으로 한 번 더 안내합니다.

3. 중·고층 사냥 밸런스 조정
- 중·고층 몬스터 체력을 상향해 전투 밸런스를 다듬었습니다.
- 층수가 높아질수록 일반 등급 비중이 줄어들고, 더 높은 등급의 장비가 잘 나오도록 조정했습니다.

4. 끝없는 던전 진행 저장 & 순위 오픈
- 던전 클리어 최고 층수가 계정에 저장되며, 서버 순위표가 연결되었습니다.
- 현재 최고층인 10층 이후 구간은 추후 업데이트로 찾아뵙겠습니다.

앞으로도 즐거운 모험 되시길 바랍니다!`;
/**
 * 업데이트 안내 우편을 계정마다 **한 번만** 준다. 우편함(`state.mail`)만 보고 판단하면 수령해 지운
 * 계정에 다시 붙으므로, 지급 이력을 `state.notices`에 남겨 삭제·만료 뒤에도 재지급하지 않는다.
 */
export function grantUpdateNotice(state, now = Date.now()) {
  state.notices ??= [];
  if (now >= UPDATE_NOTICE_UNTIL) return false;
  if (state.notices.includes(UPDATE_NOTICE_ID) || state.mail.some(entry => entry.id === UPDATE_NOTICE_ID)) return false;
  state.notices.push(UPDATE_NOTICE_ID);
  state.mail.push({ id: UPDATE_NOTICE_ID, title: UPDATE_NOTICE_TITLE, sender: '운영팀', body: UPDATE_NOTICE_BODY, createdAt: now, expiresAt: UPDATE_NOTICE_UNTIL, gold: 3000, books: 2, claimedAt: null, read: false });
  return true;
}
export function periods(now = Date.now()) {
  // Shift 05:00 KST to midnight UTC. The resulting UTC weekday gives Monday resets.
  const shifted = now + 4 * HOUR, day = new Date(shifted);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const monday = midnight - ((day.getUTCDay() + 6) % 7) * DAY;
  return { daily: String(midnight / DAY), weekly: String(monday / DAY), dailyEnd: midnight + DAY - 4 * HOUR, weeklyEnd: monday + 7 * DAY - 4 * HOUR };
}
export function advanceJourney(state, before, save, now = Date.now()) {
  const keys = periods(now);
  state ??= { achievements: [], mail: [{ id: 'welcome-v1', title: '황야에 오신 것을 환영합니다', sender: '운영팀', body: '모험을 시작하는 데 도움이 되길 바랍니다.', createdAt: now, expiresAt: now + 7 * DAY, gold: 1000, books: 1, claimedAt: null, read: false }] };
  for (const kind of ['daily', 'weekly']) {
    if (state[kind]?.key !== keys[kind]) state[kind] = { key: keys[kind], kills: 0, bosses: 0, seconds: 0, days: 0, claims: [] };
    state[kind].days ??= 0;
    for (const [metric, source] of [['kills','kills'],['bosses','bossKills'],['seconds','playSeconds']]) {
      const next = Number(save?.[source] ?? 0), prior = Number(before?.[source] ?? 0);
      if (Number.isFinite(next) && Number.isFinite(prior)) state[kind][metric] += Math.max(0, next - prior);
    }
  }
  state.achievements ??= []; state.mail ??= [];
  grantUpdateNotice(state, now);
  return state;
}
export async function journeyState(tx, row, save = row.save, now = Date.now()) {
  const entry = 'journeyRecord' in row ? row.journeyRecord : (await tx.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[row.id]})).rows[0];
  return advanceJourney(entry ? JSON.parse(entry.state_json) : undefined, row.save, save, now);
}
export const journeyOperation = (id, state) => ({ sql: 'INSERT INTO djrpg_journey VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET state_json=excluded.state_json', args: [id, JSON.stringify(state)] });
export const dailyTasks = [
  {id:'login',name:'오늘 접속',metric:'login',target:1,gold:300,books:0},
  {id:'hunt',name:'몬스터 300마리 처치',metric:'kills',target:300,gold:1000,books:1},
  {id:'boss',name:'보스 3회 처치',metric:'bosses',target:3,gold:1500,books:1},
  {id:'time',name:'30분 플레이',metric:'seconds',target:1800,gold:1000,books:1}
];
export const weeklyTasks = [
  {id:'days',name:'일일 목표 5일 완료',metric:'days',target:5,gold:5000,books:3},
  {id:'hunt',name:'몬스터 5,000마리 처치',metric:'kills',target:5000,gold:5000,books:3},
  {id:'boss',name:'보스 30회 처치',metric:'bosses',target:30,gold:8000,books:3},
  {id:'time',name:'5시간 플레이',metric:'seconds',target:18000,gold:5000,books:3}
];
export const completionRewards = {
  daily:{id:'completion',name:'일일 전체 완료 보상',gold:2000,books:2,completion:true},
  weekly:{id:'completion',name:'주간 전체 완료 보상',gold:10000,books:5,completion:true}
};
const milestones = [
  ['level','성장','캐릭터 레벨',[5,10,20,30],save=>save.level],
  ['kills','사냥','몬스터 처치',[1000,10000,100000],save=>save.kills],
  ['boss','보스','보스 처치',[10,100,1000],save=>save.bossKills??0],
  ['floor','탐험','최고 도달 층',[10,30,50,100],save=>save.maxFloor??save.floor],
  ['collection','수집','장비 도감 수집',[10,30,50],save=>new Set(save.equipmentCollection??[]).size],
  ['skills','스킬','습득 스킬 수',[1,5,11],save=>new Set([...(save.learned??[]),...(save.passives??[])]).size],
  ['rank','스킬','최고 스킬 레벨',[10,20,30],save=>Math.max(0,...Object.values(save.skillLevels??{}))]
];
export function journeyView(state, save, now = Date.now()) {
  const timed = (kind, tasks) => {
    const rows=tasks.map(task=>({...task,current:Math.min(task.target,Math.floor(task.metric==='login'?1:state[kind][task.metric])),claimed:state[kind].claims.includes(task.id)}));
    return [...rows,{...completionRewards[kind],target:rows.length,current:rows.filter(task=>task.current>=task.target).length,claimed:state[kind].claims.includes('completion')}];
  };
  const achievements = milestones.flatMap(([key,category,name,targets,get])=>targets.map((target,index)=>({id:`${key}-${target}`,category,name:`${name} ${target.toLocaleString('ko-KR')}`,target,current:Math.min(target,Math.floor(get(save)??0)),gold:1000*(index+1),books:index+1,claimed:state.achievements.includes(`${key}-${target}`)})));
  return {daily:timed('daily',dailyTasks),weekly:timed('weekly',weeklyTasks),achievements,mail:state.mail.map(mail=>({...mail,expired:mail.expiresAt<=now})),periods:periods(now),now};
}
