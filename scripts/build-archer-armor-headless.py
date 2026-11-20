#!/usr/bin/env python3
"""궁수 갑옷 시트에서 머리·머리카락을 지운 판을 만든다(작업 202).

궁수 투구(작업 200) 파츠에는 **얼굴·머리카락까지** 함께 들어 있어, 투구를 쓰면 본체를 머리 없는
판으로 갈아 끼워야 머리카락이 비치지 않는다. 그 판을 갑옷 1~9번에도 만든다.

지우는 도형은 투구 빌더(`scripts/build-archer-helm-parts.py`)의 `HEAD_POLYGON` 을 **그대로** 쓴다 —
파츠와 구멍이 같은 도형이라 이음매가 남지 않는다. 프레임마다 얼굴 위치가 다르므로, 같은 티어의
서기 시트 얼굴을 템플릿으로 그 프레임에서 얼굴을 찾아(`frame_transform`) 다각형을 옮겨 지운다.

입력: public/assets/pilot-25d/archer_armors/{,nobow/}archer_{성별}_armor_{1..9}_{동작}_v1.png
출력: public/assets/pilot-25d/archer_armors/headless/...  (같은 이름)
      public/assets/pilot-25d/archer_armors/nobow/headless/...
"""
import importlib.util
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ARMORED = ROOT / 'public/assets/pilot-25d/archer_armors'
CELL = 362
MOTIONS = ('idle', 'walk', 'attack')


def load_helm_builder():
    path = ROOT / 'scripts/build-archer-helm-parts.py'
    spec = importlib.util.spec_from_file_location('helmbuild', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert('RGBA'))


def cells(image: np.ndarray) -> list[np.ndarray]:
    return [image[:, index * CELL:(index + 1) * CELL] for index in range(image.shape[1] // CELL)]


def save(image: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image, 'RGBA').quantize(colors=255, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def main() -> None:
    helm = load_helm_builder()
    written = 0
    for bowless in (False, True):
        source_dir = ARMORED / 'nobow' if bowless else ARMORED
        out_dir = source_dir / 'headless'
        for gender in ('male', 'female'):
            idle_faces = {}
            for tier in range(1, 10):
                idle = read(source_dir / f'archer_{gender}_armor_{tier}_idle_v1.png')
                idle_faces[tier] = idle
                for motion in MOTIONS:
                    name = f'archer_{gender}_armor_{tier}_{motion}_v1.png'
                    image = idle if motion == 'idle' else read(source_dir / name)
                    base = idle_faces[tier]
                    out_cells = []
                    for index, cell in enumerate(cells(image)):
                        if motion == 'idle':
                            mask = helm.head_mask(gender)
                        else:
                            scale, dx, dy = helm.frame_transform(base, cell, motion)
                            mask = helm.shift_mask(helm.head_mask(gender), scale, dx, dy)
                        out_cells.append(helm.erase(cell, mask))
                    save(np.concatenate(out_cells, axis=1), out_dir / name)
                    written += 1
                    print('nobow' if bowless else 'bow', gender, motion, tier, flush=True)
    print(f'headless {written}장 완료')


if __name__ == '__main__':
    sys.exit(main())
