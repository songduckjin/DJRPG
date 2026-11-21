"""투구 발광 검수 이미지 — 머리 없는 본체 + 착용 투구 파츠 + 등급색 발광을
게임 배율로 합성한다. `downloads/` 의 검수 PNG(전/후·필드 배율)를 만드는 데 쓴다."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / 'public/assets/pilot-25d'
FIELD = 0.42  # `heroScale` — 폰 세로 화면 기준 배율

spec = importlib.util.spec_from_file_location('masks', ROOT / 'scripts' / 'build-helm-glow-masks.py')
masks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(masks)

GLOW = np.array([0xff, 0x7a, 0x00], dtype=np.float32)


def glow_pixels(rgba: np.ndarray, strength: np.ndarray, peak: float = .92) -> np.ndarray:
    out = rgba.astype(np.float32)
    rgb = out[..., :3]
    lum = (.299 * rgb[..., 0] + .587 * rgb[..., 1] + .114 * rgb[..., 2]) / 255.0
    light = np.minimum(1.25, .45 + 1.55 * lum)
    emissive = np.clip(GLOW[None, None, :] * light[..., None], 0, 255)
    m = strength[..., None]
    rgb = rgb * (1 - m * .42 * peak) + rgb * (GLOW[None, None, :] / 255.0) * (m * .42 * peak)
    rgb = rgb + emissive * (m * .58 * peak)
    out[..., :3] = np.clip(rgb, 0, 255)
    return out.astype(np.uint8)


def compose_body(job: str, gender: str, part: str | None, mask: str | None, full_glow: bool) -> Image.Image:
    """머리 없는 본체 + 투구 파츠. `full_glow` 는 지금 동작(파츠 전체가 빛난다)."""
    if job == 'warrior':
        body = Image.open(PARTS / 'headless' / f'warrior_{gender}_idle_v1.png').convert('RGBA')
        anchor = masks.WARRIOR_IDLE_ANCHOR[gender]
        part_dir, mask_dir = PARTS / 'helmets', PARTS / 'helmets_glow'
    else:
        body = Image.open(PARTS / 'archer_headless' / f'archer_{gender}_idle_v1.png').convert('RGBA')
        anchor = (0, 0)
        part_dir, mask_dir = PARTS / 'archer_helms', PARTS / 'archer_helms_glow'
    canvas = Image.new('RGBA', body.size, (0, 0, 0, 0))
    canvas.alpha_composite(body)
    if not part:
        return canvas
    image = Image.open(part_dir / part).convert('RGBA')
    if full_glow or mask:
        alpha = np.asarray(image)[..., 3].astype(np.float32) / 255
        strength = alpha if full_glow else np.asarray(Image.open(mask_dir / mask).convert('RGBA'))[..., 3].astype(np.float32) / 255
        image = Image.fromarray(glow_pixels(np.asarray(image), strength))
    # 전사 파츠는 아래 중앙(목 밑동) 앵커, 궁수 파츠는 셀 좌상단(0,0) 앵커다.
    left = anchor[0] - image.width / 2 if job == 'warrior' else anchor[0]
    top = anchor[1] - image.height if job == 'warrior' else anchor[1]
    canvas.alpha_composite(image, (int(round(left)), int(round(top))))
    return canvas


def grid(tiles: list[Image.Image], columns: int, scale: float, background=(34, 30, 26)) -> Image.Image:
    w = int(362 * scale)
    h = int(362 * scale)
    rows = (len(tiles) + columns - 1) // columns
    out = Image.new('RGBA', (w * columns + 8 * (columns + 1), h * rows + 8 * (rows + 1)), (*background, 255))
    for k, tile in enumerate(tiles):
        out.alpha_composite(tile.resize((w, h), Image.LANCZOS), (8 + (k % columns) * (w + 8), 8 + (k // columns) * (h + 8)))
    return out


CASES = [
    ('warrior', 'male', 'helm_0.png', 'helm_0.png'),
    ('warrior', 'male', 'helm_5.png', 'helm_5.png'),
    ('warrior', 'male', 'helm_9.png', 'helm_9.png'),
    ('warrior', 'female', 'helm_female_0.png', 'helm_female_0.png'),
    ('warrior', 'female', 'helm_female_1.png', 'helm_female_1.png'),
    ('archer', 'female', 'female_0_v1.png', 'female_0_v1.png'),
    ('archer', 'female', 'female_5_v1.png', 'female_5_v1.png'),
    ('archer', 'female', 'female_9_v1.png', 'female_9_v1.png'),
    ('archer', 'male', 'male_0_v1.png', 'male_0_v1.png'),
    ('archer', 'male', 'male_5_v1.png', 'male_5_v1.png'),
    ('archer', 'male', 'male_9_v1.png', 'male_9_v1.png'),
    ('warrior', 'male', 'atk/male_9_f2.png', 'atk/male_9_f2.png'),
]


def main() -> None:
    target = ROOT.parent / 'downloads'
    target.mkdir(parents=True, exist_ok=True)

    # ① 전/후 — 케이스마다 [지금(전체 발광) | 투구만 발광]
    before_after: list[Image.Image] = []
    for job, gender, part, mask in CASES:
        before_after.append(compose_body(job, gender, part, None, True))
        before_after.append(compose_body(job, gender, part, mask, False))
    grid(before_after, columns=6, scale=.62).save(target / 'djrpg_helm_glow_only_before_after_v1.png')

    # ② 필드 배율(42%) — 여러 투구를 같은 화면 배율로
    field_tiles: list[Image.Image] = []
    for job, gender, part, mask in CASES:
        field_tiles.append(compose_body(job, gender, part, None, True))
        field_tiles.append(compose_body(job, gender, part, mask, False))
    grid(field_tiles, columns=8, scale=FIELD * 2.2).save(target / 'djrpg_helm_glow_only_field_v1.png')
    print(target / 'djrpg_helm_glow_only_before_after_v1.png')
    print(target / 'djrpg_helm_glow_only_field_v1.png')


if __name__ == '__main__':
    main()
