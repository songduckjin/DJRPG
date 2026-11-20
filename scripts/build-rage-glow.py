"""블러드 레이지 몸 뒤 광휘(작업 214) — 가장자리로 스러지는 부드러운 방사형 빛 한 장.

`Graphics.ellipse` 채우기는 가장자리가 딱 잘려 '붉은 원판'처럼 보인다. 이 텍스처를
늘려 가산으로 얹으면 몸 뒤에서 새어 나오는 기운처럼 보인다.
"""
import numpy as np
from PIL import Image, ImageFilter

S = 192
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
cx = cy = (S - 1) / 2
r = np.sqrt(((xx - cx) / (S / 2)) ** 2 + ((yy - cy) / (S / 2)) ** 2)
alpha = np.clip(1 - r, 0, 1) ** 2.2
# 가운데는 흰색에 가깝고 바깥은 살짝 어두운 주황으로 — 틴트로 색을 바꿔 쓴다.
tint = np.clip(r, 0, 1) ** .8
rgb = np.stack([np.full_like(r, 255), 255 - tint * 70, 255 - tint * 140], axis=-1)
img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(2.0))
img.save('/workspace/work/DJRPG-bloodrage/public/assets/fx_rage_glow_v1.png', optimize=True)
print('saved', img.size)
