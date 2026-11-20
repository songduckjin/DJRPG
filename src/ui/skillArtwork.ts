import type { Action } from '../game/world';
import type { ArcherPassiveId, ArcherSkillId, PassiveId, WarriorPassiveId, WarriorSkillId } from '../game/skills';

const warriorFrames: Record<WarriorSkillId, number> = { slash2: 0, spin: 1, crushing: 2, slam: 3, warcry: 4, power: 5, destroy: 6, hell: 7 };
/** 궁수 스킬 아이콘 시트(`archer-skills.png`, 4×2)의 칸 번호 — `archerSkillOrder` 순서. */
const archerFrames: Record<ArcherSkillId, number> = { doubleShot: 0, multiShot: 1, pierceShot: 2, iceArrow: 3, hawkEye: 4, snipe: 5, stormVolley: 6, arrowRain: 7 };
export function skillIconSheet(kind: Action): 'field-skills' | 'archer-skills' {
  return kind !== 'attack' && kind in archerFrames ? 'archer-skills' : 'field-skills';
}
export function applySkillArtwork(button: HTMLButtonElement, kind: Action | null): void {
  const art = button.querySelector<HTMLElement>('.skill-art');
  if (!art) return;
  art.hidden = kind === null;
  button.classList.toggle('has-skill-art', kind !== null);
  if (!kind) return;
  setSkillIcon(art, kind);
}
export function setSkillIcon(art: HTMLElement, kind: Action): void {
  art.style.backgroundImage = `url('/assets/icons/${kind === 'attack' ? 'nav_skills_v2.png' : `${skillIconSheet(kind)}.png`}')`;
  art.style.backgroundRepeat = 'no-repeat';
  art.style.backgroundSize = kind === 'attack' ? 'contain' : '400% 200%';
  const frame = kind === 'attack' ? 0 : kind in archerFrames ? archerFrames[kind as ArcherSkillId] : warriorFrames[kind as WarriorSkillId];
  art.style.backgroundPosition = kind === 'attack' ? 'center' : `${frame % 4 / 3 * 100}% ${Math.floor(frame / 4) * 100}%`;
}

const warriorPassiveFrames: Record<WarriorPassiveId, number> = { mastery: 0, body: 1, instinct: 2 };
const archerPassiveFrames: Record<ArcherPassiveId, number> = { bowMastery: 0, swiftStep: 1, hawkSight: 2 };
export function setPassiveSkillIcon(art: HTMLElement, kind: PassiveId): void {
  const archer = kind in archerPassiveFrames;
  const frame = archer ? archerPassiveFrames[kind as ArcherPassiveId] : warriorPassiveFrames[kind as WarriorPassiveId];
  art.style.backgroundImage = `url('/assets/icons/${archer ? 'archer-passive-skills' : 'passive-skills'}.png')`;
  art.style.backgroundSize = '300% 100%';
  art.style.backgroundPosition = `${frame * 50}% center`;
  art.style.backgroundRepeat = 'no-repeat';
}
