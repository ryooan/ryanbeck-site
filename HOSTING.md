# Where to put this

Your instinct is right: GitHub Pages can serve everything you've got today, but
it's static-only — no server, no database, no API routes. The moment a project
needs to store something, you'd be moving anyway. So pick the destination now
and grow into it.

Prices and limits below were checked in August 2026. Verify at signup, they drift.

---

## The recommendation: Cloudflare

**Static site + Workers + a Postgres on Neon. ~$0/month, ~$5/month once you outgrow free.**

| | |
|---|---|
| Static files | Free and unlimited. Asset requests don't count against any quota |
| Server code | 100,000 requests/day free, 10ms CPU each. Enough for a Substack proxy, a form handler, a small API |
| Beyond that | Workers Paid, $5/month → 10M requests |
| Database | Cloudflare D1 (SQLite) for simple things, or Neon Postgres — free tier is 1 project, 3 GiB, scales to zero |
| Custom domain | Free, SSL included. They sell domains at wholesale cost |
| Commercial use | **Allowed.** No asterisk |

**Why this over the alternatives:** that last row. Vercel's free Hobby plan
explicitly forbids commercial use, and their definition includes affiliate
links and anything that "serves commercial purposes." An author site pointing
at Amazon is a plausible reading of that. It's rarely enforced against small
personal sites, but you'd be building on a term you're technically violating,
and the fix is $20/month. Cloudflare has no equivalent clause.

The other reason is that your projects sound like they'll want different
backends over time — a database here, file storage there, maybe a cron job.
Cloudflare has all of those on one bill, and the step from free to paid is $5,
not $20.

**The tradeoff:** the developer experience is a notch rougher than Vercel.
Deploys are `wrangler deploy` or a GitHub connection; the docs assume you know
what a Worker is. It's an evening of learning, not a weekend.

---

## The alternative: Vercel

Worth it **if** you'd rather spend money than time. Push to GitHub, it deploys,
preview URLs for every branch, and Next.js integration that nothing else
matches. Free tier is 100 GB bandwidth and 6,000 build minutes.

Go here if: you expect to build the projects in Next.js, you want zero
infrastructure thinking, and you're fine budgeting $20/month for Pro once the
book links go up.

Pair it with Neon (Vercel resells it as Vercel Postgres) or Supabase.

---

## Databases, briefly

| | Free tier | Good for |
|---|---|---|
| **Neon** | 1 project, 3 GiB, 10 branches, scales to zero | Default choice. Real Postgres, wakes on demand |
| **Supabase** | 2 projects, 500 MB DB, 1 GB files, 5 GB bandwidth | When you also want auth, file storage, and a nice table UI |
| **Cloudflare D1** | Generous, included | Small SQLite-shaped things that live next to your Worker |
| **Turso** | SQLite, edge-replicated | Read-heavy things that need to be fast everywhere |

Start with Neon unless you want Supabase's auth and storage, in which case
start there and skip a lot of glue code.

---

## What I'd actually do

1. **Register `ryanbeck.com`** (or whatever's free) and point it at Cloudflare.
   Keep `ryanbeckauthor.com` as a redirect to `/writing` — the links out there
   still work, and you stop maintaining two sites.
2. **Deploy this as-is.** It's static files; it'll be live in ten minutes and
   cost nothing. No framework decision required yet.
3. **Add the Substack route** when you want the blog page live — one file, ~10
   lines, `functions/api/substack.js`. The client code is already written.
4. **When the first database project arrives,** convert the site to
   [Astro](https://astro.build). It's the natural next step from plain HTML:
   these files become `.astro` pages nearly unchanged, you get components and
   layouts so the header stops being copy-pasted, and you can mark individual
   routes as server-rendered while everything else stays static. Astro deploys
   to Cloudflare with an official adapter.

   The alternative is Next.js, which is more powerful and more machinery. If
   the DB projects are genuinely app-like — accounts, dashboards, live data —
   Next is the better fit. If they're mostly "a page that reads from a table,"
   Astro will be less in your way.
5. **Keep heavyweight projects on subdomains.** A forecasting tracker with its
   own database doesn't have to live inside the same codebase as your author
   page. `forecast.ryanbeck.com` can be a separate deploy, its own stack, its
   own failure modes — while the main site stays a fast, boring, static thing
   you never have to debug at midnight.

---

## What NOT to do

- **Don't put the marketing site and the database apps in one monolith.** The
  site should stay static and instant. Apps go on subdomains.
- **Don't pay for traditional shared hosting.** cPanel-and-PHP hosts are worse
  and more expensive than the free tiers above for this kind of site.
- **Don't start on a free tier that sleeps** (Render free web services, Heroku
  eco dynos). A 30-second cold start on your own homepage is miserable. The
  databases above that scale to zero are fine — that's a ~1s wake, not 30.

## Sources

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits)
- [Vercel free tier limits in 2026](https://www.promptstoproduct.com/vercel-free-tier-limits)
- [Top PostgreSQL free tiers in 2026](https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2026)
- [Platforms with a real free tier for developers in 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
