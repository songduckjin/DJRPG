// 던전 결과창의 보상 영수증 (작업 205).
//
// 결과창은 이제 \"보상은 준비 중\"이 아니라 **실제로 계정에 들어간 것**을 보여 준다: 처치 금화, 강화석
// (최초 클리어 보너스 포함), 그리고 떨어져 가방에 들어간 장비·스킬북. 가방이 가득 차 놓친 장비와 접속 중
// 자동 분해가 가져간 몫도 함께 적어, 화면의 숫자와 세이브가 어긋나 보이지 않게 한다.
//
// 무거운 렌더러(pixi)를 끌어오지 않는 순수 문자열 빌더라 `node --test`에서 그대로 검사할 수 있다.

import { isSkillBook, itemDisplayName, type Item } from '../game/items';
import { dungeonClearStones, dungeonKillGold, type DungeonRewardReceipt } from '../game/dungeonRewards';
import { dungeonDropChance } from './dungeonBattle';
import { skillbookName } from './skillbookBag';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function itemName(item: Item): string {
  return isSkillBook(item) ? skillbookName(item) : itemDisplayName(item);
}

/** 결과창 본문 — 금화·강화석·아이템과, 놓침·자동 분해 안내. */
export function dungeonRewardMarkup(receipt: DungeonRewardReceipt): string {
  const parts: string[] = [];
  parts.push(`<p class="dungeon-result-gold"><img src="/assets/icons/gold-coin.png" alt="">획득 금화 <strong>${receipt.gold.toLocaleString('ko-KR')}</strong></p>`);
  const bonus = receipt.firstClear ? ` <small>최초 클리어 보너스 포함</small>` : '';
  parts.push(`<p class="dungeon-result-stones"><img src="/assets/icons/dungeon-stone.svg" alt="">강화석 <strong>+${receipt.stones.toLocaleString('ko-KR')}</strong>${bonus}</p>`);
  if (receipt.items.length) {
    const rows = receipt.items.map(item =>
      `<li class="rarity-${item.rarity}"><span>${escapeHtml(itemName(item))}</span><small>${isSkillBook(item) ? '스킬북' : '장비'}</small></li>`).join('');
    parts.push(`<ul class="dungeon-result-items" aria-label="획득 아이템">${rows}</ul>`);
  } else {
    parts.push('<p class="dungeon-result-note">이번 층에서 떨어진 아이템은 없습니다.</p>');
  }
  if (receipt.salvaged.count) parts.push(`<p class="dungeon-result-note">자동 분해 ${receipt.salvaged.count}개 → 금화 ${receipt.salvaged.gold.toLocaleString('ko-KR')} · 강화석 ${receipt.salvaged.stones.toLocaleString('ko-KR')}</p>`);
  if (receipt.missed) parts.push(`<p class="dungeon-result-note">가방이 가득 차 아이템 ${receipt.missed}개를 놓쳤습니다.</p>`);
  return parts.join('');
}

/** 최초 클리어 보상 패널 — 예전에는 "보상 수량은 전투 연결 시 확정됩니다"였지만, 이제 그 층이 실제로
 *  주는 금화(처치분)·강화석(층 비례 + 최초 클리어 보너스)을 그대로 적는다(작업 205). */
export function dungeonPrizePanel(floor: number, boss: boolean): string {
  const gold = dungeonKillGold(floor, boss).toLocaleString('ko-KR');
  const stones = dungeonClearStones(floor, true).toLocaleString('ko-KR');
  const chance = Math.round(dungeonDropChance(floor) * 1000) / 10;
  const detail = boss
    ? '랜덤 장비·스킬북 5개와 금화 10무더기 · 보스는 같은 층 일반 몹보다 훨씬 묵직합니다'
    : `처치마다 ${chance}% 확률로 장비·스킬북이 떨어집니다`;
  return `<section class="dungeon-prize" aria-label="최초 클리어 보상"><h3>최초 클리어 보상</h3><div class="dungeon-prize-items"><div><img src="/assets/icons/gold-coin.png" alt=""><strong>금화</strong><span>${gold}</span></div><div><img src="/assets/icons/dungeon-stone.svg" alt=""><strong>강화석</strong><span>${stones}</span></div></div><small>${detail}</small><small>처치 금화와 떨어진 아이템은 클리어하면 그대로 계정에 들어갑니다. 실패·시간 초과에는 지급되지 않습니다.</small></section>`;
}
