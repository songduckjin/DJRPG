#!/usr/bin/env python3
"""직업별 기본 평타 원형 아이콘 3장을 배포 규격(256×256 RGBA)으로 굽는다 (작업 216).

입력은 사용자가 승인한 1254×1254 원형 메달리온 3장이다.
- 전사: `downloads/icon_greatsword/opt_a.png` (불꽃 없는 대검 베기)
- 궁수: `downloads/icon_greatsword/archer_attack.png` (활 사격)
- 마법사: `downloads/icon_greatsword/mage_attack.png` (마법탄)

원본은 원 바깥 네 모서리가 검은색(RGB)이라 그대로 쓰면 버튼의 둥근 테두리 밖으로
검은 사각형이 보인다. 그래서 **메달리온 원 가장자리까지만 알파를 남기고 원 밖을 투명으로**
바꾼 뒤, 알파를 미리 곱해(premultiply) 축소하고 다시 나눠 가장자리 검은 테두리(fringe)가
끼지 않게 256px로 줄인다.

사용법:
    python3 scripts/build-attack-icons.py [--source downloads/icon_greatsword] [--size 256]

출력: `public/assets/icons/attack_{warrior,archer,mage}.png`
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    'warrior': 'opt_a.png',
    'archer': 'archer_attack.png',
    'mage': 'mage_attack.png',
}
# 원본에서 메달리온 바깥 테두리가 닿는 반지름(px). 남/북/동/서 장식이 x 6~1243까지 닿는다.
MEDALLION_RADIUS = 620
FEATHER = 2.5


def keyed_alpha(rgb: Image.Image) -> Image.Image:
    """원 밖을 투명으로 만든 RGBA. 원 가장자리는 FEATHER px 동안 부드럽게 사라진다."""
    size = rgb.size[0]
    center = (size - 1) / 2
    coords = np.arange(size, dtype=np.float32) - center
    distance = np.sqrt(coords[None, :] ** 2 + coords[:, None] ** 2)
    alpha = np.clip((MEDALLION_RADIUS - distance) / FEATHER, 0.0, 1.0)
    alpha = (alpha * 255.0 + 0.5).astype(np.uint8)
    rgba = rgb.convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha, mode='L'))
    return rgba


def resize_premultiplied(image: Image.Image, size: int) -> Image.Image:
    """알파를 곱한 상태로 줄여 가장자리에 검은 테두리가 생기지 않게 한다."""
    array = np.asarray(image).astype(np.float32)
    rgb, alpha = array[..., :3], array[..., 3:4] / 255.0
    premultiplied = np.concatenate([rgb * alpha, alpha * 255.0], axis=2)
    small = np.asarray(Image.fromarray(premultiplied.clip(0, 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)).astype(np.float32)
    out_alpha = small[..., 3:4] / 255.0
    rgb_out = np.where(out_alpha > 0, small[..., :3] / np.maximum(out_alpha, 1e-6), 0)
    out = np.concatenate([rgb_out.clip(0, 255), small[..., 3:4]], axis=2).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=str(ROOT.parent.parent / 'downloads' / 'icon_greatsword'),
                        help='승인 원본 3장이 있는 폴더 (기본: 작업공간 downloads/icon_greatsword)')
    parser.add_argument('--size', type=int, default=256)
    parser.add_argument('--output', default=str(ROOT / 'public' / 'assets' / 'icons'))
    args = parser.parse_args()
    source = Path(args.source)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    for job, name in SOURCES.items():
        path = source / name
        if not path.exists():
            raise SystemExit(f'원본이 없습니다: {path}')
        image = resize_premultiplied(keyed_alpha(Image.open(path)), args.size)
        target = output / f'attack_{job}.png'
        image.save(target, 'PNG', optimize=True)
        print(f'{target.name}: {image.size[0]}×{image.size[1]} {target.stat().st_size // 1024}KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
