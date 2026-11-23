#!/usr/bin/env python3
"""Restore internal alpha of the DJRPG 2.5D pilot character/equipment sheets (task 227 → backlog 7).

Why: the pre-rendered sheets in `public/assets/pilot-25d/` keep an internal semi-transparent
alpha channel (56% of the mage's opaque pixels sit at 0 < a < 255, median 198/255). On the
wasteland floor the ground tile therefore shows through the body. The value is not in the
runtime code — it is baked into the PNGs.

Rule (keeps anti-aliasing intact, never touches effects)
  * the **body** = connected opaque components of at least `MIN_BODY` px. Dust specks and
    one-pixel fringe stay exactly as they are.
  * **dropped holes** — fully transparent islands *inside* the body silhouette (the sheets lost
    4~8px dots of alpha in the middle of the robe) are filled: alpha 255 and the colour of the
    nearest body pixel, so the hole never shows the ground or a dark dot.
  * **inside** the filled silhouette every pixel with alpha >= `ALPHA_FLOOR` becomes 255.
  * the **outer 1 px** ring of the silhouette keeps its original gradient (no stair-step rim).

Task 227 used "distance from transparent background > 2px" for the inside test, which silently
did nothing once the sheets had holes punched in them (the distance is small right next to every
hole) — that is why the mage robe still let the ground through. Measuring on the **filled**
silhouette (this version) fixes the rule for good.

Effects (`fx_*`, aura, glow, vfx) are out of scope — only the character/equipment folders in
TARGET_DIRS are processed, and the indexed sheets keep their indexed storage.

Storage: a sheet that was an indexed PNG stays indexed (exact palette when the restored image
still fits 256 colours; otherwise the rim alpha is rounded to the smallest step that fits, so
the colour is never re-quantised). RGBA sheets stay RGBA.

Run: `python3 scripts/restore-pilot-alpha.py [--dry] [--only file.png ...] [--paths a.png b.png]`
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PILOT = os.path.join(ROOT, 'public', 'assets', 'pilot-25d')
TARGET_DIRS = [
    '', 'noweapon', 'noweapon/headless', 'noweapon/armors', 'headless', 'armors', 'armors/headless',
    'helmets', 'helmets/atk', 'weapons', 'archer_armors', 'archer_armors/nobow', 'archer_armors/headless',
    'archer_helms', 'archer_headless', 'archer_headless/nobow', 'nobow',
    'bows', 'mage_helms', 'mage_headless', 'mage_headless/nostaff', 'mage_nostaff', 'robes',
    'robes/headless', 'staffs',
]
MIN_BODY = 300           # px — a connected blob this big is body, smaller is dust/fringe
MIN_BODY_ALPHA = 200     # 그 덩어리의 **중앙 알파**가 이보다 낮으면 몸이 아니라 연기·글로우다(손대지 않는다)
MAX_HOLE = 64            # px — 실루엣 안에서 메우는 구멍의 최대 넓이(4~8px 점). 더 큰 구멍은 그림의 일부다
ALPHA_FLOOR = 8          # below this the pixel is background haze, not body
ALPHA_STEPS = (1, 2, 4, 8, 16, 32)


def _pack(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.uint32)
    alpha = arr[:, :, 3].astype(np.uint32)
    return (rgb[:, :, 0] << 16) | (rgb[:, :, 1] << 8) | rgb[:, :, 2] | (alpha << 24)


def _save_indexed(arr: np.ndarray, path: str) -> tuple[int, int]:
    """Save without changing any colour. Returns (colours, alpha step used).

    팔레트 PNG는 256칸 안에 **(색, 알파) 짝**을 모두 담아야 한다. 몸을 불투명하게 바꾸면 같은 색이
    두 알파로 생기면서 256칸을 넘는 시트가 생긴다(마법사·궁수 머리 없는 시트). 그때는 테두리를
    뭉개거나 색을 양자화하지 않고 **RGBA로 저장**한다 — 색과 테두리 알파를 하나도 잃지 않는 쪽을 골랐다
    (파일이 조금 커지지만 눈에 보이는 손실이 없다).
    """
    h, w = arr.shape[:2]
    for step in ALPHA_STEPS:
        if step == 1:
            packed = _pack(arr)
        else:
            rounded = arr.copy()
            alpha = arr[:, :, 3].astype(np.int32)
            # **올림**한다 — 테두리 알파가 내려가면 안티앨리어싱이 깎여 계단이 생긴다.
            rounded[:, :, 3] = np.where(alpha < 255, np.minimum(255, ((alpha + step - 1) // step) * step), 255)
            packed = _pack(rounded)
        uniq, inverse = np.unique(packed.reshape(-1), return_inverse=True)
        if len(uniq) <= 256:
            image = Image.fromarray(inverse.reshape(h, w).astype(np.uint8), 'P')
            palette: list[int] = []
            transparency: list[int] = []
            for value in uniq:
                value = int(value)
                alpha = (value >> 24) & 255
                palette += [(value >> 16) & 255, (value >> 8) & 255, value & 255]
                transparency.append(alpha)
            while len(palette) < 768:
                palette += [0, 0, 0]
            while len(transparency) < 256:
                transparency.append(0)
            image.putpalette(palette)
            image.save(path, 'PNG', optimize=True, transparency=bytes(transparency))
            return len(uniq), step
    # 256칸에 들어가지 않는다 — 색을 양자화하지 않고 RGBA로 그대로 저장한다.
    Image.fromarray(arr, 'RGBA').save(path, 'PNG', optimize=True)
    return -1, 0


def _bodies(alpha: np.ndarray) -> np.ndarray:
    """Opaque connected blobs big enough to be the character (dust and fringe are left alone).

    몸통은 거의 불투명하다(중앙값 253~255). 공격 시트에 몸에 붙은 **연기·글로우**는 같은 크기라도
    반투명이 그림의 일부라서 중앙 알파로 걸러 낸다(`MIN_BODY_ALPHA`).
    """
    labels, count = ndimage.label(alpha > 0)
    if not count:
        return alpha > 0
    sizes = ndimage.sum(alpha > 0, labels, range(1, count + 1))
    keep = []
    for index, size in enumerate(sizes):
        if size < MIN_BODY:
            continue
        values = alpha[labels == index + 1]
        if np.median(values) >= MIN_BODY_ALPHA:
            keep.append(index + 1)
    return np.isin(labels, keep)


def _restore_mask(alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(inside, rim) — `inside` becomes opaque, `rim` keeps its anti-aliased alpha."""
    body = _bodies(alpha)
    if not body.any():
        return body, body
    filled = ndimage.binary_fill_holes(body)
    # 실루엣 1px 테두리 — 이 안쪽은 전부 불투명, 테두리는 원래 알파를 남긴다.
    rim = filled & ~ndimage.binary_erosion(filled, iterations=1)
    inside = filled & ~rim
    return inside, rim


def _fill_holes(arr: np.ndarray, body: np.ndarray) -> tuple[np.ndarray, int]:
    """실루엣 안쪽에서 알파 0으로 뚫린 **작은 점**을 주변(가장 가까운 본체 픽셀) 색으로 메운다.

    활시위와 활대 사이·겨드랑이처럼 원래 뚫려 있어야 하는 큰 빈 곳은 `MAX_HOLE`보다 커서 건드리지 않는다.
    """
    filled = ndimage.binary_fill_holes(body)
    holes = filled & ~body
    if not holes.any():
        return arr, 0
    labels, count = ndimage.label(holes)
    if not count:
        return arr, 0
    sizes = ndimage.sum(holes, labels, range(1, count + 1))
    small = [index + 1 for index, size in enumerate(sizes) if size <= MAX_HOLE]
    if not small:
        return arr, 0
    holes = np.isin(labels, small)
    # 가장 가까운 본체 픽셀의 좌표 — 구멍 픽셀이 그 색을 받는다(번짐·검은 점 없음).
    _, indices = ndimage.distance_transform_edt(~body, return_indices=True)
    fixed = arr.copy()
    ys, xs = np.nonzero(holes)
    fixed[ys, xs, :3] = arr[indices[0][ys, xs], indices[1][ys, xs], :3]
    fixed[ys, xs, 3] = 255
    return fixed, int(holes.sum())


def restore(path: str, indexed: bool, dry: bool = False) -> dict | None:
    with Image.open(path) as source:
        arr = np.array(source.convert('RGBA'))
    alpha = arr[:, :, 3]
    if not (alpha < 255).any():
        return None
    visible = alpha > 0
    n_visible = max(int(visible.sum()), 1)
    semi_before = float(((alpha > 10) & (alpha < 245)).sum()) / n_visible * 100
    body = _bodies(alpha)
    filled_arr, holes = _fill_holes(arr, body)
    inside, _rim = _restore_mask(alpha)
    fixed = filled_arr.copy()
    alpha_now = fixed[:, :, 3]
    target = inside & (alpha_now >= ALPHA_FLOOR) & (alpha_now < 255)
    n_changed = int(target.sum())
    if not n_changed and not holes:
        return None
    fixed[:, :, 3] = np.where(target, 255, alpha_now)
    # 실루엣 안쪽에 남겨 두는 반투명은 테두리 1px의 안티엘리어싱뿐이다 — 수치로 남긴다.
    inside_semi = int((inside & (fixed[:, :, 3] > 0) & (fixed[:, :, 3] < 255)).sum())
    fixed_alpha = fixed[:, :, 3]
    semi_after = float(((fixed_alpha > 10) & (fixed_alpha < 245)).sum()) / n_visible * 100
    if dry:
        return {'path': path, 'changed': n_changed, 'holes': holes, 'inside_semi': inside_semi,
                'semi_before': semi_before, 'semi_after': semi_after}
    if indexed:
        _save_indexed(fixed, path)
    else:
        Image.fromarray(fixed, 'RGBA').save(path, 'PNG', optimize=True)
    return {'path': path, 'changed': n_changed, 'holes': holes, 'inside_semi': inside_semi,
            'semi_before': semi_before, 'semi_after': semi_after}


def _targets(args) -> list[str]:
    if args.paths:
        return [os.path.join(ROOT, p) if not os.path.isabs(p) else p for p in args.paths]
    rows: list[str] = []
    for sub in TARGET_DIRS:
        directory = os.path.join(PILOT, sub) if sub else PILOT
        if not os.path.isdir(directory):
            print('missing dir', directory, file=sys.stderr)
            continue
        for name in sorted(os.listdir(directory)):
            if not name.lower().endswith('.png'):
                continue
            if args.only and name not in args.only:
                continue
            rows.append(os.path.join(directory, name))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry', action='store_true')
    parser.add_argument('--only', nargs='*', default=None)
    parser.add_argument('--paths', nargs='*', default=None, help='process exactly these files(저장소 상대 경로)')
    args = parser.parse_args()
    rows = []
    for path in _targets(args):
        with Image.open(path) as probe:
            indexed = probe.mode in ('P', 'PA')
        row = restore(path, indexed, args.dry)
        if row:
            rows.append(row)
    rows.sort(key=lambda row: -row['semi_before'])
    print(f'files changed: {len(rows)}  pixels restored: {sum(row["changed"] for row in rows)}  '
          f'holes filled: {sum(row["holes"] for row in rows)}')
    for row in rows[:40]:
        print(f'  {row["semi_before"]:>6.1f}% -> {row["semi_after"]:>5.1f}%  '
              f'{row["changed"]:>7d}px  holes {row["holes"]:>5d}px  '
              f'{os.path.relpath(row["path"], PILOT)}')


if __name__ == '__main__':
    main()
