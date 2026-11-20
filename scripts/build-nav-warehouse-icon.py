#!/usr/bin/env python3
"""하단 메뉴 '공용창고' 아이콘(nav_warehouse_v1.png)을 사용자 확정 시안(A안)에서 만든다.

입력: downloads/warehouse_icon/opt_a.png (다크 오크·황금 자물쇠 상자, 검정 배경 RGB)
출력: public/assets/icons/nav_warehouse_v1.png (128×128, 투명 배경)

기존 nav_*_v2.png 와 같은 규격을 맞춘다:
- 128×128, 팔레트 PNG(tRNS 알파)
- 보이는 알파 경계가 캔버스의 약 90%(가로 116px)로 중앙 정렬
  (nav_market_v2.png 알파 bbox 6..122 폭 116 기준)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent.parent / "downloads" / "warehouse_icon" / "opt_a.png"
OUT = ROOT / "public" / "assets" / "icons" / "nav_warehouse_v1.png"

SIZE = 128
CONTENT = 110          # 기존 nav 아이콘의 보이는 폭(128 중 116) — 빛 테두리 3px 포함
BG_LEVEL = 12          # 배경 검정 판정(0~255)
MIN_AREA = 400         # 고립된 작은 점 제거
# 어두운 오크가 하단 메뉴의 어두운 버튼 위에서도 다른 아이콘과 같은 무게로 보이게 하는 보정
TONE_GAMMA = 0.72
TONE_GAIN = 1.08
TONE_SATURATION = 1.12
RIM_COLOR = (255, 222, 170)
RIM_STRENGTH = 0.5
RIM_RADIUS = 1.4


def cutout(src: Image.Image) -> tuple[Image.Image, np.ndarray]:
    rgb = np.asarray(src.convert("RGB")).astype(np.float32)
    level = rgb.max(axis=2)
    dark = level < BG_LEVEL

    labels, _ = ndimage.label(dark)
    border_ids = np.unique(
        np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    )
    border_ids = border_ids[border_ids != 0]
    background = np.isin(labels, border_ids)
    fg = ~background
    # 실루엣 안쪽의 어두운 홈(판금 사이 틈)은 남긴다.
    fg = ndimage.binary_fill_holes(fg)

    labels, count = ndimage.label(fg)
    sizes = ndimage.sum(fg, labels, range(1, count + 1))
    keep = [i + 1 for i, area in enumerate(sizes) if area >= MIN_AREA]
    fg = np.isin(labels, keep)

    rows = np.where(fg.any(axis=1))[0]
    cols = np.where(fg.any(axis=0))[0]
    top, bottom = rows[0], rows[-1] + 1
    left, right = cols[0], cols[-1] + 1
    return src.convert("RGB").crop((left, top, right, bottom)), fg[top:bottom, left:right]


def compose(rgb_crop: Image.Image, mask: np.ndarray) -> Image.Image:
    alpha_hi = (mask.astype(np.uint8) * 255)
    height, width = mask.shape
    scale = CONTENT / max(width, height)
    out_w = max(1, round(width * scale))
    out_h = max(1, round(height * scale))

    rgb = np.asarray(rgb_crop).astype(np.float32)
    premul = Image.fromarray(np.dstack([rgb * (alpha_hi[..., None] / 255.0)]).astype(np.uint8))
    alpha = Image.fromarray(alpha_hi)

    # BOX(영역 평균)로 줄여 가장자리를 부드럽게 만든다. 링잉이 없다.
    premul_small = np.asarray(premul.resize((out_w, out_h), Image.BOX)).astype(np.float32)
    alpha_small = np.asarray(alpha.resize((out_w, out_h), Image.BOX)).astype(np.float32) / 255.0

    color = np.zeros_like(premul_small)
    solid = alpha_small > 0.004
    color[solid] = premul_small[solid] / alpha_small[solid][:, None]
    color = np.clip(color, 0, 255)

    canvas_rgb = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    canvas_a = np.zeros((SIZE, SIZE), dtype=np.uint8)
    x = (SIZE - out_w) // 2
    y = (SIZE - out_h) // 2
    canvas_rgb[y:y + out_h, x:x + out_w] = color.astype(np.uint8)
    canvas_a[y:y + out_h, x:x + out_w] = np.round(alpha_small * 255).astype(np.uint8)
    return lift_tone(Image.fromarray(np.dstack([canvas_rgb, canvas_a]), "RGBA"))


def lift_tone(icon: Image.Image) -> Image.Image:
    """어두운 나무 결을 살짝 올리고, 실루엣 바깥에 옅은 빛 테두리를 둘러 준다."""
    arr = np.asarray(icon).astype(np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3:]
    color = np.power(rgb / 255.0, TONE_GAMMA) * TONE_GAIN
    lum = (0.299 * color[..., 0] + 0.587 * color[..., 1] + 0.114 * color[..., 2])[..., None]
    color = np.clip((lum + (color - lum) * TONE_SATURATION) * 255, 0, 255)
    lifted = Image.fromarray(np.dstack([color, alpha]).astype(np.uint8), "RGBA")

    blur = np.asarray(lifted.getchannel("A").filter(ImageFilter.GaussianBlur(RIM_RADIUS))).astype(np.float32)
    solid = np.asarray(lifted.getchannel("A")).astype(np.float32)
    rim_alpha = np.clip(blur - solid, 0, 255) * RIM_STRENGTH
    rim = Image.new("RGBA", lifted.size, RIM_COLOR + (0,))
    rim.putalpha(Image.fromarray(rim_alpha.astype(np.uint8)))

    out = Image.new("RGBA", lifted.size, (0, 0, 0, 0))
    out.alpha_composite(rim)
    out.alpha_composite(lifted)
    return out


def main() -> int:
    if not SRC.exists():
        print(f"missing source: {SRC}", file=sys.stderr)
        return 1
    rgb_crop, mask = cutout(Image.open(SRC))
    icon = compose(rgb_crop, mask)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 팔레트 PNG(tRNS)로 저장해 기존 nav 아이콘과 같은 포맷·용량대로 맞춘다.
    try:
        encoded = icon.quantize(colors=255, method=Image.FASTOCTREE)
    except ValueError:
        encoded = icon.convert("RGB")
    encoded.save(OUT, optimize=True)
    saved = Image.open(OUT).convert("RGBA")
    bbox = saved.getchannel("A").getbbox()
    print(f"wrote {OUT.relative_to(ROOT.parent.parent)} {saved.size} alpha bbox={bbox} bytes={OUT.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
