#!/usr/bin/env python3
"""DJRPG 코스튬 아틀라스 v3 빌더 — [작업 143].

`docs/COSTUME_SYSTEM.md` §7.2 배치 규약(셀 234×242, 페이지 2048×2048 8×8=64칸,
변형당 32칸, 프레임 슬롯 idle 0 · walk 1–8 · attack 9–12 · slash 13–16 · spin 17–22 ·
smash 23–26 · cast 27–29)으로 `public/assets/costume/v3/`의 매니페스트와 아틀라스
페이지를 만든다.

제작 방식(§6.3·§7.5): 새 그림을 그리지 않고 `public/assets/`의 기존 2.5D 프리렌더 시트를
재료로 쓴다. 성별·모션별로 원본 시트를 같은 규칙(본체 높이 190px, 실루엣 경계 상자 중심 x ·
발끝 y)으로 셀에 앉힌 뒤 장비 레이어를 뽑는다.

v3에서 고친 것(2026-11-19 실기 버그 3건):
  1. **투구 레이어 = 머리만**. v2는 갑옷 셀의 위쪽 띠(`HEAD_BAND`)를 통째로 투구 레이어에
     넣어 어깨·몸통 갑주 파편이 함께 그려졌고, 갑옷 시트와의 픽셀 차이도 캔버스 전체에서
     따서 다리 파편까지 섞였다. v3는 (a) 얼굴 상관(NCC)으로 찾은 머리 위치 기준의 좁은 창
     안에서만 차이를 뜨고, (b) 그 창의 알파를 지워 머리 밖 픽셀을 전부 없앤다.
  2. **투구 2D 정렬**. v2는 x 이동만 맞춰(`head_align`) 맨몸+투구에서 머리 높낮이가
     어긋났다. v3는 투구 시트를 갑옷 시트 좌표로 (dx, dy) 정렬한 뒤, 맨몸용 투구는 다시
     **맨몸 얼굴 위치**로 옮겨 별도 페이지(`helmet-body-<성별>`)에 넣는다. 갑옷을 입지
     않은 조합은 렌더러가 그 페이지를 쓴다(§7.5).
  3. **크롭 경계 잔여물 제거**. 원본 210×210 공격 컷에는 이웃 포즈의 잘린 발·칼끝 조각이
     섞여 있다. 알파 연결 요소 중 가장 큰 덩어리만 남겨(`clean_fragments`) 셀 안에 남는
     파편을 없앤다. 공격 계열 칸은 공격 시트에 이미 검이 그려져 있어 `weapon` 레이어를
     비우고, `cast`도 공격 포즈만 써서 무기가 프레임 중간에 사라졌다 나타나지 않게 한다.

색 변형은 `appearance.ts`의 팔레트 색조를 휘도 램프로 입히고 피부·얼굴·머리카락 픽셀은
원본을 유지한다(작업 135 품질 가드와 같은 규칙). 무기·문장은 필드 폴백과 같은 아이콘
아트(`wearable/weapons.png`, `item-art/offhand_0.png`)를 쓴다.

실행: `python3 scripts/build-costume-atlas.py` (`--preview`는 검수용 접촉 시트만 만든다)
검수: `python3 scripts/costume-contact-sheet.py --version 3` (배포본 아틀라스를 게임과
같은 순서로 합성한 접촉 시트)
"""

from __future__ import annotations

import argparse
import json
import math
import os

from PIL import Image, ImageFilter

CELL_W, CELL_H = 234, 242
BODY_PX = 190                      # heroScale.ts costumeBodyPx
PIVOT_X, PIVOT_Y = CELL_W * 0.5, CELL_H * 0.96
BODY_TOP = PIVOT_Y - BODY_PX
COLUMNS, ROWS = 8, 8
VARIANT_STRIDE = 32

MOTION_SLOTS = {'idle': 1, 'walk': 8, 'attack': 4, 'slash': 4, 'spin': 6, 'smash': 4, 'cast': 3}
MOTION_ORDER = ['idle', 'walk', 'attack', 'slash', 'spin', 'smash', 'cast']

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'public', 'assets')
OUT = os.path.join(ASSETS, 'costume', 'v3')

# ── 팔레트 (src/game/appearance.ts의 armorPalettes·helmetPalettes와 같은 색) ──────
ARMOR_PALETTES = [
    ('leather', (0x8a, 0x5a, 0x32), .58), ('studded', (0x6f, 0x5a, 0x24), .56),
    ('chain', (0x8d, 0x94, 0x9c), .38), ('steel', (0x9b, 0xa4, 0xad), 0.0),
    ('blueSteel', (0x5d, 0x7f, 0xa6), .48), ('mithril', (0xb9, 0xd3, 0xe6), .42),
    ('obsidian', (0x3a, 0x2b, 0x52), .58), ('dragon', (0x8f, 0x1f, 0x22), .58),
    ('paladin', (0xc9, 0xa6, 0x3a), .55), ('overlord', (0x5e, 0x2a, 0x6b), .58),
]
HELMET_PALETTES = [
    ('leather', (0x8a, 0x5a, 0x32), .58), ('iron', (0x7d, 0x7f, 0x83), .42),
    ('chain', (0x8d, 0x94, 0x9c), .38), ('steel', (0x9b, 0xa4, 0xad), 0.0),
    ('blueSteel', (0x5d, 0x7f, 0xa6), .48), ('mithril', (0xb9, 0xd3, 0xe6), .42),
    ('dragonScale', (0x2f, 0x6b, 0x45), .55), ('abyss', (0x33, 0x26, 0x5a), .58),
    ('valkyrie', (0xdf, 0xe6, 0xee), .40), ('immortal', (0xd4, 0xaf, 0x37), .55),
]
GLOVES_PALETTES = [
    ('cloth', (0x8c, 0x87, 0x76), .30), ('leather', (0x8a, 0x5a, 0x32), .50),
    ('chain', (0x8d, 0x94, 0x9c), .38), ('steel', (0x9b, 0xa4, 0xad), 0.0),
    ('knight', (0x7f, 0x92, 0xa8), .40), ('mithril', (0xb9, 0xd3, 0xe6), .42),
    ('blood', (0x8f, 0x1f, 0x22), .50), ('dragonScale', (0x2f, 0x6b, 0x45), .50),
    ('titan', (0x4d, 0x4f, 0x57), .44), ('abyss', (0x33, 0x26, 0x5a), .52),
]
BOOTS_PALETTES = [
    ('worn', (0x6b, 0x50, 0x35), .36), ('leather', (0x8a, 0x5a, 0x32), .50),
    ('chain', (0x8d, 0x94, 0x9c), .38), ('steel', (0x9b, 0xa4, 0xad), 0.0),
    ('knight', (0x7f, 0x92, 0xa8), .40), ('mithril', (0xb9, 0xd3, 0xe6), .42),
    ('wind', (0x7c, 0xb2, 0x9c), .42), ('dragonScale', (0x2f, 0x6b, 0x45), .50),
    ('storm', (0x5d, 0x70, 0x8c), .44), ('immortal', (0xd4, 0xaf, 0x37), .50),
]

HANDS_BAND = (0.38, 0.66)     # 손 후보 구간(그 안의 피부 덩어리만 장갑으로 쓴다)
FEET_BAND = (0.87, 1.0)       # 발목 아래(신발)

# 투구 창(얼굴 중심 기준 픽셀). 머리 밖 픽셀은 이 창 밖이라 아예 남지 않는다.
HELMET_WINDOW = {'half_width': 46, 'up': 36, 'down': 28}
# 크롭 경계 파편 제거: 가장 큰 덩어리 대비 이 비율보다 작은 알파 섬은 버린다.
FRAGMENT_RATIO = .25
# 얼굴 상관(NCC) 최소 신뢰도. 이보다 낮으면 다른 아트 계열로 보고 실루엣 정렬로 대체한다.
FACE_MIN_SCORE = .62
# 맨몸 셀에서 실루엣 꼭대기(머리카락 위)에서 얼굴 중심까지 거리(px). 여성은 묶은 머리가 높다.
FACE_CENTER_OFFSET = {'male': 18, 'female': 27}

# 공격 프레임은 검을 머리 위로 올린 포즈라 실루엣 상단이 머리가 아니다(무기를 뺄 수 없다).
# 갑옷 시트 머리 위치에서 맨몸 시트 머리 위치까지의 이동량(px)을 2026-11-19 접촉 시트로
# 재서 고정한다. 서기·걷기는 실루엣 상단 중심으로 자동 계산하고, 여기 없는 프레임도 그 값이다.
# (갑옷 셀 얼굴 중심, 맨몸 셀 얼굴 중심) px.
# 자동 상관이 빗나가는 프레임만 눈으로 잰 값으로 덮는다(2026-11-19 접촉 시트 검수).
HEAD_BODY_ATTACK_OVERRIDE = {('female', 1): (117, 58), ('female', 2): (102, 88)}
# 맨몸 공격 프레임 머리 기준: 남성은 얼굴 상관, 여성은 머리 패치 상관.
BODY_ATTACK_HEAD_SOURCE = {'male': 'face-ncc', 'female': 'head-ncc'}
HEAD_ATTACK = {
    ('male', 0): ((112, 82), (137, 62)),
    ('male', 1): ((130, 70), (105, 58)),
    ('male', 2): ((117, 80), (72, 62)),
    ('male', 3): ((180, 95), (145, 66)),
    ('female', 0): ((105, 55), (125, 55)),
    ('female', 1): ((100, 55), (117, 60)),
    ('female', 2): ((105, 65), (118, 62)),
    ('female', 3): ((100, 65), (120, 75)),
}


def asset(*parts: str) -> str:
    return os.path.join(ASSETS, *parts)


def load(path: str) -> Image.Image:
    return Image.open(path).convert('RGBA')


def sheet_frames(path: str, cols: int, rows: int) -> list[Image.Image]:
    image = load(path)
    fw, fh = image.width // cols, image.height // rows
    return [image.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
            for r in range(rows) for c in range(cols)]


def row_frames(path: str, count: int) -> list[Image.Image]:
    image = load(path)
    fw = image.width / count
    return [image.crop((round(i * fw), 0, round((i + 1) * fw), image.height)) for i in range(count)]


def alpha_mask(cell: Image.Image):
    import numpy as np
    return np.array(cell.split()[3]) > 40


def components(mask, min_area: int = 1) -> list[tuple[int, int, int, int, int]]:
    """알파 연결 요소 (면적, x0, y0, x1, y1) 목록. 큰 것부터."""
    import numpy as np
    try:
        import cv2
    except ImportError:
        cv2 = None
    if cv2 is not None:
        count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype('uint8'), 8, cv2.CV_32S)
        out = []
        for index in range(1, count):
            area = int(stats[index, cv2.CC_STAT_AREA])
            if area < min_area:
                continue
            x0 = int(stats[index, cv2.CC_STAT_LEFT])
            y0 = int(stats[index, cv2.CC_STAT_TOP])
            out.append((area, x0, y0, x0 + int(stats[index, cv2.CC_STAT_WIDTH]) - 1,
                        y0 + int(stats[index, cv2.CC_STAT_HEIGHT]) - 1))
        out.sort(reverse=True)
        return out
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out: list[tuple[int, int, int, int, int]] = []
    for start_y in range(height):
        row = mask[start_y]
        for start_x in range(width):
            if not row[start_x] or seen[start_y, start_x]:
                continue
            stack = [(start_y, start_x)]
            seen[start_y, start_x] = True
            area = 0
            x0 = x1 = start_x
            y0 = y1 = start_y
            while stack:
                y, x = stack.pop()
                area += 1
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if area >= min_area:
                out.append((area, x0, y0, x1, y1))
    out.sort(reverse=True)
    return out


def component_labels(mask):
    """cv2 연결 요소 라벨(없으면 None). 픽셀 단위로 덩어리를 골라내는 데 쓴다."""
    try:
        import cv2
    except ImportError:
        return None
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype('uint8'), 8, cv2.CV_32S)
    return labels, stats, count


def fill_holes(mask):
    """테두리에서 닿지 않는 빈 칸을 채운다(투구 안쪽 얼굴 구멍 메우기)."""
    import numpy as np
    try:
        import cv2
    except ImportError:
        cv2 = None
    if cv2 is not None:
        padded = np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), dtype='uint8')
        padded[1:-1, 1:-1] = mask.astype('uint8')
        flood = padded.copy()
        cv2.floodFill(flood, np.zeros((padded.shape[0] + 2, padded.shape[1] + 2), dtype='uint8'), (0, 0), 1)
        filled = (~(flood[1:-1, 1:-1].astype(bool))) | mask.astype(bool)
        return filled
    height, width = mask.shape
    outside = np.zeros_like(mask, dtype=bool)
    stack: list[tuple[int, int]] = []
    for x in range(width):
        for y in (0, height - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                stack.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                stack.append((y, x))
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    return ~outside


def clean_fragments(image: Image.Image, ratio: float = FRAGMENT_RATIO) -> Image.Image:
    """크롭 경계에 섞여 들어온 이웃 포즈 조각(잘린 발·칼끝)을 지운다.

    210×210 공격 컷은 옆 포즈의 일부가 알파 섬으로 남아 있다(실측: 최대 17% 크기).
    가장 큰 덩어리만 남기면 본체·검은 그대로 두고 파편만 사라진다.
    """
    import numpy as np
    mask = alpha_mask(image)
    blobs = components(mask, 1)
    if len(blobs) <= 1:
        return image
    largest = blobs[0][0]
    labelled = component_labels(mask)
    keep = np.zeros_like(mask)
    if labelled is None:
        keep = mask.copy()
    else:
        labels, stats, count = labelled
        import cv2
        for index in range(1, count):
            if int(stats[index, cv2.CC_STAT_AREA]) < largest * ratio:
                continue
            keep |= labels == index
    out = image.copy()
    arr = np.array(out)
    arr[..., 3] = np.where(keep, arr[..., 3], 0)
    return Image.fromarray(arr, 'RGBA')


def to_cell(image: Image.Image, body_px: float) -> Image.Image:
    """본체 높이를 `BODY_PX`에 맞추고 실루엣 중심 x · 발끝 y를 셀 피벗에 둔다.

    시트마다 캔버스 여백이 달라 프레임 중심을 쓰면 캐릭터가 좌우로 밀린다. 실루엣 경계
    상자 중심을 쓰면 서로 다른 시트(맨몸/갑옷/투구)가 같은 자리에 놓인다(실측 오차 ≤ 10px).
    """
    scale = BODY_PX / float(body_px)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    alpha = resized.split()[3]
    box = alpha.getbbox()
    if not box:
        return Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    centre_x = (box[0] + box[2]) / 2
    cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.alpha_composite(resized, (round(PIVOT_X - centre_x), round(PIVOT_Y - box[3])))
    return cell


def band_rows(y0: float, y1: float) -> tuple[int, int]:
    return max(0, int(BODY_TOP + BODY_PX * y0)), min(CELL_H, int(math.ceil(BODY_TOP + BODY_PX * y1)))


def crop_band(cell: Image.Image, y0: float, y1: float) -> Image.Image:
    """셀에서 높이 구간만 남기고 나머지 알파를 지운다(위치는 그대로)."""
    import numpy as np
    top, bottom = band_rows(y0, y1)
    out = cell.copy()
    arr = np.array(out)
    band = np.zeros(arr.shape[:2], dtype=bool)
    band[top:bottom] = True
    arr[..., 3] = np.where(band, arr[..., 3], 0)
    return Image.fromarray(arr, 'RGBA')


def is_skin(r, g, b):
    """피부·얼굴 보존 판정(작업 135 품질 가드와 같은 규칙). numpy 배열도 받는다."""
    import numpy as np
    r, g, b = np.asarray(r, dtype='float32'), np.asarray(g, dtype='float32'), np.asarray(b, dtype='float32')
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    lum = .299 * r + .587 * g + .114 * b
    safe = np.where(hi > 0, hi, 1)
    sat = (hi - lo) / safe
    hue = np.where(hi == r, np.where(hi - lo > 0, 60 * (g - b) / np.maximum(hi - lo, 1e-6), 0),
                   np.where(hi == g, 60 * (2 + (b - r) / np.maximum(hi - lo, 1e-6)),
                            60 * (4 + (r - g) / np.maximum(hi - lo, 1e-6))))
    ok = (lo < hi) & (lum >= 60) & (lum <= 245) & (sat >= .12) & (sat <= .60) & (r > g) & (g > b) & (r - b > 18) & (hue >= 8) & (hue <= 46)
    return ok


def tint(cell: Image.Image, colour: tuple[int, int, int], strength: float) -> Image.Image:
    """금속·가죽 픽셀에 팔레트 색조를 입히고 피부·외곽선·하이라이트는 보존한다."""
    if strength <= 0:
        return cell.copy()
    import numpy as np
    arr = np.array(cell).astype('float32')
    rgb, alpha = arr[..., :3], arr[..., 3]
    lum = (.299 * rgb[..., 0] + .587 * rgb[..., 1] + .114 * rgb[..., 2]) / 255.0
    skin = is_skin(rgb[..., 0], rgb[..., 1], rgb[..., 2])
    keep = skin | (lum < .10) | (lum > .96) | (alpha < 8)
    shade = .30 + .95 * lum
    spec = np.clip((lum - .70) / .30, 0, None) ** 2 * .45
    target = np.stack([np.minimum(255.0, colour[i] * shade + 255 * spec) for i in range(3)], axis=-1)
    k = (strength * np.where(lum > .22, 1.0, .6))[..., None]
    mixed = rgb + (target - rgb) * k
    out = arr.copy()
    out[..., :3] = np.where(keep[..., None], rgb, mixed)
    return Image.fromarray(np.clip(out, 0, 255).astype('uint8'), 'RGBA')


def hands_only(cell: Image.Image) -> Image.Image:
    """손 구간의 피부 덩어리 **주변 상자**만 남긴 장갑 조각.

    v2는 손 구간 띠 전체를 잘라 가죽 갑주(피부색과 같은 갈색)까지 들어와 갑옷 없이 낄 때
    배·허벅지에 갑주 판이 붙었다. v3는 피부 덩어리를 찾아 그 상자(±8px)만 남긴다.
    """
    import numpy as np
    top, bottom = band_rows(*HANDS_BAND)
    arr = np.array(cell)
    skin = is_skin(arr[..., 0].astype('float32'), arr[..., 1].astype('float32'), arr[..., 2].astype('float32'))
    skin = skin & (arr[..., 3] > 60)
    band = np.zeros(arr.shape[:2], dtype=bool)
    band[top:bottom] = True
    blobs = [b for b in components(skin & band, 45) if 7 <= b[3] - b[1] <= 34 and 7 <= b[4] - b[2] <= 34]
    mask = np.zeros(arr.shape[:2], dtype=bool)
    for _area, x0, y0, x1, y1 in blobs[:2]:
        mask[max(0, y0 - 8):y1 + 9, max(0, x0 - 8):x1 + 9] = True
    mask &= band
    if not mask.any():
        return Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    soft = Image.fromarray((mask * 255).astype('uint8'), 'L').filter(ImageFilter.GaussianBlur(.8))
    out = cell.copy()
    out.putalpha(Image.composite(cell.split()[3], Image.new('L', (CELL_W, CELL_H), 0), soft))
    return out


def shift_cell(cell: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    out.alpha_composite(cell, (dx, dy))
    return out


def ncc_map(image, template):
    """정규화 상호상관 점수 맵. `image`·`template`은 H×W×3 float 배열."""
    import numpy as np
    try:
        import cv2
    except ImportError:
        cv2 = None
    th, tw = template.shape[:2]
    if image.shape[0] < th or image.shape[1] < tw:
        return None, th, tw
    if cv2 is not None:
        scores = cv2.matchTemplate(image.astype('float32'), template.astype('float32'), cv2.TM_CCOEFF_NORMED)
        return scores, th, tw
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(image, (th, tw, 3))[:, :, 0]
    centred = win - win.mean(axis=(2, 3, 4), keepdims=True)
    base = template - template.mean()
    numerator = (centred * base).sum(axis=(2, 3, 4))
    denominator = np.sqrt((centred * centred).sum(axis=(2, 3, 4))) * np.sqrt((base * base).sum())
    with np.errstate(divide='ignore', invalid='ignore'):
        scores = numerator / denominator
    return np.nan_to_num(scores, nan=-1.0), th, tw


def face_anchor(cell: Image.Image, template) -> tuple[tuple[float, float], float]:
    """얼굴 상관으로 찾은 머리 중심 (cx, cy)와 상관값.

    상관값이 비슷한 후보가 여러 개면(손·칼자루도 얼굴과 비슷하게 걸린다) 그림의
    상단 중앙에 가장 가까운 후보를 고른다 — 머리는 항상 거기 있다.
    """
    import numpy as np
    scores, th, tw = ncc_map(np.array(cell).astype('float32')[..., :3], template)
    box = cell.split()[3].getbbox()
    if scores is None or box is None:
        box = box or (0, 0, CELL_W, CELL_H)
        return ((box[0] + box[2]) / 2, box[1] + 20), 0.0
    best = float(scores.max())
    ys, xs = np.where(scores >= best - .05)
    target_x = (box[0] + box[2]) / 2
    target_y = box[1] + 24
    distances = np.hypot((xs + tw / 2) - target_x, (ys + th / 2) - target_y)
    pick = int(np.argmin(distances))
    return (float(xs[pick] + tw / 2), float(ys[pick] + th / 2)), best


def align_cells(target: Image.Image, donor: Image.Image, limit: int = 22) -> tuple[int, int]:
    """실루엣 IoU가 가장 높아지는 이동량 — `shift_cell(donor)`가 `target`에 겹친다."""
    import numpy as np
    a = alpha_mask(target).astype('uint8')
    b = alpha_mask(donor).astype('uint8')
    best = (-1.0, 0, 0)
    for dy in range(-limit, limit + 1):
        for dx in range(-limit, limit + 1):
            shifted = np.zeros_like(b)
            ys0, ys1 = max(0, dy), min(CELL_H, CELL_H + dy)
            xs0, xs1 = max(0, dx), min(CELL_W, CELL_W + dx)
            if ys1 <= ys0 or xs1 <= xs0:
                continue
            shifted[ys0:ys1, xs0:xs1] = b[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
            intersection = ((a & shifted) > 0).sum()
            union = ((a | shifted) > 0).sum()
            if union and intersection / union > best[0]:
                best = (intersection / union, dx, dy)
    return best[1], best[2]


def tolerant_diff(a: Image.Image, b: Image.Image, threshold: int = 50):
    """1px 이웃까지 참아 주는 픽셀 차이(재렌더 잡음 제거)."""
    import numpy as np
    A = np.array(a).astype('int16')
    B = np.array(b).astype('int16')
    best = None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            shifted = np.full_like(B, 255)
            ys0, ys1 = max(0, dy), min(CELL_H, CELL_H + dy)
            xs0, xs1 = max(0, dx), min(CELL_W, CELL_W + dx)
            shifted[ys0:ys1, xs0:xs1] = B[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
            diff = np.abs(A - shifted).sum(axis=2)
            best = diff if best is None else np.minimum(best, diff)
    return best > threshold


# ── 원본 시트 표 (경로, 본체 높이 px, 프레임 수[, 'row']) ─────────────────────────
SOURCES = {
    'male': {
        'body': {
            'idle': (asset('warrior_male_base.png'), 189, 1),
            'walk': (asset('walk8_male_base.png'), 156, 8),
            'attack': ([asset(f'warrior_male_attack_{i}.png') for i in range(1, 5)], 163, 4),
        },
        'armor': {
            'idle': (asset('warrior_armored_nohelm_swordless.png'), 1445, 1),
            'walk': (asset('walk8_armored_nohelm_swordless.png'), 373, 8),
            'attack': ([asset(f'warrior_armored_nohelm_attack_{i}.png') for i in range(1, 5)], 150, 4),
        },
        'helm': {
            'idle': (asset('warrior_armored_swordless.png'), 1457, 1),
            'walk': (asset('walk8_armored_swordless.png'), 351, 8),
            'attack': ([asset(f'warrior_armored_attack_{i}.png') for i in range(1, 5)], 137, 4),
        },
    },
    'female': {
        'body': {
            'idle': (asset('warrior_female_base.png'), 189, 1),
            'walk': (asset('walk8_female_base.png'), 161, 8),
            'attack': ([asset(f'warrior_female_attack_{i}.png') for i in range(1, 5)], 154, 4),
        },
        'armor': {
            'idle': (asset('warrior_female_armored_nohelm_swordless.png'), 1369, 1),
            'walk': (asset('walk8_female_armored_nohelm_swordless.png'), 425, 8),
            'attack': ([asset('warrior_female_armored_attack.png')], 257, 4, 'row'),
        },
        'helm': {
            'idle': (asset('warrior_female_armored_helm_swordless.png'), 1381, 1),
            'walk': (asset('walk8_female_armored_helm_swordless.png'), 435, 8),
            'attack': ([asset('warrior_female_armored_helm_attack.png')], 263, 4, 'row'),
        },
    },
}

WEAPON_SHEET = asset('wearable', 'weapons.png')
OFFHAND_SHEET = asset('item-art', 'offhand_0.png')

# 손 위치: heroSockets.ts 값(필드 폴백과 같은 자리). walk 시트 프레임 177px 기준.
SOCKETS = {
    'male': {
        'idle': (.54, .44, .996),
        'walk': [(.59, .45, .95), (.60, .43, .95), (.61, .44, .95), (.60, .46, .95),
                 (.59, .45, .941), (.60, .43, .944), (.61, .44, .944), (.60, .46, .923)],
        'frame': 177, 'body': 156,
    },
    'female': {
        'idle': (.37, .49, .996),
        'walk': [(.51, .44, .95), (.52, .42, .948), (.53, .43, .95), (.52, .45, .944),
                 (.51, .44, .953), (.52, .42, .953), (.53, .43, .95), (.52, .45, .928)],
        'frame': 177, 'body': 161,
    },
}
SOCKET_ANCHOR = (.18, .82)

# 스킬 모션 4종은 기본 공격 포즈를 재배열해 채운다(전용 포즈는 후속 제작 과제).
# `cast`도 공격 포즈만 쓴다 — 서기(idle) 칸에는 무기 아이콘이 그려지므로 섞으면
# 시전 중에 무기가 나타났다 사라진다(v3).
MOTION_POSES = {
    'idle': [('idle', 0)],
    'walk': [('walk', i) for i in range(8)],
    'attack': [('attack', i) for i in range(4)],
    'slash': [('attack', i) for i in range(4)],
    'spin': [('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3), ('attack', 2), ('attack', 1)],
    'smash': [('attack', 3), ('attack', 2), ('attack', 1), ('attack', 0)],
    'cast': [('attack', 0), ('attack', 1), ('attack', 2)],
}

_POSE_CACHE: dict[tuple[str, str], dict[str, list[Image.Image]]] = {}
_FACE_CACHE: dict[str, object] = {}
_HELMET_CACHE: dict[tuple[str, str, int], tuple[Image.Image, Image.Image]] = {}


def poses(gender: str, kind: str) -> dict[str, list[Image.Image]]:
    key = (gender, kind)
    if key in _POSE_CACHE:
        return _POSE_CACHE[key]
    result: dict[str, list[Image.Image]] = {}
    for which in ('idle', 'walk', 'attack'):
        spec = SOURCES[gender][kind][which]
        paths, body_px, count = spec[0], spec[1], spec[2]
        row = len(spec) > 3 and spec[3] == 'row'
        if isinstance(paths, str):
            if count == 1:
                images = [load(paths)]
            elif count == 8:
                images = sheet_frames(paths, 4, 2)
            else:
                images = sheet_frames(paths, 2, 2)[:count]
        elif row:
            images = row_frames(paths[0], count)[:count]
        else:
            images = [load(p) for p in paths]
        # 원본 컷에 섞인 이웃 포즈 조각은 리샘플(LANCZOS) 뒤 알파가 이어질 수 있어
        # 셀에 앉힌 뒤 한 번 더 정리한다.
        result[which] = [clean_fragments(to_cell(clean_fragments(image), body_px)) for image in images]
    _POSE_CACHE[key] = result
    return result


def face_template(gender: str):
    """갑옷(투구 없음) 서기 셀의 얼굴 패치. 모든 셀의 머리 위치를 이 패치로 찾는다."""
    import numpy as np
    if gender in _FACE_CACHE:
        return _FACE_CACHE[gender]
    idle = poses(gender, 'armor')['idle'][0]
    arr = np.array(idle).astype('float32')
    skin = is_skin(arr[..., 0], arr[..., 1], arr[..., 2]) & (arr[..., 3] > 60)
    candidates = [b for b in components(skin, 30) if 6 <= b[3] - b[1] <= 32 and 6 <= b[4] - b[2] <= 32]
    candidates.sort(key=lambda b: b[2])
    if not candidates:
        raise RuntimeError(f'{gender}: 얼굴 패치를 찾지 못했습니다')
    _area, x0, y0, x1, y1 = candidates[0]
    patch = arr[max(0, y0 - 3):y1 + 4, max(0, x0 - 3):x1 + 4, :3].copy()
    _FACE_CACHE[gender] = patch
    return patch


def silhouette_head(cell: Image.Image) -> tuple[float, float]:
    """실루엣 상단 중심 = 머리 위치. 서기·걷기 맨몸 셀(무기 없음)에서만 그대로 머리다."""
    import numpy as np
    mask = alpha_mask(cell)
    rows = np.where(mask.any(axis=1))[0]
    top = int(rows.min())
    band = mask[top:top + 10]
    xs = np.where(band.any(axis=0))[0]
    cx = (xs.min() + xs.max()) / 2 if len(xs) else CELL_W / 2
    return float(cx), float(top)


_HEAD_TEMPLATE: dict[tuple[str, str], object] = {}


def head_template(gender: str, family: str):
    """서기 셀의 머리 패치(머리카락까지 포함). 같은 그림 계열 안에서 머리를 찾는 표본이다."""
    import numpy as np
    key = (gender, family)
    if key in _HEAD_TEMPLATE:
        return _HEAD_TEMPLATE[key]
    idle = poses(gender, family)['idle'][0]
    cx, top = silhouette_head(idle)
    arr = np.array(idle).astype('float32')[..., :3]
    x0 = int(max(0, cx - 17))
    y0 = int(max(0, top - 4))
    _HEAD_TEMPLATE[key] = arr[y0:y0 + 40, x0:x0 + 34].copy()
    return _HEAD_TEMPLATE[key]


def face_center_in_box(cell: Image.Image, box: tuple[float, float, float, float]) -> tuple[float, float]:
    """머리 상자 안의 피부 픽셀 무게 중심 = 얼굴 중심(투구 스프라이트와 같은 기준)."""
    import numpy as np
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(CELL_W, x1), min(CELL_H, y1)
    arr = np.array(cell).astype('float32')
    skin = is_skin(arr[..., 0], arr[..., 1], arr[..., 2]) & (arr[..., 3] > 60)
    skin[:y0] = False
    skin[y1:] = False
    skin[:, :x0] = False
    skin[:, x1:] = False
    ys, xs = np.where(skin)
    if len(xs) < 20:
        return (x0 + x1) / 2, (y0 + y1) / 2
    return float(xs.mean()), float(ys.mean())


def head_center(gender: str, which: str, index: int, body: bool = False) -> tuple[float, float]:
    """그려질 머리의 얼굴 중심. 같은 그림 계열의 머리 패치로 상자를 찾고 그 안의 피부를 잰다."""
    import numpy as np
    family = 'body' if body else 'armor'
    cell = poses(gender, family)[which][index]
    if body and which != 'attack':
        # 서기·걷기 맨몸 셀은 무기가 없어 실루엣 꼭대기가 곧 머리다.
        cx, top = silhouette_head(cell)
        return cx, top + FACE_CENTER_OFFSET[gender]
    template = head_template(gender, family)
    scores, th, tw = ncc_map(np.array(cell).astype('float32')[..., :3], template)
    y, x = np.unravel_index(np.argmax(scores), scores.shape)
    score = float(scores[y, x])
    if body and which == 'attack':
        # 맨몸 공격 셀은 검·팔이 머리 위로 올라와 머리 패치가 자주 빗나간다. 남성은 얼굴
        # 패치 상관(0.64~0.68)이 눈으로 확인한 자리와 일치해 그대로 쓰고, 여성은 상관값이
        # 낮아 눈으로 잰 표(`HEAD_ATTACK`)를 쓴다.
        if (gender, index) in HEAD_BODY_ATTACK_OVERRIDE:
            return HEAD_BODY_ATTACK_OVERRIDE[(gender, index)]
        if BODY_ATTACK_HEAD_SOURCE[gender] == 'table':
            return HEAD_ATTACK[(gender, index)][1]
        if BODY_ATTACK_HEAD_SOURCE[gender] == 'head-ncc':
            head_scores, hth, htw = ncc_map(np.array(cell).astype('float32')[..., :3], head_template(gender, family))
            hy, hx = np.unravel_index(np.argmax(head_scores), head_scores.shape)
            return face_center_in_box(cell, (hx, hy, hx + htw, hy + hth))
        face_scores, fth, ftw = ncc_map(np.array(cell).astype('float32')[..., :3], face_template(gender))
        fy, fx = np.unravel_index(np.argmax(face_scores), face_scores.shape)
        if float(face_scores[fy, fx]) >= FACE_MIN_SCORE:
            x, y, tw, th, score = fx, fy, ftw, fth, float(face_scores[fy, fx])
        else:
            return HEAD_ATTACK[(gender, index)][1]
    elif score < .52:
        return HEAD_ATTACK.get((gender, index), (CELL_W / 2, BODY_TOP + 30))[0 if not body else 1]
    return face_center_in_box(cell, (x, y, x + tw, y + th))


def raw_helmet(gender: str, which: str, index: int):
    """투구 시트에서 투구 껍데기만 뽑는다(갑옷 셀 좌표). (mask, placed, anchor)"""
    import numpy as np
    armor = poses(gender, 'armor')[which][index]
    helm = poses(gender, 'helm')[which][index]
    anchor = head_center(gender, which, index)
    dx, dy = align_cells(armor, helm)
    placed = shift_cell(helm, dx, dy)

    half, up, down = HELMET_WINDOW['half_width'], HELMET_WINDOW['up'], HELMET_WINDOW['down']
    window = np.zeros((CELL_H, CELL_W), dtype=bool)
    window[max(0, int(anchor[1] - up)):min(CELL_H, int(anchor[1] + down)),
           max(0, int(anchor[0] - half)):min(CELL_W, int(anchor[0] + half))] = True

    changed = tolerant_diff(placed, armor) & window & alpha_mask(placed)
    blobs = components(changed, 18)
    mask = np.zeros((CELL_H, CELL_W), dtype=bool)
    if not blobs:
        return mask, placed, anchor

    def distance(blob):
        _area, x0, y0, x1, y1 = blob
        dx_ = 0 if x0 <= anchor[0] <= x1 else min(abs(anchor[0] - x0), abs(anchor[0] - x1))
        dy_ = 0 if y0 <= anchor[1] <= y1 else min(abs(anchor[1] - y0), abs(anchor[1] - y1))
        return dx_ + dy_

    blobs.sort(key=lambda blob: (distance(blob), -blob[0]))
    main = blobs[0]
    labelled = component_labels(changed)
    if labelled is None:
        mask = changed.copy()
    else:
        labels, stats, count = labelled
        import cv2
        for index in range(1, count):
            x0 = int(stats[index, cv2.CC_STAT_LEFT])
            y0 = int(stats[index, cv2.CC_STAT_TOP])
            x1 = x0 + int(stats[index, cv2.CC_STAT_WIDTH]) - 1
            y1 = y0 + int(stats[index, cv2.CC_STAT_HEIGHT]) - 1
            if x0 <= main[3] + 1 and x1 >= main[1] - 1 and y0 <= main[4] + 1 and y1 >= main[2] - 1:
                mask |= labels == index
    # 투구 안쪽 얼굴은 두 시트에서 같은 픽셀이라 차이에 안 잡힌다. 껍데기 상자 안의 피부를
    # 메워야 투구가 얼굴을 덮는다.
    arr = np.array(placed).astype('float32')
    skin = is_skin(arr[..., 0], arr[..., 1], arr[..., 2]) & alpha_mask(placed)
    _area, mx0, my0, mx1, my1 = main
    face_box = np.zeros((CELL_H, CELL_W), dtype=bool)
    face_box[my0:my1 + 1, mx0:mx1 + 1] = True
    mask |= skin & face_box
    mask = fill_holes(mask) & window
    return mask, placed, anchor


_CANONICAL_HELMET: dict[str, tuple[Image.Image, tuple[int, int]]] = {}


def canonical_helmet(gender: str) -> tuple[Image.Image, tuple[int, int]]:
    """성별 투구 스프라이트 한 벌과 그 안의 얼굴 중심.

    투구는 프레임마다 모양이 같으므로, 차이 추출이 가장 잘 된 걷기 프레임 한 장에서 뜬
    스프라이트를 모든 프레임에 같은 모양으로 얹는다. 프레임별로 따로 뜨면 공격 시트처럼
    갑옷과 투구 시트의 포즈가 다른 프레임에서 껍데기가 깨진다.
    """
    import numpy as np
    if gender in _CANONICAL_HELMET:
        return _CANONICAL_HELMET[gender]
    candidates = []
    for index in range(8):
        mask, placed, anchor = raw_helmet(gender, 'walk', index)
        if mask.sum() >= 200:
            candidates.append((int(mask.sum()), index, mask, placed))
    if not candidates:
        raise RuntimeError(f'{gender}: 투구 껍데기를 찾지 못했습니다')
    areas = sorted(c[0] for c in candidates)
    median = areas[len(areas) // 2]
    _area, index, mask, placed = min(candidates, key=lambda c: abs(c[0] - median))
    arr = np.array(placed)
    arr[..., 3] = np.where(mask, arr[..., 3], 0)
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    sprite = Image.fromarray(arr[y0:y1 + 1, x0:x1 + 1], 'RGBA')
    # 스프라이트의 기준점은 픽셀 색이 아니라 **뜬 프레임의 머리 기준점**에서 잰다. 그래야
    # 서기·걷기(추출이 정확한 프레임)와 같은 기준으로 모든 프레임에 얹힌다.
    anchor = head_center(gender, 'walk', index)
    face = (int(round(anchor[0] - x0)), int(round(anchor[1] - y0)))
    print(f'  투구 스프라이트 {gender}: walk{index} {sprite.width}×{sprite.height}, 얼굴 {face}')
    _CANONICAL_HELMET[gender] = (sprite, face)
    return sprite, face


def helmet_pieces(gender: str, which: str, index: int) -> tuple[Image.Image, Image.Image]:
    """(갑옷 위 투구, 맨몸 위 투구). 같은 스프라이트를 각 프레임 머리 중심에 얹는다."""
    key = (gender, which, index)
    if key in _HELMET_CACHE:
        return _HELMET_CACHE[key]
    sprite, face = canonical_helmet(gender)
    armor_center = head_center(gender, which, index)
    body_center = head_center(gender, which, index, body=True)
    layer_armor = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    layer_armor.alpha_composite(sprite, (round(armor_center[0] - face[0]), round(armor_center[1] - face[1])))
    layer_body = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    layer_body.alpha_composite(sprite, (round(body_center[0] - face[0]), round(body_center[1] - face[1])))
    _HELMET_CACHE[key] = (layer_armor, layer_body)
    return layer_armor, layer_body


def each_slot():
    """(motion, pose 종류, pose 인덱스) 30칸 순서."""
    for motion in MOTION_ORDER:
        for which, index in MOTION_POSES[motion]:
            yield motion, which, index


def make_cells(gender: str, kind: str, part: str, palette) -> list[Image.Image]:
    """본체(kind='body') 또는 장비 레이어 30칸.

    `part`: `full`(본체·갑옷) · `head`(갑옷 위 투구) · `head-body`(맨몸 위 투구) ·
    `hands`(장갑) · `feet`(신발)
    """
    layer = poses(gender, kind)
    cells: list[Image.Image] = []
    for _m, which, index in each_slot():
        if part in ('head', 'head-body'):
            armor_layer, body_layer = helmet_pieces(gender, which, index)
            piece = (armor_layer if part == 'head' else body_layer).copy()
        elif part == 'feet':
            piece = crop_band(layer[which][index], *FEET_BAND)
        elif part == 'hands':
            piece = hands_only(layer[which][index])
        else:
            piece = layer[which][index].copy()
        if palette:
            piece = tint(piece, palette[1], palette[2])
        cells.append(piece)
    return cells


def transparent_cells() -> list[Image.Image]:
    return [Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0)) for _ in range(30)]


def weapon_cells(gender: str, icon: Image.Image, size_scale: float = 1.0) -> list[Image.Image]:
    """무기: 공격 시트에 검·검이미 들어 있어 공격 계열 칸은 비운다(현행 폴백과 같은 규칙)."""
    socket = SOCKETS[gender]
    scale = BODY_PX / float(socket['body'])
    height = BODY_PX * 0.55 * size_scale
    icon = icon.resize((max(1, round(icon.width * height / icon.height)), round(height)), Image.LANCZOS)
    cells: list[Image.Image] = []
    for _m, which, index in each_slot():
        cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
        if which != 'attack':
            u, v, anchor_y = socket['idle'] if which == 'idle' else socket['walk'][index]
            hand_x = PIVOT_X + (u - .5) * socket['frame'] * scale
            hand_y = PIVOT_Y + (v - anchor_y) * socket['frame'] * scale
            cell.alpha_composite(icon, (round(hand_x - SOCKET_ANCHOR[0] * icon.width),
                                        round(hand_y - SOCKET_ANCHOR[1] * icon.height)))
        cells.append(cell)
    return cells


def offhand_cells(gender: str, icon: Image.Image) -> list[Image.Image]:
    """문장(보조)은 가슴 앞 표장이라 본체 포즈와 무관한 고정 자리에 얹는다."""
    height = BODY_PX * 0.22
    icon = icon.resize((max(1, round(icon.width * height / icon.height)), round(height)), Image.LANCZOS)
    cells: list[Image.Image] = []
    for _m, which, _index in each_slot():
        cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
        shift = 6 if which in ('walk', 'attack') else 3
        cell.alpha_composite(icon, (round(PIVOT_X + shift - icon.width / 2), round(BODY_TOP + BODY_PX * 0.30)))
        cells.append(cell)
    return cells


# ── 패킹 ────────────────────────────────────────────────────────────────────
def page_of(slot: str, variant: int) -> tuple[str, int]:
    """변형 → (페이지 이름, 페이지 안 첫 셀). 변형은 페이지 경계를 넘지 않는다."""
    return (slot if variant < 2 else f'{slot}-{variant // 2 + 1}', (variant % 2) * VARIANT_STRIDE)


def page_name(slot: str, gender: str, page: int) -> str:
    return f'{slot}-{gender}' if page == 0 else f'{slot}-{gender}-{page + 1}'


def build_manifest() -> dict:
    mapping = {
        'armor': [f'armor-t{i}' for i in range(10)],
        'helmet': [f'helmet-t{i}' for i in range(10)],
        'gloves': [f'gloves-t{i}' for i in range(10)],
        'boots': [f'boots-t{i}' for i in range(10)],
        'weapon': [f'weapon-t{i}' for i in range(10)],
        'offhand': [f'offhand-t{i}' for i in range(5)],
    }
    zorder = {'armor': 10, 'boots': 12, 'gloves': 20, 'helmet': 30, 'offhand': 40, 'weapon': 50}
    costumes = []
    for slot in ['weapon', 'offhand', 'helmet', 'armor', 'gloves', 'boots']:
        for costume_id in mapping[slot]:
            costumes.append({'costumeId': costume_id, 'slot': slot, 'animMode': 'frames',
                             'anchor': {'x': 0, 'y': 0}, 'zOrder': zorder[slot]})
    return {'schemaVersion': 1, 'costumes': costumes}


SLOTS = [
    # (페이지 기본 이름, 원본 가문, 조각, 팔레트, 변형 수)
    ('armor', 'armor', 'full', ARMOR_PALETTES, 10),
    ('helmet', 'helm', 'head', HELMET_PALETTES, 10),
    ('helmet-body', 'helm', 'head-body', HELMET_PALETTES, 10),
    ('gloves', 'armor', 'hands', GLOVES_PALETTES, 10),
    ('boots', 'armor', 'feet', BOOTS_PALETTES, 10),
    ('weapon', None, 'weapon', None, 10),
    ('offhand', None, 'offhand', None, 5),
]


def variant_cells(gender: str, slot: str, kind, part: str, palette, index: int) -> list[Image.Image]:
    if part == 'weapon':
        icons = sheet_frames(WEAPON_SHEET, 5, 2)
        return weapon_cells(gender, icons[index], 1.0 + index * 0.012)
    if part == 'offhand':
        icons = sheet_frames(OFFHAND_SHEET, 5, 1)
        return offhand_cells(gender, icons[index])
    return make_cells(gender, kind, part, palette[index])


def save_page(path: str, slots: list[tuple[int, list[Image.Image]]]) -> None:
    """한 페이지(2048×2048)를 만들고 바로 저장한다(전체를 메모리에 쌓지 않는다)."""
    atlas = Image.new('RGBA', (COLUMNS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
    for first, cells in slots:
        for offset, cell in enumerate(cells):
            position = first + offset
            column, row = position % COLUMNS, position // COLUMNS
            atlas.alpha_composite(cell, (column * CELL_W, row * CELL_H))
    atlas.save(path, optimize=True)


def build_assets() -> None:
    directory = os.path.join(OUT, 'atlas')
    os.makedirs(directory, exist_ok=True)
    for gender in ('male', 'female'):
        body = make_cells(gender, 'body', 'full', None)
        for variant, cells in ((0, body), (1, transparent_cells()), (2, transparent_cells())):
            name = f'body-{gender}' if variant < 2 else f'body-{gender}-2'
            if os.path.exists(os.path.join(directory, f'{name}.png')) and variant != 0:
                continue
            save_page(os.path.join(directory, f'{name}.png'), [((variant % 2) * VARIANT_STRIDE, cells)])
            print(f'atlas/{name}.png')
        for slot, kind, part, palettes, count in SLOTS:
            for page in range((count + 1) // 2):
                variants = [v for v in (page * 2, page * 2 + 1) if v < count]
                name = page_name(slot, gender, page)
                entries = []
                for variant in variants:
                    cells = variant_cells(gender, slot, kind, part, palettes, variant)
                    entries.append(((variant % 2) * VARIANT_STRIDE, cells))
                save_page(os.path.join(directory, f'{name}.png'), entries)
                print(f'atlas/{name}.png')
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as handle:
        json.dump(build_manifest(), handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print('manifest.json')


def preview() -> None:
    """검수용 접촉 시트: 성별 × 대표 조합을 게임과 같은 순서로 합성한다."""
    os.makedirs('/workspace/downloads', exist_ok=True)
    for gender in ('male', 'female'):
        layers = {f'body-{gender}': {0: make_cells(gender, 'body', 'full', None)}}
        for slot, kind, part, palettes, count in SLOTS:
            layers[f'{slot}-{gender}'] = {i: variant_cells(gender, slot, kind, part, palettes, i) for i in range(count)}
        body = layers[f'body-{gender}'][0]
        combos = [
            ('nude', {}),
            ('helm7 only', {'helmet': 7}),
            ('nude+helm7', {'helmet': 7}),
            ('nude+helm0', {'helmet': 0}),
            ('nude+wpn0', {'weapon': 0}),
            ('armor3 only', {'armor': 3}),
            ('armor3+helm3', {'armor': 3, 'helmet': 3}),
            ('armor3+helm3+wpn3', {'armor': 3, 'helmet': 3, 'weapon': 3}),
            ('armor9+helm9+off4+wpn9', {'armor': 9, 'helmet': 9, 'offhand': 4, 'weapon': 9}),
            ('gloves3 only', {'gloves': 3}),
            ('boots4 only', {'boots': 4}),
            ('armor5+helm5+gloves5+boots5', {'armor': 5, 'helmet': 5, 'gloves': 5, 'boots': 5}),
        ]
        for motion_index, title in ((0, 'idle'), (4, 'walk3'), (9, 'attack0'), (10, 'attack1'), (13, 'slash0')):
            frames = []
            for label, gear in combos:
                frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
                if 'armor' not in gear:
                    frame.alpha_composite(body[motion_index])
                for slot, index in gear.items():
                    frame.alpha_composite(layers[f'{slot}-{gender}'][index][motion_index])
                frames.append(frame)
            from PIL import ImageDraw
            sheet = Image.new('RGBA', (CELL_W * (len(frames) + 1), CELL_H), (128, 112, 86, 255))
            draw = ImageDraw.Draw(sheet)
            for i, frame in enumerate(frames):
                sheet.alpha_composite(frame, ((i + 1) * CELL_W, 0))
            for i, (label, _gear) in enumerate(combos):
                draw.text((4, 4 + i * 12), label, fill=(28, 24, 18, 255))
            sheet.convert('RGB').save(f'/workspace/downloads/_atlas_preview_{gender}_{title}.png')
    print('preview saved')


def head_report() -> None:
    """머리 정렬 진단: 프레임별 머리 중심과 투구 스프라이트 크기를 출력한다."""
    for gender in ('male', 'female'):
        for which in ('idle', 'walk', 'attack'):
            for index in range(len(poses(gender, 'body')[which])):
                armor_center = head_center(gender, which, index)
                body_center = head_center(gender, which, index, body=True)
                print(f'{gender:6s} {which:6s} {index}: 갑옷 머리 ({armor_center[0]:5.1f},{armor_center[1]:5.1f}) · '
                      f'맨몸 머리 ({body_center[0]:5.1f},{body_center[1]:5.1f}) · '
                      f'Δ({body_center[0] - armor_center[0]:+.0f},{body_center[1] - armor_center[1]:+.0f})')


def pilot_145() -> None:
    """작업 145의 서리 가죽두건 단일 조합용 방향 시안을 v4 셀 규약으로 패킹한다."""
    source = os.path.join(ROOT, 'public', 'assets', 'costume', 'pilot145', 'source')
    output = os.path.join(ROOT, 'public', 'assets', 'costume', 'v4', 'atlas')
    os.makedirs(output, exist_ok=True)

    def cells(path: str, columns: int, rows: int) -> list[Image.Image]:
        sheet = Image.open(path).convert('RGBA')
        cell_w, cell_h = sheet.width // columns, sheet.height // rows
        result = []
        for index in range(columns * rows):
            x, y = (index % columns) * cell_w, (index // columns) * cell_h
            result.append(sheet.crop((x, y, x + cell_w, y + cell_h)))
        return result

    def fit(source_cell: Image.Image) -> Image.Image:
        alpha = source_cell.getchannel('A')
        bbox = alpha.getbbox()
        frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
        if not bbox:
            return frame
        art = source_cell.crop(bbox)
        scale = min(BODY_PX / art.height, CELL_W / art.width)
        size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
        art = art.resize(size, Image.Resampling.LANCZOS)
        frame.alpha_composite(art, ((CELL_W - size[0]) // 2, round(PIVOT_Y - size[1])))
        return frame

    for gender in ('male', 'female'):
        idle = cells(os.path.join(source, f'idle-sheet-{gender}.png'), 4, 4)[0]
        walk = cells(os.path.join(source, f'walk-sheet-{gender}.png'), 4, 2)[:8]
        attacks = cells(os.path.join(source, f'attack-sheet-{gender}.png'), 4, 1)
        atlas = Image.new('RGBA', (CELL_W * COLUMNS, CELL_H * ROWS), (0, 0, 0, 0))
        ordered = [fit(idle), *(fit(cell) for cell in walk), *(fit(cell) for cell in attacks)]
        for index, frame in enumerate(ordered):
            atlas.alpha_composite(frame, ((index % COLUMNS) * CELL_W, (index // COLUMNS) * CELL_H))
        atlas.save(os.path.join(output, f'pilot-hood-{gender}.png'), optimize=True)
        print(f'v4/atlas/pilot-hood-{gender}.png')


def pilot_145_review() -> None:
    """기준 아이콘·생성 프레임과 실기 확인 대기 상태를 한 장에 모은다."""
    from PIL import ImageDraw, ImageFont

    out = os.path.join(ROOT, 'public', 'assets', 'costume', 'pilot145', 'review')
    os.makedirs(out, exist_ok=True)
    icon_sheet = Image.open(os.path.join(ROOT, 'public', 'assets', 'item-art', 'helmet_0.png')).convert('RGBA')
    icon = icon_sheet.crop((0, 0, icon_sheet.width // 5, icon_sheet.height))
    canvas = Image.new('RGB', (2360, 1350), (24, 25, 29))
    draw = ImageDraw.Draw(canvas)
    font_path = 'C:/Windows/Fonts/malgun.ttf'
    try:
        title_font = ImageFont.truetype(font_path, 36)
        label_font = ImageFont.truetype(font_path, 23)
        note_font = ImageFont.truetype(font_path, 18)
    except OSError:
        title_font = label_font = note_font = ImageFont.load_default()
    draw.text((36, 24), '서리의 가죽두건 · 작업 145 시안 검수', font=title_font, fill=(239, 226, 201))
    headers = [('장착 아이템', 35), ('서기', 200), ('걷기 · 8프레임', 365), ('공격 · 좌/우/뒤/앞', 1195), ('실제 필드 화면', 1625), ('실제 장비창 화면', 1995)]
    for label, x in headers:
        draw.text((x, 84), label, font=label_font, fill=(186, 198, 204))

    for row, gender in enumerate(('male', 'female')):
        y0 = 145 + row * 590
        draw.rounded_rectangle((22, y0, 2338, y0 + 560), radius=18, fill=(34, 37, 42), outline=(76, 82, 88), width=2)
        draw.text((42, y0 + 12), '남성' if gender == 'male' else '여성', font=label_font, fill=(228, 214, 187))
        atlas = Image.open(os.path.join(ROOT, 'public', 'assets', 'costume', 'v4', 'atlas', f'pilot-hood-{gender}.png')).convert('RGBA')
        icon_preview = icon.copy()
        icon_preview.thumbnail((136, 180), Image.Resampling.LANCZOS)
        canvas.paste(icon_preview, (46, y0 + 74), icon_preview)
        draw.rectangle((34, y0 + 68, 190, y0 + 275), outline=(105, 94, 74), width=2)

        def paste_cell(cell: int, x: int, width: int, height: int) -> None:
            crop = atlas.crop(((cell % COLUMNS) * CELL_W, (cell // COLUMNS) * CELL_H,
                               (cell % COLUMNS + 1) * CELL_W, (cell // COLUMNS + 1) * CELL_H))
            crop.thumbnail((width, height), Image.Resampling.LANCZOS)
            canvas.paste(crop, (x, y0 + 90 + (height - crop.height) // 2), crop)

        paste_cell(0, 205, 145, 190)
        for index in range(8):
            x = 365 + index * 100
            paste_cell(1 + index, x, 94, 150)
            draw.text((x + 35, y0 + 248), str(index + 1), font=note_font, fill=(174, 181, 185))
        for index, label in enumerate(('좌', '우', '뒤', '앞')):
            x = 1195 + index * 105
            paste_cell(9 + index, x, 100, 160)
            draw.text((x + 35, y0 + 260), label, font=note_font, fill=(174, 181, 185))

        for x, title in ((1625, '세션 필요'), (1995, '세션 필요')):
            draw.rounded_rectangle((x, y0 + 65, x + 325, y0 + 330), radius=12, fill=(46, 48, 52), outline=(157, 116, 72), width=2)
            draw.text((x + 22, y0 + 98), title, font=label_font, fill=(242, 185, 111))
            draw.text((x + 22, y0 + 150), '실제 캡처 미확인', font=label_font, fill=(236, 224, 204))
            draw.text((x + 22, y0 + 205), '테스트 계정/게스트 진행이', font=note_font, fill=(190, 194, 195))
            draw.text((x + 22, y0 + 234), '서버 저장을 생성할 수 있어', font=note_font, fill=(190, 194, 195))
            draw.text((x + 22, y0 + 263), '아직 시작하지 않았습니다.', font=note_font, fill=(190, 194, 195))
        draw.text((36, y0 + 390), '참고: 공격은 방향당 1개 키 포즈를 공격 창 동안 유지합니다. 몸 전체를 포함한 단일 조합 시안입니다.', font=note_font, fill=(169, 177, 182))

    path = os.path.join(out, 'pilot-145-review.png')
    canvas.save(path, optimize=True)
    print(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--heads', action='store_true')
    parser.add_argument('--pilot-145', action='store_true', help='작업 145 단일 시안만 v4 페이지로 패킹')
    parser.add_argument('--pilot-145-review', action='store_true', help='작업 145 검수 접촉 시트 생성')
    args = parser.parse_args()
    if args.pilot_145_review:
        pilot_145_review()
    elif args.pilot_145:
        pilot_145()
    elif args.preview:
        preview()
    elif args.heads:
        head_report()
    else:
        build_assets()
