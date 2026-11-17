const HOUR = 3600000, DAY = 24 * HOUR;
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
  const timed = (kind, tasks) => tasks.map(task=>({...task,current:Math.min(task.target,Math.floor(task.metric==='login'?1:state[kind][task.metric])),claimed:state[kind].claims.includes(task.id)}));
  const achievements = milestones.flatMap(([key,category,name,targets,get])=>targets.map((target,index)=>({id:`${key}-${target}`,category,name:`${name} ${target.toLocaleString('ko-KR')}`,target,current:Math.min(target,Math.floor(get(save)??0)),gold:1000*(index+1),books:index+1,claimed:state.achievements.includes(`${key}-${target}`)})));
  return {daily:timed('daily',dailyTasks),weekly:timed('weekly',weeklyTasks),achievements,mail:state.mail.map(mail=>({...mail,expired:mail.expiresAt<=now})),periods:periods(now),now};
}
