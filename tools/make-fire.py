#!/usr/bin/env python3
"""Regenerate the rotating rings of fire.

    python3 tools/make-fire.py

Writes assets/scenes/fire-a.{png,webp} and fire-b.{png,webp}.

The knobs worth touching:
  inner   how big the hole is, as a fraction of the image (0.60 = hole is
          60% of the texture width). Bigger hole -> the ring sits further out,
          hugging the doorframe.
  band    how thick the flames are.
  tongue  how ragged the flame tips are. 0 = a smooth donut.
  hot     overall brightness.
"""
import numpy as np
from PIL import Image, ImageFilter

S = 900

def angular(seed, harmonics=((1,1.0),(2,.7),(3,.5),(5,.34),(8,.22),(13,.14),(21,.09),(34,.06))):
    r = np.random.default_rng(seed)
    def f(th):
        o = np.zeros_like(th)
        for k, a in harmonics:
            o += a * np.sin(k * th + r.uniform(0, 6.283))
        return o / sum(a for _, a in harmonics)
    return f

def fire_ring(seed, inner, band, tongue, path, hot=1.0, blur=.0045):
    y, x = np.mgrid[0:S, 0:S].astype(np.float32); c = (S - 1) / 2
    dx = (x - c) / (S / 2); dy = (y - c) / (S / 2)
    r = np.sqrt(dx * dx + dy * dy); th = np.arctan2(dy, dx)

    A = angular(seed)(th)
    B = angular(seed + 101, ((7,1.), (11,.7), (17,.5), (29,.34), (47,.2)))(th)
    C = angular(seed + 202, ((23,1.), (41,.6), (67,.35), (97,.2)))(th)

    ie = inner + tongue * .50 * A + tongue * .28 * B + tongue * .13 * C
    oe = inner + band + tongue * 1.3 * A + tongue * .80 * B + tongue * .38 * C

    t = (r - ie) / np.maximum(oe - ie, 1e-4)
    d = np.clip(1 - t, 0, 1) ** 1.15 * np.clip(t * 7, 0, 1)
    d[(r < ie - .02) | (r > oe + .02)] = 0
    d = np.clip(d, 0, 1)
    d *= .55 + .45 * np.clip(.5 + .5 * angular(seed + 303, ((1,1.), (2,.6), (3,.4), (5,.25)))(th), 0, 1)

    heat = np.clip(d * 1.35, 0, 1) * hot
    R  = np.clip(255 * np.clip(heat * 3.0, 0, 1), 0, 255)
    G  = np.clip(255 * np.clip((heat - .26) * 1.45, 0, 1), 0, 255)
    Bc = np.clip(255 * np.clip((heat - .74) * 2.20, 0, 1), 0, 255)
    Al = np.clip(d * 1.65, 0, 1) * 255

    im = Image.fromarray(np.dstack([R, G, Bc, Al]).astype(np.uint8), 'RGBA')
    im = im.filter(ImageFilter.GaussianBlur(S * blur)).resize((640, 640), Image.LANCZOS)
    im.save(path, optimize=True)
    im.save(path.replace('.png', '.webp'), 'WEBP', quality=80, method=6)
    print('wrote', path)

if __name__ == '__main__':
    fire_ring(7,  inner=.600, band=.140, tongue=.075, path='assets/scenes/fire-a.png')
    fire_ring(23, inner=.565, band=.205, tongue=.105, path='assets/scenes/fire-b.png', hot=.95, blur=.008)
