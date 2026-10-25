#!/usr/bin/env python3
"""Optional offline image-to-ASCII converter. Requires Pillow (pip install pillow).
Usage: python tools/convert_ascii.py photo.jpg 80 > picture.txt
"""
import sys
from PIL import Image, ImageOps

def convert(path, width=80):
    glyphs = '@%#*+=-:. '
    with Image.open(path) as im:
        im = ImageOps.grayscale(im)
        w, h = im.size
        height = max(1, round(h / w * width * .5))
        im = im.resize((width, height))
        return '\n'.join(''.join(glyphs[p * (len(glyphs) - 1) // 256] for p in (im.crop((0, y, width, y + 1)).getdata())) for y in range(height))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('usage: convert_ascii.py image [columns]')
    print(convert(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 80))
