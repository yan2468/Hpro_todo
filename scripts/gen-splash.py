#!/usr/bin/env python3
# ponytail: one-off asset generator; rerun when icon.png changes.
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, 'public', 'icon.png')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

# width, height
SIZES = {
    'drawable': [(480, 320)],
    'drawable-port-mdpi': [(320, 480)],
    'drawable-land-mdpi': [(480, 320)],
    'drawable-port-hdpi': [(480, 800)],
    'drawable-land-hdpi': [(800, 480)],
    'drawable-port-xhdpi': [(640, 960)],
    'drawable-land-xhdpi': [(960, 640)],
    'drawable-port-xxhdpi': [(960, 1440)],
    'drawable-land-xxhdpi': [(1440, 960)],
    'drawable-port-xxxhdpi': [(1280, 1920)],
    'drawable-land-xxxhdpi': [(1920, 1280)],
}

BG = (255, 253, 245)


def make_splash(icon: Image.Image, size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = Image.new('RGB', size, BG)
    # icon occupies ~45% of the shorter side
    short = min(w, h)
    iw = int(short * 0.45)
    ih = int(icon.height * iw / icon.width)
    scaled = icon.resize((iw, ih), Image.Resampling.LANCZOS)
    x = (w - scaled.width) // 2
    y = (h - scaled.height) // 2
    canvas.paste(scaled, (x, y), scaled if scaled.mode == 'RGBA' else None)
    return canvas


def main():
    icon = Image.open(ICON).convert('RGBA')
    for folder, sizes in SIZES.items():
        out_dir = os.path.join(RES, folder)
        os.makedirs(out_dir, exist_ok=True)
        for size in sizes:
            img = make_splash(icon, size)
            img.save(os.path.join(out_dir, 'splash.png'), 'PNG')
            print(f'generated {folder}/splash.png {size[0]}x{size[1]}')


if __name__ == '__main__':
    main()
