"""투구 파츠 발광 마스크 빌더 (작업 256).

`public/assets/pilot-25d/helmets/…`(전사 정면 13 + 전사 공격 80)와 `archer_helms/…`(궁수 20)의
**투구만 빛나는** 발광 마스크 PNG를 만든다. 파츠 PNG와 같은 크기·같은 이름으로 `helmets_glow/`·
`archer_helms_glow/` 아래에 두고, 필드(`entities.ts`)와 장비창(`equipmentPortrait.ts`)이 파츠와
**같은 앵커·위치·배율**로 얹어 발광을 잘라 낸다(사용자 확정 1안 — 파츠만 깔끔하게, 오라 번짐 없음).

마스크에서 빼는 것(발광 금지):
  ① **피부** — 얼굴·목·어깨. 따뜻한 살구빛을 찾은 뒤 눈·입·눈썹 같은 구멍을 메우고 2px 넓혀
     경계에 살색 테두리가 남지 않게 한다.
  ② **턱·목 아래** — 파츠는 목 밑동까지 그려져 있어 그 아래는 목·어깨·가슴(또는 옷)이다.
     성별·동작 묶음마다 한 줄을 두고 14px에 걸쳐 부드럽게 끊는다(직선이 보이지 않게).
  ③ **머리카락** — 파츠의 머리 모양이 묶음마다 같아(같은 시안에서 나온 한 벌) 캡슐 구역으로 잡고,
     그 안의 '어두운 갈색'만 0.1까지 낮춘다. 투구의 밝은 금속면·테두리는 구역에 걸쳐도 남는다.

출력은 RGBA PNG(흰색 + 알파=발광 세기)다 — Pixi 마스크는 텍스처의 알파를 쓴다.

사용:
    python3 scripts/build-helm-glow-masks.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / 'public/assets/pilot-25d'
OUT_WARRIOR = PARTS / 'helmets_glow'
OUT_ARCHER = PARTS / 'archer_helms_glow'

GENDERS = ('male', 'female')

# ── 파츠 → 셀 좌표 ────────────────────────────────────────────────────────────
# 마스크는 파츠 PNG와 같은 크기여야 하므로 구역은 **셀 좌표**로 적고, 파츠마다 로컬 좌표로 옮긴다.
# 전사 정면 파츠 앵커 = 아래 중앙(목 밑동) — `helmets.ts` `helmetFrames[gender].idle` 과 같은 값.
WARRIOR_IDLE_ANCHOR = {'male': (228, 89), 'female': (227, 88)}

# 전사 공격 3/4 파츠 앵커 = 크롭 아래 중앙 — `helmets.ts` `helmetAttackFrames` 와 같은 값.
WARRIOR_ATTACK_ANCHORS = {
    'male': [
        [(200.5, 114.5), (194.8, 114.5), (196.0, 114.5), (200.0, 114.5), (199.8, 114.5), (200.0, 114.5), (199.8, 114.5), (199.8, 114.5), (195.5, 114.5), (195.2, 114.5)],
        [(190.0, 116.5), (190.0, 116.5), (190.0, 117.5), (190.0, 116.5), (190.0, 116.5), (190.0, 116.5), (190.0, 117.5), (190.0, 117.5), (190.0, 117.0), (190.0, 115.5)],
        [(182.8, 136.5), (182.2, 138.5), (182.5, 138.0), (182.0, 138.5), (184.2, 136.5), (182.5, 138.5), (182.8, 138.5), (190.2, 138.5), (182.2, 138.5), (182.2, 138.0)],
        [(171.5, 168.0), (171.8, 168.5), (172.2, 168.5), (171.5, 168.5), (172.2, 168.0), (172.0, 167.0), (174.0, 168.0), (182.5, 168.0), (172.0, 168.0), (174.5, 168.5)]
    ],
    'female': [
        [(199.5, 108.5), (195.0, 108.5), (199.5, 108.5), (198.8, 108.5), (199.2, 108.5), (195.8, 108.5), (199.2, 108.5), (197.5, 108.5), (198.8, 108.5), (192.5, 108.5)],
        [(175.8, 168.5), (176.2, 169.0), (174.8, 170.0), (175.8, 170.0), (173.0, 170.0), (171.8, 170.5), (175.2, 169.0), (176.0, 168.5), (176.2, 170.5), (172.5, 170.0)],
        [(174.8, 176.0), (173.8, 176.0), (173.0, 176.0), (173.8, 176.0), (172.2, 176.0), (174.2, 176.0), (174.5, 176.0), (180.5, 176.0), (173.2, 176.0), (176.2, 176.0)],
        [(172.5, 206.0), (170.2, 206.0), (168.8, 206.0), (170.5, 206.0), (167.8, 206.0), (170.2, 206.0), (173.0, 206.0), (176.5, 206.0), (163.2, 206.0), (172.8, 206.0)]
    ]
}


# ── 색 분류 ───────────────────────────────────────────────────────────────────
def hsv(rgba: np.ndarray):
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(mx)
    d = np.maximum(mx - mn, 1e-6)
    m = mx == r
    h[m] = ((g - b) / d)[m] % 6
    m = (mx == g) & (mx != r)
    h[m] = ((b - r) / d + 2)[m]
    m = (mx == b) & (mx != r) & (mx != g)
    h[m] = ((r - g) / d + 4)[m]
    return h * 60, s, mx


def skin_mask(rgba: np.ndarray) -> np.ndarray:
    """따뜻한 살구빛 — 얼굴·목·어깨 피부.

    금색·황동 투구는 살색과 밝기·색조가 비슷해 그냥 두면 투구가 통째로 피부로 잡힌다.
    살색은 **푸른 채널이 초록의 55~90%** 인데(R:G:B ≈ 1:.65:.45) 금색은 30% 아래,
    은색은 100% 근처다 — 이 비율로 금속을 걸러 낸다.
    """
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    r = rgba[..., 0].astype(np.float32)
    g = np.maximum(1.0, rgba[..., 1].astype(np.float32))
    b = rgba[..., 2].astype(np.float32)
    ratio = b / g
    warm = (r - b) >= 30
    return a & (h >= 4) & (h <= 45) & (s >= 0.16) & (s <= 0.62) & (v >= 0.35) & (v <= 0.92) & warm & (ratio >= 0.55) & (ratio <= 0.92)


def dark_warm(rgba: np.ndarray) -> np.ndarray:
    """구역 안에서 머리카락으로 볼 색 — 갈색 계열이면서 밝지 않은 것.

    구역(캡슐)은 이미 머리카락 자리만 덮으므로, 그 안에서는 '밝은 금속면'(금관·은테)만
    남기고 갈색 덩어리는 뺀다. 금관의 밝은 면(0.65 이상)은 살아남는다.
    """
    h, s, v = hsv(rgba)
    a = rgba[..., 3] > 8
    return a & (h >= 2) & (h <= 50) & (s >= 0.20) & (v <= 0.62)


def dilate(mask: np.ndarray, steps: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """테두리에서 닿지 않는 구멍(눈·입·눈썹)을 메운다 — 얼굴이 점박이로 남지 않게."""
    h, w = mask.shape
    pad = np.zeros((h + 2, w + 2), dtype=bool)
    pad[1:-1, 1:-1] = mask
    seen = np.zeros_like(pad)
    seen[0, 0] = True
    stack = [(0, 0)]
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h + 2 and 0 <= nx < w + 2 and not seen[ny, nx] and not pad[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    return mask | (~seen & ~pad)[1:-1, 1:-1]


# ── 구역 ──────────────────────────────────────────────────────────────────────
Capsule = tuple[float, float, float, float, float]  # x1, y1, x2, y2, r
CutLine = tuple[float, float, float, float]          # x1, y1, x2, y2 (선 아래로 갈수록 0)

NECK_FEATHER = 14.0
HAIR_LEVEL = 0.12

# 목·어깨를 끊는 띠 (셀 좌표): 이 y부터 아래로 NECK_FEATHER px에 걸쳐 발광이 사라진다.
# 턱 바로 아래(목·어깨·가슴)가 여기 걸린다. 직선이 보이지 않게 14~22px로 길게 잡는다.
NECK_FEATHER = 20.0
NECK_LINES: dict[str, tuple[float, float]] = {
    'archer_female': (80, 22),
    'archer_male': (80, 22),
    'warrior_male': (70, 20),
    'warrior_female': (68, 20),
}

# 얼굴 타원 (앵커 기준 오프셋 x, y, rx, ry) — 이 안의 어두운 픽셀(눈·입·그늘)은 발광에서 뺀다.
# 파츠의 얼굴은 계열마다 같은 자리(같은 시안의 같은 인물)라 한 벌로 덮는다. 바깥의 살색(목·어깨)은
# 아래 목선 띠가 맡는다. 이렇게 하면 청동·금속 투구처럼 살색과 구분되지 않는 재질이 통째로
# '피부'로 잡혀 발광이 사라지는 일이 없다.
FACE_ZONES: dict[str, tuple[float, float, float, float]] = {
    'archer_female': (160, 65, 15, 16),
    'archer_male': (171, 56, 14, 15),
    'warrior_male': (-1, -35, 15, 18),
    'warrior_female': (13, -31, 15, 17),
    'warrior_attack_male': (19, -42, 19, 19),
    'warrior_attack_female': (-6, -34, 17, 18),
}

# 전사 공격 3/4 파츠는 프레임마다 머리 높이가 다르다(파츠 아래가 목 밑동 = 앵커). 그래서 목선과
# 머리카락 구역을 **앵커 기준 오프셋**으로 잡는다 — 어느 프레임이든 머리를 따라간다.
ATTACK_NECK_OFFSET = -8.0
ATTACK_NECK_FEATHER = 16.0
ATTACK_HAIR_OFFSETS: dict[str, list[Capsule]] = {
    # (x1, y1, x2, y2, r) — 앵커 기준. 헬멧 왼쪽 뒤로 뭉치는 머리카락.
    'male': [(-38, -30, -70, -12, 11)],
    'female': [(-40, -34, -72, -14, 12)],
}

# 머리카락 구역 (셀 좌표 캡슐). 같은 묶음의 파츠는 머리 모양이 같아 한 벌로 덮는다.
HAIR_ZONES: dict[str, list[Capsule]] = {
    # 궁수 여 — 높은 포니테일(왼쪽 위)이 목덜미로 흘러내리고, 오른쪽에도 머리카락이 흐른다.
    'archer_female': [
        (138, 24, 122, 44, 12),
        (122, 44, 113, 68, 12),
        (113, 68, 112, 100, 11),
        (190, 46, 192, 76, 8),
    ],
    'archer_male': [
        (150, 50, 136, 74, 9),
        (190, 48, 200, 74, 9),
    ],
    'warrior_female': [
        (218, 56, 190, 82, 14),
        (262, 56, 270, 80, 9),
    ],
    'warrior_male': [],
}


def capsule_mask(shape, capsule: Capsule, ox: float, oy: float) -> np.ndarray:
    x1, y1, x2, y2, r = capsule
    ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
    px = xs + ox
    py = ys + oy
    vx, vy = x2 - x1, y2 - y1
    length = vx * vx + vy * vy
    if length <= 1e-6:
        t = np.zeros(px.shape, dtype=np.float32)
    else:
        t = np.clip(((px - x1) * vx + (py - y1) * vy) / length, 0, 1)
    dx = px - (x1 + vx * t)
    dy = py - (y1 + vy * t)
    return (dx * dx + dy * dy) <= r * r


def components(mask: np.ndarray) -> list[np.ndarray]:
    """4-연결 성분으로 나눈 불리언 마스크 목록(작은 픽셀 아트라 BFS로 충분하다)."""
    height, width = mask.shape
    seen = np.zeros_like(mask)
    out: list[np.ndarray] = []
    for start_y in range(height):
        row = mask[start_y]
        for start_x in np.nonzero(row & ~seen[start_y])[0]:
            if seen[start_y, start_x] or not mask[start_y, start_x]:
                continue
            part = np.zeros_like(mask)
            stack = [(start_y, int(start_x))]
            seen[start_y, start_x] = True
            while stack:
                y, x = stack.pop()
                part[y, x] = True
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            out.append(part)
    return out


def ellipse_mask(shape, center: tuple[float, float], radii: tuple[float, float], ox: float, oy: float) -> np.ndarray:
    ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
    dx = (xs + ox - center[0]) / max(1e-6, radii[0])
    dy = (ys + oy - center[1]) / max(1e-6, radii[1])
    return dx * dx + dy * dy <= 1.0


def neck_weight(shape, spec: tuple[float, float], oy: float) -> np.ndarray:
    """끊는 띠 — `yStart` 위는 1, 그 아래로 `feather` px에 걸쳐 0."""
    y_start, feather = spec
    ys = np.mgrid[0:shape[0], 0:shape[1]][0] + oy
    return np.clip(1.0 - (ys - y_start) / max(1.0, feather), 0.0, 1.0)


def build_mask(part_path: Path, offset: tuple[float, float], group: str, anchor: tuple[float, float], skip_skin: bool = False) -> np.ndarray:
    part = np.asarray(Image.open(part_path).convert('RGBA'))
    alpha = part[..., 3] > 8
    ox, oy = offset

    keep = alpha.astype(np.float32)
    # ① 얼굴·목·어깨 — 살색(따뜻한 살구빛)을 뺀다. 눈·입처럼 살색이 아닌 얼굴 속은 구멍을 메워 함께 뺀다.
    # 단, 파츠의 45% 넘게 살색이면 그 투구는 **재질 자체가 살색**(청동·붉은 강철)이라 얼굴이 없다 —
    # 그때는 빼지 않고 통째로 빛나게 둔다(청동 기사 투구가 통째로 꺼지던 문제).
    skin_pixels = dilate(fill_holes(skin_mask(part)), 2)
    if not skip_skin:
        keep[skin_pixels] = 0.0
    # 얼굴 타원 안에서는 **어두운 픽셀**(눈·눈썹·입·그늘)도 뺀다 — 살색 규칙은 눈두덩 그늘을 놓쳐
    # 얼굴에 주황 점이 남았다. 투구의 밝은 금속면(코 가리개·바이저)은 그대로 빛난다.
    face_group = group
    if group.startswith('warrior_attack_'):
        face_group = 'warrior_attack_female' if 'female' in group else 'warrior_attack_male'
    face = FACE_ZONES.get(face_group)
    if face:
        # 얼굴 타원도 **앵커 기준 오프셋**이다(궁수는 앵커가 (0,0)이라 그대로 셀 좌표).
        center = (anchor[0] + face[0], anchor[1] + face[1])
        oval = dilate(ellipse_mask(alpha.shape, center, (face[2], face[3]), ox, oy), 1)
        _, _, value = hsv(part)
        keep[oval & (value <= 0.5)] = 0.0
    spec = NECK_LINES.get(group)
    if spec:
        keep *= neck_weight(alpha.shape, spec, oy)
    zones = HAIR_ZONES.get(group) or []
    if group.startswith('warrior_attack_'):
        # 공격 프레임은 앵커(목 밑동) 기준으로 목선·머리카락을 잡는다.
        keep *= neck_weight(alpha.shape, (anchor[1] + ATTACK_NECK_OFFSET, ATTACK_NECK_FEATHER), oy)
        gender = 'female' if 'female' in group else 'male'
        zones = [(anchor[0] + x1, anchor[1] + y1, anchor[0] + x2, anchor[1] + y2, r)
                 for (x1, y1, x2, y2, r) in ATTACK_HAIR_OFFSETS[gender]]
    if zones:
        zone = np.zeros_like(alpha)
        for capsule in zones:
            zone |= capsule_mask(alpha.shape, capsule, ox, oy)
        hair = dilate(dark_warm(part) & zone, 1)
        keep[hair] = np.minimum(keep[hair], HAIR_LEVEL)

    blurred = (keep * 4 + np.roll(keep, 1, 0) + np.roll(keep, -1, 0) + np.roll(keep, 1, 1) + np.roll(keep, -1, 1)) / 8.0
    keep = np.where(keep < 0.5, np.minimum(keep, blurred), np.maximum(keep, blurred))
    return np.clip(keep, 0, 1) * alpha


def write_mask(mask: np.ndarray, target: Path) -> None:
    rgba = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(mask, 0, 1) * 255).astype(np.uint8)
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(target, optimize=True)


def warrior_front_assets():
    for index in range(10):
        yield PARTS / 'helmets' / f'helm_{index}.png', 'warrior_male', WARRIOR_IDLE_ANCHOR['male']
    for index in range(3):
        yield PARTS / 'helmets' / f'helm_female_{index}.png', 'warrior_female', WARRIOR_IDLE_ANCHOR['female']


def warrior_attack_assets():
    for gender in GENDERS:
        for frame in range(4):
            for index in range(10):
                yield (PARTS / 'helmets' / 'atk' / f'{gender}_{index}_f{frame}.png',
                       f'warrior_attack_{gender}_{frame}', WARRIOR_ATTACK_ANCHORS[gender][frame][index])


def archer_assets():
    for gender in GENDERS:
        for index in range(10):
            yield PARTS / 'archer_helms' / f'{gender}_{index}_v1.png', f'archer_{gender}', (0, 0)


def build_all() -> int:
    total = 0
    for path, group, anchor in warrior_front_assets():
        image = Image.open(path)
        offset = (anchor[0] - image.width / 2, anchor[1] - image.height)
        write_mask(build_mask(path, offset, group, anchor), OUT_WARRIOR / path.name)
        total += 1
    for path, group, anchor in warrior_attack_assets():
        image = Image.open(path)
        offset = (anchor[0] - image.width / 2, anchor[1] - image.height)
        write_mask(build_mask(path, offset, group, anchor), OUT_WARRIOR / 'atk' / path.name)
        total += 1
    for path, group, anchor in archer_assets():
        write_mask(build_mask(path, anchor, group, anchor), OUT_ARCHER / path.name)
        total += 1
    return total


def main() -> None:
    print(f'마스크 {build_all()}장 생성 완료')


if __name__ == '__main__':
    main()
