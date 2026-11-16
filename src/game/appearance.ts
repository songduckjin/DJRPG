import type { Save, Slot } from './store';

// Female helmet art is painted into the body sprites; male helmets still use a separate gear layer.
export function heroAppearance(save: Save) {
  const armed = !!save.equipment.weapon, armored = !!save.equipment.armor;
  const gender = save.gender;
  const helmetIntegrated = gender === 'female' && !!save.equipment.helmet;
  return {
    idle: helmetIntegrated ? armored ? 'femaleArmoredHelm' as const : armed ? 'femaleSwordHelm' as const : 'femaleBaseHelm' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelm' as const : 'armoredNoHelm' as const : armed ? gender === 'male' ? 'maleSword' as const : 'femaleSword' as const : gender,
    walk: helmetIntegrated ? armored ? 'femaleArmoredHelmWalk' as const : armed ? 'femaleHelmWalk' as const : 'femaleBaseHelmWalk' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelmWalk' as const : 'armoredNoHelmWalk' as const : gender === 'female' ? armed ? 'femaleWalk' as const : 'femaleBaseWalk' as const : armed ? 'maleWalk' as const : 'maleBaseWalk' as const,
    attack: helmetIntegrated ? armored ? 'femaleArmoredHelmAttack' as const : 'femaleHelmAttack' as const
      : armored ? gender === 'female' ? 'femaleArmoredNoHelmAttack' as const : 'armoredNoHelmAttack' as const : gender === 'male' ? 'maleAttack' as const : 'femaleAttack' as const,
    portrait: helmetIntegrated ? armored ? '/assets/warrior_female_armored_helm.png' : `/assets/warrior_female_${armed ? 'sword' : 'base'}_helm.png`
      : armored ? gender === 'female' ? '/assets/warrior_female_armored_nohelm.png' : '/assets/warrior_armored_nohelm.png?v=2' : `/assets/warrior_${gender}_${armed ? 'sword' : 'base'}.png`,
    helmetIntegrated,
    helmet: save.equipment.helmet
  };
}
export function unequipItem(save: Save, slot: Slot): { ok: boolean; message: string } {
  const item = save.equipment[slot];
  if (!item) return { ok: false, message: '빈 장비 슬롯입니다.' };
  if (save.bag.length >= 40) return { ok: false, message: '가방이 가득 차 장비를 해제할 수 없습니다.' };
  save.bag.push(item); delete save.equipment[slot];
  return { ok: true, message: `${item.name} 장착을 해제했습니다.` };
}
