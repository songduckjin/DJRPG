#!/usr/bin/env python3
"""장착 칸 아이콘의 **그림 알맹이 상자**(trim box) 표를 만든다 — `src/ui/itemArtTrim.generated.ts`.

`public/assets/item-art/*.png`는 5칸(870×290, 한 칸 174×290) 아틀라스다. 칸 안에는 물건이 가운데
작게 놓여 있어 가장자리에 빈 여백이 많다(세로 30~55%가 빈칸인 물건도 있다). 장착 칸처럼 좁은
상자에 이 아틀라스 한 칸을 그대로 넣으면 물건이 작게 보이므로, 파일마다 **5칸 전체 내용의 합집합
상자**를 재서 그 상자만 상자에 꽉 차게 그린다(비율은 그대로 — 늘리지 않는다).

칸 경계(0 또는 174/290)에 닿은 변은 2px 안쪽으로 물린다 — 이웃 칸의 물건이 1~2px 비쳐 보이는 것을
막고, `290 - h`가 0이 되어 퍼센트 위치를 계산할 수 없게 되는 것도 함께 막는다.

사용: python3 scripts/build-item-art-trim.py   (PIL 필요, 결과 파일은 커밋한다)
"""
from __future__ import annotations

import glob
import os
import re

from PIL import Image

COLUMNS = 5
CELL_W = 174
CELL_H = 290
INSET = 2
ALPHA_MIN = 16

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_DIR = os.path.join(ROOT, 'public', 'assets', 'item-art')
OUT = os.path.join(ROOT, 'src', 'ui', 'itemArtTrim.generated.ts')


def union_box(path: str) -> tuple[int, int, int, int]:
    image = Image.open(path).convert('RGBA')
    width, height = image.size
    if (width, height) != (COLUMNS * CELL_W, CELL_H):
        raise SystemExit(f'{path}: {width}×{height} — 5칸 아틀라스(870×290)가 아니다')
    left, top, right, bottom = CELL_W, CELL_H, 0, 0
    for index in range(COLUMNS):
        alpha = image.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H)).split()[3]
        box = alpha.point(lambda value: 255 if value > ALPHA_MIN else 0).getbbox()
        if not box:
            continue
        x0, y0, x1, y1 = box
        left, top = min(left, x0), min(top, y0)
        right, bottom = max(right, x1), max(bottom, y1)
    if right <= left or bottom <= top:
        raise SystemExit(f'{path}: 내용이 비어 있다')
    if left <= 1:
        left = INSET
    if top <= 1:
        top = INSET
    if right >= CELL_W - 1:
        right = CELL_W - INSET
    if bottom >= CELL_H - 1:
        bottom = CELL_H - INSET
    if right - left < 4 or bottom - top < 4:
        raise SystemExit(f'{path}: 상자가 너무 작다')
    return left, top, right - left, bottom - top


def main() -> None:
    files = sorted(glob.glob(os.path.join(ART_DIR, '*.png')))
    if not files:
        raise SystemExit('item-art PNG를 찾지 못했다')
    rows = []
    for path in files:
        name = re.sub(r'[^0-9a-zA-Z_]', '_', os.path.splitext(os.path.basename(path))[0])
        x, y, w, h = union_box(path)
        rows.append((name, x, y, w, h))
    lines = [
        '// ⚠ 이 파일은 `scripts/build-item-art-trim.py`가 만든다 — 손으로 고치지 않는다.',
        '// 장착 칸 아이콘용 `public/assets/item-art/*.png`(5칸 아틀라스, 한 칸 174×290)의 **내용 합집합 상자**',
        '// [x, y, w, h]다. 칸 아이콘은 이 상자만 칸에 꽉 차게 그려 빈 여백 때문에 물건이 작아 보이지 않게 한다.',
        f'export const itemArtColumns = {COLUMNS};',
        f'export const itemArtCell = {{ width: {CELL_W}, height: {CELL_H} }} as const;',
        'export const itemArtTrim: Record<string, readonly [number, number, number, number]> = {',
    ]
    for name, x, y, w, h in rows:
        lines.append(f"  {name}: [{x}, {y}, {w}, {h}],")
    lines.append('};')
    lines.append('')
    with open(OUT, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))
    print(f'{len(rows)}개 아틀라스 상자 → {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
