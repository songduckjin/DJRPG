/**
 * 공통코드 시드 사전 (작업 260, `work/djrpg_db_schema_plan.md` §2.4·§7-4).
 *
 * 이 파일이 **코드 사전의 원본**이다. `scripts/sync-common-codes.mjs`가 이 값을 DB
 * (`common_code_majors`/`common_code_minors`)에 UPSERT하고 `djrpg_meta.code_version`을 올린다.
 * 서버는 그 결과를 메모리 캐시로 읽어 요청마다 코드 관련 DB 읽기를 0행으로 유지한다
 * (`server/core/commonCodes.mjs`).
 *
 * 1단계(이번 작업)에서는 **읽기·쓰기 경로를 하나도 바꾸지 않는다** — 엔드포인트는 아직 코드 상수를
 * 쓰고, 이 사전은 표·시드·캐시·검증 유틸만 준비해 둔다. 실제 검증 연결은 dual-write 단계에서 한다.
 *
 * 규칙
 *  - 코드는 **지우지 않는다**. 단종은 `status: 'DEPRECATED'`, 다른 코드로 바뀌면
 *    `status: 'REPLACED', replacedBy: '<후속 코드>'`로 남긴다(원장·기존 데이터가 계속 유효해야 한다).
 *  - 표시 이름은 여기(`name`)에만 둔다. 데이터 표에는 코드만 저장한다.
 *  - `meta`는 색·아이콘·가격·본문 템플릿 같은 부가속성 자리다(지금은 필요한 것만).
 */
// 스킬 코드 사전 — 예전 `server/skill-ids.mjs`가 갖고 있던 목록을 이 파일로 옮겼다(파트 B, 2026-11-22:
// 스킬북 폐지로 그 모듈은 삭제). 클라이언트 `src/game/skills.ts`의 id·이름과 같아야 하며
// `tests/common-codes.test.mjs`가 33종을 센다.
const warriorSkillIds = ['slash2', 'slam', 'warcry', 'power', 'destroy', 'hell', 'crushing', 'spin'];
const archerSkillIds = ['doubleShot', 'multiShot', 'pierceShot', 'iceArrow', 'hawkEye', 'snipe', 'stormVolley', 'arrowRain'];
const mageSkillIds = ['fireBolt', 'iceBolt', 'chainLightning', 'manaBurst', 'frostNova', 'arcaneShield', 'meteorStrike', 'arcaneOverlord'];
const warriorPassiveIds = ['mastery', 'body', 'instinct'];
const archerPassiveIds = ['bowMastery', 'swiftStep', 'hawkSight'];
const magePassiveIds = ['staffMastery', 'manaCircuit', 'arcaneSense'];
const activeSkillIds = [...warriorSkillIds, ...archerSkillIds, ...mageSkillIds];
const skillBookIds = [...activeSkillIds, ...warriorPassiveIds, ...archerPassiveIds, ...magePassiveIds];
/** 스킬 id → 직업(코드 사전의 `parentCode`). */
const skillBookJobOf = code => warriorSkillIds.includes(code) || warriorPassiveIds.includes(code) ? 'warrior'
  : archerSkillIds.includes(code) || archerPassiveIds.includes(code) ? 'archer'
  : mageSkillIds.includes(code) || magePassiveIds.includes(code) ? 'mage' : undefined;
/** 스킬 이름 — 클라이언트 `skills`·`passives`의 `name`과 같다. */
const skillNames = {
  slash2: '이단참', spin: '드래곤 트위스터', crushing: '딜레이 크러싱', slam: '와일드 스탬프',
  warcry: '블러드 레이지', power: '파워 스트라이크', destroy: '디스트로이 스윙', hell: '회전참격',
  doubleShot: '더블 샷', multiShot: '멀티 샷', pierceShot: '관통 사격', iceArrow: '빙결 화살',
  hawkEye: '호크아이', snipe: '저격 일격', stormVolley: '폭풍 연사', arrowRain: '애로우 레인',
  fireBolt: '파이어 볼트', iceBolt: '아이스 볼트', chainLightning: '체인 라이트닝', manaBurst: '마력 폭발',
  frostNova: '프로스트 노바', arcaneShield: '아케인 실드', meteorStrike: '메테오 스트라이크', arcaneOverlord: '아르카나 오버로드',
  mastery: '대검 숙련', body: '강인한 육체', instinct: '전투 본능',
  bowMastery: '궁술 숙련', swiftStep: '신속의 발걸음', hawkSight: '매의 눈',
  staffMastery: '지팡이 숙련', manaCircuit: '마나 회로', arcaneSense: '비전 감응'
};

/** 사전 구조 버전 — 구조(필드)가 바뀌면 올린다. 코드 내용 변경은 `code_version`이 센다. */
export const SEED_VERSION = 1;

/** 메이저(대분류). `system: true`는 서버 로직이 직접 쓰는 코드라 운영 포털에서 삭제할 수 없다. */
export const COMMON_CODE_MAJORS = [
  { major: 'JOB', name: '직업', description: '캐릭터 직업·장비 직업 제한' },
  { major: 'GENDER', name: '성별', description: '캐릭터 외형 성별' },
  { major: 'EQUIP_SLOT', name: '장비 부위', description: '가방·장착·거래소의 부위' },
  { major: 'ITEM_GRADE', name: '아이템 등급', description: '일반~전설 6등급' },
  { major: 'ITEM_KIND', name: '아이템 종류', description: '장비·스킬북·보물 주머니' },
  { major: 'ITEM_STATE', name: '아이템 상태', description: '보유(LIVE)·퇴역(RETIRED)' },
  { major: 'RETIRE_REASON', name: '퇴역 사유', description: '소모·판매·만료·운영·합성·시즌' },
  { major: 'AFFIX_TYPE', name: '추가옵션', description: '장비 추가옵션 9종' },
  { major: 'SKILL', name: '스킬', description: '스킬북 33종(액티브 24·패시브 9)' },
  { major: 'SKILL_KIND', name: '스킬 종류', description: '액티브·패시브' },
  { major: 'CURRENCY', name: '재화', description: '금화·다이아·캐릭터 슬롯' },
  { major: 'CURRENCY_KIND', name: '현금 통화', description: '결제 통화(원화)' },
  { major: 'TX_REASON', name: '재화 사유', description: '원장·지급 사유' },
  { major: 'MAIL_TYPE', name: '우편 종류', description: '공지·보상·이벤트·시스템' },
  { major: 'MAIL_TEMPLATE', name: '우편 템플릿', description: '제목·본문은 meta_json에 둔다' },
  { major: 'QUEST_CYCLE', name: '미션 주기', description: '일일·주간·월간·이벤트·시즌·1회' },
  { major: 'MISSION_KIND', name: '미션 종류', description: '일일·주간·업적·출석·이벤트·전체완료' },
  { major: 'MISSION_METRIC', name: '미션 지표', description: '처치·보스·시간·층·도감 등' },
  { major: 'MISSION_GROUP', name: '미션 그룹', description: '업적 사슬·출석 세트' },
  { major: 'MARKET_STATE', name: '매물 상태', description: '판매중·판매됨·수령됨·취소·만료' },
  { major: 'INBOX_KIND', name: '수령함 종류', description: '구매·반환·판매대금' },
  { major: 'DELIVERY_REASON', name: '배달 사유', description: '구매·취소·만료·판매' },
  { major: 'SHOP_UNLOCK', name: '상점 해금', description: '광고 제거·방치권' },
  { major: 'PRODUCT', name: '상품', description: '다이아 패키지·슬롯·이용권' },
  { major: 'PAYMENT_PROVIDER', name: '결제 제공자', description: '토스 등' },
  { major: 'ORDER_STATUS', name: '주문 상태', description: '대기·완료·실패·취소' },
  { major: 'GRANT_KIND', name: '지급 종류', description: '다이아·캐릭터 슬롯·이용권' },
  { major: 'ACCOUNT_STATUS', name: '계정 상태', description: '정상·정지·탈퇴' },
  { major: 'CHARACTER_SETUP', name: '캐릭터 준비 상태', description: '준비·자리표시자·설정 필요' },
  { major: 'CODE_STATUS', name: '코드 상태', description: 'ACTIVE·DEPRECATED·REPLACED' },
  { major: 'REQUEST_SCOPE', name: '요청 멱등 범위', description: '저장·거래·창고·상점·여정·지급' }
];

const AFFIX_NAMES = {
  regenPct: '체력 재생', bonusDmgPct: '추가 피해', lifestealPct: '생명력 흡수', attackPct: '공격력',
  critPct: '치명타 확률', defensePct: '방어력', healthPct: '체력', evasionPct: '회피', speedPct: '공격 속도',
  cdrPct: '쿨타임 감소', critDmgPct: '치명타 피해량'
};

/**
 * 코드값 사전. 배열 순서가 `sort_order`가 된다.
 * `parentCode`는 2단 계층(예: 스킬 → 직업, 미션 → 그룹)이다.
 */
export const COMMON_CODES = {
  JOB: [
    { code: 'warrior', name: '전사' },
    { code: 'archer', name: '궁수' },
    { code: 'mage', name: '마법사' }
  ],
  GENDER: [
    { code: 'male', name: '남성' },
    { code: 'female', name: '여성' }
  ],
  EQUIP_SLOT: [
    { code: 'weapon', name: '무기' },
    { code: 'offhand', name: '보조 장비' },
    { code: 'helmet', name: '투구' },
    { code: 'armor', name: '갑옷' },
    { code: 'necklace', name: '목걸이' },
    { code: 'gloves', name: '장갑' },
    { code: 'belt', name: '벨트' },
    { code: 'boots', name: '신발' },
    { code: 'ring1', name: '반지 1' },
    { code: 'ring2', name: '반지 2' },
    { code: 'skillbook', name: '스킬북' },
    { code: 'pouch', name: '보물 주머니' }
  ],
  ITEM_GRADE: [
    { code: 'common', name: '일반', meta: { color: '#cdd6e0' } },
    { code: 'magic', name: '고급', meta: { color: '#2f7bff' } },
    { code: 'rare', name: '희귀', meta: { color: '#ffd400' } },
    { code: 'epic', name: '영웅', meta: { color: '#a855f7' } },
    { code: 'unique', name: '유니크', meta: { color: '#ff8a00' } },
    { code: 'legendary', name: '전설', meta: { color: '#ff2d2d' } }
  ],
  ITEM_KIND: [
    { code: 'equipment', name: '장비' },
    { code: 'statbook', name: '영구 스탯북' },
    { code: 'pouch', name: '보물 주머니' }
  ],
  ITEM_STATE: [
    { code: 'LIVE', name: '보유' },
    { code: 'RETIRED', name: '퇴역' }
  ],
  RETIRE_REASON: [
    { code: 'CONSUMED', name: '소모' },
    { code: 'SOLD', name: '판매' },
    { code: 'EXPIRED', name: '만료' },
    { code: 'ADMIN', name: '운영 처리' },
    { code: 'SYNTH', name: '합성' },
    { code: 'SEASON', name: '시즌 종료' }
  ],
  AFFIX_TYPE: Object.entries(AFFIX_NAMES).map(([code, name]) => ({ code, name })),
  SKILL: [
    ...activeSkillIds.map(code => ({ code, name: skillNames[code] ?? code, parentCode: skillBookJobOf(code), meta: { kind: 'ACTIVE' } })),
    ...skillBookIds.filter(code => !activeSkillIds.includes(code)).map(code => ({ code, name: skillNames[code] ?? code, parentCode: skillBookJobOf(code), meta: { kind: 'PASSIVE' } }))
  ],
  SKILL_KIND: [
    { code: 'ACTIVE', name: '액티브' },
    { code: 'PASSIVE', name: '패시브' }
  ],
  CURRENCY: [
    { code: 'GOLD', name: '금화' },
    { code: 'DIAMOND', name: '다이아' },
    { code: 'SLOT', name: '캐릭터 슬롯' }
  ],
  CURRENCY_KIND: [
    { code: 'KRW', name: '원화' }
  ],
  TX_REASON: [
    { code: 'MAIL', name: '우편 수령' },
    { code: 'SLOT', name: '캐릭터 슬롯 구매' },
    { code: 'ALL_IDLE_30D', name: '30일 방치권' },
    { code: 'ORDER', name: '결제' },
    { code: 'BOSS_RANK', name: '월드보스 순위 보상' },
    { code: 'BOSS_SHARED', name: '월드보스 공유 보상' },
    { code: 'BOSS_LAST', name: '월드보스 막타 보상' },
    { code: 'BOSS_PARTICIPATION', name: '월드보스 참여 보상' },
    { code: 'MARKET_PROCEEDS', name: '거래소 판매대금' },
    { code: 'QUEST', name: '미션·업적 보상' },
    { code: 'ADMIN', name: '운영 지급' }
  ],
  MAIL_TYPE: [
    { code: 'NOTICE', name: '공지' },
    { code: 'REWARD', name: '보상' },
    { code: 'EVENT', name: '이벤트' },
    { code: 'SYSTEM', name: '시스템' }
  ],
  // 제목·본문은 `meta_json`에 둔다(데이터 표에 이름·본문을 저장하지 않는 원칙).
  MAIL_TEMPLATE: [
    { code: 'SEASON_NOTICE', name: '시즌 개막 안내' },
    { code: 'UPDATE_NOTICE', name: '업데이트 안내' },
    { code: 'SERVER_APOLOGY', name: '서버 장애 사과 보상' },
    { code: 'LAUNCH_DIAMONDS', name: '전체 방치 보상 다이아' },
    { code: 'DAILY_REWARD', name: '일일 미션 보상' },
    { code: 'WEEKLY_REWARD', name: '주간 미션 보상' },
    { code: 'BOSS_RANK_REWARD', name: '월드보스 순위 보상' },
    { code: 'MARKET_PROCEEDS', name: '거래소 판매대금' }
  ],
  QUEST_CYCLE: [
    { code: 'DAILY', name: '일일' },
    { code: 'WEEKLY', name: '주간' },
    { code: 'MONTHLY', name: '월간' },
    { code: 'EVENT', name: '이벤트' },
    { code: 'SEASON', name: '시즌' },
    { code: 'ONCE', name: '1회' }
  ],
  MISSION_KIND: [
    { code: 'DAILY', name: '일일 미션' },
    { code: 'WEEKLY', name: '주간 미션' },
    { code: 'ACHIEVEMENT', name: '업적' },
    { code: 'ATTENDANCE', name: '출석' },
    { code: 'EVENT', name: '이벤트' },
    { code: 'COMPLETION', name: '전체 완료' }
  ],
  MISSION_METRIC: [
    { code: 'KILLS', name: '몬스터 처치' },
    { code: 'BOSSES', name: '보스 처치' },
    { code: 'SECONDS', name: '플레이 시간(초)' },
    { code: 'DAYS', name: '일일 목표 달성 일수' },
    { code: 'WORLD_BOSS', name: '월드보스 도전' },
    { code: 'SALVAGE', name: '장비 분해' },
    { code: 'LOGIN', name: '접속' },
    { code: 'LEVEL', name: '캐릭터 레벨' },
    { code: 'MAX_FLOOR', name: '최고 도달 층' },
    { code: 'COLLECTION', name: '장비 도감' },
    { code: 'SKILL_UPGRADE', name: '스킬 강화 횟수' },
    { code: 'SKILL_RANK', name: '최고 스킬 레벨' },
    { code: 'MARKET_TRADES', name: '거래소 거래 완료' }
  ],
  MISSION_GROUP: [
    { code: 'ACH_KILLS', name: '업적 — 사냥' },
    { code: 'ACH_LEVEL', name: '업적 — 성장' },
    { code: 'ACH_BOSS', name: '업적 — 보스' },
    { code: 'ACH_FLOOR', name: '업적 — 탐험' },
    { code: 'ACH_COLLECTION', name: '업적 — 수집' },
    { code: 'ACH_SKILL', name: '업적 — 스킬' },
    { code: 'ACH_MARKET', name: '업적 — 거래' },
    { code: 'ATT_MONTHLY', name: '출석 28일' },
    { code: 'ATT_7D', name: '출석 7일' }
  ],
  MARKET_STATE: [
    { code: 'LISTED', name: '판매 중' },
    { code: 'SOLD', name: '판매 완료' },
    { code: 'CLAIMED', name: '수령 완료' },
    { code: 'CANCELED', name: '취소' },
    { code: 'EXPIRED', name: '만료' }
  ],
  INBOX_KIND: [
    { code: 'PURCHASE', name: '구매한 아이템' },
    { code: 'RETURN', name: '돌려받은 아이템' },
    { code: 'PROCEEDS', name: '판매대금' }
  ],
  DELIVERY_REASON: [
    { code: 'BOUGHT', name: '구매' },
    { code: 'CANCELLED', name: '취소 반환' },
    { code: 'EXPIRED', name: '만료 반환' },
    { code: 'SOLD', name: '판매 대금' }
  ],
  SHOP_UNLOCK: [
    { code: 'AD_FREE', name: '광고 제거' },
    { code: 'ALL_IDLE_30D', name: '30일 방치권' }
  ],
  PRODUCT: [
    { code: 'diamond_100', name: '다이아 100', meta: { diamonds: 100, price: 1100 } },
    { code: 'diamond_300', name: '다이아 300', meta: { diamonds: 300, price: 3300 } },
    { code: 'diamond_500', name: '다이아 500', meta: { diamonds: 500, price: 5500 } },
    { code: 'diamond_1000', name: '다이아 1000', meta: { diamonds: 1000, price: 11000 } },
    { code: 'diamond_2000', name: '다이아 2000', meta: { diamonds: 2000, price: 22000 } },
    { code: 'diamond_5000', name: '다이아 5000', meta: { diamonds: 5000, price: 55000 } },
    { code: 'diamond_10000', name: '다이아 10000', meta: { diamonds: 10000, price: 110000 } },
    { code: 'diamond_20000', name: '다이아 20000', meta: { diamonds: 20000, price: 220000 } },
    { code: 'slot', name: '캐릭터 슬롯', meta: { diamonds: 500 } },
    { code: 'all_idle_30d', name: '30일 방치권' }
  ],
  PAYMENT_PROVIDER: [
    { code: 'TOSS', name: '토스' }
  ],
  ORDER_STATUS: [
    { code: 'PENDING', name: '결제 대기' },
    { code: 'DONE', name: '결제 완료' },
    { code: 'FAILED', name: '결제 실패' },
    { code: 'CANCELED', name: '결제 취소' }
  ],
  GRANT_KIND: [
    { code: 'DIAMOND', name: '다이아' },
    { code: 'CHARACTER_SLOT', name: '캐릭터 슬롯' },
    { code: 'ENTITLEMENT', name: '이용권' }
  ],
  ACCOUNT_STATUS: [
    { code: 'ACTIVE', name: '정상' },
    { code: 'SUSPENDED', name: '정지' },
    { code: 'DELETED', name: '탈퇴' }
  ],
  CHARACTER_SETUP: [
    { code: 'READY', name: '준비됨' },
    { code: 'PLACEHOLDER', name: '자리표시자' },
    { code: 'NEEDS_SETUP', name: '설정 필요' }
  ],
  CODE_STATUS: [
    { code: 'ACTIVE', name: '사용 중' },
    { code: 'DEPRECATED', name: '단종(신규 금지)' },
    { code: 'REPLACED', name: '대체됨' }
  ],
  REQUEST_SCOPE: [
    { code: 'SAVE', name: '저장' },
    { code: 'MARKET', name: '거래소' },
    { code: 'WAREHOUSE', name: '창고' },
    { code: 'SHOP', name: '상점' },
    { code: 'JOURNEY', name: '여정' },
    { code: 'GRANT', name: '지급 이력' }
  ]
};

/** 사전을 펼친 목록 — 두 표를 한 번에 채울 때 쓴다(정렬 가능한 결정적 순서). */
export function seededCodes() {
  const rows = [];
  for (const major of COMMON_CODE_MAJORS) {
    const codes = COMMON_CODES[major.major] ?? [];
    codes.forEach((code, index) => {
      rows.push({
        majorCode: major.major,
        minorCode: code.code,
        name: code.name,
        parentCode: code.parentCode ?? null,
        sortOrder: (index + 1) * 10,
        status: code.status ?? 'ACTIVE',
        replacedBy: code.replacedBy ?? null,
        meta: code.meta ?? null
      });
    });
  }
  return rows;
}
