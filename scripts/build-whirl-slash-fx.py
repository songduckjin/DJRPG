#!/usr/bin/env python3
"""회전참격(전사 `hell`) 혈풍 회오리 에셋 빌더 — 작업 215.

승인 원본(`downloads/skill_whirl_slash/opt_c.png` 3번 시안)의 암흑·진홍 혈풍 회오리를
캐릭터 없이 위에서 내려다본 한 장으로 뽑은 `downloads/whirl/ring_b.png`를 게임 규격으로 다듬는다.

- 512×512 정사각(가운데 크롭) → LANCZOS 축소
- **중심 구멍**: 전사가 서는 자리는 검붉은 암흑만 남기고 비운다(안쪽 0.22 → 바깥 0.40 부드럽게).
- **알파 = 밝기**: 그냥 `add` 로 얹으면 어두운 안개가 사라져 분홍빛 번짐만 남는다. 그래서 밝기를
  알파로 써서 진홍 본체는 일반 합성(어두운 색 유지)으로, 밝은 하이라이트는 `add` 로 한 번 더 얹는다.
- 128색 팔레트 PNG(투명도 포함) — 부팅 프리로드에 들어가므로 200KB를 넘기지 않는다.

출력: `public/assets/fx_whirl_slash_ring.png`
사용: `python3 scripts/build-whirl-slash-fx.py <원본.png>`
"""
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# 승인 원본은 저장소 밖(워크스페이스 `downloads/`)에 있으므로 경로를 인자로 받는다.
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "downloads/whirl/ring_b.png"
TARGET = ROOT / "public/assets/fx_whirl_slash_ring.png"
SIZE = 512
COLORS = 128
ALPHA_GAIN = 3.4      # 밝기 → 알파. 낮으면 회오리가 비치고, 높으면 검은 안개까지 불투명해진다.
COLOR_GAIN = 1.6      # 진홍 본체를 어두운 바닥 위에서도 읽히게 조금 밝힌다.
HOLE_INNER = .22      # 중심 구멍(비율)
HOLE_OUTER = .40


def hole(radius: float) -> float:
    if radius >= HOLE_OUTER:
        return 1.0
    if radius <= HOLE_INNER:
        return 0.0
    k = (radius - HOLE_INNER) / (HOLE_OUTER - HOLE_INNER)
    return k * k * (3 - 2 * k)


def main() -> None:
    image = Image.open(SOURCE).convert("RGB")
    side = min(image.size)
    left, top = (image.width - side) // 2, (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)

    image = image.point(lambda value: min(255, int(value * COLOR_GAIN)))
    pixels = image.load()
    alpha = Image.new("L", image.size, 0)
    mask = alpha.load()
    centre = (SIZE - 1) / 2
    for y in range(SIZE):
        for x in range(SIZE):
            radius = math.hypot(x - centre, y - centre) / SIZE
            if radius < HOLE_OUTER:
                # 구멍 안쪽은 암흑만 남기고 거의 투명하게(전사가 서는 자리).
                mask[x, y] = int(min(255, max(pixels[x, y]) * ALPHA_GAIN) * hole(radius))
            else:
                mask[x, y] = min(255, int(max(pixels[x, y]) * ALPHA_GAIN))
    image.putalpha(alpha)

    image = image.quantize(colors=COLORS, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    image.save(TARGET, optimize=True)

    opaque = sum(1 for value in image.convert("RGBA").getchannel("A").getdata() if value > 40)
    print(f"saved {TARGET.relative_to(ROOT)} {image.size[0]}x{image.size[1]} "
          f"{TARGET.stat().st_size / 1024:.1f}KB visible={opaque / (SIZE * SIZE) * 100:.1f}%")


if __name__ == "__main__":
    main()
