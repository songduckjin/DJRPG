import { itemDisplayName, PLUS_STAT_BONUS, plusOf, type Item } from '../game/items';

/**
 * 장비 이름을 **그대로** 쓰고, 강화 단계가 있으면 바로 옆에 다른 색 배지(`+N`)를 붙인다(작업 199).
 *
 * `item.name`은 손대지 않는다 — 서버가 아이템 소유권을 이름까지 포함해 대조하므로 이름을 바꾸면
 * `409 ITEM_CONFLICT`가 난다. 강화 단계는 `item.plus`(0~7)로만 저장하고, 보이는 자리에서만 색을 준다.
 * 0단계면 아무것도 붙이지 않는다.
 */
export function renderItemName(target: HTMLElement, item: Item): HTMLElement {
  target.textContent = item.name;
  const plus = plusOf(item);
  if (plus > 0) {
    const badge = document.createElement('span');
    badge.className = 'item-plus';
    badge.textContent = `+${plus}`;
    badge.title = `강화 +${plus} · 능력치 +${Math.round(plus * PLUS_STAT_BONUS * 100)}%`;
    target.append(badge);
  }
  return target;
}

/** 셀의 `aria-label`·`title`처럼 한 줄 문자열이 필요한 자리(배지 없이 이름 + 단계). */
export function itemNameText(item: Item): string { return itemDisplayName(item); }
