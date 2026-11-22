import { goldNode } from './currency';
import { pouchRewardArt } from './pouchArt';
import { POUCH_RARITY_INK } from '../game/pouch';
import type { PouchBatchSummary } from '../game/pouchBatch';
import type { Rarity } from '../game/items';

/**
 * 보물 주머니 **한 번에 열기**의 결과 요약 (2026-11-22).
 *
 * 개봉 창(`openPouchWindow`) 안에서 주머니 그림 대신 이 요약이 들어선다 — 따로 겹치는 팝업을 만들지 않는다
 * (폰에서 겹친 창은 닫기·뒤로가기가 꼬이기 쉽다).
 *
 * 한눈에 읽히는 순서: ① 몇 개를 열었는지 ② 금화·장비·스탯북 합계(그림 + 숫자) ③ 등급별 수량 ④ 획득 목록.
 * 목록은 **같은 이름·등급을 `×N` 한 줄로** 묶고 전설 → 일반 순으로 놓는다(`summarizePouchResults`가 정렬).
 *
 * CSS는 `styles/modals/pouch.css`의 `.pouch-batch*` — 카드(330px) 안에서 46dvh까지만 자라고 스크롤한다.
 */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const rarityNames: Record<Rarity, string> = { common: '일반', magic: '매직', rare: '레어', epic: '에픽', unique: '유니크', legendary: '전설' };

/** 결과 요약 한 장 — 개봉 창이 그대로 `replaceChildren`으로 갈아 끼운다. */
export function pouchBatchPanel(summary: PouchBatchSummary): HTMLElement {
  const panel = element('div', 'pouch-batch');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '보물 주머니 한 번에 열기 결과');

  panel.append(element('h4', 'pouch-batch-title', `보물 주머니 ${summary.opened}개를 열었습니다`));

  const totals = element('ul', 'pouch-batch-totals');
  if (summary.gold > 0) {
    const gold = element('li', 'pouch-batch-total pouch-batch-gold');
    gold.append(goldNode(summary.gold));
    totals.append(gold);
  }
  if (summary.equipmentCount > 0) totals.append(element('li', 'pouch-batch-total', `장비 ${summary.equipmentCount}개`));
  if (summary.bookTotal > 0) totals.append(element('li', 'pouch-batch-total', `영구 스탯북 ${summary.bookTotal}권`));
  panel.append(totals);

  // 등급별 수량 — 0인 등급은 빼서 한 줄에 들어가게 한다(장비 색은 인게임 등급색과 같은 값).
  const grades = (Object.keys(rarityNames) as Rarity[]).filter(rarity => summary.rarityCounts[rarity] > 0);
  if (grades.length) {
    const breakdown = element('p', 'pouch-batch-grades');
    for (const rarity of grades) {
      const chip = element('span', `pouch-batch-grade rarity-${rarity}`, `${rarityNames[rarity]} ${summary.rarityCounts[rarity]}`);
      chip.style.color = POUCH_RARITY_INK[rarity];
      breakdown.append(chip);
    }
    panel.append(breakdown);
  }

  if (summary.rows.length) {
    const list = element('ul', 'pouch-batch-list');
    for (const row of summary.rows) {
      const line = element('li', `pouch-batch-row rarity-${row.rarity}`);
      const name = element('span', 'pouch-batch-name', row.name);
      name.title = row.name;
      line.append(pouchRewardArt(row.item), name, element('span', 'pouch-batch-count', `×${row.count}`));
      list.append(line);
    }
    panel.append(list);
  } else {
    // 금화만 나온 경우 — 빈 목록 대신 한 줄로 알린다.
    panel.append(element('p', 'pouch-batch-empty', '나온 장비·스탯북은 없습니다'));
  }

  panel.append(element('p', 'pouch-batch-followup', summary.remaining === 0 ? '가방의 주머니를 모두 열었습니다'
    : summary.blocked ? `가방이 가득 차 ${summary.remaining}개는 열지 못했습니다 — 분해·판매로 자리를 비운 뒤 다시 열어 주세요`
    : `남은 주머니 ${summary.remaining}개`));
  return panel;
}
