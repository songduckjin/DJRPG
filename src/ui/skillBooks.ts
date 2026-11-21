import {createSkillBookArt} from './skillBookArt';
import type { Interface } from './interface';
import { skillbookName, skillbookStacks } from './skillbookBag';
import { skillBookStatus } from '../game/skillProgress';
import { totalStats, useSkillBook, type Save } from '../game/store';
import { jobNames, jobOrDefault, passives, skills, type SkillLevelId } from '../game/skills';
import { isSkillBook, skillBookJob } from '../game/items';

/** 자동 강화로 오른 스킬 한 건 — 화면 안내와 테스트가 읽는다. */
export type SkillBookUpgrade = { id: SkillLevelId; name: string; level: number };
/**
 * `자동 강화`(작업 245) — 가방의 **내 직업 스킬북**으로 가능한 만큼 연속 습득·강화한다.
 *
 * 같은 스킬이라도 권수가 충분하면 한 번에 2~3레벨이 오르므로(필요 권수 = ceil(다음 레벨/5)권),
 * 더 쓸 수 있는 책이 없을 때까지 반복한다. 다른 직업 스킬북(거래소용)·권수 부족한 책·최대 레벨
 * 스킬은 `skillBookStatus(...).ready`가 거짓이라 건드리지 않는다. 최대 500회로 끊는다.
 */
export function useAllReadySkillBooks(save: Save): { used: number; upgrades: SkillBookUpgrade[] } {
  const mine = jobOrDefault(save.job);
  const upgrades: SkillBookUpgrade[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const book = save.bag.find(item => isSkillBook(item) && (skillBookJob(item) ?? mine) === mine && skillBookStatus(save, item.skillId).ready);
    if (!book || !isSkillBook(book)) break;
    const id = book.skillId;
    const result = useSkillBook(save, book.id);
    if (!result.ok) break;
    const name = (skills as Record<string, { name: string }>)[id]?.name ?? (passives as Record<string, { name: string }>)[id]?.name ?? id;
    upgrades.push({ id, name, level: skillBookStatus(save, id).level });
  }
  return { used: upgrades.length, upgrades };
}

export function renderSkillUpgrade(ui: Interface, parent: HTMLElement, id: SkillLevelId, statusParent: HTMLElement = parent): void {
  const status = skillBookStatus(ui.world.save, id);
  // 다른 직업의 스킬북은 카드에서 `{직업} 전용`으로 잠기게 보여 준다 — 눌러도 소모되지 않는다(작업 206).
  const held = ui.world.save.bag.find(item => item.kind === 'skillbook' && item.skillId === id);
  const owner = held ? skillBookJob(held) : undefined;
  const foreign = owner && owner !== jobOrDefault(ui.world.save.job) ? owner : undefined;
  const note = document.createElement('span'); note.className = 'skill-book-cost';
  note.textContent = foreign ? `${jobNames[foreign]} 전용 스킬북` : status.maxed ? '최대 레벨' : `보유 ${status.count} / 필요 ${status.cost}권`;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'skillbook-use';
  button.textContent = foreign ? `${jobNames[foreign]} 전용` : status.level ? '강화' : '습득'; button.disabled = !status.ready || Boolean(foreign);
  button.title = foreign ? `${jobNames[foreign]} 전용 스킬북입니다` : status.maxed ? '최대 레벨' : `${status.level ? '강화' : '습득'} · 보유 ${status.count} / 필요 ${status.cost}권`;
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
  // 스킬 창은 **내 직업 스킬북만** 보여 준다(작업 210, 사용자 지시 `#4617`). 다른 직업 책은 가방에서 판매·보관한다.
  const mine = jobOrDefault(ui.world.save.job);
  for (const {item, count} of skillbookStacks(ui.world.save.bag).filter(({item}) => (skillBookJob(item) ?? mine) === mine)) {
    const card = document.createElement('article'); card.className = 'skill-book-card';
    const icon = createSkillBookArt(item);
    const name = document.createElement('b'); name.textContent = skillbookName(item);
    const quantity = document.createElement('span'); quantity.className = 'skill-book-quantity'; quantity.textContent = `×${count}`;
    // 어느 직업의 스킬북인지 카드에서 바로 읽히게 한다(작업 205) — 세 직업 책이 같은 확률로 떨어진다.
    const owner = skillBookJob(item);
    if (owner) {
      const badge = document.createElement('span'); badge.className = `job-badge job-${owner}`; badge.textContent = jobNames[owner];
      badge.setAttribute('aria-label', `${jobNames[owner]} 전용 스킬북`);
      card.append(badge);
    }
    card.append(icon, name, quantity); renderSkillUpgrade(ui, card, item.skillId); grid.append(card);
  }
  if (!grid.childElementCount) { const empty = document.createElement('p'); empty.textContent = '보유한 스킬북이 없습니다.'; grid.append(empty); }
  const hint = document.createElement('small'); hint.className = 'skill-book-hint';
  hint.textContent = '다른 직업 전용 스킬북은 가방에서 확인할 수 있습니다(경매장 판매/공용창고 보관).';
  section.append(grid, hint); parent.append(section);
}
