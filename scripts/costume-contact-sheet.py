#!/usr/bin/env python3
"""DJRPG 코스튬 접촉 시트 검수기 — 배포된 아틀라스를 게임과 같은 순서로 합성한다.

`costumeHero.ts` `planHeroCostume()`·`costumeLayerCell()`과 같은 규칙(부위별 zOrder,
변형 인덱스 → 페이지·칸, 셀 234×242, 갑옷 착용 시 본체 파츠 교체)으로 아틀라스 셀을
겹쳐 한 장의 PNG로 저장한다. 생성기가 만든 중간 셀이 아니라 **배포본 PNG**를 읽으므로
"실제로 화면에 나갈 그림"을 눈으로 검수할 수 있다.

실행 예:
  python3 scripts/costume-contact-sheet.py --version 3                      # 기본 조합 전체
  python3 scripts/costume-contact-sheet.py --version 3 --helmets           # 투구 10종 접촉 시트

출력: `/workspace/downloads/costume_v<N>_contact_<gender>.png` 등.
"""

from __future__ import annotations

import argparse
import json
import os

from PIL import Image

CELL_W, CELL_H = 234, 242
VARIANT_STRIDE = 32
MOTION_OFFSET = {'idle': 0, 'walk': 1, 'attack': 9, 'slash': 13, 'spin': 17, 'smash': 23, 'cast': 27}
MOTION_FRAMES = {'idle': 1, 'walk': 8, 'attack': 4, 'slash': 4, 'spin': 6, 'smash': 4, 'cast': 3}
Z_ORDER = {'legs': 0, 'boots': 5, 'torso': 10, 'armor': 10, 'arms': 15, 'gloves': 20, 'helmet': 30, 'offhand': 40, 'weapon': 50}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = '/workspace/downloads'


def slot_of(costume_id: str) -> str:
    return costume_id.split('-')[0]


class Atlas:
    """배포본 아틀라스 폴더 하나를 읽어 (성별·부위·변형·모션·프레임) → 셀 이미지를 준다."""

    def __init__(self, directory: str):
        self.directory = directory
        with open(os.path.join(directory, 'manifest.json'), encoding='utf-8') as handle:
            self.manifest = json.load(handle)
        # 변형 인덱스 = 매니페스트 안 같은 부위 항목 순서(costumeHero.ts variantIndex와 같다).
        self.variants: dict[tuple[str, str], int] = {}
        counts: dict[str, int] = {}
        self.variants = {}
        for entry in self.manifest['costumes']:
            slot = entry['slot']
            self.variants[(slot, entry['costumeId'])] = counts.get(slot, 0)
            counts[slot] = counts.get(slot, 0) + 1
        self.pages: dict[str, Image.Image] = {}

    def page(self, slot: str, variant: int, gender: str) -> Image.Image:
        if slot.startswith('body'):
            name = f'body-{gender}'
        else:
            name = f'{slot}-{gender}' if variant < 2 else f'{slot}-{gender}-{variant // 2 + 1}'
        if name not in self.pages:
            self.pages[name] = Image.open(os.path.join(self.directory, 'atlas', f'{name}.png')).convert('RGBA')
        return self.pages[name]

    def cell(self, slot: str, variant: int, gender: str, motion: str, frame: int) -> Image.Image | None:
        cell = (variant % 2) * VARIANT_STRIDE + MOTION_OFFSET[motion] + frame
        page = self.page(slot, variant, gender)
        column, row = cell % 8, cell // 8
        return page.crop((column * CELL_W, row * CELL_H, (column + 1) * CELL_W, (row + 1) * CELL_H))


def compose(atlas: Atlas, gender: str, equipment: dict[str, str], motion: str, frame: int) -> Image.Image:
    """`costumeHero.ts`와 같은 규칙으로 한 프레임을 합성한다."""
    layers: list[tuple[int, Image.Image]] = []
    armored = 'armor' in equipment
    body_parts = ('torso', 'arms', 'legs') if not armored else ()
    for part in body_parts:
        variant = ('torso', 'arms', 'legs').index(part)
        image = atlas.cell('body', variant, gender, motion, frame)
        layers.append((Z_ORDER[part], image))
    for costume_id in equipment.values():
        slot = slot_of(costume_id)
        variant = atlas.variants[(slot, costume_id)]
        # 갑옷을 입지 않았으면 투구는 맨몸 머리에 맞춘 페이지를 쓴다(costumeHero.ts v3 규칙).
        page_slot = 'helmet-body' if slot == 'helmet' and not armored else slot
        image = atlas.cell(page_slot, variant, gender, motion, frame)
        layers.append((Z_ORDER[slot], image))
    layers.sort(key=lambda item: item[0])
    frame_image = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    for _z, image in layers:
        frame_image.alpha_composite(image)
    return frame_image


def frame_row(atlas: Atlas, gender: str, equipment: dict[str, str], frames: list[tuple[str, int]], zoom: int) -> Image.Image:
    images = [compose(atlas, gender, equipment, motion, frame) for motion, frame in frames]
    sheet = Image.new('RGBA', (CELL_W * len(images), CELL_H), (86, 74, 58, 255))
    for index, image in enumerate(images):
        sheet.alpha_composite(image, (index * CELL_W, 0))
    if zoom > 1:
        sheet = sheet.resize((sheet.width * zoom, sheet.height * zoom), Image.LANCZOS)
    return sheet


def stack(rows: list[Image.Image], gap: int = 4) -> Image.Image:
    width = max(row.width for row in rows)
    height = sum(row.height for row in rows) + gap * (len(rows) - 1)
    sheet = Image.new('RGBA', (width, height), (60, 52, 42, 255))
    y = 0
    for row in rows:
        sheet.alpha_composite(row, (0, y))
        y += row.height + gap
    return sheet


BASE_COMBOS: list[tuple[str, dict[str, str]]] = [
    ('nude', {}),
    ('helm_t7_only', {'helmet': 'helmet-t7'}),
    ('armor3+helm3', {'armor': 'armor-t3', 'helmet': 'helmet-t3'}),
    ('armor3+helm3+gloves3+boots3+weapon3', {'armor': 'armor-t3', 'helmet': 'helmet-t3', 'gloves': 'gloves-t3', 'boots': 'boots-t3', 'weapon': 'weapon-t3'}),
    ('armor9+helm9+off4+weapon9', {'armor': 'armor-t9', 'helmet': 'helmet-t9', 'offhand': 'offhand-t4', 'weapon': 'weapon-t9'}),
    ('helm0_only', {'helmet': 'helmet-t0'}),
    ('armor0_only', {'armor': 'armor-t0'}),
    ('gloves5_only', {'gloves': 'gloves-t3'}),
    ('boots4_only', {'boots': 'boots-t4'}),
]
FRAMES = [('idle', 0), ('walk', 0), ('walk', 1), ('walk', 3), ('walk', 5), ('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3)]


def build_contact(atlas: Atlas, version: int, gender: str, zoom: int, combos, frames) -> str:
    rows, labels = [], []
    try:
        from PIL import ImageDraw
        draw = True
    except ImportError:  # pragma: no cover
        draw = False
    for label, equipment in combos:
        row = frame_row(atlas, gender, equipment, frames, zoom)
        if draw:
            canvas = Image.new('RGBA', (row.width + 150, row.height), (60, 52, 42, 255))
            canvas.alpha_composite(row, (150, 0))
            ImageDraw.Draw(canvas).text((4, 4), label, fill=(230, 220, 200, 255))
            row = canvas
        rows.append(row)
        labels.append(label)
    sheet = stack(rows)
    path = os.path.join(OUTPUT_DIR, f'costume_v{version}_contact_{gender}.png')
    sheet.convert('RGB').save(path)
    return path


def build_helmets(atlas: Atlas, version: int, gender: str, zoom: int) -> str:
    """투구 10종 × (맨몸 / 갑옷 위) × 공격 4프레임 — 싱크·파편 검수용."""
    from PIL import ImageDraw
    frames = [('idle', 0), ('walk', 3), ('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3)]
    rows = []
    for armor in (False, True):
        for index in range(10):
            equipment = {'helmet': f'helmet-t{index}'}
            if armor:
                equipment['armor'] = 'armor-t3'
            row = frame_row(atlas, gender, equipment, frames, zoom)
            canvas = Image.new('RGBA', (row.width + 190, row.height), (60, 52, 42, 255))
            canvas.alpha_composite(row, (190, 0))
            ImageDraw.Draw(canvas).text((4, 4), f"helmet-t{index}{' +armor' if armor else ' nude'}", fill=(230, 220, 200, 255))
            rows.append(canvas)
    sheet = stack(rows)
    path = os.path.join(OUTPUT_DIR, f'costume_v{version}_helmets_{gender}.png')
    sheet.convert('RGB').save(path)
    return path


def build_motions(atlas: Atlas, version: int, gender: str, zoom: int) -> str:
    """공격 계열 5모션 전 프레임 — 끊김·잔여 픽셀 검수용(갑옷+투구+무기)."""
    from PIL import ImageDraw
    equipment = {'armor': 'armor-t3', 'helmet': 'helmet-t3', 'gloves': 'gloves-t3', 'boots': 'boots-t3', 'weapon': 'weapon-t3'}
    rows = []
    for motion, count in (('attack', 4), ('slash', 4), ('spin', 6), ('smash', 4), ('cast', 3), ('walk', 8)):
        row = frame_row(atlas, gender, equipment, [(motion, i) for i in range(count)], zoom)
        canvas = Image.new('RGBA', (row.width + 110, row.height), (60, 52, 42, 255))
        canvas.alpha_composite(row, (110, 0))
        ImageDraw.Draw(canvas).text((4, 4), motion, fill=(230, 220, 200, 255))
        rows.append(canvas)
    sheet = stack(rows)
    path = os.path.join(OUTPUT_DIR, f'costume_v{version}_motions_{gender}.png')
    sheet.convert('RGB').save(path)
    return path


VERIFY_COMBOS: list[tuple[str, dict[str, str]]] = [
    ('nude', {}),
    ('nude+helmet-t7', {'helmet': 'helmet-t7'}),
    ('armor-t3+helmet-t3', {'armor': 'armor-t3', 'helmet': 'helmet-t3'}),
]
VERIFY_FRAMES = [('idle', 0), ('walk', 0), ('walk', 4), ('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3)]


def build_verify(atlas: Atlas, version: int, gender: str, zoom: int) -> str:
    """검수 필수 조합: 남/여 × (맨몸 / 맨몸+투구 / 갑옷+투구) × (idle / walk / attack)."""
    from PIL import ImageDraw
    rows = []
    for label, equipment in VERIFY_COMBOS:
        row = frame_row(atlas, gender, equipment, VERIFY_FRAMES, zoom)
        canvas = Image.new('RGBA', (row.width + 150, row.height), (60, 52, 42, 255))
        canvas.alpha_composite(row, (150, 0))
        ImageDraw.Draw(canvas).text((6, 6), label, fill=(235, 225, 205, 255))
        rows.append(canvas)
    sheet = stack(rows)
    path = os.path.join(OUTPUT_DIR, f'costume_v{version}_verify_{gender}.png')
    sheet.convert('RGB').save(path)
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', type=int, default=3)
    parser.add_argument('--dir', default=None, help='아틀라스 폴더(기본 public/assets/costume/v<version>)')
    parser.add_argument('--gender', choices=['male', 'female', 'both'], default='both')
    parser.add_argument('--zoom', type=int, default=2)
    parser.add_argument('--only', choices=['contact', 'helmets', 'motions', 'verify', 'all'], default='all')
    args = parser.parse_args()
    directory = args.dir or os.path.join(ROOT, 'public', 'assets', 'costume', f'v{args.version}')
    atlas = Atlas(directory)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    genders = ['male', 'female'] if args.gender == 'both' else [args.gender]
    for gender in genders:
        if args.only in ('contact', 'all'):
            print(build_contact(atlas, args.version, gender, args.zoom, BASE_COMBOS, FRAMES))
        if args.only in ('helmets', 'all'):
            print(build_helmets(atlas, args.version, gender, args.zoom))
        if args.only in ('motions', 'all'):
            print(build_motions(atlas, args.version, gender, args.zoom))
        if args.only in ('verify', 'all'):
            print(build_verify(atlas, args.version, gender, args.zoom))


if __name__ == '__main__':
    main()
