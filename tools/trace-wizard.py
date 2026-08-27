#!/usr/bin/env python3
"""Trace the wizard's silhouette out of the hall artwork.

The wizard's hover glow is a drop-shadow on his clipped element, so the glow
is only as good as the clip. This traces his actual outline from
portal-hall.png and prints the normalized polygon for #clip-wizard in
index.html.

The element box (left/top/width/height percentages of .wizard in site.css)
is duplicated in BOX below — if you move or resize the element, update BOX
and re-run, and remember the background-size/position formula in CLAUDE.md.

The keep-region polygons are the one hand-tuned part: a generous fence
around the wizard's body and a band along the staff, to stop the trace
absorbing the wall rubble behind the staff and the seam lines above the hat.
They are fences, not the trace itself — the ink does the tracing.

    python3 tools/trace-wizard.py            # prints the polygon points
Needs numpy, scipy, scikit-image, pillow.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure

BOX = (0.285, 0.46, 0.16, 0.25)          # .wizard left/top/width/height
PAPER = np.array([233, 218, 201], float)  # #e9dac9
INK_DIST = 55                             # how much darker than paper counts as drawing

# fences, in element-box coordinates
BODY = [(0.00, 0.30), (0.10, 0.14), (0.22, 0.06), (0.30, 0.00), (0.52, 0.00),
        (0.62, 0.10), (0.70, 0.22), (0.74, 0.40), (0.78, 0.60), (0.82, 0.80),
        (0.84, 1.00), (0.00, 1.00)]
STAFF = [(0.625, 0.68), (0.745, 0.00), (0.875, 0.00), (0.755, 0.68)]


def main():
    img = Image.open('public/assets/portal-hall.png').convert('RGBA')
    W, H = img.size
    lf, tp, wf, hf = BOX
    x0, y0 = int(lf * W), int(tp * H)
    x1, y1 = int((lf + wf) * W) + 1, int((tp + hf) * H) + 1
    a = np.asarray(img.crop((x0, y0, x1, y1))).astype(float)
    h, w = a.shape[:2]

    dist = np.sqrt(((a[..., :3] - PAPER) ** 2).mean(axis=2))
    ink = (dist > INK_DIST) & (a[..., 3] > 200)

    keep_im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(keep_im)
    for poly in (BODY, STAFF):
        d.polygon([(p[0] * w, p[1] * h) for p in poly], fill=255)
    keep = np.asarray(keep_im) > 0

    m = ndimage.binary_closing(ink & keep, structure=np.ones((5, 5)))
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    main_c = lab == (np.argmax(sizes) + 1)
    main_c = ndimage.binary_fill_holes(main_c)
    main_c = ndimage.median_filter(main_c, size=5)

    # the wall seam above the hat survives as a thin spike; an opening pass
    # confined to the hat's airspace (left of the staff) shaves it without
    # touching the staff, which is legitimately thin
    top = np.zeros_like(main_c)
    top[: int(h * 0.14), : int(w * 0.62)] = True
    opened = ndimage.binary_opening(main_c, structure=np.ones((7, 7)))
    main_c = np.where(top, opened & main_c, main_c)

    # trace at 2x for a smoother line, then simplify gently
    big = ndimage.zoom(main_c.astype(float), 2, order=1) > 0.5
    cont = max(measure.find_contours(big.astype(float), 0.5), key=len)
    poly = measure.approximate_polygon(cont, tolerance=2.0)
    pts = [(min(1, max(0, c / 2 / w)), min(1, max(0, r / 2 / h))) for r, c in poly]
    print(' '.join(f'{x:.4f},{y:.4f}' for x, y in pts))


if __name__ == '__main__':
    main()
