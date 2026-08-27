#!/usr/bin/env python3
"""Draws RYAN BECK in the same carved script as the door lintels.

The letters on the artwork are Latin forms cut in a dwarvish style: even
stroke weight, wedge flares at every stem end, and diamond-shaped bowls
instead of round ones. None of that is a font we have, so the glyphs here
are hand-built from three primitives and emitted as SVG paths.

    python3 tools/make-wordmark.py > public/assets/wordmark.svg
"""
import math, sys

CAP   = 100.0   # cap height; baseline is y=100, cap line is y=0
W     = 13.0    # stroke weight
FLARE = 7.0     # how far a wedge flare juts out past the stem, each side
FH    = 16.0    # how tall the flare taper is

def vstem(cx, y0=0.0, y1=CAP, w=W, top=True, bot=True, f=FLARE, fh=FH):
    """A vertical stem, optionally flared at either end."""
    hw, fw = w / 2, w / 2 + f
    t = fw if top else hw
    b = fw if bot else hw
    return [[(cx - t, y0), (cx + t, y0), (cx + hw, y0 + (fh if top else 0)),
             (cx + hw, y1 - (fh if bot else 0)), (cx + b, y1), (cx - b, y1),
             (cx - hw, y1 - (fh if bot else 0)), (cx - hw, y0 + (fh if top else 0))]]

def hbar(cy, x0, x1, w=W * .88, f=FLARE * .8, fw=13.0, left=False, right=True):
    """A horizontal arm, optionally flared at either end."""
    hw, fh_ = w / 2, w / 2 + f
    l = fh_ if left else hw
    r = fh_ if right else hw
    return [[(x0, cy - l), (x0 + (fw if left else 0), cy - hw),
             (x1 - (fw if right else 0), cy - hw), (x1, cy - r),
             (x1, cy + r), (x1 - (fw if right else 0), cy + hw),
             (x0 + (fw if left else 0), cy + hw), (x0, cy + l)]]

def diag(p0, p1, w=W, f0=0.0, f1=FLARE, fh=FH):
    """A thick diagonal. f0/f1 add a wedge flare to either end."""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L          # unit normal
    ux, uy = dx / L, dy / L           # unit along
    def off(p, n, along=0.0):
        return (p[0] + nx * n + ux * along, p[1] + ny * n + uy * along)
    hw = w / 2
    return [[off(p0, -(hw + f0)), off(p0, hw + f0),
             off(p0, hw, fh) if f0 else off(p0, hw),
             off(p1, hw, -fh) if f1 else off(p1, hw),
             off(p1, hw + f1), off(p1, -(hw + f1)),
             off(p1, -hw, -fh) if f1 else off(p1, -hw),
             off(p0, -hw, fh) if f0 else off(p0, -hw)]]

def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2

def orient(pts, positive=True):
    """Force a loop's winding. Solid shapes all wind one way so that
    overlapping strokes union under fill-rule:nonzero; counters wind the
    other way so they punch holes."""
    return pts if (area(pts) > 0) == positive else list(reversed(pts))

def ring(pts_out, pts_in):
    """An outlined shape: outer loop plus a counter wound the other way."""
    o, i = orient(pts_out, True), orient(pts_in, False)
    _COUNTERS.append(i)
    return [o, i]

def polystroke(pts, w=W, closed=False, f0=0.0, f1=0.0, fh=FH, miter=3.2):
    """A thick polyline with mitred joins — this is how the bowls and the
    angular curves are built. Returns one solid loop (plus a counter when
    the polyline is closed)."""
    hw = w / 2
    n = len(pts)
    def seg_normal(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        return (-dy / L, dx / L), (dx / L, dy / L)
    def side(sign):
        out = []
        for i in range(n):
            p = pts[i]
            prev = pts[i - 1] if (i > 0 or closed) else None
            nxt = pts[(i + 1) % n] if (i < n - 1 or closed) else None
            if prev is None:
                nrm, _ = seg_normal(p, nxt)
                out.append((p[0] + nrm[0] * hw * sign, p[1] + nrm[1] * hw * sign))
            elif nxt is None:
                nrm, _ = seg_normal(prev, p)
                out.append((p[0] + nrm[0] * hw * sign, p[1] + nrm[1] * hw * sign))
            else:
                n1, _ = seg_normal(prev, p)
                n2, _ = seg_normal(p, nxt)
                bx, by = n1[0] + n2[0], n1[1] + n2[1]
                L = math.hypot(bx, by)
                if L < 1e-6:
                    bx, by, L = n1[0], n1[1], 1.0
                bx, by = bx / L, by / L
                cosang = max(0.2, (bx * n1[0] + by * n1[1]))
                m = min(hw / cosang, hw * miter)
                out.append((p[0] + bx * m * sign, p[1] + by * m * sign))
        return out
    left, right = side(1), side(-1)
    if closed:
        o, i = orient(left, True), orient(right, False)
        _COUNTERS.append(i)
        return [o, i]
    loop = left + list(reversed(right))
    if f0 or f1:
        loop = _flare_ends(pts, loop, n, hw, f0, f1, fh)
    return [loop]

def _flare_ends(pts, loop, n, hw, f0, f1, fh):
    """Widen the two free ends of an open polystroke into wedge terminals."""
    out = list(loop)
    def unit(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        return (-dy / L, dx / L), (dx / L, dy / L)
    if f0:
        nrm, along = unit(pts[0], pts[1])
        p = pts[0]
        out[0] = (p[0] + nrm[0] * (hw + f0), p[1] + nrm[1] * (hw + f0))
        out[-1] = (p[0] - nrm[0] * (hw + f0), p[1] - nrm[1] * (hw + f0))
        out.insert(1, (p[0] + nrm[0] * hw + along[0] * fh, p[1] + nrm[1] * hw + along[1] * fh))
        out.insert(len(out), (p[0] - nrm[0] * hw + along[0] * fh, p[1] - nrm[1] * hw + along[1] * fh))
    if f1:
        nrm, along = unit(pts[-2], pts[-1])
        p = pts[-1]
        k = n if not f0 else n + 1
        out[k - 1] = (p[0] + nrm[0] * (hw + f1), p[1] + nrm[1] * (hw + f1))
        out[k] = (p[0] - nrm[0] * (hw + f1), p[1] - nrm[1] * (hw + f1))
        out.insert(k, (p[0] - nrm[0] * hw - along[0] * fh, p[1] - nrm[1] * hw - along[1] * fh))
        out.insert(k, (p[0] + nrm[0] * hw - along[0] * fh, p[1] + nrm[1] * hw - along[1] * fh))
    return out

_COUNTERS = []

def _is_counter(pts):
    return any(pts is c for c in _COUNTERS)

# ----------------------------------------------------------------- glyphs
# Cap height 100. Each glyph returns (list of loops, advance width).
S = 12.0                 # left stem center

def G_R():
    return ([*vstem(S),
             *polystroke([(S, 4), (46, 4), (65, 25), (46, 47), (S, 47)]),
             *diag((37, 45), (62, 100), w=W, f0=0, f1=FLARE)], 72)

def G_Y():
    return ([*diag((6, 2), (33, 46), f0=FLARE, f1=0),
             *diag((60, 2), (33, 46), f0=FLARE, f1=0),
             *vstem(33, 40, 100, top=False)], 66)

def G_A():
    return ([*diag((35, 0), (5, 100), f0=0, f1=FLARE),
             *diag((35, 0), (65, 100), f0=0, f1=FLARE),
             *hbar(70, 13, 57, w=W * .84, left=False, right=False)], 72)

def G_N():
    return ([*vstem(11, w=W * .86), *vstem(59, w=W * .86),
             *diag((11, 3), (59, 97), w=W * .96)], 70)

def G_B():
    return ([*vstem(S),
             *polystroke([(S, 3), (42, 3), (59, 26), (42, 49), (S, 49)]),
             *polystroke([(S, 51), (45, 51), (63, 74), (45, 97), (S, 97)])], 70)

def G_E():
    return ([*vstem(S),
             *hbar(8, S - 6, 58, left=False, right=True),
             *hbar(50, S - 6, 46, w=W * .84, left=False, right=True, fw=10),
             *hbar(92, S - 6, 60, left=False, right=True)], 66)

def G_C():
    # plain terminals — the wedge-flare code fights the mitre at a free end
    return (polystroke([(58, 14), (33, 2), (5, 33), (5, 67), (33, 98), (58, 86)]), 66)

def G_K():
    return ([*vstem(S),
             *diag((58, 2), (17, 52), f0=FLARE, f1=0),
             *diag((22, 47), (61, 100), f0=0, f1=FLARE)], 64)

GLYPHS = {'R': G_R, 'Y': G_Y, 'A': G_A, 'N': G_N, 'B': G_B, 'E': G_E, 'C': G_C, 'K': G_K}

def diamond(cx, cy, w, h, t):
    """The ◆ ornament that bookends each lintel."""
    out = [(cx, cy - h), (cx + w, cy), (cx, cy + h), (cx - w, cy)]
    inn = [(cx, cy - h + t * 1.7), (cx + w - t, cy), (cx, cy + h - t * 1.7), (cx - w + t, cy)]
    pip = [(cx, cy - h * .34), (cx + w * .26, cy), (cx, cy + h * .34), (cx - w * .26, cy)]
    return ring(out, inn) + [pip]

def path_d(loops):
    out = []
    for pts in loops:
        out.append('M' + ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts) + 'Z')
    return ''.join(out)

def build(text='RYAN BECK', tracking=15.0, space=34.0):
    loops, x = [], 0.0
    for ch in text:
        if ch == ' ':
            x += space
            continue
        parts, adv = GLYPHS[ch]()
        for p in parts:
            shifted = [(px + x, py) for px, py in p]
            # ring() already fixed its own winding; everything else is solid
            loops.append(shifted if _is_counter(p) else orient(shifted, True))
        x += adv + tracking
    width = x - tracking

    orn_w, gap = 15.0, 34.0
    loops = ([(px + orn_w * 2 + gap, py) for px, py in p] for p in loops)
    loops = list(loops)
    total = width + (orn_w * 2 + gap) * 2
    for dm in (diamond(orn_w, 50, orn_w, 27, 5.5), diamond(total - orn_w, 50, orn_w, 27, 5.5)):
        loops += [p if _is_counter(p) else orient(p, True) for p in dm]

    pad = 6
    vb = f'{-pad} {-pad} {total + pad * 2} {CAP + pad * 2}'
    d = path_d(loops)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{text}">
  <title>{text}</title>
  <g fill-rule="nonzero">
    <path d="{d}" transform="translate(0,2.4)" fill="#8d7a62" opacity=".45"/>
    <path d="{d}" fill="#33281c"/>
  </g>
</svg>
'''

if __name__ == '__main__':
    sys.stdout.write(build())
