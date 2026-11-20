#!/usr/bin/env python3
"""궁수 전용 투구 10종 파츠와 머리 없는 본체 시트를 승인 시안에서 만든다([작업 200]).

입력(워크스페이스 `downloads/`):
    archer_preview/{male,female}_starter.png                 궁수 기본(스타터 가죽 튜닉) 전신 — 게임 시트의 원본
    archer_helm_preview/{male,female}_helm_{0..9}.png        승인된 궁수 투구·모자 10종 시안(기본 그림을 `images --edit`)

출력(`public/assets/pilot-25d/`):
    archer_helms/{male,female}_{0..9}_v1.png                 투구 머리 파츠 20장 (서기 셀 362×362 좌표계)
    archer_headless/archer_{male,female}_{idle,walk,attack}_v1.png
    archer_headless/nobow/archer_{male,female}_{idle,walk,attack}_v1.png

원리
----
시안 원본과 기본 원본은 **같은 캔버스**라서, 기본 원본을 게임 셀로 옮기는 변환(높이 337px·발끝 y=353·중심 x=181,
`scripts/build-archer-sheets.py` 와 같은 규칙)을 시안에도 그대로 쓴다. 투구 파츠는 그 셀에서 **머리 영역**
(머리카락·투구·얼굴이 모두 들어 있는 손으로 잡은 다각형)만 오려 낸 것이고, 같은 영역을 본체에서 지운 것이
머리 없는 본체다. 파츠와 구멍이 같은 도형이라 이음매가 생기지 않는다.

걷기·사격 프레임은 머리 위치·크기가 서기와 달라서, 서기 머리를 템플릿으로 각 프레임에서 (배율·이동)을 찾아
그 변환을 파츠와 구멍에 똑같이 적용한다(값은 `src/game/render/archerHelmets.ts` 표에 적는다).
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/workspace/downloads/archer_preview')
HELMETS = Path('/workspace/downloads/archer_helm_preview')
OUTPUT = ROOT / 'public/assets/pilot-25d'

CELL = 362
IDLE_HEIGHT = 337.0
IDLE_FOOT = 353.0
IDLE_CENTER = 180.5

# 검정 배경 키잉(원본과 같은 규칙).
ALPHA_LOW, ALPHA_HIGH = 5, 26

# 머리 영역 다각형 — 서기 셀 좌표계. 머리카락·얼굴·목을 모두 덮고, 갑옷 칼라 아래로는 내려가지 않는다.
# 여성은 높은 포니테일과 옆 땋은 머리까지 포함한다. 파츠와 머리 없는 본체가 **같은 도형**을 쓰므로
# 이 다각형이 곧 이음매다. 너무 좁으면 머리카락이 남고, 너무 넓으면 갑옷이 잘린다.
HEAD_POLYGON = {
    'male': [(133, 34), (139, 18), (166, 12), (196, 15), (208, 34), (210, 62), (206, 88),
             (198, 99), (176, 100), (150, 96), (138, 82), (131, 58)],
    'female': [(120, 34), (126, 16), (150, 11), (178, 13), (190, 32), (192, 60), (186, 84),
               (178, 98), (168, 106), (150, 112), (133, 112), (121, 96), (116, 64)],
}


def keyed(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    alpha = np.clip((lum - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    alpha[lum <= ALPHA_LOW] = 0
    return np.dstack([rgb, alpha]).astype(np.uint8)


def cell_params(image: np.ndarray) -> dict[str, float]:
    """기본 원본 → 게임 셀 변환(배율·좌상단). `build-archer-sheets.py` 의 서기 규칙과 같다."""
    alpha = image[:, :, 3]
    rows, columns = np.nonzero(alpha > 8)
    top, bottom = int(rows.min()), int(rows.max())
    left, right = int(columns.min()), int(columns.max())
    height = bottom - top + 1
    scale = IDLE_HEIGHT / height
    # 원본 **캔버스 전체**를 놓는 자리다. 잘라 낸 그림이 아니라 캔버스이므로, 그림의 중심과
    # 발끝을 기준으로 좌상단을 계산한다(잘라 낸 폭으로 계산하면 여백만큼 어긋난다).
    return {
        'scale': scale,
        'x': IDLE_CENTER - (left + right) / 2 * scale,
        'y': IDLE_FOOT - bottom * scale,
    }


def to_cell(image: np.ndarray, params: dict[str, float]) -> np.ndarray:
    scale = params['scale']
    drawn = Image.fromarray(image, 'RGBA').resize(
        (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale))), Image.LANCZOS)
    sheet = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    sheet.alpha_composite(drawn, (round(params['x']), round(params['y'])))
    return np.array(sheet)


def head_mask(gender: str) -> np.ndarray:
    """서기 셀 좌표계의 머리 영역(0/255). 1px 부드럽게 깎아 계단을 없앤다."""
    mask = np.zeros((CELL, CELL), np.uint8)
    cv2.fillPoly(mask, [np.array(HEAD_POLYGON[gender], np.int32)], 255)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    return cv2.GaussianBlur(mask, (3, 3), 0)


def frame_transform(body: np.ndarray, frame: np.ndarray, motion: str) -> tuple[float, int, int]:
    """서기 머리를 그 프레임에서 찾아 (배율, dx, dy)를 돌려준다.

    `body` 는 서기 셀(362²), `frame` 은 프레임 셀(362²)이다. 얼굴만 템플릿으로 쓰고, 걷기·사격은
    인물이 작게 그려져 있어 배율을 함께 찾는다. 돌려주는 dx·dy 는 **배율을 적용한 뒤** 더하는 값이라
    파츠를 `p*s + (dx,dy)` 로 놓으면 찾은 자리에 정확히 앉는다.
    """
    TX0, TY0, TX1, TY1 = 150, 25, 200, 80  # 서기 셀의 얼굴 상자
    template = cv2.cvtColor(body[TY0:TY1, TX0:TX1, :3], cv2.COLOR_RGB2GRAY)
    target = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2GRAY)
    candidates = np.arange(0.62, 1.001, 0.01) if motion == 'attack' else np.arange(0.80, 1.041, 0.01)
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
    return best[1], int(round(best[2])), int(round(best[3]))


def shift_mask(mask: np.ndarray, scale: float, dx: int, dy: int) -> np.ndarray:
    matrix = np.array([[scale, 0, dx], [0, scale, dy]], np.float32)
    return cv2.warpAffine(mask, matrix, (CELL, CELL), flags=cv2.INTER_LINEAR, borderValue=0)


def erase(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """머리 영역을 지운 시트. 마스크 경계의 반투명 픽셀도 함께 지워 이음매가 남지 않게 한다."""
    out = image.copy()
    out[:, :, 3] = np.where(mask > 8, 0, out[:, :, 3])
    return out


def split_cells(sheet: np.ndarray) -> list[np.ndarray]:
    return [sheet[:, index * CELL:(index + 1) * CELL] for index in range(sheet.shape[1] // CELL)]


def save_png(image: np.ndarray, path: Path) -> None:
    """256색 팔레트 PNG 로 저장한다(다른 pilot-25d 파츠와 같은 규격, 장당 수 KB)."""
    drawn = Image.fromarray(image, 'RGBA')
    drawn.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def build() -> None:
    (OUTPUT / 'archer_helms').mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'archer_headless' / 'nobow').mkdir(parents=True, exist_ok=True)
    report = {}
    for gender in ('male', 'female'):
        params = cell_params(keyed(SOURCE / f'{gender}_starter.png'))
        mask = head_mask(gender)
        # 서기 본체(게임 시트)에서 머리를 지운다.
        idle = np.array(Image.open(OUTPUT / f'archer_{gender}_idle_v1.png').convert('RGBA'))
        idle_headless = erase(idle, mask)
        save_png(idle_headless, OUTPUT / 'archer_headless' / f'archer_{gender}_idle_v1.png')
        # 활을 1번 이상 찼을 때 쓰는 기본 활 지운 서기 시트도 머리를 지운 판을 둔다(작업 160 + 200).
        bowless_idle = np.array(Image.open(OUTPUT / 'nobow' / f'archer_{gender}_idle_v1.png').convert('RGBA'))
        save_png(erase(bowless_idle, mask), OUTPUT / 'archer_headless' / 'nobow' / f'archer_{gender}_idle_v1.png')

        # 걷기·사격: 프레임마다 머리를 찾아 같은 변환으로 지운다.
        for motion in ('walk', 'attack'):
            sheet = np.array(Image.open(OUTPUT / f'archer_{gender}_{motion}_v1.png').convert('RGBA'))
            bowsheet = np.array(Image.open(OUTPUT / 'nobow' / f'archer_{gender}_{motion}_v1.png').convert('RGBA'))
            headless = sheet.copy()
            bowless_headless = bowsheet.copy()
            frames = []
            for index, frame in enumerate(split_cells(sheet)):
                scale, dx, dy = frame_transform(idle, frame, motion)
                moved = shift_mask(mask, scale, dx, dy)
                left, right = index * CELL, (index + 1) * CELL
                headless[:, left:right] = erase(frame, moved)
                bowless_headless[:, left:right] = erase(split_cells(bowsheet)[index], moved)
                frames.append({'frame': index, 'scale': round(scale, 3), 'x': dx, 'y': dy})
                print(f'  {gender} {motion} f{index}: 배율 {scale:.3f} 이동 {dx:+d},{dy:+d}')
            save_png(headless, OUTPUT / 'archer_headless' / f'archer_{gender}_{motion}_v1.png')
            save_png(bowless_headless, OUTPUT / 'archer_headless' / 'nobow' / f'archer_{gender}_{motion}_v1.png')
            report.setdefault(gender, {})[motion] = frames

        # 투구 파츠: 시안 원본을 같은 셀로 옮긴 뒤 머리 영역만 남긴다.
        alpha = mask.astype(np.float32) / 255.0
        for index in range(10):
            preview = to_cell(keyed(HELMETS / f'{gender}_helm_{index}.png'), params)
            part = preview.copy()
            part[:, :, 3] = (preview[:, :, 3].astype(np.float32) * alpha).astype(np.uint8)
            path = OUTPUT / 'archer_helms' / f'{gender}_{index}_v1.png'
            save_png(part, path)
            print(f'  {gender} 투구 {index}: {path.stat().st_size // 1024}KB')
    print('\n── src/game/render/archerHelmets.ts 에 넣을 표 ──')
    for gender, motifs in report.items():
        for motion, frames in motifs.items():
            cells = ', '.join(f'{{ x: {f["x"]}, y: {f["y"]}, scale: {f["scale"]} }}' for f in frames)
            print(f'  {gender} {motion}: [{cells}]')


if __name__ == '__main__':
    build()
