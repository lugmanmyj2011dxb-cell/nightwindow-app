#!/usr/bin/env python3
"""把方形图标里那行粗体 NIGHT WINDOW 换成细体宽字距字标。

做法：在指定矩形内按列线性插值抹掉旧文字（保留青色渐变），
再用 HelveticaNeue 细体逐字排布一行大写字标，避开床右端的立柱。
"""
import sys

from PIL import Image, ImageDraw, ImageFont

path = sys.argv[1]
im = Image.open(path).convert('RGB')
px = im.load()
W, H = im.size

Y0, Y1, X0, X1 = 742, 836, 168, 812   # 旧文字区域（含被压住的床腿下段，抹掉后重画）
SIZE = 46
TRACK = 0.24
COLOR = (238, 219, 176)
FONT = '/System/Library/Fonts/HelveticaNeue.ttc'

for x in range(X0, X1 + 1):
    top, bot = px[x, Y0], px[x, Y1]
    for y in range(Y0, Y1 + 1):
        t = (y - Y0) / float(Y1 - Y0)
        px[x, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))

# 重画床腿：竖柱 + 底部短横脚（原来被旧文字压住的部分）
d0 = ImageDraw.Draw(im)
d0.rectangle([789, 738, 798, 822], fill=COLOR)
d0.rectangle([736, 812, 798, 821], fill=COLOR)

d = ImageDraw.Draw(im)
font = ImageFont.truetype(FONT, SIZE, index=0)
text = 'NIGHT WINDOW'
widths = [d.textlength(ch, font=font) for ch in text]
track = SIZE * TRACK
total = sum(widths) + track * (len(text) - 1)

CX, BASELINE = (X0 + X1) / 2, 808
x = CX - total / 2
for ch, wdt in zip(text, widths):
    d.text((x, BASELINE), ch, font=font, fill=COLOR, anchor='ls')
    x += wdt + track

im.save(path)
print(f'wordmark width={total:.0f} center={CX:.0f} baseline={BASELINE}')
