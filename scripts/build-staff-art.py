#!/usr/bin/env python3
"""마법사 지팡이 10종의 가방 아이콘 시트를 만든다.

입력: `downloads/mage_staff_raw1.png`(1~5번), `downloads/mage_staff_raw2.png`(6~10번).
      각 파일은 활 5자루가 5등분 칸에 놓인 검정 배경 그림이다.
출력: `public/assets/item-art/staff_0.png`, `staff_5.png` — 전사 대검 시트와 같은 870×290
      (174×290 칸 5개) 규격. `equipmentImage`가 `frame`으로 칸을 고른다.
"""
from pathlib import Path

import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = Path('/workspace/downloads')
OUTPUT = ROOT / 'public/assets/item-art'
CELL_W, CELL_H, COLUMNS = 174, 290, 5
ALPHA_LOW, ALPHA_HIGH = 6, 30


def keyed(path: Path) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    return Image.fromarray(np.dstack([rgb, alpha]).astype('uint8'), 'RGBA')


def build(source: Path, output: Path) -> None:
    image = keyed(source)
    width, height = image.size
    sheet = Image.new('RGBA', (CELL_W * COLUMNS, CELL_H), (0, 0, 0, 0))
    for index in range(COLUMNS):
        cell = image.crop((round(index * width / COLUMNS), 0, round((index + 1) * width / COLUMNS), height))
        alpha = np.asarray(cell)[:, :, 3]
        # 검정 배경에서 살아남은 작은 반점은 지우고 활 본체만 남긴다.
        count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 8).astype('uint8'), 8)
        if count > 1:
            main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            keep = labels == main
            cell = np.dstack([np.asarray(cell)[:, :, :3], np.where(keep, alpha, 0)]).astype('uint8')
            cell = Image.fromarray(cell, 'RGBA')
            alpha = np.asarray(cell)[:, :, 3]
        rows, columns = np.nonzero(alpha > 8)
        if not len(rows):
            raise SystemExit(f'빈 칸이 있습니다: {source.name} #{index}')
        bow = cell.crop((int(columns.min()), int(rows.min()), int(columns.max()) + 1, int(rows.max()) + 1))
        scale = min((CELL_W - 10) / bow.width, (CELL_H - 8) / bow.height)
        bow = bow.resize((max(1, round(bow.width * scale)), max(1, round(bow.height * scale))), Image.LANCZOS)
        sheet.alpha_composite(bow, (index * CELL_W + (CELL_W - bow.width) // 2, (CELL_H - bow.height) // 2))
    sheet.save(output, optimize=True)
    print(f'{output.name}: {sheet.size[0]}×{sheet.size[1]} · {output.stat().st_size // 1024}KB')


if __name__ == '__main__':
    build(DOWNLOADS / 'mage_staff_raw1.png', OUTPUT / 'staff_0.png')
    build(DOWNLOADS / 'mage_staff_raw2.png', OUTPUT / 'staff_5.png')
