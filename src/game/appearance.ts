import { equipmentCount } from './bagCapacity';
import type { Save, Slot } from './store';
import { baseItemIndex, type EquipmentItem } from './items';

export type GearTier = 1 | 2 | 3 | 4;
export type GearPalette = { key: string; tint: number; saturation: number; lightness: number; strength: number };

const armorPalettes: readonly GearPalette[] = [
  { key: 'leather', tint: 0x8a5a32, saturation: .52, lightness: .37, strength: .58 },
  { key: 'studded', tint: 0x6f5a24, saturation: .48, lightness: .31, strength: .56 },
  { key: 'chain', tint: 0x8d949c, saturation: .12, lightness: .58, strength: .38 },
  { key: 'steel', tint: 0x9ba4ad, saturation: .08, lightness: .62, strength: 0 },
  { key: 'blueSteel', tint: 0x5d7fa6, saturation: .38, lightness: .48, strength: .48 },
  { key: 'mithril', tint: 0xb9d3e6, saturation: .34, lightness: .79, strength: .42 },
  { key: 'obsidian', tint: 0x3a2b52, saturation: .44, lightness: .25, strength: .58 },
  { key: 'dragon', tint: 0x8f1f22, saturation: .62, lightness: .34, strength: .58 },
  { key: 'paladin', tint: 0xc9a63a, saturation: .58, lightness: .51, strength: .55 },
  { key: 'overlord', tint: 0x5e2a6b, saturation: .52, lightness: .29, strength: .58 }
];
const helmetPalettes: readonly GearPalette[] = [
  armorPalettes[0],
  { key: 'iron', tint: 0x7d7f83, saturation: .08, lightness: .49, strength: .42 },
  armorPalettes[2],
  { ...armorPalettes[3], key: 'steel' },
  armorPalettes[4],
  armorPalettes[5],
  { key: 'dragonScale', tint: 0x2f6b45, saturation: .48, lightness: .31, strength: .55 },
  { key: 'abyss', tint: 0x33265a, saturation: .5, lightness: .25, strength: .58 },
  { key: 'valkyrie', tint: 0xdfe6ee, saturation: .12, lightness: .88, strength: .4 },
  { key: 'immortal', tint: 0xd4af37, saturation: .6, lightness: .52, strength: .55 }
];
const armorTiers: readonly GearTier[] = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
const helmetTiers: readonly GearTier[] = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];

function gearIndex(item: EquipmentItem | undefined, slot: 'armor' | 'helmet'): number {
  if (!item || item.slot !== slot) return -1;
  return baseItemIndex(item);
}
export function armorTier(item?: EquipmentItem): GearTier | null { const i = gearIndex(item, 'armor'); return armorTiers[i] ?? null; }
export function armorPalette(item?: EquipmentItem): GearPalette | null { const i = gearIndex(item, 'armor'); return armorPalettes[i] ?? null; }
export function helmetTier(item?: EquipmentItem): GearTier | null { const i = gearIndex(item, 'helmet'); return helmetTiers[i] ?? null; }
export function helmetPalette(item?: EquipmentItem): GearPalette | null {
  const i = gearIndex(item, 'helmet');
  if (i < 0 && item?.slot === 'helmet' && item.name.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, '') === '낡은투구') return helmetPalettes[7];
  return helmetPalettes[i] ?? null;
}

// Helmet art is part of the selected body sprites where that appearance exists.
export function heroAppearance(save: Save) {
  const armed = !!save.equipment.weapon, armored = !!save.equipment.armor;
  const gender = save.gender;
  const femaleHelmet = gender === 'female' && !!save.equipment.helmet;
  const maleHelmet = gender === 'male' && !!save.equipment.helmet;
  const maleArmoredHelmet = maleHelmet && armored;
  const oldHelmet = femaleHelmet && save.equipment.helmet?.name === '낡은 투구';
  return {
    armorTier: armorTier(save.equipment.armor),
    armorPalette: armorPalette(save.equipment.armor),
    helmetTier: helmetTier(save.equipment.helmet),
    helmetPalette: helmetPalette(save.equipment.helmet),
    idle: oldHelmet ? armored ? 'femaleArmoredOldHelm' as const : armed ? 'femaleSwordOldHelm' as const : 'femaleBaseOldHelm' as const
      : femaleHelmet ? armored ? 'femaleArmoredHelm' as const : armed ? 'femaleSwordHelm' as const : 'femaleBaseHelm' as const
      : maleArmoredHelmet ? 'armored' as const
      : maleHelmet ? armed ? 'maleSwordHelm' as const : 'maleBaseHelm' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelm' as const : 'armoredNoHelm' as const : armed ? gender === 'male' ? 'maleSword' as const : 'femaleSword' as const : gender,
    walk: oldHelmet ? armored ? 'femaleArmoredOldHelmWalk' as const : armed ? 'femaleOldHelmWalk' as const : 'femaleBaseOldHelmWalk' as const
      : femaleHelmet ? armored ? 'femaleArmoredHelmWalk' as const : armed ? 'femaleHelmWalk' as const : 'femaleBaseHelmWalk' as const
      : maleArmoredHelmet ? 'armoredWalk' as const
      : maleHelmet ? armed ? 'maleHelmWalk' as const : 'maleBaseHelmWalk' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelmWalk' as const : 'armoredNoHelmWalk' as const : gender === 'female' ? armed ? 'femaleWalk' as const : 'femaleBaseWalk' as const : armed ? 'maleWalk' as const : 'maleBaseWalk' as const,
    // Every attack sheet holds a sword. Keep the matching unarmed body sprite
    // during a weaponless attack; the renderer still supplies the lunge/VFX.
    attack: !armed ? undefined
      : oldHelmet ? armored ? 'femaleArmoredOldHelmAttack' as const : 'femaleOldHelmAttack' as const
      : femaleHelmet ? armored ? 'femaleArmoredHelmAttack' as const : 'femaleHelmAttack' as const
      : maleArmoredHelmet ? 'armoredAttack' as const
      : maleHelmet ? 'maleHelmAttack' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelmAttack' as const : 'armoredNoHelmAttack' as const : gender === 'male' ? 'maleAttack' as const : 'femaleAttack' as const,
    portrait: oldHelmet ? armored ? '/assets/warrior_female_armored_oldhelm.png' : `/assets/warrior_female_${armed ? 'sword' : 'base'}_oldhelm.png`
      : femaleHelmet ? armored ? '/assets/warrior_female_armored_helm.png' : `/assets/warrior_female_${armed ? 'sword' : 'base'}_helm.png`
      : maleArmoredHelmet ? '/assets/warrior_armored.png?v=2'
      : maleHelmet ? `/assets/warrior_male_${armed ? 'sword' : 'base'}_helm.png`
      : armored ? gender === 'female' ? '/assets/warrior_female_armored_nohelm.png' : '/assets/warrior_armored_nohelm.png?v=2' : `/assets/warrior_${gender}_${armed ? 'sword' : 'base'}.png`,
    helmetIntegrated: femaleHelmet || maleHelmet,
    helmet: save.equipment.helmet
  };
}
export function unequipItem(save: Save, slot: Slot): { ok: boolean; message: string } {
  const item = save.equipment[slot];
  if (!item) return { ok: false, message: '빈 장비 슬롯입니다.' };
  if (equipmentCount(save.bag) >= 40) return { ok: false, message: '가방이 가득 차 장비를 해제할 수 없습니다.' };
  save.bag.push(item); delete save.equipment[slot];
  return { ok: true, message: `${item.name} 장착을 해제했습니다.` };
}
