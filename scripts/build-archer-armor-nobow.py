#!/usr/bin/env python3
"""궁수 갑옷 시트에서 0번 기본 활대만 지운 판을 만든다(작업 200).

궁수 갑옷 시트(`public/assets/pilot-25d/archer_armors/archer_{성별}_armor_{1..9}_{동작}_v1.png`)에는
스타터 시트에서 이어진 **기본 활(사냥꾼의 활)**이 그려져 있다. 고급 활(1~9번)을 차면 본체가
`nobow/` 로 갈아 끼워지고 그 위에 활 파츠가 얹히므로(활 10종 작업), 갑옷 시트도 같은 판이 필요하다.
이 스크립트는 그 판을 `archer_armors/nobow/` 아래에 만든다 — 그리기 규칙은 활 10종과 같다.

지우는 방법은 `scripts/build-bow-parts.py` 의 `strip_bow` 를 **그대로 가져다 쓴다**(활대 중심선·
반폭·자세 표·손 보호·주변 본체 색 채우기·시위 보존이 한 곳에 있다). 갑옷 시트는 배율·위치를
기준 시트에 맞춰 두었으므로 같은 자세 표(grip/rot)를 그대로 쓸 수 있고, 정합 오차를 덮도록
지우는 띠만 조금 넓힌다.

출력: `public/assets/pilot-25d/archer_armors/nobow/archer_{성별}_armor_{1..9}_{동작}_v1.png` 54장
      (256색 팔레트 PNG + 투명 인덱스 0, 362px 셀 규격 그대로)
"""
import importlib.util
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public/assets/pilot-25d/archer_armors'
OUT = SRC / 'nobow'
CELL = 362
MARGIN = {'idle': 3.2, 'walk': 9.0, 'attack': 9.0}


def load_bow_builder():
    path = ROOT / 'scripts/build-bow-parts.py'
    spec = importlib.util.spec_from_file_location('bowbuild', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cells(rgba: np.ndarray, motion: str) -> list[np.ndarray]:
    if motion == 'idle':
        return [rgba]
    return [rgba[:, index * CELL:(index + 1) * CELL] for index in range(4)]


def save_palette(rgba: np.ndarray, path: Path) -> None:
    """게임과 같은 256색 팔레트 PNG(색인 0 = 투명)."""
    rgb = np.clip(rgba[..., :3] * 255 + .5, 0, 255).astype(np.uint8)
    alpha = np.clip(rgba[..., 3] * 255 + .5, 0, 255).astype(np.uint8)
    opaque = alpha >= 90
    flat = np.where(opaque[:, :, None], rgb, 0)
    palette_image = Image.fromarray(flat, 'RGB').quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    index = np.asarray(palette_image).astype(np.uint16) + 1
    index[~opaque] = 0
    palette = np.asarray(palette_image.getpalette()[:255 * 3], dtype=np.uint8).reshape(-1, 3)
    table = np.zeros((256, 3), np.uint8)
    table[1:1 + len(palette)] = palette
    out = Image.fromarray(index.astype(np.uint8), 'P')
    out.putpalette(table.reshape(-1).tolist())
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True, transparency=0)


def main() -> None:
    bow = load_bow_builder()
    table = bow.pose_table()
    written = 0
    for gender in bow.GENDERS:
        for motion in ('idle', 'walk', 'attack'):
            keys = ['idle0'] if motion == 'idle' else [f'{motion}{index}' for index in range(4)]
            for tier in range(1, 10):
                name = f'archer_{gender}_armor_{tier}_{motion}_v1.png'
                source = SRC / name
                rgba = np.asarray(Image.open(source).convert('RGBA')).astype(np.float32) / 255
                parts = []
                for cell, key in zip(cells(rgba, motion), keys):
                    pose = table[gender][key]
                    parts.append(bow.strip_bow(cell, pose['grip'], pose['rot'], MARGIN[motion]))
                sheet = np.concatenate(parts, axis=1) if len(parts) > 1 else parts[0]
                save_palette(sheet, OUT / name)
                written += 1
                print(gender, motion, tier, flush=True)
    print(f'nobow {written}장 완료 → {OUT}')


if __name__ == '__main__':
    sys.exit(main())
