#!/usr/bin/env python3
"""把徽章抠成干净的矢量风图标：金色线稿保留，背景换成平滑渐变。

照片母版里的环形阴影、抹除痕迹都会被平滑背景替换掉，
不会再有圆形台阶或晕影。
用法：python3 scripts/vectorize_badge.py <src> <dst>
"""
import math
import sys

from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()

def alpha_of(c):
    r, g, b = c
    return max(0.0, min(1.0, (r - b - 16) / 58.0))

# 背景模型：按角度 x 半径取非金线像素的中位数
CX, CY = W / 2, H / 2
AB = 96
bins = {}
for y in range(0, H, 2):
    for x in range(0, W, 2):
        c = px[x, y]
        if alpha_of(c) < 0.06:
            d = math.hypot(x - CX, y - CY)
            a = int((math.atan2(y - CY, x - CX) + math.pi) / (2 * math.pi) * AB) % AB
            bins.setdefault((a, int(d) // 10), []).append(c)

def bg_at(x, y):
    d = math.hypot(x - CX, y - CY)
    a = int((math.atan2(y - CY, x - CX) + math.pi) / (2 * math.pi) * AB) % AB
    rb = int(d) // 10
    for k in range(8):
        for key in ((a, rb + k), (a, rb - k), ((a + k) % AB, rb), ((a - k) % AB, rb)):
            if key in bins and len(bins[key]) > 8:
                cs = sorted(bins[key], key=lambda c: c[0] + c[1] + c[2])
                return cs[len(cs) // 2]
    return (16, 80, 98)

out = im.copy()
op = out.load()
for y in range(H):
    for x in range(W):
        a = alpha_of(op[x, y])
        if a < 0.98:
            bg = bg_at(x, y)
            c = op[x, y]
            op[x, y] = tuple(int(c[i] * a + bg[i] * (1 - a)) for i in range(3))

out = out.filter(ImageFilter.SMOOTH)
out.save(dst)
print('vectorized')
