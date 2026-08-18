# Start here

Ryan Beck's personal site. Five public pages plus one Cloudflare Worker.
It has never been deployed — that is still the first real task, though
wrangler is now authenticated, so it is one command away from being live.

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
- **All the artwork is generated** by scripts in `tools/`. The leather, page
  stock, dust sprites, rings of fire, door scenes and the RYAN BECK lettering
  are all procedural and regenerable with different parameters. None of it is
  licensed stock; there is nothing to attribute.

## What is not done

Everything in "Known placeholders" in CLAUDE.md, but the short version:

- it has never been deployed (wrangler is logged in; `npm run deploy` is all
  that's left — but publishing is Ryan's call, never a default)
- no git remote, and `.github/workflows/deploy.yml` triggers on `main` while
  the branch here is `master`
- no domain: `ryanbeck.com` is assumed in eight files
- every project card is invented
- the book covers, the portrait and the door scenes are placeholder art
- the about-page copy is a template that says so
- `/api/subscribe` validates an address and then does nothing with it

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
behaviour that the current code could no longer produce, because his browser
was running cached JavaScript. Assets now answer `no-cache`, which should
retire that particular ghost.
