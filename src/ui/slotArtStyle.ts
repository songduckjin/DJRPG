// [작업 231] 장착 칸 아이콘의 배경 위치 계산.
//
// `public/assets/item-art/*.png`는 5칸 아틀라스(870×290, 한 칸 174×290)이고, 한 칸 안의 물건은 위·아래
// 여백이 커서 칸 전체를 그리면 물건이 작게 보인다. `itemArtTrim.generated.ts`가 파일마다 잰 **내용
// 합집합 상자**만 칸에 꽉 차게 그리되, 그림은 절대 늘리지 않는다 — 상자에 `aspect-ratio`를 상자의
// 비율로 주고 `background-size`(퍼센트)·`background-position`(퍼센트)로 그 상자만 잘라 보여 준다.
//
// 퍼센트만으로 계산이 끝나는 이유: `background-position`의 퍼센트는 `p × (상자 크기 − 그림 크기)`이고,
// `background-size`도 상자 크기의 퍼센트라 상자 픽셀 크기가 약분된다(아래 식).
//   그림 폭 = 상자폭 × (870 / w),  그림 높이 = 상자높이 × (290 / h)
//   p_x = (frame × 174 + x) / (870 − w),  p_y = y / (290 − h)
// 그래서 CSS가 아니라 여기서 문자열로 만들고, CSS는 이 인라인 값을 그대로 쓴다(값이 없으면 CSS 기본값).
import { itemArtCell, itemArtColumns, itemArtTrim } from './itemArtTrim.generated';

/** 아틀라스 경로에서 표의 키(`helmet_0` 등)를 얻는다. */
export function itemArtKey(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.replace(/\.png(?:\?.*)?$/, '');
}

/** 칸 아이콘용 인라인 스타일 — 내용 상자만 칸에 꽉 차게(비율 유지) 그린다. */
export function slotAtlasStyle(path: string, frame: number): string {
  const trim = itemArtTrim[itemArtKey(path)];
  const image = `background-image:url('${path}')`;
  if (!trim) return `${image};background-position:${(frame * 100) / itemArtColumns}% center`;
  const [x, y, width, height] = trim;
  const atlasWidth = itemArtCell.width * itemArtColumns;
  const sizeX = (atlasWidth / width) * 100;
  const sizeY = (itemArtCell.height / height) * 100;
  const positionX = ((frame * itemArtCell.width + x) / (atlasWidth - width)) * 100;
  const positionY = (y / (itemArtCell.height - height)) * 100;
  return `${image};background-size:${sizeX.toFixed(4)}% ${sizeY.toFixed(4)}%;`
    + `background-position:${positionX.toFixed(4)}% ${positionY.toFixed(4)}%;aspect-ratio:${width} / ${height}`;
}
