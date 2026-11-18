import type { Slot } from '../items';

/**
 * 아이템 이름 → 코스튬 `costumeId` 매핑 (작업 139, `docs/COSTUME_SYSTEM.md` v1.1).
 *
 * - `items.ts`의 `baseItems` 고유 장비 이름 75종을 빠짐없이 `costumeId` 또는 `COSTUME_NONE`으로 적는다.
 *   (`ring1`·`ring2`는 같은 기본형 5종을 공유하므로 `ring` 하나로 센다: 10+5+10+10+5+10+10+10+5 = 75)
 * - 이름 대조 규칙은 `items.ts` `baseItemIndex`와 같다 — NFKC 정규화 + 공백·제로폭 문자 제거 +
 *   완전일치/`endsWith`(등급 접두사가 붙은 저장 이름 허용). `items.ts`는 공용 계약이라 수정하지 않고,
 *   같은 규칙을 이 모듈에 두되 `tests/costume-manifest.test.mjs`에서 `baseItemIndex`와의 동등성을 고정한다.
 * - Save에 외형을 저장하지 않는다. 이 표는 런타임 조회 전용이다.
 */
export type CostumeSlotGroup = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring';

export const costumeSlotGroups: readonly CostumeSlotGroup[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring'];

/** 필드 외형이 없는 부위(장신구·벨트)의 명시값. "매핑 누락"과 구분하기 위해 `undefined`를 쓰지 않는다. */
export const COSTUME_NONE = 'none';

/** `ring1`·`ring2`를 `ring` 하나로 묶는다. */
export function costumeSlotGroup(slot: Slot): CostumeSlotGroup { return slot === 'ring1' || slot === 'ring2' ? 'ring' : slot; }

/**
 * 부위가 필드 캐릭터 외형에 나타나는지.
 * 무기·보조무기·투구·갑옷·장갑·신발은 부착/교체 대상이고, 목걸이·벨트·반지는 현행 필드에 그리지 않는다(§3.1).
 */
export const costumeFieldVisible: Record<CostumeSlotGroup, boolean> = {
  weapon: true, offhand: true, helmet: true, armor: true, gloves: true, boots: true, necklace: false, belt: false, ring: false
};

export type CostumeMappingEntry = { readonly name: string; readonly costumeId: string };

/**
 * `costumeId`는 `<부위>-t<기본형 인덱스>`다. 인덱스는 `baseItems` 배열 순서(0부터)와 같고,
 * 아트 프레임·매니페스트 항목이 같은 값을 쓴다. 기본형을 추가하면 배열 끝에만 덧붙이고 이 표에도 한 줄 추가한다.
 */
export const costumeMapping: Record<CostumeSlotGroup, readonly CostumeMappingEntry[]> = {
  weapon: [
    { name: '두손검', costumeId: 'weapon-t0' },
    { name: '바스타드 소드', costumeId: 'weapon-t1' },
    { name: '클레이모어', costumeId: 'weapon-t2' },
    { name: '쯔바이핸드', costumeId: 'weapon-t3' },
    { name: '플랑베르주', costumeId: 'weapon-t4' },
    { name: '룬 블레이드', costumeId: 'weapon-t5' },
    { name: '혈빛 대검', costumeId: 'weapon-t6' },
    { name: '아다만트 그레이트소드', costumeId: 'weapon-t7' },
    { name: '용살자의 대검', costumeId: 'weapon-t8' },
    { name: '패왕의 성검', costumeId: 'weapon-t9' }
  ],
  offhand: [
    { name: '수련자의 문장', costumeId: 'offhand-t0' },
    { name: '강철 문장', costumeId: 'offhand-t1' },
    { name: '기사단 휘장', costumeId: 'offhand-t2' },
    { name: '피빛 맹세 문장', costumeId: 'offhand-t3' },
    { name: '붉은보석 문장', costumeId: 'offhand-t4' }
  ],
  helmet: [
    { name: '가죽 두건', costumeId: 'helmet-t0' },
    { name: '철제 바시넷', costumeId: 'helmet-t1' },
    { name: '사슬 코이프', costumeId: 'helmet-t2' },
    { name: '기사 헬름', costumeId: 'helmet-t3' },
    { name: '바이저 투구', costumeId: 'helmet-t4' },
    { name: '미스릴 그레이트헬름', costumeId: 'helmet-t5' },
    { name: '용린 투구', costumeId: 'helmet-t6' },
    { name: '심연의 뿔투구', costumeId: 'helmet-t7' },
    { name: '발키리 크라운', costumeId: 'helmet-t8' },
    { name: '불멸의 왕관', costumeId: 'helmet-t9' }
  ],
  armor: [
    { name: '가죽 조끼', costumeId: 'armor-t0' },
    { name: '징박힌 갑옷', costumeId: 'armor-t1' },
    { name: '사슬 갑옷', costumeId: 'armor-t2' },
    { name: '강철 브레스트플레이트', costumeId: 'armor-t3' },
    { name: '하프 플레이트', costumeId: 'armor-t4' },
    { name: '미스릴 아머', costumeId: 'armor-t5' },
    { name: '흑요석 갑주', costumeId: 'armor-t6' },
    { name: '드래곤 메일', costumeId: 'armor-t7' },
    { name: '성기사 풀플레이트', costumeId: 'armor-t8' },
    { name: '패왕의 전갑', costumeId: 'armor-t9' }
  ],
  necklace: [
    { name: '구리 펜던트', costumeId: COSTUME_NONE },
    { name: '은빛 로켓', costumeId: COSTUME_NONE },
    { name: '마력의 아뮬렛', costumeId: COSTUME_NONE },
    { name: '용의 눈 목걸이', costumeId: COSTUME_NONE },
    { name: '태양의 심장', costumeId: COSTUME_NONE }
  ],
  gloves: [
    { name: '천 장갑', costumeId: 'gloves-t0' },
    { name: '가죽 브레이서', costumeId: 'gloves-t1' },
    { name: '사슬 건틀릿', costumeId: 'gloves-t2' },
    { name: '강철 건틀릿', costumeId: 'gloves-t3' },
    { name: '기사단 장갑', costumeId: 'gloves-t4' },
    { name: '미스릴 글러브', costumeId: 'gloves-t5' },
    { name: '피빛 크로', costumeId: 'gloves-t6' },
    { name: '용린 건틀릿', costumeId: 'gloves-t7' },
    { name: '타이탄의 손아귀', costumeId: 'gloves-t8' },
    { name: '심연의 장갑', costumeId: 'gloves-t9' }
  ],
  belt: [
    { name: '삼베 허리띠', costumeId: COSTUME_NONE },
    { name: '가죽 벨트', costumeId: COSTUME_NONE },
    { name: '징박힌 벨트', costumeId: COSTUME_NONE },
    { name: '사슬 거들', costumeId: COSTUME_NONE },
    { name: '강철 버클 벨트', costumeId: COSTUME_NONE },
    { name: '미스릴 벨트', costumeId: COSTUME_NONE },
    { name: '수호자의 거들', costumeId: COSTUME_NONE },
    { name: '용가죽 벨트', costumeId: COSTUME_NONE },
    { name: '거인의 허리띠', costumeId: COSTUME_NONE },
    { name: '붉은보석 벨트', costumeId: COSTUME_NONE }
  ],
  boots: [
    { name: '낡은 부츠', costumeId: 'boots-t0' },
    { name: '가죽 장화', costumeId: 'boots-t1' },
    { name: '사슬 그리브', costumeId: 'boots-t2' },
    { name: '강철 부츠', costumeId: 'boots-t3' },
    { name: '기사의 사바톤', costumeId: 'boots-t4' },
    { name: '미스릴 부츠', costumeId: 'boots-t5' },
    { name: '바람의 장화', costumeId: 'boots-t6' },
    { name: '용린 그리브', costumeId: 'boots-t7' },
    { name: '폭풍의 사바톤', costumeId: 'boots-t8' },
    { name: '불멸의 각반', costumeId: 'boots-t9' }
  ],
  ring: [
    { name: '구리 반지', costumeId: COSTUME_NONE },
    { name: '은 반지', costumeId: COSTUME_NONE },
    { name: '혈옥 반지', costumeId: COSTUME_NONE },
    { name: '수호의 인장', costumeId: COSTUME_NONE },
    { name: '군주의 반지', costumeId: COSTUME_NONE }
  ]
};

export type CostumeLegacyAlias = { readonly slot: Slot; readonly name: string; readonly baseName: string; readonly costumeId: string };

/**
 * 레거시 저장 이름 예외. 2026-11 이전 세이브의 `낡은 투구`는 현행 기본형 `심연의 뿔투구`로 본다
 * (`items.ts` `baseItemIndex`의 예외와 같은 판정이다).
 */
export const legacyCostumeAliases: readonly CostumeLegacyAlias[] = [
  { slot: 'helmet', name: '낡은 투구', baseName: '심연의 뿔투구', costumeId: 'helmet-t7' }
];

/** `items.ts` `baseItemIndex` 안의 `compact`와 같은 규칙. */
export function compactItemName(value: string): string { return value.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, ''); }

export type CostumeLookup =
  | { ok: true; costumeId: string; slotGroup: CostumeSlotGroup; fieldVisible: boolean; baseName: string; matchedBy: 'base' | 'legacy' }
  | { ok: false; reason: 'unmapped-costume'; slotGroup: CostumeSlotGroup; fieldVisible: boolean; baseName: null };

/** 아이템 하나를 매핑표와 대조한다. 대조 실패도 예외를 던지지 않고 `ok:false`로 돌려준다(폴백 ③). */
export function lookupCostume(item: { name: string; slot: Slot }): CostumeLookup {
  const slotGroup = costumeSlotGroup(item.slot), fieldVisible = costumeFieldVisible[slotGroup];
  const name = compactItemName(item.name);
  const alias = legacyCostumeAliases.find(entry => entry.slot === item.slot && name === compactItemName(entry.name));
  if (alias) return { ok: true, costumeId: alias.costumeId, slotGroup, fieldVisible, baseName: alias.baseName, matchedBy: 'legacy' };
  const entry = costumeMapping[slotGroup].find(base => name === compactItemName(base.name) || name.endsWith(compactItemName(base.name)));
  if (!entry) return { ok: false, reason: 'unmapped-costume', slotGroup, fieldVisible, baseName: null };
  return { ok: true, costumeId: entry.costumeId, slotGroup, fieldVisible, baseName: entry.name, matchedBy: 'base' };
}

/** 아이템 → `costumeId`. 대조 실패는 `undefined`(미매핑)다. */
export function costumeIdFor(item: { name: string; slot: Slot }): string | undefined {
  const lookup = lookupCostume(item);
  return lookup.ok ? lookup.costumeId : undefined;
}

/** 매핑표 75행을 부위 순서대로 펼친다(아트·매니페스트 점검용). */
export function costumeMappingEntries(): { slotGroup: CostumeSlotGroup; name: string; costumeId: string }[] {
  return costumeSlotGroups.flatMap(slotGroup => costumeMapping[slotGroup].map(entry => ({ slotGroup, name: entry.name, costumeId: entry.costumeId })));
}
