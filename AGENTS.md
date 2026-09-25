<!-- AI-CONTEXT
project: personal-website
domain: personal
group:
stack: HTML/CSS/JS, Cloudflare Worker + app service bindings; sibling React/Vite March Madness with D1/R2 and MTG Worker; StPageFlip
status: active
patterns: cloudflare-workers-static-site
shared-env: none — this project uses no keys from _shared/.env
-->

# personal-website (ryanbeck-site)

Ryan Beck's personal site: a drawn portal-hall landing page, four interior pages,
an about page rendered as a book, and one Cloudflare Worker for `/api/*`.

> ⛔ **Publishing this site needs an explicit go-ahead.** `npm run deploy`,
> `npx wrangler deploy`, manually running the deploy workflow, and pointing a
> domain would all make the site **publicly reachable for the first time** — ask
> in the current conversation before any of them.
>
> This is a project rule, not the workspace send rule. The workspace rule was
> narrowed on 2026-08-21 to cover only email and Slack, and ordinary deploys no
> longer need an ask — but going from *never published* to *live on the open web*
> is not reversible, so it still does here. Workspace rule: `AGENTS.md` →
> "Never send email or Slack without explicit instruction".
>
> **Wrangler IS authenticated on this machine** (re-verified 2026-08-22 with
> `npx wrangler whoami`): OAuth as ryooan@gmail.com, account
> `0efbd4d43122e579508d8f3b649ed990`, credentials at
> `%APPDATA%\xdg.config\.wrangler\config\default.toml`. This corrects the earlier
> note here, which said the token had not survived the 2026-08-19 migration to
> `RYANDESKTOP` — true when written, no longer true.
>
> The npm deploy preflight now requires a chosen domain and generated config.
> Direct Wrangler commands can bypass that check; the publication gate still applies.

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
  sign-in, frozen seasons and private backups. Production resources/OAuth and
  domain selection remain pending. Read HOSTING.md, docs/cloudflare-costs.md
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
  Generated reviewed configs and a chosen origin are required. No remote or
  domain is configured and nothing is deployed.
- The hosting approach is written up as a reusable pattern at
  `hub/wiki/architecture/patterns/cloudflare-workers-static-site.md` — read it
  before starting another Cloudflare project, especially the `html_handling`
  and cache-header traps.

- Launch follow-up requested 2026-09-25: before completing publication, remind
  Ryan to implement the previously discussed MTG definitions and revise the Help
  Improve empty-list wording. Track completion in docs/march-madness-and-launch-plan.md.
