# Hosting recommendation

Reviewed September 25, 2026. The architecture is implemented locally; deployment is pending.

Use Ryan's personal Cloudflare account for the website and both project apps.
Keep the site's HTML/CSS/JS, MTG's Worker and March Madness's React/Vite app in
separate deployments. Adding a database does not require a website framework
conversion.

| Path on the chosen domain | Service |
| --- | --- |
| / and existing pages | Personal website Worker and static assets |
| /mtg-cheat-sheet/* | Existing MTG Worker, preserving its feedback Durable Object |
| /march-madness/* | March Madness Worker, React assets, D1 database |

Projects links directly to both tools. Use D1 for brackets/seasons, private R2
for sports snapshots, and Google sign-in with verified identity and remembered
sessions. Old Vercel brackets need an explicit transfer before retirement.

Budget a $5/month Workers Paid base for the full account/backup app, plus domain and metered usage. [Current pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Before launch: select domain (ryanbeck.com is an unchosen placeholder), verify
personal account, configure private Git remotes, configure manual CI, set real
origin, test routes and inspect public assets. Only public/ ships. Private data,
source snapshots and bracket backups must stay outside it. First publication
still needs Ryan's explicit go-ahead.

See [the full audit and implementation plan](docs/march-madness-and-launch-plan.md)
for source accuracy, annual archiving, account migration, release order and
acceptance checks. No need for a new Postgres vendor or an Astro/Next.js rewrite.

[Cloudflare path routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/).

Implementation: npm run dev starts the integrated local site. Use
`tools/configure-app-deploy.py` and `deployment.example.json` to prepare reviewed
configs after choosing the domain. Production resources and Google OAuth are
not configured. See `../March Madness 2026/docs/OPERATIONS.md` for the exact
release order, annual field review, archive locks and local backup activation.
Detailed costs: [cost scenarios](docs/cloudflare-costs.md).
