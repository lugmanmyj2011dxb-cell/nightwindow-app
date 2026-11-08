#!/usr/bin/env python3
"""从 AI 生成的位图母版 resources/icon/master.png 生成 iOS / Android 全套图标。
用法：python3 scripts/render_icons_png.py

母版为 1024×1024（海洋蓝底 #11707C→#07343C + 暖金线稿）。
Android 自适应图标拆成两层：背景层用纯色 #0C525C（resources/values/ic_launcher_background.xml），
前景层用母版缩到 80% 居中，超出部分由启动器裁切。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'resources/icon/master.png')
master = Image.open(SRC).convert('RGB')

def rounded(img, radius_pct):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, w - 1, h - 1], radius=int(w * radius_pct / 100), fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def circle(img):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def save(img, rel):
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full, 'PNG')
    print(f'{img.size[0]}px -> {rel}')

# iOS：App Store 要求 1024 满版，圆角由系统裁
save(master.resize((1024, 1024), Image.LANCZOS),
     'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

# Play 商品详情页图标 512
save(master.resize((512, 512), Image.LANCZOS),
     'resources/icon/export/icon-512.png')

# Android 传统图标 + 自适应前景层
for d, s in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96),
             ('xxhdpi', 144), ('xxxhdpi', 192)]:
    base = master.resize((s, s), Image.LANCZOS)
    save(rounded(base, 22), f'android/app/src/main/res/mipmap-{d}/ic_launcher.png')
    save(circle(base), f'android/app/src/main/res/mipmap-{d}/ic_launcher_round.png')

    # 自适应前景：108/48 的画布，母版缩到 80% 居中
    fg_size = round(s * 108 / 48)
    inner = round(fg_size * 0.80)
    fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    off = (fg_size - inner) // 2
    fg.paste(master.resize((inner, inner), Image.LANCZOS), (off, off))
    save(fg, f'android/app/src/main/res/mipmap-{d}/ic_launcher_foreground.png')
