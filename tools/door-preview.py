"""Crop a candidate to what the projects door actually reveals.

    python tools/door-preview.py art-source/whatever.png [--rest 1.15]

Writes `whatever__doorview.png`: the resting view beside the hover view, each
with the door's own exposure applied.

Two reasons this exists rather than eyeballing the full image.

**Framing.** A door shows about 82% of the height at rest and 56% of the
height by 50% of the width once the hover zoom runs, centred on 46% of the
height rather than the middle. Compositions that look fine flat lose their
outer third exactly when someone looks at them.

**Exposure.** site.css puts the resting scene through
`brightness(var(--scene-rest)) saturate(.45) contrast(.92) blur(1.4px)` under
a dark veil, and the lit state through `brightness(1.22)`. A picture judged at
100% tells you very little about either. --rest takes the per-door
`--scene-rest` value; the projects door is currently 1.15.
"""
import argparse
import os

from PIL import Image, ImageEnhance, ImageFilter

BLEED, ZOOM, ASPECT = 1.22, 1.46, 0.741
W, H = 760, 912


def window(im, zoom):
    vh = 1.0 / (BLEED * zoom)
    vw = vh * (ASPECT / (W / H))
    w, h = im.size
    cw, ch = w * vw, h * vh
    x = (w - cw) / 2
    y = max(0, min(h - ch, h * 0.46 - ch / 2))
    return im.crop((int(x), int(y), int(x + cw), int(y + ch)))


def resting(im, rest):
    """What site.css does to a scene at rest, veil included."""
    im = ImageEnhance.Brightness(im).enhance(rest)
    im = ImageEnhance.Color(im).enhance(0.45)
    im = ImageEnhance.Contrast(im).enhance(0.92)
    im = im.filter(ImageFilter.GaussianBlur(1.4 * im.width / W))
    # The veil: a mouth that opens in the middle and closes at the walls.
    veil = Image.new("L", im.size, 0)
    px = veil.load()
    for x in range(im.width):
        t = abs(x / im.width - 0.5) * 2
        for y in range(0, im.height, 4):
            v = int(150 * (t ** 1.6) + 60 * abs(y / im.height - 0.42))
            for yy in range(y, min(y + 4, im.height)):
                px[x, yy] = min(255, v)
    return Image.composite(Image.new("RGB", im.size, (8, 7, 6)), im, veil)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--rest", type=float, default=1.15,
                    help="the door's --scene-rest value")
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGB")
    rest = resting(window(im, 1.0), a.rest)
    hover = ImageEnhance.Brightness(window(im, ZOOM)).enhance(1.22)

    gap = 30
    out = Image.new("RGB", (rest.width + hover.width + gap,
                            max(rest.height, hover.height)), (24, 20, 16))
    out.paste(rest, (0, 0))
    out.paste(hover, (rest.width + gap, 0))
    p = os.path.splitext(a.src)[0] + "__doorview.png"
    out.save(p)
    print("%-46s rest(x%.2f) %dx%d | hover %dx%d"
          % (os.path.basename(p), a.rest, rest.width, rest.height,
             hover.width, hover.height))


if __name__ == "__main__":
    main()
