import { goldMarkup } from '../currency';
import type { OfflineReward } from '../../game/offline';
import { itemDisplayName, rarityNames } from '../../game/items';
import { isSpotlightRarity, spotlightFirst, spotlightTag } from '../../game/raritySpotlight';

export function renderOffline(dialog: HTMLElement, reward: OfflineReward): void {
  const summary = document.createElement('div'); summary.className = 'offline-summary';
  const hours = Math.floor(reward.seconds / 3600), minutes = Math.floor(reward.seconds % 3600 / 60);
  if (reward.adjusted) summary.textContent = `방치 시간 ${hours ? `${hours}시간 ` : ''}${minutes}분 · 서버 기준으로 일부 보상이 조정되었습니다.`;
  else summary.innerHTML = `방치 시간 ${hours ? `${hours}시간 ` : ''}${minutes}분 · 처치 ${reward.kills}마리 · EXP +${reward.exp} · ${goldMarkup(reward.gold)}${reward.levels ? ` · 레벨 +${reward.levels} / SP +${reward.levels}` : ''}`;
  dialog.appendChild(summary);
  // 층 변화(작업 235) — 방치하는 동안에도 보스를 잡아 층이 올라갔는지 한눈에 보이게 한다.
  const climbed = reward.endFloor > reward.startFloor;
  const floorNotes: string[] = [];
  if (climbed) floorNotes.push(`${reward.startFloor}층 → ${reward.endFloor}층 돌파!`);
  if (reward.bossKills) floorNotes.push(`보스 ${reward.bossKills}마리 처치`);
  if (!climbed && reward.deaths) floorNotes.push(`보스에게 ${reward.deaths}번 져서 층이 멈췄습니다`);
  if (!reward.adjusted && floorNotes.length) { const note = document.createElement('p'); note.className = 'offline-floors'; note.textContent = floorNotes.join(' · '); dialog.appendChild(note); }
  const heading = document.createElement('h3'); heading.textContent = `획득 아이템 ${reward.items.length}개`; dialog.appendChild(heading);
  // 유니크·전설 상위 노출(백로그 3번) — 목록 머리에 상위 등급부터 세우고, 그 줄에 등급 꼬리표·등급 빛을 준다.
  // 나머지(에픽 이하)는 떨어진 순서 그대로 뒤따른다.
  const items = spotlightFirst(reward.items, item => item.rarity);
  const list = document.createElement('ul'); list.className = 'offline-items';
  for (const item of items) {
    const row = document.createElement('li'); row.className = `rarity-${item.rarity}`;
    row.textContent = `${isSpotlightRarity(item.rarity) ? `${spotlightTag(item.rarity)} ` : ''}${itemDisplayName(item)} · ${rarityNames[item.rarity]}`;
    if (isSpotlightRarity(item.rarity)) { row.classList.add('is-spotlight'); row.dataset.rarity = item.rarity; }
    list.appendChild(row);
  }
  if (!items.length) { const row = document.createElement('li'); row.textContent = '획득한 아이템이 없습니다.'; list.appendChild(row); }
  dialog.appendChild(list);
  // 방치 자동 분해(작업 254) — 가방에 안 들어간 장비가 금화·강화석이 된 몫을 함께 적어, 팝업의 아이템 수와
  // 가방·금화가 어깋나 보이지 않게 한다(던전 결과창과 같은 문구).
  if (!reward.adjusted && reward.salvaged?.count > 0) {
    const note = document.createElement('p'); note.className = 'offline-salvaged';
    note.innerHTML = `자동 분해 ${reward.salvaged.count}개 → ${goldMarkup(reward.salvaged.gold)} · 강화석 ${reward.salvaged.stones.toLocaleString('ko-KR')}`;
    dialog.appendChild(note);
  }
  if (reward.missedDrops) { const note = document.createElement('p'); note.textContent = `가방이 가득 차 아이템 ${reward.missedDrops}개를 받지 못했습니다.`; dialog.appendChild(note); }
}
