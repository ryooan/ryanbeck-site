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
W, H = 900, 1260
base = fbm(W, H, 7, seed=11)
grain = fbm(W, H, 8, seed=12, persistence=.72)
cell = fbm(W, H, 4, seed=13)
height = base * .35 + grain * .5 + cell * .15
height = (height - height.min()) / (height.max() - height.min())
smooth = np.array(Image.fromarray((height * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8)), np.float32) / 255
shade = emboss(smooth, .9)
tone = np.array([74, 40, 33], np.float32)          # oxblood leather
tone2 = np.array([34, 19, 16], np.float32)
col = tone2[None, None, :] + (tone - tone2)[None, None, :] * (shade[:, :, None] * .85 + height[:, :, None] * .45)
# a broad darkening toward the edges, like a well-handled book
yy, xx = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx - W / 2) / (W * .78)) ** 2 + ((yy - H / 2) / (H * .82)) ** 2)
col *= np.clip(1 - (r ** 2.6) * .55, .35, 1)[:, :, None]
Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save('public/assets/tome/leather.jpg', quality=86, optimize=True)
print('leather')

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
