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
height -= craze * .16

smooth = np.array(Image.fromarray(np.clip(height * 255, 0, 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(.7)), np.float32) / 255
shade = emboss(smooth, 1.15)

deep = np.array([26, 13, 11], np.float32)              # near-black in the creases
mid  = np.array([78, 40, 32], np.float32)              # oxblood
worn = np.array([152, 111, 80], np.float32)            # rubbed back to the hide

col = deep[None, None, :] + (mid - deep)[None, None, :] * (shade[:, :, None] * .78 + height[:, :, None] * .55)

# --- wear: edges and corners rub first -----------------------------------
edge_d = np.minimum(np.minimum(nx, 1 - nx) * (W / H), np.minimum(ny, 1 - ny))
edge_w = np.clip(1 - edge_d / .042, 0, 1) ** 1.05
corner = np.clip(1 - (np.minimum(nx, 1 - nx) * (W / H) + np.minimum(ny, 1 - ny)) / .13, 0, 1) ** 1.15
# blotchy, so some of the edge survives and some is worn through
patch = fbm(W, H, 6, seed=15, persistence=.7)
patch = np.clip((patch - .40) * 3.4, 0, 1)
rub = np.clip(edge_w * 1.0 + corner * .95, 0, 1) * (.25 + .95 * patch)
rub = np.clip(rub, 0, 1)
col = col * (1 - rub[:, :, None] * .92) + worn[None, None, :] * rub[:, :, None] * .92
col += (rub * shade * 26)[:, :, None]                  # rubbed leather catches light

# --- scuffs and scratches -------------------------------------------------
rng = np.random.default_rng(101)
scr = Image.new('L', (W, H), 0); ds = ImageDraw.Draw(scr)
for _ in range(70):
    x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
    ang = rng.uniform(-.5, .5) + (0 if rng.random() < .5 else 1.5708)
    ln = rng.uniform(30, 300)
    ds.line([x0, y0, x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln],
            fill=int(rng.uniform(50, 150)), width=int(rng.uniform(1, 3)))
scr = np.array(scr.filter(ImageFilter.GaussianBlur(.9)), np.float32) / 255
col = col * (1 - scr[:, :, None] * .5) + worn[None, None, :] * scr[:, :, None] * .5

# --- staining -------------------------------------------------------------
stain = fbm(W, H, 4, seed=16, persistence=.6)
stain = np.clip((stain - .52) * 4.2, 0, 1) * .5
col = col * (1 - stain[:, :, None] * .45) + np.array([54, 33, 20], np.float32)[None, None, :] * stain[:, :, None] * .45

# a hand-worn patina toward the middle where it gets held
hold = np.exp(-(((nx - .55) / .40) ** 2 + ((ny - .5) / .46) ** 2))
col *= (1 - hold[:, :, None] * .12)

col *= np.clip(1 - (np.sqrt(((xx - W / 2) / (W * .95)) ** 2 + ((yy - H / 2) / (H * .99)) ** 2) ** 3.4) * .16, .74, 1)[:, :, None]
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
