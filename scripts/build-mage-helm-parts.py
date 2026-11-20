#!/usr/bin/env python3
"""마법사 전용 모자·투구 10종 파츠와 머리 없는 본체 시트를 승인 시안에서 만든다([작업 204]).

입력(워크스페이스 `downloads/`):
    mage_preview/{male,female}_3.png          마법사 기본(스타터 로브) 서기 전신 — 게임 시트의 원본
    mage_helm_v2/{male,female}_helm_{0..9}.png 승인된 마법사 모자·투구 10종 시안(기본 그림을 `images --edit`)

기준(레포):
    public/assets/pilot-25d/mage_{gender}_idle_v1.png        게임 서기 셀(파츠 좌표계의 기준)
    public/assets/pilot-25d/mage_{gender}_{walk,attack}_v1.png  걷기·공격 4프레임 시트
    public/assets/pilot-25d/mage_nostaff/mage_{gender}_{motion}_v1.png  기본 지팡이를 지운 시트

출력(`public/assets/pilot-25d/`):
    mage_helms/{male,female}_{0..9}_v1.png   모자·투구 파츠 20장 (362×406 — 셀 위 44행 여유)
    mage_headless/mage_{male,female}_{idle,walk,attack}_v1.png          머리 없는 본체 6장
    mage_headless/nostaff/mage_{male,female}_{idle,walk,attack}_v1.png  지팡이 지운 머리 없는 본체 6장

원리
----
① 시안 원본과 기본 원본은 **같은 캔버스(1254²)**라서, 기본 원본을 게임 셀로 옮기는 변환
   (`scripts/build-mage-sheets.py`의 서기 규칙: 본체 337px·발끝 y=353·가로 중심 x=181)을 시안에도
   그대로 쓴다. 그래서 파츠와 본체의 셀 좌표계가 정확히 같다.
② 파츠에는 투구·모자뿐 아니라 **얼굴·머리카락**과 목덜미까지 들어 있다. 본체는 같은 자리에서 그
   영역을 지운 `mage_headless/` 판으로 갈아 끼우고 파츠가 그 구멍을 그대로 덮는다 — 파츠와 구멍이
   같은 마스크라 이음매가 남지 않고, 여성의 긴 머리·앞머리도 파츠와 한 덩어리라 비치지 않는다.
③ 지우는 영역(`core`)은 **10장 시안 모두가 불투명한 상체 상자**의 교집합이다. 어느 시안에서든
   내용이 있는 곳만 지우므로, 어떤 투구를 써도 구멍이 뚫리지 않는다(궁수 투구의 손그림 다각형을
   시안에서 자동으로 잡는 방식). 지팡이 통로는 뺀다 — 지팡이는 지팡이 파츠(작업 201)가 그린다.
④ 고깔모·후광·날개·뿔은 상자 밖(위·옆)으로 뻗는다. 그 부분은 지우지 않고 **파츠로만 덧그린다**
   (`extras`). 그래서 파츠 PNG는 셀 위로 44행 더 큰 362×406이고, 그리기 좌표는
   `MAGE_HELM_EXTRA_TOP` 만큼 위로 올린다.
⑤ 걷기·공격 프레임은 머리 위치·크기가 서기와 달라서, 서기 얼굴을 템플릿으로 각 프레임에서
   (배율·이동)을 찾아 그 변환을 파츠와 구멍에 똑같이 적용한다(값은 `src/game/render/mageHelmets.ts` 표).

실행: python3 scripts/build-mage-helm-parts.py            (에셋 생성 + 표 출력)
      python3 scripts/build-mage-helm-parts.py --preview  (에셋 없이 검수 이미지만)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:  # pragma: no cover
    sys.exit('opencv-python(cv2)가 필요합니다: pip install opencv-python-headless')

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/workspace/downloads/mage_preview')
HELMETS = Path('/workspace/downloads/mage_helm_v2')
PILOT = ROOT / 'public/assets/pilot-25d'
DOWNLOAD_OUT = Path('/workspace/downloads')

CELL = 362
IDLE_HEIGHT = 337.0        # `build-mage-sheets.py` 서기 본체 높이
IDLE_FOOT = 353.0
IDLE_CENTER = 181.0
# `build-mage-sheets.py`의 `IDLE_BODY_PX`(승인 원본에서 잰 정수리~발끝) — 시트와 같은 배율을 쓴다.
IDLE_BODY_PX = {'male': 1129.0, 'female': 1053.0}

# 셀 위 여유 행 — 여성 최고 장식(9번 왕관 후광)이 셀 위로 36px 솟는다.
EXTRA_TOP = 44
PART_HEIGHT = CELL + EXTRA_TOP

ALPHA_LOW, ALPHA_HIGH = 5, 26
OPAQUE = 200               # 시안에서 '확실히 불투명'으로 볼 알파
CORE_ERODE = 2             # 지우는 영역은 파츠가 덮는 영역보다 2px 안쪽까지만 지운다

# 지우는 상자(셀 좌표) — 머리·목 아래(목덜미)까지. 이 안에서 **본체 실루엣이 있는 곳**을 지운다.
# 본체에 있던 픽셀만 지우면 파츠가 그 자리를 그대로 덮고(같은 원본), 투구가 머리카락을 없앤 시안은
# 파츠도 비어 있어 배경이 비친다 — 어느 쪽이든 자연스럽다.
ERASE_BOX = {'male': (128, 242, -EXTRA_TOP, 104), 'female': (124, 256, -EXTRA_TOP, 104)}
# 덧그리는 상자 — 고깔모 챙·날개·후광·후드 망토·어깨 장식까지. 아래 경계가 파츠의 마지막 줄(이음새)이다.
# 오른쪽은 어깨·후광이 잘리지 않게 넓게 잡는다. 든 손(마법 광채)도 함께 들어오지만 같은 그림이라
# 겹쳐 그려도 모양이 같다(지팡이만 통로로 뺀다).
EXTRA_BOX = {'male': (80, 300, -EXTRA_TOP, 176), 'female': (76, 312, -EXTRA_TOP, 196)}

# 지팡이 통로(서기 자세 그립 기준, `staffs.ts` STAFF_POSES idle0 과 같은 값) — 파츠에서 뺀다.
STAFF_LINE = {'male': ((85, 58), (150, 330)), 'female': ((84, 0), (168, 351))}
STAFF_HALF = 26


def log(*args):
    print(*args, flush=True)


def keyed(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    alpha[lum <= ALPHA_LOW] = 0
    return np.dstack([rgb, alpha]).astype(np.uint8)


def idle_transform(image: np.ndarray, gender: str) -> dict[str, float]:
    """승인 원본 → 게임 서기 셀 변환. `build-mage-sheets.py` 의 서기 규칙과 같은 값이다."""
    alpha = image[:, :, 3]
    rows, columns = np.nonzero(alpha > 8)
    top, bottom = int(rows.min()), int(rows.max())
    left, right = int(columns.min()), int(columns.max())
    scale = IDLE_HEIGHT / IDLE_BODY_PX[gender]
    width, height = right - left + 1, bottom - top + 1
    return {
        'scale': scale,
        'left': left, 'top': top, 'width': width, 'height': height,
        # 그림 전체를 놓는 자리(원본 좌상단이 가는 셀 좌표)
        'x': IDLE_CENTER - width * scale / 2 - left * scale,
        'y': IDLE_FOOT - height * scale - top * scale,
    }


def to_part(image: np.ndarray, p: dict[str, float]) -> np.ndarray:
    """원본을 파츠 셀(362×406, 위 44행 여유)로 옮긴다."""
    scale = p['scale']
    drawn = Image.fromarray(image, 'RGBA').resize(
        (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale))), Image.LANCZOS)
    sheet = Image.new('RGBA', (CELL, PART_HEIGHT), (0, 0, 0, 0))
    sheet.alpha_composite(drawn, (round(p['x']), round(p['y'] + EXTRA_TOP)))
    return np.array(sheet)


def staff_corridor(gender: str, top: int = EXTRA_TOP, height: int = PART_HEIGHT) -> np.ndarray:
    """지팡이 통로(0/255). 위쪽은 장식 끝(머리 점)에서 60px 더 뻗는다.

    `top` 은 그 프레임에서 셀 y=0 이 놓이는 행이다(파츠는 44, 게임 셀은 0).
    """
    head, butt = np.array(STAFF_LINE[gender][0], float), np.array(STAFF_LINE[gender][1], float)
    d = butt - head
    d /= (np.linalg.norm(d) or 1.0)
    far = head - d * 60
    mask = np.zeros((height, CELL), np.uint8)
    cv2.line(mask, tuple(np.round(far + [0, top]).astype(int)),
             tuple(np.round(butt + [0, top]).astype(int)), 255, STAFF_HALF * 2)
    return mask


def box_mask(box: tuple[int, int, int, int], top: int = EXTRA_TOP, height: int = PART_HEIGHT) -> np.ndarray:
    """셀 좌표 상자 → 마스크. `top` 은 셀 y=0 이 놓이는 행이다."""
    x0, x1, y0, y1 = box
    mask = np.zeros((height, CELL), np.uint8)
    mask[max(0, y0 + top):min(height, y1 + top), max(0, x0):min(CELL, x1)] = 255
    return mask


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """마스크 안쪽의 작은 구멍(짙은 그늘·수염)을 메운다 — 바깥 배경과 이어진 곳만 그대로 둔다."""
    m = (mask > 0).astype(np.uint8)
    flood = m.copy()
    h, w = m.shape
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    out = m.copy()
    out[flood == 0] = 1
    return (out * 255).astype(np.uint8)


def build_masks(gender: str, idle_cell: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(파츠 마스크 — 파츠 좌표, 본체를 지울 구멍 — 셀 좌표).

    지우는 구멍은 **게임에 실제로 들어간 서기 셀**의 실루엣에서 딴다. 승인 원본을 다시 옮긴
    사본은 어두운 수염·그늘에서 알파가 1px 어긋나므로(검정 배경 키잉의 민감도) 실제 셀을 쓴다.
    """
    corridor_cell = staff_corridor(gender, top=0, height=CELL)
    body_shape = np.where(idle_cell[:, :, 3] > 8, 255, 0).astype(np.uint8)
    erase = cv2.bitwise_and(body_shape, box_mask(ERASE_BOX[gender], top=0, height=CELL))
    erase = cv2.bitwise_and(erase, cv2.bitwise_not(corridor_cell))
    # 실루엣 안의 검은 그늘·수염은 키잉 알파가 8 아래로 떨어져 작은 구멍이 된다 — 메우지 않으면
    # 침식이 그 구멍을 넓혀 머리 한가운데가 지워지지 않고 남는다. 배경에서 새어 들어온 구멍만 남긴다.
    erase = fill_holes(erase)
    # 지우는 구멍은 본체 실루엣보다 2px 안쪽 — 경계 반투명 픽셀에 이음매가 남지 않는다.
    erase = cv2.erode(erase, np.ones((CORE_ERODE * 2 + 1, CORE_ERODE * 2 + 1), np.uint8))
    erase = cv2.GaussianBlur(erase, (3, 3), 0)
    part_mask = box_mask(EXTRA_BOX[gender])
    part_mask = cv2.bitwise_and(part_mask, cv2.bitwise_not(staff_corridor(gender)))
    return part_mask, erase


def save_png(image: np.ndarray, path: Path) -> None:
    """256색 팔레트 PNG 로 저장한다(다른 pilot-25d 파츠와 같은 규격)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    drawn = Image.fromarray(image, 'RGBA')
    drawn.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def split_cells(sheet: np.ndarray) -> list[np.ndarray]:
    return [sheet[:, index * CELL:(index + 1) * CELL] for index in range(sheet.shape[1] // CELL)]


def frame_transform(body: np.ndarray, frame: np.ndarray, motion: str) -> tuple[float, int, int, float]:
    """서기 얼굴을 그 프레임에서 찾아 (배율, dx, dy, 점수).

    `body` 는 서기 셀(362²), `frame` 은 프레임 셀(362²). 돌려주는 dx·dy 는 배율을 적용한 뒤 더하는
    값이라 파츠를 `p*s + (dx,dy)` 로 놓으면 찾은 자리에 정확히 앉는다.
    """
    TX0, TY0, TX1, TY1 = 150, 20, 205, 80  # 서기 셀의 얼굴 상자
    template = cv2.cvtColor(body[TY0:TY1, TX0:TX1, :3], cv2.COLOR_RGB2GRAY)
    target = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2GRAY)
    candidates = np.arange(0.60, 1.001, 0.01)
    best = (-2.0, 1.0, 0.0, 0.0)
    for scale in candidates:
        size = (max(8, round(template.shape[1] * scale)), max(8, round(template.shape[0] * scale)))
        scaled = cv2.resize(template, size, interpolation=cv2.INTER_AREA)
        if scaled.shape[0] > target.shape[0] or scaled.shape[1] > target.shape[1]:
            continue
        result = cv2.matchTemplate(target, scaled, cv2.TM_CCOEFF_NORMED)
        _, score, _, location = cv2.minMaxLoc(result)
        if score > best[0]:
            best = (score, scale, location[0] - TX0 * scale, location[1] - TY0 * scale)
    return best[1], int(round(best[2])), int(round(best[3])), best[0]


def shift_mask(mask: np.ndarray, scale: float, dx: int, dy: int) -> np.ndarray:
    """셀 좌표 마스크를 프레임 자세로 옮긴다(파츠 좌표로 쓰려면 EXTRA_TOP 만큼 잘라 쓴다)."""
    matrix = np.array([[scale, 0, dx], [0, scale, dy + EXTRA_TOP * (1 - scale)]], np.float32)
    return cv2.warpAffine(mask, matrix, (CELL, PART_HEIGHT), flags=cv2.INTER_LINEAR, borderValue=0)


def erase(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = image.copy()
    out[:, :, 3] = np.where(mask > 8, 0, out[:, :, 3])
    return out


def cut_part(preview: np.ndarray, mask: np.ndarray) -> np.ndarray:
    part = preview.copy()
    alpha = part[:, :, 3].astype(np.float32) / 255
    alpha *= (mask.astype(np.float32) / 255)
    part[:, :, 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    return part


def build(gender: str, write: bool) -> dict:
    base = keyed(SOURCE / f'{gender}_3.png')
    p = idle_transform(base, gender)
    previews = [to_part(keyed(HELMETS / f'{gender}_helm_{index}.png'), p) for index in range(10)]
    idle_cell = np.array(Image.open(PILOT / f'mage_{gender}_idle_v1.png').convert('RGBA'))
    part_mask, core_cell = build_masks(gender, idle_cell)

    report = {'gender': gender, 'scale': round(p['scale'], 5), 'frames': {}}
    headless = {'body': {}, 'nostaff': {}}

    # 서기: 지우는 영역을 그대로 적용한다.
    for key, path in (('body', f'mage_{gender}_idle_v1.png'),
                      ('nostaff', f'mage_nostaff/mage_{gender}_idle_v1.png')):
        cell = np.array(Image.open(PILOT / path).convert('RGBA'))
        headless[key]['idle'] = erase(cell, core_cell)
        if write:
            save_png(headless[key]['idle'], PILOT / 'mage_headless' / ('' if key == 'body' else 'nostaff')
                     / f'mage_{gender}_idle_v1.png')

    # 걷기·공격: 프레임마다 얼굴을 찾아 같은 변환으로 지운다.
    for motion in ('walk', 'attack'):
        frames_place = []
        for key, path in (('body', f'mage_{gender}_{motion}_v1.png'),
                          ('nostaff', f'mage_nostaff/mage_{gender}_{motion}_v1.png')):
            sheet = np.array(Image.open(PILOT / path).convert('RGBA'))
            cells = split_cells(sheet)
            out = np.zeros_like(sheet)
            for index, frame in enumerate(cells):
                scale, dx, dy, score = frame_transform(idle_cell, frame, motion)
                if key == 'body':
                    frames_place.append({'frame': index, 'scale': round(scale, 3), 'x': dx, 'y': dy,
                                         'ncc': round(float(score), 3)})
                    log(f'  {gender} {motion} f{index}: 배율 {scale:.3f} 이동 {dx:+d},{dy:+d} (NCC {score:.3f})')
                moved = shift_mask(core_cell, scale, dx, dy)[EXTRA_TOP:, :]
                out[:, index * CELL:(index + 1) * CELL] = erase(frame, moved)
            headless[key][motion] = out
            if write:
                save_png(out, PILOT / 'mage_headless' / ('' if key == 'body' else 'nostaff')
                         / f'mage_{gender}_{motion}_v1.png')
        report['frames'][motion] = frames_place

    # 파츠 20장.
    if write:
        for index, preview in enumerate(previews):
            part = cut_part(preview, part_mask)
            path = PILOT / 'mage_helms' / f'{gender}_{index}_v1.png'
            save_png(part, path)
            report.setdefault('parts', []).append({'index': index, 'kb': path.stat().st_size // 1024})

    if write:
        for key in ('body', 'nostaff'):
            for motion in ('idle', 'walk', 'attack'):
                path = PILOT / 'mage_headless' / ('' if key == 'body' else 'nostaff') / f'mage_{gender}_{motion}_v1.png'
                headless[key][motion] = None
                report.setdefault('headless', []).append({'kind': key, 'motion': motion,
                                                          'kb': path.stat().st_size // 1024})
    return {'report': report, 'idle_cell': idle_cell, 'core': core_cell, 'part_mask': part_mask,
            'previews': previews, 'transform': p}


def preview_composite(result: dict, gender: str, helmet: int, motion: str, frame: int) -> np.ndarray:
    """본체(머리 지운 셀) + 파츠를 실제 그리기 좌표로 합성한다(검수 이미지용)."""
    core = result['core']
    base = result['idle_cell']
    if motion == 'idle':
        cell = erase(base, core)
        scale, dx, dy = 1.0, 0, 0
    else:
        sheet = np.array(Image.open(PILOT / f'mage_{gender}_{motion}_v1.png').convert('RGBA'))
        cells = split_cells(sheet)
        frame_cell = cells[min(frame, len(cells) - 1)]
        scale, dx, dy, _ = frame_transform(base, frame_cell, motion)
        cell = erase(frame_cell, shift_mask(core, scale, dx, dy)[EXTRA_TOP:, :])
    part = cut_part(result['previews'][helmet], result['part_mask'])
    warped = cv2.warpAffine(part, np.array([[scale, 0, dx], [0, scale, dy + EXTRA_TOP * (1 - scale)]], np.float32),
                            (CELL, PART_HEIGHT), flags=cv2.INTER_LINEAR)
    canvas = np.zeros((PART_HEIGHT, CELL, 4), np.uint8)
    canvas[EXTRA_TOP:, :] = cell
    return over(canvas, warped)


def over(bottom: np.ndarray, top: np.ndarray) -> np.ndarray:
    out = bottom.astype(np.float32).copy()
    src = top.astype(np.float32)
    a = src[:, :, 3:4] / 255
    out[:, :, :3] = src[:, :, :3] * a + out[:, :, :3] * (1 - a)
    out[:, :, 3:4] = src[:, :, 3:4] + out[:, :, 3:4] * (1 - a)
    return np.clip(out, 0, 255).astype(np.uint8)


def flat(rgba: np.ndarray, bg=(30, 30, 36)) -> np.ndarray:
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    return np.clip(rgba[:, :, :3] * a + np.array(bg, np.float32) * (1 - a), 0, 255).astype(np.uint8)


def tile(image: np.ndarray, scale: float, square=True) -> Image.Image:
    """게임 배율(.42 등)로 줄이고 다시 키워 육안 검수용 타일로 만든다."""
    img = Image.fromarray(flat(image))
    if square:
        img = img.crop((0, 0, CELL, PART_HEIGHT))
    small = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    return small.resize((small.width * 2, small.height * 2), Image.NEAREST)


def preview(results: dict[str, dict], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    # 1) 남녀 10종 서기 — 실제 게임 배율(.42)로 줄인 뒤 2배 확대
    rows = []
    for gender in ('male', 'female'):
        tiles = [tile(preview_composite(results[gender], gender, index, 'idle', 0), .42) for index in range(10)]
        height = max(t.height for t in tiles)
        row = Image.new('RGB', (sum(t.width for t in tiles), height), (16, 16, 20))
        x = 0
        for t in tiles:
            row.paste(t, (x, height - t.height))
            x += t.width
        rows.append(row)
    sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)), (16, 16, 20))
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    sheet.save(out / 'djrpg_mage_helms_ingame_v1.png')

    # 2) 장비창 셀 크기(1배) 남녀 10종 — 이음매·머리카락 비침 확인
    rows = []
    for gender in ('male', 'female'):
        tiles = [tile(preview_composite(results[gender], gender, index, 'idle', 0), 1.0) for index in range(10)]
        height = max(t.height for t in tiles)
        row = Image.new('RGB', (sum(t.width for t in tiles), height), (16, 16, 20))
        x = 0
        for t in tiles:
            row.paste(t, (x, height - t.height))
            x += t.width
        rows.append(row)
    sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)), (16, 16, 20))
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    sheet.save(out / 'djrpg_mage_helms_preview_v1.png')

    # 3) 대표 5종 × 걷기·공격 4프레임 (남녀)
    rows = []
    for gender in ('male', 'female'):
        for helmet in (0, 3, 5, 7, 9):
            for motion in ('walk', 'attack'):
                tiles = [tile(preview_composite(results[gender], gender, helmet, motion, frame), .5)
                         for frame in range(4)]
                row = Image.new('RGB', (sum(t.width for t in tiles), max(t.height for t in tiles)), (16, 16, 20))
                x = 0
                for t in tiles:
                    row.paste(t, (x, row.height - t.height))
                    x += t.width
                rows.append(row)
    sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)), (16, 16, 20))
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    sheet.save(out / 'djrpg_mage_helms_motion_v1.png')
    log(f'검수 이미지: {out}/djrpg_mage_helms_{{ingame,preview,motion}}_v1.png')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--out', default=str(DOWNLOAD_OUT))
    args = parser.parse_args()
    write = not args.preview
    results = {}
    for gender in ('male', 'female'):
        log(f'── {gender} ──')
        results[gender] = build(gender, write)
        log(json.dumps(results[gender]['report'], ensure_ascii=False))
    preview(results, Path(args.out))
    if write:
        log('\n── src/game/render/mageHelmets.ts 에 넣을 표 ──')
        for gender, result in results.items():
            for motion, frames in result['report']['frames'].items():
                cells = ', '.join(f'{{ x: {f["x"]}, y: {f["y"] - round(EXTRA_TOP * f["scale"])}, scale: {f["scale"]} }}'
                                  for f in frames)
                log(f'  {gender} {motion}: [{cells}]')


if __name__ == '__main__':
    main()
