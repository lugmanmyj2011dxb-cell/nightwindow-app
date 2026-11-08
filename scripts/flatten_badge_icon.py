#!/usr/bin/env python3
"""把照片母版（青色圆牌 + 深色背景）转成满幅方形图标。

用从画面中心发散的射线找圆牌实际边界（对明暗渐变、边沿阴影更稳），
裁到边界内侧留一点余量，四角用圆牌自身青色补满。
"""
import math
import statistics
import sys

from PIL import Image, ImageDraw, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
S = 1024

im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()

def teal(c):
    r, g, b = c
    return g - r > 22 and g > 55

# 以金色线稿的重心作为起点（线稿必然在圆牌内部，且大致居中）
gx = gy = n = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        r, g, b = px[x, y]
        if r > 110 and r - b > 35:
            gx += x; gy += y; n += 1
cx, cy = gx / n, gy / n

radii = []
for i in range(720):
    a = i * math.pi / 360
    dx, dy = math.cos(a), math.sin(a)
    # 沿着射线一直走到画面边缘，取"最后一个青色像素"作为圆牌边界：
    # 线稿是金色、会打断青色，所以不能用连续青色来判停
    last = 0
    d = 120
    limit = min(W, H)
    while d < limit:
        x, y = int(cx + dx * d), int(cy + dy * d)
        if not (0 <= x < W and 0 <= y < H):
            break
        if teal(px[x, y]):
            last = d
        d += 2
    if last:
        radii.append(last)

r = statistics.median(radii)
side = 2 * (r - 26)
box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
face = im.crop(box).resize((S, S), Image.LANCZOS)

pts = [px[int(cx + dx), int(cy + dy)] for dx, dy in
       ((-int(r * .55), -int(r * .55)), (0, -int(r * .6)), (int(r * .55), -int(r * .55)),
        (-int(r * .6), 0), (int(r * .6), 0),
        (-int(r * .55), int(r * .55)), (0, int(r * .6)), (int(r * .55), int(r * .55)))]
bg = tuple(int(sum(c[i] for c in pts) / len(pts)) for i in range(3))

out = face
out.save(dst)
print(f'center=({cx:.0f},{cy:.0f}) r={r:.0f} box={box} bg={bg}')
