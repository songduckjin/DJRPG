import { goldMarkup } from '../currency';
import type { OfflineReward } from '../../game/offline';
import { rarityNames } from '../../game/items';

export function renderOffline(dialog: HTMLElement, reward: OfflineReward): void {
  const summary = document.createElement('div'); summary.className = 'offline-summary';
  const hours = Math.floor(reward.seconds / 3600), minutes = Math.floor(reward.seconds % 3600 / 60);
  summary.innerHTML = `방치 시간 ${hours ? `${hours}시간 ` : ''}${minutes}분 · 처치 ${reward.kills}마리 · EXP +${reward.exp} · ${goldMarkup(reward.gold)}${reward.levels ? ` · 레벨 +${reward.levels} / SP +${reward.levels}` : ''}`;
  dialog.appendChild(summary);
  const heading = document.createElement('h3'); heading.textContent = `획득 아이템 ${reward.items.length}개`; dialog.appendChild(heading);
  const list = document.createElement('ul'); list.className = 'offline-items';
  for (const item of reward.items) { const row = document.createElement('li'); row.textContent = `${item.name} · ${rarityNames[item.rarity]}`; list.appendChild(row); }
  if (!reward.items.length) { const row = document.createElement('li'); row.textContent = '획득한 아이템이 없습니다.'; list.appendChild(row); }
  dialog.appendChild(list);
  if (reward.missedDrops) { const note = document.createElement('p'); note.textContent = `가방이 가득 차 아이템 ${reward.missedDrops}개를 받지 못했습니다.`; dialog.appendChild(note); }
}
