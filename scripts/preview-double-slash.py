#!/usr/bin/env python3
"""이단참(전사 1번 스킬, 작업 213) 필드 검수 이미지.

브라우저 없이 실제 배포 에셋을 게임과 같은 규칙으로 합성한다(카메라만 2.2배 당겨 확대):
    - 아이소메트릭 투영 (x−y)·.86 / (x+y)·.43 — 화면상 히어로는 중앙
    - 전사 공격 시트 본체 높이 = 화면 높이 × 0.0935 × 확대율 (`heroScale.heroBodyFraction`)
    - 검기: `public/assets/fx_slash2_dual.png` 를 `render/vfx.ts` 와 같은 add 블렌딩으로 얹는다.
      1타는 정방향(−0.17rad), 2타는 좌우 반전(+0.2rad)으로 두 궤적이 X자로 교차한다.
    - 데미지 팝업: `updateDamageLabels` 처럼 타마다 −숫자 라벨을 하나씩(총 2회) 띄운다.

출력: `downloads/djrpg_skill_1_double_slash_ingame_v1.png`
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
OUTPUT = Path('/workspace/downloads/djrpg_skill_1_double_slash_ingame_v1.png')
SCREEN = (390, 844)
ZOOM = 2.2
BODY_FRACTION = .0935
BODY_PX = 270
SCREEN_ANGLE = .4636          # facing 0 → 화면 투영 각도(render.ts drawEffects 와 같은 식)
FIRST_ROTATION = SCREEN_ANGLE - .17
BACK_ROTATION = SCREEN_ANGLE + .2


def load(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def frame(sheet: Image.Image, index: int, cells: int = 4) -> Image.Image:
    width = sheet.width // cells
    return sheet.crop((index * width, 0, (index + 1) * width, sheet.height))


def project(x: float, y: float) -> tuple[float, float]:
    width, height = SCREEN
    return width / 2 + (x - y) * .86 * ZOOM, height / 2 + (x + y) * .43 * ZOOM


def field(background_tile: Image.Image) -> Image.Image:
    canvas = Image.new('RGBA', SCREEN, (26, 21, 18, 255))
    tile = background_tile.resize((round(background_tile.width * 1.1), round(background_tile.height * 1.1)), Image.LANCZOS)
    for top in range(0, SCREEN[1] + tile.height, tile.height):
        for left in range(0, SCREEN[0] + tile.width, tile.width):
            canvas.alpha_composite(tile, (left, top))
    canvas.alpha_composite(Image.new('RGBA', SCREEN, (12, 10, 14, 96)))
    return canvas


def paste_bottom_center(canvas: Image.Image, sprite: Image.Image, x: float, y: float, scale: float) -> None:
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    drawn = sprite.resize(size, Image.LANCZOS)
    canvas.alpha_composite(drawn, (round(x - size[0] / 2), round(y - size[1])))


def add_blend(canvas: Image.Image, sprite: Image.Image, center: tuple[float, float], width: float,
              rotation: float, squash: float, alpha: float, mirror: bool = False) -> None:
    """`vfx.ts` 와 같은 add 합성 — 검정 배경은 더해도 0 이라 배경이 남지 않는다."""
    height = width * sprite.height / sprite.width * squash
    drawn = sprite.resize((max(1, round(width)), max(1, round(height))), Image.LANCZOS)
    if mirror:
        drawn = drawn.transpose(Image.FLIP_LEFT_RIGHT)
    drawn = drawn.rotate(-rotation * 180 / 3.141592653589793, resample=Image.BICUBIC, expand=True)
    layer = Image.new('RGB', SCREEN, (0, 0, 0))
    layer.paste(drawn.convert('RGB'), (round(center[0] - drawn.width / 2), round(center[1] - drawn.height / 2)))
    if alpha < 1:
        layer = Image.eval(layer, lambda value: int(value * alpha))
    canvas.paste(ImageChops.add(canvas.convert('RGB'), layer).convert('RGBA'), (0, 0))


def draw_hp(draw: ImageDraw.ImageDraw, x: float, y: float, width: int, ratio: float) -> None:
    draw.rectangle([x - width / 2, y, x + width / 2, y + 5], fill=(37, 21, 23, 255))
    draw.rectangle([x - width / 2, y, x - width / 2 + width * max(0, ratio), y + 5], fill=(213, 59, 58, 255))


def popup(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, rise: float = 0) -> None:
    draw.text((x, y - rise), text, font=font(19), fill=(255, 214, 160, 240), anchor='mm')


def scene(step: str, gender: str, name: str, popups: int) -> Image.Image:
    canvas = field(load(ASSETS / 'wasteland-ground.png'))
    draw = ImageDraw.Draw(canvas, 'RGBA')
    height = SCREEN[1]
    scale = height * BODY_FRACTION * ZOOM / BODY_PX

    skeleton = load(ASSETS / 'skeleton_warrior.png')
    targets = [(-22, 46, .78), (54, 108, .95)]
    enemy_px = height * .095 * ZOOM
    for (ex, ey, ratio) in targets:
        px, py = project(ex, ey)
        draw.ellipse([px - 26, py - 9, px + 26, py + 9], fill=(0, 0, 0, 110))
        paste_bottom_center(canvas, skeleton, px, py, enemy_px / skeleton.height)
        draw_hp(draw, px, py - enemy_px - 12, 44, ratio if popups < 2 else max(.15, ratio - .35))

    attack = load(ASSETS / f'pilot-25d/warrior_{gender}_attack_v1.png')
    hero_frame = frame(attack, 2) if step == 'first' else frame(attack, 1)
    hx, hy = project(0, 0)
    draw.ellipse([hx - 34, hy - 11, hx + 34, hy + 11], fill=(0, 0, 0, 130))
    paste_bottom_center(canvas, hero_frame, hx, hy, scale)

    crest = load(ASSETS / 'fx_slash2_dual.png')
    forward = (0.898, 0.44)
    if step in ('first', 'both'):
        reach = 18 + 26 * .5
        add_blend(canvas, crest, (hx + forward[0] * reach * ZOOM, hy + forward[1] * reach * .55 * ZOOM - 36 * ZOOM),
                  176 * (.84 + .5 * .34) * ZOOM, FIRST_ROTATION, .82, 1.0)
    if step in ('back', 'both'):
        reach = 24 + 30 * .45
        add_blend(canvas, crest, (hx + forward[0] * reach * ZOOM, hy + forward[1] * reach * .55 * ZOOM - 44 * ZOOM),
                  204 * (.8 + .45 * .34) * ZOOM, BACK_ROTATION, .86, .95, mirror=True)
    draw = ImageDraw.Draw(canvas, 'RGBA')

    # 데미지 팝업 — 타마다 하나씩(1타는 먼저 뜬 숫자, 2타는 그 아래에 새로 뜬 숫자).
    if popups >= 1:
        for (ex, ey, _ratio) in targets:
            px, py = project(ex, ey)
            popup(draw, min(330, max(52, px)), py - enemy_px - 54, '-1,284', rise=10)
    if popups >= 2:
        for (ex, ey, _ratio) in targets:
            px, py = project(ex, ey)
            popup(draw, min(330, max(52, px)), py - enemy_px - 26, '-1,284', rise=0)

    draw.text((14, 12), 'DJRPG FIELD PREVIEW (COMPOSITE, %gx ZOOM)' % ZOOM, font=font(11), fill=(255, 233, 205, 235))
    draw.text((14, 30), name, font=font(11), fill=(214, 183, 155, 235))
    # 하단 스킬 슬롯 — 퀵슬롯 표시 이름이 이단참으로 바뀐 것을 함께 확인한다.
    for index in range(4):
        cx = 62 + index * 78
        active = index == 0
        draw.ellipse([cx - 26, SCREEN[1] - 96, cx + 26, SCREEN[1] - 44],
                     fill=(38, 30, 26, 225) if active else (28, 22, 26, 210),
                     outline=(196, 152, 108, 230) if active else (120, 92, 68, 220), width=2)
        draw.text((cx, SCREEN[1] - 74), '1' if index == 0 else str(index + 1), font=font(15), fill=(255, 226, 190, 240), anchor='mm')
    draw.text((62, SCREEN[1] - 30), '이단참', font=font(11), fill=(255, 226, 190, 235), anchor='mm')
    return canvas


_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int):
    if size not in _font_cache:
        for path in ['/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf', '/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
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
        scene('first', 'male', '1. MALE — 1타: 정방향 횡베기', 1),
        scene('back', 'male', '2. MALE — 2타: 되받아 베기(0.18초 뒤)', 2),
        scene('both', 'female', '3. FEMALE — 2연격 검기 교차 + 팝업 2회', 2),
    ]
    gap = 14
    result = Image.new('RGBA', (SCREEN[0] * 3 + gap * 4, SCREEN[1] + gap * 2), (18, 15, 17, 255))
    for index, panel in enumerate(panels):
        result.alpha_composite(panel, (gap + index * (SCREEN[0] + gap), gap))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    result.convert('RGB').save(OUTPUT, quality=92)
    print(OUTPUT, result.size)
