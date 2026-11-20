/** 캐릭터 세이브의 첫 모양 — 계정 가입·캐릭터 추가·시즌 초기화가 모두 이 한 곳을 쓴다(작업 206).
 *  `src/game/store.ts`의 `parseSave`가 기본값을 채우므로 여기에는 계약에 있는 필드만 적는다. */
export const jobs = ['warrior', 'archer', 'mage'];
export const jobOf = value => value === 'archer' || value === 'mage' ? value : 'warrior';

export const initialSave = (id, gender, name, job = 'warrior') => ({ version: 1, name, accountId: id, gender, job: jobOf(job), auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 100, equipment: {}, equipmentCollection: [], bag: [], tutorial: 0, stones: 0, skillPoints: 0, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {}, dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0 });

/** 시즌 초기화 직후의 세이브(작업 206): 아이디·비밀번호만 남기고 게임 데이터를 100% 비운 상태다.
 *  `needsSetup`이 true인 동안은 인게임에 들어가지 않고, 로그인 뒤 직업·성별을 고른 다음
 *  `completeSetup`이 직업 첫 확정 무기를 가진 1층 캐릭터로 바꿔 준다. `season`은 지금 시즌 번호다. */
export const seasonResetSave = (id, name = '') => ({ ...initialSave(id, 'male', name || id), season: 2, needsSetup: true });
