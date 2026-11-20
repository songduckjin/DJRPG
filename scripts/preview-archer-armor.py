#!/usr/bin/env python3
"""궁수 갑옷 10종 필드 검수 이미지 — 실제 배포 에셋을 게임과 같은 비율로 합성한다(작업 160).

브라우저 없이 `drawHero`/`drawEntities` 와 같은 규칙을 따른다:
    - 화면: 390×844 (iPhone 기준), 아이소메트릭 투영 (x−y)·.86 / (x+y)·.43
    - 궁수 본체 높이 = 화면 높이 × 0.0935 (`heroScale.heroBodyFraction`)
    - 걷기·사격 시트는 362px 셀 4프레임을 그대로 잘라 쓴다

패널: 남/여 × 1·5·9번 갑옷(스타터 → 중간 → 최상위). 갑옷 0번(가죽 조끼)은 스타터 시트 그 자체다.
출력: `downloads/djrpg_archer_armor_ingame_v1.png`
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/assets'
OUTPUT = Path('/workspace/downloads/djrpg_archer_armor_ingame_v1.png')
SCREEN = (390, 844)
BODY_FRACTION = .0935
# `render/heroScale.ts` `heroBodyPx` — 시트별 본체 높이(px). 갑옷 시트도 같은 값을 쓴다.
BODY_PX = {('male', 'idle'): 337, ('male', 'walk'): 300, ('male', 'attack'): 268,
           ('female', 'idle'): 337, ('female', 'walk'): 300, ('female', 'attack'): 270}
# 이미지 라벨은 한글 폰트가 없는 환경에서도 읽히도록 영문으로 둔다(한글 이름은 문서·PR에 있다).
NAMES = {0: 'LEATHER VEST', 1: 'STUDDED LEATHER', 2: 'CHAINMAIL', 3: 'STEEL BREASTPLATE', 4: 'HALF PLATE',
         5: 'MITHRIL ARMOR', 6: 'OBSIDIAN ARMOR', 7: 'DRAGON MAIL', 8: 'PALADIN FULL PLATE', 9: 'OVERLORD WARPLATE'}


def load(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def frame(sheet: Image.Image, index: int) -> Image.Image:
    width = sheet.width // 4
    return sheet.crop((index * width, 0, (index + 1) * width, sheet.height))


def project(x: float, y: float) -> tuple[float, float]:
    width, height = SCREEN
    return width / 2 + (x - y) * .86, height / 2 + (x + y) * .43


def paste_bottom_center(canvas: Image.Image, sprite: Image.Image, x: float, y: float, scale: float) -> None:
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    canvas.alpha_composite(sprite.resize(size, Image.LANCZOS), (round(x - size[0] / 2), round(y - size[1])))


def field() -> Image.Image:
    canvas = Image.new('RGBA', SCREEN, (26, 21, 18, 255))
    tile = load(ASSETS / 'wasteland-ground.png')
    tile = tile.resize((round(tile.width * .65), round(tile.height * .65)), Image.LANCZOS)
    for top in range(0, SCREEN[1] + tile.height, tile.height):
        for left in range(0, SCREEN[0] + tile.width, tile.width):
            canvas.alpha_composite(tile, (left, top))
    canvas.alpha_composite(Image.new('RGBA', SCREEN, (12, 10, 14, 96)))
    return canvas


_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int):
    if size not in _font_cache:
        for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/nanum/NanumGothic.ttf']:
            if Path(path).exists():
                try:
                    _font_cache[size] = ImageFont.truetype(path, size)
                    break
                except OSError:
                    continue
        else:
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]


def armor_sheet(gender: str, tier: int, motion: str) -> Image.Image:
    if tier == 0:
        return load(ASSETS / f'pilot-25d/archer_{gender}_{motion}_v1.png')
    return load(ASSETS / f'pilot-25d/archer_armors/archer_{gender}_armor_{tier}_{motion}_v1.png')


def scene(gender: str, tier: int, motion: str, frame_index: int) -> Image.Image:
    canvas = field()
    draw = ImageDraw.Draw(canvas, 'RGBA')
    height = SCREEN[1]
    scale = height * BODY_FRACTION / BODY_PX[(gender, motion)]
    skeleton = load(ASSETS / 'skeleton_warrior.png')
    for (ex, ey) in [(-34, 58), (52, 118)]:
        px, py = project(ex, ey)
        paste_bottom_center(canvas, skeleton, px, py, height * .095 / skeleton.height)
        draw.ellipse([px - 19, py - 7, px + 19, py + 7], fill=(0, 0, 0, 110))
        draw.rectangle([px - 13, py - height * .095 - 7, px + 13, py - height * .095 - 4], fill=(37, 21, 23, 255))
        draw.rectangle([px - 13, py - height * .095 - 7, px + 13 * .78, py - height * .095 - 4], fill=(213, 59, 58, 255))
    hx, hy = project(0, 0)
    hero = frame(armor_sheet(gender, tier, motion), frame_index) if motion != 'idle' else armor_sheet(gender, tier, motion)
    paste_bottom_center(canvas, hero, hx, hy, scale)
    draw.ellipse([hx - 22, hy - 7, hx + 22, hy + 7], fill=(0, 0, 0, 128))
    draw.text((12, 10), f'{gender.upper()} · {tier}. {NAMES[tier]} · {motion.upper()}', font=font(11), fill=(255, 233, 205, 240))
    draw.text((12, 27), 'DJRPG ARCHER ARMOR FIELD PREVIEW (COMPOSITE)', font=font(9), fill=(214, 183, 155, 220))
    # 게임 배율(화면 높이 9.35%)에서는 디테일이 안 보여 2.4배 확대 인셋을 붙인다.
    inset = 2.4
    left, top = round(hx - 54), round(hy - 104)
    crop = canvas.crop((left, top, left + 108, top + 108)).resize((round(108 * inset), round(108 * inset)), Image.LANCZOS)
    box_w, box_h = crop.size
    ox, oy = SCREEN[0] - box_w - 10, 470
    canvas.alpha_composite(crop, (ox, oy))
    draw.rectangle([ox - 1, oy - 1, ox + box_w, oy + box_h], outline=(196, 152, 108, 220), width=1)
    draw.text((ox + 4, oy + box_h + 3), '2.4x DETAIL', font=font(9), fill=(214, 183, 155, 235))
    return canvas


if __name__ == '__main__':
    panels = [
        scene('male', 0, 'walk', 0), scene('male', 5, 'walk', 0), scene('male', 9, 'attack', 2),
        scene('female', 1, 'walk', 0), scene('female', 5, 'attack', 2), scene('female', 9, 'idle', 0),
    ]
    cols, rows = 3, 2
    sheet = Image.new('RGBA', (SCREEN[0] * cols + 8 * (cols - 1), SCREEN[1] * rows + 8), (14, 12, 15, 255))
    for index, panel in enumerate(panels):
        x = (index % cols) * (SCREEN[0] + 8)
        y = (index // cols) * (SCREEN[1] + 8)
        sheet.alpha_composite(panel, (x, y))
    sheet.convert('RGB').save(OUTPUT)
    print(OUTPUT)
