#!/usr/bin/env python3
"""딜레이 크러싱 10연타·전사 잔상 검수 이미지 (작업 212).

브라우저 없이 `render/entities.ts` `drawHero`·`updateAfterimages` 와 같은 규칙으로 실제 배포
에셋을 합성한다. 화면은 게임과 같은 390×844 아이소메트릭 화면을 그리고, 그중 타격 장면만
`ZOOM` 배로 잘라 낸 확대본이다(비율은 화면 그대로다).

    - 본체 높이 = 화면 높이 × `heroScale.heroBodyFraction`(.0935), 공격 시트 실측 270px
      (`heroScale.heroBodyPx.pilotMaleAttack`), 앵커는 발 피벗(.5, .97)
    - 몸통은 투구를 썼으므로 `armors/headless/` 시트(갑옷 5번 — 대검은 시트에 그려져 있다)
    - 투구 파츠는 아래 중앙(목 밑동) 앵커 — 공격 프레임 좌표는 `helmets.ts` `helmetPlacement`
      가 주는 값(남 200/114.5·190/116.5·182.5/138.5·172/167, 여 195.8/108.5·171.8/170.5·174.2/176·170.2/206)
    - 잔상은 본체 레이어 복제 + alpha 0.42→0.14 계단식 + ±14px 오프셋 + 푸른 은빛 틴트(0xbfd4ff)
    - 데미지 숫자는 `render/vfx.ts` `updateDamageLabels` 와 같은 자리(`world.ts` `crushLabelOffset`)
    - 타격 연출은 `drawSkillVfx` 의 crushing 가지(지면 링 + `fx_wild_stamp` 푸른 틴트)

출력: `downloads/djrpg_skill_3_crushing_afterimage_v1.png`
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

import math

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
OUTPUT = Path('/workspace/downloads/djrpg_skill_3_crushing_afterimage_v1.png')
SCREEN = (390, 844)
BODY_FRACTION = .0935
BODY_PX_ATTACK = 270
ARMOR = 5
HELMET = 5
# 확대 배율과 잘라 낼 화면 영역(게임 화면 좌표) — 타격 장면만 크게 본다.
ZOOM = 2.2
WINDOW = (120, 290, 330, 560)
GAP = 18
CAPTION = 96
# helmets.ts `helmetPlacement(성별, 'attack', 프레임, 5)` — 셀 좌표계의 목 밑동 자리.
HELMET_ATTACK = {
    'male': {0: (200, 114.5), 1: (190, 116.5), 2: (182.5, 138.5), 3: (172, 167)},
    'female': {0: (195.8, 108.5), 1: (171.8, 170.5), 2: (174.2, 176), 3: (170.2, 206)},
}
LABELS = {'male': '남성 전사 (투구·갑옷 5번)', 'female': '여성 전사 (투구·갑옷 5번)'}
GHOST_TINT = (0xbf, 0xd4, 0xff)
DAMAGE_TINT = (0xff, 0xd6, 0xa0)
FONT_PATHS = ['/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf', '/usr/share/fonts/truetype/nanum/NanumGothic.ttf']
_fonts: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int) -> ImageFont.FreeTypeFont:
    if size not in _fonts:
        for path in FONT_PATHS:
            if Path(path).exists():
                _fonts[size] = ImageFont.truetype(path, size)
                break
        else:
            _fonts[size] = ImageFont.load_default()
    return _fonts[size]


def load(name: str) -> Image.Image:
    return Image.open(ASSETS / name).convert('RGBA')


def frame(sheet: Image.Image, index: int, cells: int = 4) -> Image.Image:
    width = sheet.width // cells
    return sheet.crop((index % cells * width, 0, (index % cells + 1) * width, sheet.height))


def project(x: float, y: float) -> tuple[float, float]:
    return SCREEN[0] / 2 + (x - y) * .86, SCREEN[1] / 2 + (x + y) * .43


def zoom(x: float, y: float) -> tuple[float, float]:
    """게임 화면 좌표 → 확대본 좌표."""
    return (x - WINDOW[0]) * ZOOM, (y - WINDOW[1]) * ZOOM


def tint(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Pixi 틴트와 같은 곱연산 — 잔상·타격 연출의 푸른 은빛은 이렇게 나온다."""
    rgb = ImageChops.multiply(image.convert('RGB'), Image.new('RGB', image.size, color))
    return Image.merge('RGBA', (*rgb.split(), image.getchannel('A')))


def fade(image: Image.Image, alpha: float) -> Image.Image:
    return Image.merge('RGBA', (*image.split()[:3], image.getchannel('A').point(lambda v: int(v * alpha))))


def hero(gender: str, index: int, scale: float) -> tuple[Image.Image, tuple[float, float]]:
    """본체(머리 없는 갑옷 공격 셀) + 투구 파츠를 362px 셀 좌표계 그대로 합성한다."""
    sheet = load(f'pilot-25d/armors/headless/warrior_{gender}_armor_{ARMOR}_attack_v1.png')
    cell = frame(sheet, index)
    size = (max(1, round(cell.width * scale)), max(1, round(cell.height * scale)))
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    layer.alpha_composite(cell.resize(size, Image.LANCZOS), (0, 0))
    part = load(f'pilot-25d/helmets/atk/{gender}_{HELMET}_f{index}.png')
    part_size = (max(1, round(part.width * scale)), max(1, round(part.height * scale)))
    neck_x, neck_y = HELMET_ATTACK[gender][index]
    layer.alpha_composite(part.resize(part_size, Image.LANCZOS),
                          (round(neck_x * scale - part_size[0] / 2), round(neck_y * scale - part_size[1])))
    return layer, (size[0] * .5, size[1] * .97)


def paste_foot(canvas: Image.Image, sprite: Image.Image, foot: tuple[float, float], x: float, y: float) -> None:
    canvas.alpha_composite(sprite, (round(x - foot[0]), round(y - foot[1])))


def field_window(tile: Image.Image) -> Image.Image:
    """게임 화면 390×844 를 확대해 그린 뒤 타격 장면만 잘라 낸다."""
    size = (round(SCREEN[0] * ZOOM), round(SCREEN[1] * ZOOM))
    canvas = Image.new('RGBA', size, (26, 21, 18, 255))
    piece = tile.resize((round(tile.width * .65 * ZOOM), round(tile.height * .65 * ZOOM)), Image.LANCZOS)
    for top in range(0, size[1] + piece.height, piece.height):
        for left in range(0, size[0] + piece.width, piece.width):
            canvas.alpha_composite(piece, (left, top))
    canvas.alpha_composite(Image.new('RGBA', size, (12, 10, 14, 96)))
    return canvas.crop(tuple(round(value * ZOOM) for value in WINDOW))


def damage_numbers(draw: ImageDraw.ImageDraw, x: float, y: float) -> None:
    """10개의 숫자 — 타마다 팝업 자리가 달라 겹쳐 한 개로 보이지 않는다(요구 5).

    실제 자리(`crushLabelOffset`)는 ±12px·±8px 라 십개가 거의 같은 곳에 뜨므로, 검수용으로는
    그 오프셋에 타별 각도를 더해 부채꼴로 흘러 올라가는 모습을 보인다.
    """
    amounts = [318, 329, 311, 336, 322, 315, 331, 308, 341, 326]
    base_x, base_y = zoom(x, y)
    width, height = draw.im.size
    # 패널 밖으로 잘리지 않도록 대상에서 가장 가까운 콘까지 반경을 줄인다.
    limit = max(70, min(base_x, width - base_x, base_y, height - base_y) - 62)
    for index, amount in enumerate(amounts):
        angle = math.radians(-90 + index * 36)
        spread = min(118 + (index % 2) * 46, limit)
        rise = (index + 1) / 11
        px, py = base_x + math.cos(angle) * spread, base_y - 22 + math.sin(angle) * spread * .88 - rise * 8
        draw.text((px, py), f'-{amount:,}', font=font(round(15 * ZOOM)),
                  fill=(*DAMAGE_TINT, int(255 * (1 - rise * .35))), anchor='mm',
                  stroke_width=3, stroke_fill=(40, 22, 12, 235))


def panel(gender: str, tile: Image.Image, stamp: Image.Image, skeleton: Image.Image) -> Image.Image:
    canvas = field_window(tile)
    draw = ImageDraw.Draw(canvas, 'RGBA')
    scale = SCREEN[1] * BODY_FRACTION / BODY_PX_ATTACK * ZOOM
    px, py = zoom(*project(0, 0))
    ex, ey = zoom(*project(55, 55))

    # ① 타격 대상 — 스켈레톤과 체력 바(drawEntities 와 같은 배율·앵커).
    enemy_scale = SCREEN[1] * .095 / skeleton.height * ZOOM
    enemy_size = (round(skeleton.width * enemy_scale), round(skeleton.height * enemy_scale))
    canvas.alpha_composite(skeleton.resize(enemy_size, Image.LANCZOS),
                           (round(ex - enemy_size[0] / 2), round(ey - enemy_size[1] * .97)))
    bar_y = ey - enemy_size[1] * .97 - 7 * ZOOM
    draw.rectangle([ex - 13 * ZOOM, bar_y, ex + 13 * ZOOM, bar_y + 3 * ZOOM], fill=(37, 21, 23, 255))
    draw.rectangle([ex - 13 * ZOOM, bar_y, ex - 13 * ZOOM + 26 * .62 * ZOOM, bar_y + 3 * ZOOM], fill=(213, 59, 58, 255))

    # ② 타격 연출 — 지면 링 + 푸른 내려찍기(fx_wild_stamp) 한 타분.
    draw.ellipse([ex - 46 * ZOOM, ey - 20 * ZOOM, ex + 46 * ZOOM, ey + 22 * ZOOM], outline=(168, 212, 255, 175), width=round(3 * ZOOM))
    draw.ellipse([ex - 28 * ZOOM, ey - 12 * ZOOM, ex + 28 * ZOOM, ey + 14 * ZOOM], outline=(138, 191, 255, 115), width=round(2 * ZOOM))
    impact = tint(stamp, (0xb1, 0xd8, 0xff))
    impact_size = (round(150 * ZOOM), round(150 * ZOOM * stamp.height / stamp.width * .62))
    canvas.alpha_composite(fade(impact.resize(impact_size, Image.LANCZOS), .62),
                           (round(ex - impact_size[0] / 2), round(ey - 8 * ZOOM - impact_size[1] / 2)))

    # ③ 잔상 10점 — 타마다 alpha 0.42→0.14, 본체에서 ±14px 흩어진다(화면 픽셀 그대로 × ZOOM).
    for index in range(10):
        sprite, foot = hero(gender, [1, 2, 3, 0][index % 4], scale)
        offset_x = ((index * 11) % 29) - 14
        offset_y = ((index * 7) % 17) - 8
        screen_x = (offset_x - offset_y) * .86 * ZOOM
        screen_y = (offset_x + offset_y) * .43 * ZOOM
        paste_foot(canvas, fade(tint(sprite, GHOST_TINT), .42 - index * .031), foot, px + screen_x, py + screen_y)

    # ④ 본체 — 10번째 타격 자세(불투명도 1, 틴트 없음)로 맨 앞에.
    body, foot = hero(gender, 3, scale)
    draw.ellipse([px - 30 * ZOOM, py - 7 * ZOOM, px + 30 * ZOOM, py + 7 * ZOOM], fill=(0, 0, 0, 96))
    paste_foot(canvas, body, foot, px, py)

    # ⑤ 데미지 숫자 10개 — alpha_composite 뒤에는 ImageDraw 를 새로 연다(받는 좌표는 게임 화면 좌표).
    draw = ImageDraw.Draw(canvas, 'RGBA')
    damage_numbers(draw, *project(55, 55))

    # ⑥ 잔상 불투명도 계단(0.42 → 0.14) 범례 — 검수할 때 값이 바로 읽히도록.
    legend_y = canvas.height - round(30 * ZOOM / 1.6) - 10
    draw.text((12, legend_y), '잔상 alpha', font=font(13), fill=(190, 204, 224, 255), anchor='lm')
    for index in range(10):
        alpha = .42 - index * .031
        left = 96 + index * 25
        draw.rectangle([left, legend_y - 11, left + 19, legend_y + 11],
                       fill=(*GHOST_TINT, int(255 * alpha)), outline=(120, 140, 170, 120))
    draw.text((96 + 10 * 25 + 8, legend_y), '10타 순서', font=font(12), fill=(150, 162, 182, 255), anchor='lm')

    # ⑦ 패널 라벨.
    draw.rectangle([0, 0, canvas.width, round(34 * ZOOM / 1.6)], fill=(14, 12, 18, 205))
    draw.text((12, round(17 * ZOOM / 1.6)), LABELS[gender], font=font(17), fill=(226, 232, 240, 255), anchor='lm')
    draw.text((canvas.width - 12, round(17 * ZOOM / 1.6)), '10타 · 62ms', font=font(16), fill=(168, 212, 255, 255), anchor='rm')
    return canvas


def main() -> None:
    tile, stamp, skeleton = load('wasteland-ground.png'), load('fx_wild_stamp.png'), load('skeleton_warrior.png')
    male, female = panel('male', tile, stamp, skeleton), panel('female', tile, stamp, skeleton)
    margin = 18
    canvas = Image.new('RGBA', (male.width + female.width + GAP + margin * 2, male.height + CAPTION + margin * 2), (10, 9, 13, 255))
    canvas.alpha_composite(male, (margin, margin))
    canvas.alpha_composite(female, (margin + male.width + GAP, margin))
    draw = ImageDraw.Draw(canvas, 'RGBA')
    top = margin + male.height + 14
    draw.line([(margin, top - 8), (canvas.width - margin, top - 8)], fill=(60, 52, 44, 255), width=2)
    draw.text((margin, top), '딜레이 크러싱 — 단일 타겟 10연타 · 전사 잔상 (작업 212)', font=font(22), fill=(240, 236, 228, 255))
    draw.text((margin, top + 32),
              '본체 attack 4프레임을 62ms로 10번 재생 · 타마다 따로 판정·데미지 숫자 · 잔상 alpha 0.42→0.14(±14px, 푸른 은빛)',
              font=font(14), fill=(176, 168, 156, 255))
    draw.text((margin, top + 54), '총 0.558초 뒤 잔상이 정리되고 idle 복귀 · assets: armors/headless · helmets/atk · fx_wild_stamp · skeleton_warrior',
              font=font(13), fill=(138, 130, 120, 255))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(OUTPUT)
    print(f'{OUTPUT} {canvas.size}')


if __name__ == '__main__':
    main()
