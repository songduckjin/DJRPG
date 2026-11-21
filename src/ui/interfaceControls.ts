/**
 * 화면 입력 배선 (PR-4) — `Interface` 생성자가 길게 들고 있던 DOM 이벤트를 한 파일로 모았다.
 *
 * 여기 있는 것은 "무엇을 눌렀을 때 어느 창이 열리고 닫히는가"뿐이다. 창 내용은 `modalRegistry.ts`,
 * 창틀은 `modalChrome.ts`, 도메인 콜백은 `interfaceWiring.ts`가 맡는다.
 */
import type { Interface } from './interface';
import type { Modal } from './interfaceTypes';
import type { World } from '../game/world';
import { cancelSkillSelection, pressSkillSlot } from './skillLoadout';
import { dismissBagDetail, positionBagDetail } from './bagDetail';
import { dismissEquippedDetail, positionEquippedDetail } from './equippedDetail';

/** 하단 `공격` 버튼과 스킬 슬롯 3칸을 만든다 — 공격은 누르고 있는 동안 계속 나간다. */
export function mountActionPad(ui: Interface, world: World): void {
  const pad = ui.get('.action-pad');
  for (let index = 0; index < 4; index++) {
    const button = document.createElement('button');
    button.className = `action ${index === 0 ? 'action-attack' : `action-slot${index}`}`;
    button.type = 'button';
    button.innerHTML = '<span class="skill-art" aria-hidden="true"></span><strong></strong><small></small><em></em><i class="skill-alert-dot" hidden></i>';
    pad.appendChild(button);
    if (index === 0) {
      ui.attackButton = button;
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); world.attackHeld = true; world.action('attack'); });
      button.addEventListener('pointerup', () => world.attackHeld = false);
      button.addEventListener('pointercancel', () => world.attackHeld = false);
      button.addEventListener('lostpointercapture', () => world.attackHeld = false);
    } else {
      ui.slotButtons.push(button);
      button.addEventListener('click', () => pressSkillSlot.call(ui, index - 1));
    }
  }
}

/** 창을 여닫는 입력 — 메뉴 버튼, 바깥 누르기, Esc, 창 크기 변화, 안쪽 스크롤. */
export function bindPanelInput(ui: Interface): void {
  ui.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.onclick = () => {
    cancelSkillSelection.call(ui);
    ui.open(button.dataset.modal as Modal);
  });
  // 스킬·가방에서 띄운 상세 패널은 그 바깥을 누르면 접힌다 — 상세 패널의 스크롤은 건드리지 않는다.
  ui.root.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    if (ui.equippedSlot && !target.closest('.equipped-detail, .equipment-slot')) dismissEquippedDetail(ui);
    if (ui.selected && !target.closest('.bag-detail-overlay, .bag-item')) dismissBagDetail(ui);
  }, true);
  window.addEventListener('resize', () => { positionBagDetail(ui); positionEquippedDetail(ui); });
  ui.modal.addEventListener('scroll', event => {
    if (event.target !== ui.modal.querySelector('.equipped-detail')) positionEquippedDetail(ui);
    if (event.target !== ui.modal.querySelector('.bag-detail-overlay')) positionBagDetail(ui);
  }, true);
  // 월드보스 창은 3D 장면을 직접 다루므로 Esc를 먼저 가로채 창만 닫는다.
  ui.root.addEventListener('keydown', event => {
    if (ui.openModal === 'worldBoss' && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); ui.open(null); }
  });
  ui.modal.addEventListener('click', event => { if (event.target === ui.modal) ui.open(null); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { cancelSkillSelection.call(ui); ui.open(null); } });
}
