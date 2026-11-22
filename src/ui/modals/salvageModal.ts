import { salvageItems, salvagePlan } from '../../game/inventory';
import { itemDisplayName } from '../../game/items';
import { slotNames, type Slot } from '../../game/store';
import type { Interface } from '../interface';
import { openSalvageProtection } from '../salvageProtection';
import { openSalvageConfirm } from '../salvageConfirm';
export function finishSalvage(this: Interface, ids: string[]): void {
  if (this.world.paused) return;
  const result = salvageItems(this.world.save, ids);
  this.salvageIds = undefined; this.selected = undefined; this.open('equipment');
  this.world.onChange();
  this.message(result.count ? `${result.count}개 분해 완료 (+${result.gold}금화 / +${result.stones}강화석)` : '분해할 장비가 없습니다.');
}
/**
 * 분해 확정 직전의 마지막 단계(백로그 12번 B안) — **2개 이상**이면 등급별 내역과 예상 획득을 보여
 * 주는 확인 팝업을 한 번 띄우고, 그 [분해하기]를 눌러야 실제로 분해한다. 1개 단품 분해는 묻지 않고
 * 바로 분해한다. 살아 있는 세이브로 대상을 다시 계산하므로, 보호 팝업에서 더 좋은 장비를 뺀 뒤라면
 * 줄어든 개수·등급 내역이 그대로 팝업에 반영된다.
 */
export function confirmSalvage(this: Interface, ids: string[]): void {
  const plan = salvagePlan(this.world.save, ids);
  const selected = plan.items.map(item => item.id);
  if (!selected.length) { this.message('분해할 장비가 없습니다.'); return; }
  if (selected.length < 2) { finishSalvage.call(this, selected); return; }
  const ui = this;
  openSalvageConfirm(this, this.salvageRarity, plan.items, {
    confirm() { finishSalvage.call(ui, selected); },
    cancel() { ui.salvageIds = undefined; ui.open('equipment'); }
  });
}
export function requestSalvage(this: Interface, ids: string[]): void {
  if (ids.length === 1 && this.world.save.bag.some(item => item.id === ids[0] && 'locked' in item && item.locked)) { this.message('잠긴 장비입니다. 먼저 잠금을 해제하세요.'); return; }
  const plan = salvagePlan(this.world.save, ids);
  if (!plan.items.length) { this.message('분해할 장비가 없습니다.'); return; }
  const selected = plan.items.map(item => item.id);
  // Two things stop a salvage short and ask first: a piece that beats what is worn (작업 196), and an
  // empty slot the selection would leave the character without. The better piece is asked about in a
  // small popup over the bag (작업 197) — the bag itself stays where it is, and only the gear worth
  // keeping is shown, with '이 아이템 분해 제외' as the button to press.
  if (plan.upgrades.length) {
    const ui = this;
    openSalvageProtection(this, plan.upgrades, {
      exclude() {
        const protectedIds = new Set(plan.upgrades.map(upgrade => upgrade.item.id));
        const rest = selected.filter(id => !protectedIds.has(id));
        if (!rest.length) { ui.salvageIds = undefined; ui.open('equipment'); ui.message('보호할 장비를 남기고 분해를 취소했습니다.'); return; }
        const next = salvagePlan(ui.world.save, rest);
        if (next.emptySlots.length) { ui.salvageIds = rest; ui.open('salvage'); return; }
        confirmSalvage.call(ui, rest);
      },
      confirm() { confirmSalvage.call(ui, selected); },
      cancel() { ui.salvageIds = undefined; ui.open('equipment'); }
    });
    return;
  }
  if (plan.emptySlots.length) { this.salvageIds = selected; this.open('salvage'); }
  else confirmSalvage.call(this, selected);
}
export function renderSalvage(this: Interface, dialog: HTMLElement): void {
  const plan = salvagePlan(this.world.save, this.salvageIds ?? []);
  // The bag has something usable while a slot is empty: ask once, and list what the sale takes.
  if (plan.emptySlots.length) {
    const note = document.createElement('p'); note.className = 'salvage-warning';
    note.textContent = `${plan.emptySlots.map(slot => slotNames[slot as Slot]).join(', ')} 장착 칸이 비어 있습니다. 장착에 사용할 수 있는 장비를 포함해 ${plan.items.length}개를 분해할까요?`;
    dialog.append(note);
  }
  const list = document.createElement('ul'); list.className = 'salvage-confirm-list';
  for (const item of plan.items) { const line = document.createElement('li'); line.textContent = itemDisplayName(item); list.appendChild(line); }
  const actions = document.createElement('div'); actions.className = 'salvage-confirm-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소하고 보관'; cancel.onclick = () => { this.salvageIds = undefined; this.open('equipment'); };
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = `${plan.items.length}개 분해`; confirm.disabled = !plan.items.length; confirm.onclick = () => confirmSalvage.call(this, this.salvageIds ?? []);
  actions.append(cancel, confirm); dialog.append(list, actions);
}
