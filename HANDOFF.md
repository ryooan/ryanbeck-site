# Start here

Ryan Beck's personal site. Five public pages plus one Cloudflare Worker.
It has never been deployed — that is the first real task.

## First five minutes

```bash
npm install          # only needed for wrangler; the site itself has no build
npm run serve        # http://localhost:8000 — static only, and enough for everything except /api
npm run dev          # wrangler, if you are touching the Worker
node tools/check-links.mjs
```

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

The git history is also a decision log: 25 commits whose messages say *why*,
not just what. `git log` is worth ten minutes.

## What is decided, and why

- **The book uses StPageFlip**, chosen over a hand-built CSS-3D version after
  building both and comparing them side by side (`compare.html`). Its fold
  geometry and drag-a-corner won. The hand-built one is still in the tree only
  because that comparison page renders it.
- **The dust is ours, not a library's.** tsParticles was tried and its emitters
  can only know *that* a flip happened, not where the page is. Ours reads the
  crease StPageFlip draws every frame and throws dust off it. Four engines were
  built and compared (`dust-lab.html`); `mist` was chosen and tuned over
  several rounds. Its numbers are the result of that tuning — treat them as
  deliberate.
- **No framework, no build step.** Argued through in HOSTING.md, including the
  case for Astro and when it becomes worth it (roughly eight pages).
- **All the artwork is generated** by scripts in `tools/`. The leather, page
  stock, dust sprites, rings of fire, door scenes and the RYAN BECK lettering
  are all procedural and regenerable with different parameters. None of it is
  licensed stock; there is nothing to attribute.

## What is not done

Everything in "Known placeholders" in CLAUDE.md, but the short version:

- it has never been deployed
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
