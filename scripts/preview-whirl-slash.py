#!/usr/bin/env python3
"""회전참격 인게임 검수 이미지 — 작업 215.

브라우저 실기 대신 `src/game/render/vfx.ts` `drawWhirlSlash`와 같은 좌표·배율·회전값으로
합성한다(필드 배경 + 주변 스켈레톤 + 전사 + 혈풍 회오리). 값이 바뀌면 이 스크립트도 같이 고친다.

출력: `downloads/djrpg_skill_whirl_slash_ingame_v1.png`
"""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent.parent
ASSETS = ROOT / "public/assets"
OUT = WORKSPACE / "downloads/djrpg_skill_whirl_slash_ingame_v1.png"

W, H = 540, 960
CX, CY = W // 2, 620                     # 히어로 발밑
RADIUS = min(W * .46, 168)               # vfx.ts `radius` (스킬 1레벨)
SQUASH = .52                             # 지면 컨테이너 scale.y
HERO_BODY = H * .0935                    # heroScale.heroBodyFraction


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def trim(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


def fit_height(image: Image.Image, height: int) -> Image.Image:
    ratio = height / image.height
    return image.resize((max(1, round(image.width * ratio)), height), Image.LANCZOS)


def background() -> Image.Image:
    # 실제 필드는 어두운 황무지 — 원본을 42% 밝기로 눌러 쓴다(다른 검수 이미지와 같은 톤).
    ground = Image.open(ASSETS / "wasteland-ground.png").convert("RGB").resize((W, W), Image.LANCZOS)
    ground = ground.point(lambda value: int(value * .42))
    canvas = Image.new("RGB", (W, H))
    for row in range(0, H, W):
        canvas.paste(ground, (0, row))
    # 화면 아래로 갈수록 살짝 어두워지는 필드 조명(연출 확인용).
    shade = Image.new("L", (1, H))
    for y in range(H):
        shade.putpixel((0, y), int(70 * (y / H) ** 1.4))
    canvas = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), canvas, shade.resize((W, H)))
    return canvas.convert("RGBA")


def additive(canvas: Image.Image, layer: Image.Image) -> Image.Image:
    """add 블렌딩 — 텍스처의 검정은 그대로 배경이 된다."""
    base = canvas.convert("RGB")
    lit = layer.convert("RGB")
    return ImageChops.add(base, lit).convert("RGBA")


def place(shape: Image.Image, x: float, y: float) -> Image.Image:
    """중심 (x, y)에 놓은 전화면 레이어."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(shape, (round(x - shape.width / 2), round(y - shape.height / 2)), shape)
    return layer


def squash_rotate(image: Image.Image, scale: float, angle_deg: float) -> Image.Image:
    """지면 컨테이너 안에서의 회전 — 눌린 다음 회전하므로 원근이 유지된다."""
    size = round(image.width * scale)
    rotated = image.resize((size, size), Image.LANCZOS).rotate(-angle_deg, resample=Image.BICUBIC, expand=True)
    return rotated.resize((rotated.width, max(1, round(rotated.height * SQUASH))), Image.LANCZOS)


def hero_and_enemies(canvas: Image.Image) -> Image.Image:
    hero = fit_height(trim(load(ASSETS / "pilot-25d/warrior_male_idle_v1.png")), round(HERO_BODY))
    skeleton = trim(load(ASSETS / "skeleton_warrior.png"))

    # 주변 적 — 화면 등각 기준 반경 132px 자리에 여섯 기(회오리 범위 안).
    for index in range(6):
        angle = index / 6 * math.tau + .35
        px = CX + math.cos(angle) * 132
        py = CY + math.sin(angle) * 132 * SQUASH
        body = fit_height(skeleton, round(HERO_BODY * (.92 + (index % 3) * .06)))
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(shadow)
        draw.ellipse((px - body.width * .3, py - 7, px + body.width * .3, py + 5), fill=(0, 0, 0, 130))
        canvas = Image.alpha_composite(canvas, shadow)
        canvas.alpha_composite(body, (round(px - body.width / 2), round(py - body.height * .94)))

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.ellipse((CX - 34, CY - 9, CX + 34, CY + 7), fill=(0, 0, 0, 150))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(hero, (round(CX - hero.width / 2), round(CY - hero.height * .97)))
    return canvas


def whirl_floor(canvas: Image.Image, age: float) -> Image.Image:
    """캐릭터 **뒤**에 깔리는 층 — 부드러운 암흑 기운과 지면 회오리 두 겹."""
    ring = load(ASSETS / "fx_whirl_slash_ring.png")
    t = min(1, age / 1.1)
    fade = min(1, t * 7, (1 - t) * 6)

    pool = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pool, "RGBA")
    for scale, alpha in ((1.12, .10), (.94, .12), (.76, .14), (.56, .16), (.34, .18)):
        color = (0x24, 0x01, 0x04) if scale > .9 else (0x56, 0x05, 0x09)
        draw.ellipse((CX - RADIUS * scale, CY - 2 - RADIUS * scale * .54,
                      CX + RADIUS * scale, CY - 2 + RADIUS * scale * .54), fill=color + (int(255 * alpha * fade),))
    draw.ellipse((CX - RADIUS * .5, CY - 2 - RADIUS * .27, CX + RADIUS * .5, CY - 2 + RADIUS * .27),
                 fill=(0x8a, 0x10, 0x15, int(51 * fade)))
    canvas = Image.alpha_composite(canvas, pool)

    ring_in = min(1, .35 + t * 1.4)
    trail = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(trail, "RGBA").ellipse(
        (CX - RADIUS * ring_in, CY - RADIUS * ring_in * .52, CX + RADIUS * ring_in, CY + RADIUS * ring_in * .52),
        outline=(0xd8, 0x39, 0x2f, int(87 * fade)), width=2)
    canvas = Image.alpha_composite(canvas, trail)

    outer = squash_rotate(ring, RADIUS * 2 * 1.02 / ring.width, -.6 - age * 7.4)
    inner = squash_rotate(ring, RADIUS * 2 * .62 / ring.width, age * 10.5)
    mid = squash_rotate(ring, RADIUS * 2 * .76 / ring.width, -.2 + age * 6.2)
    top = squash_rotate(ring, RADIUS * 2 * .52 / ring.width, age * 8.4)
    # 진홍 본체는 일반 합성(어두운 혈풍 유지), 안쪽 하이라이트만 add 로 한 번 더.
    canvas = Image.alpha_composite(canvas, place(tinted(outer, (1, 1, 1), fade * .92), CX, CY - 2))
    canvas = Image.alpha_composite(canvas, place(tinted(mid, (1, 1, 1), fade * .5), CX, CY - 2 - 44 * SQUASH))
    canvas = Image.alpha_composite(canvas, place(tinted(top, (1, 1, 1), fade * .34), CX, CY - 2 - 88 * SQUASH))
    return additive(canvas, place(tinted(inner, (1, .478, .4), fade * .62), CX, CY - 2).convert("RGB"))


def whirl_over(canvas: Image.Image, age: float) -> Image.Image:
    """캐릭터 **위**에 얹히는 층 — 혈풍 벽, 솟는 나선 줄기, 칼끝 궤적, 튀는 혈점."""
    ring = load(ASSETS / "fx_whirl_slash_ring.png")
    t = min(1, age / 1.1)
    fade = min(1, t * 7, (1 - t) * 6)
    wall_scale = RADIUS * 2 * .8 / ring.width
    wall = ring.resize((round(ring.width * wall_scale), round(ring.height * wall_scale * 1.06)), Image.LANCZOS) \
        .rotate(-age * 3.1 * 180 / math.pi, resample=Image.BICUBIC, expand=False)
    canvas = additive(canvas, place(tinted(wall, (1, 1, 1), fade * .26), CX, CY - 44).convert("RGB"))

    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(over, "RGBA")
    # 칼날 궤적 — 반경을 따라 도는 칼자국(머리로 갈수록 굵고 밝다)
    sweep = age * 10
    for base in (sweep, sweep + math.pi):
        for seg in range(7):
            head = base - seg * .07
            arc_radius = RADIUS * .88
            keep = 1 - seg / 7
            draw.line([(CX + math.cos(head - .07) * arc_radius, CY + math.sin(head - .07) * arc_radius * .52 - 8),
                       (CX + math.cos(head) * arc_radius, CY + math.sin(head) * arc_radius * .52 - 8)],
                      fill=(0xff, 0x8e, 0x64, int(255 * .65 * keep * fade)), width=max(1, round(1.2 + 3.4 * keep)))
    # 튀는 혈점·불티
    for index in range(12):
        angle = index * 2.4 + age * 2.6
        reach = RADIUS * (.55 + ((index * 37) % 100) / 100 * .75)
        px = CX + math.cos(angle) * reach
        py = CY + math.sin(angle) * reach * .52 - 10 - ((index * 13) % 7) * 4 - t * 18
        size = max(1, (1.8 + ((index * 29) % 10) / 10 * 2.4) * (1 - t * .4))
        color = (0xff, 0x9a, 0x6a) if index % 3 == 0 else (0xc2, 0x23, 0x1c)
        draw.ellipse((px - size, py - size, px + size, py + size), fill=color + (int(190 * fade),))
    return additive(canvas, over)


def tinted(image: Image.Image, factor: tuple[float, float, float], alpha: float) -> Image.Image:
    channels = [image.getchannel(index).point(lambda v, f=factor[index]: min(255, int(v * f)))
                for index in range(3)]
    alpha_channel = image.getchannel(3).point(lambda v: int(v * alpha))
    return Image.merge("RGBA", (*channels, alpha_channel))


def main() -> None:
    canvas = whirl_floor(background(), .34)
    canvas = hero_and_enemies(canvas)
    canvas = whirl_over(canvas, .34)      # 회오리가 가장 짙은 순간(1.1초 중 .34초)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT)
    print(f"saved {OUT} {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    main()
