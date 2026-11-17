import {createSkillBookArt} from './skillBookArt';
import type { Interface } from './interface';
import { skillbookName, skillbookStacks } from './skillbookBag';
import { skillBookStatus } from '../game/skillProgress';
import { totalStats, useSkillBook } from '../game/store';
import type { SkillLevelId } from '../game/skills';

export function renderSkillUpgrade(ui: Interface, parent: HTMLElement, id: SkillLevelId, statusParent: HTMLElement = parent): void {
  const status = skillBookStatus(ui.world.save, id);
  const note = document.createElement('span'); note.className = 'skill-book-cost';
  note.textContent = status.maxed ? '최대 레벨' : `보유 ${status.count} / 필요 ${status.cost}권`;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'skillbook-use';
  button.textContent = status.level ? '강화' : '습득'; button.disabled = !status.ready;
  button.title = status.maxed ? '최대 레벨' : `${status.level ? '강화' : '습득'} · 보유 ${status.count} / 필요 ${status.cost}권`;
  button.setAttribute('aria-label', button.title);
  button.onclick = () => {
    if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 강화할 수 없습니다.'); return; }
    const book = ui.world.save.bag.find(item => item.kind === 'skillbook' && item.skillId === id);
    if (!book) { ui.message('보유한 스킬북이 없습니다.'); return; }
    const before = totalStats(ui.world.save).health;
    const result = useSkillBook(ui.world.save, book.id);
    if (result.ok) {
      ui.world.player.hp += totalStats(ui.world.save).health - before; ui.world.save.health = ui.world.player.hp;
      ui.world.onChange();
    }
    ui.message(result.message);
  };
  statusParent.append(note); parent.append(button);
}
export function markSkillUpgrade(ui: Interface, card: HTMLElement, id: SkillLevelId): void {
  if (!skillBookStatus(ui.world.save, id).ready) return;
  const dot = document.createElement('i'); dot.className = 'skill-upgrade-dot'; dot.setAttribute('aria-label', '습득·강화 가능');
  card.querySelector('.skill-icon')?.append(dot);
}
export function renderSkillBooks(ui: Interface, parent: HTMLElement): void {
  const section = document.createElement('section'); section.className = 'skill-books';
  const title = document.createElement('h3'); title.textContent = '스킬북'; section.append(title);
  const grid = document.createElement('div'); grid.className = 'skill-book-grid';
  for (const {item, count} of skillbookStacks(ui.world.save.bag)) {
    const card = document.createElement('article'); card.className = 'skill-book-card';
    const icon = createSkillBookArt(item);
    const name = document.createElement('b'); name.textContent = skillbookName(item);
    const quantity = document.createElement('span'); quantity.className = 'skill-book-quantity'; quantity.textContent = `×${count}`;
    card.append(icon, name, quantity); renderSkillUpgrade(ui, card, item.skillId); grid.append(card);
  }
  if (!grid.childElementCount) { const empty = document.createElement('p'); empty.textContent = '보유한 스킬북이 없습니다.'; grid.append(empty); }
  section.append(grid); parent.append(section);
}
