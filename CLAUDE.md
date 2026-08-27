# CLAUDE.md

Context for Claude Code working on this repo. Read this before changing anything.

## What this is

Ryan Beck's personal site. Hand-written HTML, plain CSS and dependency-free
JS, plus a Cloudflare Worker that exists only to serve `/api/*`.

**There is no build step and no framework, and that is deliberate.** Don't
introduce React, a bundler, or a CSS framework without asking. Every page
carries ~19 KB of CSS and under 4 KB of JS; the about page adds the book
(~29 KB of our own CSS+JS, plus the 233 KB vendor bundle). The constraint is
doing real work.

```
public/            everything served to a browser
  index.html       the hall — the landing page, and the interesting one
  projects.html  writing.html  blog.html  404.html
  forecasting/            GENERATED dashboard — index + one page per
                          subject, each at its own URL. One card on projects
                          points at it. Rebuild with
                          tools/forecasting/build_page.py; never hand-edit
  park-guides.html        family park guides: overview + open/download PDFs
  guides/                 the two guide PDFs themselves (RMNP, Grand Teton)
  about.html       the tome — a book you click through
  about-plain.html the same content as an ordinary page
  compare.html  dust-lab.html   experiments, noindex, unlinked (see the end)
  _headers  _redirects  robots.txt  sitemap.xml  site.webmanifest
  assets/
    portal-hall.webp/.png   the drawing the whole site hangs off
    css/site.css            all styling for every page but the book
    css/tome-lib.css        the book that ships
    css/tome.css            BOTH the shared book furniture (type, controls,
                            plate, folio — about.html needs it) AND the
                            hand-built book's geometry (compare.html only)
    css/dust-lab.css        dust-lab.html only
    tome/                   leather, page stock, dust sprites, gilt wordmark
    vendor/lib-tome.bundle.js  StPageFlip + tsParticles, built in libtome/
    js/portal.js            the doors: wake cycle, long-press, preloading
    js/tome-lib.js          the book that ships (StPageFlip)
    js/book-dust.js         the dust engines
    js/tome.js              the hand-built book (compare.html only)
    js/dust-lab.js          dust-lab.html only
    js/substack.js          fetches /api/substack
    js/nav.js               marks the current nav item
    scenes/                 what's behind each door + the fire ring textures
    cards/                  every card in the LIGHT FLOAT treatment
                            (tools/make-project-thumbs.py): fd-*.jpg are
                            real captures of the dashboards' charts,
                            em-*.jpg stage Herder's wordmark and a drawn
                            bracket, forecasting-data.jpg is the composite,
                            park-guides.jpg the two real guide pages
    covers/                 real: the two book covers + Ryan's portrait
worker/index.js    /api/substack and /api/subscribe. Static files never reach it
tools/             make-fire.py (flames), make-wordmark.py (lettering),
                   make-tome-textures.py (leather + page stock),
                   make-dust.py (dust sprites),
                   trace-wizard.py (the wizard's clip polygon),
                   prep-scene.py (crop + tone a photo into a door scene),
                   door-preview.py (show a candidate as the door reveals it),
                   make-door-carousel.py (project cards -> door art candidates),
                   make-project-thumbs.py (dashboard chart -> card thumb),
                   check-links.mjs, check-docs.mjs (CI)
wrangler.toml      Cloudflare config
```

## Running it

```bash
npm run dev       # wrangler on :8787 — the real thing, use this
npm run serve     # python http.server on :8000 — quick, but see below
npm run deploy    # pushes to Cloudflare
npm test          # check-links + check-docs, the same pair CI runs
```

**Prefer `npm run dev`.** Wrangler serves the pages, `/api/*`, `_redirects`
and `_headers` exactly as production does. `npm run serve` is a plain file
server: it ignores both files, so every pretty URL (`/about`, `/projects`)
404s, only the `.html` spellings work, and the blog page falls back to its
hand-written list because `/api/substack` isn't there. Fine for poking at
one page's CSS; misleading for anything about routing.

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

The wizard works the same way (`#clip-wizard`), except his "image" is the
artwork itself, re-positioned via
`background-size: 625% 400%; background-position: 33.93% 61.33%` so the same
PNG lines up exactly inside his little box. His polygon is **traced from the
ink** by `tools/trace-wizard.py` — the hover glow is a drop-shadow on the
clipped element, so the glow is only as good as the clip; the script
thresholds the drawing against the paper colour, fences off the rubble
behind the staff, and emits the normalised points for `#clip-wizard`. Re-run
it if the artwork or the element box changes (the box is duplicated in the
script's `BOX`).

Hover, keyboard focus, and a touch long-press (`.is-held`) light his full
glow, over `--glow-in` (.55s). **His body and his staff ember read from that
one variable on purpose.** They were both .55s before and still did not
match, because the staff was not transitioning at all — see "Animation
cancels eat transitions". His `.is-awake` turn in the wake cycle lights **only the staff ember**
— a wizard flaring up on a timer read as possessed rather than inviting,
so the always-breathing ember is the whole idle affordance.

The knot of his staff carries `.staff-glow` — wizard-light: a white core,
cold blue halo, and two crossed off-axis rays (the pseudo-elements), dim
and breathing at rest, flaring to full when he is hovered, focused, held,
or awake. **The resting breath animates `filter: brightness()`, not
`opacity`** — opacity belongs to the flare, and the two cannot share a
property. He keeps breathing while lit, which is deliberate: stopping the
breath is what used to require cancelling the animation.

The light is deliberately cold against the warm page — it reads as magic, not
as a candle. It is a sibling placed **immediately after** the `.wizard`
anchor (the `+` selector depends on that), and it must live outside him:
his clip-path would crop any halo drawn inside to his silhouette. Its
position is derived from the knot's spot in his element box (the arithmetic
is in the CSS comment); moving `.wizard` means re-deriving it.

**If you change `.wizard`'s `left/top/width/height`, you must recompute the
two background values** or he slides out of register. The formula, where the
element is `w`% wide at `l`% from the left:

```
background-size-x = 100 / (w/100) %          e.g. w=16  -> 625%
background-pos-x  = -l / (w - 100) * 100 %   e.g. l=28.5, w=16 -> 33.93%
```

### The hover effect

Six stacked spans inside each portal, back to front: `.scene`, `.veil`, `.rim`,
`.ember`, `.swirl.b`, `.swirl`. Order matters — `.rim` is a dark inset shadow
and must sit *under* the flames or it mudddies them.

- `.scene` goes from `scale(1)` + `brightness(var(--scene-rest))` to
  `scale(1.46)` + `brightness(1.22)`, then keeps drifting to `1.62` on a 13s alternating loop.
  It's a continuous dolly, not a one-shot zoom — that's what Ryan asked for.
  **The zoom is the `scale` property and the drift is `transform`, and they
  have to stay on separate properties** — see "Animation cancels eat
  transitions" below for what happens when they share one. The drift is a
  multiplier (`1 → 1.1096`), always applied and merely paused at rest rather
  than added and removed, which is what keeps it out of the transition's way.
  Its keyframes are relative, so changing the `1.46` changes the far end too.
  The scene art itself is tone-mapped with a soft-knee highlight rolloff so it
  doesn't bloom at that exposure — `tools/prep-scene.py` does the crop and the
  curve; if you swap in new art and it looks blown out, that's what you skipped.
- **A resting door is shrouded, not blank.** The scene is still there at
  `--scene-rest` exposure, desaturated, contrast pulled *below* 1 (haze lifts
  blacks; it does not crush them) and softly blurred, under a `.veil` that is
  three stacked gradients rather than one flat black: a mouth that opens in
  the middle and closes to solid at the walls, a weighted floor and lintel,
  and a cold haze where the far end is. The mouth is the whole depth cue —
  the same picture under a flat alpha reads as a dirty window, and under a
  converging surround reads as a passage. All three ride the one opacity that
  fades to `.02` when the door wakes, so the lit state is untouched and the
  crossfade is a single property.

  `--scene-rest` is **per-door** because the three pictures are nowhere near
  each other in level. `.75 / .36 / .46` (projects / fiction / blog). The
  fiction corridor and the puzzle land near a median of 25 behind the veil.

  **Tune the projects door on the p95, not the median.** Its art is a dark
  anvil silhouetted against a gold disc, so the median (10.8 at rest) is the
  background and says nothing about whether anything is visible; the disc is
  what the eye finds. At `.75` that disc lands at a p95 of 65, against 67 for
  the fiction corridor and 77 for the puzzle — in line with both.

  The value moved a long way when the art changed, and the reason is worth
  keeping. The voxel anvil this replaced was ~86% pure black with one thin
  bright subject, and needed `1.15` — *above* 1, because there was so little
  lit area that dimming it at all erased it. The current art has real mass at
  mid-brightness (only 6% near-black), so the same 1.15 would push the disc
  through the veil as a bright slab and the door would stop reading as
  shadowed. Same door, opposite correction: check which kind of picture you
  have before copying a number.
- **How close a door stands to its scene is per-door**, via `--scene-bleed`
  (how much bigger `.scene` is than the opening) and `--scene-zoom` (the hover
  target). A door shows `1 / (bleed x zoom)` of the art's height and `0.741x`
  that in width — 56% of the height at the defaults. `[data-portal="blog"]`
  overrides both (`-3%`, `1.06`) because its art is a close-up photograph
  rather than a room: at the defaults the blue puzzle piece filled the entire
  opening. Pulled back it shows about 2.7 pieces across instead of 1.7. That
  is close to the floor — with no bleed and no zoom a door still only shows
  74% of the art's width, so a scene cannot show more than its photograph
  contains.
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

### Animation cancels eat transitions

**Never let a CSS animation and a CSS transition own the same property on the
same element.** If a style change cancels a running animation and alters that
property in the same frame, the browser starts *no transition at all* — the
value snaps. Both of the hall's motion bugs were this, and both were reported
by Ryan as timing complaints rather than as jumps, which is what makes it worth
writing down.

- **The staff ember flared instantly** while his body took .55s. `.staff-glow`
  breathed on `opacity` and the hover rule raised `opacity` while setting
  `animation: none`. Crossing the staff with the cursor showed it worst,
  because the snap fired on every crossing.
- **The doorway scenes snapped out of their zoom.** `portal-drift` animated
  `transform` and the hover rule transitioned `transform`, so leaving a door
  after the drift had started dropped the scene from wherever it had reached
  straight back to `scale(1)` while the light was still fading — a visible
  zoom jump at the end of every hover longer than 1.35s.

The fix in both cases is the same shape: **put the loop and the transition on
different properties, and never add or remove the animation.** The scene's zoom
moved to the `scale` property so the drift can keep `transform`, and the drift
is paused rather than removed. The ember's breath moved to `filter:
brightness()` so the flare can keep `opacity`.

You can check this without watching a frame, which matters because this
machine's browser pane does not composite. Apply the class, then ask the
element what transitions it actually generated:

```js
el.getAnimations().filter(a => a.transitionProperty)
  .map(a => a.transitionProperty + ' ' + a.effect.getTiming().duration)
```

A property you expected to see in that list and don't is a property that is
snapping. That is how both of these were found and how the fixes were checked.

### The wake cycle

One portal (or the wizard) is always awake: `portal.js` rotates the glow
every 3.6s on **every** device. On desktop, hover outranks the rotation —
pointerenter on any of them stands the cycle down and pointerleave resumes
it, so the cycle never fights the cursor. The wizard's slot in the rotation
lights **only his staff ember**, never his body — the full glow is reserved
for a deliberate visit (hover, focus, or a long press).

On a phone a tap wakes what it touched and navigates; a **long press
(450ms) stays to watch** — `touchend` is preventDefaulted so the link never
fires, `.is-held` marks the hold (it is what lights the wizard's full glow
on touch), and `contextmenu` plus `-webkit-touch-callout:none` keep the
browser's own long-press link menu from hijacking it. A touchmove cancels
the hold so scrolling never triggers it. Below 760px the artwork is also
scaled to 152% of the viewport and its faded edges are allowed to crop,
which makes the doors a real tap target — that only works because the page
is the same colour as the paper.

`.hall-nav` is a plain text nav shown at **every** size, positioned
**absolutely inside `.hall`, at `bottom: 13%`** — the drawing's rocks run out
around 78% of the frame, so that puts it on clean sand below the wizard. It
used to sit below the artwork in normal flow and got pushed off short
screens. Keep it on the art. **Don't remove it** — it's the accessible path
in, not a fallback.

Because the nav lives on the artwork, the hall reserves no vertical space
below it: the art's size budget is `100svh` minus ~150px for the wordmark and
paddings (`.hall` and `.hall-mark` share the 150px figure — change one,
change both).

Everything honours `prefers-reduced-motion`.

## The forecasting data

Eleven series, fetched by Python, committed as CSV, drawn by
`assets/js/plot.js`. Six fetchers run on a schedule; four are one-time rescues
of sources that have since frozen, and are on no cron.
`public/forecasting/` is **generated** by `tools/forecasting/build_page.py`
— eight pages plus an index, one per subject, each at `/forecasting/<slug>`
so a grouping can be linked to directly. Edit `SECTIONS` (the chart
definitions) and `GROUPS` (which page each lands on, and its prose) in that
file, never the HTML.

The generator also rewrites a delimited block in `public/_redirects`.
`wrangler.toml` sets `html_handling = "none"`, so without an explicit rewrite
per page `/forecasting/respiratory` 404s in production while working fine
under a plain file server. If you add a group and skip the generator, that is
the failure you get.

### The rule this whole subsystem exists to enforce

A job succeeding tells you it fetched something. It does not tell you anyone
upstream is still publishing. COVIDWeekly ran green every ten hours for two
years while showing a series that stopped in April 2024, and nothing in the
setup would ever have said so.

So: **status comes from the last date in the data, never from the run time.**
`_common.record()` takes `last_date`, the page builder renders it, and
`fetch_hpai.py` flips itself to `stale` when its newest row is over 120 days
old. That is why the bird-flu chart currently says "Source stalled · data to
9 June 2025" instead of showing a tick.

### Traps found the hard way, all of which return silently wrong numbers

- **git-lfs serves a pointer, not data.** reichlab's truth files are LFS, so
  `raw.githubusercontent.com` returns 132 bytes reading
  `version https://git-lfs.github.com/spec/v1`. A fetcher parses that as a
  one-line CSV and publishes nothing, successfully. Use
  `media.githubusercontent.com/media/...`; `fetch_covid_truth.py` asserts on
  the pointer text so it can never happen silently.
- **healthdata.gov dates are `YYYY/MM/DD`.** `plot.js` only matches dashes, so
  passing them through yields a blank chart with no error anywhere.
- **NHSN has a real `USA` rollup row.** Summing the 66 state and territory rows
  double-counts it.

### A dead feed is not a dead subject

Two of these were labelled "the source stopped" when the truth was narrower,
and it is worth checking which you have before writing the series off:

- **COVID admissions were never discontinued.** The reichlab hub was archived,
  but the reporting requirement had moved to CDC NHSN, where the same measure
  runs from 2020 to now. The dashboard was dead; the data was not. It is live
  again on `ua7e-t2fy`.
- **The bird-flu outbreak had not stopped either, and neither had the data.**
  The CDC mirror froze in June 2025 while still returning a valid 112 KB file,
  so nothing failed — the numbers just stopped moving, and 33 million birds
  went missing from the chart. USDA had moved to a Tableau dashboard with no
  visible download.

  **How the real export was found, because the technique generalises.** The
  dashboard page has no data link, its embed is a JS shell whose config
  container is empty, `vizportal`'s listing API returns 401 anonymously, and
  guessed view names all 404. What worked was loading the dashboard in a
  browser and reading the response to its own
  `POST .../startSession/viewing`, which states:

      "visible_sheets": ["HPAI 2022 Confirmed Detections", "ExportToCsv"]

  A second published view named `ExportToCsv` — the sheet behind the
  dashboard's Download Data button. Appending `.csv` to any Tableau view URL
  exports it, so no session and no vizql scraping is needed; the whole problem
  was not knowing the view's name. Full detection detail, 2,240 rows, current.

  Note the trap next to it: the dashboard's *default* view also exports, but
  returns only backyard flock counts by month and silently ignores every
  filter parameter. If you are parsing that, you have the wrong view.

- **Treasury: never narrow the `fields` list.** `debt_catg_desc` is requested
  and never read. Drop it and two "Less Debt Not Subject to Limit" rows that
  differ only by description collapse into one, losing $494M on 45 dates. The
  fix was found by diffing against Ryan's archived R output, which matched to
  the dollar on all 4,579 overlapping dates.
- **Treasury: an absent ceiling row means suspended,** not missing. Only the
  2023-25 suspension published a literal `0`; the four earlier ones just omit
  the row. Reading only the `0` finds 395 suspended days instead of 1,732 and
  leaves four of the eight suspensions unshaded.
- **Comtrade: `partner2Code=0` is mandatory.** Without it a year comes back
  broken out by second partner, and taking the first row gives $2,042 where
  the answer is $230 billion. Monthly also needs explicit `YYYYMM` periods,
  twelve per call maximum — omitting `period` silently returns only the last
  twelve months.
- **Refugees: unreported months are zeros, not blanks.** The workbook always
  has twelve month columns. Publishing the trailing ones draws admissions
  collapsing every year, so the "as of" date in the sheet header is parsed and
  later months dropped.
- **SEC: the revenue tag changed** around 2018, and every 10-K restates two
  prior years. Tags are tried in order; entries are filtered to 330-400 day
  durations and de-duplicated by fiscal-year end, newest filing winning.
- **SEC: select quarters by DURATION, never by form.** This is what put the
  two huge spikes in the old quarterly chart -- Apple at ~$383bn and Microsoft
  at ~$332bn. Those are the *annual* figures; a 10-K carries both the
  twelve-month total and three-month facts, so filtering on form or fiscal
  period lets the year land in the quarterly series. Quarters are 80-100 day
  durations.
- **SEC: the fourth quarter often does not exist as a fact.** Three 10-Qs
  cover Q1-Q3 and the 10-K reports the year; filtering by duration alone
  therefore leaves a hole every twelve months, which is worse than a spike
  because a gap looks like nothing is wrong. It is derived as annual minus the
  three quarters inside that fiscal year, and checked against what the
  companies reported (Apple FY2023 Q4 derived $89.5B vs reported $89.498B).
  Quarters are then placed in the calendar quarter they *end* in, so the five
  line up despite Apple's September and Microsoft's June year-ends -- summing
  four calendar quarters for those two will not equal their fiscal year, and
  should not.

### Time-range buttons

`plot.js` offers All / 20Y / 10Y / 5Y / 2Y / 1Y / 6M above each chart, and
**which buttons appear is derived from the data, not declared per chart.** A
range earns a button only if the window would hold at least five observations
at that series' own cadence, and only if it is shorter than three quarters of
the history. So the annual charts offer nothing below 5Y, and the five-month
VDH series offers no buttons at all.

Two things worth keeping:

- **The y-scale is recomputed for the visible window.** Keeping the full
  history's scale while zoomed in flattens recent data into a band along the
  bottom, which is the whole thing you were zooming to escape.
- **Cadence must come from *unique* timestamps.** `autoRanges` is handed every
  series concatenated, so a two-line chart has each date twice; those
  duplicate pairs are zero-day gaps that drag the median cadence to nothing
  and make every range look justified. That is how the annual refugee chart
  briefly offered a "2Y" window containing two points.

`defaultRange` overrides the opening view — the monthly refugee chart opens at
2Y, the quarterly revenue chart at 5Y.

### Small multiples

`panelBy` switches the module into a grid of one sparkline per category, all
on **one shared vertical scale**. Sharing it is the point: per-panel scales
put every state's peak at the top of its own box, and the grid then says
nothing beyond "everywhere had a winter".

`layout: "us-grid"` places each panel by `US_GRID`, a tile map of the country
(11 columns), so a state sits where you expect it and regional patterns read
as blocks of colour. Below 820px it falls back to a flowing grid — eleven
columns on a phone gives each state about 30px — and the CSS has to `!important`
away the inline `grid-row`/`grid-column`, since placement is set per panel.

The grid has two modes and **opens on percentage change against four weeks
earlier**, which is what the old dashboard showed. That framing is the point of
it: in absolute terms a small state is invisible next to Texas, but "up 44%" is
the same size everywhere. The fill is a diverging red/green ramp that saturates
at ±100% — past a doubling the colour stops changing, because nobody reads the
difference between +200% and +400% off a fill.

The other modes show `rate_per_100k` over 6M/1Y/2Y/5Y. Per head rather than raw
counts is what makes the shared scale usable: on raw admissions the spread is
55x (Texas 4,729, Hawaii 86) and forty-eight of fifty-two panels flatten into
slivers; per head it is about 4x. It also surfaces what the counts hide — Texas
is middling per capita (15.1 / 100k against Arizona's 37.5).

### Two y-axes

A series with `axis: "right"` is drawn against its own scale, with ticks on the
right in that series' colour and "(right axis)" appended in the legend. The
bird-flu chart needs it: a cumulative total and its weekly increments differ by
two orders of magnitude, so on one scale the weekly bars are a flat line along
the bottom. Don't reach for it to fit two similar quantities — two axes invite
a reader to compare heights that are not comparable.

### plot.js, and why it is not a library

Every dashboard here died of dependency rot — RSocrata leaving CRAN took two
pages down, dplyr dropping `summarise_each()` took the debt limit dark for six
months. A chart library would reproduce that. It is ~21 KB, reads the site's
CSS custom properties for colour, and breaks the line at missing values rather
than interpolating, because several of these series have real holes.

**Charts mount eagerly, and that is deliberate.** Two earlier versions
deferred below-the-fold charts, first with IntersectionObserver and then with
a scroll handler. Neither could be verified: the embedded browser pane fires
no IO callbacks, no scroll events and no `requestAnimationFrame`, so a chart
that never mounts looks identical to one that is merely waiting. The charted
CSVs come to ~190 KB. Not worth a column of blank rectangles. If the page
grows enough to need laziness, add it and test it in a real browser.

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
the repo (`assets/js/tome.js` and the geometry half of `assets/css/tome.css`)
because `compare.html` shows it. Its own notes are kept at the bottom of this
section in case it is ever revived.

⚠️ **`tome.css` is two files in a trenchcoat, and `about.html` loads it.**
A consequence beyond deletion: its hand-built-book half owns generic class
names — `.leaf`, `.face`, `.sheen`, `.edge` — and they leak into the about
page. The per-page ageing div was first named `.leaf` and tome.css's
`width:50%; height:98.8%` promptly halved it, which rendered every page as
an aged column beside bare stock. It is `.age-leaf` now. Grep tome.css
before introducing any new class name on the about page.
Its "stage / page contents / the cover / controls / reduced-motion" sections
are the shared furniture every version of the book uses — headings, buttons,
`.plate`, `.folio`, `.kicker`, drop caps. Its "leaves / the curl" sections
are the hand-built book alone. Deleting the file with `compare.html` strips
the about page of all its typography and controls. Split it first, or keep
it.

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

Prediction needs an intent, and there are **two sources**: `flipNext`/`flipPrev`
are wrapped (buttons), and a capture-phase `pointerdown` on the stage records
which half of the book was pressed (`clickIntent`) — because
`clickEventForward` and corner drags start flips **inside** StPageFlip without
calling those methods. Before the pointerdown intent existed, every
click-started flip ran with target = current page, so the boards, `is-open`
and the masks all fired a full cover-swing late — the board arrived visibly
after the cover had landed.

Landscape has its own left-of-spine rule, active when the book is closed or a
flip is heading to closed (`maskTarget === 0`): **nothing settled may render
left of the spine**. StPageFlip breaks that twice — its initial render parks a
pale page there before the first interaction, and a closing swing sits a
full sheet of inside-cover leather flat on the left for its whole duration.
`maskLeftPage()` enforces the rule (it also still does the portrait masking),
runs from `status()` plus two delayed retries at load (the first StPageFlip
render can land late in a throttled tab), and per-frame during flips via
`maskLoop`. Its shadow cousin is `maskShadows()`, and it enforces the same
rule for StPageFlip's four shadow elements: **nothing can cast a shadow onto
a half with no book in it.** A hard flip paints `.stf__hardShadow` across the
full width regardless, so opening the cover laid a grey slab over the bare
paper beside the book and closing it did the same on the way back — the
"strange shadow on the left" Ryan reported at several points in the swing.
Any shadow whose middle sits over the empty half is hidden; "empty" is the
left board being anything other than fully opaque in landscape, and anything
left of the sheet in portrait. Beyond that they are
`visibility:hidden` except while `.libtome.is-flipping` — the initial render
can park one of those over the empty half too. Visibility, not display,
because the dust engine reads the outer shadow's box every frame.

⚠️ **StPageFlip does not wrap the pages you give it — it stamps `stf__item`
onto the very elements you hand over.** `.stf__item` and `.page` are the same
node, plus a `--hard`/`--soft` class and, during a flip, a lifted `z-index`
and a rotated inline `transform`. Any code that reaches *into* an item for its
page — `item.querySelector('.page')` — silently finds nothing and does
nothing. That is exactly how the first version of `hardInFlight()` failed: it
could never return true, so the rule it guards never ran once, and the bug it
was written to fix survived untouched. Test it against the real DOM, not a
stub: a stub built on the same wrong assumption passes happily.

**A cover in flight owns the left half, and that is decided from the DOM,
not from a prediction.** `hardInFlight()` asks whether a hard page is in the
air right now — flight meaning a lifted z-index (≥5), the same convention
`maskLeftPage()` trusts — and while one is, until the `flip` event says it
has landed, the left board is held at zero. A rotate-in-transform test was
tried as a second flight signal and burned us: StPageFlip stamps
`rotateY(0deg)` into settled pages' cssText on every draw, so the parked
back cover matched it and the left board vanished during ordinary turns
near the end of the book. z-index only. This is a second line of defence behind the
`changeState` choreography below, and it exists because the prediction there
is `getCurrentPageIndex() + intent` — click back through several pages
quickly and that index runs a flip or two behind, the target never computes
to 0, the close is never recognised, and the board stays lit under a cover
that is already swinging shut. What is actually on screen cannot be stale.
**A predicted target may hide the left board but must never light it.** The
second half of the same bug: a close predicted `target > 0` from the stale
index, and `sizeBoards()` answered by fading the board *in* — actively
relighting it for the whole closing swing, which is why it read as lingering
rather than merely late. `sizeBoards(target, true)` now marks a prediction,
and lighting only ever happens from a settled state (the argument-less
`status()` call).

The `coverGesture` latch (opened at `changeState`, closed at `flip`) is what
keeps the rule from fighting the fade-in: `maskLoop` runs for ~1.5s after a
flip lands, and without the latch it re-hid the board the instant the `flip`
handler lit it.

**In landscape there are TWO boards, and neither ever moves.** A leather
rectangle travelling or resizing reads as furniture moving, not as a book
opening — that was tried twice (a paced transition, then a snap-with-settle)
and rejected twice; physically the board *is* the cover, so nothing should
lie under the half the cover has not reached, and nothing should slide to
get there. So: the right half-board is simply always present. The left
half-board is always **positioned** but changes only opacity — it fades in
IN PLACE (~180ms) from the `flip` handler, the same frame StPageFlip lays
the flying cover flat on top of it, and it vanishes instantly at
`changeState` when a close begins, while the cover still lies exactly over
it. `changeState` must keep skipping `sizeBoards` for an opening cover, or
the left board fades in over a still-empty left half at the start of the
swing. The joint between the two boards sits at the spine, hidden by the
page block; the sliver visible above and below the pages reads as a
binding's hinge groove. Portrait keeps the single spanning board and the
verso. `maskLeftPage()` runs synchronously with the close-time hide. If any
of this ever becomes visible, the timing against StPageFlip's events is
what broke.

**Every paper page ages differently** — `stain()` in `tome-lib.js`. One
texture at nine offsets is not a used book: it was a crop window and a
stretch, and it still read as one sheet of stock photocopied nine times.
Each page now gets its own recipe from a PRNG seeded on the page index:
its patch of `page.jpg`, its own inset edge shadow, three to six foxing
blotches (warm or cold, round or drawn out), sometimes a cluster of
freckles, one grubbier edge, sometimes a damp mark, and an overall cast so
no two sheets are the same white. Seeded means page three's stains are
always page three's stains — reload, resize and reflow do not shuffle them,
and a screenshot of a bug is reproducible.

⚠️ **Where it lives is the load-bearing part: a child `.leaf` div, never
the page element.** StPageFlip rewrites each item's entire `style.cssText`
on every draw (`simpleDraw`/`drawSoft` in the bundle end in
`this.element.style.cssText = ...`), so ANY inline style set on a page is
annihilated by the first frame it renders. Two versions of this feature —
the original crop-window one and the first recipe one — were installed
inline on the pages, verified at load, and never survived a single draw:
every page fell back to the stylesheet's identical `center/cover` and
Ryan kept seeing one pattern while the DOM checks kept passing. Children
are not touched, and the item's clip-path folds them with the page, so the
leaf carries the stock (crop, tint, offset vignette, all inline) and its
`::before` paints the `--age` gradients. If you add ANY per-page styling
to this book, it goes on a child. The verso is ours — StPageFlip never
sees it — so it keeps the direct arrangement.

- **Only paper pages get a leaf.** `data-density="hard"` is both covers;
  the front keeps its leather and settled dust, and the back keeps the
  paste-down endpaper styling it gets from `[data-type="backcover"]`.

Two things that took a pass to get right, in case they are ever retuned:
a damp mark whose centre sits *on* the page reads as a coffee ring, so the
centre is placed well outside it and only a shallow arc of the tidemark
crosses — with a second offset ellipse to break the arc, because a clean
circular edge is a mug no matter how faint. And the tidemark has to stay
wide and faint: a crisp narrow ring is a mug, a broad soft one is water
that dried. The portrait verso gets a recipe too, on a seed no real page
uses — it sits beside the recto and matching one would read as a printing
error.

**The edge vignette is what the eye reads as "staining", and it has to be
asymmetric.** This is the one that took three tries to see. Every page carried
`box-shadow: inset 0 0 Npx` — a perfectly symmetrical brown frame, the same
shape on all four sides, page after page. Varying its blur and its alpha
changes how *heavy* that frame is; it never changes that it is the same frame,
and nothing painted underneath competes with a border drawn round all four
edges. Offsetting it is what breaks the repeat: the darkening piles into two
sides and thins on the other two, so one sheet is grubby down its fore-edge
and the next along its head. Two offset shadows per page, the second thrown
back the other way.

**The scale range also matters.** `page.jpg` is one sheet
whose variation is almost entirely large and soft — blur it by 40px and the
standard deviation barely moves, from 12.1 to 11.8. That means shifting the
crop window around does very little: at the original 112–184% every page
showed 54–89% of the same texture, the windows overlapped almost completely,
and nine pages read as one. **Different offsets into a soft texture are not
different paper; different scales are.** At 105–290% a page shows anywhere
from a third of the sheet to nearly all of it, which changes the apparent
size of the grain. That, the broad tonal patches, and the per-page tint carry
the difference; the blotches are detail on top.

The tint is a `multiply` blend against a per-page base colour, since the
stock is opaque and blending is the only way its own tone can differ. Two
rules keep it honest:

- **Its channels are derived, not rolled independently** — `r >= g >= b` by
  a bounded step — so it can only run warm. Three free channels produced
  `rgb(232,238,196)`, and multiplied through the stock that is not an aged
  sheet, it is a mouldy one.
- **Every page gets one, over a narrow range** — about 3% across the book on
  the blue channel, which is the channel that carries yellowing. Tinting
  only some pages, over a wider range, sorts the book into plainly yellowed
  sheets and plainly white ones, and the jump between two *facing* pages
  reads as a mistake rather than as age. Pages of one book came off one
  batch of stock: they should differ by a shade, not by a generation. The
  variety belongs in the marks and the vignette, not in the colour.

Cost is 9–17 gradients per page, painted once.

Verifying any of this is awkward, because the browser pane on this machine
does not composite — the real rAF never fires. But **flips CAN be exercised
there**: copy `about.html` to a scratch page whose `<head>` starts with a
script that replaces `requestAnimationFrame` with a queue plus a
`__pump(n, t)` that drains it with hand-fed timestamps, then drive
`window.__tomeFlip` (a debug handle `tome-lib.js` exposes) and pump. Layout
and cssText all update without composited frames, so geometry, board
opacity and mask state can be sampled mid-swing. Two traps: feed the pump a
**monotonic clock you own** (`window.__t`), never a fresh
`performance.now()` per call — synthetic time runs ahead of real time, and
StPageFlip's `render(h)` computes a negative frame index from a rewound
clock, throws `frames[u] is not a function`, and its loop dies silently mid
flip. And pump *between* separate tool calls only via that same clock. This
is how the `.age-leaf` collision and both board scenarios were finally
measured mid-flight (rapid close: board 0 for the whole swing; last-page
turns: board 1 throughout). Three other techniques still apply. `tools/`-style Node
harnesses can pull a function straight out of this file by name and run it
against stubs — that is how `stain()` was rendered offline against the real
`page.jpg`, and how `maskShadows()` and `hardInFlight()` were checked against
made-up geometry. And `getAnimations()` reports what the browser decided
without needing a single frame to be painted (see "Animation cancels eat
transitions").

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

**Emission is timeboxed, and only a real turn opens it.** A `changeState` of
`flipping` or `user_fold` opens a window (~1s for a cover, ~0.55s for a page,
one per gesture — the fold→flip transition of a drag-and-release must not
double up); inside it the tracker spawns off the moving fold, after it the
cloud only drifts and thins. This matters because a fold's existence is NOT
evidence of a turn: hovering a page corner makes StPageFlip raise a little
fold (`fold_corner`), and a drag held half-turned keeps one alive
indefinitely — both used to pour out dust continuously. Cover flips get
full power; ordinary page turns run at half (`powerScale`). The cover test
is index 0, or index 1 heading backward — and a hard board seen mid-window
upgrades a wrong half-power guess, which covers click-started closes.

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

**The site runs at half of that**: `about.html` carries
`data-dust-amount="0.5"` and `tome-lib.js` applies it before attaching. Set it
there rather than by moving `AMOUNT`, so `dust-lab.html` keeps showing every
engine at the documented baseline — the lab is a bare book on a plain
background where you are hunting for the dust, and the same cloud over the
real page was more than the page needed. `setAmount` is global, so a page with
two books cannot give them different densities.
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

**The simulation is frame-rate independent.** All the physics constants are
per-frame values tuned at 60fps; `DT` — real elapsed time in 60fps frames,
clamped to [0.25, 3] — rescales them each frame, and the per-frame emission
counts scale by it too. Without this a 144Hz monitor ran the dust ~2.4x
faster *and* ~2.4x denser than the phone it was tuned against. Positions
move by `v * DT`, drags become `Math.pow(drag, DT)`, lifetimes decay by
`decay * DT`. Anything added here must be written the same way.

**Dust is born on the book, never beside it.** The spawn box (`bx0/bx1`,
`by0/by1`) is the visible union of the **leather board elements**, not
StPageFlip's block — the block is always the full open spread, so a closed
book fills only half of it, and block-based spawns put dust on the empty
paper next to the cover on every cover flip (`burst()` fires exactly then).
There are two boards in landscape and the left one is `opacity:0` whenever
no book lies under it, so the union tracks what is actually on screen.
Everything spawned is clamped into the box and ramps in over its first
frames (`fi`) — it billows off the book and drifts outward, it never pops
into being out on the paper. The block is the fallback for hosts without
boards (the dust lab).

The one deliberate exception: **a swinging cover sheds dust off its own
face.** During a hard flip, 55% of the emission is born ON the moving board
— between the hinge (the spine, which is the spawn box's near edge) and the
tracked fore-edge, biased outward with `sqrt(random)` — and is carried with
the board: it inherits a share of the edge velocity that grows with
distance from the hinge, plus an upward fling, because the fore-edge is the
fast end of the lever. These spawns are intentionally NOT clamped to the
box; mid-swing the board is legitimately outside it.

`mist` is two layers on one canvas. The **body**: about a quarter of the
emission as large (6–18px), very faint, pre-rendered soft radial blobs that
overlap into a slow billowing cloud, grow gently as they thin, and get a
touch of upward lift. The **grain**: fine motes (skewed small, the odd
fleck) hanging inside that cloud. Both ride the same curl field, and the
whole thing is deliberately slow: spawn velocities at a third of the throw,
a curl field that evolves at large scale and low speed (small fast eddies
read as gnats, not dust — this was relearned the hard way), weak gravity,
long lives, and a half-second fade-in so a mote condenses into view instead
of popping. Speed lives in three numbers: the `0.32`/`0.22` spawn scale in
`emit`, the `0.30` curl force and the `0.00012` field speed in `frame`.
Spawn points are spread across the whole spawn box, with only about **16%**
biased to the crease band.

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

**Wrangler is not authenticated on this machine.** It was on the old PC
(2026-08-18, OAuth as ryooan@gmail.com, account `0efbd4d4…d990`), but the
credential lives in `%APPDATA%\xdg.config\.wrangler\config\default.toml` and did not come across in the
2026-08-19 migration — `npx wrangler whoami` says so. `wrangler dev` needs no
account, so local work is unaffected; a deploy needs `npx wrangler login`
first. It has still never been deployed — publishing is Ryan's call, not a
default.

Two things to know before wiring up CI:

- `.github/workflows/deploy.yml` triggers on push to **`main`**, but this repo's
  branch is **`master`**. Rename the branch or the trigger, or the workflow
  silently never runs.
- It needs two GitHub secrets, `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. There is no remote configured yet, so none of this
  is live.

Before launch, put `/assets/*` images back on a long `max-age` and give them
content-hashed filenames — they are on `no-cache` today so swapped artwork
shows up immediately in review (see the note at the top of `public/_headers`).

`public/_redirects` already maps the old ryanbeckauthor.com paths and gives the
pages extensionless URLs. `wrangler.toml` has commented-out blocks for the
custom domain and a Hyperdrive/Neon binding — uncomment when they exist, and
note `html_handling = "none"` there is load-bearing (see "Running it").

## Known placeholders

None of this is a bug. All of it is waiting for real content.

As of the 2026-08-18 content pass most of the invented material is gone. What
is left:

- **The card treatment is "light float", chosen by Ryan from three lab
  rounds (2026-08-20)**: the real chart warmed so white becomes paper, on a
  rounded panel, gently rotated, floating over an airy wash of its own
  colours. `tools/make-project-thumbs.py` builds every card — the fourteen
  real dashboard captures, the composite, Herder's actual wordmark, a drawn
  bracket for March Madness (still behind Vercel SSO), and the park guides'
  real first pages. What was learned choosing it: recoloured screenshots
  read as screenshots however styled; fully redrawn data loses the
  "preview of the page" quality; the winner keeps the real chart and puts
  the energy in the staging. Rerun the script when a dashboard's data
  moves. Both project pages still mark themselves drafts.
- **All three door scenes are now real art**, none generated:
  `scenes/fiction.jpg` is the SEER cover, `scenes/blog.jpg` the puzzle
  photograph, `scenes/projects.jpg` the anvil-on-a-gold-disc Ryan supplied
  (2026-08-26, replacing the voxel anvil of 2026-08-23). Replacement artwork
  wants to be 760×912 with the subject centred, because the ring of fire eats
  the edges.

  **Originals live in `art-source/`** and are committed, so a scene can be
  re-derived rather than adjusted exactly once. `tools/door-preview.py` crops
  any candidate to what the door actually reveals, at the resting and hover
  exposures — judging door art from the full image is how two carousel
  candidates got through review and failed at the crop.

  On `--fit-subject`: **0.66 is about the ceiling, not 0.80.** The subject box
  is the span holding 92% of the image's light, so the outer 8% sits outside
  it; at 0.80 both anvil candidates had the hammer clipped on hover.

  **Two modes in `tools/prep-scene.py`, and picking the wrong one is the
  mistake to avoid.** `--focus x,y` crops INTO a picture: right for a scene
  that fills its frame. `--fit-subject FRAC` pads AROUND one: right for a
  single bright subject on a plain dark ground, which is what the anvil is.
  The reason it matters is that a door shows only the middle of its scene —
  82% of the art at rest but **56% of the height and 50% of the width** once
  the hover zoom is on — so a subject filling its own frame loses its edges
  exactly when the door lights up. The anvil spanned ~70% of its square
  source; a straight crop would have sliced the horns off. Padding a black
  background is free.

  One trap inside `--fit-subject`: the subject box is the span holding 92% of
  the image's *light*, not the outermost lit pixel. This art scatters faint
  voxel debris to the frame edge, and a threshold-and-bound box returned
  nearly the whole canvas — scaled to fit the door window, that shrank the
  anvil to a speck. Weight by how much light each row and column carries.

  Tone: neither real scene was matched to the *mean* of the old generated
  ones — matching a mean built from dark rooms crushes a uniformly lit
  picture into a murky band. Match highlights, keep the subject readable. The
  puzzle sits at paper 163 / piece 63, which is 199 / 77 at hover exposure.
- **The about-page copy** no longer announces itself as a placeholder, and it
  is factually grounded, but it was drafted rather than written by Ryan. It
  wants his voice and his sign-off before launch.
- **Not placeholders any more:** both book covers, the about-page portrait, the
  blog archive (nineteen real posts), the Substack fallback list, and every
  project card's title, copy and link. These are Ryan's real images and text —
  a `tools/` regeneration run must not overwrite the covers, the portrait,
  or any of the three door scenes.
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
  with `assets/js/tome.js`, the tsParticles branch of `tome-lib.js`, and the
  tsParticles half of `libtome/src/entry.js`. **Do not delete
  `assets/css/tome.css`** — see the warning in "The tome" above; about.html
  depends on its shared half. To be rid of it, first move the "stage / page
  contents / the cover / controls / reduced-motion" sections into
  `tome-lib.css` and drop the `tome.css` link from `about.html`, verifying
  the about page's type and buttons survive.
- `dust-lab.html` — the dust engines side by side. Delete it with
  `assets/css/dust-lab.css` and `assets/js/dust-lab.js`. Keep
  `assets/js/book-dust.js`: the site uses it.

Deleting both would also let the vendor bundle drop tsParticles and shrink by
roughly half — 233 KB is by far the heaviest thing the site serves, and it
loads on `about.html`.

## Reasonable next tasks

Roughly in the order they unblock things.

1. **Deploy it.** It is a static site plus one Worker and has never been put
   online. On this machine that is `npx wrangler login` and then
   `npm run deploy` — but it publishes under Ryan's name, so wait for him to
   ask. Then point the domain. HOSTING.md covers why Cloudflare and what the
   free tier gives you.
2. **Wire `/api/subscribe`** to a real list, or delete the route and point the
   form at Substack's own subscribe page.
3. **Fork the fourteen dashboards** out of the old `ryooan.github.io` repo
   into the current personal-projects repo, fix what has drifted, and polish
   the presentation — Ryan's ask, 2026-08-20. **Done**: the dashboard
   lives at `public/forecasting/`. Until then they stay linked where they live.
3a. **March Madness is behind Vercel deployment protection.** Its card
   links the stable alias
   (`march-madness-2026-ryan-8339s-projects.vercel.app`), but every URL on
   the project currently serves Vercel's SSO login page. Ryan has to turn
   off Deployment Protection in the Vercel dashboard (project settings)
   before the card works for visitors. Remaining candidates if wanted:
   Wordle Analysis, Ballot Research 2026, Desktop Build 2026. Real captures
   for app-type projects still need a compositing browser; Herder's card
   uses its actual wordmark re-inked gilt, March Madness a drawn bracket.
4. **Prune the projects lede**, which still marks itself a draft. (The last
   generated door scene is done — the anvil landed 2026-08-23.)
5. **Have Ryan pass over the about-page copy.** It is drafted for him, not by
   him. Each page is one `<article class="page-src">` in `about.html`; adding
   or reordering pages needs nothing else changed.
6. **Decide on Astro** before the site grows past ~8 pages. The header is
   duplicated across six files, which is fine at six and annoying at ten.
   HOSTING.md has the argument, including the case against.
