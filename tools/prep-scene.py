"""Prepare a photo for use as a door scene (public/assets/scenes/*.jpg).

A door scene is displayed by `.portal .scene`, which at rest is nearly black
(brightness .07) and at hover is pushed to brightness(1.22) and scaled past
1.46. Two consequences, and this script exists for both:

  1. The frame is 760x912 (0.833) with the subject centred, because the ring
     of fire and the rim shadow eat the edges. Give --focus the point that
     should end up in the middle and it crops around it.

  2. Anything that reads correctly at 1.0 blows out at 1.22. Art is therefore
     pre-darkened, with a soft knee above --knee so speculars roll off instead
     of clipping into a flat plate.

The scale factor is the whole argument, so it is explicit rather than derived:
matching another scene's *mean* is usually wrong. That was the lesson of the
fiction door -- crushing a uniformly lit image to the mean of two dark rooms
made it murky and unrecognisable, when the point of that image was that it is
already familiar from ryanbeckauthor.com. Match highlights, keep the subject
readable, and let scenes differ in overall level.

    python tools/prep-scene.py SRC public/assets/scenes/blog.jpg \
        --scale 0.76 --focus 0.47,0.47

Prints before/after percentiles and what they become at hover exposure.

--fit-subject FRAC is the other mode, for art that is one bright subject on a
plain dark ground. Instead of cropping INTO the picture it pads AROUND it: the
subject is measured, the whole image scaled so it fills FRAC of the door's
hover-visible window, and the result composited onto a canvas of the art's own
background colour. This exists because a door only shows the middle of its
scene -- 56% of the art's height and 50% of its width once the hover zoom is
on -- so a subject that fills its own frame loses its edges exactly when the
door lights up. Padding a dark background is free; cropping a subject is not.
"""
import argparse
from PIL import Image
import numpy as np

W, H = 760, 912


def stats(a):
    lum = a.mean(axis=2)
    return {k: float(v) for k, v in (
        ('mean', lum.mean()), ('p50', np.percentile(lum, 50)),
        ('p95', np.percentile(lum, 95)), ('p99', np.percentile(lum, 99)),
        ('max', lum.max()))}


def show(label, s, hover=False):
    tail = ''
    if hover:
        tail = '   at brightness(1.22): p50 %.0f  p99 %.0f  max %.0f' % (
            min(255, s['p50'] * 1.22), min(255, s['p99'] * 1.22), min(255, s['max'] * 1.22))
    print('%-9s mean %5.1f  p50 %3.0f  p95 %3.0f  p99 %3.0f  max %3.0f%s' % (
        label, s['mean'], s['p50'], s['p95'], s['p99'], s['max'], tail))


def crop_to_frame(im, fx, fy):
    """Crop the largest 760x912-shaped rectangle centred on (fx, fy)."""
    w, h = im.size
    if w / h > W / H:
        cw, ch = int(round(h * W / H)), h
    else:
        cw, ch = w, int(round(w * H / W))
    left = min(max(int(round(fx * w - cw / 2)), 0), w - cw)
    top = min(max(int(round(fy * h - ch / 2)), 0), h - ch)
    return im.crop((left, top, left + cw, top + ch)).resize((W, H), Image.LANCZOS)


def tone(a, scale, knee):
    """Pull the level down, then roll off what is left above the knee.

    tanh past the knee compresses smoothly to an asymptote instead of
    clamping, so a specular highlight stays a highlight at hover exposure
    rather than becoming a hole of flat white.
    """
    x = np.clip(a / 255.0 * scale, 0, 1)
    hi = x > knee
    x[hi] = knee + (1 - knee) * np.tanh((x[hi] - knee) / (1 - knee))
    return np.clip(x * 255.0, 0, 255)


# What the door shows of its scene, from site.css: .scene is `bleed` bigger
# than the opening and scales to `zoom` on hover; the opening is 0.741 wide
# for its height, while the art is 760x912.
DOOR_BLEED, DOOR_ZOOM, DOOR_ASPECT = 1.22, 1.46, 0.741


def visible_fraction(bleed=DOOR_BLEED, zoom=DOOR_ZOOM):
    """(width, height) of the art the door actually shows on hover."""
    vh = 1.0 / (bleed * zoom)
    return vh * (DOOR_ASPECT / (W / H)), vh


def dense_span(mass, keep):
    """Narrowest contiguous span holding `keep` of a 1-D mass distribution."""
    total = mass.sum()
    if total <= 0:
        return 0, len(mass)
    lo, hi = 0, len(mass)
    while hi - lo > 2:
        drop = min(mass[lo], mass[hi - 1])
        if (mass[lo:hi].sum() - drop) / total < keep:
            break
        if mass[lo] <= mass[hi - 1]:
            lo += 1
        else:
            hi -= 1
    return lo, hi


def subject_box(a, keep=0.92):
    """Box holding `keep` of the image's light above the background.

    Deliberately NOT the outermost lit pixel. Art like this scatters faint
    debris and floor glow right out to the frame edge, so a threshold-and-
    bound approach returns almost the whole canvas -- and scaling THAT to fit
    the door window shrinks the actual subject to a speck. Weighting by how
    much light each row and column carries finds the thing you would point at.
    """
    lum = a.mean(axis=2)
    bg = np.percentile(lum, 25)
    light = np.clip(lum - bg, 0, None) ** 2      # square: bright pixels dominate
    x0, x1 = dense_span(light.sum(axis=0), keep)
    y0, y1 = dense_span(light.sum(axis=1), keep)
    return x0, y0, x1, y1


def fit_subject(im, target, focus_y=0.46):
    """Scale so the subject fills `target` of the hover window, then pad with
    the art's own background colour. Centred on the door's optical centre
    (background-position: center 46%), not the geometric middle."""
    a = np.asarray(im).astype(float)
    x0, y0, x1, y1 = subject_box(a)
    sw, sh = x1 - x0, y1 - y0
    vw, vh = visible_fraction()
    scale = min(W * vw * target / sw, H * vh * target / sh)
    new = im.resize((max(1, int(round(im.size[0] * scale))),
                     max(1, int(round(im.size[1] * scale)))), Image.LANCZOS)
    corners = np.concatenate([a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3),
                              a[-24:, :24].reshape(-1, 3), a[-24:, -24:].reshape(-1, 3)])
    bg = tuple(int(round(v)) for v in np.median(corners, axis=0))
    canvas = Image.new('RGB', (W, H), bg)
    cx, cy = (x0 + x1) / 2 * scale, (y0 + y1) / 2 * scale
    canvas.paste(new, (int(round(W / 2 - cx)), int(round(H * focus_y - cy))))
    return canvas, bg


def main():
    p = argparse.ArgumentParser()
    p.add_argument('src')
    p.add_argument('dst')
    p.add_argument('--scale', type=float, default=0.76,
                   help='linear level before the knee (1.0 leaves it alone)')
    p.add_argument('--knee', type=float, default=0.72,
                   help='normalised level above which highlights roll off')
    p.add_argument('--focus', default='0.5,0.5',
                   help='x,y in 0..1 of the point to centre the crop on')
    p.add_argument('--quality', type=int, default=88)
    p.add_argument('--fit-subject', type=float, metavar='FRAC',
                   help='pad instead of cropping: scale so the bright subject '
                        'fills FRAC of the door hover window (try 0.72)')
    args = p.parse_args()

    src = Image.open(args.src).convert('RGB')
    if args.fit_subject:
        im, bg = fit_subject(src, args.fit_subject)
        vw, vh = visible_fraction()
        print('fit-subject: padded onto rgb%s; the door shows %.0f%% x %.0f%% of '
              'this art on hover' % (bg, vw * 100, vh * 100))
    else:
        fx, fy = (float(v) for v in args.focus.split(','))
        im = crop_to_frame(src, fx, fy)

    before = np.asarray(im).astype(float)
    after = tone(before, args.scale, args.knee)

    show('source', stats(before))
    show('scene', stats(after), hover=True)

    Image.fromarray(after.round().astype(np.uint8)).save(
        args.dst, quality=args.quality, optimize=True, progressive=True)
    print('wrote %s  %dx%d' % (args.dst, W, H))


if __name__ == '__main__':
    main()
