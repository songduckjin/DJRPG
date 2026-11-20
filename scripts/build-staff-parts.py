#!/usr/bin/env python3
"""DJRPG 마법사 지팡이 10종 외형 파츠·기본 지팡이 지운 본체 빌더 — [작업 201].

`staffBases` 0~9번(`견습생의 지팡이` ~ `대현자의 성지팡이`)을 **본체 시트와 분리된 지팡이
파츠**로 만들어 남녀 마법사 서기·걷기 4프레임·공격 4프레임에 같은 규칙으로 얹는다.
전사 대검 10종(작업 156, `scripts/build-weapon-parts.py`)·궁수 활 10종(작업 160,
`scripts/build-bow-parts.py`)과 같은 아키텍처다.

## 왜 시트를 두 벌로 나누는가
마법사 기본 시트에는 기본 지팡이(고목 대지팡이 모양의 긴 지팡이)가 **이미 그려져 있다**.
티어별 지팡이를 그냥 위에 얹으면 1~5번 짧은 완드 뒤로 기본 긴 지팡이가 삐져나온다. 그래서

  1. 본체 시트에서 기본 지팡이를 지운 판을 만든다(`public/assets/pilot-25d/mage_nostaff/`).
     지팡이가 가리고 있던 팔·옷 자리는 주변에서 인페인트하고, 손(주먹)은 남긴다.
  2. 지팡이는 **장착한 티어 하나만** 동적으로 읽어 본체 위에 겹쳐 그린다(`staffs/`).

## 좌표계
파츠와 앵커는 모두 기준 시트의 362px 셀 좌표계다. 파츠 PNG 는 서기(idle) 자세 그대로이고,
걷기·공격은 **손에 붙은 강체**로 취급해 자세별 (그립 점, 회전각) 표로 옮긴다
(`src/game/render/staffs.ts`의 `STAFF_POSES`). 회전축이 그립 점이라 어느 프레임에서도
지팡이가 손에서 떨어지거나 길이가 줄지 않는다.

## 파츠를 뜨는 방법
승인 시안(`tools/staff-src/male_staff_{0..9}.png`, 1254²)은 **같은 캐릭터·같은 자세에서
지팡이만 티어별로 바꿔 그린 그림**이다. 얼굴 NCC 로 본체를 기준 시트에 정합(배율·이동)한 뒤,
서기 지팡이 통로(머리 → 손 → 자루 끝) 안에서 **기본 지팡이를 지운 본체 실루엣 밖으로 나온
영역**을 지팡이 실루엣으로 뜬다(손은 본체 실루엣 안이라 파츠에 섞이지 않는다).
뽑은 파츠는 자기 자루 주축을 서기 기준 각도로 돌려 **모든 티어를 같은 각도로 정규화**한다
(시안마다 지팡이를 든 각도가 조금씩 달라서, 정규화하지 않으면 자세 표를 공유할 수 없다).

실행: `python3 scripts/build-staff-parts.py`             (에셋 생성)
      `python3 scripts/build-staff-parts.py --preview`   (검수용 합성 이미지만)
      `python3 scripts/build-staff-parts.py --skip-sheets` (파츠만)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:  # pragma: no cover
    sys.exit('opencv-python(cv2)가 필요합니다: pip install opencv-python-headless')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PILOT = os.path.join(ROOT, 'public', 'assets', 'pilot-25d')
SRC = os.path.join(ROOT, 'tools', 'staff-src')
OUT_PARTS = os.path.join(PILOT, 'staffs')
OUT_NOSTAFF = os.path.join(PILOT, 'mage_nostaff')
DOWNLOAD_OUT = '/workspace/downloads'

CELL = 362
GENDERS = ('male', 'female')
MOTIONS = ('idle', 'walk', 'attack')
TIERS = 10

# ── 서기 기준 자세 ─────────────────────────────────────────────────────────
# 남자 서기 셀(362px)을 3배로 확대해 읽은 값: 머리(장식 끝) → 자루 끝, 그리고 손이 쥔 그립 점.
# 파츠 PNG 의 앵커가 REF_GRIP 이고, 파츠는 이 자세 그대로다.
REF_HEAD = (65.0, -6.0)
REF_BUTT = (144.0, 326.0)
REF_GRIP = (92.0, 114.0)
REF_ANGLE = float(np.degrees(np.arctan2(REF_BUTT[1] - REF_HEAD[1], REF_BUTT[0] - REF_HEAD[0])))

# ── 자세 표 ────────────────────────────────────────────────────────────────
# (머리 점, 자루 끝, 그립 점). 셀을 확대해 읽은 값이며, 회전각은 서기 각도와의 차이다.
# 그립이 회전축이므로 이 값이 조금 어긋나도 지우는 띠가 기본 지팡이를 모두 덮는다.
POSES = {
    'male': {
        'idle0': ((66, 0), (144, 326), (93, 114)),
        'walk0': ((100, 43), (143, 310), (116, 150)),
        'walk1': ((107, 44), (151, 322), (121, 144)),
        'walk2': ((100, 49), (150, 320), (116, 147)),
        'walk3': ((103, 43), (156, 328), (120, 143)),
        'attack0': ((267, 54), (89, 245), (201, 124), (253, 62)),
        'attack1': ((282, 73), (75, 230), (186, 146), (252, 80)),
        'attack2': ((286, 103), (54, 147), (147, 129), (228, 128)),
        'attack3': ((300, 129), (61, 224), (256, 146), (303, 140)),
    },
    'female': {
        'idle0': ((84, 0), (168, 351), (113, 120)),
        'walk0': ((98, 0), (172, 300), (128, 121)),
        'walk1': ((103, 0), (172, 299), (128, 121)),
        'walk2': ((98, 0), (169, 301), (127, 121)),
        'walk3': ((97, 8), (182, 328), (126, 117)),
        'attack0': ((262, 15), (160, 302), (227, 114), (252, 32)),
        'attack1': ((142, 0), (35, 230), (105, 78), (220, 12)),
        'attack2': ((303, 62), (-1, 179), (83, 147), (212, 110)),
        'attack3': ((165, 218), (330, 155), (268, 180), (175, 215)),
    },
}

POSE_KEYS = ['idle0'] + [f'walk{i}' for i in range(4)] + [f'attack{i}' for i in range(4)]

# 지우는 띠: 자루 반폭 + 여유. 머리(장식)는 더 넓게 지운다.
SHAFT_HALF = 4.0
ERASE_MARGIN = 2.0
HEAD_HALF = 20.0
HEAD_LEN = 46.0
# 손 보호 반경: 주먹이 지팡이를 쥔 부분은 지우지 않는다(본체 실루엣 안이라 대부분 자동 제외).
HAND_GUARD = 9
# 파츠 통로 반폭(서기). 손 쪽에서 옷자락이 섞이지 않도록 띠를 좁게 잡는다.
PART_SHAFT_HALF = 11.0
PART_HEAD_HALF = 27.0
PART_HEAD_LEN = 58.0


def log(*a):
    print(*a, flush=True)


def read_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255


def save_rgba(path, arr, palette=True):
    """256색 팔레트 PNG 로 저장한다(기존 파일럿 시트와 같은 규격)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rgb = (np.clip(arr[..., :3], 0, 1) * 255 + .5).astype(np.uint8)
    a = (np.clip(arr[..., 3], 0, 1) * 255 + .5).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, a]), 'RGBA')
    if palette:
        img = img.quantize(colors=255, method=Image.FASTOCTREE)
    img.save(path, optimize=True)


# ── 시트 ───────────────────────────────────────────────────────────────────
def mage_sheet(gender, motion):
    return os.path.join(PILOT, f'mage_{gender}_{motion}_v1.png')


def frames_of(rgba, motion):
    if motion == 'idle':
        return [rgba]
    return [rgba[:, i * CELL:(i + 1) * CELL] for i in range(4)]


def base_sheets(gender, motion):
    return frames_of(read_rgba(mage_sheet(gender, motion)), motion)


# ── 기하 ───────────────────────────────────────────────────────────────────
def band(pts, half, head_half=0.0, head_len=0.0):
    """머리 → 자루 끝 띠. 머리 쪽 head_len 만큼은 head_half 로 넓힌다."""
    head, butt = np.array(pts[0], float), np.array(pts[1], float)
    mid = np.zeros((CELL, CELL), np.uint8)
    cv2.line(mid, tuple(np.round(head).astype(int)), tuple(np.round(butt).astype(int)),
             1, int(round(half * 2)))
    out = mid.astype(bool)
    if head_half > half and head_len > 0:
        d = butt - head
        L = float(np.linalg.norm(d)) or 1.0
        tip = head + d / L * min(head_len, L)
        wide = np.zeros((CELL, CELL), np.uint8)
        cv2.line(wide, tuple(np.round(head).astype(int)), tuple(np.round(tip).astype(int)),
                 1, int(round(head_half * 2)))
        out = out | wide.astype(bool)
    return out.astype(np.uint8)


def disk(center, radius):
    out = np.zeros((CELL, CELL), np.uint8)
    cv2.circle(out, tuple(np.round(center).astype(int)), int(radius), 1, -1)
    return out


def pose_angle(pose):
    head, butt = np.array(pose[0], float), np.array(pose[1], float)
    return float(np.degrees(np.arctan2(butt[1] - head[1], butt[0] - head[0])))


def feather(alpha, r=1):
    k = np.ones((2 * r + 1, 2 * r + 1), np.float32) / ((2 * r + 1) ** 2)
    return cv2.filter2D(alpha.astype(np.float32), -1, k)


def fill_holes(m):
    m = (m > 0).astype(np.uint8)
    ff = m.copy()
    h, w = m.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 1)
    out = m.copy()
    out[ff == 0] = 1
    return out


def small_fill(m, max_area=900):
    m = (m > 0).astype(np.uint8)
    inv = (1 - m).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, 4)
    out = m.copy()
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] <= max_area:
            out[lab == i] = 1
    return out


def largest(m, min_area=80):
    n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8), 8)
    if n <= 1:
        return np.zeros_like(m, np.uint8)
    areas = stats[1:, cv2.CC_STAT_AREA]
    best = 1 + int(np.argmax(areas))
    if stats[best, cv2.CC_STAT_AREA] < min_area:
        return np.zeros_like(m, np.uint8)
    return (lab == best).astype(np.uint8)


# ── 기본 지팡이 지우기 ─────────────────────────────────────────────────────
def color_fill(cell, steps=64):
    """투명 픽셀의 RGB 를 가장 가까운 불투명 색으로 채운다.

    인페인트가 투명 영역의 검정을 끌어오면 지운 자리가 새까맣게 남는다 — 지우는 띠가 옷 위를
    지날 때 그 검정이 검은 쐐기처럼 보이던 원인이다.
    """
    alpha = cell[..., 3].astype(np.float32)
    rgb = cell[..., :3] * alpha[..., None]
    weight = alpha.copy()
    k = np.ones((3, 3), np.float32)
    for _ in range(steps):
        if weight.min() > .99:
            break
        f2 = cv2.dilate(rgb, k)
        w2 = cv2.dilate(weight, k)
        grow = w2 > weight + 1e-6
        rgb = np.where(grow[..., None], f2, rgb)
        weight = np.where(grow, w2, weight)
    return rgb / np.maximum(weight, 1e-6)[..., None]


def inside_body(body, mask, n=None, reach=6):
    """띠 픽셀이 몸통 **안쪽**인가 — 투명 영역에서 reach px 보다 멀리 떨어진 몸통만 안쪽이다.

    법선 양쪽을 보는 방식은 머리카락·망토처럼 지팡이 뒤로 넓게 깔린 실루엣에서 지팡이를
    몸통으로 오판해 지우지 못했다(여성 마법사). 실루엣 가장자리에서 떨어진 픽셀만 남기면
    배경 쪽 지팡이는 지워지고, 몸통을 가로지르는 구간은 알파가 살아 인페인트 색으로 메워진다.
    """
    dist = cv2.distanceTransform(body.astype(np.uint8), cv2.DIST_L2, 5)
    return ((dist > reach) & (mask > 0)).astype(np.uint8)


def erase_staff(cell, mask, inside):
    """기본 지팡이를 지운다. 지팡이가 가리고 있던 몸통 자리는 알파를 되살리고 색만 인페인트한다."""
    body = (cell[..., 3] > .5).astype(np.uint8)
    fill = (mask > 0) & (inside > 0)
    rgb8 = (np.clip(color_fill(cell), 0, 1) * 255).astype(np.uint8)
    inp = cv2.inpaint(rgb8, mask, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
    out = cell.copy()
    out[..., :3] = np.where(mask[..., None] > 0, inp, cell[..., :3])
    alpha = cell[..., 3].copy()
    alpha[mask > 0] = 0
    alpha[fill] = 1
    solid = (alpha > .5).astype(np.uint8)
    ncomp, lab, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    for i in range(1, ncomp):
        if int(stats[i, cv2.CC_STAT_AREA]) < 40:
            alpha[lab == i] = 0
    out[..., 3] = feather(alpha, 1) if fill.any() else alpha
    return out


def strip_frames(gender, motion):
    out = []
    for i, cell in enumerate(base_sheets(gender, motion)):
        pose = POSES[gender][f'{motion}{i}']
        wide = band((pose[0], pose[1]), SHAFT_HALF + ERASE_MARGIN, HEAD_HALF, HEAD_LEN)
        # 띠 안에서도 **나무색 지팡이 픽셀만** 지운다. 띠 전체를 지우면 지팡이가 지나간 옷 위에
        # 인페인트 얼룩이 크게 남는다(지팡이는 옷보다 붉고, 옷은 푸른 회색이다).
        er = wide.copy()
        if len(pose) > 3:
            # 장식(마법 구슬)은 나무색이 아니라 색으로 못 잡는다 — 그 자리는 통째로 지운다.
            er[disk(pose[3], 26) > 0] = 1
        er[disk(pose[2], HAND_GUARD) > 0] = 0
        d = np.array(pose[1], float) - np.array(pose[0], float)
        d /= (np.linalg.norm(d) or 1.0)
        n = np.array([-d[1], d[0]])
        inside = inside_body((cell[..., 3] > .5).astype(np.uint8), er)
        out.append(erase_staff(cell, er, inside))
    return out


def bake_nostaff():
    count = 0
    for gender in GENDERS:
        for motion in MOTIONS:
            frames = strip_frames(gender, motion)
            sheet = frames[0] if motion == 'idle' else np.concatenate(frames, axis=1)
            save_rgba(os.path.join(OUT_NOSTAFF, f'mage_{gender}_{motion}_v1.png'), sheet)
            count += 1
    return count


# ── 파츠 ───────────────────────────────────────────────────────────────────
def keyed(path):
    """승인 시안(순수 검정 배경)을 RGBA 로. `build-mage-sheets.py` 와 같은 휘도 키잉."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - 5) / 21, 0, 1)
    return np.dstack([rgb / 255.0, alpha])


def body_ref(img):
    """(발끝 열의 몸통 중심 x, 발끝 y, 머리끝~발끝 높이). 지팡이는 몸통 중심 ±34px 밖이라 빠진다."""
    alpha = img[..., 3] > .09
    rows = np.nonzero(alpha.any(axis=1))[0]
    bottom = int(rows[-1])
    band = alpha[max(0, bottom - 8):bottom + 1]
    columns = np.nonzero(band.any(axis=0))[0]
    center = float((columns.min() + columns.max()) / 2)
    low, high = max(0, int(center) - 34), min(alpha.shape[1], int(center) + 35)
    top = int(rows[0])
    for row in range(int(rows[0]), bottom):
        if alpha[row, low:high].sum() >= 6:
            top = row
            break
    return center, bottom, float(bottom - top + 1)


def align_body(approved, base_cell):
    """승인 시안 → 셀 좌표 정합. **몸통**(발끝 중심 x·발끝 y·머리끝~발끝 높이)을 기준으로
    맞춘다 — 지팡이 길이가 티어마다 달라 시안 전체 상자를 쓰면 몸통이 좌우로 밀린다.
    `build-mage-sheets.py` 가 시트를 만들 때 쓴 배율(본체 337px·발끝 y=353)과 같은 계열이다."""
    base_cx, base_foot, base_h = body_ref(base_cell)
    cx, foot, height = body_ref(approved)
    scale = base_h / max(height, 1.0)
    return np.array([[scale, 0, base_cx - scale * cx],
                     [0, scale, base_foot - scale * foot]], np.float32), scale


def shaft_angle(part):
    """파츠 자루의 주축 각도(도). 그립 아래쪽(자루) 픽셀로 잰다."""
    ys, xs = np.where(part[..., 3] > .5)
    keep = ys > REF_GRIP[1] + 4
    if keep.sum() < 60:
        keep = np.ones_like(ys, dtype=bool)
    pts = np.stack([xs[keep], ys[keep]], 1).astype(np.float32)
    c = pts.mean(0)
    w, v = np.linalg.eigh(np.cov((pts - c).T))
    d = v[:, np.argmax(w)]
    if d[1] < 0:
        d = -d
    return float(np.degrees(np.arctan2(d[1], d[0])))


def rotate_about(img, angle, center):
    M = cv2.getRotationMatrix2D((float(center[0]), float(center[1])), float(angle), 1.0)
    return cv2.warpAffine(img, M, (CELL, CELL), flags=cv2.INTER_LINEAR)


def global_align(body_cell):
    """10개 시안은 같은 캐릭터·같은 자세·같은 해상도다 — 몸통 기준값의 중앙값으로 정합 하나를 쓴다
    (지팡이 장식이 머리 위로 솟은 시안에서 머리끝을 잘못 재는 것을 중앙값이 흡수한다)."""
    base_cx, base_foot, base_h = body_ref(body_cell)
    refs = []
    for n in range(TIERS):
        approved = keyed(os.path.join(SRC, f'male_staff_{n}.png'))
        cx, foot, height = body_ref(approved)
        if 300 < height < 1200:
            refs.append((cx, foot, height))
    cx = float(np.median([r[0] for r in refs]))
    foot = float(np.median([r[1] for r in refs]))
    height = float(np.median([r[2] for r in refs]))
    scale = base_h / height
    M = np.array([[scale, 0, base_cx - scale * cx], [0, scale, base_foot - scale * foot]], np.float32)
    return M, scale


def build_part(n, body_cell, body_mask, M, s):
    approved = keyed(os.path.join(SRC, f'male_staff_{n}.png'))
    cell_rgb = cv2.warpAffine(approved[..., :3].astype(np.float32), M, (CELL, CELL), flags=cv2.INTER_AREA)
    cell_fg = cv2.warpAffine(approved[..., 3].astype(np.float32), M, (CELL, CELL), flags=cv2.INTER_LINEAR)
    corridor = band((REF_HEAD, REF_BUTT), PART_SHAFT_HALF, PART_HEAD_HALF, PART_HEAD_LEN)
    outside = cv2.dilate(body_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) == 0
    part = ((cell_fg > .45) & (corridor > 0) & outside).astype(np.uint8)
    part[disk(REF_GRIP, 3) > 0] = 0
    part = cv2.morphologyEx(part, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    part = fill_holes(small_fill(part))
    # 지팡이는 주먹 자리에서 끊긴다 — 머리(장식) 쪽 덩어리와 자루 아래 덩어리 **둘 다** 살린다.
    n2, lab2, stats2, cents2 = cv2.connectedComponentsWithStats(part, 8)
    comps = [i for i in range(1, n2) if int(stats2[i, cv2.CC_STAT_AREA]) >= 90]
    keep = set()
    if comps:
        keep.add(min(comps, key=lambda i: stats2[i, cv2.CC_STAT_TOP]))
        # 자루 아래 덩어리는 주먹 바로 아래에서 시작해야 한다 — 발밑에 떨어진 잔여물을 막는다.
        lower = [i for i in comps if cents2[i][1] > REF_GRIP[1] + 4
                 and stats2[i, cv2.CC_STAT_TOP] <= REF_GRIP[1] + 45]
        if lower:
            keep.add(max(lower, key=lambda i: int(stats2[i, cv2.CC_STAT_AREA])))
        grown = np.zeros_like(part)
        for i in keep:
            grown |= (lab2 == i).astype(np.uint8)
        grown = cv2.dilate(grown, np.ones((11, 11), np.uint8))
        for i in comps:
            if i in keep:
                continue
            if ((lab2 == i) & (grown > 0)).sum() > 30:
                keep.add(i)
    kept = np.isin(lab2, list(keep)).astype(np.uint8) if keep else largest(part)
    part = fill_holes(kept)
    alpha = feather(part.astype(np.float32), 1)
    alpha = np.clip((alpha - .25) / .75, 0, 1)
    out = np.dstack([cell_rgb, alpha])
    # 티어별 각도 정규화는 하지 않는다 — 손에 쥔 각도가 티어마다 조금씩 다른 것이 자연스럽고,
    # 정규화 회전은 그립 앵커가 조금만 틀어져도 지팡이를 손에서 떼어 놓는다.
    return out, {'tier': n, 'scale': round(float(s), 5), 'rot': 0.0,
                 'px': int((alpha > .5).sum())}


# ── 합성·검수 ──────────────────────────────────────────────────────────────
def over(*layers):
    out = layers[0].copy()
    for l in layers[1:]:
        a = l[..., 3:4]
        out[..., :3] = l[..., :3] * a + out[..., :3] * (1 - a)
        out[..., 3:4] = a + out[..., 3:4] * (1 - a)
    return out


def place_part(part, gender, key):
    head, butt, grip = POSES[gender][key][:3]
    rot = pose_angle((head, butt)) - REF_ANGLE
    M = cv2.getRotationMatrix2D((float(REF_GRIP[0]), float(REF_GRIP[1])), float(rot), 1.0)
    M[0, 2] += grip[0] - REF_GRIP[0]
    M[1, 2] += grip[1] - REF_GRIP[1]
    return cv2.warpAffine(part, M, (CELL, CELL), flags=cv2.INTER_LINEAR)


def flat(rgba, bg=(.16, .16, .18)):
    a = rgba[..., 3:4]
    return rgba[..., :3] * a + np.array(bg, np.float32) * (1 - a)


def montage(tiles, cols, pad=4, bg=.10, label=None):
    h, w = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    out = np.ones((rows * (h + pad) + pad, cols * (w + pad) + pad, 3), np.float32) * bg
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        out[pad + r * (h + pad):pad + r * (h + pad) + h, pad + c * (w + pad):pad + c * (w + pad) + w] = t
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def frame_tile(gender, motion, key, parts, tier, scale=1.0):
    motion_index = 0 if motion == 'idle' else int(key[-1])
    cell = strip_frames(gender, motion)[motion_index]
    cell = over(cell, place_part(parts[tier], gender, key))
    img = Image.fromarray((np.clip(flat(cell), 0, 1) * 255).astype(np.uint8))
    if scale != 1.0:
        img = img.resize((int(CELL * scale), int(CELL * scale)), Image.LANCZOS)
    return np.asarray(img).astype(np.float32) / 255


def preview(parts, out_dir):
    os.makedirs(out_dir, exist_ok=True)

    # 1) 남녀 10종 서기 (실제 게임 배율 .42, 2배 확대해 육안 검수)
    rows = []
    for gender in GENDERS:
        tiles = [frame_tile(gender, 'idle', 'idle0', parts, t, .42) for t in range(TIERS)]
        rows.append(np.concatenate(tiles, axis=1))
    out = np.concatenate(rows, axis=0)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).resize(
        (out.shape[1] * 2, out.shape[0] * 2), Image.NEAREST).save(
        os.path.join(out_dir, 'djrpg_staff_ingame_v1.png'))

    # 2) 남녀 짧은(1)·긴(6)·최상위(9) 걷기·공격 4프레임 — 기본 지팡이 잔상 확인
    rows = []
    for gender in GENDERS:
        for tier in (1, 6, 9):
            for motion in ('walk', 'attack'):
                tiles = [frame_tile(gender, motion, f'{motion}{i}', parts, tier, .5) for i in range(4)]
                rows.append(np.concatenate(tiles, axis=1))
    montage(rows, 1, bg=.10).save(os.path.join(out_dir, 'djrpg_staff_walk_attack_v1.png'))

    # 3) 내부 검수: 파츠만
    tiles = [flat(parts[n]) for n in range(TIERS)]
    montage(tiles, 5).save(os.path.join(out_dir, 'staff_parts_only.png'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--skip-sheets', action='store_true')
    ap.add_argument('--out', default=DOWNLOAD_OUT)
    args = ap.parse_args()

    if not args.skip_sheets and not args.preview:
        log('기본 지팡이 지운 본체 시트 굽는 중...')
        log(f'  {bake_nostaff()}장 완료')

    body_cell = base_sheets('male', 'idle')[0]
    if os.path.exists(os.path.join(OUT_NOSTAFF, 'mage_male_idle_v1.png')) and not args.preview:
        body_cell = read_rgba(os.path.join(OUT_NOSTAFF, 'mage_male_idle_v1.png'))
    elif not args.preview:
        body_cell = strip_frames('male', 'idle')[0]
    body_mask = (body_cell[..., 3] > .5).astype(np.uint8)

    log('지팡이 파츠 굽는 중...')
    M, gscale = global_align(body_cell)
    log(f'정합 배율 {gscale:.5f}')
    parts, meta = {}, []
    for n in range(TIERS):
        part, info = build_part(n, body_cell, body_mask, M, gscale)
        parts[n] = part
        meta.append(info)
        log(f'  tier {n}: scale {info["scale"]} px {info["px"]}')
        if not args.preview:
            save_rgba(os.path.join(OUT_PARTS, f'staff_{n}_v1.png'), part)

    log('검수 이미지...')
    preview(parts, args.out)
    with open(os.path.join(args.out, 'staff-part-meta.json'), 'w') as f:
        json.dump({'refAngle': round(REF_ANGLE, 3), 'poses': POSES, 'parts': meta}, f, ensure_ascii=False, indent=1)
    log('완료')


if __name__ == '__main__':
    main()
