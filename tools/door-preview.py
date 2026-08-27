"""Crop a candidate to what the projects door actually reveals.

    python tools/door-preview.py art-source/whatever.png

Writes `whatever__doorview.png`: the resting view beside the hover view.

This exists because judging door art from the full image is misleading. A
door shows about 82% of the height at rest and **56% of the height by 50% of
the width** once the hover zoom runs, centred on 46% of the height rather
than the middle. Compositions that look fine flat lose their outer third
exactly when someone looks at them -- which is how the first two carousel
attempts got through review and failed here.
"""
import sys, os
from PIL import Image
BLEED, ZOOM, ASPECT = 1.22, 1.46, 0.741
W, H = 760, 912

def window(im, bleed, zoom):
    vh = 1.0 / (bleed * zoom)
    vw = vh * (ASPECT / (W / H))
    w, h = im.size
    cw, ch = w * vw, h * vh
    x, y = (w - cw) / 2, h * 0.46 - ch / 2
    y = max(0, min(h - ch, y))
    return im.crop((int(x), int(y), int(x + cw), int(y + ch)))

src = sys.argv[1]
im = Image.open(src).convert("RGB")
rest = window(im, BLEED, 1.0)
hover = window(im, BLEED, ZOOM)
out = Image.new("RGB", (rest.width + hover.width + 30, max(rest.height, hover.height)), (24, 20, 16))
out.paste(rest, (0, 0)); out.paste(hover, (rest.width + 30, 0))
p = os.path.splitext(src)[0] + "__doorview.png"
out.save(p)
print("rest %dx%d  hover %dx%d -> %s" % (rest.width, rest.height, hover.width, hover.height, os.path.basename(p)))
