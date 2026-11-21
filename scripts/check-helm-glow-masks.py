"""투구 발광 마스크 검수 시트 — 원본 / 지금(전체 발광) / 마스크 적용을 나란히 그린다."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / 'public/assets/pilot-25d'
OUT = ROOT.parent / 'tmp-helm' / 'check'

GLOW = np.array([0xff, 0x7a, 0x00], dtype=np.float32)


def glow_composite(part: np.ndarray, mask_alpha: np.ndarray, peak: float = 0.92) -> np.ndarray:
    rgba = part.astype(np.float32)
    rgb = rgba[..., :3].copy()
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255.0
    light = np.minimum(1.25, 0.45 + 1.55 * lum)
    emissive = np.clip(GLOW[None, None, :] * light[..., None], 0, 255)
    m = mask_alpha[..., None]
    multiplied = rgb * (GLOW[None, None, :] / 255.0)
    rgb = rgb * (1 - m * 0.42 * peak) + multiplied * (m * 0.42 * peak)
    rgb = rgb + emissive * (m * 0.58 * peak)
    out = rgba.copy()
    out[..., :3] = np.clip(rgb, 0, 255)
    return out


def compose(part_path: Path, mask_path: Path, scale: float) -> Image.Image:
    part = np.asarray(Image.open(part_path).convert('RGBA'))
    mask = np.asarray(Image.open(mask_path).convert('RGBA'))[..., 3].astype(np.float32) / 255.0
    alpha = part[..., 3] > 8
    full = glow_composite(part, alpha.astype(np.float32)).astype(np.uint8)
    masked = glow_composite(part, mask).astype(np.uint8)
    tiles = [part, full, masked]
    box = Image.fromarray(part).getbbox()
    out = Image.new('RGBA', ((box[2] - box[0]) * 3 + 16, box[3] - box[1]), (28, 30, 42, 255))
    x = 0
    for tile in tiles:
        image = Image.fromarray(tile).crop(box)
        out.alpha_composite(image, (x, 0))
        x += image.width + 8
    return out.resize((int(out.width * scale), int(out.height * scale)), Image.NEAREST)


def sheet(items: list[tuple[Path, Path]], name: str, scale: float = 2.2, columns: int = 5) -> Path:
    tiles = [compose(p, m, scale) for p, m in items]
    w = max(t.width for t in tiles)
    h = max(t.height for t in tiles)
    rows = (len(tiles) + columns - 1) // columns
    out = Image.new('RGBA', (w * columns + 8 * (columns - 1), h * rows + 8 * (rows - 1)), (18, 18, 26, 255))
    for k, tile in enumerate(tiles):
        out.alpha_composite(tile, ((k % columns) * (w + 8), (k // columns) * (h + 8)))
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f'{name}.png'
    out.save(target)
    return target


def main() -> None:
    groups = sys.argv[1:] or ['archer-female', 'archer-male', 'warrior-male', 'warrior-female', 'atk-male-f1', 'atk-female-f2']
    for group in groups:
        items: list[tuple[Path, Path]] = []
        if group.startswith('archer-'):
            gender = group.split('-')[1]
            for index in range(10):
                name = f'{gender}_{index}_v1.png'
                items.append((PARTS / 'archer_helms' / name, PARTS / 'archer_helms_glow' / name))
        elif group.startswith('atk-'):
            _, gender, frame = group.split('-')
            f = frame[1:]
            for index in range(10):
                name = f'{gender}_{index}_f{f}.png'
                items.append((PARTS / 'helmets' / 'atk' / name, PARTS / 'helmets_glow' / 'atk' / name))
        else:
            gender = group.split('-')[1]
            if gender == 'male':
                names = [f'helm_{index}.png' for index in range(10)]
            else:
                names = [f'helm_female_{index}.png' for index in range(3)]
            for name in names:
                items.append((PARTS / 'helmets' / name, PARTS / 'helmets_glow' / name))
        print(sheet(items, group))


if __name__ == '__main__':
    main()
