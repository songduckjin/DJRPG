#!/usr/bin/env python3
"""마법사 필드 검수 이미지 — 실제 배포 에셋을 게임과 같은 비율로 합성한다.

브라우저 없이 `drawHero`/`drawEntities` 와 같은 규칙을 따른다:
    - 화면: 390×844 (iPhone 기준), 아이소메트릭 투영 (x−y)·.86 / (x+y)·.43
    - 마법사 본체 높이 = 화면 높이 × 0.0935 (heroScale.heroBodyFraction)
    - 스켈레톤 = 화면 높이 × .095 (drawEntities)
    - 마법 구슬은 `render/vfx.ts` drawMagicBolt 와 같은 진행도 보간·꼬리

출력: `downloads/djrpg_mage_ingame_v1.png`
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
OUTPUT = Path('/workspace/downloads/djrpg_mage_ingame_v1.png')
SCREEN = (390, 844)
BODY_FRACTION = .0935


def load(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def frame(sheet: Image.Image, index: int, cells: int = 4) -> Image.Image:
    if cells == 1:
        return sheet
    width = sheet.width // cells
    return sheet.crop((index * width, 0, (index + 1) * width, sheet.height))


def project(x: float, y: float) -> tuple[float, float]:
    width, height = SCREEN
    return width / 2 + (x - y) * .86, height / 2 + (x + y) * .43


def paste_bottom_center(canvas: Image.Image, sprite: Image.Image, x: float, y: float, scale: float) -> tuple[float, float]:
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    drawn = sprite.resize(size, Image.LANCZOS)
    canvas.alpha_composite(drawn, (round(x - size[0] / 2), round(y - size[1])))
    return x, y - size[1] / 2


def field(background_tile: Image.Image) -> Image.Image:
    canvas = Image.new('RGBA', SCREEN, (26, 21, 18, 255))
    tile = background_tile.resize((round(background_tile.width * .65), round(background_tile.height * .65)), Image.LANCZOS)
    for top in range(0, SCREEN[1] + tile.height, tile.height):
        for left in range(0, SCREEN[0] + tile.width, tile.width):
            canvas.alpha_composite(tile, (left, top))
    shade = Image.new('RGBA', SCREEN, (12, 10, 14, 96))
    canvas.alpha_composite(shade)
    return canvas


def glow(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, color: tuple[int, int, int], alpha: int, layers: int = 5) -> None:
    for index in range(layers, 0, -1):
        r = radius * index / layers
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, int(alpha * (1 - index / (layers + 1)))))


def draw_hp(draw: ImageDraw.ImageDraw, x: float, y: float, width: int, ratio: float) -> None:
    draw.rectangle([x - width / 2, y, x + width / 2, y + 3], fill=(37, 21, 23, 255))
    draw.rectangle([x - width / 2, y, x - width / 2 + width * max(0, ratio), y + 3], fill=(213, 59, 58, 255))


def draw_bolt(draw: ImageDraw.ImageDraw, sx: float, sy: float, tx: float, ty: float, progress: float, color: tuple[int, int, int]) -> tuple[float, float]:
    """`drawMagicBolt` 와 같은 보간 — 구슬 + 꼬리 + 중심 하이라이트."""
    px, py = sx + (tx - sx) * progress, sy + (ty - sy) * progress
    tail = 1 - abs(progress - .5) * 2
    angle_x, angle_y = (tx - sx), (ty - sy)
    length = max(1.0, (angle_x ** 2 + angle_y ** 2) ** .5)
    ux, uy = angle_x / length, angle_y / length
    draw.line([(px - ux * 26, py - uy * 26), (px, py)], fill=(*color, int(60 + tail * 60)), width=5)
    glow(draw, px, py, 14 + tail * 4, color, 90)
    draw.ellipse([px - 6 - tail * 2, py - 6 - tail * 2, px + 6 + tail * 2, py + 6 + tail * 2], fill=(*color, 235))
    draw.ellipse([px - 2.6, py - 2.6, px + 2.6, py + 2.6], fill=(255, 255, 255, 225))
    return px, py


def scene(mode: str, progress: float, name: str) -> Image.Image:
    background = load(ASSETS / 'wasteland-ground.png')
    canvas = field(background)
    draw = ImageDraw.Draw(canvas, 'RGBA')
    height = SCREEN[1]
    scale = height * BODY_FRACTION / 337

    skeleton = load(ASSETS / 'skeleton_warrior.png')
    for (ex, ey, ratio) in [(-34, 58, .72), (52, 118, .9)]:
        px, py = project(ex, ey)
        enemy_scale = height * .095 / skeleton.height
        paste_bottom_center(canvas, skeleton, px, py, enemy_scale)
        draw.ellipse([px - 19, py - 7, px + 19, py + 7], fill=(0, 0, 0, 110))
        draw_hp(draw, px, py - height * .095 - 7, 26, ratio)

    idle = load(ASSETS / 'pilot-25d/mage_male_idle_v1.png')
    walk = load(ASSETS / 'pilot-25d/mage_male_walk_v1.png')
    attack = load(ASSETS / 'pilot-25d/mage_male_attack_v1.png')
    hero_frame = frame(walk, 0) if mode == 'walk' else frame(attack, 2)
    hx, hy = project(0, 0)
    paste_bottom_center(canvas, hero_frame, hx, hy, scale)
    draw.ellipse([hx - 22, hy - 7, hx + 22, hy + 7], fill=(0, 0, 0, 128))

    if mode == 'walk':
        ghost = frame(idle, 0).copy()
        ghost.putalpha(ghost.getchannel('A').point(lambda value: value // 3))
        paste_bottom_center(canvas, ghost, hx, hy, scale)
        draw.text((hx - 26, hy + 8), 'WALK', font=font(9), fill=(180, 210, 255, 220))
    elif mode == 'bolt':
        tx, ty = project(52, 118)
        px, py = draw_bolt(draw, hx, hy - 20, tx, ty, progress, (143, 180, 255))
        draw.text((tx - 8, ty - height * .095 - 28), '-42', font=font(15), fill=(190, 210, 255, 255))
        draw.text((hx - 34, hy + 8), 'MAGIC BOLT', font=font(9), fill=(180, 210, 255, 220))
    else:
        # 프로스트 노바 — drawNova 와 같은 발밑 파동 3겹.
        cx, cy = project(0, 0)
        for lag, width in [(0, 3), (.18, 2), (.36, 1.4)]:
            ring = max(0.0, min(1.0, progress * 1.4 - lag))
            if ring <= 0:
                continue
            radius = 150 * .86 * ring
            draw.ellipse([cx - radius, cy - radius * .5, cx + radius, cy + radius * .5],
                         outline=(191, 230, 255, int(150 * (1 - ring))), width=int(width))
        for index in range(10):
            import math
            angle = index * .63
            reach = 150 * .86 * min(1.0, progress * 1.4)
            px, py = cx + math.cos(angle) * reach, cy + math.sin(angle) * reach * .5
            glow(draw, px, py, 6, (191, 230, 255), 120)
        draw.text((hx - 40, hy + 8), 'FROST NOVA', font=font(9), fill=(191, 230, 255, 220))

    draw.text((14, 12), 'DJRPG MAGE FIELD PREVIEW (COMPOSITE)', font=font(11), fill=(200, 220, 255, 235))
    draw.text((14, 30), name, font=font(11), fill=(150, 170, 205, 235))
    for index in range(4):
        cx = 62 + index * 78
        draw.ellipse([cx - 26, SCREEN[1] - 96, cx + 26, SCREEN[1] - 44], fill=(28, 22, 26, 210), outline=(88, 104, 140, 220), width=2)
        draw.text((cx - 5, SCREEN[1] - 76), str(index + 1), font=font(15), fill=(226, 236, 255, 240))
        if index < 3:
            draw.ellipse([cx + 10, SCREEN[1] - 88, cx + 26, SCREEN[1] - 72], fill=(66, 74, 110, 235))
    inset_scale = 2.0
    left, top = round(hx - 64), round(hy - 118)
    crop = canvas.crop((left, top, left + 128, top + 128)).resize((round(128 * inset_scale), round(128 * inset_scale)), Image.LANCZOS)
    box_w, box_h = crop.size
    ox, oy = SCREEN[0] - box_w - 10, 486
    canvas.alpha_composite(crop, (ox, oy))
    draw.rectangle([ox - 1, oy - 1, ox + box_w, oy + box_h], outline=(130, 150, 196, 220), width=1)
    draw.text((ox + 4, oy + box_h + 3), '2.0x DETAIL', font=font(9), fill=(150, 170, 205, 235))
    return canvas


_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int):
    if size not in _font_cache:
        for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf']:
            if Path(path).exists():
                try:
                    _font_cache[size] = ImageFont.truetype(path, size)
                    break
                except OSError:
                    continue
        else:
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]


if __name__ == '__main__':
    panels = [
        scene('walk', 0, '1. BASE SHEET ONLY: NO ARMOR / HELMET / STAFF OVERLAY'),
        scene('bolt', .45, '2. BASIC ATTACK: BLUE MAGIC ORB IN FLIGHT'),
        scene('nova', .62, '3. FROST NOVA: GROUND RINGS + SHARDS'),
    ]
    gap = 14
    result = Image.new('RGBA', (SCREEN[0] * 3 + gap * 4, SCREEN[1] + gap * 2), (18, 17, 22, 255))
    for index, panel in enumerate(panels):
        result.alpha_composite(panel, (gap + index * (SCREEN[0] + gap), gap))
    result.convert('RGB').save(OUTPUT, quality=92)
    print(OUTPUT, result.size)
