/**
 * 전투 도메인의 값 타입 (DOM-free).
 *
 * 이 파일은 **화면을 모르는** 전투 타입만 담는다. 서버 리플레이(`server/dungeon-verify.mjs`)와
 * 건설 검증(`server/world-boss.mjs`)이 전투 코드를 그대로 돌리므로, 여기서 `pixi.js`·DOM·`src/ui/`를
 * import하면 서버 번들까지 끌려 들어간다(`tests/architecture-boundaries.test.mjs`가 차단한다).
 *
 * 원래는 `src/game/world.ts`에 있던 타입을 옮긴 것이고, `world.ts`가 그대로 re-export하므로
 * 기존 `import type { Enemy } from './world'` 경로는 바뀌지 않는다.
 */
import type { Item } from '../store';
import type { SkillId } from '../skills';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number; slow: number;
  /** 정예 몹(작업 206) — 일반 몹 30마리마다 한 마리. 보스 타이밍이 오면 보스가 우선이라 둘은 같이 서지 않는다. */
  elite?: boolean;
  /** 적 공격 모션(작업 245) — 남은 재생 시간. 0보다 크면 플레이어 쪽으로 내딛으며 때린다. */
  attack?: number };
/** `absorb` is the age the pull into the character began at; while it is unset the drop still rests
 *  where it fell (`LOOT_REST_SECONDS`). Without that mark the renderer cannot tell a drop held back
 *  by a full bag from one already on its way in. */
export type Drop = { x: number; y: number; item: Item; age: number; warned: boolean; absorb?: number };
/** The coin a kill leaves behind. Its gold is already in `save.gold` (granted at the kill, as
 *  before); the coin itself is only what the field draws for a beat before it flies to the hero.
 *  `from` is the body a boss heap was thrown from (작업 196), so the field can fly it out on its own
 *  arc instead of dropping it where it appears. */
export type Coin = { x: number; y: number; age: number; gold: number; from?: { x: number; y: number } };
export type ArrowVariant = 'normal' | 'ice' | 'pierce' | 'snipe' | 'volley' | 'arcane' | 'fire' | 'frost' | 'chain' | 'meteor';
export type Action = 'attack' | SkillId;
export type Effect = { x: number; y: number; kind: 'slash' | 'slash2' | 'spin' | 'crushing' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell' | 'hit' | 'death'
  /** 추가옵션(작업 238)의 피드백 — `evade`는 회피(피해 없음), `heal`은 피흡·5초 회복으로 찬 체력이다.
   *  둘 다 그림 없이 숫자·글자만 띄운다(`render/vfx.ts` `updateDamageLabels`). */
  | 'heal' | 'evade'
  /** 적의 공격이 플레이어에게 닿은 순간(작업 245) — 할퀴는 궤적과 잃은 체력 숫자를 띄운다. */
  | 'enemyStrike'
  | 'shot' | 'rain' | 'hawk' | 'burst' | 'nova' | 'ward'; age: number; duration: number; angle: number; swing?: number; amount?: number; nextHit?: number; power?: number; level?: number;
  /** 치명타로 들어간 타격(작업 245) — 피해 숫자를 크게·금빛으로 띄운다. */
  crit?: boolean;
  /** 이단참(작업 213)처럼 한 번 발동에 여러 번 때리는 스킬의 지금까지 들어간 타격 수. */
  hits?: number;
  /** 궁수 화살·화살비처럼 날아가서 맞는 이펙트의 도착지점과 위력(작업 157). */
  tx?: number; ty?: number; radius?: number; targets?: number; slow?: number; variant?: ArrowVariant; fired?: boolean;
  /** 화살이 쫓아가는 적(살아 있는 동안 도착지를 갱신한다). 없으면 발사 시점의 지점으로 날아간다. */
  aim?: Enemy;
  /** 발사까지 머무는 시간(초, 작업 216) — 파이어 볼트 화염구가 머리 위에 떠 있다가 날아간다.
   *  `delay`와 달리 이 시간 동안은 제자리에 있다가 남은 시간(duration−launch) 동안만 날아간다. */
  launch?: number;
  /** 탄 크기 배율(작업 216) — 파이어 볼트 화염구는 스킬 레벨이 오를수록 커진다. */
  size?: number;
  /** 이 이펙트를 만든 스킬(스킬 버튼 피드백용). 평타면 없다. */
  source?: SkillId;
  /** 딜레이 크러싱(작업 212) 타격 간격 — 연출이 그 간격마다 한 번씩 내리친다. */
  strikeInterval?: number;
  /** 타격 숫자(`hit`)를 기본 자리에서 옮길 오프셋 — 10연타 숫자가 한 점에 겹치지 않게 한다(작업 212). */
  labelOffsetX?: number; labelOffsetY?: number };
/** 딜레이 크러싱이 한 타마다 남기는 잔상 한 점(작업 212).
 *  렌더러는 이 기록 하나당 본체·장비 레이어 한 벌을 복제해 본체보다 낮은 불투명도로 뒤에 그린다. */
export type HeroAfterimage = {
  x: number; y: number; age: number; duration: number;
  /** 본체보다 낮은 불투명도 — 0.42에서 0.14까지 타마다 계단식으로 내려간다. */
  alpha: number;
  /** 그 타격 순간의 좌우 반전(잔상이 본체와 같은 방향을 본다). */
  facingSide: number;
  /** 이만큼 지난 뒤의 공격 자세를 복제한다 — 스윙 중간 실루엣이 남도록. */
  capture: number };
