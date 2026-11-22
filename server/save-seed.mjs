/** 캐릭터 세이브의 첫 모양 — 계정 가입·캐릭터 추가·시즌 초기화가 모두 이 한 곳을 쓴다(작업 206).
 *  `src/game/store.ts`의 `parseSave`가 기본값을 채우므로 여기에는 계약에 있는 필드만 적는다. */
// SP는 `src/game/skillPoints.ts` 한 곳의 식에서 온다 — Lv.1부터 3pt(사용자 지시 `#23795`). 0으로 두면
// 서버가 준 세이브를 `parseSave`가 그대로 믿어(저장값 ≤ 장부 상한) Lv.1 캐릭터가 빈 SP로 시작한다.
import { SP_PER_LEVEL } from '../src/game/skillPoints.ts';
export const jobs = ['warrior', 'archer', 'mage'];
export const jobOf = value => value === 'archer' || value === 'mage' ? value : 'warrior';

/** 새 캐릭터가 처음부터 갖는 액티브 스킬 1개(그 직업의 첫 스킬) — 밸런스 v2 온보딩.
 *  `src/game/skills.ts`의 `skillOrderFor(job)[0]`과 같아야 한다.
 *  전사 이단참 · 궁수 더블 샷 · 마법사 파이어 볼트. 퀵슬롯에는 넣지 않는다(튜토리얼이 안내한다). */
export const starterSkillFor = job => ({ warrior: 'slash2', archer: 'doubleShot', mage: 'fireBolt' })[jobOf(job)];

export const initialSave = (id, gender, name, job = 'warrior') => ({ version: 1, name, accountId: id, gender, job: jobOf(job), auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 140, equipment: {}, equipmentCollection: [], bag: [], tutorial: 0, stones: 0, skillPoints: SP_PER_LEVEL, lastActiveAt: Date.now(), learned: [starterSkillFor(job)], passives: [], quickSlots: [null, null, null], skillLevels: { [starterSkillFor(job)]: 1 }, dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0, // 영구 스탯북 사용 권수(파트 B) — 새 캐릭터는 0/0/0/0(스킬의 서 포함)에서 시작한다.
  statBooks: { attack: 0, defense: 0, health: 0, skill: 0 } });

/** 시즌 초기화 직후의 세이브(작업 206): 아이디·비밀번호만 남기고 게임 데이터를 100% 비운 상태다.
 *  `needsSetup`이 true인 동안은 인게임에 들어가지 않고, 로그인 뒤 직업·성별을 고른 다음
 *  `completeSetup`이 직업 첫 확정 무기를 가진 1층 캐릭터로 바꿔 준다. `season`은 지금 시즌 번호다. */
export const seasonResetSave = (id, name = '') => ({ ...initialSave(id, 'male', name || id), season: 2, needsSetup: true });
