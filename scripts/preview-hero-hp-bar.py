#!/usr/bin/env python3
"""작업 233 검수 이미지 — 내 캐릭터 머리 위 초록 체력바.

브라우저 없이 `drawHero` 와 같은 규칙(시트별 본체 높이 `heroScale.heroBodyPx`, 배율
`heroScreenHeight * .0935 / bodyPx`, 앵커 `.97`)으로 실제 배포 에셋을 게임 배율로 합성하고,
바의 좌표·크기·색은 `scripts/preview-hero-hp-bar.mjs` 가 게임 코드에서 계산한 JSON 을 그대로 쓴다.

출력
    downloads/djrpg_hero_hp_bar_v1.png        — 3직업 남녀 서기·걷기·공격·투구, 100/50/70/35% (2배 확대 컷)
    downloads/djrpg_hero_hp_bar_field_v1.png  — 실제 게임 배율 전체 화면 2컷

사용: node scripts/preview-hero-hp-bar.mjs && python3 scripts/preview-hero-hp-bar.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
PLAN = Path('/workspace/downloads/hero-hp-bar-plan.json')
OUT_SHEET = Path('/workspace/downloads/djrpg_hero_hp_bar_v1.png')
OUT_FIELD = Path('/workspace/downloads/djrpg_hero_hp_bar_field_v1.png')

FONT_CANDIDATES = [
    '/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def hex_color(value: int, alpha: int = 255) -> tuple[int, int, int, int]:
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255, alpha)


def load(path: str) -> Image.Image:
    return Image.open(ASSETS / path.lstrip('/').removeprefix('assets/')).convert('RGBA')


def field_background(screen: tuple[int, int]) -> Image.Image:
    canvas = Image.new('RGBA', screen, (26, 21, 18, 255))
    tile = load('wasteland-ground.png')
    tile = tile.resize((round(tile.width * .65), round(tile.height * .65)), Image.LANCZOS)
    for top in range(0, screen[1] + tile.height, tile.height):
        for left in range(0, screen[0] + tile.width, tile.width):
            canvas.alpha_composite(tile, (left, top))
    canvas.alpha_composite(Image.new('RGBA', screen, (12, 10, 14, 96)))
    return canvas


def cell(sheet: Image.Image, frame: int) -> Image.Image:
    if sheet.width == sheet.height:
        return sheet
    width = sheet.width // 4
    height = sheet.height // (1 if sheet.width // sheet.height > 2.5 else 2)
    column, row = frame % 4, frame // 4
    return sheet.crop((column * width, row * height, (column + 1) * width, (row + 1) * height))


def paste(canvas: Image.Image, sprite: Image.Image, scale: float, top_left: tuple[float, float]) -> None:
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    canvas.alpha_composite(sprite.resize(size, Image.LANCZOS), (round(top_left[0]), round(top_left[1])))


def draw_hero(canvas: Image.Image, case: dict) -> None:
    scale = case['scale']
    feet = case['feet']
    body = load(case['sheet'])
    part = cell(body, case['frame'])
    # 앵커 (.5, .97) — 레이어 원점(발밑)에서 위로 97%.
    paste(canvas, part, scale, (feet['x'] - part.width * scale / 2, feet['y'] - part.height * scale * case['anchorY']))
    helm = case.get('helm')
    if not helm:
        return
    art = load(helm['sheet'])
    if helm.get('anchor') == 'neck':
        # 전사 투구: 파츠 아래 중앙(목 밑동)을 셀 (228, 89) 에 둔다.
        top_left = (feet['x'] + (228 - art.width / 2 - 181) * scale, feet['y'] + (89 - art.height - 351) * scale)
    else:
        # 마법사 모자: 파츠 좌상단이 셀 y = -44 (셀 위로 솟은 부분 포함).
        top_left = (feet['x'] + (0 - 181) * scale, feet['y'] + (helm['cellY'] - 351) * scale)
    paste(canvas, art, scale, top_left)


def draw_bar(canvas: Image.Image, case: dict, bar_style: dict) -> None:
    box = case['box']
    x, y, width, height = box['x'], box['y'], box['width'], box['height']
    radius = max(1, min(round(height * .32), height // 2))
    draw = ImageDraw.Draw(canvas, 'RGBA')
    draw.rounded_rectangle([x, y, x + width - 1, y + height - 1], radius=radius, fill=hex_color(bar_style['track']))
    inner = round((width - 2) * box['ratio'])
    if inner > 0:
        draw.rounded_rectangle([x + 1, y + 1, x + inner, y + height - 2], radius=max(0, min(radius, inner // 2)),
                               fill=hex_color(bar_style['fill']))
        highlight = max(1, round((height - 2) * .32))
        draw.rectangle([x + 1, y + 1, x + inner, y + highlight], fill=hex_color(bar_style['fillTop'], 140))
    draw.rounded_rectangle([x, y, x + width - 1, y + height - 1], radius=radius,
                           outline=hex_color(bar_style['border'], 242))


def screen_size(plan: dict) -> tuple[int, int]:
    return (plan['screen']['width'], plan['screen']['height'])


def panel(plan: dict, case: dict) -> Image.Image:
    canvas = field_background(screen_size(plan))
    draw_hero(canvas, case)
    draw_bar(canvas, case, plan['bar'])
    # 발밑 그림자(게임과 같은 타원) — 캐릭터가 바닥에 서 있는지 확인용.
    shadow = ImageDraw.Draw(canvas, 'RGBA')
    feet = case['feet']
    radius = max(20, case['bodyPx'] * case['scale'] * .37)
    shadow.ellipse([feet['x'] - radius, feet['y'] - 3 - 8, feet['x'] + radius, feet['y'] - 3 + 8], fill=(0, 0, 0, 128))
    return canvas


def crop_hero(canvas: Image.Image, plan: dict, zoom: float = 2.0) -> Image.Image:
    width, height = screen_size(plan)
    feet_y = height / 2
    box = (round(width / 2 - 78), round(feet_y - 150), round(width / 2 + 78), round(feet_y + 42))
    cropped = canvas.crop(box)
    return cropped.resize((round(cropped.width * zoom), round(cropped.height * zoom)), Image.LANCZOS)


def contact_sheet(plan: dict) -> Image.Image:
    zoom = 2.0
    cases = plan['cases']
    tiles = []
    for case in cases:
        tile = crop_hero(panel(plan, case), plan, zoom)
        draw = ImageDraw.Draw(tile, 'RGBA')
        draw.rectangle([0, 0, tile.width - 1, tile.height - 1], outline=(70, 56, 46, 255))
        draw.text((6, tile.height - 16), case['label'], font=font(11), fill=(240, 220, 198, 245))
        draw.text((6, 5), f"{round(case['hp'] * 100)}%", font=font(12), fill=(150, 236, 176, 250))
        tiles.append(tile)

    columns = 4
    rows = (len(tiles) + columns - 1) // columns
    gap = 10
    size = (tiles[0].width, tiles[0].height)
    sheet = Image.new('RGBA', (size[0] * columns + gap * (columns + 1), size[1] * rows + gap * (rows + 1) + 34), (18, 15, 17, 255))
    draw = ImageDraw.Draw(sheet, 'RGBA')
    draw.text((gap, 9), 'DJRPG HERO HP BAR — FIELD COMPOSITE AT GAME SCALE (2x CUT)', font=font(13), fill=(255, 233, 205, 240))
    for index, tile in enumerate(tiles):
        column, row = index % columns, index // columns
        sheet.alpha_composite(tile, (gap + column * (size[0] + gap), 34 + gap + row * (size[1] + gap)))
    return sheet


def field_sheets(plan: dict) -> Image.Image:
    """실제 게임 배율 전체 화면 — 전사 100% / 궁수 50%."""
    picks = [case for case in plan['cases'] if case['label'].startswith(('전사 남 · 서기 · 100%', '궁수 여 · 서기 · 100%', '마법사 여 · 고깔모자'))]
    picks[1] = dict(picks[1], label='궁수 여 · 서기 · 50%', hp=.5, box=dict(picks[1]['box'], ratio=.5))
    panels = [panel(plan, case) for case in picks]
    gap = 12
    width, height = screen_size(plan)
    sheet = Image.new('RGBA', (width * len(panels) + gap * (len(panels) + 1), height + 40), (18, 15, 17, 255))
    for index, canvas in enumerate(panels):
        sheet.alpha_composite(canvas, (gap + index * (width + gap), 34))
        ImageDraw.Draw(sheet, 'RGBA').text((gap + index * (width + gap) + 8, 12), picks[index]['label'] + '  (game scale 1x)',
                                           font=font(12), fill=(226, 200, 172, 240))
    return sheet


if __name__ == '__main__':
    plan = json.loads(PLAN.read_text())
    sheet = contact_sheet(plan)
    sheet.convert('RGB').save(OUT_SHEET, quality=94)
    print(OUT_SHEET, sheet.size)
    field = field_sheets(plan)
    field.convert('RGB').save(OUT_FIELD, quality=94)
    print(OUT_FIELD, field.size)
