#!/usr/bin/env python3
"""去掉贴着月牙的那圈小圆环，保留外围窗棂。

做法：把环带区域先涂成周围青色中位数，再整片用大半径模糊覆盖（羽化过渡），
这样既抹掉金线，也不会留下原来那道浮雕阴影。
用法：python3 scripts/remove_moon_ring.py <src> <dst> <cx> <cy> <r1> <r2>
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
CX, CY, R1, R2 = (int(v) for v in sys.argv[3:7])

im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()

def gold(c):
    r, g, b = c
    return r > 110 and r - b > 35

samples = []
for i in range(720):
    a = i * math.pi / 360
    for d in range(R2 + 20, R2 + 90, 2):
        x, y = int(CX + math.cos(a) * d), int(CY + math.sin(a) * d)
        if 0 <= x < W and 0 <= y < H and not gold(px[x, y]):
            samples.append(px[x, y])
            break
bg = tuple(sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3))

mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).ellipse([CX - R2, CY - R2, CX + R2, CY + R2], fill=255)
ImageDraw.Draw(mask).ellipse([CX - R1, CY - R1, CX + R1, CY + R1], fill=0)
mask = mask.filter(ImageFilter.GaussianBlur(9))

base = im.copy()
bp = base.load()
for y in range(max(0, CY - R2 - 12), min(H, CY + R2 + 12)):
    for x in range(max(0, CX - R2 - 12), min(W, CX + R2 + 12)):
        if mask.getpixel((x, y)) > 0:
            bp[x, y] = bg

smooth = base.filter(ImageFilter.GaussianBlur(26))
out = Image.composite(smooth, im, mask)
out.save(dst)
print(f'ring {R1}-{R2} @ ({CX},{CY}) filled with bg={bg}')
