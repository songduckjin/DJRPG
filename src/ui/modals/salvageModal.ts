import { salvageItems, salvagePlan } from '../../game/inventory';
import { itemPower, rarityNames, slotNames, type Slot } from '../../game/store';
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
  // Two things stop a salvage short of the bin and ask first (작업 196): an empty slot the selection
  // would leave the character without, and a piece that beats what is worn — bulk salvage sweeps a
  // whole grade, so it would otherwise eat the drop 자동 장착 would have taken.
  if (plan.emptySlots.length || plan.upgrades.length) { this.salvageIds = plan.items.map(item => item.id); this.open('salvage'); }
  else finishSalvage.call(this, plan.items.map(item => item.id));
}
export function renderSalvage(this: Interface, dialog: HTMLElement): void {
  const plan = salvagePlan(this.world.save, this.salvageIds ?? []);
  // The pieces worth keeping are named one by one, with what is worn in their place and the power
  // they would add, so the choice is made on the actual gear instead of a count.
  if (plan.upgrades.length) {
    const note = document.createElement('p'); note.className = 'salvage-warning is-upgrade'; note.setAttribute('role', 'alert');
    note.textContent = `지금 장착한 장비보다 좋은 장비가 ${plan.upgrades.length}개 포함되어 있습니다. 이대로 분해하면 다시 얻을 때까지 그 자리는 지금 장비로 싸워야 합니다.`;
    const list = document.createElement('ul'); list.className = 'salvage-upgrade-list';
    for (const upgrade of plan.upgrades) {
      const line = document.createElement('li');
      const part = document.createElement('strong'); part.textContent = slotNames[upgrade.slot as Slot];
      const name = document.createElement('span'); name.textContent = `${upgrade.item.name} · ${rarityNames[upgrade.item.rarity]}`;
      const worn = document.createElement('small');
      worn.textContent = `장착 중: ${upgrade.equipped.name} (전투력 ${Math.round(itemPower(upgrade.item))} vs ${Math.round(itemPower(upgrade.equipped))}, +${Math.round(upgrade.gain)})`;
      line.append(part, name, worn); list.appendChild(line);
    }
    dialog.append(note, list);
  }
  if (plan.emptySlots.length) {
    const note = document.createElement('p'); note.className = 'salvage-warning';
    note.textContent = `${plan.emptySlots.map(slot => slotNames[slot as Slot]).join(', ')} 장착 칸이 비어 있습니다. 장착에 사용할 수 있는 장비를 포함해 ${plan.items.length}개를 분해할까요?`;
    dialog.append(note);
  }
  const list = document.createElement('ul'); list.className = 'salvage-confirm-list';
  for (const item of plan.items) { const line = document.createElement('li'); line.textContent = item.name; list.appendChild(line); }
  const actions = document.createElement('div'); actions.className = 'salvage-confirm-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소하고 보관'; cancel.onclick = () => { this.salvageIds = undefined; this.open('equipment'); };
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = `${plan.items.length}개 분해`; confirm.disabled = !plan.items.length; confirm.onclick = () => finishSalvage.call(this, this.salvageIds ?? []);
  actions.append(cancel, confirm); dialog.append(list, actions);
}
