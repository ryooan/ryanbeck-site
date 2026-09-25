# Cloudflare costs for the website and project apps

Checked September 25, 2026. USD estimates, excluding the domain, taxes, and any
other services already billed to the same account. These are scenarios, not quotes.

Recommendation: budget **$5/month** for the complete site plus accounts/backups.
The static personal website can be free. A small application may also fit Free,
but a tournament deadline creates concentrated writes and backup jobs need CPU.
The paid plan gives comfortable headroom without a separate database subscription.

| Scenario | Assumptions | Expected Cloudflare bill |
| --- | --- | --- |
| Static site and light use | Mostly static visits; dynamic requests under 100k/day and D1 writes under 100k/day; free CPU limit respected | $0 if all free allowances fit |
| Normal personal site | Hundreds or several thousand bracket users, occasional MTG feedback, compact backups | About $5/month on Paid; usage should remain within included amounts |
| Busy tournament | 10 million dynamic Worker requests/month, average 5ms CPU each | $5.40 Workers; D1/R2/MTG added only if their allowances are exceeded |
| Very busy | 20 million dynamic requests/month, average 5ms CPU | $9.40 Workers, plus any database/storage/DO overages |
| Viral | 100 million dynamic requests/month, average 5ms CPU | $41.40 Workers, plus any database/storage/DO overages |

Static asset requests are free when served directly by Cloudflare's asset layer.
These scenarios count dynamic requests, not page views. The local gateway
forwards the apps; production configs also give each app its own path route so
assets can be served directly. Service-call CPU and actual traffic shape matter.

Paid Workers: $5 base includes 10 million requests and 30 million CPU-ms monthly.
Above that: $0.30 per million requests and $0.02 per million CPU-ms.
For 20m at 5ms: $5 + 10 x $0.30 + 70 x $0.02 = $9.40.

D1 Paid includes 25 billion rows read/month, 50 million rows written/month, and
5GB stored. Overage: $0.001/million rows read, $1/million rows written, $0.75/GB-month.
Free has daily limits: 5m reads, 100k writes. A bracket save also touches rate-limit
rows and indexes, so 1,000 people rapidly saving 63 picks can exceed Free's daily
write allowance even when storage is tiny. Debouncing reduces bursts; it does not
turn an entire bracket into a single database write.

R2 Standard includes 10GB-month, 1m writes/list operations, and 10m reads monthly.
Above that: $0.015/GB-month, $4.50/million Class A operations, $0.36/million Class B;
egress is free. For example, keeping 50GB for a full month adds about $0.60 in
storage above the 10GB allowance, before operation overages. Rounding applies.
Sports snapshots should be small; growing encrypted account backups need monitoring.

MTG's feedback Durable Object has its own request, duration and storage meters.
At a personal site's feedback volume, these should be negligible or included.
No LLM calls, paid email delivery, or paid authentication vendor is introduced.
Google sign-in uses the direct identity service.

Use the existing personal account; these allowances are account-wide, not per
app. Set usage notifications. They are not a hard spending cap. API write limits,
indexed queries, bounded scheduled work and Worker CPU limits reduce runaway use.
If the app becomes large, batch/paginate account backups and measure CPU rather
than extrapolating the examples indefinitely.

The domain is separate and depends on the selected name/TLD. No domain, paid
plan, production resource, or subscription was purchased during implementation.

Sources:
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
