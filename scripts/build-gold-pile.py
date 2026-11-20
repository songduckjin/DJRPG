#!/usr/bin/env python3
"""Build the flat antique gold heap that a gold drop leaves on the floor (작업 195).

The field and the dungeon both draw this one image at `GOLD_PILE_ART`: three coins lying flat,
overlapping, so a kill reads as a heap of coins on the floor instead of a standing coin pickup.
The heap used to be the 256px `gold-coin.png` squashed to 15~19px per coin; at that size its sword
emblem and ridged edge smear into mush. This art is drawn at the size it is shown (2× the display
size in `goldPile.ts`, the largest device pixel ratio the canvas uses) with bold, flat shapes only —
a bronze rim, an engraved ring, one spark on the coin in front, a one-texel contour and one top
light — so nothing is resampled at runtime and the heap stays crisp on a phone.

Run: python3 scripts/build-gold-pile.py   (writes public/assets/icons/gold-pile.png)
"""
import math
from PIL import Image, ImageDraw

# Displayed size in CSS pixels (`GOLD_PILE_W`/`GOLD_PILE_H` in `src/game/render/goldPile.ts`).
# The canvas runs at `resolution: min(devicePixelRatio, 2)`, so 2× is one texel per device pixel on
# the sharpest phone the game draws on.
DW, DH = 44, 20
SCALE = 2
SS = 4  # supersampling inside the drawing pass, downscaled at the end for clean edges
W, H = DW * SS, DH * SS
TEXEL = SS / SCALE  # one device pixel, in drawing units

CONTOUR = (38, 25, 6, 255)
EDGE = (96, 62, 18, 255)          # the coin's side, showing under the rim
RIM = (140, 92, 30)
FACE = (238, 184, 86)
FACE_DEEP = (228, 172, 78)         # the coin behind on the right, a shade deeper
FACE_LIGHT = (245, 196, 102)       # the coin in front, catching a little more light
ENGRAVE = (166, 110, 40, 235)
SHADE = (0, 0, 0, 70)              # the shadow the face carries along its lower rim
TOP_LIGHT = (255, 240, 196, 220)


def ellipse_mask(box, size=(W, H)):
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    return mask


def coin(canvas, cx, cy, rx, ry, tilt, face=FACE, rim=RIM, marked=False):
    """One coin lying flat: its side, the bronze rim, the face with its lower shading, one top light."""
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse([cx - rx, cy - ry + ry * .30, cx + rx, cy + ry + ry * .30], fill=EDGE)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=rim)
    face_box = [cx - rx + rx * .20, cy - ry + ry * .26, cx + rx - rx * .20, cy + ry - ry * .26]
    draw.ellipse(face_box, fill=face)
    # A soft band of shade inside the lower rim: the face sits below the rim instead of bulging out.
    shade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse([face_box[0], face_box[1] + ry * .30, face_box[2], face_box[3]], fill=SHADE)
    layer.alpha_composite(Image.composite(shade, Image.new('RGBA', (W, H), (0, 0, 0, 0)), ellipse_mask(face_box)))
    # An engraved ring inside the rim makes the face read as a struck coin; the coin in front also
    # carries a spark, set diagonally so it reads as a mark on metal and never as a cross.
    ring_x, ring_y = rx * .60, ry * .56
    draw.ellipse([cx - ring_x, cy - ring_y, cx + ring_x, cy + ring_y], outline=ENGRAVE, width=round(TEXEL))
    if marked:
        for angle in (45, 135, 225, 315):
            radians = math.radians(angle)
            draw.line([cx + math.cos(radians) * rx * .12, cy + math.sin(radians) * ry * .30,
                       cx + math.cos(radians) * rx * .36, cy + math.sin(radians) * ry * .85],
                      fill=ENGRAVE, width=round(TEXEL))
    if tilt:
        layer = layer.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    canvas.alpha_composite(layer)
    # A one-texel contour on the silhouette keeps the coins apart from each other and the floor, and
    # a one-texel light along the upper rim gives the heap its antique sheen.
    outline = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(outline).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=CONTOUR, width=round(TEXEL))
    light = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(light).arc([cx - rx + rx * .08, cy - ry + ry * .08, cx + rx - rx * .08, cy + ry - ry * .08],
                              200, 340, fill=TOP_LIGHT, width=round(TEXEL))
    if tilt:
        outline = outline.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
        light = light.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    canvas.alpha_composite(outline)
    canvas.alpha_composite(light)


def main():
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    s = SS
    # The back pair first, then the coin in front, each a touch lower and overlapping the pair behind.
    coin(canvas, 13.4 * s, 10.4 * s, 10.8 * s, 5.2 * s, -7)
    coin(canvas, 30.0 * s, 10.7 * s, 10.5 * s, 5.1 * s, 6, face=FACE_DEEP, rim=(134, 88, 28))
    coin(canvas, 21.4 * s, 12.9 * s, 10.4 * s, 5.2 * s, -2, face=FACE_LIGHT, marked=True)
    out = canvas.resize((DW * SCALE, DH * SCALE), Image.LANCZOS)
    out.save('public/assets/icons/gold-pile.png', optimize=True)
    print('public/assets/icons/gold-pile.png', out.size)


if __name__ == '__main__':
    main()
