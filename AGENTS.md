<!-- AI-CONTEXT
project: personal-website
domain: personal
group:
stack: hand-written HTML/CSS/JS (no framework, no build), Cloudflare Worker for /api/*, StPageFlip + custom canvas dust engine on the about page
status: active
patterns:
shared-env: none — this project uses no keys from _shared/.env
-->

# personal-website (ryanbeck-site)

Ryan Beck's personal site: a drawn portal-hall landing page, four interior pages,
an about page rendered as a book, and one Cloudflare Worker for `/api/*`.

> ⛔ **Never send without explicit instruction.** For this project the big one is
> **deploying**: `npm run deploy`, `npx wrangler deploy`, pushing to a GitHub
> remote (`.github/workflows/deploy.yml` deploys `main` automatically), and
> pointing a domain all make the site publicly reachable and need an explicit
> go-ahead in the current conversation. Full rule: workspace `AGENTS.md`.

## Read these, in order

This file is only the workspace adapter. The project's real documentation:

1. `HANDOFF.md` — orientation and current state
2. `CLAUDE.md` — how the tricky parts work and every trap found the hard way.
   **Read it before touching the landing page or the book.**
3. `README.md` — file tree and feature summaries
4. `HOSTING.md` — deployment options and the Astro question

The git history is a decision log — commit messages say why, not just what.

## Workspace notes

- Dev server: `.claude/launch.json` at the workspace root has a
  `personal-website` entry running `wrangler dev` on port 8787 (serves the
  static site *and* `/api/*`). `npm run serve` (python, :8000) works for
  everything except the API.
- `wrangler.toml` sets `html_handling = "none"` because `_redirects` owns the
  pretty URLs — the platform default combines with the `200` rewrites into an
  infinite redirect loop (found and fixed 2026-08-18).
- Checks: `node tools/check-links.mjs` and `node tools/check-docs.mjs`, both in CI.
