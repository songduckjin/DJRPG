"""갑옷·로브 파츠 발광 마스크 빌더 (작업 257).

전사 갑옷(`armors/`)·궁수 갑옷(`archer_armors/`)·마법사 로브(`robes/`)와 스타터 시트
(`archer_*`·`mage_*`)에서 **갑옷·로브 픽셀만** 남긴 발광 마스크를 만든다. 사용자 확정 1안 —
파츠만 깔끔하게 발광하고 실루엣 밖으로 번지는 오라는 없다.

마스크는 원본 시트와 **같은 크기·같은 파일명**으로 `armors_glow/`·`archer_armors_glow/`·
`robes_glow/`·`starter_glow/` 아래에 두고, 필드(`entities.ts`)와 장비창(`equipmentPortrait.ts`)이
시트와 같은 앵커·위치·배율로 얹어 발광을 잘라 낸다. 그래서 프레임을 새로 자를 필요가 없다.

마스크에서 빼는 것(발광 금지):
  ① **머리·얼굴·머리카락** — 같은 시트의 `headless/` 판(투구를 쓸 때 머리를 지운 그림)에서
     알파가 사라진 자리. 두 시트는 픽셀 단위로 정렬돼 있어 이 차집합이 곧 머리 실루엣이다.
     목·어깨살도 함께 빠져 어깨 갑옷(견갑)은 남는다.
  ② **무기** — 같은 시트의 무기 지운 판(`noweapon/`·`nobow/`·`mage_nostaff/`)에서 알파가 사라진
     자리. 기본 대검·활·지팡이가 정확히 빠진다.
  ③ **맨 살(피부)** — 얼굴·목·맨팔·맨손. 따뜻한 살구빛 덩어리만 잡는다(점박이 가죽 반사는
     침식에서 죽는다).
  ④ **다리·부츠** — 갑옷은 허벅지 위에서 끝난다. 동작·프레임마다 밑단 높이가 달라 표로 잡고
     아래로 20~26px에 걸쳐 부드럽게 끊는다(직선이 보이지 않게).
  ⑤ **손 안의 마법 불꽃** — 로브 시트에 그려진 붉은 불꽃은 옷이 아니다.

출력은 RGBA PNG(흰색 + 알파=발광 세기)다 — Pixi 마스크는 텍스처의 알파를 쓴다.

사용:
    python3 scripts/build-armor-glow-masks.py [--preview]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / 'public/assets/pilot-25d'

GENDERS = ('male', 'female')
MOTIONS = ('idle', 'walk', 'attack')
FRAME_COUNT = {'idle': 1, 'walk': 4, 'attack': 4}
CELL = 362


# ── 색 분류 ───────────────────────────────────────────────────────────────────
def hsv(rgba: np.ndarray):
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(mx)
    d = np.maximum(mx - mn, 1e-6)
    m = mx == r
    h[m] = ((g - b) / d)[m] % 6
    m = (mx == g) & (mx != r)
    h[m] = ((b - r) / d + 2)[m]
    m = (mx == b) & (mx != r) & (mx != g)
    h[m] = ((r - g) / d + 4)[m]
    return h * 60, s, mx


def warm(rgba: np.ndarray) -> np.ndarray:
    """따뜻한 살구빛 — 피부 후보(얼굴·목·맨팔·맨손)."""
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    r = rgba[..., 0].astype(np.float32)
    g = np.maximum(1.0, rgba[..., 1].astype(np.float32))
    b = rgba[..., 2].astype(np.float32)
    return (a & (h >= 4) & (h <= 40) & (s >= 0.15) & (s <= 0.60) & (v >= 0.32) & (v <= 0.94)
            & ((r - b) >= 25) & ((b / g) >= 0.5) & ((b / g) <= 0.95))


def warm_loose(rgba: np.ndarray) -> np.ndarray:
    """그늘 진 맨살까지 넓게 — 기준 시트의 살색 자리에서만 쓴다(가죽 갑옷까지 잡지 않게)."""
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    r = rgba[..., 0].astype(np.float32)
    g = np.maximum(1.0, rgba[..., 1].astype(np.float32))
    b = rgba[..., 2].astype(np.float32)
    return (a & (h >= 3) & (h <= 45) & (s >= 0.12) & (s <= 0.75) & (v >= 0.25) & (v <= 0.97)
            & ((r - b) >= 14) & ((b / g) >= 0.42) & ((b / g) <= 0.98))


def hot(rgba: np.ndarray) -> np.ndarray:
    """손 안에서 타는 마법 불꽃 — 진한 주황·빨강."""
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    return a & ((h <= 26) | (h >= 335)) & (s >= 0.55) & (v >= 0.45)


def dil(mask: np.ndarray, steps: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def ero(mask: np.ndarray, steps: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        shrunk = out.copy()
        shrunk[1:, :] &= out[:-1, :]
        shrunk[:-1, :] &= out[1:, :]
        shrunk[:, 1:] &= out[:, :-1]
        shrunk[:, :-1] &= out[:, 1:]
        out = shrunk
    return out


def components(mask: np.ndarray) -> list[tuple[np.ndarray, int]]:
    """4-연결 성분과 면적. 픽셀 아트라 BFS로 충분하다."""
    height, width = mask.shape
    seen = np.zeros_like(mask)
    out: list[tuple[np.ndarray, int]] = []
    for start_y in range(height):
        for start_x in np.nonzero(mask[start_y] & ~seen[start_y])[0]:
            if seen[start_y, start_x]:
                continue
            stack = [(start_y, int(start_x))]
            seen[start_y, start_x] = True
            part = np.zeros_like(mask)
            area = 0
            while stack:
                y, x = stack.pop()
                part[y, x] = True
                area += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            out.append((part, area))
    return out


def skin_strict(rgba: np.ndarray, min_area: int = 30) -> np.ndarray:
    """밝은 살색만 — 스타터 시트처럼 갑옷(옷) 자체가 따뜻한 갈색인 그림에 쓴다.

    어두운 갈색 로브·가죽 조끼는 밝기로 갈린다(옷 v≈0.3, 살색 v≥0.45).
    """
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    r = rgba[..., 0].astype(np.float32)
    g = np.maximum(1.0, rgba[..., 1].astype(np.float32))
    b = rgba[..., 2].astype(np.float32)
    lit = a & (h >= 4) & (h <= 42) & (s >= 0.14) & (s <= 0.55) & (v >= 0.46) & (v <= 0.95) \
        & ((r - b) >= 22) & ((b / g) >= 0.5) & ((b / g) <= 0.92)
    keep = np.zeros(rgba.shape[:2], bool)
    for part, area in components(ero(lit, 1)):
        if area >= min_area:
            keep |= part
    return dil(keep, 2)


def skin_mask(rgba: np.ndarray, base: np.ndarray | None = None, min_area: int = 45) -> np.ndarray:
    """피부 — 살구빛 **덩어리**만. 가죽·금속의 점박이 반사는 침식에서 죽는다.

    `base`(같은 자세의 기준 시트)를 주면 그 시트가 맨살인 자리에서만 넓은 색 범위를 함께
    쓴다 — 궁수·마법사의 그늘 진 손처럼 어두운 살색은 색만으로는 가죽과 구분되지 않지만,
    같은 자리에 기준 시트의 맨손·맨팔이 있으면 그 자리를 피부로 볼 수 있다.
    전사 기준 시트는 가죽 갑옷이 살색과 같아 이 확장을 쓰지 않는다(갑옷이 통째로 빠진다).
    """
    keep = np.zeros(rgba.shape[:2], bool)
    for part, area in components(ero(warm(rgba), 1)):
        if area >= min_area:
            keep |= part
    skin = dil(keep, 2)
    if base is not None:
        skin |= warm_loose(rgba) & dil(skin_mask(base), 5)
    return skin


def fill_holes(mask: np.ndarray, max_area: int = 160) -> np.ndarray:
    """테두리와 닿지 않는 **작은** 구멍(눈·입·수염 그늘)만 메운다.

    큰 구멍까지 메우면 머리카락이 양어깨로 흘러내린 사이(가슴)가 통째로 머리로 잡혀
    갑옷 상반신이 발광에서 빠진다 — 그래서 면적 상한을 둔다.
    """
    height, width = mask.shape
    pad = np.zeros((height + 2, width + 2), dtype=bool)
    pad[1:-1, 1:-1] = mask
    seen = np.zeros_like(pad)
    seen[0, 0] = True
    stack = [(0, 0)]
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height + 2 and 0 <= nx < width + 2 and not seen[ny, nx] and not pad[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    holes = (~seen & ~pad)[1:-1, 1:-1]
    out = mask.copy()
    for part, area in components(holes):
        if area <= max_area:
            out |= part
    return out


def hair_mask(rgba: np.ndarray) -> np.ndarray:
    """머리카락 — 어둡거나 중간 밝기의 갈색·붉은 갈색. 갑옷의 어두운 천과는 채도로 갈린다."""
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    return a & (((h >= 5) & (h <= 48)) | (h >= 345)) & (s >= 0.28) & (v <= 0.90)


def head_removed(source: np.ndarray, head_region: np.ndarray, strict_skin: bool = False) -> np.ndarray:
    """머리·얼굴·머리카락이 있던 자리.

    머리 지운 판(`headless/`)의 차집합은 **목·어깨까지** 지운 판이라 그대로 쓰면 어깨 갑옷이
    통째로 빠진다(궁수 스케일 셔츠의 어깨). 그래서 차집합은 **후보 영역**으로만 두고, 그 안에서
    살색·머리카락색인 픽셀만 고른 뒤 구멍(눈·수염 그늘)을 메워 머리 실루엣을 만든다.
    후보 영역의 세로 범위 밖(아래로 흘러내린 망토)은 건드리지 않는다.
    """
    out = np.zeros(head_region.shape, bool)
    hair = hair_mask(source) | (skin_strict(source) if strict_skin else skin_mask(source))
    for index in range(head_region.shape[1] // CELL):
        column = slice(index * CELL, (index + 1) * CELL)
        zone = head_region[:, column]
        ys, _ = np.nonzero(zone)
        if len(ys) == 0:
            continue
        yy = np.mgrid[0:CELL, 0:CELL][0]
        limited = zone & (yy <= ys.max() + 40) & hair[:, column]
        solid = dil(fill_holes(limited), 3) & dil(zone, 3)
        out[:, column] = solid
    return out


def trim_upper_left(keep: np.ndarray, head_region: np.ndarray) -> np.ndarray:
    """머리 위·왼쪽에 걸친 가느다란 조각(궁수 화살통의 화살·깃)을 지운다.

    화살은 어깨 뒤에서 머리 왼쪽으로 부챗살처럼 솟아 있어 색으로도 성분으로도 갑옷과
    갈라지지 않는다(어깨를 통해 몸통과 한 덩어리다). 대신 **머리 영역**을 기준으로 잡는다 —
    같은 프레임에서 머리를 지운 자리(`head_region`)의 위쪽·왼쪽은 화살 자리이고, 견갑은
    그 아래(어깨선)에서 시작한다. 프레임마다 머리 위치가 달라도 규칙이 따라간다.
    """
    out = keep.copy()
    for index in range(out.shape[1] // CELL):
        block = head_region[:, index * CELL:(index + 1) * CELL]
        ys, xs = np.nonzero(block)
        if len(ys) == 0:
            continue
        center_x = (xs.min() + xs.max()) / 2
        # 머리(머리카락 포함)는 위에서 95px 남짓 — 머리 지운 자리가 목·어깨까지 넓게 잡힌 판에서도
        # 그 아래 갑옷을 자르지 않도록 세로 범위를 머리 높이로 묶는다.
        bottom = min(float(ys.max()), float(ys.min()) + 95)
        cell = out[:, index * CELL:(index + 1) * CELL]
        yy, xx = np.mgrid[0:CELL, 0:CELL]
        cell[(yy < bottom) & (xx < center_x)] = 0.0
    return out


def cleanup(keep: np.ndarray, min_hole: int = 180, min_island: int = 16) -> np.ndarray:
    """작은 구멍(가죽 무늬 오탐)을 메우고 작은 섬(반사 점)을 지운다.

    큰 구멍은 그대로 둔다 — 눈처럼 실제로 비워야 하는 자리(이미 ①에서 빠진다)와
    어깨끈 사이 빈 곳은 발광이 비치는 게 맞다.
    """
    out = keep.copy()
    for part, area in components(~out):
        ys, xs = np.nonzero(part)
        if len(ys) == 0:
            continue
        touches = ys.min() == 0 or xs.min() == 0 or ys.max() == out.shape[0] - 1 or xs.max() == out.shape[1] - 1
        if not touches and area <= min_hole:
            out |= part
    for part, area in components(out):
        if area <= min_island:
            out &= ~part
    return out


# ── 시트 묶음 ─────────────────────────────────────────────────────────────────
# (폴더, 파일명 틀, 티어, 머리 지운 판, 무기 지운 판, 출력 폴더)
SHEETS = [
    ('warrior', 'armors', 'warrior_{gender}_armor_{tier}_{motion}_v1.png', range(0, 10),
     'armors/headless', 'noweapon/armors', 'armors_glow', 'warrior_{gender}_{motion}_v1.png', False),
    ('archer', 'archer_armors', 'archer_{gender}_armor_{tier}_{motion}_v1.png', range(1, 10),
     'archer_armors/headless', 'archer_armors/nobow', 'archer_armors_glow', 'archer_{gender}_{motion}_v1.png', True),
    ('mage', 'robes', 'mage_{gender}_robe_{tier}_{motion}_v1.png', range(1, 10),
     'robes/headless', None, 'robes_glow', 'mage_{gender}_{motion}_v1.png', True),
    # 스타터(갑옷 0번 = 기본 옷) 시트 — 궁수·마법사는 0번 갑옷을 입으면 이 시트를 그대로 쓴다.
    ('starter-archer', '', 'archer_{gender}_{motion}_v1.png', range(0, 1),
     'archer_headless', 'nobow', 'starter_glow', None, False),
    ('starter-mage', '', 'mage_{gender}_{motion}_v1.png', range(0, 1),
     'mage_headless', 'mage_nostaff', 'starter_glow', None, False),
]

# 갑옷 밑단 — 이 y부터 아래로 `feather` px에 걸쳐 발광이 사라진다(셀 좌표). 다리·부츠가 여기다.
#
# 밑단 높이는 티어마다 다르다 — 0번(가죽 조끼)은 엉덩이에서 끝나고 판금 티어는 허벅지까지 오는
# 스커트가 있다. 그래서 값은 고정하지 않고 **그림에서 찾는다**(`auto_leg_cut`): 갑옷 실루엣 폭이
# 급하게 줄어드는 줄(스커트 → 다리)이 밑단이다. 찾은 값은 동작·프레임마다 조금 달라도 되고,
# 아래 범위를 벗어나면 범위 끝으로 당긴다(공격 자세에서 팔·다리가 벌어져 폭이 요동칠 때 대비).
LEG_CUT_RANGE: dict[tuple[str, str, str], tuple[int, int]] = {
    ('warrior', 'male', 'idle'): (195, 265), ('warrior', 'female', 'idle'): (185, 265),
    ('warrior', 'male', 'walk'): (190, 265), ('warrior', 'female', 'walk'): (180, 265),
    ('warrior', 'male', 'attack'): (170, 245), ('warrior', 'female', 'attack'): (165, 245),
    ('archer', 'male', 'idle'): (180, 250), ('archer', 'female', 'idle'): (175, 250),
    ('archer', 'male', 'walk'): (175, 250), ('archer', 'female', 'walk'): (170, 250),
    ('archer', 'male', 'attack'): (160, 235), ('archer', 'female', 'attack'): (155, 235),
    ('mage', 'male', 'idle'): (220, 275), ('mage', 'female', 'idle'): (215, 275),
    ('mage', 'male', 'walk'): (215, 275), ('mage', 'female', 'walk'): (210, 275),
    ('mage', 'male', 'attack'): (195, 260), ('mage', 'female', 'attack'): (190, 260),
}
LEG_CUT_FALLBACK = {'warrior': 235, 'archer': 220, 'mage': 252}
LEG_CUT_MARGIN = 8
LEG_CUT_FEATHER = {'warrior': 24, 'archer': 24, 'mage': 20}

EDGE_FEATHER = 1


def auto_leg_cut(keep: np.ndarray, cell: int, span: tuple[int, int], fallback: int, drop: int = 10) -> int:
    """한 프레임(362px 셀)의 갑옷 밑단 — 실루엣 폭이 `drop`줄 사이에 가장 많이 줄어드는 줄."""
    block = keep[:, cell * CELL:(cell + 1) * CELL] > .5
    x0, x1 = 120, 340
    width = block[:, x0:x1].sum(axis=1)
    lo, hi = span
    best, best_score = fallback, 0
    for y in range(lo, min(hi, CELL - drop)):
        score = int(width[y]) - int(width[y + drop])
        if score > best_score:
            best, best_score = y, score
    return best if best_score >= 12 else fallback


def removed_region(source: np.ndarray, other: np.ndarray, steps: int = 2,
                   rgb_threshold: int | None = None, rgb_max_share: float = .10) -> np.ndarray:
    """`other` 판에서 지워지거나 덧칠된 자리(머리·무기).

    알파 차집합이 기본이다. `rgb_threshold` 를 주면 **양쪽 다 불투명한데 색이 바뀐 자리**도
    넣는다 — 무기 지운 판이 칼자국을 흐릿한 얼룩으로 남긴 경우(패왕의 전갑) 그 얼룩까지
    빠져야 칼날이 빛나지 않는다.

    단, `other` 판이 **그림 전체를 다시 칠한** 경우(궁수 `nobow/` — 겹치는 자리의 17~38%가
    색이 다르다)에는 그 차이를 쓰지 않는다. 그러면 갑옷 무늬까지 점박이로 빠져 발광이
    너덜너덜해진다. 칼자국 얼룩만 남기고 싶은 전사 `noweapon/` 은 4~7%라 기준(10%) 아래다.
    """
    source_alpha = source[..., 3] > 8
    other_alpha = other[..., 3] > 8
    region = source_alpha & ~other_alpha
    if rgb_threshold is not None:
        both = source_alpha & other_alpha
        diff = np.abs(source[..., :3].astype(np.int16) - other[..., :3].astype(np.int16)).max(axis=2)
        changed = both & (diff > rgb_threshold)
        if changed.sum() <= rgb_max_share * max(1, both.sum()):
            region |= changed
    # 1px 짜리 알파 잡음(같은 그림을 다시 구우며 생긴 가장자리 차이)은 무기·머리가 아니다 —
    # 침식으로 점을 지우고 다시 넓혀, 점박이 구멍이 생기지 않게 한다.
    region = dil(ero(region, 1), steps + 1)
    return region


def build_mask(source: np.ndarray, head: np.ndarray, weapon: np.ndarray | None,
               base: np.ndarray | None, leg_span: tuple[int, int], fallback: int, feather: int,
               hot_block: bool, strict_skin: bool = False) -> np.ndarray:
    alpha = source[..., 3] > 8
    keep = alpha.astype(np.float32)
    head_region = head_removed(source, removed_region(source, head), strict_skin)
    keep[head_region] = 0.0
    if weapon is not None:
        keep[removed_region(source, weapon, 2, rgb_threshold=28)] = 0.0
    keep[skin_strict(source) if strict_skin else skin_mask(source, base)] = 0.0
    if hot_block:
        keep[dil(hot(source), 1)] = 0.0
    keep = cleanup(keep > 0.5)
    keep = trim_upper_left(keep.astype(np.float32), head_region)
    # 머리 지운 자리의 아래 경계만 `head_weight` 로 부드럽게 (임계 처리를 마친 뒤에 곱해야
    # 경사가 남는다 — 이진화 뒤에 걸으면 다시 0/1 로 끊긴다).
    keep = (keep > 0.5).astype(np.float32)
    # 다리·부츠 — 프레임(362px 셀)마다 밑단을 찾아 그 아래로 부드럽게 끊는다.
    frames = source.shape[1] // CELL
    ys = np.mgrid[0:CELL, 0:CELL][0]
    weight = np.zeros_like(keep)
    for index in range(frames):
        cut_y = auto_leg_cut(keep, index, leg_span, fallback) + LEG_CUT_MARGIN
        weight[:, index * CELL:(index + 1) * CELL] = np.clip(1.0 - (ys - cut_y) / feather, 0.0, 1.0)
    keep *= weight
    # 실루엣 경계 1px만 살짝 부드럽게 — 계단이 보이지 않게.
    blurred = (keep * 4 + np.roll(keep, 1, 0) + np.roll(keep, -1, 0)
               + np.roll(keep, 1, 1) + np.roll(keep, -1, 1)) / 8.0
    keep = np.where(keep < 0.5, np.minimum(keep, blurred), np.maximum(keep, blurred))
    return np.clip(keep, 0, 1) * alpha


def write_mask(mask: np.ndarray, target: Path) -> None:
    rgba = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(mask, 0, 1) * 255).astype(np.uint8)
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(target, optimize=True)


def sheet_jobs():
    """(가족, 성별, 동작, 원본, 머리 지운 판, 무기 지운 판, 기준 시트, 출력) 하나씩."""
    for family, folder, pattern, tiers, head_dir, weapon_dir, out_dir, base_pattern, use_base in SHEETS:
        for gender in GENDERS:
            for tier in tiers:
                for motion in MOTIONS:
                    name = pattern.format(gender=gender, tier=tier, motion=motion)
                    source = PARTS / folder / name if folder else PARTS / name
                    head = PARTS / head_dir / name
                    weapon = PARTS / weapon_dir / name if weapon_dir else None
                    base = PARTS / base_pattern.format(gender=gender, motion=motion) if (base_pattern and use_base) else None
                    yield (family, gender, motion, source, head, weapon, base, PARTS / out_dir / name)


def build_all(preview: bool = False) -> int:
    total = 0
    for family, gender, motion, source, head, weapon, base, target in sheet_jobs():
        if not source.exists() or not head.exists():
            print(f'건너뜀(원본/머리 판 없음): {source.name}')
            continue
        base_family = 'archer' if family == 'starter-archer' else 'mage' if family == 'starter-mage' else family
        mask = build_mask(np.asarray(Image.open(source).convert('RGBA')),
                          np.asarray(Image.open(head).convert('RGBA')),
                          np.asarray(Image.open(weapon).convert('RGBA')) if weapon and weapon.exists() else None,
                          np.asarray(Image.open(base).convert('RGBA')) if base and base.exists() else None,
                          LEG_CUT_RANGE[(base_family, gender, motion)],
                          LEG_CUT_FALLBACK[base_family], LEG_CUT_FEATHER[base_family],
                          hot_block=base_family == 'mage', strict_skin=family.startswith('starter'))
        write_mask(mask, target)
        if preview:
            write_preview(source, mask, target.with_suffix('.preview.png'))
        total += 1
    return total


def write_preview(source: Path, mask: np.ndarray, target: Path) -> None:
    art = np.asarray(Image.open(source).convert('RGBA')).astype(np.float32)
    out = art.copy()
    for index, channel in enumerate((40, 255, 80)):
        out[..., index] = np.minimum(255.0, art[..., index] * (1 - mask) + channel * mask)
    out[..., 3] = np.maximum(art[..., 3], mask * 255)
    Image.fromarray(out.astype(np.uint8)).save(target)


def main() -> None:
    preview = '--preview' in sys.argv
    count = build_all(preview)
    print(f'마스크 {count}장 생성 완료{" (+ 미리보기)" if preview else ""}')


if __name__ == '__main__':
    main()
