#!/usr/bin/env python3
"""궁수·마법사 전용 투구·갑옷의 가방 아이콘 시트를 만든다(작업 249).

입력: `downloads/jobgear_icons/{archer_armor,mage_armor,archer_helmet,mage_helmet}_{0,5}.png`
      각 파일은 아이템 5종이 5등분 칸에 놓인 검정 배경 그림이다.
출력: `public/assets/item-art/{부위}_{0|5}.png` — 전사 아틀라스와 같은 870×290
      (174×290 칸 5개) 규격. `equipmentImage`가 `frame`으로 칸을 고른다.

`build-bow-art.py`와 같은 방식이다: 검정 배경을 밝기로 알파로 바꾸고, 칸마다 가장 큰
덩어리만 남겨 잔반점을 지운 뒤, 비율을 지켜 칸 안에 가운데로 넣는다.
"""
from pathlib import Path

import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = Path('/workspace/downloads/jobgear_icons')
OUTPUT = ROOT / 'public/assets/item-art'
CELL_W, CELL_H, COLUMNS = 174, 290, 5
ALPHA_LOW, ALPHA_HIGH = 6, 30

SHEETS = [
    ('archer_armor_0.png', 'archer_armor_0.png'),
    ('archer_armor_5.png', 'archer_armor_5.png'),
    ('archer_helmet_0.png', 'archer_helmet_0.png'),
    ('archer_helmet_5.png', 'archer_helmet_5.png'),
    ('mage_armor_0.png', 'mage_armor_0.png'),
    ('mage_armor_5.png', 'mage_armor_5.png'),
    ('mage_helmet_0.png', 'mage_helmet_0.png'),
    ('mage_helmet_5.png', 'mage_helmet_5.png'),
]


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
        # 검정 배경에서 살아남은 작은 반점은 지우고 아이템 본체만 남긴다.
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
        piece = cell.crop((int(columns.min()), int(rows.min()), int(columns.max()) + 1, int(rows.max()) + 1))
        scale = min((CELL_W - 10) / piece.width, (CELL_H - 8) / piece.height)
        piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
        sheet.alpha_composite(piece, (index * CELL_W + (CELL_W - piece.width) // 2, (CELL_H - piece.height) // 2))
    # 기존 item-art 와 같은 256색 팔레트(투명 인덱스 유지)로 줄인다 — 아이콘은 가방에서 작게 그려진다.
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(output, optimize=True)
    print(f'{output.name}: {sheet.size[0]}×{sheet.size[1]} · {output.stat().st_size // 1024}KB')


if __name__ == '__main__':
    for source, output in SHEETS:
        build(DOWNLOADS / source, OUTPUT / output)
