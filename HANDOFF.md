# Start here

Ryan Beck's personal site. Six public pages plus one Cloudflare Worker, one of
of which is a generated dashboard (`public/forecasting/`, eight pages plus an
index) built from committed data and never hand-edited.
It has never been deployed — that is still the first real task, and it is
Ryan's call, not a default. Wrangler **is** logged in on this machine again
(re-verified 2026-09-22; the token lost in the 2026-08-19 move to `RYANDESKTOP`
was restored by 2026-08-22), so a deploy would succeed immediately.

Since 2026-08-18 this repo lives inside the **AI Wiki and Projects**
workspace, at `projects/personal/personal-website/`. `AGENTS.md` is the
adapter for that workspace's standing rules; the workspace wiki keeps a page
at `hub/wiki/architecture/projects/personal-website.md` for facts that are
about the workspace rather than the code. Everything about how the site
*works* stays here.

## First five minutes

```bash
npm install
npm run dev          # http://localhost:8787 — pages, /api/*, _redirects, _headers
npm test             # check-links + check-docs
```

**Use `npm run dev`.** There is also `npm run serve` (python, :8000) but it
ignores `_redirects`, so every pretty URL 404s under it and only the `.html`
spellings work — misleading for anything but a quick CSS poke.

There is **no build step for the site**. `public/` is what ships. Edit a file,
reload, done.

## The four documents

| file | what it is for |
|---|---|
| `HANDOFF.md` | this — orientation and current state |
| `CLAUDE.md` | how the tricky parts work, and every trap found the hard way |
| `README.md` | the file tree and the short version of each feature |
| `HOSTING.md` | where to deploy it, what it costs, and the Astro question |

**Read CLAUDE.md before changing the landing page or the book.** Both contain
things that look like mistakes and are not — a missing `preserve-3d`, a
deliberately absent `filter`, shading that has to live on one element rather
than another. Each of those cost a round of debugging to find and is written up
with the symptom it produces.

The git history is also a decision log: every commit message says *why*, not
just what. `git log` is worth ten minutes.

## What changed after the handoff

Four rounds of Ryan's feedback on 2026-08-18, plus one bug that would have
shipped broken. All of it is written up in CLAUDE.md where it belongs; this
is the index.

- **A redirect loop made every page but `/` unreachable** under wrangler —
  the asset layer's default `html_handling` fought the `_redirects`
  rewrites. `wrangler.toml` now sets `html_handling = "none"`.
- **The dust was frame-rate dependent** — tuned at 60fps, so it ran ~2.4x
  fast and dense on a high-refresh monitor. Everything is `DT`-scaled now.
  It was then rebuilt as a two-layer cloud (soft body + fine grain), slowed
  hard, confined to spawn on the book, timeboxed to real turns only, and
  taught to shed off a swinging cover's face.
- **The boards stopped moving.** Three attempts — a paced slide, a
  snap-with-settle, then two static half-boards where only opacity changes.
  Only the third stopped reading as furniture sliding around.
- **The hall grew**, the text nav shows at every size, the wake cycle runs
  on desktop, and the wizard was retraced from the ink
  (`tools/trace-wizard.py`) with a cold wizard-light on his staff.
- **Caching was wrong**: `immutable` on unhashed filenames. CSS and JS now
  answer `no-cache`; images keep a few hours.

## What is decided, and why

- **The book uses StPageFlip**, chosen over a hand-built CSS-3D version after
  building both and comparing them side by side (`compare.html`). Its fold
  geometry and drag-a-corner won. The hand-built one is still in the tree only
  because that comparison page renders it.
- **The dust is ours, not a library's.** tsParticles was tried and its emitters
  can only know *that* a flip happened, not where the page is. Ours reads the
  crease StPageFlip draws every frame and throws dust off it. Four engines were
  built and compared (`dust-lab.html`); `mist` was chosen and tuned over
  several rounds, then rebuilt as a two-layer cloud. Its numbers are the
  result of that tuning — treat them as deliberate, and read the dust section
  of CLAUDE.md before touching any of them.
- **No framework, no build step.** Argued through in HOSTING.md, including the
  case for Astro and when it becomes worth it (roughly eight pages).
- **The generated artwork is generated** by scripts in `tools/`. The leather,
  page stock, dust sprites, rings of fire, two of the three door scenes and the
  RYAN BECK lettering are all procedural and regenerable with different
  parameters. None of it is licensed stock; there is nothing to attribute. The
  book covers, the portrait and the fiction door are now Ryan's real images and
  are *not* regenerable — do not overwrite them with a `tools/` run.

## The content pass, 2026-08-18 evening

Two commits after the docs were last synced replaced most of the invented
content with real material, so anything below that still reads "placeholder"
has been narrowed to what the list in "What is not done" says.

- **Fiction, blog and portrait** (`0c6da10`) came from Ryan's own author site
  (`github.com/ryooan/ryooan.github.io`): real SEER and *Not Human* covers at
  their true 0.625 ratio with his own blurbs, a real Amazon link, all nineteen
  archive posts 2019-2023 with real dates and excerpts, his actual headshot,
  and the SEER cover art behind the fiction door. An invented pull-quote
  attributed to the novel was deleted outright — that was a fabrication, not a
  placeholder. SEER's publication year was corrected to 2019.
- **Projects** (`275f764`) replaced the six invented cards with the fourteen
  real forecasting dashboards from `ryooan.github.io`, all verified 200. The
  lede marks itself a draft for Ryan to prune. **Thumbnails are still the six
  generated placeholders**, reused across fourteen cards.
- **Images now revalidate** like the CSS and JS. The old 4h policy made swapped
  artwork look unchanged in review. `public/_headers` carries a BEFORE LAUNCH
  note to put images back on a long max-age once filenames carry a content hash.

## What is not done

Everything in "Known placeholders" in CLAUDE.md, but the short version:

- it has never been deployed. Wrangler is logged in (re-verified 2026-09-22),
  but deployment preflight requires a chosen domain/config. Publishing needs approval
- no git remote. Deployment CI is manual and requires reviewed configuration.
  `.github/workflows/forecasting.yml` refreshes the data on a schedule and
  cannot run at all until the repo has a remote
- no domain: `ryanbeck.com` is a **placeholder** (it is taken, and will not be
  the address), defined once in `site.config.json` with `"chosen": false`
- every project card uses the "light float" treatment Ryan chose from three
  lab rounds (`tools/make-project-thumbs.py`); the dashboard thumbs are real
  captures, Herder's is its real wordmark, and the projects/forecasting-data
  ledes remain drafts
- the forecasting dashboards are **done and in this repo** (2026-08-23):
  fourteen series across a generated dashboard at `public/forecasting/`,
  eleven Python fetchers in
  `tools/forecasting/`, committed CSV under `public/data/forecasting/`. Three
  were revived from dead. What remains: `COMTRADE_API_KEY` has to be added as
  an Actions secret before the scheduled workflow can run, and the chart
  module has no small-multiples view, so the committed 50-state flu file is
  not drawn yet
- the March Madness card links a deployment that is behind Vercel SSO —
  visitors get a login page until Ryan disables Deployment Protection
- the projects door scene is still generated art (the fiction and blog doors
  are real now, as are both covers and the portrait)
- the about-page copy no longer labels itself a placeholder, but it was drafted
  for him rather than by him — it still wants his voice and his sign-off
- `/api/subscribe` validates an address and then does nothing with it
- caching is deliberately loose for review; see the BEFORE LAUNCH note in
  `public/_headers`

## Working with Ryan

He reviews on a phone, so check the portrait layout before saying something is
done — several bugs in this project only appeared there. He gives precise,
concrete feedback ("0.7 of current", "70% in the page direction") and expects
those numbers to be taken literally.

He also spots when something is claimed fixed and is not, so verify by looking
at the thing rather than reasoning about the code. Most of the hard bugs here
were found by screenshotting a paused animation frame or measuring pixels on a
canvas, not by reading the source.

He reviews by **screen recording** — short `.mp4`s of the thing misbehaving.
Extract frames and look at them; several bugs here were only diagnosable a
frame at a time. When he describes motion ("it slides left"), trust the
description over your reading of the source: twice it was correct about
behavior that the current code could no longer produce, because his browser
was running cached JavaScript. Assets now answer `no-cache`, which should
retire that particular ghost.

## Integrated project apps (2026-09-25)

Projects links /mtg-cheat-sheet/ and /march-madness/. npm run dev builds the
sibling apps, applies local D1 migrations and starts all three Workers. The
8788 text editor proxies the app APIs too. HOSTING.md and docs/cloudflare-costs.md
describe the prepared Cloudflare launch. No public deployment was performed.

## September 25, 2026 interface refinements

Projects now appears in this order: MTG Cheat Sheet, Herder, Data Dashboards, National Park Guides, March Madness. MTG previews its actual rendered cheat sheet at public/assets/cards/mtg-cheat-sheet-preview.jpg using the existing light-float treatment. Capture and rebuild instructions: docs/mtg-project-artwork.md. Copy-editor mappings were regenerated after reordering.
