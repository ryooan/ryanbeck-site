# Ryan Beck — personal site

*New here? Read `HANDOFF.md` first.*

A static site with no build step and no framework. `public/` is what ships:
edit a file, reload, done. The only dependency is wrangler, for serving
`/api/*` locally and for deploying.

## Run it locally

```bash
npm install
npm run dev       # -> http://localhost:8787   the real thing
npm test          # check-links + check-docs
```

Use `npm run dev`. Wrangler serves the pages, `/api/*`, `_redirects` and
`_headers` exactly as production does. There is also `npm run serve` (a plain
python file server on :8000), but it ignores `_redirects`, so every pretty
URL — `/about`, `/projects` — 404s and only the `.html` spellings work. It's
for poking at one page's CSS, nothing more.

(You need a server rather than double-clicking the file, because the pages
load assets by path.)

## What's here

```
public/               everything that gets served
  index.html          the hall — the three doors + the wizard
  projects.html       card grid: Forecasting Data + featured apps
  forecasting/        GENERATED — the dashboard. index.html plus one page
                      per subject at /forecasting/<slug>, each with a shared
                      sidebar, its own context and its charts. Rebuild with
                      tools/forecasting/build_page.py; do not hand-edit
  writing.html        fiction / author page
  blog.html           Substack feed + older archive
  about.html          the book
  about-plain.html    the same content as an ordinary page
  compare.html        experiment: hand-built book vs libraries (noindex)
  dust-lab.html       experiment: four dust engines (noindex)
  404.html
  _headers            caching + security headers
  _redirects          old ryanbeckauthor.com paths, extensionless URLs
  robots.txt  sitemap.xml  site.webmanifest  favicon.ico

  assets/
  portal-hall.webp    the drawing (webp) + .png fallback. Flattened onto
                      #e9dac9 with only the doorways punched out, which is
                      why it blends into the page with no visible edge
  css/site.css        all styling except the book
  css/plot.css        the forecasting charts
  js/plot.js          the chart module — no dependencies, ~21 KB
  data/forecasting/   committed CSV: one file per series, plus manifest.json
                      and archive/ (124 files rescued from old R workspaces)
  css/tome-lib.css    the book that ships
  css/tome.css        shared book furniture (about.html needs it) AND the
                      hand-built book's geometry (compare.html only) — see
                      the warning in CLAUDE.md before deleting it
  wordmark.svg        RYAN BECK, drawn to match the carved door lintels
  js/portal.js        the doors: wake cycle, long-press, preloading
  js/tome-lib.js      the book that ships (StPageFlip)
  js/book-dust.js     the dust engines
  js/tome.js          the hand-built book (compare.html only)
  js/substack.js      pulls live posts from /api/substack
  js/nav.js           highlights the current nav item
  vendor/             StPageFlip + tsParticles bundle, built in libtome/
  tome/               leather, page stock, dust sprites, gilt wordmark
  scenes/             what you see through each door
    projects.jpg  fiction.jpg  blog.jpg     <- swap these for real art
    fire-a.webp   fire-b.webp               <- the rotating ring of fire
  cards/card-1..6.jpg  project card art     <- swap these
  covers/              book covers + portrait <- swap these
  og.jpg               social card
worker/index.js       /api/substack and /api/subscribe
tools/                make-fire.py, make-wordmark.py,
                      make-tome-textures.py, make-dust.py,
                      trace-wizard.py,
                      check-links.mjs, check-docs.mjs
wrangler.toml         Cloudflare config
AGENTS.md             workspace adapter (this repo lives in AI Wiki and Projects)
CLAUDE.md             architecture notes and every trap found the hard way
HOSTING.md            where to deploy it and why
```

## The forecasting data

`public/forecasting/` is generated, not written. Small Python
fetchers pull each source, write tidy CSV into `public/data/forecasting/`, and
record the last date *in the data* into `manifest.json`; the page builder
turns that into the status line on each chart.

```bash
cd tools/forecasting
python fetch_debt_limit.py      # live: debt_limit flusight hpai
                                #       refugees semiconductors faamg
python fetch_covid_truth.py     # historical, run once: covid_truth
                                #   covid_hospitalizations va_vaccinations
                                #   vdh_age
python build_page.py            # regenerate the page
```

Six of the ten fetchers run on a schedule. The other four pull series whose
sources are frozen; they are one-time rescues and are deliberately not on any
cron, since re-running them re-downloads tens of megabytes to write an
identical file.

The split matters. These series used to be R Markdown documents that fetched,
analysed, plotted and published in one step, which meant a dead source took
the whole page with it and no data was ever kept. Now a source dying costs
nothing but future rows, and the page can say so: `hpai-depopulations`
currently reads **"Source stalled · data to 9 June 2025"**, because the CDC
mirror it depends on stopped updating fourteen months ago while its job kept
succeeding.

The retired series are kept rather than deleted, under a "No longer updating"
heading, frozen at the date their source stopped. One is genuinely absent: the
New York evictions data is gone and no copy survived, and the page says so
instead of showing an empty frame.

`.github/workflows/forecasting.yml` runs the fetchers on a cadence matched to
each source (Treasury daily, flu weekly, Comtrade monthly, SEC quarterly) and
commits the result — which is also a deploy.

Charts are `assets/js/plot.js`, written rather than imported. Every dashboard
here died of dependency rot, so adding a chart library to the rebuild would
reproduce the failure being fixed. It renders SVG, breaks the line at missing
values instead of interpolating, and is keyboard-navigable.

## How the doors work

The drawing is a PNG whose three doorways are **fully transparent**. I traced
the exact outline of each opening and turned it into an SVG `clipPath`
(`clip-path: url(#clip-projects)` and friends, in `index.html`). Each portal
is a `<a>` sitting *behind* the artwork, clipped to that shape, so:

- the scene only ever shows through the door opening, never around it
- the clip also clips the click target, so hovering the stone wall does nothing

Inside each portal, stacked back to front:

| layer | what it does |
|---|---|
| `.scene` | the image beyond the door. Dark and blurred at rest; on hover it brightens and pushes from `scale(1.17)` to `scale(1.30)` — a slow continuous dolly, not a one-shot zoom |
| `.veil` | the darkness. Fades from ~1 to 0.1 |
| `.rim` | an inner shadow that opens outward as the scene pushes in — this is what sells the vertigo |
| `.ember` | a faint pulse so a sleeping door doesn't look dead |
| `.swirl` ×2 | two counter-rotating rings of fire, 24s and 15s, one sharp and one blurred |

Everything is CSS. No canvas, no WebGL, no animation library.

### Swapping the scene behind a door

One line in `index.html`:

```html
<span class="scene" style="background-image:url(&quot;assets/scenes/fiction.jpg&quot;)"></span>
```

Portrait images around 760×912 work best — the doorway is roughly 5:6. Put the
thing you want people to notice dead centre; the ring of fire eats the edges.

### Retuning the effect

All in `assets/css/site.css` under `/* --- a doorway --- */`:

- **zoom depth** — `.portal:is(:hover,…) .scene { transform: scale(1.17) }` and the `portal-drift` keyframes
- **how dark at rest** — `.portal .scene { filter: brightness(.07) }` and `.portal .veil`
- **fire speed** — the `fire-spin` / `fire-spin-r` durations
- **fire size** — `.swirl { width: 164% }` and `.swirl.b { width: 184% }`. Bigger = the ring hugs the frame more tightly; smaller = it closes in around the centre of the image

The fire rings are generated PNGs, not gradients. `tools/make-fire.py` regenerates
them if you want different flames.

### The wake cycle

One door (or the wizard) is always awake: `portal.js` rotates the glow every
3.6s on every device. Hovering anything pauses the rotation; on a phone a
tap wakes what it touched and navigates. A plain text nav also sits on the
artwork's sand at every size — the doors are only ~40px wide on a phone,
which is too small to be the only way in.

Everything respects `prefers-reduced-motion`.

## The wizard

He's part of the drawing, so he can't be a separate image. Instead there's an
`<a>` clipped to a hand-traced polygon of his silhouette (`#clip-wizard`), with
a copy of the artwork as its background positioned to line up exactly. On hover
it gets a warm `drop-shadow`, so he appears to glow. Adjust the polygon in
`index.html` if the hit area feels off.

## Substack

Substack's RSS feed sends no CORS headers, so a browser can't read it directly.
`assets/js/substack.js` calls `/api/substack` on your own origin and silently
falls back to the hand-written list if that route doesn't exist yet. The file
has a ~10 line serverless handler in its header comment — drop it in when you
deploy somewhere that runs functions.

Until then the page shows the static list, which is a fine place to start.

## The about page is a book

`about.html` renders the about content as a book you click through:
[StPageFlip](https://github.com/Nodlik/StPageFlip) for the page turns, and a
canvas dust engine of our own that reads the crease StPageFlip draws and throws
dust off it. `about-plain.html` is the same content as an ordinary page, linked
from the colophon, if you would rather ship that.

Pages are authored as plain `<article>` elements in the HTML — the book is
assembled from them at runtime, so with JS off or reduced motion on you just
read the articles.

Two pages are experiments kept as a record and unlinked from the nav:
`compare.html` (this book beside an earlier hand-built one) and
`dust-lab.html` (four dust engines side by side, with a density slider).
CLAUDE.md says what to delete if you want them gone.

## Things left as placeholders

The 2026-08-18 content pass replaced most of the invented material with Ryan's
own — real books, blurbs, links, nineteen real blog posts, his headshot, and
fourteen real project cards. What is still standing in:

- the project thumbnails (six generated images across fourteen cards) and the
  projects lede, which says in the page that it is a draft to prune
- the forecasting page's intro and the projects lede still want Ryan's voice

- the about-page copy — grounded and no longer self-labelled, but drafted for
  Ryan rather than by him
- the newsletter form posts nowhere

CLAUDE.md → "Known placeholders" has the detail, including which images are
real and must not be regenerated by a `tools/` script.

## Deploying

```bash
npx wrangler login
npm run deploy
```

Or push to `main` — `.github/workflows/deploy.yml` does it, given
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repo secrets.

See HOSTING.md for why Cloudflare, and CLAUDE.md for how the doors actually work.
