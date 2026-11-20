#!/usr/bin/env python3
"""궁수 스킬·패시브 아이콘 시트를 만든다.

입력: `downloads/archer_skill_icons_raw.png`(4×2 아이콘), `downloads/archer_passive_icons_raw.png`(3×1 아이콘).
출력: `public/assets/icons/archer-skills.png` (708×354, 177px 정사각 8칸),
      `public/assets/icons/archer-passive-skills.png` (384×128, 128px 3칸).

기존 전사 시트와 같은 칸 수·비율이라 CSS 의 `background-size: 400% 200%` /
`300% 100%` 규칙을 그대로 쓸 수 있다. 아이콘마다 검정 여백이 달라 잘라 다시 앉힌다.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = Path('/workspace/downloads')
OUTPUT = ROOT / 'public/assets/icons'
ALPHA_LOW, ALPHA_HIGH = 6, 28


def keyed(path: Path) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    return Image.fromarray(np.dstack([rgb, alpha]).astype('uint8'), 'RGBA')


def sheet(source: Path, columns: int, rows: int, cell: int, output: Path, fill: float = .94) -> None:
    image = keyed(source)
    width, height = image.size
    canvas = Image.new('RGBA', (columns * cell, rows * cell), (0, 0, 0, 0))
    for row in range(rows):
        for column in range(columns):
            box = (round(column * width / columns), round(row * height / rows),
                   round((column + 1) * width / columns), round((row + 1) * height / rows))
            icon = image.crop(box)
            alpha = np.asarray(icon)[:, :, 3]
            rows_found, columns_found = np.nonzero(alpha > 8)
            if not len(rows_found):
                continue
            icon = icon.crop((int(columns_found.min()), int(rows_found.min()),
                              int(columns_found.max()) + 1, int(rows_found.max()) + 1))
            target = round(cell * fill)
            scale = min(target / icon.width, target / icon.height)
            icon = icon.resize((max(1, round(icon.width * scale)), max(1, round(icon.height * scale))), Image.LANCZOS)
            canvas.alpha_composite(icon, (column * cell + (cell - icon.width) // 2, row * cell + (cell - icon.height) // 2))
    canvas.save(output, optimize=True)
    print(f'{output.name}: {canvas.size[0]}×{canvas.size[1]} · {output.stat().st_size // 1024}KB')


if __name__ == '__main__':
    sheet(DOWNLOADS / 'archer_skill_icons_raw.png', 4, 2, 177, OUTPUT / 'archer-skills.png')
    sheet(DOWNLOADS / 'archer_passive_icons_raw.png', 3, 1, 128, OUTPUT / 'archer-passive-skills.png')
