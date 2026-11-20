// 스킬북 33종의 **서버 쪽 단일 목록**(작업 209).
//
// Cloudflare Pages Functions는 `server/*.mjs`를 그대로 실행하므로 `src/game/skills.ts`(TypeScript)를
// 실행 시 import할 수 없다. 그래서 같은 값을 여기 한 번만 적고, 클라이언트의 `allSkillIds`·
// `allPassiveIds`·`skills`·`passives`와 **순서·ID·이름이 모두 같은지**를 `tests/skillbook-server.test.mjs`가
// 검사한다. 스킬을 더하면 `src/game/skills.ts`와 이 파일을 함께 고치고 그 테스트를 돌린다.
//
// 순서는 클라이언트와 같다 — 액티브(전사 8 → 궁수 8 → 마법사 8) → 패시브(전사 3 → 궁수 3 → 마법사 3).

/** 전사 액티브 8종 (`skillOrder`). */
export const warriorSkillIds = ['slash2', 'spin', 'crushing', 'slam', 'warcry', 'power', 'destroy', 'hell'];
/** 궁수 액티브 8종 (`archerSkillOrder`). */
export const archerSkillIds = ['doubleShot', 'multiShot', 'pierceShot', 'iceArrow', 'hawkEye', 'snipe', 'stormVolley', 'arrowRain'];
/** 마법사 액티브 8종 (`mageSkillOrder`). */
export const mageSkillIds = ['fireBolt', 'iceBolt', 'chainLightning', 'manaBurst', 'frostNova', 'arcaneShield', 'meteorStrike', 'arcaneOverlord'];
/** 전사 패시브 3종 (`passiveOrder`). */
export const warriorPassiveIds = ['mastery', 'body', 'instinct'];
/** 궁수 패시브 3종 (`archerPassiveOrder`). */
export const archerPassiveIds = ['bowMastery', 'swiftStep', 'hawkSight'];
/** 마법사 패시브 3종 (`magePassiveOrder`). */
export const magePassiveIds = ['staffMastery', 'manaCircuit', 'arcaneSense'];

/** 액티브 24종 (`allSkillIds`). */
export const activeSkillIds = [...warriorSkillIds, ...archerSkillIds, ...mageSkillIds];
/** 패시브 9종 (`allPassiveIds`). */
export const passiveSkillIds = [...warriorPassiveIds, ...archerPassiveIds, ...magePassiveIds];
/** 스킬북으로 떨어질 수 있는 33종 전체 (`[...allSkillIds, ...allPassiveIds]`). */
export const skillBookIds = [...activeSkillIds, ...passiveSkillIds];
/** `itemValid`가 쓰는 검사용 집합. */
export const skillBookIdSet = new Set(skillBookIds);
export const isSkillBookId = value => skillBookIdSet.has(value);

/** 스킬 이름 — 클라이언트 `skills`·`passives`의 `name`과 같다(스킬북 이름이 화면과 어긋나지 않게). */
export const skillNames = {
  slash2: '휘두르기', spin: '드래곤 트위스터', crushing: '딜레이 크러싱', slam: '와일드 스탬프',
  warcry: '블러드 레이지', power: '파워 스트라이크', destroy: '디스트로이 스윙', hell: '헬 파이어 소드',
  doubleShot: '더블 샷', multiShot: '멀티 샷', pierceShot: '관통 사격', iceArrow: '빙결 화살',
  hawkEye: '호크아이', snipe: '저격 일격', stormVolley: '폭풍 연사', arrowRain: '애로우 레인',
  fireBolt: '파이어 볼트', iceBolt: '아이스 볼트', chainLightning: '체인 라이트닝', manaBurst: '마력 폭발',
  frostNova: '프로스트 노바', arcaneShield: '아케인 실드', meteorStrike: '메테오 스트라이크', arcaneOverlord: '아르카나 오버로드',
  mastery: '대검 숙련', body: '강인한 육체', instinct: '전투 본능',
  bowMastery: '궁술 숙련', swiftStep: '신속의 발걸음', hawkSight: '매의 눈',
  staffMastery: '지팡이 숙련', manaCircuit: '마나 회로', arcaneSense: '비전 감응'
};

/** `[스킬북] {스킬 이름}` — 클라이언트 `rollSkillBook`이 만드는 이름과 같은 형식. */
export const skillBookName = skillId => `[스킬북] ${skillNames[skillId] ?? skillId}`;

/** 여정·우편 보상으로 줄 스킬북 하나 — 세 직업 33종을 같은 확률로 뽑는다(클라 드롭과 같은 규칙). */
export function rollRewardSkillBook(random = Math.random) {
  const skillId = skillBookIds[Math.min(skillBookIds.length - 1, Math.floor(random() * skillBookIds.length))] ?? skillBookIds[0];
  return { skillId, name: skillBookName(skillId) };
}
