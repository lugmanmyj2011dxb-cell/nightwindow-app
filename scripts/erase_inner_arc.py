#!/usr/bin/env python3
"""抹掉月牙外那圈内层圆弧，保留外围窗棂。

按"到月牙中心的半径"建模徽章底色：每个半径环取未被金线（含其阴影）污染的青色中位数，
再用它填掉环带区域，既保留径向明暗，也不会留下圆形晕影。
用法：python3 scripts/erase_inner_arc.py <src> <dst> <cx> <cy> <r1> <r2>
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
    return r > 105 and r - b > 32

# 金线遮罩（外扩，把浮雕阴影也排除掉）
gm = Image.new('L', (W, H), 0)
gp = gm.load()
for y in range(H):
    for x in range(W):
        if gold(px[x, y]):
            gp[x, y] = 255
gm = gm.filter(ImageFilter.MaxFilter(17))

# 半径 x 角度 -> 底色（跟随徽章的两维明暗）
AB = 72
bins = {}
for y in range(max(0, CY - 460), min(H, CY + 460), 2):
    for x in range(max(0, CX - 460), min(W, CX + 460), 2):
        d = math.hypot(x - CX, y - CY)
        if gm.getpixel((x, y)) == 0:
            a = int((math.atan2(y - CY, x - CX) + math.pi) / (2 * math.pi) * AB) % AB
            bins.setdefault((a, int(d) // 6), []).append(px[x, y])

def ring_color(x, y):
    d = math.hypot(x - CX, y - CY)
    a = int((math.atan2(y - CY, x - CX) + math.pi) / (2 * math.pi) * AB) % AB
    rb = int(d) // 6
    for k in range(6):
        for key in ((a, rb + k), (a, rb - k), ((a + k) % AB, rb), ((a - k) % AB, rb)):
            if key in bins and len(bins[key]) > 12:
                cs = sorted(bins[key], key=lambda c: c[0] + c[1] + c[2])
                return cs[len(cs) // 2]
    return (20, 80, 98)

mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).ellipse([CX - R2, CY - R2, CX + R2, CY + R2], fill=255)
ImageDraw.Draw(mask).ellipse([CX - R1, CY - R1, CX + R1, CY + R1], fill=0)

out = im.copy()
op = out.load()
for y in range(max(0, CY - R2 - 2), min(H, CY + R2 + 2)):
    for x in range(max(0, CX - R2 - 2), min(W, CX + R2 + 2)):
        if mask.getpixel((x, y)) > 0:
            op[x, y] = ring_color(x, y)

soft = mask.filter(ImageFilter.GaussianBlur(5))
out = Image.composite(out.filter(ImageFilter.GaussianBlur(2)), im, soft)
out.save(dst)
print('inner arc erased')
