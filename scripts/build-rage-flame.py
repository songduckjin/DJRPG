"""블러드 레이지 불꽃 텍스처(작업 214) — 몸 윤곽을 따라 타오르는 붉은 투기 혀 한 장.

코드(`src/game/render/bloodRage.ts`)가 이 한 장을 여러 번 늘리고 비틀고 색을 바꿔(가산)
몸 주변 불꽃을 만든다. 모양은 아래에서 위로 좁아지는 물방울형 혀에 잔물결을 준 것이고,
색은 밑동의 노란 속불 → 주황 → 가장자리 진홍으로 올라간다.
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 128, 224
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
t = (H - 1 - yy) / (H - 1)                     # 0 = 밑동, 1 = 끝

cx = W / 2 + np.sin(t * 4.2) * W * .035 + np.sin(t * 9.1 + 1.3) * W * .016
hw = W * .34 * np.power(1 - t, .62) * (.52 + .48 * np.power(np.sin(np.pi * (.12 + .86 * t)), .55))
hw *= 1 + .10 * np.sin(t * 12.0 + .7)
d = np.abs(xx - cx) / np.maximum(hw, 1e-3)

edge = np.clip((1.06 - d) / .5, 0, 1)          # 좌우 가장자리 페이드
tip = np.clip((1.02 - t) / .3, 0, 1)           # 끝으로 갈수록 투명
alpha = edge * np.power(tip, .7) * np.clip((.18 + t * 3.2), 0, 1)
alpha = np.clip(alpha, 0, 1)


def smooth(a, b, v):
    k = np.clip((v - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


outer = np.array([116, 16, 6], np.float32)     # 가장자리 진홍
mid = np.array([252, 108, 24], np.float32)     # 중간 주황
core = np.array([255, 236, 168], np.float32)   # 속불 노랑

rgb = outer[None, None, :] + (mid - outer)[None, None, :] * smooth(1.0, .46, d)[..., None]
hot = smooth(.62, .05, d) * np.clip(1.15 - t, 0, 1) * .9
rgb = rgb + (core - rgb) * hot[..., None]
# 밑동은 조금 더 뜨겁게 — 발밑에서 피어오르는 느낌.
rgb = rgb + (core - rgb) * (np.clip(1 - t * 3.4, 0, 1) * .3)[..., None]
rgb = np.clip(rgb, 0, 255)

img = np.dstack([rgb, alpha * 255]).astype(np.uint8)
out = Image.fromarray(img, 'RGBA')
out = out.filter(ImageFilter.GaussianBlur(.6))
# 가장자리 알파를 한 번 더 부드럽게(가산 블렌딩에서 계단이 보이지 않게).
a = out.split()[3].filter(ImageFilter.GaussianBlur(.8))
out.putalpha(a)
out.save('/workspace/work/DJRPG-bloodrage/public/assets/fx_rage_flame_v1.png', optimize=True)
print('saved', out.size)
