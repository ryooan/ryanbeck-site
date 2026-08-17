# CLAUDE.md

Context for Claude Code working on this repo. Read this before changing anything.

## What this is

Ryan Beck's personal site. Five pages of hand-written HTML, one stylesheet,
three small scripts, and a Cloudflare Worker that exists only to serve `/api/*`.

**There is no build step and no framework, and that is deliberate.** Don't
introduce React, a bundler, or a CSS framework without asking. The whole site
is ~15 KB of CSS and ~4 KB of JS; the constraint is doing real work.

```
public/            everything served to a browser
  index.html       the hall — the landing page, and the interesting one
  projects.html  writing.html  blog.html  404.html
  about.html       the tome — a book you click through
  about-plain.html the same content as an ordinary page
  _headers  _redirects  robots.txt  sitemap.xml  site.webmanifest
  assets/
    portal-hall.webp/.png   the drawing the whole site hangs off
    css/site.css            all styling
    css/tome.css            the book
    tome/                   leather, page stock, gilt wordmark
    js/portal.js            touch behaviour for the doors
    js/tome.js              the book: page turns and dust
    js/substack.js          fetches /api/substack
    js/nav.js               marks the current nav item
    scenes/                 what's behind each door + the fire ring textures
    cards/  covers/         placeholder art
worker/index.js    /api/substack and /api/subscribe. Static files never reach it
tools/             make-fire.py (flames), make-wordmark.py (lettering),
                   make-tome-textures.py (leather + page stock),
                   check-links.mjs (CI)
wrangler.toml      Cloudflare config
```

## Running it

```bash
npm run serve     # static only, python http.server on :8000
npm run dev       # wrangler — use this if you're touching /api
npm run deploy    # pushes to Cloudflare
```

`npm run serve` is enough for anything that isn't the API. The blog page
degrades gracefully when `/api/substack` 404s.

## The landing page

This is the part that will bite you if you change it carelessly.

`portal-hall.png` is a drawing whose **three doorways are fully transparent**. The
rest of it has been flattened onto `#e9dac9` — the paper colour sampled from the
original's own fade zone — and `body.hall-page` uses that exact value, so the
vignette dissolves into the page with no visible edge. **If you re-export the
artwork, flatten it onto that same colour and punch out only the doorways**, or
the seam comes back. `tools/` has no script for this; the recipe is: flood-fill
from the border to find the outside, treat the remaining transparent regions as
the doorways, composite everything else over `#e9dac9`.
The three portals are `<a>` elements sitting *behind* the artwork (`z-index: 2`
vs the image's `3`, and the image is `pointer-events: none`). Each is clipped
to the exact traced outline of its doorway:

```html
<clipPath id="clip-fiction" clipPathUnits="objectBoundingBox">
  <polygon points="0.5031,0.0 0.7267,0.0102 …"/>
</clipPath>
```

Two things follow from that, both load-bearing:

1. **`clipPathUnits="objectBoundingBox"` means the coordinates are 0–1 fractions
   of the element's box**, so the whole thing scales with the viewport. If you
   ever regenerate these, keep them normalised — pixel coordinates will break
   responsiveness.
2. **`clip-path` clips hit-testing too.** Hovering the stone pillar between two
   doors does nothing, which is the entire point. If you replace `clip-path`
   with `mask-image` for any reason, you silently get rectangular hit areas back.

The wizard works the same way (`#clip-wizard`), except his polygon was traced by
hand and his "image" is the artwork itself, re-positioned via
`background-size: 625% 400%; background-position: 33.93% 61.33%` so the same
PNG lines up exactly inside his little box. **If you change `.wizard`'s
`left/top/width/height`, you must recompute those two background values** or he
slides out of register. The formula, where the element is `w`% wide at `l`% from
the left:

```
background-size-x = 100 / (w/100) %          e.g. w=16  -> 625%
background-pos-x  = -l / (w - 100) * 100 %   e.g. l=28.5, w=16 -> 33.93%
```

### The hover effect

Six stacked spans inside each portal, back to front: `.scene`, `.veil`, `.rim`,
`.ember`, `.swirl.b`, `.swirl`. Order matters — `.rim` is a dark inset shadow
and must sit *under* the flames or it mudddies them.

- `.scene` goes from `scale(1)` + `brightness(.07)` to `scale(1.46)` +
  `brightness(1.22)`, then keeps drifting to `1.62` on a 13s alternating loop.
  It's a continuous dolly, not a one-shot zoom — that's what Ryan asked for.
  The scene art itself is pre-brightened with a soft-knee highlight rolloff so
  it doesn't bloom at that exposure; if you swap in new art and it looks blown
  out, that's why.
- `.rim`'s inset shadow *opens outward* as the scene pushes in. That opposition
  is what reads as vertigo. Don't "simplify" it away.
- `.swirl` / `.swirl.b` are two rotating ring-of-fire PNGs (24s forward, 15s
  reverse). They're square elements with `scaleY(1.14)` applied *after* the
  rotation in the transform chain, which is what turns the circular texture
  into a door-shaped ellipse that still rotates cleanly. Reorder those and it
  wobbles.

Sizing rule: the flame texture's hole is 60% of its width, so the element width
that makes the ring hug the frame is roughly `door_width / 0.60` ≈ 170%. Larger
shows more picture but pushes the flames outside the frame where they get
clipped into two orange smudges; smaller closes the ring in over the art. Change
`inner=` in `tools/make-fire.py` and you have to change that percentage too.

### Touch devices

No hover on a phone. `portal.js` cycles which door is awake every 3.6s and a
tap navigates. Below 760px the artwork is also scaled to 152% of the viewport
and its faded edges are allowed to crop, which makes the doors a real tap
target — that only works because the page is the same colour as the paper.

`.hall-nav` is a plain text nav that shows below 760px. It is positioned
**absolutely inside `.hall`, at `bottom: 13%`** — the drawing's rocks run out
around 78% of the frame, so that puts it on clean sand below the wizard. It
used to sit below the artwork in normal flow and got pushed off short screens.
Keep it on the art. **Don't remove it** — it's the accessible path in, not a
fallback.

Everything honours `prefers-reduced-motion`.

## The wordmark

`assets/wordmark.svg` is the RYAN BECK lettering above the artwork and in the
interior topbar. It is **not a font** — the letters on the door lintels are a
carved dwarvish style we don't have a typeface for, so `tools/make-wordmark.py`
builds each glyph from three primitives (a flared stem, a flared arm, a mitred
polyline) and emits SVG paths. `tome/wordmark-gilt.svg` is the same thing in
gold for the book cover.

Two things to know if you touch it:

- Fill is `nonzero`, and every solid loop is wound the same direction while
  counters are wound the opposite way. That's what lets overlapping strokes
  union instead of cancelling. `orient()` enforces it; if you add a glyph and
  it comes out with white notches where strokes cross, that's the winding.
- To change the text: `build('SOME TEXT')`. Only the eight letters in
  RYAN BECK exist in `GLYPHS`. Anything else needs drawing, and the reference
  is the lintel lettering in the artwork itself.

Regenerate with `python3 tools/make-wordmark.py > public/assets/wordmark.svg`.

## The tome (about page)

`about.html` is an experiment: the about content as a dusty book you click
through. `about-plain.html` is the earlier straightforward version, still
linked from the tome's colophon. If the experiment doesn't earn its keep,
swapping the two filenames is the whole rollback.

**Content lives in the HTML, not in JS.** Each page is an
`<article class="page-src">` inside `.tome-fallback`. `tome.js` reads those,
builds the book, and replaces them. If the script never runs — no JS, or
`prefers-reduced-motion` — the articles stay put and you read a perfectly
ordinary document. Add or reorder a page by editing the articles; nothing
else needs to change.

Two pages per leaf on a wide screen, one per leaf on a phone, rebuilt on
crossing the 821px breakpoint.

### The thing that will bite you

`.book` deliberately does **not** have `transform-style: preserve-3d`. It has
`perspective` instead, and each `.leaf` gets its own `preserve-3d` for its two
faces. With `preserve-3d` on the book, the coplanar leaves z-fight and the
compositor paints half of one leaf and half of another — you get the cover on
the right and page three on the left, in the same box. Flat book plus plain
`z-index` composites them like the sheets of paper they are. Don't "fix" the
missing `preserve-3d`.

### Weight, and seeing the turn

The turn is a **keyframe animation, not a transition** (`leaf-fwd` /
`leaf-back`, 1.9s, `linear`). A cubic-bezier can't do what this needs: linger
at the angles where the lifted sheet is worth looking at (roughly 30–70° and
110–150°), hurry through edge-on where there's nothing to see, and still start
and land heavily. The keyframe spacing encodes that — measured trace: 5° at
170ms, 36° at 530ms, 73° at 900ms, 131° at 1400ms, 169° at 1790ms. The sheet
also lifts on `translateZ` through the arc so it comes off the page instead of
pivoting flat in it.

Because it's an animation, `turn()` drives the classes by hand: add
`turn-fwd`, let it run with `fill-mode: forwards`, then strip the class and
call `layout()` to put the leaf in its resting `flipped` state. `layout()`
takes a `skip` argument so the sheet in flight isn't yanked into place
mid-animation. Then `.book` gets a `thump` keyframe.

### Dust

`tools/make-dust.py` generates four irregular puff sprites — fractal noise
shaped by a radial falloff, with holes eaten through it and the silhouette
warped so it ends in wisps rather than a circle. `tome.js` uses them as
**billboards**: each puff spawns small, grows, rotates, drifts and fades.

This replaced a particle system made of dots, which is worth knowing because
the dots looked wrong at every size and density that was tried. Dust is a
volume; a scatter of points reads as static or as confetti no matter how you
tune it. If it ever needs to look denser, add puffs — do not go back to
points. A handful of 1–3px specks ride along on top purely for sparkle.

The emitter runs **continuously through the turn**, not in fixed bursts: each
frame it reads the turning sheet's rotation off its transform matrix, works
out where the free edge of the page currently is, and spawns there. So the
dust comes off the moving edge and follows it, instead of appearing over the
book as a flat overlay. Velocity is biased away from the book's centre, and
growth-over-time is doing double duty — a billboard that scales up reads as
approaching the viewer, which is what sells "off the book" rather than "on
the page".

The canvas is a child of `.tome`, deliberately **not** of the clipped stage,
so dust can leave the book. `edgeFade()` is not optional — without it the
cloud gets sliced in a straight line at the canvas border and the illusion
dies.

Density knobs, all in `tome.js`: `peak` (per-puff alpha, ~0.11–0.26), `burst`
in `emit()`, and the size multiplier in `addPuff`. Tuned so the text stays
readable through the turn.

### Sitting on the page

The book is meant to look like an object on the paper, not an embed. What does
that work, in rough order of importance: `.back-cover` is sized *larger* than
the page block so leather sticks out past the paper on every side and animates
from one board to two when it opens; a tight contact shadow (`.book::before`)
plus a wide soft cast shadow (`.book::after`); a half-degree rotation on
`.tome-stage`, so it looks set down rather than pasted in; enough width margin
that paper shows on both sides; the fore-edge page stacks; and the pages inset
slightly inside the boards. Remove the board overhang and it goes straight back
to looking like a video player.

`fitSheets()` shrinks a page's type until it fits its sheet. The content is
fixed and the book's size isn't, so without it a long page overflows and clips
— which is exactly what makes it look like a broken embed.

## Substack

Substack's RSS feed sends no CORS headers, so a browser can't read it
directly. `assets/js/substack.js` calls `/api/substack` on your own origin and
silently falls back to the hand-written list if that route is missing. The
Worker implements it: fetch, parse, decode entities, cache 30 minutes.

## Conventions

- **CSS**: one file, sectioned with banner comments, custom properties at the
  top. Mobile-first isn't used — the layout is fluid with `clamp()` and there
  are only two real breakpoints (720px, 760px).
- **JS**: no dependencies, no modules, plain IIFEs, `defer`. If a script fails,
  the page must still work.
- **Images**: WebP with a PNG/JPG fallback via `<picture>` or `image-set()`.
  Always set `width`/`height` attributes.
- **Copy**: em dashes and real punctuation, sentence case for headings. Ryan
  writes plainly; don't make it markety.
- **Links**: `tools/check-links.mjs` runs in CI and fails the build on a dead
  internal link. Run it after any rename.

## Deploying

Cloudflare Workers with static assets. Static files are served by the asset
layer and never invoke the Worker, so they're free and unlimited; only `/api/*`
costs anything against the 100k/day free tier.

Needs two GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
`.github/workflows/deploy.yml` deploys on push to `main`.

`public/_redirects` already maps the old ryanbeckauthor.com paths and gives the
pages extensionless URLs. `wrangler.toml` has commented-out blocks for the
custom domain and a Hyperdrive/Neon binding — uncomment when they exist.

## Known placeholders

Everything below is scaffolding waiting for real content. None of it is a bug.

- all six project cards (art, titles, copy, links all invented)
- both book covers and the about-page portrait are generated, not real
- the tome's page copy is a template, marked as such in the text
- the cover portrait is the same generated placeholder
- the newsletter form posts to `/api/subscribe`, which validates the address and
  returns `{ok: true}` without storing it. See the TODO in `worker/index.js` —
  it needs either a Buttondown token or to be repointed at Substack's own
  subscribe page
- the blog page's post lists are hand-written; the Substack half is replaced at
  runtime once `/api/substack` is live

## Reasonable next tasks

1. Wire `/api/subscribe` to a real list, or delete it and point the form at
   Substack.
2. Replace the three door scenes with real artwork (760×912-ish, subject
   centred — the fire ring eats the edges), and put a real photograph on the
   tome's cover.
3. Real project cards. The grid takes any number; the card markup is
   copy-pasteable.
4. Decide on Astro before the site grows past ~8 pages — the shared header is
   currently duplicated in five files, which is fine at five and annoying at
   ten. See HOSTING.md for the reasoning.
