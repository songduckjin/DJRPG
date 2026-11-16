import type { Action } from '../game/world';
import type { SkillId } from '../game/skills';

const frames: Record<SkillId, number> = { slash2: 0, spin: 1, crushing: 2, slam: 3, warcry: 4, power: 5, destroy: 6, hell: 7 };
export function applySkillArtwork(button: HTMLButtonElement, kind: Action | null): void {
  const art = button.querySelector<HTMLElement>('.skill-art');
  if (!art) return;
  art.hidden = kind === null;
  button.classList.toggle('has-skill-art', kind !== null);
  if (!kind) return;
  art.style.backgroundImage = `url('/assets/icons/${kind === 'attack' ? 'nav_skills_v2.png' : 'field-skills.png'}')`;
  art.style.backgroundSize = kind === 'attack' ? 'contain' : '400% 200%';
  const frame = kind === 'attack' ? 0 : frames[kind];
  art.style.backgroundPosition = kind === 'attack' ? 'center' : `${frame % 4 / 3 * 100}% ${Math.floor(frame / 4) * 100}%`;
}
