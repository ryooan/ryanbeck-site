#!/usr/bin/env python3
"""Textures for the about-page tome: leather, aged page stock, and the
gilt-toned wordmark used on the cover.

    python3 tools/make-tome-textures.py
"""
import numpy as np, math, os
from PIL import Image, ImageFilter, ImageDraw

os.makedirs('public/assets/tome', exist_ok=True)

def fbm(w, h, octaves=6, seed=1, persistence=.55):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = 2 ** (o + 1)
        g = rng.random((max(2, n), max(2, int(n * w / h) or 2))).astype(np.float32)
        layer = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += layer * amp; tot += amp; amp *= persistence
    return out / tot

def emboss(height, strength=1.0):
    """Fake a light from the upper-left off a height field."""
    gy, gx = np.gradient(height.astype(np.float32))
    return np.clip(0.5 + (gx * -1.0 - gy * 1.0) * strength * 26, 0, 1)

# ---------------------------------------------------------------- leather
# A book nobody has opened in thirty years: rubbed corners, a scuffed spine
# edge, water staining, and a grain that has cracked into plates.
W, H = 900, 1260
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
nx, ny = xx / W, yy / H

base  = fbm(W, H, 7, seed=11)
grain = fbm(W, H, 9, seed=12, persistence=.74)
plate = fbm(W, H, 3, seed=13, persistence=.5)          # big leathery plates
crack = fbm(W, H, 8, seed=14, persistence=.82)

height = base * .28 + grain * .40 + plate * .22 + crack * .10
height = (height - height.min()) / (height.max() - height.min())

# crazing: where the crack field is near a threshold, cut a fine valley
craze = np.exp(-((crack - .5) ** 2) / (2 * 0.012 ** 2))
height -= craze * .22

smooth = np.array(Image.fromarray(np.clip(height * 255, 0, 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(.7)), np.float32) / 255
shade = emboss(smooth, 1.15)

deep = np.array([56, 32, 24], np.float32)              # the creases
mid  = np.array([124, 74, 50], np.float32)             # sun-faded oxblood
worn = np.array([190, 152, 112], np.float32)           # rubbed back to the hide

col = deep[None, None, :] + (mid - deep)[None, None, :] * (shade[:, :, None] * .72 + height[:, :, None] * .70)

# --- wear: edges and corners rub first -----------------------------------
edge_d = np.minimum(np.minimum(nx, 1 - nx) * (W / H), np.minimum(ny, 1 - ny))
edge_w = np.clip(1 - edge_d / .055, 0, 1) ** 1.0
corner = np.clip(1 - (np.minimum(nx, 1 - nx) * (W / H) + np.minimum(ny, 1 - ny)) / .17, 0, 1) ** 1.05
# blotchy, so some of the edge survives and some is worn through
patch = fbm(W, H, 6, seed=15, persistence=.7)
patch = np.clip((patch - .40) * 3.4, 0, 1)
rub = np.clip(edge_w * 1.15 + corner * 1.15, 0, 1) * (.3 + 1.0 * patch)
rub = np.clip(rub, 0, 1)
col = col * (1 - rub[:, :, None] * .92) + worn[None, None, :] * rub[:, :, None] * .92
col += (rub * shade * 34)[:, :, None]                  # rubbed leather catches light

# --- scuffs and scratches -------------------------------------------------
rng = np.random.default_rng(101)
scr = Image.new('L', (W, H), 0); ds = ImageDraw.Draw(scr)
for _ in range(150):
    x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
    ang = rng.uniform(-.5, .5) + (0 if rng.random() < .5 else 1.5708)
    ln = rng.uniform(30, 300)
    ds.line([x0, y0, x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln],
            fill=int(rng.uniform(60, 190)), width=int(rng.uniform(1, 4)))
scr = np.array(scr.filter(ImageFilter.GaussianBlur(.9)), np.float32) / 255
col = col * (1 - scr[:, :, None] * .62) + worn[None, None, :] * scr[:, :, None] * .62

# --- staining -------------------------------------------------------------
stain = fbm(W, H, 4, seed=16, persistence=.6)
stain = np.clip((stain - .52) * 4.2, 0, 1) * .5
col = col * (1 - stain[:, :, None] * .38) + np.array([96, 62, 38], np.float32)[None, None, :] * stain[:, :, None] * .38

# a hand-worn patina toward the middle where it gets held
hold = np.exp(-(((nx - .55) / .40) ** 2 + ((ny - .5) / .46) ** 2))
col *= (1 - hold[:, :, None] * .07)

col *= np.clip(1 - (np.sqrt(((xx - W / 2) / (W * 1.05)) ** 2 + ((yy - H / 2) / (H * 1.08)) ** 2) ** 3.6) * .10, .86, 1)[:, :, None]
# grime sits in the low points of the grain — that is what makes a battered
# book look dirty rather than merely dark
grime = np.clip(1 - smooth, 0, 1) ** 2.2
grime *= .35 + .85 * fbm(W, H, 5, seed=18)
col = col * (1 - grime[:, :, None] * .34) + np.array([58, 44, 30], np.float32)[None, None, :] * grime[:, :, None] * .34

bleach = fbm(W, H, 4, seed=17, persistence=.62)
col = col * (0.86 + 0.30 * bleach[:, :, None])          # unevenly faded by light
Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save('public/assets/tome/leather.jpg', quality=88, optimize=True)
print('leather')

# ------------------------------------------------- worn gilt: a wear mask
W2, H2 = 700, 700
m = fbm(W2, H2, 7, seed=31, persistence=.68)
m2 = fbm(W2, H2, 9, seed=32, persistence=.8)
mask = np.clip((m * .55 + m2 * .45 - .18) * 2.6, 0, 1) ** .7
mask = np.clip(mask * 1.25, 0, 1)
Image.fromarray((mask * 255).astype(np.uint8), 'L').convert('LA').save('public/assets/tome/wear.png', optimize=True)
print('wear mask')

# ------------------------------------------------------------------ page
W, H = 1000, 1300
grain = fbm(W, H, 7, seed=21, persistence=.62)
fibre = fbm(W, H, 8, seed=22, persistence=.78)
tint = np.array([243, 233, 213], np.float32)
dark = np.array([214, 196, 166], np.float32)
t = np.clip(grain * .6 + fibre * .4, 0, 1)
page = dark[None, None, :] + (tint - dark)[None, None, :] * (0.55 + t * 0.62)[:, :, None]
# foxing — the little rust-coloured age spots
rng = np.random.default_rng(31)
spots = Image.new('L', (W, H), 0); ds = ImageDraw.Draw(spots)
for _ in range(64):
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    rr = rng.uniform(3, 15) * (1 + rng.random() ** 4 * 2)
    ds.ellipse([x - rr, y - rr * .8, x + rr, y + rr * .8], fill=int(rng.uniform(20, 70)))
spots = np.array(spots.filter(ImageFilter.GaussianBlur(4)), np.float32) / 255
page = page * (1 - spots[:, :, None] * .42) + np.array([164, 128, 82], np.float32)[None, None, :] * spots[:, :, None] * .42
# edges age faster than the middle
yy2, xx2 = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx2 - W / 2) / (W * .70)) ** 2 + ((yy2 - H / 2) / (H * .74)) ** 2)
page *= np.clip(1 - (r ** 3.2) * .30, .62, 1)[:, :, None]
Image.fromarray(np.clip(page, 0, 255).astype(np.uint8)).save('public/assets/tome/page.jpg', quality=88, optimize=True)
print('page')


# ------------------------------------------------- settled dust on the cover
W3, H3 = 700, 980
film = fbm(W3, H3, 6, seed=41, persistence=.6)
fine = fbm(W3, H3, 9, seed=42, persistence=.82)
yy3, xx3 = np.mgrid[0:H3, 0:W3]
nx3, ny3 = xx3 / W3, yy3 / H3

# dust gathers at the edges and along the top, and in a few settled patches
edge = np.clip(1 - np.minimum(np.minimum(nx3, 1 - nx3) * (W3 / H3), np.minimum(ny3, 1 - ny3)) / .16, 0, 1) ** 1.4
top = np.clip(1 - ny3 / .45, 0, 1) ** 1.6
patches = np.clip((fbm(W3, H3, 3, seed=43) - .45) * 3.2, 0, 1)

a = (0.30 * edge + 0.16 * top + 0.34 * patches + 0.22 * film) * (0.45 + 0.75 * fine)
a = np.clip(a, 0, 1) ** 1.25 * 0.62

rng3 = np.random.default_rng(44)
speck = (rng3.random((H3, W3)) > 0.9975).astype(np.float32)
speck = np.array(Image.fromarray((speck * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
a = np.clip(a + speck * 0.5, 0, 1)

tint = np.dstack([np.full((H3, W3), 214.), np.full((H3, W3), 202.), np.full((H3, W3), 178.)])
Image.fromarray(np.dstack([tint, a * 255]).astype(np.uint8), 'RGBA').save('public/assets/tome/cover-dust.png', optimize=True)
print('cover dust')
