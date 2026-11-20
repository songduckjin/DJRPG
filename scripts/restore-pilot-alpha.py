#!/usr/bin/env python3
"""Restore internal alpha of the DJRPG 2.5D pilot character/equipment sheets (task 227).

Why: the pre-rendered sheets in `public/assets/pilot-25d/` keep an internal semi-transparent
alpha channel (56% of the mage's opaque pixels sit at 0 < a < 255, median 198/255). On the
wasteland floor the ground tile therefore shows through the body. The value is not in the
runtime code — it is baked into the PNGs.

Rule (keeps anti-aliasing intact, never touches effects):
  * distance from the fully transparent background (alpha == 0) > 2 px  -> interior
  * interior pixels with alpha >= 30 -> alpha = 255
  * the outer 1~2 px anti-aliased rim keeps its gradient (no stair-step / dark fringe)
  * RGB is untouched: the sheets store straight (not premultiplied) colour. Verified by
    compositing before/after over `wasteland-ground.png` at the in-game scale.

Effects (`fx_*`, aura, glow, vfx) are out of scope — only the character/equipment folders in
TARGET_DIRS are processed, and the 40-odd `rgba` sheets keep their RGBA storage.

Storage: a sheet that was an indexed PNG stays indexed (exact palette when the restored image
still fits 256 colours; otherwise the rim alpha is rounded to the smallest step that fits, so
the colour is never re-quantised). RGBA sheets stay RGBA.

Run: `python3 scripts/restore-pilot-alpha.py [--dry] [--only file.png ...]`
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
INTERIOR_DIST = 2.0      # keep this many px of anti-aliased rim outside the silhouette
ALPHA_FLOOR = 30         # below this the pixel is background haze, not body
ALPHA_STEPS = (1, 2, 4, 8, 16, 32)


def _pack(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.uint32)
    alpha = arr[:, :, 3].astype(np.uint32)
    return (rgb[:, :, 0] << 16) | (rgb[:, :, 1] << 8) | rgb[:, :, 2] | (alpha << 24)


def _save_indexed(arr: np.ndarray, path: str) -> tuple[int, int]:
    """Save as an indexed PNG without changing any colour. Returns (colours, alpha step used)."""
    h, w = arr.shape[:2]
    for step in ALPHA_STEPS:
        if step == 1:
            packed = _pack(arr)
        else:
            rounded = arr.copy()
            alpha = arr[:, :, 3].astype(np.int32)
            rounded[:, :, 3] = np.where(alpha < 255, np.minimum(255, ((alpha + step // 2) // step) * step), 255)
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
    # Extremely colourful sheet: fall back to an octree palette of the restored pixels.
    Image.fromarray(arr, 'RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
        path, 'PNG', optimize=True)
    return 256, 0


def restore(path: str, indexed: bool, dry: bool = False) -> dict | None:
    with Image.open(path) as source:
        arr = np.array(source.convert('RGBA'))
    alpha = arr[:, :, 3]
    if not (alpha < 255).any():
        return None
    visible = alpha > 0
    n_visible = max(int(visible.sum()), 1)
    semi_before = float(((alpha > 10) & (alpha < 245)).sum()) / n_visible * 100
    distance = ndimage.distance_transform_edt(alpha > 0)  # px away from the transparent background
    target = (distance > INTERIOR_DIST) & (alpha >= ALPHA_FLOOR) & (alpha < 255)
    n_changed = int(target.sum())
    if not n_changed:
        return None
    fixed = arr.copy()
    fixed[:, :, 3] = np.where(target, 255, alpha)
    fixed_alpha = fixed[:, :, 3]
    semi_after = float(((fixed_alpha > 10) & (fixed_alpha < 245)).sum()) / n_visible * 100
    if dry:
        return {'path': path, 'changed': n_changed, 'semi_before': semi_before, 'semi_after': semi_after}
    if indexed:
        _save_indexed(fixed, path)
    else:
        Image.fromarray(fixed, 'RGBA').save(path, 'PNG', optimize=True)
    return {'path': path, 'changed': n_changed, 'semi_before': semi_before, 'semi_after': semi_after}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry', action='store_true')
    parser.add_argument('--only', nargs='*', default=None)
    args = parser.parse_args()
    rows = []
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
            path = os.path.join(directory, name)
            with Image.open(path) as probe:
                indexed = probe.mode in ('P', 'PA')
            row = restore(path, indexed, args.dry)
            if row:
                rows.append(row)
    rows.sort(key=lambda row: -row['semi_before'])
    print(f'files changed: {len(rows)}  pixels restored: {sum(row["changed"] for row in rows)}')
    for row in rows[:15]:
        print(f'  {row["semi_before"]:>6.1f}% -> {row["semi_after"]:>5.1f}%  '
              f'{row["changed"]:>7d}px  {os.path.relpath(row["path"], PILOT)}')


if __name__ == '__main__':
    main()
