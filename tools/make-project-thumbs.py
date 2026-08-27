"""Card thumbnails for the projects pages, from the projects' own graphics.

The chosen treatment is **light float** (picked from three lab rounds,
2026-08-20): the real rendered chart -- title, axes, its own colors, a
genuine preview of the page -- warmed so white becomes soft paper, set on a
rounded panel, gently rotated, floating with a soft shadow over an airy
ambient wash of the chart's own colors. Every card previews real content;
the staging carries the energy.

The fourteen forecasting dashboards are self-contained R Markdown pages with
their ggplot charts embedded as base64 PNGs, so the real graphic is pulled
straight out of the page -- no browser, no screenshot. Cards for projects
with no capturable graphic get the same staging around what identity they
have: Herder's real wordmark, a drawn bracket for March Madness, the park
guides' actual first pages.

Usage:
    python tools/make-project-thumbs.py            # fetch live pages
    python tools/make-project-thumbs.py --from-dir CACHE_DIR

--from-dir points at a directory of already-downloaded <page>.html files and
skips the network. Writes public/assets/cards/fd-<slug>.jpg, the composite
forecasting-data.jpg, em-herder.jpg, em-march-madness.jpg, park-guides.jpg.
Guide covers (guide-*-cover.jpg) are made separately with pypdfium2 from the
PDFs in public/guides/ and are inputs here, not outputs.
"""
import argparse, base64, io, os, re, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = 'https://www.ryanbeckauthor.com/forecasting/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'cards')
W, H = 1200, 750
PAPER = (247, 239, 223)

DASHBOARDS = {
    'hpai':           'hpai-depopulations.html',
    'debt-limit':     'DebtLimit.html',
    'refugees':       'us-refugee-admissions.html',
    'flu-hosp':       'Flu_Hospitalizations.html',
    'flu-weekly':     'FluWeekly.html',
    'covid-weekly':   'COVIDWeekly.html',
    'covid-hosp':     'COVIDHospitalizations.html',
    'admissions':     'Weekly-Hospitalizations.html',
    'faamg':          'FAAMG_Revenues.html',
    'semis':          'INFER_Trade_Data.html',
    'evictions':      'New-York-Evictions.html',
    'va-vax':         'Virginia_Vaccinations.html',
    'vax-ratios':     'VDH-Vaccine-Output.html',
    'vax-age':        'VDH_Age_Data.html',
}
COMPOSITE = ['hpai', 'debt-limit', 'faamg', 'covid-weekly']


# ------------------------------------------------------------------ source

def fetch(page, from_dir):
    if from_dir:
        with io.open(os.path.join(from_dir, page), encoding='utf-8', errors='replace') as f:
            return f.read()
    with urllib.request.urlopen(BASE + page, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def biggest_png(html):
    best = None
    for b64 in re.findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)', html):
        try:
            im = Image.open(io.BytesIO(base64.b64decode(b64)))
            im.load()
        except Exception:
            continue
        if best is None or im.size[0] * im.size[1] > best.size[0] * best.size[1]:
            best = im
    return best and best.convert('RGB')


def dense_span(mass, keep=0.94):
    """The contiguous span holding `keep` of the mass -- drops a sparse
    legend column without knowing what a legend is."""
    total = mass.sum()
    if total == 0:
        return 0, len(mass)
    lo, hi = 0, len(mass)
    while total > 0 and (mass[lo:hi].sum() - min(mass[lo], mass[hi - 1])) / total > keep:
        if mass[lo] <= mass[hi - 1]:
            lo += 1
        else:
            hi -= 1
    return lo, hi


def crop_chart(a):
    """Trim the chart to its content (keeping title and axes -- the card is
    a preview, not an abstraction), lightly biased toward the colored ink."""
    sat = a.max(axis=2) - a.min(axis=2)
    col = (sat > 0.10) & (a.max(axis=2) > 0.25)
    if col.sum() < 500:
        col = a.mean(axis=2) < 0.85
    x0, x1 = dense_span(col.sum(axis=0))
    y0, y1 = dense_span(col.sum(axis=1))
    h, w = a.shape[:2]
    px, py = int((x1 - x0) * .10), int((y1 - y0) * .14)
    x0, x1 = max(0, x0 - px), min(w, x1 + px)
    y0, y1 = max(0, y0 - py), min(h, y1 + py)
    return a[y0:y1, x0:x1]


# ------------------------------------------------------------------ float

def warm(chart):
    """White -> soft paper; everything else keeps itself."""
    a = np.asarray(chart).astype(float) / 255
    a = a * (np.array(PAPER) / 255)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1],
                                           radius=radius, fill=255)
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def ambient_bg(source, blur=90):
    """The source image's own colors smeared into an airy full-bleed wash."""
    bg = source.resize((W, H)).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(bg).astype(float) / 255
    sat = a.max(axis=2, keepdims=True) - a.min(axis=2, keepdims=True)
    mean = a.mean(axis=2, keepdims=True)
    a = mean + (a - mean) * (1.9 + sat * 2)
    a = np.clip(a, 0, 1) * .45 + .55
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def shadow_of(panel, blur, alpha):
    sh = Image.new('RGBA', panel.size, (0, 0, 0, 0))
    sh.putalpha(panel.split()[3].point(lambda v: int(v / 255 * alpha)))
    return sh.filter(ImageFilter.GaussianBlur(blur))


def paste_panel(bg, panel, xy, shadow_dxy=(14, 22), blur=18, alpha=120):
    bg.alpha_composite(shadow_of(panel, blur, alpha), (xy[0] + shadow_dxy[0], xy[1] + shadow_dxy[1]))
    bg.alpha_composite(panel, xy)
    return bg


def float_card(panel_src, ambient_src=None, rot=-3.5, width=.80, radius=22):
    """The treatment: a rounded panel, gently rotated, floating on an airy
    wash of the ambient source's colors (the panel itself by default)."""
    bg = ambient_bg(ambient_src or panel_src).convert('RGBA')
    pw = int(W * width)
    ph = int(pw * panel_src.size[1] / panel_src.size[0])
    max_h = int(H * .86)
    if ph > max_h:
        ph = max_h
        pw = int(ph * panel_src.size[0] / panel_src.size[1])
    panel = rounded(panel_src.resize((pw, ph), Image.LANCZOS), radius)
    if rot:
        panel = panel.rotate(rot, expand=True, resample=Image.BICUBIC)
    return paste_panel(bg, panel, ((W - panel.size[0]) // 2, (H - panel.size[1]) // 2)).convert('RGB')


# ------------------------------------------------------------------ cards

def dashboard_card(html):
    src = biggest_png(html)
    if src is None:
        return None
    chart = Image.fromarray((np.clip(crop_chart(np.asarray(src).astype(float) / 255), 0, 1) * 255)
                            .astype(np.uint8)) if src.mode == 'RGB' else None
    a = crop_chart(np.asarray(src).astype(float) / 255)
    chart = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return float_card(warm(chart), ambient_src=chart)


def composite_card(charts):
    """Four warmed mini-panels, alternately tilted, floating together on one
    shared wash built from all four charts."""
    mix = Image.new('RGB', (W, H))
    for i, c in enumerate(charts[:4]):
        mix.paste(c.resize((W // 2, H // 2)), ((i % 2) * (W // 2), (i // 2) * (H // 2)))
    bg = ambient_bg(mix).convert('RGBA')
    pw = int(W * .43)
    for i, c in enumerate(charts[:4]):
        ph = int(pw * c.size[1] / c.size[0])
        panel = rounded(warm(c).resize((pw, ph), Image.LANCZOS), 14)
        panel = panel.rotate(-2.5 if i % 2 == 0 else 2.5, expand=True, resample=Image.BICUBIC)
        x = int(W * (.055 if i % 2 == 0 else .52))
        y = int(H * (.06 if i < 2 else .52)) - (8 if i < 2 else 0)
        bg = paste_panel(bg, panel, (x, y), shadow_dxy=(8, 14), blur=14, alpha=100)
    return bg.convert('RGB')


def herder_card(logo_path):
    """Herder's real wordmark on a paper panel, floated. The ambient comes
    from the brand's warm sand tones, not the monochrome logo."""
    logo = Image.open(logo_path).convert('L')
    lw = 900
    lh = int(lw * logo.size[1] / logo.size[0])
    panel = Image.new('RGB', (1100, lh + 220), PAPER)
    ink = 1 - np.asarray(logo.resize((lw, lh), Image.LANCZOS)).astype(float) / 255
    a = np.asarray(panel).astype(float) / 255
    x0, y0 = (1100 - lw) // 2, 110
    ink_col = np.array([58, 44, 30]) / 255
    reg = a[y0:y0 + lh, x0:x0 + lw]
    a[y0:y0 + lh, x0:x0 + lw] = reg * (1 - ink[:, :, None]) + ink_col * ink[:, :, None]
    panel = Image.fromarray((a * 255).astype(np.uint8))
    amb = Image.new('RGB', (60, 40))
    d = ImageDraw.Draw(amb)
    for x in range(60):
        t = x / 59
        d.line([(x, 0), (x, 40)], fill=(int(214 - 40 * t), int(188 - 30 * t), int(142 - 20 * t)))
    return float_card(panel, ambient_src=amb, rot=-3.0, width=.78)


def bracket_card():
    """March Madness: a tournament bracket drawn in warm ink on a paper
    panel, floated on an ember wash. The app is behind Vercel SSO, so its
    identity stands in for a screenshot."""
    pw, ph = 1100, 700
    panel = Image.new('RGB', (pw, ph), PAPER)
    d = ImageDraw.Draw(panel)
    ink, dim = (122, 78, 34), (186, 158, 118)
    for sign, x0 in [(1, 70), (-1, pw - 70)]:
        ys = np.linspace(110, ph - 110, 8)
        cols = [x0, x0 + sign * 110, x0 + sign * 220, x0 + sign * 330]
        cur = list(ys)
        for c in range(3):
            nxt = []
            col = dim if c == 0 else ink
            for i in range(0, len(cur), 2):
                y1, y2 = cur[i], cur[i + 1]
                d.line([(cols[c], y1), (cols[c + 1], y1)], fill=col, width=4)
                d.line([(cols[c], y2), (cols[c + 1], y2)], fill=col, width=4)
                d.line([(cols[c + 1], y1), (cols[c + 1], y2)], fill=col, width=4)
                nxt.append((y1 + y2) / 2)
            cur = nxt
        d.line([(cols[3], cur[0]), (cols[3] + sign * 55, cur[0])], fill=ink, width=5)
    cx, cy, r = pw / 2, ph / 2, 40
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ink, width=4)
    amb = Image.new('RGB', (60, 40))
    da = ImageDraw.Draw(amb)
    for x in range(60):
        t = x / 59
        da.line([(x, 0), (x, 40)], fill=(int(226 - 30 * t), int(150 - 26 * t), int(92 - 24 * t)))
    return float_card(panel, ambient_src=amb, rot=2.8, width=.78)


def guides_card(cover_paths):
    """The guides' real first pages as two tilted sheets, floating together
    on an airy wash of the covers themselves."""
    mix = Image.new('RGB', (W, H), PAPER)
    for i, p in enumerate(cover_paths[:2]):
        mix.paste(Image.open(p).convert('RGB').resize((W // 2, H)), (i * (W // 2), 0))
    bg = ambient_bg(mix).convert('RGBA')
    pw = int(W * .52)
    for i, path in enumerate(cover_paths[:2]):
        pg = Image.open(path).convert('RGB')
        ph = int(pw * pg.size[1] / pg.size[0])
        sheet = Image.new('RGB', (pw + 24, ph + 24), (252, 248, 240))
        sheet.paste(pg.resize((pw, ph), Image.LANCZOS), (12, 12))
        sheet = rounded(sheet, 10).rotate(-4 if i == 0 else 3.2, expand=True, resample=Image.BICUBIC)
        x = int(W * (.04 if i == 0 else .40))
        y = int(H * .10) + (0 if i == 0 else 40)
        bg = paste_panel(bg, sheet, (x, y), shadow_dxy=(10, 16), blur=16, alpha=110)
    return bg.convert('RGB')


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-dir', help='directory of pre-downloaded dashboard pages')
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    charts = {}
    for slug, page in DASHBOARDS.items():
        try:
            src = biggest_png(fetch(page, args.from_dir))
        except Exception as e:
            print('%-14s FAILED: %s' % (slug, e)); continue
        if src is None:
            print('%-14s no embedded PNG found' % slug); continue
        a = crop_chart(np.asarray(src).astype(float) / 255)
        chart = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
        charts[slug] = chart
        path = os.path.join(OUT, 'fd-%s.jpg' % slug)
        float_card(warm(chart), ambient_src=chart).save(path, quality=86, optimize=True, progressive=True)
        print('%-14s -> %s' % (slug, os.path.relpath(path)))

    if all(s in charts for s in COMPOSITE):
        path = os.path.join(OUT, 'forecasting-data.jpg')
        composite_card([charts[s] for s in COMPOSITE]).save(path, quality=86, optimize=True, progressive=True)
        print('composite      -> %s' % os.path.relpath(path))

    HERDER_LOGO = os.path.join(os.path.dirname(__file__), '..', '..',
                               'Herder', 'public', 'herder-logo.png')
    if os.path.exists(HERDER_LOGO):
        path = os.path.join(OUT, 'em-herder.jpg')
        herder_card(HERDER_LOGO).save(path, quality=86, optimize=True, progressive=True)
        print('herder         -> %s' % os.path.relpath(path))

    path = os.path.join(OUT, 'em-march-madness.jpg')
    bracket_card().save(path, quality=86, optimize=True, progressive=True)
    print('march madness  -> %s' % os.path.relpath(path))

    covers = [os.path.join(OUT, 'guide-rmnp-cover.jpg'),
              os.path.join(OUT, 'guide-teton-cover.jpg')]
    if all(os.path.exists(c) for c in covers):
        path = os.path.join(OUT, 'park-guides.jpg')
        guides_card(covers).save(path, quality=86, optimize=True, progressive=True)
        print('park guides    -> %s' % os.path.relpath(path))

    print('%d/%d dashboards captured' % (len(charts), len(DASHBOARDS)))


if __name__ == '__main__':
    main()
