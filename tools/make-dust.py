#!/usr/bin/env python3
"""Dust puff sprites.

Dots don't read as dust at any size — real dust is a volume, so the standard
trick is billboard sprites: a handful of irregular soft alpha clouds that get
scaled, rotated and faded. These are built from fractal noise shaped by a
radial falloff, with the edges eaten away so they end in wisps rather than a
circle.

    python3 tools/make-dust.py
"""
import numpy as np, os
from PIL import Image, ImageFilter

os.makedirs('public/assets/tome', exist_ok=True)
S = 256

def fbm(seed, octaves=7, persistence=0.58):
    rng = np.random.default_rng(seed)
    out = np.zeros((S, S), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = 2 ** (o + 1)
        g = rng.random((n, n)).astype(np.float32)
        layer = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC), np.float32) / 255
        out += layer * amp; tot += amp; amp *= persistence
    out /= tot
    return (out - out.min()) / (out.max() - out.min())

def puff(seed, wisp=1.0, density=1.0):
    n1 = fbm(seed)
    n2 = fbm(seed + 977, octaves=8, persistence=0.72)

    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = (x - S / 2) / (S / 2), (y - S / 2) / (S / 2)

    # warp the radius with noise so the silhouette is lumpy, not round
    warp = (n1 - 0.5) * 0.85 * wisp
    r = np.sqrt(dx * dx + dy * dy) * 0.78 * (1.0 + warp)

    body = np.clip(1.0 - r, 0, 1) ** 1.15
    body *= (0.48 + 0.80 * n2) * density            # eat holes through it
    body = np.clip(body * 1.9, 0, 1)

    a = Image.fromarray((body * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(S * 0.022))
    a = np.array(a, np.float32) / 255
    a *= np.clip(1.0 - np.sqrt(dx * dx + dy * dy) ** 2.4, 0, 1)   # nothing at the frame edge
    a = np.clip(a * 1.35, 0, 1)

    # a faint internal shading so the puff has some form to it
    lit = np.clip(0.62 + (n1 - 0.5) * 0.85, 0, 1)
    rgb = np.dstack([
        146 + 58 * lit,
        126 + 56 * lit,
         96 + 54 * lit,
    ])
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')

for i, (seed, wisp, dens) in enumerate([(3, 1.0, 1.0), (17, 1.25, 0.9), (41, 0.85, 1.1), (73, 1.4, 0.8)]):
    p = puff(seed, wisp, dens)
    p.save(f'public/assets/tome/dust-{i + 1}.png', optimize=True)
    print('dust-%d' % (i + 1))
