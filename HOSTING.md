# Hosting recommendation

Reviewed September 25, 2026. This is a proposal, not a deployed architecture.

Use Ryan's personal Cloudflare account for the website and both project apps.
Keep the site's HTML/CSS/JS, MTG's Worker and March Madness's React/Vite app in
separate deployments. Adding a database does not require a website framework
conversion.

| Path on the chosen domain | Service |
| --- | --- |
| / and existing pages | Personal website Worker and static assets |
| /mtg/* | Existing MTG Worker, preserving its feedback Durable Object |
| /march-madness/* | March Madness Worker, React assets, D1 database |

Projects links directly to both tools. Use D1 for brackets/seasons, private R2
for sports snapshots, and Google sign-in with verified identity and remembered
sessions. Old Vercel brackets need an explicit transfer before retirement.

Free allowances may suffice initially; budget a $5/month Workers Paid base when
needed, plus domain and metered usage. [Current pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Before launch: select domain (ryanbeck.com is an unchosen placeholder), verify
personal account, configure private Git remotes, align master/main CI, set real
origin, test routes and inspect public assets. Only public/ ships. Private data,
source snapshots and bracket backups must stay outside it. First publication
still needs Ryan's explicit go-ahead.

See [the full audit and implementation plan](docs/march-madness-and-launch-plan.md)
for source accuracy, annual archiving, account migration, release order and
acceptance checks. No need for a new Postgres vendor or an Astro/Next.js rewrite.

[Cloudflare path routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/).
