<!-- AI-CONTEXT
project: personal-website
domain: personal
group:
stack: hand-written HTML/CSS/JS (no framework, no build), Cloudflare Worker for /api/*, StPageFlip + custom canvas dust engine on the about page
status: active
patterns: cloudflare-workers-static-site
shared-env: none — this project uses no keys from _shared/.env
-->

# personal-website (ryanbeck-site)

Ryan Beck's personal site: a drawn portal-hall landing page, four interior pages,
an about page rendered as a book, and one Cloudflare Worker for `/api/*`.

> ⛔ **Publishing this site needs an explicit go-ahead.** `npm run deploy`,
> `npx wrangler deploy`, pushing to a GitHub remote
> (`.github/workflows/deploy.yml` deploys `main` automatically), and pointing a
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
> So `npx wrangler deploy` would now succeed immediately. That makes the gate
> above *more* important, not less: nothing stands between a stray deploy and
> this site being publicly reachable for the first time except the rule itself.

## Read these, in order

This file is only the workspace adapter. The project's real documentation:

1. `HANDOFF.md` — orientation and current state
2. `CLAUDE.md` — how the tricky parts work and every trap found the hard way.
   **Read it before touching the landing page or the book.**
3. `README.md` — file tree and feature summaries
4. `HOSTING.md` — deployment options and the Astro question

The git history is a decision log — commit messages say why, not just what.

## Workspace notes

- Dashboard copy/layout updated 2026-09-25: the landing page has a short
  overview and a table grouped by subject page (Series, State, Data through).
  Explanations across all dashboard pages are concise; avoid em dashes and
  rhetorical contrasts. Keep generated HTML and editable copy in sync.

- Dev server: `.claude/launch.json` at the workspace root has a
  `personal-website` entry running `wrangler dev` on port 8787 (serves the
  static site *and* `/api/*`). Prefer it over `npm run serve` (python, :8000),
  which ignores `_redirects` — every pretty URL 404s under it.
- `wrangler.toml` sets `html_handling = "none"` because `_redirects` owns the
  pretty URLs — the platform default combines with the `200` rewrites into an
  infinite redirect loop (found and fixed 2026-08-18).
- Checks: `npm test` runs check-links + check-docs, the same pair CI runs.
  `check-docs.mjs` asserts the docs still describe the code, so a doc edit
  that names a file has to name a real one.
- The repo's branch is `master`; the deploy workflow triggers on `main`. No
  remote is configured, so neither is live yet.
- The hosting approach is written up as a reusable pattern at
  `hub/wiki/architecture/patterns/cloudflare-workers-static-site.md` — read it
  before starting another Cloudflare project, especially the `html_handling`
  and cache-header traps.
