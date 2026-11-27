import { baseItemIndex } from '../game/items';
import { jobOrDefault } from '../game/skills';
import type { Save } from '../game/store';

const visibleSlots = [
  ['weapon', 'weapon'], ['armor', 'armor'], ['helmet', 'helmet'], ['gloves', 'glove'], ['boots', 'boots']
] as const;

export function hasApprovedWarriorPreview(save: Save): boolean {
  return jobOrDefault(save.job) === 'warrior' && save.gender === 'male';
}

export function warriorWearFrame(save: Save, portrait: boolean): HTMLIFrameElement {
  const params = new URLSearchParams();
  if (portrait) params.set('portrait', '1');
  for (const [slot, previewSlot] of visibleSlots) {
    const item = save.equipment[slot];
    if (!item) continue;
    const index = baseItemIndex(item);
    if (index < 0) continue;
    params.set(previewSlot, String(index));
    params.set(previewSlot + '-tier', item.rarity);
  }
  const frame = document.createElement('iframe');
  frame.className = portrait ? 'showcase-body showcase-wear-frame' : 'equipment-wear-preview-frame';
  frame.title = portrait ? '전사 장착 모습 · 9번 프레임' : '유니크·전설 장비 착용 미리보기';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.src = '/warrior-wear-preview.html?' + params;
  return frame;
}

export function openWarriorWearPreview(host: HTMLElement, save: Save): void {
  const panel = document.createElement('dialog');
  panel.className = 'equipment-wear-preview';
  panel.setAttribute('aria-label', '장비 착용 미리보기');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '닫기';
  close.onclick = () => panel.close();
  panel.addEventListener('close', () => panel.remove(), { once: true });
  panel.append(close, warriorWearFrame(save, false));
  host.append(panel);
  panel.showModal();
}
