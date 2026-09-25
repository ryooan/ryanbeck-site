<!-- AI-CONTEXT
project: personal-website
domain: personal
group:
stack: HTML/CSS/JS, Cloudflare Worker + app service bindings; sibling React/Vite March Madness with D1/R2 and MTG Worker; StPageFlip
hosting: Cloudflare personal 0efbd4d43122e579508d8f3b649ed990; ryanrobertbeck.com; live source ea27e1d on 2026-09-25
status: active
patterns: cloudflare-workers-static-site
shared-env: none — this project uses no keys from _shared/.env
-->

# personal-website (ryanbeck-site)

Ryan Beck's personal site: a drawn portal-hall landing page, four interior pages,
an about page rendered as a book, and one Cloudflare Worker for `/api/*`.

## Live release, September 25, 2026

Live at https://ryanrobertbeck.com on personal Cloudflare account
`0efbd4d43122e579508d8f3b649ed990` (ryooan@gmail.com), with Ryan's launch authorization.
Namecheap registration uses Cloudflare DNS; www redirects to the canonical host.

| Service | Deployed source | Worker version |
| --- | --- | --- |
| Website / | ea27e1d | 5e8c2e4d-ee13-4d34-8497-3fa6cdc27756 |
| www redirect | 8e0967e | 88431447-62a8-4c56-8ed6-296cb9b60011 |
| /march-madness/ | 4e7fadf | 373eebb9-9922-4a43-9f33-b69fe33175ab |
| /mtg-cheat-sheet/ | f10af98 | b50c5e21-ef54-453b-9631-4bd98a287fa2 |

D1 `march-madness` (a3530b66-c736-4728-9a80-d7b7da106fc6) has migrations
0001-0004 and finalized 2026 revision 2. Private R2 `march-madness-private`
has indefinite retention on `final/`. Production secrets are installed. The
15-minute Worker cron is active. A production refresh, immutable final archive,
encrypted backup, hash-checked local download and offline restore into a new
SQLite database succeeded (one season and two snapshots). MTG keeps its existing
FeedbackStore/community queue and daily update workflow. No feedback was submitted
by the launch checks. Only dashboard-linked CSVs are publicly downloadable.

Verified HTTPS root, projects, blog, old author site, dashboards, privacy, both app
routes and www path/query redirect. Browser checks show the live MTG About copy,
archived bracket and Google sign-in button. Ryan confirmed production Google login works. Cross-device account saving still needs an owner check. Google client ID is configured;
production demo login is disabled. Historical availability coverage remains empty.

Local automatic backup registration was denied by Windows. The first backup is
already downloaded; the recurring task is NOT installed. Run the installer once
from an Administrator PowerShell under Ryan's account (see domain-launch-checklist).
The cloud cron/backups do not depend on that Windows task. Original Vercel remains
available for old-browser bracket transfers. Website has local Git only; its
history contains private recovered data and must be reviewed before any remote push.

Ryan was reminded before publication and explicitly deferred MTG pending definitions
and Help Improve empty-list wording until after launch. Both remain follow-ups;
the acknowledged prepublication reminder is paused.

## Read these, in order

This file is only the workspace adapter. The project's real documentation:

1. `HANDOFF.md` — orientation and current state
2. `CLAUDE.md` — how the tricky parts work and every trap found the hard way.
   **Read it before touching the landing page or the book.**
3. `README.md` — file tree and feature summaries
4. `HOSTING.md` — deployment options and the Astro question

The git history is a decision log — commit messages say why, not just what.

## Workspace notes

- App integration implemented locally 2026-09-25: /mtg-cheat-sheet/ and
  /march-madness/ route to sibling Workers, linked from Projects. MTG retains
  its existing feedback store. March Madness has yearly D1 brackets, Google
  sign-in, frozen seasons and private backups. Production resources and domain routing are live; Ryan verified production Google login. Read HOSTING.md, docs/cloudflare-costs.md
  and the sibling March Madness docs/OPERATIONS.md for launch requirements.

- Data publication boundary (2026-09-25): no data archive page. Only CSVs
  linked by actual dashboard pages may be served. Recovered datasets and the
  build manifest belong in `private-data/forecasting/`, never `public/`.
  `tools/forecasting/public-csvs.json` controls fetcher publication;
  `npm test` rejects any extra served dataset. The old author-site archive
  is separate and remains available.

- As of 2026-09-25, `npm run blog-build` generates modern versions of the
  19 archived posts under `public/posts/`, preserving their prose and media.
  Sources stay in `public/ryanbeckauthor/`; Python dependencies are in
  `tools/requirements.txt`. Validate with `python tools/check-blog.py`.
  The Blog page links both the modern posts and the explorable original site.

- Dashboard copy/layout updated 2026-09-25: the landing page has a short
  overview and a table grouped by subject page (Series, State, Data through).
  Explanations across all dashboard pages are concise; avoid em dashes and
  rhetorical contrasts. Keep generated HTML and editable copy in sync.

- Dev server: `.claude/launch.json` at the workspace root has a
  `personal-website` entry running the website on port 8787 (serves the
  static site *and* `/api/*`). Prefer it over `npm run serve` (python, :8000),
  which ignores `_redirects` — every pretty URL 404s under it.
- `wrangler.toml` sets `html_handling = "none"` because `_redirects` owns the
  pretty URLs — the platform default combines with the `200` rewrites into an
  infinite redirect loop (found and fixed 2026-08-18).
- Integrated development: `npm run dev` builds apps, migrates local D1 and runs
  three Workers (8787, 8791, 8792). `npm run edit` provides the 8788 editor.
- Checks: `npm test` checks links, docs, origin consistency and public datasets.
  `check-docs.mjs` asserts the docs still describe the code, so a doc edit
  that names a file has to name a real one.
- The repo branch is `master`; deployment CI is manual workflow_dispatch.
  Generated reviewed configs and a chosen origin are required. No remote is configured and nothing is deployed. The registered domain is
  ryanrobertbeck.com; DNS activation remains unverified.
- The hosting approach is written up as a reusable pattern at
  `hub/wiki/architecture/patterns/cloudflare-workers-static-site.md` — read it
  before starting another Cloudflare project, especially the `html_handling`
  and cache-header traps.

- Launch follow-up requested 2026-09-25: before completing publication, remind
  Ryan to implement the previously discussed MTG definitions and revise the Help
  Improve empty-list wording. Track completion in docs/march-madness-and-launch-plan.md.

Launch preparation 2026-09-25: private D1 march-madness created and seeded
(a3530b66-c736-4728-9a80-d7b7da106fc6), finalized 2026 revision 2, 68 teams.
Production secrets are generated in the March Madness gitignored private-data
directory and not uploaded yet. Privacy page prepared locally at /privacy.
Workers plan could not be read with the CLI token; Ryan must confirm it.
