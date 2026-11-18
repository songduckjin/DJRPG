#!/usr/bin/env python3
"""DJRPG 코스튬 아틀라스 v2 빌더 — [작업 142].

`docs/COSTUME_SYSTEM.md` §7.2 배치 규약(셀 234×242, 페이지 2048×2048 8×8=64칸,
변형당 32칸, 프레임 슬롯 idle 0 · walk 1–8 · attack 9–12 · slash 13–16 · spin 17–22 ·
smash 23–26 · cast 27–29)으로 `public/assets/costume/v2/`의 매니페스트와 아틀라스
페이지를 만든다.

제작 방식(§6.3 기록): 새 그림을 그리지 않고 `public/assets/`의 기존 2.5D 프리렌더 시트를
재료로 쓴다. 성별·모션별로 원본 시트를 같은 규칙(본체 높이 190px, 실루엣 경계 상자 중심 x ·
발끝 y)으로 셀에 앉히면 시트 사이의 포즈·구도가 거의 일치하므로, 장비 레이어는 원본 그림을
그대로(위치 보정 없이) 쓰고 팔레트만 바꾼다. 갑옷 레이어가 몸통 파츠를 대체하고(§4),
투구·장갑·신발은 같은 원본의 머리·손·발 구간만 남긴 조각이라 어떤 조합에서도 본체와
어긋나지 않는다.

색 변형은 `appearance.ts`의 팔레트 색조를 휘도 램프로 입히고 피부·얼굴·머리카락 픽셀은
원본을 유지한다(작업 135 품질 가드와 같은 규칙). 무기·문장은 필드 폴백과 같은 아이콘
아트(`wearable/weapons.png`, `item-art/offhand_0.png`)를 쓴다.

스킬 모션 4종은 기본 공격·대기 포즈를 재배열해 채운다(전용 포즈는 후속 제작 과제).

실행: `python3 scripts/build-costume-atlas.py` (`--preview`는 검수용 접촉 시트만 만든다)
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
OUT = os.path.join(ASSETS, 'costume', 'v2')

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

HEAD_BAND = (0.0, 0.21)       # 투구가 덮는 구간(머리)
HANDS_BAND = (0.38, 0.66)     # 손 후보 구간(그 안의 피부 덩어리만 장갑으로 쓴다)
FEET_BAND = (0.87, 1.0)       # 발목 아래(신발)


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
    top, bottom = band_rows(y0, y1)
    alpha = cell.split()[3].load()
    out = cell.copy()
    px = out.load()
    for y in range(CELL_H):
        if top <= y < bottom:
            continue
        for x in range(CELL_W):
            if px[x, y][3]:
                px[x, y] = (0, 0, 0, 0)
    return out


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
    """손 구간 안의 **피부 덩어리**(+ 주변 갑주)만 남긴 장갑 조각.

    구간 전체를 자르면 몸통까지 들어와 갑옷 없이 낄 때 배에 갑주 조각이 붙는다.
    """
    import numpy as np
    top, bottom = band_rows(*HANDS_BAND)
    arr = np.array(cell)
    skin = is_skin(arr[..., 0].astype('float32'), arr[..., 1].astype('float32'), arr[..., 2].astype('float32'))
    mask = np.zeros(arr.shape[:2], dtype='uint8')
    mask[top:bottom] = np.where(skin[top:bottom] & (arr[top:bottom, :, 3] > 40), 255, 0)
    mask_image = Image.fromarray(mask, 'L').filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.2))
    out = cell.copy()
    out.putalpha(Image.composite(cell.split()[3], Image.new('L', (CELL_W, CELL_H), 0), mask_image))
    return out


def head_centre(cell: Image.Image):
    """실루엣 위쪽 띠의 중심 x · 상단 y (머리 위치 추정)."""
    alpha = cell.split()[3]
    box = alpha.getbbox()
    if not box:
        return None
    px = alpha.load()
    rows = range(box[1], min(box[3], box[1] + 12))
    xs = [x for y in rows for x in range(box[0], box[2]) if px[x, y] > 40]
    if not xs:
        return None
    return (min(xs) + max(xs)) / 2, box[1]


def head_align(donor: Image.Image, target: Image.Image, limit: int = 12) -> int:
    """머리 띠 실루엣 상관으로 투구를 갑옷 머리 위에 맞출 좌우 이동량.

    같은 가문(갑옷·투구) 시트끼리는 머리 모양이 거의 같아 상관값이 높다(IoU .83~.91).
    """
    import numpy as np
    top, bottom = band_rows(0.0, 0.26)
    a = (np.array(target.split()[3]) > 40).astype('uint8')
    b = (np.array(donor.split()[3]) > 40).astype('uint8')
    a[:top] = 0
    a[bottom:] = 0
    b[:top] = 0
    b[bottom:] = 0
    best = (-1.0, 0)
    for dx in range(-limit, limit + 1):
        shifted = np.zeros_like(b)
        if dx >= 0:
            shifted[:, dx:] = b[:, :CELL_W - dx]
        else:
            shifted[:, :CELL_W + dx] = b[:, -dx:]
        union = ((a | shifted) > 0).sum()
        if not union:
            continue
        score = ((a & shifted) > 0).sum() / union
        if score > best[0]:
            best = (score, dx)
    return best[1]


def helmet_diff(helm: Image.Image, armor: Image.Image, body: Image.Image, threshold: int = 46) -> Image.Image:
    """투구 시트와 갑옷 시트의 차이 → 투구 껍데기(위치는 투구 시트 그대로)."""
    import numpy as np
    h = np.array(helm).astype('int')
    a = np.array(armor).astype('int')
    changed = (np.abs(h - a).sum(2) > threshold) & (h[..., 3] > 40)
    out = h.copy()
    out[..., 3] = np.where(changed, out[..., 3], 0)
    shell = Image.fromarray(out.astype('uint8'), 'RGBA')
    dx = head_align(shell, armor)
    return shift_cell(shell, dx, 0) if dx else shell


def shift_cell(cell: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    out.alpha_composite(cell, (dx, dy))
    return out


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

MOTION_POSES = {
    'idle': [('idle', 0)],
    'walk': [('walk', i) for i in range(8)],
    'attack': [('attack', i) for i in range(4)],
    'slash': [('attack', i) for i in range(4)],
    'spin': [('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3), ('attack', 2), ('attack', 1)],
    'smash': [('attack', 3), ('attack', 2), ('attack', 1), ('attack', 0)],
    'cast': [('idle', 0), ('attack', 1), ('attack', 0)],
}

_POSE_CACHE: dict[tuple[str, str], dict[str, list[Image.Image]]] = {}


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
        result[which] = [to_cell(image, body_px) for image in images]
    _POSE_CACHE[key] = result
    return result


def each_slot():
    """(motion, pose 종류, pose 인덱스) 30칸 순서."""
    for motion in MOTION_ORDER:
        for which, index in MOTION_POSES[motion]:
            yield motion, which, index


def make_cells(gender: str, kind: str, part: str, palette) -> list[Image.Image]:
    """본체(kind='body') 또는 장비 레이어 30칸.

    `part`: `full`(본체·갑옷) · `head`(투구) · `hands`(장갑) · `feet`(신발)
    """
    layer = poses(gender, kind)
    body = poses(gender, 'body')
    armor = poses(gender, 'armor')
    cells: list[Image.Image] = []
    for _m, which, index in each_slot():
        piece = layer[which][index].copy()
        if part == 'head':
            # 투구 레이어 = 갑옷 그림의 머리 구간 + (투구 시트 − 갑옷 시트) 차이로 뽑은 투구.
            # 갑옷 위에서는 원본 투구 그림과 같은 결과가 되고, 갑옷이 없을 때는 투구를 쓴
            # 머리가 본체 머리 위에 얹힌다(원본 시트 구도 차이만큼 어긋날 수 있다 — §7.4).
            base = crop_band(armor[which][index], *HEAD_BAND)
            helmet_only = helmet_diff(piece, armor[which][index], body[which][index])
            base.alpha_composite(helmet_only)
            piece = base
        elif part == 'feet':
            piece = crop_band(piece, *FEET_BAND)
        elif part == 'hands':
            piece = hands_only(piece)
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


def pack(build: dict[str, dict[int, list[Image.Image]]]) -> dict[str, Image.Image]:
    pages: dict[str, dict[int, Image.Image]] = {}
    for slot, variants in build.items():
        for variant, cells in variants.items():
            name, first = page_of(slot, variant)
            page = pages.setdefault(name, {})
            for offset, cell in enumerate(cells):
                page[first + offset] = cell
    images: dict[str, Image.Image] = {}
    for name, cells in pages.items():
        atlas = Image.new('RGBA', (COLUMNS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
        for index, cell in cells.items():
            column, row = index % COLUMNS, index // COLUMNS
            atlas.alpha_composite(cell, (column * CELL_W, row * CELL_H))
        images[name] = atlas
    return images


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
                name = f'{slot}-{gender}' if page == 0 else f'{slot}-{gender}-{page + 1}'
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
    """검수용 접촉 시트: 성별 × 대표 조합을 게임 표시 크기로 나란히 놓는다."""
    os.makedirs('/workspace/downloads', exist_ok=True)
    for gender in ('male', 'female'):
        layers = {f'body-{gender}': {0: make_cells(gender, 'body', 'full', None)}}
        for slot, kind, part, palettes, count in SLOTS:
            layers[f'{slot}-{gender}'] = {i: variant_cells(gender, slot, kind, part, palettes, i) for i in range(count)}
        body = layers[f'body-{gender}'][0]
        combos = [
            ('nude', []),
            ('nude+wpn0', [('weapon', 0)]),
            ('armor3+helm3+wpn3', [('armor', 3), ('helmet', 3), ('weapon', 3)]),
            ('armor7+helm7', [('armor', 7), ('helmet', 7)]),
            ('armor9+helm9+off4+wpn9', [('armor', 9), ('helmet', 9), ('offhand', 4), ('weapon', 9)]),
            ('helm0 only', [('helmet', 0)]),
            ('boots0 only', [('boots', 0)]),
            ('gloves5 only', [('gloves', 5)]),
            ('armor3 only', [('armor', 3)]),
            ('armor3+boots3', [('armor', 3), ('boots', 3)]),
            ('nude+off2+wpn2', [('offhand', 2), ('weapon', 2)]),
            ('armor5+helm5+gloves5+boots5', [('armor', 5), ('helmet', 5), ('gloves', 5), ('boots', 5)]),
        ]
        table = {slot.split('-')[0]: variants for slot, variants in layers.items() if not slot.startswith('body-')}
        for motion_index, title in ((0, 'idle'), (1, 'walk0'), (4, 'walk3'), (9, 'attack0'), (13, 'slash0')):
            row = []
            for label, _ in combos:
                frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
                frame.alpha_composite(body[motion_index])
                armor_on = any(slot == 'armor' for slot, _ in dict(combos)[label])
                if armor_on:
                    frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
                for slot, index in dict(combos)[label]:
                    frame.alpha_composite(table[slot][index][motion_index])
                row.append(frame)
            sheet = Image.new('RGBA', (CELL_W * len(row), CELL_H), (128, 112, 86, 255))
            for i, frame in enumerate(row):
                sheet.alpha_composite(frame, (i * CELL_W, 0))
            sheet.convert('RGB').save(f'/workspace/downloads/_atlas_preview_{gender}_{title}.png')
    print('preview saved')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    if args.preview:
        preview()
    else:
        build_assets()
