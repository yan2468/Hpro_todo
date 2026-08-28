#!/usr/bin/env python3
r"""生成「牛马的打工日志」应用图标。

默认使用用户提供的源图：C:\Users\72980\Downloads\牛马打工日志图标设计.png
如果源图不存在，则回退到白底 + emoji + 橘黄墨镜的绘制逻辑。
输出：
- Android mipmap-mdpi 至 xxxhdpi 的 ic_launcher / ic_launcher_round / ic_launcher_foreground
- public/icon.png（Electron/PC 用，256x256）
"""
from PIL import Image, ImageDraw, ImageFont
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
PUBLIC_ICON = os.path.join(ROOT, 'public', 'icon.png')

# 用户提供的源图路径
SOURCE_IMAGE = r'C:\Users\72980\Downloads\牛马打工日志图标设计.png'

MIPMAP_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

BG = (255, 255, 255)
ORANGE = (255, 140, 0)

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\seguiemj.ttf',
    r'C:\Windows\Fonts\segoeui.ttf',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
    '/System/Library/Fonts/Apple Color Emoji.ttc',
]


def find_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_sunglasses(draw: ImageDraw.ImageDraw, cx: float, cy: float, w: float, h: float):
    lens_w = w * 0.42
    lens_h = h * 0.55
    gap = w * 0.08
    left_cx = cx - (lens_w + gap) / 2
    right_cx = cx + (lens_w + gap) / 2
    draw.rounded_rectangle(
        [left_cx - lens_w / 2, cy - lens_h / 2,
         left_cx + lens_w / 2, cy + lens_h / 2],
        radius=lens_h / 3,
        fill=ORANGE,
        outline=(220, 100, 0),
        width=max(1, int(w * 0.015))
    )
    draw.rounded_rectangle(
        [right_cx - lens_w / 2, cy - lens_h / 2,
         right_cx + lens_w / 2, cy + lens_h / 2],
        radius=lens_h / 3,
        fill=ORANGE,
        outline=(220, 100, 0),
        width=max(1, int(w * 0.015))
    )
    bridge_y = cy - lens_h * 0.15
    draw.line(
        [(left_cx + lens_w / 2, bridge_y), (right_cx - lens_w / 2, bridge_y)],
        fill=ORANGE,
        width=max(2, int(w * 0.04))
    )


def make_fallback_icon(size: int) -> Image.Image:
    """源图缺失时的回退图标：白底 + 牛马 emoji + 橘黄墨镜。"""
    img = Image.new('RGBA', (size, size), (*BG, 255))
    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.55)
    font = find_font(font_size)
    text = '🐮🐴'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = (size - th) // 2 - int(size * 0.03)
    draw.text((tx, ty), text, font=font, embedded_color=True)
    draw_sunglasses(draw, size / 2, ty + th * 0.42, size * 0.48, size * 0.16)
    return img


def load_source_image(size: int) -> Image.Image:
    if not os.path.exists(SOURCE_IMAGE):
        print(f'源图不存在：{SOURCE_IMAGE}，使用回退绘制', file=sys.stderr)
        return make_fallback_icon(size)
    src = Image.open(SOURCE_IMAGE)
    if src.mode != 'RGBA':
        src = src.convert('RGBA')
    # 居中裁切成正方形
    w, h = src.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        src = src.crop((left, top, left + side, top + side))
    return src.resize((size, size), Image.Resampling.LANCZOS)


def make_round_icon(size: int) -> Image.Image:
    """生成圆角图标：以源图内容填满圆形，外部透明。
    注意：Android 启动器本身会再做圆形裁剪，这里先做好透明圆角。"""
    square = load_source_image(size)
    # 创建圆形遮罩
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    # 在透明背景上应用遮罩
    round_img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    round_img.paste(square, (0, 0), mask)
    return round_img


def main():
    base_size = 1024
    base = load_source_image(base_size)
    round_base = make_round_icon(base_size)

    os.makedirs(OUT_DIR, exist_ok=True)
    for folder, s in MIPMAP_SIZES.items():
        out_folder = os.path.join(OUT_DIR, folder)
        os.makedirs(out_folder, exist_ok=True)
        scaled = base.resize((s, s), Image.Resampling.LANCZOS)
        scaled.save(os.path.join(out_folder, 'ic_launcher.png'), 'PNG')
        scaled.save(os.path.join(out_folder, 'ic_launcher_foreground.png'), 'PNG')
        round_scaled = round_base.resize((s, s), Image.Resampling.LANCZOS)
        round_scaled.save(os.path.join(out_folder, 'ic_launcher_round.png'), 'PNG')
        print(f'generated {folder}/ic_launcher*.png {s}x{s}')

    public_icon = base.resize((256, 256), Image.Resampling.LANCZOS)
    public_icon.save(PUBLIC_ICON, 'PNG')
    print(f'updated public/icon.png 256x256')


if __name__ == '__main__':
    main()
