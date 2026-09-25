# Production hosting

## Live release, September 25, 2026

Live at https://ryanrobertbeck.com on personal Cloudflare account
`0efbd4d43122e579508d8f3b649ed990` (ryooan@gmail.com), with Ryan's launch authorization.
Namecheap registration uses Cloudflare DNS; www redirects to the canonical host.

| Service | Deployed source | Worker version |
| --- | --- | --- |
| Website / | 8e0967e | b9bef9c1-e866-4d83-a474-4a1561065a91 |
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

Generate configs with tools/configure-app-deploy.py and gitignored deployment.local.json.
Website and www redirect use separate configs. MTG daily deployments retain custom routes.
Use npm run dev locally; only public assets ship. See
[launch checklist](docs/domain-launch-checklist.md) and [costs](docs/cloudflare-costs.md).
