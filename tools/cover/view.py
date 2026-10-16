"""Crop viewer for measuring: python -P tools/cover/view.py name x0 y0 x1 y1 scale [photo|etch|norm]
Draws a labelled grid in photo pixel coordinates (every 10 px small ticks, every 50 px labelled)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image, ImageDraw
import etch

def main():
    name, x0, y0, x1, y1, s = sys.argv[1], *map(int, sys.argv[2:6]), int(sys.argv[6])
    mode = sys.argv[7] if len(sys.argv) > 7 else 'photo'
    if mode in ('etch', 'norm'):
        d = etch.etch_norm() if mode == 'norm' else etch.etch_response(sigma_s=0.6)
        im = Image.fromarray(np.clip(d * 1.5, 0, 255).astype(np.uint8)).convert('RGB')
    else:
        im = Image.open(etch.PHOTO).convert('RGB')
    im = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * s, (y1 - y0) * s), Image.LANCZOS if mode == 'photo' else Image.NEAREST)
    dr = ImageDraw.Draw(im)
    step = 10 if s >= 4 else 50
    for x in range(((x0 + step - 1) // step) * step, x1 + 1, step):
        X = (x - x0 + 0.5) * s
        dr.line([(X, 0), (X, 10)], fill=(0, 255, 0))
        dr.text((X + 2, 10), str(x), fill=(0, 255, 0))
    for y in range(((y0 + step - 1) // step) * step, y1 + 1, step):
        Y = (y - y0 + 0.5) * s
        dr.line([(0, Y), (10, Y)], fill=(0, 255, 0))
        dr.text((12, Y - 5), str(y), fill=(0, 255, 0))
    im.save(os.path.join(etch.ROOT, 'build', 'cover', name + '.png'))

main()
