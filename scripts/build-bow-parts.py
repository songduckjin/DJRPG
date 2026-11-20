#!/usr/bin/env python3
"""DJRPG 궁수 활 10종 외형 파츠·기본 활 지운 본체 빌더 — [작업 160].

`baseItems`의 궁수 활 0~9번(`사냥꾼의 활` ~ `패왕의 신궁`)을 **본체 시트와 분리된 활 파츠**로
만들어 남녀 궁수 서기·걷기 4프레임·사격 4프레임에 같은 규칙으로 얹는다. 전사 대검 10종
(작업 156, `scripts/build-weapon-parts.py`)과 같은 아키텍처다.

## 왜 시트를 두 벌로 나누는가
스타터 가죽 궁수 시트에는 0번 기본 활(`사냥꾼의 활`)이 **이미 그려져 있다**. 티어별 활을 그냥
위에 얹으면 뒤에 기본 활의 활대·시위가 삐져나온다. 그래서

  1. 본체 시트에서 기본 활의 **활대만** 지운 판을 만든다(`public/assets/pilot-25d/nobow/`).
     시위(활줄)는 1px 실선이라 지우지 않고 남긴다 — 사격 프레임에서 시위가 얼굴 쪽으로
     당겨진 모양이 그대로 살아 있고, 새 활 파츠가 그 위에 얹혀도 위화감이 없다.
     지운 자리(활대가 가리고 있던 다리·옷)는 주변에서 인페인트한다.
  2. 활은 **장착한 티어 하나만** 동적으로 읽어 본체 위에 겹쳐 그린다(`public/assets/pilot-25d/bows/`).

## 좌표계
파츠와 앵커는 모두 기준 시트의 362px 셀 좌표계다. 파츠 PNG 는 서기(idle) 자세 그대로이고,
걷기·사격은 **손에 붙은 강체**로 취급해 자세별 (그립 점, 회전각) 표로 옮긴다
(`src/game/render/bows.ts`의 `BOW_POSES`). 회전축이 그립 점이라 어느 프레임에서도 활이
손에서 떨어지거나 길이가 줄지 않는다.

## 파츠를 뜨는 방법
승인 시안(`downloads/bow_preview/male_bow_{1..9}.png`, 1254²)은 **같은 캐릭터·같은 자세에서
활만 티어별로 바꿔 그린 그림**이다(0번은 스타터 시안과 픽셀 단위로 같다). 얼굴 NCC 로 본체를
기준 시트에 정합(배율·이동)한 뒤, 0번 시안과 **색이 달라진 영역**(활)과 **본체 밖으로 나온
영역**을 활 통로 안에서만 합쳐 활 실루엣을 뜬다. 손은 두 그림에서 같아 색차가 없고, 덧씌워진
피부 마스크로 한 번 더 뺀다 — 본체 시트의 손이 새 활을 쥔 모습 그대로 남는다.

실행: `python3 scripts/build-bow-parts.py`             (에셋 생성)
      `python3 scripts/build-bow-parts.py --preview`   (검수용 합성 이미지만)
      `python3 scripts/build-bow-parts.py --skip-sheets` (파츠만)
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
SRC = os.path.join(ROOT, 'tools', 'bow-src')
OUT_PARTS = os.path.join(PILOT, 'bows')
OUT_NOBOW = os.path.join(PILOT, 'nobow')
WORKSPACE = '/workspace/downloads/bow_preview'
DOWNLOAD_OUT = os.path.join(ROOT, '..', '..', 'downloads')

CELL = 362
GENDERS = ('male', 'female')
MOTIONS = ('idle', 'walk', 'attack')
TIERS = 10

# ── 기준 활(사냥꾼의 활) 중심선 ────────────────────────────────────────────
# 남자 서기 셀(362px)을 4배로 확대해 읽은 활대 중심선. 파츠 앵커도 이 좌표계다.
SPINE = [(287, 96, 2.2), (279, 112, 3.2), (272, 132, 4.2), (264, 150, 4.6), (255, 168, 4.8),
         (243, 182, 5.0), (232, 193, 5.0), (222, 204, 5.0), (210, 215, 5.0), (196, 226, 4.8),
         (180, 238, 4.4), (162, 250, 3.8), (145, 261, 3.0), (136, 266, 2.0)]
# 왼손이 활을 쥔 그립 점(서기). 파츠 PNG 의 앵커이자 자세 표의 회전축이다.
REF_GRIP = (232.0, 193.0)

# ── 자세 씨앗 ─────────────────────────────────────────────────────────────
# (그립 점, 활 위쪽 끝점) — 셀을 확대해 읽은 값. 회전각은 서기 방향과의 차이로 계산한다.
# 손이 활을 쥔 자리(그립)가 회전축이므로, 여기 값이 조금 어긋나도 지우는 띠(±11px)가
# 기본 활을 모두 덮는다.
SEEDS = {
    'male': {
        'idle0': ((232, 193), (287, 96)),
        'walk0': ((219, 192), (259, 107)),
        'walk1': ((226, 188), (268, 96)),
        'walk2': ((219, 194), (255, 109)),
        'walk3': ((224, 193), (258, 107)),
        'attack0': ((200, 220), (255, 193)),
        'attack1': ((240, 157), (206, 74)),
        'attack2': ((239, 156), (209, 86)),
        'attack3': ((242, 152), (216, 82)),
    },
    'female': {
        'idle0': ((238, 180), (290, 64)),
        'walk0': ((219, 192), (254, 97)),
        'walk1': ((228, 190), (262, 95)),
        'walk2': ((217, 202), (248, 103)),
        'walk3': ((224, 199), (256, 99)),
        'attack0': ((215, 212), (272, 182)),
        'attack1': ((238, 152), (205, 62)),
        'attack2': ((238, 155), (208, 62)),
        'attack3': ((242, 155), (220, 68)),
    },
}

POSE_KEYS = ['idle0'] + [f'walk{i}' for i in range(4)] + [f'attack{i}' for i in range(4)]

# 지우는 띠: 중심선 반폭(표)에 이 여유를 더한다. 기본 활 테두리까지 덮는다.
# 서기는 자세 씨앗이 정확해(기준 자세) 띠를 좁게 잡아 지우는 면적을 줄이고, 걷기·사격은
# 손 위치가 프레임마다 달라 여유를 크게 준다.
ERASE_MARGIN = 8.0
ERASE_MARGIN_BY_MOTION = {'idle': 2.6, 'walk': 8.0, 'attack': 8.0}
# 색을 채울 때 띠 바로 바깥에서 표본을 뜨는 거리
ERASE_GAP = 3.0
# 손 보호 반경: 손가락이 활을 쥔 부분은 지우지 않는다.
HAND_GUARD = 8


def log(*a):
    print(*a, flush=True)


def read_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255


def save_rgba(path, arr, palette=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rgb = (np.clip(arr[..., :3], 0, 1) * 255 + .5).astype(np.uint8)
    a = (np.clip(arr[..., 3], 0, 1) * 255 + .5).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, a]), 'RGBA')
    if palette:
        img = img.quantize(colors=255, method=Image.FASTOCTREE)
    img.save(path, optimize=True)


def feather(alpha, r=1):
    k = np.ones((2 * r + 1, 2 * r + 1), np.float32) / ((2 * r + 1) ** 2)
    return cv2.filter2D(alpha.astype(np.float32), -1, k)


# ── 시트 ───────────────────────────────────────────────────────────────────
def sheet_path(gender, motion):
    return os.path.join(PILOT, f'archer_{gender}_{motion}_v1.png')


def frames_of(gender, motion):
    rgb = read_rgba(sheet_path(gender, motion))
    if motion == 'idle':
        return [rgb]
    return [rgb[:, i * CELL:(i + 1) * CELL] for i in range(4)]


# ── 자세(강체) ─────────────────────────────────────────────────────────────
def spine_points(grip, ang, step=.5):
    """중심선을 촘촘히 다시 뜨고, 같은 자리의 반폭(활 두께/2)도 함께 돌려준다."""
    P = np.array([(x, y) for x, y, _ in SPINE], np.float64)
    H = np.array([h for _, _, h in SPINE], np.float64)
    g = np.array(REF_GRIP, np.float64)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], max(2, int(cum[-1] / step)))
    xy = np.stack([np.interp(s, cum, P[:, 0]), np.interp(s, cum, P[:, 1])], 1)
    half = np.interp(s, cum, H)
    th = np.radians(ang)
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    return (xy - g) @ R.T + np.array(grip, np.float64), half


def normals_of(pts):
    tan = np.gradient(pts, axis=0)
    tan /= np.maximum(np.linalg.norm(tan, axis=1, keepdims=True), 1e-6)
    return np.stack([-tan[:, 1], tan[:, 0]], 1)


def idle_angle():
    ref = SEEDS['male']['idle0']
    return float(np.degrees(np.arctan2(ref[1][1] - ref[0][1], ref[1][0] - ref[0][0])))


def pose_table():
    base = idle_angle()
    table = {}
    for gender in GENDERS:
        table[gender] = {}
        for key in POSE_KEYS:
            grip, tip = SEEDS[gender][key]
            ang = float(np.degrees(np.arctan2(tip[1] - grip[1], tip[0] - grip[0]))) - base
            table[gender][key] = {'grip': [round(float(grip[0]), 1), round(float(grip[1]), 1)],
                                  'rot': round(ang, 2)}
    return table


# ── 기본 활 지운 본체 ──────────────────────────────────────────────────────
def bow_band(grip, rot, margin=ERASE_MARGIN):
    """기본 활대를 덮는 띠(자세마다 같은 폭 비율) − 손 보호 원."""
    pts, half = spine_points(grip, rot)
    n = normals_of(pts)
    wide = (half + margin)[:, None]
    poly = np.vstack([pts + n * wide, (pts - n * wide)[::-1]])
    band = np.zeros((CELL, CELL), np.uint8)
    cv2.fillPoly(band, [np.round(poly).astype(np.int32)], 1)
    guard = np.zeros_like(band)
    cv2.circle(guard, (int(round(grip[0])), int(round(grip[1]))), HAND_GUARD, 1, -1)
    return (band & (1 - guard)).astype(np.uint8)


def skin_mask(cell):
    """피부(손) 마스크 — 색 채우기에서 손 색이 번지지 않도록 뺀다."""
    rgb = cell[..., :3]
    mx = rgb.max(2); mn = rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    lum = rgb @ np.array([.299, .587, .114], np.float32)
    m = ((lum > .33) & (sat > .16) & (cell[..., 3] > .5)).astype(np.uint8)
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))


def strip_bow(cell, grip, rot, margin=ERASE_MARGIN):
    """기본 활대를 지우고, 활이 가리고 있던 본체(다리·옷)는 주변 본체 색으로 이어 붙인다.

    지운 자리 색은 띠의 법선 양쪽에서 **본체(피부 제외) 픽셀만** 표본해 가까운 쪽에 가중치를
    준다(다리·소매의 결이 이어지도록). 알파는 지운 자리를 모폴로지 close 로 닫아 본체 안쪽이면
    살리고, 본체 밖(활이 허공으로 나온 부분)이면 투명하게 둔다.
    """
    body = (cell[..., 3] > .5).astype(np.uint8)
    mask = bow_band(grip, rot, margin)
    # 그립 근처의 손(피부)은 활을 쥔 손가락이라 지우지 않는다 — 띠가 손을 스치면 손이 옷 색으로
    # 메워진다. 활대 자체도 밝고 따뜻해 피부로 잡히므로 보호는 그립 32px 안으로만 제한한다.
    guard = np.zeros((CELL, CELL), np.uint8)
    cv2.circle(guard, (int(round(grip[0])), int(round(grip[1]))), 32, 1, -1)
    skin_near = cv2.dilate(skin_mask(cell), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) & guard
    mask = (mask & (1 - skin_near)).astype(np.uint8)
    if mask.sum() < 50:
        return cell
    pts, _ = spine_points(grip, rot)
    ys, xs = np.nonzero(mask)
    d2 = (xs[:, None] - pts[None, :, 0]) ** 2 + (ys[:, None] - pts[None, :, 1]) ** 2
    idx = d2.argmin(1)
    n = normals_of(pts)[idx]
    skin = skin_mask(cell)
    usable = (mask == 0) & (skin == 0)
    # 띠 가장자리에서 바깥으로 나가며 처음 만나는 비-띠 픽셀을 본다:
    # 본체면 그 색을 표본으로 쓰고, 바탕이면 그쪽은 "허공"이다.
    side = {}
    for sign in (1, -1):
        dists = np.arange(1, 34, 1.0)
        found = np.full(len(xs), -1, np.int32)
        for k, dist in enumerate(dists):
            px = np.clip(np.round(xs + n[:, 0] * dist * sign).astype(int), 0, CELL - 1)
            py = np.clip(np.round(ys + n[:, 1] * dist * sign).astype(int), 0, CELL - 1)
            hit = (found < 0) & (mask[py, px] == 0)
            found[hit] = k
            body_hit = hit & (body[py, px] > 0) & usable[py, px]
            if k == 0:
                first_body = np.zeros(len(xs), bool)
                first_px = px.copy()
                first_py = py.copy()
            sel = body_hit & ~first_body
            first_body |= sel
            first_px[sel] = px[sel]
            first_py[sel] = py[sel]
            if found.all():
                break
        side[sign] = (first_body, first_px, first_py)
    okA, xsA, ysA = side[1]
    okB, xsB, ysB = side[-1]
    pts2, half2 = spine_points(grip, rot)
    offs = np.zeros(len(xs), np.float32)
    for i in range(len(xs)):
        d2 = (pts2[:, 0] - xs[i]) ** 2 + (pts2[:, 1] - ys[i]) ** 2
        j = int(np.argmin(d2))
        offs[i] = (xs[i] - pts2[j, 0]) * n[i, 0] + (ys[i] - pts2[j, 1]) * n[i, 1]
    hmax = float((half2 + margin).max())
    t = np.clip((offs + hmax) / (2 * hmax), 0, 1)
    rgb = cell[..., :3].copy()
    colA = np.where(okA[:, None], cell[np.clip(ysA, 0, CELL - 1), np.clip(xsA, 0, CELL - 1), :3], 0)
    colB = np.where(okB[:, None], cell[np.clip(ysB, 0, CELL - 1), np.clip(xsB, 0, CELL - 1), :3], 0)
    both = okA & okB
    col = np.where(both[:, None], colA * (1 - t[:, None]) + colB * t[:, None],
                   np.where(okA[:, None], colA, np.where(okB[:, None], colB, cell[ys, xs, :3])))
    # 채운 색에 결(texture)을 얹는다 — 지운 자리 주변의 고주파 성분을 아래로 25px 옮겨 더한다.
    # (가죽의 세로 결이 이어지도록. 평평한 면으로 남으면 다리 위에 붙인 띠처럼 보인다.)
    shift = np.zeros_like(rgb)
    shift[25:] = rgb[:-25]
    hf = rgb - cv2.GaussianBlur(rgb, (0, 0), 3.0)
    hf_shift = shift - cv2.GaussianBlur(shift, (0, 0), 3.0)
    col = col + hf_shift[ys, xs] * .65
    rgb[ys, xs] = col
    w = np.zeros((CELL, CELL), np.float32)
    w[ys, xs] = 1
    w = cv2.GaussianBlur(w, (0, 0), 1.1)[..., None]
    rgb = rgb * (1 - w) + cv2.GaussianBlur(rgb, (0, 0), .9) * w
    alpha = cell[..., 3].copy()
    alpha[mask > 0] = 0
    alpha[ys[both], xs[both]] = 1
    out = np.dstack([rgb, feather(alpha, 1)])
    return strip_freestanding_bow(out, grip, rot)


def strip_freestanding_bow(cell, grip, rot, wide=30.0, min_thick=1.9, min_area=40):
    """본체 밖으로 뻗은 기본 활대 조각을 지운다(사격 프레임 보정).

    사격 프레임의 활은 시위를 당기며 활대가 휘어, 강체 띠에서 벗어난 끝부분이 남는다.
    활대는 두께가 있고 본체 실루엣 밖에 떠 있으므로, **본체 안쪽(테두리에서 4px 이상 들어간
    곳)을 보호한 채** 넓은 띠 안에서 두께 2.4px 이상인 덩어리만 지운다. 시위(1px)와 화살대는
    얇아서 남고, 벨트·옷은 본체 보호 영역에 들어가 남는다.
    """
    body = (cell[..., 3] > .5).astype(np.uint8)
    if body.sum() < 100:
        return cell
    protect = cv2.dilate(cv2.erode(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))),
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
    band = bow_band(grip, rot, wide)
    cand = (band > 0) & (protect == 0) & (body > 0)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), 8)
    kill = np.zeros_like(body)
    for i in range(1, n):
        comp = lab == i
        if int(st[i, cv2.CC_STAT_AREA]) < min_area:
            continue
        dist = cv2.distanceTransform(comp.astype(np.uint8), cv2.DIST_L2, 3)
        if float(dist.max()) >= min_thick:
            kill |= comp
    if not kill.any():
        return cell
    out = cell.copy()
    out[kill, 3] = 0
    return out


def bake_nobow(table, out_dir):
    count = 0
    for gender in GENDERS:
        for motion in MOTIONS:
            frames = []
            for i, cell in enumerate(frames_of(gender, motion)):
                pose = table[gender][f'{motion}{i}']
                frames.append(strip_bow(cell, pose['grip'], pose['rot'], ERASE_MARGIN_BY_MOTION[motion]))
            sheet = frames[0] if motion == 'idle' else np.concatenate(frames, axis=1)
            save_rgba(os.path.join(out_dir, f'archer_{gender}_{motion}_v1.png'), sheet)
            count += 1
    return count


# ── 파츠 ───────────────────────────────────────────────────────────────────
def align_head(approved_rgb, base_cell, scale_range=(.26, .32)):
    bys, bxs = np.where(base_cell[..., 3] > .5)
    head_h = int((bys.max() - bys.min()) * .32)
    y0, y1 = int(bys.min()), int(bys.min()) + head_h
    cx = int(round(bxs.mean()))
    x0, x1 = max(0, cx - 55), min(CELL, cx + 55)
    tpl = base_cell[y0:y1, x0:x1, :3].mean(2).astype(np.float32)
    tm = (base_cell[y0:y1, x0:x1, 3] > .5).astype(np.float32)
    tpl = (tpl - tpl[tm > 0].mean()) / (tpl[tm > 0].std() + 1e-6)
    g = approved_rgb.mean(2).astype(np.float32)
    best = None
    for s in np.arange(scale_range[0], scale_range[1], .002):
        tw, th = int(round((x1 - x0) / s)), int(round((y1 - y0) / s))
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


def source_path(tier):
    candidate = os.path.join(SRC, f'male_bow_{tier}.png')
    if os.path.exists(candidate):
        return candidate
    return os.path.join(WORKSPACE, f'male_bow_{tier}.png')


def build_part(tier, ref_rgb, ref_rgba_cell, M, body_far, hand, spine_con):
    img = np.asarray(Image.open(source_path(tier)).convert('RGB')).astype(np.float32) / 255
    fg = (img.max(2) > .07).astype(np.uint8)
    diff = cv2.GaussianBlur(np.abs(img - ref_rgb).max(2).astype(np.float32), (5, 5), 1.2)
    inside = body_far > 0
    raw = (((diff > .13) & inside) | ((fg > 0) & (~inside) & (diff > .05))).astype(np.uint8)
    corridor = np.zeros(raw.shape, np.uint8)
    cv2.polylines(corridor, [np.round(spine_con).astype(np.int32)], False, 1, 300)
    raw &= corridor
    raw &= (1 - hand)
    raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
    # 닫기 연산이 활 곡선 안쪽의 빈 공간(검은 배경)까지 메우면 파츠에 검은 쐐기가 생긴다 —
    # 시안에서 배경(거의 검정)인 픽셀은 다시 뺀다.
    raw &= (img.max(2) > .05).astype(np.uint8)
    # 활 몸통과 이어진 덩어리만 남긴다(허리·벨트 잔여물 제거).
    band = np.zeros(raw.shape, np.uint8)
    cv2.polylines(band, [np.round(spine_con).astype(np.int32)], False, 1, 90)
    n, lab, st, _ = cv2.connectedComponentsWithStats(raw, 8)
    keep = np.zeros_like(raw)
    for i in range(1, n):
        if int(st[i, cv2.CC_STAT_AREA]) < 400:
            continue
        comp = lab == i
        if (comp & (band > 0)).sum() < 200:
            continue
        keep[comp] = 1
    # 시위(활줄)는 파츠에서 뺀다 — 본체 시트에 남긴 시위가 사격 자세까지 그대로 이어지므로
    # 파츠에 또 그리면 줄이 두 개로 보인다. 활대(두께 10px 이상)는 살아남는 열림 연산이다.
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # 작은 구멍만 메운다.
    inv = (1 - keep).astype(np.uint8)
    k2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, k2):
        if int(st2[i, cv2.CC_STAT_AREA]) <= 3000:
            keep[lab2 == i] = 1
    # 셀 좌표계로 옮긴다.
    mask_cell = cv2.warpAffine(keep.astype(np.float32), M, (CELL, CELL), flags=cv2.INTER_AREA)
    rgb_cell = cv2.warpAffine(img, M, (CELL, CELL), flags=cv2.INTER_AREA)
    alpha = np.clip((mask_cell - .18) / .55, 0, 1)
    # 그립 자리는 손이 이미 본체에 그려져 있다 — 파츠에서도 같은 자리를 비워 손이 활을 쥔 모양이
    # 한 번만 그려지게 한다(파츠가 손을 따라 움직이는 사고를 막는다).
    grip_guard = np.zeros((CELL, CELL), np.float32)
    cv2.circle(grip_guard, (int(round(REF_GRIP[0])), int(round(REF_GRIP[1]))), 9, 1, -1)
    grip_guard = cv2.GaussianBlur(grip_guard, (0, 0), 2.0)
    alpha = alpha * (1 - grip_guard)
    alpha = feather(alpha, 1)
    part = np.dstack([rgb_cell, alpha])
    return part, {'tier': tier, 'px': int((alpha > .5).sum())}


def prep_concept(ref_rgba_cell):
    ref_rgb = np.asarray(Image.open(source_path(0)).convert('RGB')).astype(np.float32) / 255
    M, score = align_head(ref_rgb, ref_rgba_cell)
    Minv = cv2.invertAffineTransform(M)
    spine_con = np.c_[np.array([(x, y) for x, y, _ in SPINE], np.float64), np.ones(len(SPINE))] @ Minv.T
    grip_con = Minv @ np.array([REF_GRIP[0], REF_GRIP[1], 1.0])
    body = (ref_rgb.max(2) > .06).astype(np.uint8)
    body_far = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    mx = ref_rgb.max(2); mn = ref_rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    skin = ((mx > .28) & (sat > .13)).astype(np.uint8)
    near = np.zeros(ref_rgb.shape[:2], np.uint8)
    cv2.circle(near, tuple(np.round(grip_con[:2]).astype(int)), 58, 1, -1)
    hand = cv2.dilate((skin & near), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    return ref_rgb, M, body_far, hand, spine_con, score


# ── 합성 ───────────────────────────────────────────────────────────────────
def over(*layers):
    out = layers[0].copy()
    for l in layers[1:]:
        a = l[..., 3:4]
        out[..., :3] = l[..., :3] * a + out[..., :3] * (1 - a)
        out[..., 3:4] = a + out[..., 3:4] * (1 - a)
    return out


def place_part(part, pose):
    g = np.array(pose['grip'], np.float64)
    # cv2 의 양수 각은 화면(y 아래)에서 반시계방향이다. 게임(Pixi)은 시계방향이 양수라 부호를 뒤집는다.
    M = cv2.getRotationMatrix2D((float(REF_GRIP[0]), float(REF_GRIP[1])), -float(pose['rot']), 1.0)
    M[0, 2] += g[0] - REF_GRIP[0]
    M[1, 2] += g[1] - REF_GRIP[1]
    return cv2.warpAffine(part, M, (CELL, CELL), flags=cv2.INTER_LINEAR)


def flat(rgba, bg=(.14, .14, .16)):
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


def resize_tiles(tiles, scale):
    out = []
    for t in tiles:
        img = Image.fromarray((np.clip(flat(t), 0, 1) * 255).astype(np.uint8))
        out.append(np.asarray(img.resize((int(CELL * scale), int(CELL * scale)), Image.LANCZOS)).astype(np.float32) / 255)
    return out


def preview(table, parts, nobow, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    # 1) 서기 10종 — 남녀 (0번은 본체 시트 그대로)
    rows = []
    for gender in GENDERS:
        tiles = []
        for tier in range(TIERS):
            base = frames_of(gender, 'idle')[0] if tier == 0 else nobow[f'{gender}:idle:0']
            cell = base
            if tier >= 1:
                cell = over(base, place_part(parts[tier], table[gender]['idle0']))
            tiles.append(cell)
        rows.extend(resize_tiles(tiles, .62))
    montage(rows, 10, bg=.12).save(os.path.join(out_dir, 'djrpg_bow_10_idle_v1.png'))

    # 2) 걷기·사격 4프레임 (남녀, 2·5·8번) — 그립·회전 확인
    rows = []
    for gender in GENDERS:
        for motion in ('walk', 'attack'):
            for tier in (2, 5, 8):
                for i in range(4):
                    pose = table[gender][f'{motion}{i}']
                    base = nobow[f'{gender}:{motion}:{i}']
                    rows.append(flat(over(base, place_part(parts[tier], pose))))
    montage(rows, 8, bg=.12).save(os.path.join(out_dir, 'djrpg_bow_walk_attack_v1.png'))

    # 3) 실제 인게임 배율(본체 150px) 느낌
    rows = []
    for gender in GENDERS:
        tiles = []
        for tier in (0, 1, 2, 5, 8, 9):
            base = frames_of(gender, 'idle')[0] if tier == 0 else nobow[f'{gender}:idle:0']
            cell = base if tier == 0 else over(base, place_part(parts[tier], table[gender]['idle0']))
            tiles.append(cell)
        rows.append(np.concatenate(resize_tiles(tiles, .42), axis=1))
    out = np.concatenate(rows, axis=0)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).resize(
        (out.shape[1] * 2, out.shape[0] * 2), Image.NEAREST).save(os.path.join(out_dir, 'djrpg_bow_ingame_scale_v1.png'))

    # 4) 파츠만
    tiles = [flat(parts[n]) for n in range(1, TIERS)]
    montage(tiles, 3).save(os.path.join(out_dir, 'bow_parts_only.png'))

    # 5) 본체(활 지운 시트) 확인 — 남녀 서기·걷기·사격
    rows = []
    for gender in GENDERS:
        for motion in MOTIONS:
            for i in range(4 if motion != 'idle' else 1):
                rows.append(flat(nobow[f'{gender}:{motion}:{i}']))
    montage(rows, 5).save(os.path.join(out_dir, 'bow_nobow_check.png'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--skip-sheets', action='store_true')
    ap.add_argument('--out', default=DOWNLOAD_OUT)
    args = ap.parse_args()

    table = pose_table()
    for gender in GENDERS:
        for key in POSE_KEYS:
            log(f'  {gender} {key} grip={table[gender][key]["grip"]} rot={table[gender][key]["rot"]}')

    ref_cell = frames_of('male', 'idle')[0]
    ref_rgb, M, body_far, hand, spine_con, score = prep_concept(ref_cell)
    log(f'시안 정합: ncc={score:.3f} scale={M[0,0]:.4f}')

    parts = {0: None}
    meta = []
    for tier in range(1, TIERS):
        part, info = build_part(tier, ref_rgb, ref_cell, M, body_far, hand, spine_con)
        parts[tier] = part
        meta.append(info)
        log(f'  tier {tier}: px {info["px"]}')
        if not args.preview:
            save_rgba(os.path.join(OUT_PARTS, f'bow_{tier}_v1.png'), part)

    if not args.preview and not args.skip_sheets:
        n = bake_nobow(table, OUT_NOBOW)
        log(f'nobow {n}장 완료')
    nobow = {}
    for gender in GENDERS:
        for motion in MOTIONS:
            for i, cell in enumerate(frames_of(gender, motion)):
                pose = table[gender][f'{motion}{i}']
                nobow[f'{gender}:{motion}:{i}'] = strip_bow(cell, pose['grip'], pose['rot'], ERASE_MARGIN_BY_MOTION[motion])

    log('검수 이미지...')
    preview(table, parts, nobow, args.out)
    with open(os.path.join(args.out, 'bow-part-meta.json'), 'w') as f:
        json.dump({'poses': table, 'parts': meta, 'align': {'scale': float(M[0, 0]), 'ncc': round(score, 4)}}, f,
                  ensure_ascii=False, indent=1)
    log('완료')


if __name__ == '__main__':
    main()
