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

`about.html` is the about content as a book you click through.
`about-plain.html` is the plain version, linked from the colophon; swapping
those two filenames is the whole rollback.

**The book is StPageFlip** (`page-flip`), chosen over a hand-built CSS 3D
version after a side-by-side — its fold geometry and drag-a-corner beat what
eight rotated slices could manage. The hand-built implementation is still in
the repo (`assets/css/tome.css`, `assets/js/tome.js`) because `compare.html`
shows it; nothing else uses it. Its own notes are kept at the bottom of this
section in case it is ever revived.

**Content lives in the HTML, not in JS.** Each page is an
`<article class="page-src">` inside `.tome-fallback`. `tome-lib.js` reads
those, builds StPageFlip pages from them, and replaces them. If the script
never runs — no JS, or `prefers-reduced-motion` — the articles stay put and
you read a perfectly ordinary document. Add or reorder a page by editing the
articles; nothing else needs to change.

On a phone StPageFlip switches to a single page, which on its own reads as a
floating leaf rather than an open book. `.libtome-verso` is a **blank** page-textured panel
positioned immediately left of the recto, and the boards are stretched to span
both — so the verso and the left board obviously
carry on off the left of the screen. The stage also slides right by 9% once the
book is open, so the spine sits inside the viewport rather than at its edge.
It carries no text on purpose: repeating the page you just read as a cropped
sliver reads as a glitch rather than as a spread.

Two things have to agree with that decision or the seam shows:
`maskLeftPage()` hides any *settled* page StPageFlip leaves rendered left of
the spine mid-turn, and it hides the **text** of the sheet in flight once that
sheet's centre crosses the spine — keeping its paper. So the page lifts with
its words, goes blank as it passes edge-on, and lands matching the verso.
Without the second half, the words sat on the left until StPageFlip hid the
element, then popped out of existence.

The stage's sideways slide is driven from the **predicted** target page at
`changeState`, not from the `flip` event. Driven off `flip` it runs after the
cover has finished swinging and the whole book lurches sideways. Portrait-only; the landscape
spread is untouched and the verso is `display:none` there.

`.libtome-book` needs `position:relative; z-index:2`. The verso is `z-index:1`,
and without an explicit z-index on the book, StPageFlip's own
`position:relative` leaves it at `auto` — so the sheet in flight slid *under*
the static verso instead of over it.

Two things learned wiring StPageFlip up:

- `showCover: true` marks the first **and last** pages hard. The last article
  is therefore a real back board; without it the colophon was being rendered
  as leather with text on it. Its visible face is styled as a paste-down
  endpaper rather than exterior leather, since that inner face is the only one
  ever seen. Navigation stops at `pageCount - 2`: the button disables, and
  `.libtome-shield` covers the forward half of the book and swallows pointer
  events in the capture phase so a click or drag cannot start a flip at all.
  An earlier version let the flip run and snapped back afterwards, which plays
  a full animation that ends where it started — it reads as broken.
- It renders a **closed** book as a single page inside a full-width block, so
  anything drawn behind it (our leather boards) has to follow the *visible*
  half, or a closed book looks twice as wide as it is. `sizeBoards()` does it.
- `usePortrait` handles phones by itself, but page type still has to be sized
  to fit — `fitSheets()`. It works from **geometry, not measurement**: pages
  StPageFlip is not currently showing are `display:none` and measure as zero,
  so measuring them silently does nothing and those pages overflow when they
  appear. The base size comes from the block width; visible pages that still
  overrun get nudged down after.

## The dust

`assets/js/book-dust.js` — four interchangeable engines behind one call:

```js
BookDust.attach(bookEl, hostEl, flip, { kind: 'cloud' })
```

`about.html` picks one with `data-dust-kind` on the container — currently
`mist`, which is the chosen one.
`dust-lab.html` runs all four side by side with a density slider, so they can
be compared directly.

All of them are fed the same signal, and this is the part that matters:
StPageFlip draws a `.stf__outerShadow` element **along the crease**, so reading
its box every frame gives the live position and speed of the fold. Dust is born
there. It is not an overlay playing on a timer — that was the flaw in the
tsParticles version, whose emitters fire on flip events and have no idea where
the page actually is.

Hard covers have no crease: StPageFlip swings them as a board, with a
`.stf__hardShadow` and **no clip-path**. `foldReader` detects that case and
uses the edge of the board furthest from the spine, so opening the book raises
dust too. Watch out for one trap — StPageFlip writes `clipPath` as the literal
string `'none'` on a hard page, so a truthiness check calls every cover a soft
fold, finds no outer shadow, and silently emits nothing.

Direction comes from `throwVel()`: a random angle over the full circle with the
rightward component damped to 0.45, and only ~14% of the crease's own velocity
mixed in. Inheriting more than that drags everything sideways and the dust
streams off in a fan instead of billowing.

**Every flip draws a fresh gust** (`makeGust()`) — its own preferred direction,
lean, density, particle size, lifetime and spawn distribution along the page
edge. Without it every turn throws an identical cloud, which is obvious by the
third or fourth page.

**A burst fires the instant a flip starts**, independent of the per-frame
tracking (`burst()`). Hard covers and backward flips move differently and the
tracker can miss their opening frames, so this guarantees that every flip of
any kind — forward, back, cover open, cover close — visibly raises dust. If it
cannot read a fold at all it falls back to the book's own box.

| kind | technique |
|---|---|
| `puffs` | sprite billboards — small, numerous, growing and fading |
| `mist` | a few thousand single pixels advected by a curl-noise flow field, lifting off the whole spread and hanging for seconds — **this is the chosen one, and what the site uses** |
| `both` | puffs for body with mist over it for grain |
| `cloud` | translucent overlapping particles blurred into one mass |
| `smoke` | SVG ellipses through `feTurbulence`, animated outward and discarded |

Density is one number — `AMOUNT`, exposed as `BookDust.setAmount()`. The
per-engine counts are **rebased**: `1.0×` is roughly where the lab slider sat
at 2.2× in the first round, because that is where it was judged to look right.
Puff sprites are deliberately small (3.5–17px); larger ones read as bubbles no
matter how they are faded, which was the first version's problem.

`both` shares one canvas between two engines, so it clears once and passes
`skipClear` to each.

Seventy per cent of each mist emission is launched **along the direction of
travel** (`throwVel(..., follow)`), in a cone rather than a line; the rest
scatters freely.

That direction is taken from the call, not inferred from crease motion:
`attach()` wraps `flip.flipNext` / `flip.flipPrev` to record intent. Inference
does work eventually, but the opening burst fires before the sheet has moved,
so it reads the *previous* turn's direction — which means the first and biggest
puff of every turn goes the wrong way, and it is the puff that sets the
impression. Dragging a corner has no call to intercept, so that path still
falls back to crease motion.

`mist` is deliberately slow and long-lived: about a third of the emission rate
it had, three times the lifetime, and drag raised from 0.986 to 0.9955 per
frame so particles carry well past the book instead of stalling a few dozen
pixels out. Spawn points are spread across the whole book box (`foldReader` reports
`bx0`/`bx1` for that), with only about **16%** biased to the crease band.

That 16% matters more than it looks. What the eye reads is density per unit
width, not the split: the crease band is roughly a tenth of the book's width,
so giving it 45% of the particles made it nine times denser than everywhere
else and the whole effect read as a vertical stripe. Anything much above its
share of the width turns back into a curtain.

The other half of that bug was in `burst()`: its fallback `f` object had no
`bx0`/`bx1`, so when it fired before StPageFlip had rendered a foldable page,
every particle in the burst landed in the narrow crease band — and the burst is
the first thing on screen, so it set the impression for the whole turn.

Performance, in order of what actually mattered (measured, headless, software
rendering — real hardware is better):

1. **`foldReader` must read inline styles, not `getComputedStyle`.** StPageFlip
   writes `display`, `zIndex` and `clipPath` inline, and going through computed
   styles forces a style recalc on every page on every frame. Fixing this alone
   took a cover open from 41 to 56 fps.
2. **The curl field is the hot loop in `mist`** — four noise lookups per
   particle per frame at three thousand particles. Each mote refreshes its flow
   vector every third frame and coasts in between.
3. `fillRect` rather than `arc`, bucketed into eight opacity bands so
   `globalAlpha` is set ~16 times a frame instead of three thousand.
4. Ceilings of 900 puffs / 4800 motes, oldest dropped first.
5. The dust canvas renders at `RES = 0.7` and CSS scales it up. The surface is
   much bigger than the book so the cloud can drift clear of it, which makes
   clearing and filling it the dominant cost; at this softness the resolution
   drop is invisible and it bought back most of what the larger canvas cost.

With all that the dust costs about 1–2 fps. A soft page turn measures ~30 fps
with the dust disabled entirely — that is what StPageFlip's fold rendering
costs on its own, and it is the floor for this book size.

Note on `cloud`: it accumulates with plain `source-over`. An earlier version
used `lighter` plus a `contrast()` filter to fuse the blobs and the book caught
fire — additive blending turns brown dust into flame. Overlapping translucency
plus a blur gets the merge without the glow.

The puff sprites come from `tools/make-dust.py`: fractal noise shaped by a
radial falloff, with holes eaten through it and the silhouette warped so the
edges end in wisps.

## The library comparison (`compare.html`)

`noindex`, not in the nav: the same book built two ways, hand-built on the
left and StPageFlip + tsParticles on the right. Kept as the record of why the
library won. Its right-hand column pins `data-dust-kind="tsparticles"` so it
still demonstrates the library's own particle engine.

The vendor bundle is built in `libtome/` (`npm install && npm run build`) and
lands at `public/assets/vendor/lib-tome.bundle.js` — 233 KB minified, 65 KB
gzipped. `loadSlim()` must run **before** `loadEmittersPlugin()` or tsParticles
throws "Interactivity Plugin is not loaded".

## The hand-built book (retained, unused by the site)

Kept for `compare.html`. If it is ever revived, these are the traps, every one
of them found by breaking it:

- `.book` must **not** have `transform-style: preserve-3d` — with it, the
  coplanar leaves z-fight and the compositor paints half of one and half of
  another. Perspective on the book, `preserve-3d` only on each leaf.
- The turn is a keyframe animation, not a transition: an easing curve cannot
  linger at the angles where the lifted sheet is worth seeing and still hurry
  through edge-on.
- The curl is eight nested slices. All shading must live on `.cwrap` (a full
  page wide, shared origin) — anything painted per slice draws a vertical line
  at every seam.
- **No `filter` anywhere on the turning sheet.** On a slice it flattens
  `preserve-3d`; on the leaf it rasterises the sheet to a bitmap at its
  untransformed size and then 3D-transforms it, which is what made the edge
  look blurry.
- Which face is showing is set explicitly from the rotation angle, because
  backface culling stops being reliable once the subtree is 3D and mirrored.

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
- **Docs**: `tools/check-docs.mjs` also runs in CI. It asserts that the files
  these documents name exist, that the dust engine they claim is live is the
  one wired up, and that the experiment pages really are unlinked and
  `noindex`. If you change one of those things, the build tells you which
  document to update.

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

None of this is a bug. All of it is waiting for real content.

- **Every project card** on `projects.html` — art, titles, copy and links are
  invented.
- **Both book covers** and the **about-page portrait** are generated images,
  not real ones. The portrait in particular is an obvious grey silhouette.
- **The three door scenes** behind the portals are generated. Real artwork
  wants to be roughly 760×912 with the subject centred, because the ring of
  fire eats the edges.
- **All about-page copy** is a template and says so in the text itself.
- **The newsletter form** posts to `/api/subscribe`, which validates the
  address and returns `{ok: true}` without storing it. See the TODO in
  `worker/index.js`: it needs a Buttondown token or to be repointed at
  Substack's own subscribe page.
- **The blog page's post lists** are hand-written. The Substack half is
  replaced at runtime once `/api/substack` is live.
- **The domain** is assumed to be `ryanbeck.com` in `sitemap.xml`, `robots.txt`
  and the canonical/OG tags. Change it there if it ends up being something
  else.

## Experiments that can be deleted

Two pages exist only as a record of decisions and are `noindex` and unlinked
from the nav. Nothing else references them.

- `compare.html` — the hand-built book beside the StPageFlip one. Delete it
  together with `assets/css/tome.css`, `assets/js/tome.js`,
  `assets/css/tome-lib.css`'s tsParticles branch, and the tsParticles half of
  `libtome/src/entry.js`.
- `dust-lab.html` — the dust engines side by side. Delete it with
  `assets/css/dust-lab.css` and `assets/js/dust-lab.js`. Keep
  `assets/js/book-dust.js`: the site uses it.

Deleting both would also let the vendor bundle drop tsParticles and shrink by
roughly half.

## Reasonable next tasks

Roughly in the order they unblock things.

1. **Deploy it.** It is a static site plus one Worker and has never been put
   online. `npx wrangler login && npm run deploy`, then point the domain.
   HOSTING.md covers why Cloudflare and what the free tier gives you.
2. **Wire `/api/subscribe`** to a real list, or delete the route and point the
   form at Substack's own subscribe page.
3. **Replace the placeholder art** — the door scenes, the two book covers and
   the about-page portrait. See "Known placeholders" for the sizes.
4. **Real project cards.** The grid takes any number; the card markup is
   copy-pasteable.
5. **Rewrite the about-page copy** in Ryan's voice. Each page is one
   `<article class="page-src">` in `about.html`; adding or reordering pages
   needs nothing else changed.
6. **Decide on Astro** before the site grows past ~8 pages. The header is
   duplicated across six files, which is fine at six and annoying at ten.
   HOSTING.md has the argument, including the case against.
