/**
 * 입문 튜토리얼 — 새 캐릭터가 **첫 무기 → 방어구 → 첫 스킬**을 스스로 장착하도록 안내한다.
 *
 * 세이브의 `tutorial`(0~3)은 예전 그대로 **무기까지의 단계**만 센다.
 *   0 = 자동 사냥 시작(첫 처치 전) · 1 = 첫 무기 드랍 · 2 = 첫 무기 장착 안내 · 3 = 무기 장착 완료
 * 3 이후의 두 안내(방어구·스킬)는 세이브에 새 값을 남기지 않고 **지금 상태에서 계산한다** — 서버 저장
 * 검증(`server/save-guard.mjs`)이 `tutorial`을 3에서 자르므로 저장 형식(공용 계약)을 건드리지 않는다.
 *
 * 규칙은 세 가지다.
 *  ① 안내는 **지금 할 수 있는 일 하나**만 말한다 — 방어구가 가방에 있으면 방어구, 없으면 첫 스킬.
 *  ② 완료 판정은 저장값이 아니라 **상태**다 — 그 칸에 장비를 끼거나 퀵슬롯에 스킬이 들어오는 순간
 *     다음 안내로 넘어가고, 둘 다 끝나면 사라진다(되돌릴 것이 없다).
 *  ③ 화면을 막지 않는다 — 문구와 강조(`tutorial-target`)만 바꾸고 입력·전투·저장을 건드리지 않는다.
 *     오래된 세이브가 안내를 계속 띄우지 않도록 입문 구간(`OPENING_LEVEL` 이하)에서만 돈다.
 */
import { canWield, isEquipment, slotNameFor, starterWeaponName, type Slot } from './items';
import { jobOrDefault, skillOrderFor } from './skills';
import type { Save } from './store';

/** 안내가 도는 최대 레벨 — 이 위로 자란 캐릭터는 입문을 지난 것으로 본다(옛 세이브 재안내 방지). */
export const OPENING_LEVEL = 10;
/** 무기 장착을 마친 단계(세이브 `tutorial`의 마지막 값). */
export const STARTER_WEAPON_STEP = 3;
/** 입문 지원이 주는 방어구 칸 — 1~2층 두 번째·세 번째 처치에 확정 드랍되는 그 두 칸. */
export type StarterGearSlot = 'helmet' | 'armor';
const starterGearSlots: readonly StarterGearSlot[] = ['helmet', 'armor'];

export type TutorialStage = 'kill' | 'loot' | 'weapon' | 'gear' | 'skill';

export type TutorialGuide = {
  stage: TutorialStage;
  /** 화면 위 안내 띠에 그대로 쓰는 한 문장. */
  message: string;
  /** 은은하게 강조할 하단 메뉴 버튼. */
  nav?: 'equipment' | 'skills';
  /** 장비 창에서 강조할 빈 칸(가방의 해당 장비도 함께 강조한다). */
  slots?: StarterGearSlot[];
  /** 은은하게 강조할 빈 스킬 원(0~2). */
  skillSlot?: number;
};

/** 목적격 조사 `을`/`를` — 받침이 있으면 `을`, 없으면 `를`. 한글이 아니면 둘 다 적는다(`을(를)`). */
export function objectParticle(word: string): string {
  const last = word.codePointAt(word.length - 1) ?? 0;
  if (last < 0xac00 || last > 0xd7a3) return `${word}을(를)`;
  return `${word}${(last - 0xac00) % 28 === 0 ? '를' : '을'}`;
}

/** 지금 끼면 좋은 방어구가 가방에 있고 그 칸이 비어 있는가 — 있으면 그 칸들(투구 → 갑옷 순). */
export function pendingGearSlots(save: Save): StarterGearSlot[] {
  const job = jobOrDefault(save.job);
  return starterGearSlots.filter(slot => !save.equipment[slot as Slot]
    && save.bag.some(item => isEquipment(item) && item.slot === slot && canWield(item, job)));
}

/** 퀵슬롯에 액티브 스킬이 하나라도 장착되어 있는가 — 입문의 마지막 완료 조건. */
export function activeSkillEquipped(save: Save): boolean {
  return save.quickSlots.some(id => id !== null);
}

/** 지금 장착할 수 있는(습득했지만 아직 안 낀) 내 직업 액티브 스킬이 있는가. */
export function skillReadyToEquip(save: Save): boolean {
  const job = jobOrDefault(save.job);
  return skillOrderFor(job).some(id => save.learned.includes(id) && !save.quickSlots.includes(id));
}

/**
 * 지금 보여 줄 안내 한 개 — 없으면 `null`(안내 띠를 숨긴다).
 *
 * 무기까지는 세이브 `tutorial` 값을 그대로 따르고(기존 흐름), 그 뒤로는 상태로 판정한다.
 */
export function tutorialGuide(save: Save): TutorialGuide | null {
  const job = jobOrDefault(save.job);
  const step = Math.max(0, Math.floor(save.tutorial ?? 0));
  if (step === 0) return { stage: 'kill', message: '자동 사냥이 시작되었습니다. 첫 해골전사를 처치하세요.' };
  if (step === 1) return { stage: 'loot', message: `${starterWeaponName(job)}이(가) 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다!` };
  if (step === 2) {
    return {
      stage: 'weapon',
      message: `하단 갑옷 아이콘을 눌러 가방의 ${objectParticle(starterWeaponName(job))} 장착하세요.`,
      nav: 'equipment'
    };
  }
  // ── 무기 장착 이후: 방어구 → 첫 스킬 ──
  if (save.level > OPENING_LEVEL) return null;
  const gear = pendingGearSlots(save);
  if (gear.length) {
    const names = gear.map(slot => slotNameFor(slot as Slot, job)).join('·');
    return {
      stage: 'gear',
      message: `하단 갑옷 아이콘을 눌러 가방의 ${objectParticle(names)} 장착하세요.`,
      nav: 'equipment',
      slots: gear
    };
  }
  if (!activeSkillEquipped(save) && skillReadyToEquip(save)) {
    return {
      stage: 'skill',
      message: '스킬 아이콘 또는 빈 슬롯을 눌러 첫 스킬을 장착하세요',
      nav: 'skills',
      skillSlot: save.quickSlots.indexOf(null)
    };
  }
  return null;
}
