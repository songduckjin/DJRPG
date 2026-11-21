// ⚠ 이 파일은 `scripts/build-item-art-trim.py`가 만든다 — 손으로 고치지 않는다.
// 장착 칸 아이콘용 `public/assets/item-art/*.png`(5칸 아틀라스, 한 칸 174×290)의 **내용 합집합 상자**
// [x, y, w, h]다. 칸 아이콘은 이 상자만 칸에 꽉 차게 그려 빈 여백 때문에 물건이 작아 보이지 않게 한다.
export const itemArtColumns = 5;
export const itemArtCell = { width: 174, height: 290 } as const;
export const itemArtTrim: Record<string, readonly [number, number, number, number]> = {
  armor_0: [2, 48, 166, 201],
  armor_5: [2, 30, 170, 236],
  belt_0: [3, 93, 165, 144],
  belt_5: [2, 90, 168, 127],
  boots_0: [9, 54, 154, 188],
  boots_5: [6, 46, 160, 200],
  bow_0: [58, 4, 57, 282],
  bow_5: [52, 4, 70, 282],
  gloves_0: [2, 52, 170, 193],
  gloves_5: [2, 61, 170, 169],
  helmet_0: [7, 44, 165, 197],
  helmet_5: [2, 42, 170, 192],
  necklace_0: [12, 35, 149, 226],
  offhand_0: [3, 34, 167, 217],
  ring_0: [7, 64, 151, 152],
  staff_0: [54, 4, 66, 282],
  staff_5: [47, 4, 79, 282],
  weapon_0: [39, 4, 96, 281],
  weapon_5: [15, 2, 141, 285],
};
