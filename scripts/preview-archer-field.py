#!/usr/bin/env python3
"""궁수 필드 검수 이미지 — 실제 배포 에셋을 게임과 같은 비율로 합성한다.

브라우저 없이 `drawHero`/`drawEntities` 와 같은 규칙을 따른다:
    - 화면: 390×844 (iPhone 기준), 아이소메트릭 투영 (x−y)·.86 / (x+y)·.43
    - 궁수 본체 높이 = 화면 높이 × 0.0935 (heroScale.heroBodyFraction)
    - 스켈레톤 = 화면 높이 × .095 (drawEntities)
    - 화살은 `render/vfx.ts` drawArrow 와 같은 진행도 보간

출력: `downloads/djrpg_archer_ingame_v1.png`
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
OUTPUT = Path('/workspace/downloads/djrpg_archer_ingame_v1.png')
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


def body_height(alpha: Image.Image) -> int:
    box = alpha.getbbox()
    return box[3] - box[1] if box else 1


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


def draw_hp(draw: ImageDraw.ImageDraw, x: float, y: float, width: int, ratio: float, boss: bool) -> None:
    draw.rectangle([x - width / 2, y, x + width / 2, y + 3], fill=(37, 21, 23, 255))
    draw.rectangle([x - width / 2, y, x - width / 2 + width * max(0, ratio), y + 3], fill=(213, 59, 58, 255))


def scene(shooting: bool, arrow_progress: float, name: str) -> Image.Image:
    background = load(ASSETS / 'wasteland-ground.png')
    canvas = field(background)
    draw = ImageDraw.Draw(canvas, 'RGBA')
    height = SCREEN[1]
    scale = height * BODY_FRACTION / 337

    # 적 두 마리 — 궁수 앞쪽에 몰려 온다.
    skeleton = load(ASSETS / 'skeleton_warrior.png')
    for (ex, ey, ratio, hp) in [(-34, 58, .72, 610), (52, 118, .9, 780)]:
        px, py = project(ex, ey)
        enemy_scale = height * .095 / skeleton.height
        paste_bottom_center(canvas, skeleton, px, py, enemy_scale)
        draw.ellipse([px - 19, py - 7, px + 19, py + 7], fill=(0, 0, 0, 110))
        draw_hp(draw, px, py - height * .095 - 7, 26, ratio, False)

    idle = load(ASSETS / 'pilot-25d/archer_male_idle_v1.png')
    walk = load(ASSETS / 'pilot-25d/archer_male_walk_v1.png')
    attack = load(ASSETS / 'pilot-25d/archer_male_attack_v1.png')
    hero = attack if shooting else walk
    hero_frame = frame(hero, 1) if shooting else frame(walk, 0)
    hx, hy = project(0, 0)
    paste_bottom_center(canvas, hero_frame, hx, hy, scale)
    draw.ellipse([hx - 22, hy - 7, hx + 22, hy + 7], fill=(0, 0, 0, 128))

    if shooting:
        # drawArrow 와 같은 보간: 출발(0,0) → 도착(적 1) 월드 좌표.
        sx, sy = hx, hy - 20
        tx, ty = project(52, 118)
        progress = arrow_progress
        px = sx + (tx - sx) * progress
        py = sy + (ty - sy) * progress
        angle = -0.6
        tail = 1 - abs(progress - .5) * 2
        draw.line([(px - 26 * 3, py - 3 * 3), (px, py)], fill=(255, 217, 160, int(90 + tail * 60)), width=3)
        draw.line([(px - 18, py - 2), (px, py)], fill=(255, 233, 196, 255), width=3)
        draw.polygon([(px + 5, py + 2), (px - 4, py - 3), (px - 4, py + 6)], fill=(255, 240, 210, 255))
        draw.text((tx - 4, ty - height * .095 - 28), '-38', font=font(15), fill=(255, 214, 160, 255))
        draw.text((hx - 30, hy + 8), 'ARROW', font=font(9), fill=(255, 226, 190, 210))
        # 애로우 레인 표식
        draw.ellipse([project(-34, 58)[0] - 60, project(-34, 58)[1] - 24, project(-34, 58)[0] + 60, project(-34, 58)[1] + 24],
                     outline=(255, 207, 138, 110), width=2)
    else:
        # 걷는 두 번째 프레임을 반투명으로 겹쳐 걷기 동작을 확인한다.
        ghost = frame(idle, 0).copy()
        ghost.putalpha(ghost.getchannel('A').point(lambda value: value // 3))
        paste_bottom_center(canvas, ghost, hx, hy, scale)
        draw.text((hx - 26, hy + 8), 'WALK', font=font(9), fill=(255, 226, 190, 210))

    draw.text((14, 12), 'DJRPG ARCHER FIELD PREVIEW (COMPOSITE)', font=font(11), fill=(255, 233, 205, 235))
    draw.text((14, 30), name, font=font(11), fill=(214, 183, 155, 235))
    # 하단 HUD 원 4개 (평타 + 스킬 3)
    for index in range(4):
        cx = 62 + index * 78
        draw.ellipse([cx - 26, SCREEN[1] - 96, cx + 26, SCREEN[1] - 44], fill=(28, 22, 26, 210), outline=(120, 92, 68, 220), width=2)
        draw.text((cx - 5, SCREEN[1] - 76), str(index + 1), font=font(15), fill=(255, 226, 190, 240))
        if index < 3:
            draw.ellipse([cx + 10, SCREEN[1] - 88, cx + 26, SCREEN[1] - 72], fill=(96, 66, 44, 235))
    # 확대 인셋 — 게임 배율(화면 높이의 9.35%)에서는 디테일이 보이지 않으므로 2.6배로 잘라 붙인다.
    inset_scale = 2.0
    left, top = round(hx - 64), round(hy - 118)
    crop = canvas.crop((left, top, left + 128, top + 128)).resize((round(128 * inset_scale), round(128 * inset_scale)), Image.LANCZOS)
    box_w, box_h = crop.size
    ox, oy = SCREEN[0] - box_w - 10, 486
    canvas.alpha_composite(crop, (ox, oy))
    draw.rectangle([ox - 1, oy - 1, ox + box_w, oy + box_h], outline=(196, 152, 108, 220), width=1)
    draw.text((ox + 4, oy + box_h + 3), '2.0x DETAIL', font=font(9), fill=(214, 183, 155, 235))
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
        scene(False, 0, '1. BASE SHEET ONLY: NO ARMOR / HELMET / BOW OVERLAY'),
        scene(True, .42, '2. BASIC ATTACK: ARROW IN FLIGHT'),
        scene(True, .92, '3. ARROW RAIN MARKER + ARROW IMPACT'),
    ]
    gap = 14
    result = Image.new('RGBA', (SCREEN[0] * 3 + gap * 4, SCREEN[1] + gap * 2), (18, 15, 17, 255))
    for index, panel in enumerate(panels):
        result.alpha_composite(panel, (gap + index * (SCREEN[0] + gap), gap))
    result.convert('RGB').save(OUTPUT, quality=92)
    print(OUTPUT, result.size)
