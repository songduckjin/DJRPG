import { salvageItems, salvagePlan } from '../../game/inventory';
import { slotNames, type Slot } from '../../game/store';
import type { Interface } from '../interface';
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
  if (plan.emptySlots.length) { this.salvageIds = plan.items.map(item => item.id); this.open('salvage'); }
  else finishSalvage.call(this, plan.items.map(item => item.id));
}
export function renderSalvage(this: Interface, dialog: HTMLElement): void {
  const plan = salvagePlan(this.world.save, this.salvageIds ?? []);
  const note = document.createElement('p'); note.className = 'salvage-warning';
  note.textContent = `${plan.emptySlots.map(slot => slotNames[slot as Slot]).join(', ')} 장착 칸이 비어 있습니다. 장착에 사용할 수 있는 장비를 포함해 ${plan.items.length}개를 분해할까요?`;
  const list = document.createElement('ul'); list.className = 'salvage-confirm-list';
  for (const item of plan.items) { const line = document.createElement('li'); line.textContent = item.name; list.appendChild(line); }
  const actions = document.createElement('div'); actions.className = 'salvage-confirm-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소하고 보관'; cancel.onclick = () => { this.salvageIds = undefined; this.open('equipment'); };
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = `${plan.items.length}개 분해`; confirm.disabled = !plan.items.length; confirm.onclick = () => finishSalvage.call(this, this.salvageIds ?? []);
  actions.append(cancel, confirm); dialog.append(note, list, actions);
}
