#!/usr/bin/env python3
"""DJRPG 대검 10종 외형 파츠 빌더 — [작업 156].

`baseItems.weapon` 0~9번(두손검 ~ 패왕의 성검) 외형을 **본체 시트와 분리된 무기 파츠**로 만들어
남녀 전사 서기·걷기·공격 모든 프레임에 같은 규칙으로 얹는다. 갑옷 10종(작업 155)과 조합해도
조합마다 검을 다시 그리지 않는다.

## 왜 시트를 두 벌로 나누는가
기준 시트(`warrior_{성별}_{동작}_v1.png`)와 갑옷 시트에는 0번 기본 두손검이 **이미 그려져 있다**.
티어별 검을 그냥 위에 얹으면 뒤에 기본 검 칼날·가드가 삐져나온다. 그래서

  1. 본체 시트에서 기본 검 실루엣만 지운 **무기 없는 시트**를 만든다(`public/assets/pilot-25d/noweapon/`).
     지운 자리는 알파 0으로 두고 RGB만 주변에서 인페인트한다.
  2. 검은 **장착한 티어 하나만** 동적으로 읽어 본체 위에 겹쳐 그린다(`public/assets/pilot-25d/weapons/`).

## 좌표계
파츠와 앵커는 모두 기준 시트의 362px 셀 좌표계다. 파츠 PNG 는 `idle` 자세 그대로이고, 걷기·공격은
**팔에 붙은 강체**로 취급해 자세별 (가드 점, 회전각) 표로 옮긴다(`src/game/render/weapons.ts`의
`WEAPON_POSES`). 회전축이 손잡이(가드) 점이라 스윙 중에도 칼이 손에서 떨어지거나 길이가 줄지 않는다.

## 파츠를 뜨는 방법
승인 시안(`tools/weapon-src/male_weapon_{1..9}.png`, 1254²)은 같은 캐릭터·같은 자세에서 검만
티어별로 바꿔 그린 그림이다. 얼굴 NCC 로 본체를 기준 시트에 정합(배율·이동)한 뒤,
**기준 시트와 색이 크게 달라진 영역**과 **본체 실루엣 밖으로 나온 영역**을 검의 통로(가드→칼끝 +
손잡이 쪽) 안에서만 합쳐 검 실루엣을 뜬다. 손은 두 그림에서 거의 같아 색차가 작으므로 파츠에
섞이지 않고, 본체 시트의 손이 그대로 새 검을 쥔 모습으로 남는다.

실행: `python3 scripts/build-weapon-parts.py`             (에셋 생성)
      `python3 scripts/build-weapon-parts.py --preview`   (검수용 합성 이미지만)
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
SRC = os.path.join(ROOT, 'tools', 'weapon-src')
OUT_PARTS = os.path.join(PILOT, 'weapons')
OUT_NOWEAPON = os.path.join(PILOT, 'noweapon')

CELL = 362
GENDERS = ('male', 'female')
MOTIONS = ('idle', 'walk', 'attack')
TIERS = 10

# ── 자세 표 ────────────────────────────────────────────────────────────────
# 기준 시트(남)에서 측정한 (가드 점, 칼끝 점). idle 은 검 마스크 주축에서, 걷기는 마스크 강체
# 정합으로, 공격은 시트를 3배 확대해 좌표를 읽어 확정했다(작업 156 검수 이미지).
MALE_POSE = {
    'idle0': ((197.2, 220.7), (53.0, 337.3)),
    'walk0': ((192.2, 208.1), (45.0, 320.9)),
    'walk1': ((192.8, 206.2), (44.6, 317.7)),
    'walk2': ((196.7, 208.6), (45.7, 316.2)),
    'walk3': ((198.7, 204.6), (47.7, 312.2)),
    'attack0': ((133.0, 117.0), (33.0, 204.0)),
    'attack1': ((160.0, 62.0), (20.0, 132.0)),
    'attack2': ((247.0, 207.0), (340.0, 310.0)),
    'attack3': ((240.0, 272.0), (327.0, 348.0)),
}
POSE_KEYS = [f'idle{i}' for i in range(1)] + [f'walk{i}' for i in range(4)] + [f'attack{i}' for i in range(4)]
GUARD = MALE_POSE['idle0'][0]
TIP = MALE_POSE['idle0'][1]

# 검 통로: 가드→칼끝 띠 + 손잡이 쪽 띠. 파츠 실루엣을 이 안으로 제한한다.
BLADE_HALF_W = 34.0
HILT_LEN = 118.0
HILT_HALF_W = 26.0


def log(*a):
    print(*a, flush=True)


def read_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255


def save_rgba(path, arr, palette=True):
    """256색 팔레트 PNG 로 저장한다(기존 파일럿 시트와 같은 규격, 용량 1/4~1/5)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rgb = (np.clip(arr[..., :3], 0, 1) * 255 + .5).astype(np.uint8)
    a = (np.clip(arr[..., 3], 0, 1) * 255 + .5).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, a]), 'RGBA')
    if palette:
        img = img.quantize(colors=255, method=Image.FASTOCTREE)
    img.save(path, optimize=True)


# ── 시트 ───────────────────────────────────────────────────────────────────
def base_sheets(gender, motion):
    if motion == 'idle':
        return [read_rgba(os.path.join(PILOT, f'warrior_{gender}_idle_v1.png'))]
    full = read_rgba(os.path.join(PILOT, f'warrior_{gender}_{motion}_v1.png'))
    return [full[:, i * CELL:(i + 1) * CELL] for i in range(4)]


def sheet_paths(gender, armor, motion, headless):
    """(원본, noweapon) 경로. armor<0 은 기준 시트."""
    name = f'warrior_{gender}_{motion}_v1.png' if armor < 0 else f'warrior_{gender}_armor_{armor}_{motion}_v1.png'
    sub = 'headless/' if headless else ''
    if armor < 0:
        return (os.path.join(PILOT, sub + name),
                os.path.join(OUT_NOWEAPON, sub + name))
    return (os.path.join(PILOT, 'armors', sub + name),
            os.path.join(OUT_NOWEAPON, 'armors', sub + name))


def frames_of(rgba, motion):
    if motion == 'idle':
        return [rgba]
    return [rgba[:, i * CELL:(i + 1) * CELL] for i in range(4)]


# ── 검 실루엣 ──────────────────────────────────────────────────────────────
def steel_mask(rgba):
    rgb = rgba[..., :3]
    mx = rgb.max(2); mn = rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return ((rgba[..., 3] > .5) & (sat < .18) & (mx > .28)).astype(np.uint8)


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
    """작은 구멍만 메운다. 큰 빈 영역(다리·갑옷 사이)은 건드리지 않는다."""
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


def shift_mask(m, dx, dy):
    return np.roll(np.roll(m, dy, 0), dx, 1)


def align_prior(steel, prior, max_shift=9):
    """steel 안에서 prior 를 가장 많이 덮는 평행이동(px). max_shift 로 탐색을 좁힌다."""
    ys, xs = np.where(prior > 0)
    if len(xs) == 0:
        return 0, 0
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    tpl = prior[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
    img = steel.astype(np.float32)
    if tpl.shape[0] > img.shape[0] or tpl.shape[1] > img.shape[1]:
        return 0, 0
    res = cv2.matchTemplate(img, tpl, cv2.TM_CCORR)
    yy, xx = np.mgrid[0:res.shape[0], 0:res.shape[1]]
    ok = (np.abs(xx - x0) <= max_shift) & (np.abs(yy - y0) <= max_shift)
    res = np.where(ok, res, -1e9)
    i, j = np.unravel_index(np.argmax(res), res.shape)
    return int(j - x0), int(i - y0)


def sword_blob(cell, prior=None, min_overlap=.25):
    """셀에서 기본 검 실루엣. prior 가 있으면 그 자리에서 가장 많이 겹치는 성분만 쓴다."""
    st = steel_mask(cell)
    closed = cv2.morphologyEx(st, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(closed, 8)
    if n <= 1:
        return np.zeros(st.shape, np.uint8)
    if prior is None:
        areas = stats[1:, cv2.CC_STAT_AREA]
        keep = lab == 1 + int(np.argmax(areas))
    else:
        dx, dy = align_prior(st, prior)
        ref = shift_mask(prior, dx, dy)
        scores = []
        for i in range(1, n):
            area = int(stats[i, cv2.CC_STAT_AREA])
            if area < 80:
                scores.append(0.0)
                continue
            scores.append(float(((lab == i) & (ref > 0)).sum()) / area)
        top = max(scores) if scores else 0.0
        keep = np.zeros_like(st, bool)
        for i, sc in enumerate(scores, start=1):
            if sc >= max(min_overlap, top * .6):
                keep |= (lab == i)
    out = small_fill(keep.astype(np.uint8))
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    return small_fill(largest(out))


def erase_mask(cell, blob, grow=3):
    """기본 검 자리 + 그 주변의 어두운 테두리 픽셀까지 지운다.

    갑옷의 금속 부품을 함께 지우지 않도록 지우는 모양은 blob(기본 검 자리)에서 2px 밖으로만
    넓히고, 그 안의 어두운 픽셀(칼날 테두리·그림자)만 더한다.
    """
    m = (blob > 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
    # 칼날 테두리만 더한다 — 갑옷의 어두운 금속까지 먹지 않도록 blob 1px 밖으로 제한한다.
    near = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=1)
    dark = (cell[..., 3] > .05) & (cell[..., :3].max(2) < .30)
    m = ((m > 0) | (dark & (near > 0))).astype(np.uint8)
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))


def strip_sword(cell, mask, fill_kernel=45):
    """기본 검을 지우고, 검이 가리고 있던 본체 자리는 주변에서 이어 붙여 메운다.

    갑옷 시트는 검이 다리·허리를 가린 채로 그려져 있어, 그냥 지우면 다리 모양으로 구멍이 난다.
    지운 자리 중 본체 실루엣을 닫아서(모폴로지 close) 메워지는 곳만 알파 1로 되살리고, 색은
    주변에서 인페인트한다. 티어별 검을 그 위에 얹으면 대부분 가려지고, 남는 가장자리는
    부드러운 몸통색이라 구멍보다 눈에 덜 띈다.
    """
    body = (cell[..., 3] > .5).astype(np.uint8)
    body_wo = body.copy()
    body_wo[mask > 0] = 0
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (fill_kernel, fill_kernel))
    est = cv2.morphologyEx(body_wo, cv2.MORPH_CLOSE, ker)
    fill = (mask > 0) & (est > 0)
    rgb8 = (np.clip(cell[..., :3], 0, 1) * 255).astype(np.uint8)
    inp = cv2.inpaint(rgb8, mask, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
    out = cell.copy()
    out[..., :3] = np.where(mask[..., None] > 0, inp, cell[..., :3])
    alpha = cell[..., 3].copy()
    alpha[mask > 0] = 0
    alpha[fill] = 1
    # 검 잔여물이 남긴 작은 점 제거
    solid = (alpha > .5).astype(np.uint8)
    ncomp, lab, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    for i in range(1, ncomp):
        if int(stats[i, cv2.CC_STAT_AREA]) < 60:
            alpha[lab == i] = 0
    out[..., 3] = feather(alpha, 1) if fill.any() else alpha
    return out


# ── 공용 ───────────────────────────────────────────────────────────────────
def feather(alpha, r=1):
    k = np.ones((2 * r + 1, 2 * r + 1), np.float32) / ((2 * r + 1) ** 2)
    return cv2.filter2D(alpha.astype(np.float32), -1, k)



# ── 자세(강체) ─────────────────────────────────────────────────────────────
def axis_ends(blob, band=.16):
    ys, xs = np.where(blob > 0)
    if len(xs) < 50:
        return None
    pts = np.stack([xs, ys], 1).astype(np.float32)
    c = pts.mean(0)
    w, v = np.linalg.eigh(np.cov((pts - c).T))
    d = v[:, np.argmax(w)]
    proj = (pts - c) @ d
    lo, hi = proj.min(), proj.max()
    L = hi - lo
    lo_pts = pts[proj <= lo + band * L]
    hi_pts = pts[proj >= hi - band * L]
    if len(lo_pts) < len(hi_pts):
        return lo_pts.mean(0), hi_pts.mean(0), float(L)
    return hi_pts.mean(0), lo_pts.mean(0), float(L)


def angle_of(guard, tip):
    return float(np.degrees(np.arctan2(tip[1] - guard[1], tip[0] - guard[0])))


def female_pose(male_guard, male_tip, blob):
    ends = axis_ends(blob)
    if ends is None:
        return np.array(male_guard, np.float64), np.array(male_tip, np.float64)
    a_tip, a_guard, _ = ends
    want = angle_of(male_guard, male_tip)
    cand = [np.array(a_guard, np.float64), np.array(a_tip, np.float64)]
    tips = [np.array(a_tip, np.float64), np.array(a_guard, np.float64)]
    d = [abs((angle_of(c, t) - want + 180) % 360 - 180) for c, t in zip(cand, tips)]
    i = int(np.argmin(d))
    return cand[i], tips[i]


def base_blob(cell, pose):
    """기준 시트의 기본 검. 자세 표의 통로(가드→칼끝)를 prior 로 써서 고른다."""
    band = corridor(pose['guard'], pose['tip'])
    band = cv2.dilate(band, np.ones((9, 9), np.uint8))
    return sword_blob(cell, prior=band)


def pose_table():
    base_deg = angle_of(GUARD, TIP)
    table = {'male': {}, 'female': {}}
    male_blobs = {}
    for motion in MOTIONS:
        for i, cell in enumerate(base_sheets('male', motion)):
            key = f'{motion}{i}'
            g0, t0 = MALE_POSE[key]
            male_blobs[key] = base_blob(cell, {'guard': g0, 'tip': t0})
    for key in POSE_KEYS:
        guard, tip = MALE_POSE[key]
        table['male'][key] = {'guard': [round(guard[0], 1), round(guard[1], 1)],
                              'tip': [round(tip[0], 1), round(tip[1], 1)],
                              'rot': round(angle_of(guard, tip) - base_deg, 2)}
        motion, idx = key[:-1], int(key[-1])
        fcell = base_sheets('female', motion)[idx]
        fblob = sword_blob(fcell, prior=male_blobs[key])
        if fblob.sum() < 100:
            fblob = sword_blob(fcell)
        fg, ft = female_pose(np.array(guard, np.float64), np.array(tip, np.float64), fblob)
        table['female'][key] = {'guard': [round(float(fg[0]), 1), round(float(fg[1]), 1)],
                                'tip': [round(float(ft[0]), 1), round(float(ft[1]), 1)],
                                'rot': round(angle_of(fg, ft) - base_deg, 2)}
    return table


# ── 파츠 ───────────────────────────────────────────────────────────────────
def align_head(approved_rgb, base_cell, scale_range=(.276, .300)):
    """얼굴 NCC 로 승인 시안 → 셀 좌표 정합(배율·이동)을 잡는다."""
    bys, bxs = np.where(base_cell[..., 3] > .5)
    head_h = int((bys.max() - bys.min()) * .32)
    y0, y1 = int(bys.min()), int(bys.min()) + head_h
    cx = int(round(bxs.mean()))
    x0, x1 = max(0, cx - 60), min(CELL, cx + 60)
    tpl = base_cell[y0:y1, x0:x1, :3].mean(2).astype(np.float32)
    tm = (base_cell[y0:y1, x0:x1, 3] > .5).astype(np.float32)
    if tm.sum() < 50:
        return None, 0.0
    tpl = (tpl - tpl[tm > 0].mean()) / (tpl[tm > 0].std() + 1e-6)
    g = approved_rgb.mean(2).astype(np.float32)
    best = None
    for s in np.arange(scale_range[0], scale_range[1], .004):
        tw, th = int(round((x1 - x0) / s)), int(round((y1 - y0) / s))
        if tw >= g.shape[1] or th >= g.shape[0] or tw < 8 or th < 8:
            continue
        tpl_r = cv2.resize(tpl, (tw, th), interpolation=cv2.INTER_AREA)
        msk_r = cv2.resize(tm, (tw, th), interpolation=cv2.INTER_NEAREST)
        tpl_r = np.where(msk_r > .5, tpl_r, 0).astype(np.float32)
        sc = cv2.matchTemplate(g, tpl_r, cv2.TM_CCOEFF_NORMED, mask=(msk_r > .5).astype(np.float32))
        i, j = np.unravel_index(np.argmax(sc), sc.shape)
        v = float(sc[i, j])
        if best is None or v > best[0]:
            best = (v, s, int(j), int(i))
    v, s, j, i = best
    return np.array([[s, 0, x0 - s * j], [0, s, y0 - s * i]], np.float32), v


def hand_mask(base_cell, pose, blob):
    """기준 시트에서 검을 쥔 두 손 영역(검 덩어리 밖 + 손잡이 통로 안)."""
    hilt = np.zeros((CELL, CELL), np.uint8)
    g = np.array(pose['guard'], np.float64); t = np.array(pose['tip'], np.float64)
    d = (g - t) / max(np.linalg.norm(g - t), 1e-6)
    cv2.line(hilt, tuple(np.round(g - d * 8).astype(int)), tuple(np.round(g + d * HILT_LEN).astype(int)),
             1, int(HILT_HALF_W * 2))
    body = (base_cell[..., 3] > .5).astype(np.uint8)
    away = cv2.dilate(blob.astype(np.uint8), np.ones((13, 13), np.uint8))
    return ((body > 0) & (away == 0) & (hilt > 0)).astype(np.uint8)


def corridor(guard=GUARD, tip=TIP):
    out = np.zeros((CELL, CELL), np.uint8)
    g = np.array(guard, np.float64); t = np.array(tip, np.float64)
    d = (g - t) / max(np.linalg.norm(g - t), 1e-6)
    cv2.line(out, tuple(np.round(t - d * 18).astype(int)), tuple(np.round(g + d * HILT_LEN).astype(int)),
             1, int(HILT_HALF_W * 2))
    return out


def build_part(n, base_cell, hands):
    rgb = np.asarray(Image.open(os.path.join(SRC, f'male_weapon_{n}.png')).convert('RGB')).astype(np.float32) / 255
    M, score = align_head(rgb, base_cell)
    if M is None:
        raise SystemExit(f'얼굴 정합 실패: tier {n}')
    s = float(M[0, 0])
    cell_rgb = cv2.warpAffine(rgb, M, (CELL, CELL), flags=cv2.INTER_AREA)
    cell_fg = cv2.warpAffine((rgb.max(2) > .10).astype(np.float32), M, (CELL, CELL), flags=cv2.INTER_LINEAR)
    base_rgb = base_cell[..., :3]
    base_a = (base_cell[..., 3] > .5).astype(np.uint8)
    diff = cv2.GaussianBlur(np.abs(cell_rgb - base_rgb).max(2).astype(np.float32), (5, 5), 1.2)
    band = corridor()
    far = cv2.dilate(base_a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29)))
    outside = (cell_fg > .5) & (far == 0)
    changed = (diff > .20) & (cell_fg > .5)
    part = ((outside | changed) & (band > 0) & (cv2.dilate(hands, np.ones((5, 5), np.uint8)) == 0)).astype(np.uint8)
    # 손잡이 끝(폼멜)은 자세마다 손 위치가 달라 떠 보이므로 가드에서 40px 까지만 남긴다.
    g = np.array(GUARD, np.float64); t = np.array(TIP, np.float64)
    d = (g - t) / max(np.linalg.norm(g - t), 1e-6)
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    proj = (xx - g[0]) * d[0] + (yy - g[1]) * d[1]
    part[proj > 40] = 0
    part = cv2.morphologyEx(part, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    part = fill_holes(part)
    # 검에서 시작한 덩어리만 남긴다 — 시안 본체 가장자리의 잔여물을 잘라낸다.
    seed = (changed & (band > 0)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(part, 8)
    keep = np.zeros_like(part)
    for i in range(1, n):
        comp = lab == i
        if int(stats[i, cv2.CC_STAT_AREA]) < 200:
            continue
        if (comp & (seed > 0)).sum() >= 60:
            keep[comp] = 1
    # 검 본체(가장 큰 덩어리)와 6px 안에서 붙은 조각만 남긴다 — 시안에 같이 그려진 돌·파편 제거.
    big = largest(part)
    grown = cv2.dilate(big.astype(np.uint8), np.ones((7, 7), np.uint8))
    n2, lab2, stats2, _ = cv2.connectedComponentsWithStats(part, 8)
    kept = big.copy()
    for i in range(1, n2):
        comp = lab2 == i
        if int(stats2[i, cv2.CC_STAT_AREA]) < 40:
            continue
        if (comp & (grown > 0)).sum() > 30:
            kept[comp] = 1
    part = fill_holes(kept)
    alpha = feather(part.astype(np.float32), 1)
    alpha = np.clip((alpha - .25) / .75, 0, 1)
    out = np.dstack([cell_rgb, alpha])
    return out, {'tier': n, 'headNcc': round(score, 3), 'scale': round(s, 5),
                 'px': int((alpha > .5).sum())}


# ── 합성 ───────────────────────────────────────────────────────────────────
def over(*layers):
    out = layers[0].copy()
    for l in layers[1:]:
        a = l[..., 3:4]
        out[..., :3] = l[..., :3] * a + out[..., :3] * (1 - a)
        out[..., 3:4] = a + out[..., 3:4] * (1 - a)
    return out


def place_part(part, pose, guard=GUARD):
    g = np.array(pose['guard'], np.float64)
    M = cv2.getRotationMatrix2D((float(guard[0]), float(guard[1])), float(pose['rot']), 1.0)
    M[0, 2] += g[0] - guard[0]
    M[1, 2] += g[1] - guard[1]
    return cv2.warpAffine(part, M, (CELL, CELL), flags=cv2.INTER_LINEAR)


def flat(rgba, bg=(.16, .16, .18)):
    a = rgba[..., 3:4]
    return rgba[..., :3] * a + np.array(bg, np.float32) * (1 - a)


def montage(tiles, cols, pad=4, bg=.10):
    h, w = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    out = np.ones((rows * (h + pad) + pad, cols * (w + pad) + pad, 3), np.float32) * bg
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        out[pad + r * (h + pad):pad + r * (h + pad) + h, pad + c * (w + pad):pad + c * (w + pad) + w] = t
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


# ── 본체 시트 굽기 ─────────────────────────────────────────────────────────
def fit_prior(cell, prior):
    """이 시트의 검 위치에 맞춘 기본 검 모양(평행이동만)."""
    dx, dy = align_prior(steel_mask(cell), prior)
    return shift_mask(prior, dx, dy)


def stripped_frames(pose_tbl, gender, armor, motion, headless, priors):
    src, _ = sheet_paths(gender, armor, motion, headless)
    rgba = read_rgba(src)
    out = []
    for i, cell in enumerate(frames_of(rgba, motion)):
        base_prior = priors[f'{gender}:{motion}:{min(i, 3)}']
        if armor >= 0:
            # 갑옷 시트는 몸통 금속이 검과 붙어 있어 자기 분할을 믿지 않는다. 기준 검 모양을
            # 이 시트의 검 위치로 옮겨 그 모양만 지운다(다리·어깨를 함께 지우지 않는다).
            blob = fit_prior(cell, base_prior)
        else:
            # 기준 시트는 몸통에 금속이 없어 자기 분할이 정확하다. 남은 칼날 테두리를 덮도록
            # 기준 검 모양과 합친다.
            own = sword_blob(cell, prior=base_prior)
            blob = ((base_prior > 0) | (own > 0)).astype(np.uint8)
        out.append(strip_sword(cell, erase_mask(cell, blob)))
    return out


def base_priors(pose_tbl):
    priors = {}
    for gender in GENDERS:
        for motion in MOTIONS:
            for i, cell in enumerate(base_sheets(gender, motion)):
                pose = pose_tbl[gender][f'{motion}{i}']
                priors[f'{gender}:{motion}:{i}'] = base_blob(cell, pose)
    return priors


def bake_noweapon(pose_tbl, priors):
    """모든 본체 시트에서 기본 검을 지운 noweapon 판을 만든다."""
    count = 0
    for gender in GENDERS:
        for armor in [-1] + list(range(TIERS)):
            for headless in (False, True):
                for motion in MOTIONS:
                    src, dst = sheet_paths(gender, armor, motion, headless)
                    if not os.path.exists(src):
                        log(f'  ! 없음 {src}')
                        continue
                    frames = stripped_frames(pose_tbl, gender, armor, motion, headless, priors)
                    sheet = frames[0] if motion == 'idle' else np.concatenate(frames, axis=1)
                    save_rgba(dst, sheet)
                    count += 1
    return count


# ── 검수 이미지 ────────────────────────────────────────────────────────────
HELMET_IDLE = {'male': (228, 89, 1.0), 'female': (227, 88, 1.0)}
HELMET_ART = {'male': 9, 'female': 4}


def helmet_path(gender, index):
    if gender == 'female' and index <= 2:
        return os.path.join(PILOT, 'helmets', f'helm_female_{index}.png')
    return os.path.join(PILOT, 'helmets', f'helm_{index}.png')


def with_helmet(cell, gender, index):
    """본체(머리 없는 시트) 위에 투구 파츠를 얹는다 — 필드와 같은 앵커(아래 중앙)."""
    part = read_rgba(helmet_path(gender, index))
    x, y, scale = HELMET_IDLE[gender]
    h, w = part.shape[:2]
    out = cell.copy()
    left = int(round(x - w * scale / 2))
    top = int(round(y - h * scale))
    img = Image.fromarray((np.clip(part, 0, 1) * 255).astype(np.uint8))
    if scale != 1.0:
        img = img.resize((int(round(w * scale)), int(round(h * scale))), Image.LANCZOS)
    patch = np.asarray(img).astype(np.float32) / 255
    ph, pw = patch.shape[:2]
    for py in range(ph):
        cy = top + py
        if not (0 <= cy < out.shape[0]):
            continue
        for px in range(pw):
            cx = left + px
            if not (0 <= cx < out.shape[1]):
                continue
            a = patch[py, px, 3]
            if a <= 0:
                continue
            out[cy, cx, :3] = patch[py, px, :3] * a + out[cy, cx, :3] * (1 - a)
            out[cy, cx, 3] = a + out[cy, cx, 3] * (1 - a)
    return out


def idle_tile(pose_tbl, priors, parts, gender, armor, tier, helmet=True):
    if tier == 0:
        # 0번(기본 두손검)은 본체 시트에 그려져 있다 — 게임도 이 시트를 그대로 쓴다.
        src, _ = sheet_paths(gender, armor, 'idle', helmet)
        cell = read_rgba(src)
    else:
        cell = stripped_frames(pose_tbl, gender, armor, 'idle', helmet, priors)[0]
    if helmet:
        cell = with_helmet(cell, gender, HELMET_ART[gender])
    if tier >= 1:
        cell = over(cell, place_part(parts[tier], pose_tbl[gender]['idle0']))
    return cell


def preview(pose_tbl, parts, priors, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scale_tiles = lambda tiles, s: [np.asarray(Image.fromarray((np.clip(flat(t), 0, 1) * 255).astype(np.uint8))
                                            .resize((int(CELL * s), int(CELL * s)), Image.LANCZOS)).astype(np.float32) / 255
                                    for t in tiles]

    # 1) 갑옷·투구 조합 위 10종 서기 (한 줄에 0~9번)
    rows = []
    for gender, armor in (('male', 9), ('female', 4)):
        rows.extend(scale_tiles([idle_tile(pose_tbl, priors, parts, gender, armor, tier) for tier in range(TIERS)], .62))
    montage(rows, 10, bg=.12).save(os.path.join(out_dir, 'djrpg_weapon_10_idle_v1.png'))

    # 2) 얇은 검(2번)·화려한 검(8번) 남녀 걷기·공격 4프레임 — 기본 검 잔상 확인
    rows = []
    for gender in GENDERS:
        for motion in ('walk', 'attack'):
            for tier in (2, 5, 8):
                frames = stripped_frames(pose_tbl, gender, -1, motion, False, priors)
                for i, cell in enumerate(frames):
                    pose = pose_tbl[gender][f'{motion}{i}']
                    rows.append(flat(over(cell, place_part(parts[tier], pose))))
    montage(rows, 8, bg=.12).save(os.path.join(out_dir, 'djrpg_weapon_walk_attack_v1.png'))

    # 3) 실제 인게임 배율(본체 150px) 느낌
    rows = []
    for gender in GENDERS:
        tiles = [idle_tile(pose_tbl, priors, parts, gender, -1, tier, helmet=False) for tier in (0, 1, 2, 5, 8, 9)]
        rows.append(np.concatenate([np.asarray(Image.fromarray((np.clip(flat(t), 0, 1) * 255).astype(np.uint8))
                                              .resize((int(CELL * .42), int(CELL * .42)), Image.LANCZOS)).astype(np.float32) / 255
                                    for t in tiles], axis=1))
    out = np.concatenate(rows, axis=0)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).resize(
        (out.shape[1] * 2, out.shape[0] * 2), Image.NEAREST).save(os.path.join(out_dir, 'djrpg_weapon_ingame_scale_v1.png'))

    # 4) 내부 검수: 파츠만
    tiles = [flat(parts[n]) for n in range(1, TIERS)]
    montage(tiles, 3).save(os.path.join(out_dir, 'parts_only.png'))


def base_cell_idle(pose_tbl):
    return base_sheets('male', 'idle')[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--out', default=os.path.join(ROOT, '..', '..', 'downloads'))
    ap.add_argument('--skip-sheets', action='store_true')
    args = ap.parse_args()

    log('자세 표 계산...')
    pose_tbl = pose_table()
    for g in GENDERS:
        for k, v in pose_tbl[g].items():
            log(f'  {g} {k} guard={v["guard"]} rot={v["rot"]}')

    priors = base_priors(pose_tbl)
    hands = hand_mask(base_cell_idle(pose_tbl), {'guard': GUARD, 'tip': TIP}, priors['male:idle:0'])
    log('파츠 굽는 중...')
    base_cell = base_cell_idle(pose_tbl)
    parts = {0: None}
    meta = []
    for n in range(1, TIERS):
        part, info = build_part(n, base_cell, hands)
        parts[n] = part
        meta.append(info)
        log(f'  tier {n}: ncc {info["headNcc"]} scale {info["scale"]} px {info["px"]}')
        if not args.preview:
            save_rgba(os.path.join(OUT_PARTS, f'weapon_{n}_v1.png'), part)

    if not args.skip_sheets and not args.preview:
        log('noweapon 시트 굽는 중...')
        count = bake_noweapon(pose_tbl, priors)
        log(f'  {count}장 완료')

    log('검수 이미지...')
    preview(pose_tbl, parts, priors, args.out)
    with open(os.path.join(args.out, 'weapon-part-meta.json'), 'w') as f:
        json.dump({'poses': pose_tbl, 'parts': meta}, f, ensure_ascii=False, indent=1)
    log('완료')


if __name__ == '__main__':
    main()
