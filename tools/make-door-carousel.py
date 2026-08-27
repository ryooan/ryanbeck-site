"""Compose the project cards into a carousel, as candidate art for the
projects door.

    python tools/make-door-carousel.py            # renders every variant
    python tools/make-door-carousel.py --only arc

Writes 1520x1824 candidates into art-source/. They are NOT scenes yet --
run the chosen one through prep-scene.py, which does the crop and the tone
curve:

    python tools/prep-scene.py art-source/projects-carousel-arc.png \\
        public/assets/scenes/projects.jpg --scale 0.82 --focus 0.5,0.47

## What the door does to a picture, which drives every choice here

A door shows the middle of its scene and nothing else: about 82% of the
height at rest, and **56% of the height by 50% of the width** once the hover
zoom runs. So a composition that reads well as a flat image can lose its
whole outer third exactly when someone looks at it.

Hence: one card dead centre, upright and largest, carrying the image on its
own. The flanking cards lean away on a perspective arc and are deliberately
allowed to run out of frame -- at rest they say "there are more of these",
and on hover they are mostly gone, which is the intent rather than an
accident. Nothing that has to be read sits outside the middle half.

The ground is near-black because the door's resting state is a shrouded
corridor; a light background would glow through the veil as a grey slab.
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFilter

W, H = 1520, 1824
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "public", "assets", "cards")
OUT = os.path.join(ROOT, "art-source")

# The nearest panel. It has to be ONE chart with a bold silhouette: the first
# version put forecasting-data.jpg here, which is itself a four-up composite,
# so the door framed a grid of miniature charts and nothing read at all.
HERO = "fd-hpai.jpg"          # a single filled area, legible as a shape

# The receding panels. These are blurred, so what matters is colour and mass,
# not what they say.
PICKS = [
    "fd-debt-limit.jpg",
    "em-march-madness.jpg",
    "park-guides.jpg",
    "fd-semis.jpg",
    "em-herder.jpg",
    "fd-flu-weekly.jpg",
    "fd-refugees.jpg",
]

INK = (10, 8, 7)
EMBER = (200, 114, 42)

# What the door reveals of this canvas once the hover zoom is running. Every
# size below is expressed against THIS, not against the canvas -- the first
# two attempts sized the hero as a fraction of the full image and it came out
# larger than the window that would ever show it, so the door framed a
# fragment of one chart.
DOOR_BLEED, DOOR_ZOOM, DOOR_ASPECT = 1.22, 1.46, 0.741
VIS_H = H / (DOOR_BLEED * DOOR_ZOOM)                    # ~1021 px
VIS_W = VIS_H * (DOOR_ASPECT / (W / H))                 # ~759 px
EYE_Y = H * 0.46                                        # the door's optical centre


def find_coeffs(dst, src):
    """Perspective coefficients mapping dst quad back to src quad.

    PIL's PERSPECTIVE transform samples the *source* for each output pixel,
    so the matrix runs the opposite way to the one you would write by hand.
    """
    m = []
    for (dx, dy), (sx, sy) in zip(dst, src):
        m.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        m.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    # Solve the 8x8 by Gaussian elimination -- numpy is available but this
    # keeps the script to one dependency.
    b = []
    for (sx, sy) in src:
        b += [sx, sy]
    n = 8
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(m[r][i]))
        m[i], m[p] = m[p], m[i]
        b[i], b[p] = b[p], b[i]
        piv = m[i][i]
        if abs(piv) < 1e-12:
            continue
        for j in range(i, n):
            m[i][j] /= piv
        b[i] /= piv
        for r in range(n):
            if r == i:
                continue
            f = m[r][i]
            if not f:
                continue
            for j in range(i, n):
                m[r][j] -= f * m[i][j]
            b[r] -= f * b[i]
    return b


def card_art(name, w, h):
    """A card: the thumbnail, cropped to portrait, with a warm border."""
    im = Image.open(os.path.join(CARDS, name)).convert("RGB")
    # Thumbs are landscape; take a centred portrait slice.
    tw = int(im.height * w / h)
    if tw <= im.width:
        x = (im.width - tw) // 2
        im = im.crop((x, 0, x + tw, im.height))
    else:
        th = int(im.width * h / w)
        y = (im.height - th) // 2
        im = im.crop((0, y, im.width, y + th))
    im = im.resize((w, h), Image.LANCZOS)

    out = Image.new("RGB", (w, h), (28, 22, 17))
    pad = max(4, w // 46)
    inner = im.resize((w - pad * 2, h - pad * 2), Image.LANCZOS)
    out.paste(inner, (pad, pad))
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, w - 1, h - 1], outline=(74, 61, 48), width=max(2, pad // 3))
    return out


def place(base, art, quad, *, dim, glow):
    """Composite `art` into `base` at a destination quad, with falloff."""
    w, h = art.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    coeffs = find_coeffs(quad, src)

    layer = art.convert("RGBA").transform(
        (W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    mask = Image.new("L", (w, h), 255).transform(
        (W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    if dim < 1:
        layer = Image.blend(Image.new("RGBA", (W, H), INK + (255,)), layer, dim)
    if glow:
        # A soft warm bloom behind the centre card so it reads as lit rather
        # than merely brighter.
        halo = mask.filter(ImageFilter.GaussianBlur(46)).point(
            lambda v: int(v * 0.55))
        base.paste(Image.new("RGB", (W, H), EMBER), (0, 0), halo)
    base.paste(layer.convert("RGB"), (0, 0), mask)


def hero_crop(name, w, h):
    """The hero panel: a single card, cropped to its boldest region.

    Cards are landscape and mostly chart; taking the middle-left keeps the
    plotted shape and drops the axis furniture, which at door scale is noise
    rather than information.
    """
    im = Image.open(os.path.join(CARDS, name)).convert("RGB")
    cw = int(im.width * 0.62)
    ch = int(cw * h / w)
    if ch > im.height:
        ch = im.height
        cw = int(ch * w / h)
    x = int(im.width * 0.06)
    y = max(0, (im.height - ch) // 2)
    im = im.crop((x, y, min(im.width, x + cw), y + ch)).resize((w, h), Image.LANCZOS)

    out = Image.new("RGB", (w, h), (30, 24, 18))
    pad = max(5, w // 60)
    out.paste(im.resize((w - pad * 2, h - pad * 2), Image.LANCZOS), (pad, pad))
    ImageDraw.Draw(out).rectangle([0, 0, w - 1, h - 1],
                                  outline=(96, 78, 60), width=max(2, pad // 2))
    return out


def render(variant):
    """A corridor of panels receding into the dark, hero nearest.

    Built for a TALL frame, and sized against what the door actually shows.
    Two earlier attempts got this wrong in opposite directions: the first
    fanned the cards sideways, which is the natural way to draw a carousel and
    the wrong shape for a 0.741 portal; the second made the hero 0.62 of the
    canvas width, which is taller than the visible window, so the door framed
    a corner of one chart. Everything here is a fraction of VIS_H / VIS_W.

    Everything behind the hero is blurred and dimmed on purpose. At the size a
    door shows, card text is not legible and does not become legible by being
    sharper -- it just turns into noise. Blurred, the same panels read as
    distance.
    """
    base = Image.new("RGB", (W, H), INK)

    # hero height as a fraction of the visible window; how fast panels shrink;
    # how far each steps up; sideways stagger; blur per step.
    if variant == "corridor":
        n, hero, shrink, rise, sway, blur = 5, 0.60, 0.80, 0.16, 0.10, 3.4
    elif variant == "deep":
        n, hero, shrink, rise, sway, blur = 7, 0.52, 0.845, 0.13, 0.15, 4.0
    else:                                    # "close"
        n, hero, shrink, rise, sway, blur = 4, 0.70, 0.76, 0.19, 0.06, 2.8

    hero_h = VIS_H * hero
    hero_w = hero_h / 1.30                   # portrait panels

    # Lay the panels out first, then move the whole arrangement so its
    # bounding box is centred on the door's optical centre. Positioning them
    # directly against a hand-picked base_y does not survive a parameter
    # change: the alternating stagger accumulates a net sideways drift, and
    # the stack always grows in one direction, so the composition ends up
    # off-centre and the hover crop clips it. Centring afterwards is exact
    # whatever the numbers are.
    panels = []
    for i in range(n):
        scale = shrink ** i
        w, h = int(hero_w * scale), int(hero_h * scale)
        y = -VIS_H * rise * i
        x = VIS_W * sway * (1 if i % 2 else -1) * (i ** 0.7)
        panels.append([x, y, w, h, i])

    xs0 = min(p[0] - p[2] / 2 for p in panels)
    xs1 = max(p[0] + p[2] / 2 for p in panels)
    ys0 = min(p[1] - p[3] / 2 for p in panels)
    ys1 = max(p[1] + p[3] / 2 for p in panels)
    dx = W / 2 - (xs0 + xs1) / 2
    dy = EYE_Y - (ys0 + ys1) / 2

    # Back to front, so nearer panels overlap the ones behind.
    for x, y, w, h, i in sorted(panels, key=lambda p: -p[4]):
        x += dx
        y += dy
        art = (hero_crop(HERO, w, h) if i == 0
               else card_art(PICKS[(i - 1) % len(PICKS)], w, h))
        if i:
            art = art.filter(ImageFilter.GaussianBlur(blur * i * 0.6))

        quad = [(x - w / 2, y - h / 2), (x + w / 2, y - h / 2),
                (x + w / 2, y + h / 2), (x - w / 2, y + h / 2)]
        place(base, art, quad, dim=0.20 + 0.80 * (0.70 ** i), glow=(i == 0))

    # A shaft of warm light down the corridor, brightest behind the hero.
    shaft = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shaft).polygon(
        [(W * 0.43, 0), (W * 0.57, 0), (W * 0.74, H), (W * 0.26, H)], fill=38)
    base.paste(Image.new("RGB", (W, H), EMBER), (0, 0),
               shaft.filter(ImageFilter.GaussianBlur(160)))

    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse([-W * 0.26, -H * 0.10, W * 1.26, H * 1.10], fill=255)
    base = Image.composite(base, Image.new("RGB", (W, H), INK),
                           vig.filter(ImageFilter.GaussianBlur(190)))

    path = os.path.join(OUT, "projects-carousel-%s.png" % variant)
    base.save(path, optimize=True)
    print("wrote %s  (hero %dx%d, stack %dx%d, window %dx%d)"
          % (os.path.relpath(path, ROOT), hero_w, hero_h,
             xs1 - xs0, ys1 - ys0, VIS_W, VIS_H))
    return path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--only", help="corridor | deep | close")
    a = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for v in ([a.only] if a.only else ["corridor", "deep", "close"]):
        render(v)


if __name__ == "__main__":
    main()
