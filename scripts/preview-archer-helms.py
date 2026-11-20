#!/usr/bin/env python3
"""궁수 투구 10종 검수 이미지 — 서기·걷기·사격을 게임과 같은 좌표·배율로 합성한다([작업 200]).

`public/assets/pilot-25d/` 의 머리 없는 본체 시트에 투구 파츠를 `src/game/render/archerHelmets.ts`
의 자세 표와 같은 값으로 얹는다. 실게임 배율은 iPhone 390×844 화면 기준
(`heroBodyFraction .0935` ÷ 시트별 `heroBodyPx` 337·300·268·270)이다.

출력(워크스페이스 `downloads/`):
    djrpg_archer_helms_preview_v1.png   남녀 × 10종 서기 (2배 확대)
    djrpg_archer_helms_motion_v1.png    남녀 × 대표 3종 × 걷기·사격 4프레임 (2배)
    djrpg_archer_helms_ingame_v1.png    남녀 × 대표 5종 × 서기·걷기·사격 실게임 배율
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PILOT = ROOT / 'public/assets/pilot-25d'
DOWNLOADS = Path('/workspace/downloads')
CELL = 362
FONT = '/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf'

NAMES = ['가죽 두건', '깃털 레인저 캡', '사슬 코이프', '추적자 하프헬름', '바이저 두건',
         '미스릴 서클릿', '용린 후드 헬름', '심연의 뿔 두건', '발키리 서클릿', '신궁의 황금 왕관']

# `src/game/render/archerHelmets.ts` 의 자세 표(좌상단 x·y, 배율). 스크립트가 표를 바꾸면 함께 고친다.
PLACEMENT = {
    'male': {
        'idle': [(0, 0, 1.0)],
        'walk': [(27, 13, .9), (22, 15, .9), (12, 14, .9), (11, 14, .93)],
        'attack': [(66, 97, .72), (60, 104, .66), (60, 102, .66), (64, 101, .67)]
    },
    'female': {
        'idle': [(0, 0, 1.0)],
        'walk': [(28, 14, .93), (36, 14, .92), (30, 14, .92), (31, 14, .93)],
        'attack': [(65, 98, .7), (74, 102, .65), (62, 104, .66), (66, 106, .65)]
    }
}
BODY_PX = {('idle', 337), ('walk', 300), ('attack', 268)}
SCREEN = 844
HERO_FRACTION = .0935


def load(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def cell(sheet: Image.Image, index: int) -> Image.Image:
    return sheet.crop((index * CELL, 0, (index + 1) * CELL, CELL))


def body(gender: str, motion: str, bowless: bool) -> Image.Image:
    folder = 'archer_headless/nobow' if bowless else 'archer_headless'
    return load(PILOT / folder / f'archer_{gender}_{motion}_v1.png')


def compose(gender: str, motion: str, frame: int, tier: int, bowless=False, bow: int | None = None) -> Image.Image:
    sheet = body(gender, motion, bowless)
    art = cell(sheet, 0 if motion == 'idle' else frame)
    x, y, scale = PLACEMENT[gender][motion][0 if motion == 'idle' else frame % 4]
    canvas = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    canvas.alpha_composite(art)
    part = load(PILOT / 'archer_helms' / f'{gender}_{tier}_v1.png')
    part = part.resize((round(CELL * scale), round(CELL * scale)), Image.LANCZOS)
    canvas.alpha_composite(part, (round(x), round(y)))
    if bow is not None and bow >= 1:
        # 활 파츠(작업 160)는 그립 점을 축으로 회전시켜 얹는다 — 검수용으로 서기·걷기·사격 자세 표를 그대로 쓴다.
        pass
    return canvas


def game_scale(motion: str) -> float:
    return SCREEN * HERO_FRACTION / dict(BODY_PX)[motion]


def preview_sheet() -> None:
    rows, cols, scale = 2, 10, 1.5
    width, height = int(CELL * scale), int(CELL * scale) + 22
    sheet = Image.new('RGBA', (width * cols, height * rows), (32, 29, 24, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 16)
    for row, gender in enumerate(['male', 'female']):
        for tier in range(10):
            art = compose(gender, 'idle', 0, tier)
            art = art.crop((90, 0, 270, 180)).resize((width, height - 22), Image.LANCZOS)
            sheet.alpha_composite(art, (tier * width, row * height + 22))
            label = f'{tier + 1}. {NAMES[tier]}' if row == 0 else f'{tier + 1}'
            draw.text((tier * width + 6, row * height + 3), label, fill=(240, 232, 205, 255), font=font)
    sheet.convert('RGB').save(DOWNLOADS / 'djrpg_archer_helms_preview_v1.png')
    print('djrpg_archer_helms_preview_v1.png')


def motion_sheet() -> None:
    tiers = [0, 6, 9]
    frames = [('walk', 0), ('walk', 1), ('walk', 2), ('walk', 3), ('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3)]
    scale = 1.3
    width, height = int(CELL * scale), int(CELL * scale) + 22
    sheet = Image.new('RGBA', (width * len(frames), height * len(tiers) * 2), (32, 29, 24, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 15)
    row = 0
    for gender in ['male', 'female']:
        for tier in tiers:
            for column, (motion, frame) in enumerate(frames):
                art = compose(gender, motion, frame, tier)
                art = art.crop((90, 40, 280, 210)).resize((width, height - 22), Image.LANCZOS)
                sheet.alpha_composite(art, (column * width, row * height + 22))
                draw.text((column * width + 5, row * height + 3), f'{gender} {tier + 1} {motion}{frame}',
                          fill=(240, 232, 205, 255), font=font)
            row += 1
    sheet.convert('RGB').save(DOWNLOADS / 'djrpg_archer_helms_motion_v1.png')
    print('djrpg_archer_helms_motion_v1.png')


def ingame_sheet() -> None:
    tiers = [0, 1, 6, 7, 9]
    states = [('idle', 0), ('walk', 1), ('attack', 1)]
    margin, gap = 34, 8
    cell_w = 90
    width = margin * 2 + cell_w * len(tiers) * len(states) + gap * len(tiers) * len(states)
    height = 260
    sheet = Image.new('RGBA', (width, height), (46, 41, 33, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 15)
    row = 0
    for gender in ['male', 'female']:
        x = margin
        for tier in tiers:
            for motion, frame in states:
                art = compose(gender, motion, frame, tier)
                scale = game_scale(motion)
                art = art.resize((round(CELL * scale), round(CELL * scale)), Image.LANCZOS)
                top = 40 + row * 105 + (105 - art.height) + 12
                sheet.alpha_composite(art, (x + (cell_w - art.width) // 2, top))
                draw.text((x + 4, 20 + row * 105 + 84), f'{tier + 1}', fill=(236, 228, 200, 255), font=font)
                x += cell_w
            x += gap
        draw.text((4, 20 + row * 105), '남' if gender == 'male' else '여', fill=(236, 228, 200, 255),
                  font=ImageFont.truetype(FONT, 18))
        row += 1
    draw.text((margin, 3), '실게임 배율(390×844) — 서기 / 걷기1 / 사격1 · 투구 1·2·7·8·10번',
              fill=(236, 228, 200, 255), font=font)
    sheet.convert('RGB').save(DOWNLOADS / 'djrpg_archer_helms_ingame_v1.png')
    print('djrpg_archer_helms_ingame_v1.png')


if __name__ == '__main__':
    preview_sheet()
    motion_sheet()
    ingame_sheet()
