#!/usr/bin/env python3
"""궁수 기본 시트 6장을 승인된 원본 그림에서 만든다.

입력(워크스페이스 `downloads/archer_preview/`):
    male_1.png / female_1.png            서기 1장
    male_walk.png / female_walk.png      걷기 4프레임 가로 스트립
    male_attack.png / female_attack.png  활 사격 4프레임 가로 스트립

출력(`public/assets/pilot-25d/`):
    archer_{male,female}_{idle,walk,attack}_v1.png

전사 기준 시트(`warrior_*_v1.png`)와 같은 셀 좌표계를 쓴다:
    서기   362×362,  몸 높이 337px, 발끝 y=353, 중심 x=181
    걷기   1448×362 (362px 셀 4개), 몸 높이 300px, 발끝 y=329
    공격   1448×362 (362px 셀 4개), 몸 높이 270px, 발끝 y=348

원본은 순수 검정 배경이라 휘도로 알파를 만든다(어두운 가죽의 내부는 살린다).
망토가 옆 인물과 닿아 있는 스트립은 가장 좁은 세로 틈에서 잘라 프레임을 나눈다.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/workspace/downloads/archer_preview')
OUTPUT = ROOT / 'public/assets/pilot-25d'

CELL = 362
CENTER_X = 181
SPEC = {
    'idle': {'file': '{}_1.png', 'cells': 1, 'height': 337, 'foot': 353},
    'walk': {'file': '{}_walk.png', 'cells': 4, 'height': 300, 'foot': 329},
    'attack': {'file': '{}_attack.png', 'cells': 4, 'height': 270, 'foot': 348},
}
# 검정 배경 키잉: 이 값 아래는 투명, 위로 갈수록 불투명(가장자리 계단 완화).
ALPHA_LOW, ALPHA_HIGH = 5, 26


def keyed(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    alpha[lum <= ALPHA_LOW] = 0
    return np.dstack([rgb, alpha]).astype(np.uint8)


def split_mask(mask: np.ndarray, cells: int) -> np.ndarray:
    """닿아 있는 인물들을 가장 좁은 세로 틈에서 끊는다."""
    if cells <= 1:
        return mask
    width = mask.shape[1]
    occupancy = mask.sum(axis=0)
    cut = mask.copy()
    for index in range(1, cells):
        center = round(index * width / cells)
        low, high = max(2, center - 90), min(width - 2, center + 90)
        spot = low + int(np.argmin(occupancy[low:high]))
        cut[:, spot - 1:spot + 2] = 0
    return cut


def figures(image: np.ndarray, cells: int) -> list[tuple[np.ndarray, float, int]]:
    """프레임마다 (알파가 살아 있는 그림, 중심x, 바닥y)를 돌려준다."""
    alpha = image[:, :, 3]
    mask = split_mask((alpha > 8).astype('uint8'), cells)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    width = image.shape[1]
    groups: list[list[int]] = [[] for _ in range(cells)]
    for component in range(1, count):
        if stats[component, cv2.CC_STAT_AREA] < 120:
            continue
        column = min(cells - 1, int(centroids[component][0] * cells / width))
        groups[column].append(component)
    parts = []
    for group in groups:
        if not group:
            raise SystemExit('빈 프레임이 나왔습니다. 원본 스트립을 확인하세요.')
        keep = np.isin(labels, group)
        rows, columns = np.nonzero(keep)
        top, bottom = int(rows.min()), int(rows.max())
        left, right = int(columns.min()), int(columns.max())
        crop = image[top:bottom + 1, left:right + 1].copy()
        crop[:, :, 3] = np.where(keep[top:bottom + 1, left:right + 1], crop[:, :, 3], 0)
        parts.append((crop, (left + right) / 2, bottom))
    return parts


def build(gender: str) -> None:
    for motion, spec in SPEC.items():
        image = keyed(SOURCE / spec['file'].format(gender))
        parts = figures(image, spec['cells'])
        reference = float(np.median([part[0].shape[0] for part in parts]))
        scale = spec['height'] / reference
        sheet = Image.new('RGBA', (CELL * spec['cells'], CELL), (0, 0, 0, 0))
        for index, (crop, center, _) in enumerate(parts):
            drawn = Image.fromarray(crop, 'RGBA')
            drawn = drawn.resize((max(1, round(drawn.width * scale)), max(1, round(drawn.height * scale))), Image.LANCZOS)
            x = round(index * CELL + CENTER_X - drawn.width / 2)
            y = round(spec['foot'] - drawn.height)
            sheet.alpha_composite(drawn, (x, y))
        path = OUTPUT / f'archer_{gender}_{motion}_v1.png'
        sheet.save(path, optimize=True)
        alpha = np.asarray(sheet)[:, :, 3]
        heights = []
        for index in range(spec['cells']):
            rows, _ = np.nonzero(alpha[:, index * CELL:(index + 1) * CELL] > 8)
            heights.append(int(rows.max() - rows.min() + 1) if len(rows) else 0)
        print(f'{path.name}: {sheet.size[0]}×{sheet.size[1]} · 셀 높이 {heights} · {path.stat().st_size // 1024}KB')


if __name__ == '__main__':
    for gender in ('male', 'female'):
        build(gender)
