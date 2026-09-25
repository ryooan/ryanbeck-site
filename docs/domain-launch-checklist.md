# ryanrobertbeck.com launch checklist

Updated September 25, 2026. Domain registered by Ryan at Namecheap. Canonical
URLs, social metadata, sitemap, robots and dashboard credits updated locally;
site tests pass. Nothing is deployed. Wrangler reports unauthenticated.

## Ryan: account steps

1. Sign in to the personal Cloudflare account: https://dash.cloudflare.com/
   Expected account ID: 0efbd4d43122e579508d8f3b649ed990 (ryooan@gmail.com).
2. Add ryanrobertbeck.com using the Free website/DNS plan. Copy the two assigned
   nameservers. Cloudflare guide:
   https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
3. At https://ap.www.namecheap.com/domains/list/ select Manage beside the domain,
   then Nameservers > Custom DNS. Enter the assigned Cloudflare nameservers and
   save. Wait for Cloudflare to mark the domain Active. Preserve any email DNS
   records if email has already been configured. Namecheap guide:
   https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/
4. In the personal Cloudflare account enable Workers Paid (separate from the
   Free website plan) and activate R2 billing. Complete billing/agreements.
   Workers: https://dash.cloudflare.com/0efbd4d43122e579508d8f3b649ed990/workers-and-pages
   R2: https://dash.cloudflare.com/0efbd4d43122e579508d8f3b649ed990/r2/overview
5. Reconnect the local deployment CLI with npx wrangler login from this project
   directory. Authorize the personal account and confirm npx wrangler whoami.
6. Personal Google Cloud: create/select a project, configure External audience,
   basic identity scopes only, required app/support/homepage/privacy information,
   and a Web application client. Authorized JavaScript origin is exactly
   https://ryanrobertbeck.com (no path). No redirect URI or client secret is used
   by our callback flow. Share only the client ID. Use In production for launch.
   Project creation: https://console.cloud.google.com/projectcreate
   Branding: https://console.cloud.google.com/auth/branding
   Audience: https://console.cloud.google.com/auth/audience
   Clients: https://console.cloud.google.com/auth/clients
   Guide: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
   Homepage/privacy links must be live for final production setup. Prepare the
   client now; coordinate launch timing rather than submitting nonexistent URLs.

## Agent: remaining work after account access

- Confirm personal account ownership and existing services before creating D1
  and private R2. Back up and preserve the existing MTG feedback Durable Object.
- Complete gitignored deployment.local.json (domain/account recorded; database
  ID and Google client ID blank). Generate real configs only after IDs exist.
- Prepare accurate privacy/support information, canonical www redirect and
  HTTPS routing for the root site, /mtg-cheat-sheet and /march-madness.
- Configure production secrets, apply migrations, preserve existing 2026 data,
  set archive locks, activate scheduled collection and local backup recovery.
- Configure private repository backups and deployment workflow access.
- Before finishing publication, remind Ryan to implement the previously
  discussed MTG definitions and revise Help Improve's empty suggestion-list
  wording. Track the original checklist in march-madness-and-launch-plan.md.
- Final public-file review and launch confirmation, then deploy apps and root.
  Test real Google sign-in, cross-device saves, MTG printing/feedback, routes,
  mobile layout, downloads and restore. Keep the old Vercel transfer available.

Sources and account links were checked against official setup guidance. Dashboard
labels can change; account links may redirect to login. No passwords or API tokens
should be pasted into chat. No purchases, account changes or remote deployments
were performed in the domain preparation step.
