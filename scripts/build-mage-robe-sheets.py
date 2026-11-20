"""마법사 로브 10종 시트 빌드(작업 201).

승인 확정본(서기)과 `images --edit`로 만든 걷기·공격 원본을 기준 마법사 시트의 362px 셀
좌표계로 정합해 `public/assets/pilot-25d/robes/` 아래 54장을 만든다.

입력
    서기       downloads/mage_armor_preview/{gender}_robe_{0..4}.png
               downloads/mage_armor_preview/{gender}_robe_{5..9}_v5.png   (확정 v5)
    걷기·공격  downloads/mage_robe_gen/raw/{gender}_{walk,attack}_{1..9}.png
기준            public/assets/pilot-25d/mage_{gender}_{motion}_v1.png
출력            public/assets/pilot-25d/robes/mage_{gender}_robe_{tier}_{motion}_v1.png (tier 1~9)

0번(가죽 조끼)은 기준 시트(스타터 천 로브)를 그대로 쓰므로 만들지 않는다.
전사·궁수 갑옷 시트와 같은 362px 셀 좌표계·256색 팔레트 PNG 규격이다.
"""
import json
import os
import sys

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = str(Path(__file__).resolve().parent.parent)
REF_ROOT = f'{ROOT}/public/assets/pilot-25d'
OUT = f'{REF_ROOT}/robes'
PREVIEW = '/workspace/downloads/mage_armor_preview'
RAW = '/workspace/downloads/mage_robe_gen/raw'
REPORT = '/workspace/downloads/mage_robe_gen/fit_report.json'
CELL = 362
GENDERS = ['male', 'female']
MOTIONS = ['idle', 'walk', 'attack']
ANCHOR_TIERS = [1, 2, 3, 4]
PAD = 200


# ── 키잉·분할·저장 ───────────────────────────────────────────────────────────
def key_black(rgb: np.ndarray, bgmax: int = 4, band: int = 6) -> np.ndarray:
    L = rgb.max(axis=2)
    bg = (L <= bgmax).astype(np.uint8)
    n, lab = cv2.connectedComponents(bg, connectivity=4)
    if n <= 1:
        alpha = np.full(L.shape, 255, np.uint8)
    else:
        border = set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
        border.discard(0)
        bgm = np.isin(lab, list(border)) if border else np.zeros_like(bg, bool)
        bd = cv2.dilate(bgm.astype(np.uint8), np.ones((2 * band + 1, 2 * band + 1), np.uint8)) > 0
        ramp = np.clip((L.astype(np.float32) - bgmax) / 18.0, 0, 1) * 255.0
        alpha = np.where(bd, ramp, 255.0)
        alpha[bgm] = 0
        alpha = cv2.GaussianBlur(alpha.astype(np.float32), (3, 3), 0.6)
        alpha[bgm] = 0
    return np.dstack([rgb, np.clip(alpha, 0, 255).astype(np.uint8)])


def split_cells(rgba: np.ndarray, n: int = 4):
    h, w = rgba.shape[:2]
    cols = (rgba[:, :, 3] > 12).any(axis=0)
    cuts = [int(round(i * w / n)) for i in range(n + 1)]
    cuts[0], cuts[-1] = 0, w
    win = max(2, w // n // 12)
    for i in range(1, n):
        g = cuts[i]
        lo, hi = max(cuts[i - 1] + 8, g - win), min(cuts[i + 1] - 8, g + win)
        best, bestscore = g, None
        for c in range(lo, hi + 1):
            score = np.count_nonzero(cols[c:c + 2])
            if bestscore is None or score < bestscore:
                best, bestscore = c, score
        cuts[i] = best
    return [rgba[:, cuts[i]:cuts[i + 1]] for i in range(n)], cuts


def save_png(rgba: np.ndarray, path: str, colors: int = 255, alpha_cut: int = 90) -> str:
    rgba = rgba.copy()
    opaque = rgba[:, :, 3] >= alpha_cut
    rgb = np.where(opaque[:, :, None], rgba[:, :, :3], 0).astype(np.uint8)
    q = Image.fromarray(rgb, 'RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    idx = np.array(q).astype(np.uint16) + 1
    idx[~opaque] = 0
    pal = np.array(q.getpalette()[:colors * 3], dtype=np.uint8).reshape(-1, 3)
    newpal = np.zeros((256, 3), np.uint8)
    newpal[1:1 + len(pal)] = pal[:255]
    out = Image.fromarray(idx.astype(np.uint8), 'P')
    out.putpalette(newpal.reshape(-1).tolist())
    out.save(path, optimize=True, transparency=0)
    return path


# ── 기준·원본 셀 ─────────────────────────────────────────────────────────────
def ref_cells(gender: str, motion: str):
    a = np.array(Image.open(f'{REF_ROOT}/mage_{gender}_{motion}_v1.png').convert('RGBA'))
    return [a] if motion == 'idle' else [a[:, i * CELL:(i + 1) * CELL] for i in range(4)]


def src_cells(gender: str, motion: str, tier: int):
    if motion == 'idle':
        name = f'{gender}_robe_{tier}.png' if tier < 5 else f'{gender}_robe_{tier}_v5.png'
        rgba = key_black(np.array(Image.open(f'{PREVIEW}/{name}').convert('RGB')))
        return [rgba]
    rgba = key_black(np.array(Image.open(f'{RAW}/{gender}_{motion}_{tier}.png').convert('RGB')))
    return split_cells(rgba)[0]


def extent(a: np.ndarray):
    m = a[:, :, 3] > 40
    ys = np.where(m.any(1))[0]
    xs = np.where(m.any(0))[0]
    return int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())


def core_span(a: np.ndarray, frac: float = .22):
    """몸통 세로 기둥의 높이 — 망토·스커트가 넓어져도 변하지 않는 부분."""
    m = a[:, :, 3] > 40
    ys = np.where(m.any(1))[0]
    top, bot = int(ys.min()), int(ys.max())
    band = m[top + int((bot - top) * .35):top + int((bot - top) * .55)]
    xs = np.where(band.any(0))[0]
    cx = int((xs.min() + xs.max()) / 2)
    half = max(6, int((xs.max() - xs.min()) * frac / 2))
    col = m[:, max(0, cx - half):cx + half]
    rows = np.where(col.any(1))[0]
    return int(rows.min()), int(rows.max())


def core_scale(ref: np.ndarray, src: np.ndarray) -> float:
    rt, rb = core_span(ref)
    st, sb = core_span(src)
    return (rb - rt + 1) / max(1, sb - st + 1)


def group_scale(gender: str, motion: str) -> float:
    ratios = []
    for tier in ANCHOR_TIERS:
        for r, s in zip(ref_cells(gender, motion), src_cells(gender, motion, tier)):
            ratios.append(core_scale(r, s))
    return float(np.median(ratios))


# ── 정합 ────────────────────────────────────────────────────────────────────
def warp_rgba(rgba: np.ndarray, s: float, tx: float, ty: float) -> np.ndarray:
    m = np.array([[s, 0, tx], [0, s, ty]], np.float32)
    return cv2.warpAffine(rgba, m, (CELL, CELL), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT,
                          borderValue=(0, 0, 0, 0))


def upper_mask(mask: np.ndarray, band: float = .62) -> np.ndarray:
    ys = np.where(mask.any(1))[0]
    top = int(ys.min())
    height = int(ys.max()) - top + 1
    out = np.zeros_like(mask)
    out[top:top + int(height * band)] = mask[top:top + int(height * band)]
    return out


def core_boxes(a: np.ndarray, frac: float = .22):
    """(몸통 세로 기둥 중심 x, 실루엣 바닥 y) — 배율을 건드리지 않고 자리를 잡는 기준."""
    m = a[:, :, 3] > 40
    ys = np.where(m.any(1))[0]
    top, bot = int(ys.min()), int(ys.max())
    band = m[top + int((bot - top) * .35):top + int((bot - top) * .55)]
    xs = np.where(band.any(0))[0]
    cx = (xs.min() + xs.max()) / 2
    return cx, bot


def iou_of(src_cell: np.ndarray, ref_mask: np.ndarray, s: float, tx: float, ty: float) -> float:
    w = warp_rgba(src_cell, s, tx, ty)
    m = w[:, :, 3] > 40
    return np.count_nonzero(m & ref_mask) / max(1, np.count_nonzero(m | ref_mask))


def best_shift(src_cell: np.ndarray, ref_mask: np.ndarray, s: float):
    """발끝·몸통 중심을 기준으로 먼저 놓고, 상체(머리·어깨) 겹침을 최대로 다듬는다.

    실루엣 전역 상관만 쓰면 망토·스커트가 넓은 티어에서 엉뚱한 자리(빈 칸·반대쪽)로
    붙는 경우가 있어, 기준 시트와 같은 몸통 기둥·발끝을 출발점으로 삼는다.
    """
    ref_cx, ref_bot = core_boxes_from_mask(ref_mask)
    src_cx, src_bot = core_boxes(src_cell)
    tx0, ty0 = ref_cx - src_cx * s, ref_bot - src_bot * s
    up = upper_mask(ref_mask).astype(np.float32)
    best = (-1.0, tx0, ty0)
    for scale in (s * .99, s, s * 1.01):
        w = warp_rgba(src_cell, scale, tx0, ty0)
        canvas = np.zeros((CELL + 2 * PAD, CELL + 2 * PAD), np.float32)
        canvas[PAD:PAD + CELL, PAD:PAD + CELL] = (w[:, :, 3] > 40).astype(np.float32)
        res = cv2.matchTemplate(canvas, up, cv2.TM_CCORR)
        for idx in np.argsort(res.ravel())[::-1][:24]:
            py, px = np.unravel_index(idx, res.shape)
            tx, ty = int(px) - PAD, int(py) - PAD
            if abs(tx - tx0) > 70 or abs(ty - ty0) > 40:
                continue
            value = iou_of(src_cell, ref_mask, scale, tx, ty)
            if value > best[0]:
                best = (value, tx, ty, scale)
    if len(best) == 3:
        value, tx, ty, scale = iou_of(src_cell, ref_mask, s, tx0, ty0), tx0, ty0, s
        best = (value, tx, ty, scale)
    value, tx, ty, scale = best
    for step in (2, 1):
        improved = True
        while improved:
            improved = False
            for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
                v = iou_of(src_cell, ref_mask, scale, tx + dx, ty + dy)
                if v > value + 1e-6:
                    value, tx, ty, improved = v, tx + dx, ty + dy, True
    return value, tx, ty, scale


def core_boxes_from_mask(mask: np.ndarray):
    ys = np.where(mask.any(1))[0]
    top, bot = int(ys.min()), int(ys.max())
    band = mask[top + int((bot - top) * .35):top + int((bot - top) * .55)]
    xs = np.where(band.any(0))[0]
    return (xs.min() + xs.max()) / 2, bot


def build_sheet(gender: str, motion: str, tier: int, s: float):
    ref = ref_cells(gender, motion)
    src = src_cells(gender, motion, tier)
    if len(src) != len(ref):
        raise SystemExit(f'{gender} {motion} {tier}: 프레임 수 {len(src)} != {len(ref)}')
    frames, meta = [], []
    for i, (r, cell) in enumerate(zip(ref, src)):
        ref_mask = r[:, :, 3] > 40
        iou, tx, ty, fs = best_shift(cell, ref_mask, s)
        w = warp_rgba(cell, fs, tx, ty)
        # 칸 경계 1px 은 비운다 — 게임이 362px 칸으로 정확히 자를 때 옆 칸이 섞이지 않게.
        w[:, 0, 3] = 0
        w[:, -1, 3] = 0
        m = w[:, :, 3] > 40
        ys = np.where(m.any(1))[0]
        rt, rb = core_span(r)
        meta.append(dict(frame=i, scale=round(float(fs), 4), iou=round(float(iou), 4), tx=tx, ty=ty,
                         top=int(ys.min()), bot=int(ys.max()), refCoreTop=rt, refCoreBot=rb))
        frames.append(w)
    return (np.concatenate(frames, axis=1) if len(frames) > 1 else frames[0]), meta


def main(tiers=None, only=None):
    os.makedirs(OUT, exist_ok=True)
    try:
        report = json.load(open(REPORT))
    except Exception:
        report = {}
    for gender in GENDERS:
        for motion in MOTIONS:
            if only and f'{gender}:{motion}' != only:
                continue
            key = f'{gender}/{motion}/scale'
            s = report.get(key) or group_scale(gender, motion)
            report[key] = round(s, 4)
            for tier in (tiers or range(1, 10)):
                body, meta = build_sheet(gender, motion, tier, s)
                name = f'mage_{gender}_robe_{tier}_{motion}_v1.png'
                path = f'{OUT}/{name}'
                save_png(body, path)
                report[f'{gender}/{motion}/{tier}'] = meta
                print(gender, motion, tier, 's', round(s, 4),
                      'iou', [m['iou'] for m in meta], 'top', [m['top'] for m in meta],
                      f'{os.path.getsize(path)//1024}KB', flush=True)
                json.dump(report, open(REPORT, 'w'), indent=1)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a]
    only = next((a for a in args if ':' in a), None)
    tiers = [int(a) for a in args if a.isdigit()]
    main(tiers or None, only)
