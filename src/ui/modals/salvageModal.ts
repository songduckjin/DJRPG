import { salvageItems, salvagePlan } from '../../game/inventory';
import { itemDisplayName } from '../../game/items';
import { slotNames, type Slot } from '../../game/store';
import type { Interface } from '../interface';
import { openSalvageProtection } from '../salvageProtection';
export function finishSalvage(this: Interface, ids: string[]): void {
  if (this.world.paused) return;
  const result = salvageItems(this.world.save, ids);
  this.salvageIds = undefined; this.selected = undefined; this.open('equipment');
  this.world.onChange();
  this.message(result.count ? `${result.count}개 분해 완료 (+${result.gold}금화 / +${result.stones}강화석)` : '분해할 장비가 없습니다.');
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
        finishSalvage.call(ui, rest);
      },
      confirm() { finishSalvage.call(ui, selected); },
      cancel() { ui.salvageIds = undefined; ui.open('equipment'); }
    });
    return;
  }
  if (plan.emptySlots.length) { this.salvageIds = selected; this.open('salvage'); }
  else finishSalvage.call(this, selected);
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
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = `${plan.items.length}개 분해`; confirm.disabled = !plan.items.length; confirm.onclick = () => finishSalvage.call(this, this.salvageIds ?? []);
  actions.append(cancel, confirm); dialog.append(list, actions);
}
