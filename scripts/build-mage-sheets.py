#!/usr/bin/env python3
"""마법사 기본 시트 6장을 승인된 원본 그림에서 만든다.

입력(워크스페이스 `downloads/mage_preview/`):
    male_3.png / female_3.png            서기 1장
    male_walk.png / female_walk.png      걷기 4프레임 가로 스트립
    male_attack.png / female_attack.png  시전 4프레임 가로 스트립

출력(`public/assets/pilot-25d/`):
    mage_{male,female}_{idle,walk,attack}_v1.png

전사·궁수 기준 시트와 같은 셀 좌표계를 쓴다:
    서기   362×362,  몸 높이 337px, 발끝 y=353, 중심 x=181
    걷기   1448×362 (362px 셀 4개), 몸 높이 300px, 발끝 y=329
    공격   1448×362 (362px 셀 4개), 몸 높이 270px, 발끝 y=348

원본은 순수 검정 배경이라 휘도로 알파를 만든다(어두운 로브의 내부는 살린다).
마법사 스트립은 지팡이·마법 광채가 옆 칸까지 뻗지만 인물끼리 닿지는 않는다. 그래서
세로줄로 자르지 않고, 큰 덩어리(인물 본체)를 x 순서로 frame 0..3 에 놓고 작은 덩어리
(떨어진 장화·손의 마법 구슬)를 상자 겹침이 가장 큰 본체에 붙인다. 인물끼리 실제로
닿아 본체가 합쳐진 스트립은 가장 좁은 틈에서 자르는 방식으로 돌아간다.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/workspace/downloads/mage_preview')
OUTPUT = ROOT / 'public/assets/pilot-25d'

CELL = 362
CENTER_X = 181
SPEC = {
    'idle': {'file': '{}_3.png', 'cells': 1, 'height': 337, 'foot': 353},
    'walk': {'file': '{}_walk.png', 'cells': 4, 'height': 300, 'foot': 329},
    'attack': {'file': '{}_attack.png', 'cells': 4, 'height': 270, 'foot': 348},
}
# 작업 204: 서기(idle)만 승인 원본에서 **정수리~발끝**을 직접 잰 값으로 배율을 고정한다.
# `body_height()`는 발끝 무게중심 ±34px 띠에서 처음 만나는 픽셀을 정수리로 보는데, 마법사 남성은
# 발끝(부츠)이 머리 중심에서 크게 벗어나 있어 어깨를 정수리로 오인했다(943px). 그 결과 서기 본체가
# 의도(337px)보다 17% 크게 그려져 정수리가 셀 위로 잘리고, 걷기(300px)·공격(270px)과 크기가 어긋났다.
# 남성은 정수리 74행(정수리 머리카락 끝)~발끝 1202행 = 1129px, 여성은 지팡이 끝이 정수리보다 높아
# 기존 승인 배율(1053px)을 그대로 유지한다(여성 서기는 정상 렌더).
IDLE_BODY_PX = {'male': 1129, 'female': 1053}
# 검정 배경 키잉: 이 값 아래는 투명, 위로 갈수록 불투명(가장자리 계단 완화).
ALPHA_LOW, ALPHA_HIGH = 5, 26
MIN_AREA = 120


def keyed(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    alpha[lum <= ALPHA_LOW] = 0
    return np.dstack([rgb, alpha]).astype(np.uint8)


def connected(mask: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    found = []
    for index in range(1, count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        if area < MIN_AREA:
            continue
        left, top = int(stats[index, cv2.CC_STAT_LEFT]), int(stats[index, cv2.CC_STAT_TOP])
        right, bottom = left + int(stats[index, cv2.CC_STAT_WIDTH]), top + int(stats[index, cv2.CC_STAT_HEIGHT])
        found.append({'index': index, 'area': area, 'box': (left, right, top, bottom), 'cx': float(centroids[index][0])})
    return labels, found


def split_mask(mask: np.ndarray, cells: int) -> np.ndarray:
    """닿아 있는 인물들을 가장 좁은 세로 틈에서 끊는다(본체가 합쳐진 스트립 전용)."""
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


def overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> int:
    return max(0, min(a[1], b[1]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[2], b[2]))


def gap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    dx = max(0, max(a[0], b[0]) - min(a[1], b[1]))
    dy = max(0, max(a[2], b[2]) - min(a[3], b[3]))
    return float(np.hypot(dx, dy))


def parts_of(image: np.ndarray, labels: np.ndarray, groups: list[list[dict]]) -> list[tuple[np.ndarray, float, int]]:
    parts = []
    for items in groups:
        if not items:
            raise SystemExit('빈 프레임이 나왔습니다. 원본 스트립을 확인하세요.')
        keep = np.isin(labels, [item['index'] for item in items])
        rows, columns = np.nonzero(keep)
        top, bottom = int(rows.min()), int(rows.max())
        left, right = int(columns.min()), int(columns.max())
        crop = image[top:bottom + 1, left:right + 1].copy()
        crop[:, :, 3] = np.where(keep[top:bottom + 1, left:right + 1], crop[:, :, 3], 0)
        parts.append((crop, (left + right) / 2, bottom))
    return parts


def figures(image: np.ndarray, cells: int) -> list[tuple[np.ndarray, float, int]]:
    """프레임마다 (알파가 살아 있는 그림, 중심x, 바닥y)를 돌려준다."""
    alpha = image[:, :, 3]
    mask = (alpha > 8).astype('uint8')
    labels, found = connected(mask)
    mains = sorted(sorted(found, key=lambda item: -item['area'])[:cells], key=lambda item: item['cx'])
    # 본체가 옆 칸까지 넓게 걸치면(인물끼리 닿아 한 덩어리) 세로줄로 자르는 방식으로 돌아간다.
    width = image.shape[1] / cells
    merged = len(mains) < cells or any(
        main['box'][1] - main['box'][0] > width * 1.7 for main in mains)
    if merged:
        labels, found = connected(split_mask(mask, cells))
        mains = sorted(sorted(found, key=lambda item: -item['area'])[:cells], key=lambda item: item['cx'])
        if len(mains) < cells:
            raise SystemExit('프레임 본체를 찾지 못했습니다. 원본 스트립을 확인하세요.')
    groups: list[list[dict]] = [[main] for main in mains]
    owner_of = {main['index']: position for position, main in enumerate(mains)}
    for item in found:
        if item['index'] in owner_of:
            continue
        owner = max(range(len(mains)), key=lambda position: (overlap(item['box'], mains[position]['box']), -gap(item['box'], mains[position]['box'])))
        groups[owner].append(item)
    return parts_of(image, labels, groups)


def body_height(crop: np.ndarray) -> int:
    """그림 안에서 머리끝~발끝 높이를 잰다(지팡이가 머리보다 위로 솟아도 본체만 센다).

    발끝 근처 행의 가로 중심을 본체 중심으로 보고, 그 중심 ±34px 안에서 위에서 처음
    만나는 픽셀을 머리끝으로 본다. 지팡이·마법 광채는 몸 중심에서 떨어져 있어 제외된다.
    """
    alpha = crop[:, :, 3] > 24
    rows = np.nonzero(alpha.any(axis=1))[0]
    if not len(rows):
        return crop.shape[0]
    bottom = int(rows[-1])
    band = alpha[max(0, bottom - 8):bottom + 1]
    columns = np.nonzero(band.any(axis=0))[0]
    center = int((columns.min() + columns.max()) / 2)
    low, high = max(0, center - 34), min(alpha.shape[1], center + 35)
    for row in range(int(rows[0]), bottom):
        if alpha[row, low:high].sum() >= 6:
            return bottom - row + 1
    return bottom - int(rows[0]) + 1


def build(gender: str) -> None:
    for motion, spec in SPEC.items():
        image = keyed(SOURCE / spec['file'].format(gender))
        parts = figures(image, spec['cells'])
        reference = float(np.median([body_height(part[0]) for part in parts]))
        if motion == 'idle':
            reference = float(IDLE_BODY_PX[gender])
        scale = spec['height'] / reference
        sheet = Image.new('RGBA', (CELL * spec['cells'], CELL), (0, 0, 0, 0))
        for index, (crop, _center, _bottom) in enumerate(parts):
            drawn = Image.fromarray(crop, 'RGBA')
            drawn = drawn.resize((max(1, round(drawn.width * scale)), max(1, round(drawn.height * scale))), Image.LANCZOS)
            x = round(index * CELL + CENTER_X - drawn.width / 2)
            y = round(spec['foot'] - drawn.height)
            sheet.alpha_composite(drawn, (x, y))
        path = OUTPUT / f'mage_{gender}_{motion}_v1.png'
        sheet.save(path, optimize=True)
        alpha = np.asarray(sheet)[:, :, 3]
        heights = []
        for index in range(spec['cells']):
            rows, _ = np.nonzero(alpha[:, index * CELL:(index + 1) * CELL] > 8)
            heights.append(int(rows.max() - rows.min() + 1) if len(rows) else 0)
        bodies = [body_height(np.asarray(sheet)[:, index * CELL:(index + 1) * CELL]) for index in range(spec['cells'])]
        print(f'{path.name}: {sheet.size[0]}×{sheet.size[1]} · 셀 높이 {heights} · 본체 {bodies} · {path.stat().st_size // 1024}KB')


if __name__ == '__main__':
    for gender in ('male', 'female'):
        build(gender)
