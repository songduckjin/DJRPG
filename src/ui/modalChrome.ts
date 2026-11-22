/**
 * 팝업 공통 창틀 (PR-4) — 모든 팝업이 같이 쓰는 껍데기만 그린다.
 *
 * 하는 일은 넷뿐이다: ① `.modal-dialog`의 클래스·`aria-label`을 그 창에 맞게 맞추고 ② 머리글(제목·닫기·
 * 필요하면 도감↔장비 전환)을 붙이고 ③ 등록부(`MODALS`)가 준 함수로 내용을 그린 뒤 ④ 스크롤 위치를 되돌린다.
 * 내용·배선은 각 도메인 모달과 `interface.ts`가 맡는다.
 */
import type { Interface } from './interface';
import type { ModalSpec } from './modalRegistry';
import { bindModalClose } from './modalClose';
import { positionBagDetail } from './bagDetail';
import { showEquippedDetail } from './equippedDetail';

/** 팝업 창틀이 갈아 끼우는 클래스 전부 — 표에 없는 클래스는 이 창을 열 때 떨어진다. */
const DIALOG_CLASSES = [
  'dungeon-modal', 'world-boss-modal', 'codex-modal', 'skills-modal', 'market-modal',
  'utility-modal', 'settings-modal', 'equipment-modal', 'warehouse-modal', 'stats-modal', 'notice-modal'
] as const;

/** 창틀을 그 창에 맞추고 내용을 그린다 — 스크롤은 그리기 전 위치로 되돌린다. */
export function renderModalPanel(ui: Interface, dialog: HTMLElement, spec: ModalSpec): void {
  // 클래스를 먼저 갈아 끼운 뒤 스크롤을 읽는다(예전 renderModal과 같은 순서) — 클래스에 따라
  // 넘치는 높이가 달라져 스크롤 값이 잘릴 수 있다.
  for (const name of DIALOG_CLASSES) dialog.classList.toggle(name, spec.dialogClasses?.includes(name) ?? false);
  const scroll = dialog.scrollTop;
  const bagScroll = dialog.querySelector<HTMLElement>('.bag-grid')?.scrollTop ?? 0;
  dialog.replaceChildren();
  if (!spec.ownHeading) dialog.appendChild(headingNode(ui, spec));
  if (spec.ariaLabel) dialog.setAttribute('aria-label', spec.ariaLabel);
  else dialog.removeAttribute('aria-label');
  spec.render(ui, dialog);
  dialog.scrollTop = scroll;
  const bagGrid = dialog.querySelector<HTMLElement>('.bag-grid');
  if (bagGrid) bagGrid.scrollTop = bagScroll;
  positionBagDetail(ui);
  if (ui.openModal === 'equipment' && ui.equippedSlot) showEquippedDetail(ui, ui.equippedSlot, ui.equippedPinned);
}

/** 머리글 — 제목·닫기, 그리고 창을 오가는 버튼(내 정보 ↔ 장비 도감)이 있으면 그 묶음. */
function headingNode(ui: Interface, spec: ModalSpec): HTMLElement {
  const heading = document.createElement('header');
  heading.innerHTML = `<h2>${spec.title}</h2><button class="modal-close" aria-label="닫기">×</button>`;
  bindModalClose(heading.querySelector('button')!, () => ui.open(null));
  if (spec.titleLink) {
    const title = heading.querySelector('h2')!, group = document.createElement('div');
    group.className = 'modal-title-group';
    title.replaceWith(group); group.append(title);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'codex-open';
    button.textContent = spec.titleLink.label;
    button.onclick = () => ui.open(spec.titleLink!.to);
    group.append(button);
  }
  return heading;
}
