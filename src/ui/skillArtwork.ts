import type { Action } from '../game/world';
import { jobOrDefault, type ArcherPassiveId, type ArcherSkillId, type Job, type MagePassiveId, type MageSkillId, type PassiveId, type WarriorPassiveId, type WarriorSkillId } from '../game/skills';

const warriorFrames: Record<WarriorSkillId, number> = { slash2: 0, spin: 1, crushing: 2, slam: 3, warcry: 4, power: 5, destroy: 6, hell: 7 };
/** 궁수 스킬 아이콘 시트(`archer-skills.png`, 4×2)의 칸 번호 — `archerSkillOrder` 순서. */
const archerFrames: Record<ArcherSkillId, number> = { doubleShot: 0, multiShot: 1, pierceShot: 2, iceArrow: 3, hawkEye: 4, snipe: 5, stormVolley: 6, arrowRain: 7 };
/** 마법사 스킬 아이콘 시트(`mage-skills.png`, 4×2)의 칸 번호 — `mageSkillOrder` 순서. */
const mageFrames: Record<MageSkillId, number> = { fireBolt: 0, iceBolt: 1, chainLightning: 2, manaBurst: 3, frostNova: 4, arcaneShield: 5, meteorStrike: 6, arcaneOverlord: 7 };
export function skillIconSheet(kind: Action): 'field-skills' | 'archer-skills' | 'mage-skills' {
  if (kind === 'attack') return 'field-skills';
  if (kind in archerFrames) return 'archer-skills';
  if (kind in mageFrames) return 'mage-skills';
  return 'field-skills';
}
/**
 * 직업별 기본 평타 원형 아이콘(작업 216) — 불꽃 없는 대검 / 활 / 마법탄 메달리온 3장.
 * 스킬 시트의 'attack' 칸(⚔ 글자 그림) 대신 액션 패드와 스킬 창의 기본 공격 버튼에 그대로 쓴다.
 * 파일은 `scripts/build-attack-icons.py`가 승인 원본에서 원 밖을 투명으로 굽는다.
 */
export function attackIconPath(job: Job = 'warrior'): string { return `/assets/icons/attack_${jobOrDefault(job)}.png`; }
export function applySkillArtwork(button: HTMLButtonElement, kind: Action | null, job: Job = 'warrior'): void {
  const art = button.querySelector<HTMLElement>('.skill-art');
  if (!art) return;
  art.hidden = kind === null;
  button.classList.toggle('has-skill-art', kind !== null);
  if (!kind) return;
  setSkillIcon(art, kind, job);
}
export function setSkillIcon(art: HTMLElement, kind: Action, job: Job = 'warrior'): void {
  const standalone = kind === 'attack' || kind === 'arcaneOverlord';
  const imagePath = kind === 'attack' ? attackIconPath(job)
    : kind === 'arcaneOverlord' ? '/assets/icons/mage-water-cannon-v1.png'
      : `/assets/icons/${skillIconSheet(kind)}.png`;
  art.style.backgroundImage = `url('${imagePath}')`;
  art.style.backgroundRepeat = 'no-repeat';
  art.style.backgroundSize = standalone ? 'contain' : '400% 200%';
  const frame = kind === 'attack' ? 0
    : kind in archerFrames ? archerFrames[kind as ArcherSkillId]
      : kind in mageFrames ? mageFrames[kind as MageSkillId]
        : warriorFrames[kind as WarriorSkillId];
  art.style.backgroundPosition = standalone ? 'center' : `${frame % 4 / 3 * 100}% ${Math.floor(frame / 4) * 100}%`;
}

const warriorPassiveFrames: Record<WarriorPassiveId, number> = { mastery: 0, body: 1, instinct: 2 };
const archerPassiveFrames: Record<ArcherPassiveId, number> = { bowMastery: 0, swiftStep: 1, hawkSight: 2 };
const magePassiveFrames: Record<MagePassiveId, number> = { staffMastery: 0, manaCircuit: 1, arcaneSense: 2 };
export function setPassiveSkillIcon(art: HTMLElement, kind: PassiveId): void {
  const sheetName = kind in archerPassiveFrames ? 'archer-passive-skills' : kind in magePassiveFrames ? 'mage-passive-skills' : 'passive-skills';
  const frame = kind in archerPassiveFrames ? archerPassiveFrames[kind as ArcherPassiveId]
    : kind in magePassiveFrames ? magePassiveFrames[kind as MagePassiveId]
      : warriorPassiveFrames[kind as WarriorPassiveId];
  art.style.backgroundImage = `url('/assets/icons/${sheetName}.png')`;
  art.style.backgroundSize = '300% 100%';
  art.style.backgroundPosition = `${frame * 50}% center`;
  art.style.backgroundRepeat = 'no-repeat';
}
