const HOUR = 3600000, DAY = 24 * HOUR;
// 2026-11-20 업데이트 안내 + 점검 보상 우편(사용자 확정: 금화 3,000 + 스킬북 2권).
export const UPDATE_NOTICE_ID = 'update-2026-11-20';
/** 우편 만료 = 2026-11-28 00:00 KST. 이 시각을 넘겨 처음 접속한 계정에는 보상을 붙이지 않는다. */
export const UPDATE_NOTICE_UNTIL = Date.UTC(2026, 10, 27, 15, 0, 0);
/** 시즌1에 지급한 옛 다이아 우편 ID — 시즌2 우편은 **다른 ID**를 쓴다.
 *  다이아 지급은 `djrpg_shop_ledger`의 `UNIQUE(account_id,source_type,source_id)`로 한 번만 기록되는데,
 *  시즌 초기화는 `djrpg_journey`만 비우고 원장은 남긴다(`server/season.mjs`). 그래서 시즌1에 이 우편을
 *  받은 계정이 시즌2에 같은 ID로 다시 받으면 `INSERT`가 UNIQUE 충돌(500)로 터졌다(핫픽스 220, 사용자 제보 `#5539`). */
export const LEGACY_DIAMOND_MAIL_ID = 'all-idle-launch-diamonds-2026-11-20';
/** 시즌2 전 슬롯 방치 기능 기념 다이아 4,000개 우편 — 시즌마다 새 ID를 쓴다. */
export const DIAMOND_MAIL_ID = 'all-idle-launch-diamonds-2026-11-20-s2';
/** 새 시즌 안내 우편 — 시즌 초기화 뒤 처음 들어온 모험가가 당황하지 않도록 한 번만 넣는다(작업 208).
 *  보상은 `1,000G + 무작위 보물 주머니 1개`다(작업 208 사용자 요청 `#4069`). */
export const SEASON_NOTICE_ID = 'season-2-open';
const SEASON_NOTICE_TITLE = '[새 시즌 오픈] 대공사 새 시즌 오픈! 기념 보물 주머니 1개를 드립니다';
const SEASON_NOTICE_BODY = `안녕하세요, 모험가님!
대공사 새 시즌 오픈! 기념 보물 주머니 1개를 드립니다.

대공사 업데이트로 DJRPG의 새 시즌이 시작되었습니다.
지난 시즌의 레벨·장비·가방·다이아·층수·거래소·창고·던전 기록은 모두 정리되었고, 아이디와 비밀번호는 그대로입니다.
로그인하면 먼저 직업과 성별을 새로 고르는 화면이 나옵니다. 고른 직업의 무기를 받고 1층부터 다시 모험을 시작해 주세요!

함께 드리는 기념 보물 주머니는 가방에서 열면 금화·장비·영구 스탯북 중 하나가 나옵니다.
새 시즌에서도 즐거운 모험 되시길 바랍니다.`;
/** 새 시즌 안내 우편을 계정마다 **한 번만** 준다(업데이트 안내와 같은 지급 이력 방식). */
export function grantSeasonNotice(state, now = Date.now()) {
  state.notices ??= [];
  if (state.notices.includes(SEASON_NOTICE_ID) || state.mail.some(entry => entry.id === SEASON_NOTICE_ID)) return false;
  state.notices.push(SEASON_NOTICE_ID);
  state.mail.push({ id: SEASON_NOTICE_ID, title: SEASON_NOTICE_TITLE, sender: '운영팀', body: SEASON_NOTICE_BODY, createdAt: now, expiresAt: null, gold: 1000, books: 0, pouches: 1, claimedAt: null, read: false });
  return true;
}
/**
 * 2026-11-20~21 서버 연결 불안정(503) 사과 보상 우편 — 계정당 **한 번만** 무작위 보물 주머니 5개(작업 237).
 * 사용자 요청: "서버 불안정 보상 주자 꾸러미상자인가 그 템 5개"(2026-11-21 01:10 KST).
 * 업데이트 안내 우편(`UPDATE_NOTICE_ID`)과 같은 방식으로 `state.notices`에 지급 이력을 남겨
 * 수령·삭제·만료 뒤에도 다시 붙지 않게 한다.
 */
export const APOLOGY_MAIL_ID = 'apology-db-20261120';
/** 우편 만료 = 2026-12-05 00:00 KST(2주). 이 시각을 넘겨 처음 접속한 계정에는 보상을 붙이지 않는다. */
export const APOLOGY_MAIL_UNTIL = Date.UTC(2026, 11, 4, 15, 0, 0);
/** 사과 보상으로 드리는 무작위 보물 주머니 수(사용자 확정 5개). */
export const APOLOGY_MAIL_POUCHES = 5;
const APOLOGY_MAIL_TITLE = '서버 연결 불안정 사과 보상';
const APOLOGY_MAIL_BODY = '서버 연결 불안정으로 이용에 불편을 드려 죄송합니다. 사과의 마음을 담아 무작위 보물 주머니 5개를 보내드립니다.';
/** 사과 보상 우편을 계정마다 **한 번만** 준다. 기간(`APOLOGY_MAIL_UNTIL`)이 지나면 새로 붙이지 않는다. */
export function grantApologyMail(state, now = Date.now()) {
  state.notices ??= []; state.mail ??= [];
  if (now >= APOLOGY_MAIL_UNTIL) return false;
  if (state.notices.includes(APOLOGY_MAIL_ID) || state.mail.some(entry => entry.id === APOLOGY_MAIL_ID)) return false;
  state.notices.push(APOLOGY_MAIL_ID);
  state.mail.push({ id: APOLOGY_MAIL_ID, title: APOLOGY_MAIL_TITLE, sender: '운영팀', body: APOLOGY_MAIL_BODY, createdAt: now, expiresAt: APOLOGY_MAIL_UNTIL, gold: 0, books: 0, pouches: APOLOGY_MAIL_POUCHES, claimedAt: null, read: false });
  return true;
}
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
/**
 * 2026-11-21 업데이트 안내 우편(작업 245~252 운영 배포) — 사용자 확정: **무작위 보물 주머니 5개**
 * (`gold: 0`, `books: 0`). 사과 보상 우편(작업 237)과 같은 방식으로 계정마다 한 번만 주고,
 * 지급 이력을 `state.notices`에 남겨 수령·삭제·만료 뒤에도 다시 붙지 않게 한다.
 *
 * 본문은 사용자가 정한 문구 그대로다 — 운영 서버에서 실제로 체감하는 것만 짧게 적었고,
 * 미리보기에서만 확인한 항목(테스트 우편·보물 주머니 버리기 등)은 넣지 않았다.
 */
export const UPDATE_NOTICE_2_ID = 'update-notice-2026-11-21';
/** 우편 만료 = 2026-12-05 00:00 KST(2주). 이 시각을 넘겨 처음 접속한 계정에는 보상을 붙이지 않는다. */
export const UPDATE_NOTICE_2_UNTIL = Date.UTC(2026, 11, 4, 15, 0, 0);
/** 업데이트 기념으로 드리는 무작위 보물 주머니 수(사용자 확정 5개). */
export const UPDATE_NOTICE_2_POUCHES = 5;
const UPDATE_NOTICE_2_TITLE = '[업데이트] 거래소 · 스킬북 합성 · 던전 개편 안내';
const UPDATE_NOTICE_2_BODY = `모험가님, 더 쾌적한 모험을 위해 주요 시스템을 개편했습니다.

1. 거래소 개편
- 묶음 거래: 스킬북을 최대 10개까지 한 번에 등록하고, 구매 시 전체 또는 원하는 수량만큼 나눠 살 수 있습니다.
- 편의 개선: 간편/상세 보기 전환과 8칸 등록 화면을 추가했고, 수령함에 받을 물품이 있으면 빨간 점이 뜹니다. (수령함 최대 30건)

2. 스킬북 합성 & 가방 · 창고
- 스킬북 합성: 안 쓰는 다른 직업 스킬북 5권을 모아 내 직업 랜덤 스킬북 1권으로 합성할 수 있습니다. (자동 합성 지원)
- 가방 40칸 통합: 장비·스킬북·보물 주머니를 합쳐 40칸으로 통일되며, 가방이 차면 아이템 우편은 비운 뒤 받을 수 있습니다.
- 드롭 & 창고: 1층부터 모든 스킬북이 고르게 나오며, 공용창고에서 여러 개를 바로 골라 빠르게 옮길 수 있습니다.

3. 스킬 · 사냥 · 던전
- 스킬 편의: 자동 강화 버튼과 + 슬롯 추천 장착이 개선되었습니다.
- 사냥 & 던전: 30마리 강등 시에만 자동 등반이 꺼지고 ⚔ 보스 도전이 유지되며, 끝없는 던전 난이도와 보상(보스 2개 확정 · 등급 표기)이 조정되었습니다.
- 보상 알림: 일일·주간 보상 탭에 빨간 점 알림이 추가되었습니다.

감사의 마음을 담아 보물 주머니 5개를 보내드립니다. 즐거운 모험 되세요!`;
/** 2026-11-21 업데이트 안내 우편을 계정마다 **한 번만** 준다. 기간이 지나면 새로 붙이지 않는다. */
export function grantUpdateNotice2(state, now = Date.now()) {
  state.notices ??= []; state.mail ??= [];
  if (now >= UPDATE_NOTICE_2_UNTIL) return false;
  if (state.notices.includes(UPDATE_NOTICE_2_ID) || state.mail.some(entry => entry.id === UPDATE_NOTICE_2_ID)) return false;
  state.notices.push(UPDATE_NOTICE_2_ID);
  state.mail.push({ id: UPDATE_NOTICE_2_ID, title: UPDATE_NOTICE_2_TITLE, sender: '운영팀', body: UPDATE_NOTICE_2_BODY, createdAt: now, expiresAt: UPDATE_NOTICE_2_UNTIL, gold: 0, books: 0, pouches: UPDATE_NOTICE_2_POUCHES, claimedAt: null, read: false });
  return true;
}
/**
 * 2026-11-22 새벽 밸런스·UI 개편 배포 기념 보상 우편 — 계정당 **한 번만** 무작위 보물 주머니 5개.
 * 사용자 요청(2026-11-21 23:38 KST): "밸런스패치보상 주자 꾸러미5개랑 일일 버프 공 방 체 30퍼 종일 버프".
 * 종일 버프(+30%, 공·방·체)는 세이브가 아니라 시계로 도는 이벤트라 `src/game/patchBuff.ts`가 맡는다.
 *
 * 지급은 **배포 직후(02:00 KST)부터 종일 버프가 끝나는 다음 날 05:00 KST까지** 처음 접속한 계정에만 한다 —
 * 그 뒤에 새로 만든 계정이 한 달 뒤에 "패치 감사 보상"을 받는 일이 없다. 수령 만료는 지급일부터 7일이다.
 */
export const PATCH_REWARD_ID = 'patch-balance-v2-20261122';
/** 지급 시작 = 2026-11-22 02:00 KST(새벽 배포 직후). */
export const PATCH_REWARD_FROM = Date.UTC(2026, 10, 21, 17, 0, 0);
/** 지급 마감 = 2026-11-23 05:00 KST(종일 버프 종료 = 일일 초기화). */
export const PATCH_REWARD_UNTIL = Date.UTC(2026, 10, 22, 20, 0, 0);
/** 기념으로 드리는 무작위 보물 주머니 수(사용자 확정 5개). */
export const PATCH_REWARD_POUCHES = 5;
/** 수령 만료까지의 기간 — 지급일부터 7일. */
export const PATCH_REWARD_DAYS = 7;
const PATCH_REWARD_TITLE = '밸런스·UI 개편 감사 보상';
const PATCH_REWARD_BODY = '대규모 밸런스·UI 개편을 기념해 보물 주머니 5개와 오늘 종일 공·방·체 +30% 버프를 드립니다!';
/** 기념 보상 우편을 계정마다 **한 번만** 준다. 지급 이력은 `state.notices`에 남겨 수령·삭제·만료 뒤에도 다시 붙지 않는다. */
export function grantPatchReward(state, now = Date.now()) {
  state.notices ??= []; state.mail ??= [];
  if (now < PATCH_REWARD_FROM || now >= PATCH_REWARD_UNTIL) return false;
  if (state.notices.includes(PATCH_REWARD_ID) || state.mail.some(entry => entry.id === PATCH_REWARD_ID)) return false;
  state.notices.push(PATCH_REWARD_ID);
  state.mail.push({ id: PATCH_REWARD_ID, title: PATCH_REWARD_TITLE, sender: '운영팀', body: PATCH_REWARD_BODY, createdAt: now, expiresAt: now + PATCH_REWARD_DAYS * DAY, gold: 0, books: 0, pouches: PATCH_REWARD_POUCHES, claimedAt: null, read: false });
  return true;
}
export function periods(now = Date.now()) {
  // Shift 05:00 KST to midnight UTC. The resulting UTC weekday gives Monday resets.
  const shifted = now + 4 * HOUR, day = new Date(shifted);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const monday = midnight - ((day.getUTCDay() + 6) % 7) * DAY;
  return { daily: String(midnight / DAY), weekly: String(monday / DAY), dailyEnd: midnight + DAY - 4 * HOUR, weeklyEnd: monday + 7 * DAY - 4 * HOUR };
}
/**
 * 여정 상태를 지금 시각으로 앞으로 넘긴다 — 기간 초기화, 지급 우편(업데이트 안내·새 시즌·사과 보상·다이아).
 *
 * 미리보기 전용 테스트 우편(작업 210·212·251)은 운영 배포에서 지웠다(작업 252) — 지급 함수·삭제 함수·
 * `previewMode` 인자까지 없앴으므로, 어느 호스트에서도 테스트 우편이 붙지 않는다.
 */
export function advanceJourney(state, before, save, now = Date.now(), diamondMailEligible = false) {
  const keys = periods(now);
  // 파트 B: 첫 우편에서 스킬북을 빼고 금화 1,000만 남긴다(스킬북은 폐지 — 주면 저장 검증에서 거절된다).
  state ??= { achievements: [], mail: [{ id: 'welcome-v1', title: '황야에 오신 것을 환영합니다', sender: '운영팀', body: '모험을 시작하는 데 도움이 되길 바랍니다.', createdAt: now, expiresAt: now + 7 * DAY, gold: 1000, books: 0, claimedAt: null, read: false }] };
  for (const kind of ['daily', 'weekly']) {
    if (state[kind]?.key !== keys[kind]) state[kind] = { key: keys[kind], kills: 0, bosses: 0, seconds: 0, days: 0, worldBoss: 0, salvage: 0, claims: [] };
    state[kind].days ??= 0;
    // 새 지표(작업 207)는 이전 기간의 상태에 없을 수 있다 — 없으면 0부터 센다.
    state[kind].worldBoss ??= 0; state[kind].salvage ??= 0;
    // 진행 카운터는 세이브의 누적 값 차이로 센다. `worldBoss`는 서버가 직접 올리므로 여기 없다.
    for (const [metric, source] of [['kills','kills'],['bosses','bossKills'],['seconds','playSeconds'],['salvage','salvageCount']]) {
      const next = Number(save?.[source] ?? 0), prior = Number(before?.[source] ?? 0);
      if (Number.isFinite(next) && Number.isFinite(prior)) state[kind][metric] += Math.max(0, next - prior);
    }
  }
  state.achievements ??= []; state.mail ??= [];
  migrateLegacyDiamondMail(state);
  grantUpdateNotice(state, now);
  grantSeasonNotice(state, now);
  // 서버 연결 불안정 사과 보상(작업 237) — 계정당 1회, 무작위 보물 주머니 5개.
  grantApologyMail(state, now);
  // 2026-11-21 업데이트 안내(작업 252) — 계정당 1회, 무작위 보물 주머니 5개.
  grantUpdateNotice2(state, now);
  // 2026-11-22 밸런스·UI 개편 배포 기념 보상 — 계정당 1회, 무작위 보물 주머니 5개(+종일 공·방·체 30% 버프 안내).
  grantPatchReward(state, now);
  if (diamondMailEligible) {
    // 옛 ID 우편을 이미 받아 둔 계정은 위 `migrateLegacyDiamondMail`이 새 ID로 바꿔 두었다 — 새로 붙이지 않는다.
    state.notices ??= [];
    // 핫픽스 직전 20여 분 사이에 옛 ID로 4,000 다이아를 이미 받은 계정(수령 후 우편 삭제)에게 같은 보상을
    // 한 번 더 주지 않는다 — 시즌1에 1,000을 받은 계정은 옛 ID 우편이 우편함에 남아 있어 마이그레이션으로 받는다.
    const alreadyGranted = state.notices.includes(LEGACY_DIAMOND_MAIL_ID) || state.mail.some(entry => entry.id === LEGACY_DIAMOND_MAIL_ID || entry.id === DIAMOND_MAIL_ID);
    if (!alreadyGranted && !state.notices.includes(DIAMOND_MAIL_ID)) {
      state.notices.push(DIAMOND_MAIL_ID);
      state.mail.push({ id: DIAMOND_MAIL_ID, title: '다이아 4,000개 지급', sender: '운영팀', body: '전 슬롯 방치 기능 출시를 기념해 계정마다 다이아 4,000개를 드립니다.', createdAt: now, expiresAt: null, gold: 0, books: 0, diamonds: 4000, claimedAt: null, read: false });
    }
  }
  return state;
}
/**
 * 시즌1 다이아 우편(`LEGACY_DIAMOND_MAIL_ID`)이 우편함에 **미수령**으로 남아 있으면 시즌2 ID로 바꾼다(핫픽스 220).
 *
 * 시즌 초기화 전에 들어온 우편은 세이브로 남아 있어 시즌2에도 `받기`가 눌리는데, 옛 ID는 시즌1 원장 행과
 * 부딪혀 500이 났다. ID만 새 시즌 것으로 바꾸면 같은 보상을 그대로 한 번 받을 수 있고,
 * 이미 받은(`claimedAt`) 우편은 건드리지 않는다. `state.notices`의 지급 이력도 새 ID로 맞춰 다시 붙지 않게 한다.
 */
export function migrateLegacyDiamondMail(state) {
  if (!state || !Array.isArray(state.mail)) return state;
  const legacy = state.mail.find(entry => entry?.id === LEGACY_DIAMOND_MAIL_ID && !entry.claimedAt);
  if (!legacy) return state;
  if (state.mail.some(entry => entry?.id === DIAMOND_MAIL_ID)) {
    // 새 시즌 우편이 이미 따로 있으면 옛 우편은 지운다 — 같은 4,000 다이아를 두 통 받지 않게.
    state.mail = state.mail.filter(entry => entry !== legacy);
  } else legacy.id = DIAMOND_MAIL_ID;
  state.notices ??= [];
  state.notices = state.notices.map(id => (id === LEGACY_DIAMOND_MAIL_ID ? DIAMOND_MAIL_ID : id));
  if (!state.notices.includes(DIAMOND_MAIL_ID)) state.notices.push(DIAMOND_MAIL_ID);
  return state;
}
export async function journeyState(tx, row, save = row.save, now = Date.now()) {
  const entry = 'journeyRecord' in row ? row.journeyRecord : (await tx.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[row.id]})).rows[0];
  return advanceJourney(entry ? JSON.parse(entry.state_json) : undefined, row.save, save, now, row.password_hash !== 'guest');
}
/**
 * 서버가 직접 아는 사건(월드보스 도전 시작 등)을 그 기간 카운터에 **1회** 더한다(작업 207).
 * 세이브 차이로 셀 수 없는 지표의 자리다. `row.journeyRecord`가 미리 읽혀 있으면 그 사본을 쓴다(추가 SELECT 없음).
 */
export async function recordJourneyMetric(tx, row, metric, save = row.save, now = Date.now()) {
  const state = await journeyState(tx, row, save, now);
  for (const kind of ['daily', 'weekly']) state[kind][metric] = (state[kind][metric] ?? 0) + 1;
  await tx.execute(journeyOperation(row.id, state));
  return state;
}
export const journeyOperation = (id, state) => ({ sql: 'INSERT INTO djrpg_journey VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET state_json=excluded.state_json', args: [id, JSON.stringify(state)] });
/** 무작위 보물 주머니 — 가방에 들어가는 소모품이다(작업 207). 서버는 이 모양 그대로 지급한다. */
export const POUCH_NAME = '무작위 보물 주머니';
export const POUCH_SLOT = 'pouch';
export const pouchItem = (id) => ({ id, name: POUCH_NAME, slot: POUCH_SLOT, kind: 'pouch', rarity: 'unique', stats: {} });
// 일일·주간 개별 미션은 **금화만** 준다. 전체 완료 보상만 주머니를 준다(작업 207, 사용자 확정).
// 미션은 다섯 개로 맞췄다(사용자 확정 #3748): 사냥터 보스 미션은 빼고 **월드보스 도전**과 **장비 분해**를 넣는다.
//  - `worldBoss`는 서버(`server/world-boss.mjs` start)가 `recordJourneyMetric`으로 올린다 — 시도가 성립한 순간 1회.
//  - `salvage`는 세이브의 누적 `salvageCount` 증가분을 센다(수동·일괄·자동 분해가 분해한 장비 수만큼).
export const dailyTasks = [
  {id:'login',name:'오늘 접속',metric:'login',target:1,gold:300,books:0},
  {id:'hunt',name:'몬스터 300마리 처치',metric:'kills',target:300,gold:1000,books:0},
  {id:'time',name:'30분 플레이',metric:'seconds',target:1800,gold:1000,books:0},
  {id:'worldBoss',name:'월드보스 1회 도전',metric:'worldBoss',target:1,gold:1500,books:0},
  {id:'salvage',name:'장비 1개 분해',metric:'salvage',target:1,gold:800,books:0}
];
export const weeklyTasks = [
  {id:'days',name:'일일 목표 5일 완료',metric:'days',target:5,gold:5000,books:0},
  {id:'hunt',name:'몬스터 2,000마리 처치',metric:'kills',target:2000,gold:5000,books:0},
  {id:'time',name:'3시간 플레이',metric:'seconds',target:10800,gold:5000,books:0},
  {id:'worldBoss',name:'월드보스 5일 도전',metric:'worldBoss',target:5,gold:8000,books:0},
  {id:'salvage',name:'장비 분해 15회',metric:'salvage',target:15,gold:5000,books:0}
];
export const completionRewards = {
  daily:{id:'completion',name:'일일 전체 완료 보상',gold:2000,books:0,pouches:1,completion:true},
  weekly:{id:'completion',name:'주간 전체 완료 보상',gold:10000,books:0,pouches:3,completion:true}
};
/** 장비 도감 발견 수 — **등급별 칸**(`부위:번호:등급`)만 센다(작업 208·249). 135종 × 6등급 = 810칸. */
export function collectionCount(save) {
  const keys = Array.isArray(save?.equipmentCollection) ? save.equipmentCollection : [];
  return new Set(keys.filter(key => typeof key === 'string' && /^(weapon|offhand|helmet|armor|necklace|gloves|belt|boots|ring):\d{1,2}:(?:common|magic|rare|epic|unique|legendary)$/.test(key))).size;
}
/** 스킬 강화 횟수 — 배운 스킬의 1레벨을 뺀 레벨 합계(작업 208, 사용자 확정 기준). */
export function skillUpgradeCount(save) {
  return Object.values(save?.skillLevels ?? {}).reduce((sum, level) => sum + Math.max(0, (Number(level) || 1) - 1), 0);
}
/**
 * 업적 보상 (작업 208 사용자 확정 `#4150`·`#4157`).
 *
 * 일일·주간과 같이 **스킬북을 직접 주지 않는다**(`books:0`). 대신 단계가 올라갈수록 금화가 커지고,
 * 긴 사슬의 뒤쪽 단계부터 보물 주머니를 함께 준다 — 4단계 이상인 업적은 3번째 단계(index 2)부터 1개,
 * 각 업적의 **마지막 단계**는 2개다. (3단계짜리 업적은 지금 없지만, 있다면 마지막 단계만 2개다.)
 */
export const achievementGold = [1000, 2000, 3000, 5000, 8000, 12000, 20000];
export function achievementReward(index, count) {
  const gold = achievementGold[Math.min(Math.max(0, index), achievementGold.length - 1)];
  const last = index === count - 1;
  const pouches = last ? 2 : count >= 4 && index >= 2 ? 1 : 0;
  return { gold, books: 0, pouches };
}
const milestones = [
  ['level','성장','캐릭터 레벨',[5,10,15,20,25,30],save=>save.level],
  // 몬스터 처치 단계는 2026-11-20 사용자 지시(`#6180`·`#6194`)로 7단계를 [1000,5000,15000,30000,60000,120000,250000]으로 올렸다.
  ['kills','사냥','몬스터 처치',[1000,5000,15000,30000,60000,120000,250000],save=>save.kills],
  // 보스는 **보스만 합산**한다(작업 210, 사용자 지시 `#4475`·`#4486`): 사냥터 층 보스 + 던전 5·10층 보스
  // + 월드보스 도전(하루 3회, 도전마다 1회)이 세이브의 `bossKills` 하나로 모인다. 필드 정예 몹은 제외.
  ['boss','보스','보스 처치',[10,50,100,150,200],save=>save.bossKills??0],
  ['floor','탐험','최고 도달 층',[5,10,15,20],save=>save.maxFloor??save.floor],
  // 투구·갑옷이 직업별 3갈래로 늘어 도감 칸이 570 → 810이 됐다(작업 249). 마지막 단계만 810으로 올려
  // "전부 모으면 마지막 단계"라는 뜻은 그대로 두고, 이미 오른 단계는 건드리지 않는다.
  ['collection','수집','장비 도감 수집',[10,50,100,200,300,450,810],save=>collectionCount(save)],
  ['skills','스킬','스킬 강화 횟수',[5,15,30,50,100],save=>skillUpgradeCount(save)],
  ['rank','스킬','최고 스킬 레벨',[5,10,15,20,25,30],save=>Math.max(0,...Object.values(save.skillLevels??{}))],
  // 거래소 거래 완료(작업 224, 사용자 확정 `#6289`·`#6294`) — 등록·취소는 세지 않고 **실제로 성사된 거래**만
  // 구매·판매 양쪽에서 1씩 센다. 횟수는 계정 단위 거래 장부(`djrpg_journey.state_json.marketTrades`)에
  // `server/market.mjs` buy가 직접 올리므로 세션 상태를 받아 읽는다.
  ['market','거래','거래소 거래 완료',[1,5,15,30,50,100],(_save,state)=>state?.marketTrades??0]
];
export function journeyView(state, save, now = Date.now()) {
  const timed = (kind, tasks) => {
    const rows=tasks.map(task=>({...task,current:Math.min(task.target,Math.floor(task.metric==='login'?1:(state[kind][task.metric]??0))),claimed:state[kind].claims.includes(task.id)}));
    return [...rows,{...completionRewards[kind],target:rows.length,current:rows.filter(task=>task.current>=task.target).length,claimed:state[kind].claims.includes('completion')}];
  };
  const achievements = milestones.flatMap(([key,category,name,targets,get])=>targets.map((target,index)=>({id:`${key}-${target}`,category,name:`${name} ${target.toLocaleString('ko-KR')}`,target,current:Math.min(target,Math.floor(get(save,state)??0)),...achievementReward(index,targets.length),claimed:state.achievements.includes(`${key}-${target}`)})));
  return {daily:timed('daily',dailyTasks),weekly:timed('weekly',weeklyTasks),achievements,mail:state.mail.map(mail=>({...mail,expired:mail.expiresAt!==null&&mail.expiresAt<=now})),periods:periods(now),now};
}
