# Historical audit and implementation plan

This records the pre-implementation audit on September 25, 2026. The proposed
changes are now implemented locally; the current status and remaining launch
steps are in HOSTING.md and the sibling March Madness docs/OPERATIONS.md. The
requested MTG address is /mtg-cheat-sheet/. No public cutover has occurred.

# March Madness audit and website launch plan

September 25, 2026. Investigation and proposed implementation. No app behavior,
accounts, hosting, or scheduled jobs changed during this audit.

## Findings

The app is client-only React/Vite. There is no backend, database, or account
service. Its documentation incorrectly said there were no API calls.

| Data | Actual source | Finding |
| --- | --- | --- |
| Teams, seeds, records, rankings | Hardcoded teams.ts and bracketSeeding.ts; comments cite ESPN, Yahoo, NCAA, bballnet and AP | March 2026 snapshot; source comments are not independent verification of every field. |
| Efficiency, tempo, KenPom rating | Estimates from rank orderings and selected anchors | Must not present these as sourced KenPom measurements. |
| Top-25 totals, home/away splits, lower-seed NET | Many explicitly estimated | Affect rankings materially. SOS ratings also lack field-level provenance. |
| Injuries | Static March 18 entries; comments cite SI and SportsBettingDime | No live injury integration. About page instead claims RotoWire. |
| Results | ESPN scoreboard, hardcoded 2026 dates, one-hour browser cache | Loaded on mount, not continuously polled. Only two First Four results bundled as fallback. |
| H2H/common opponents | ESPN schedules with season=2026 and seasontype=2; 24-hour browser cache | Restricted to tournament-field opponents; fixed AP ranking, not ranking at game time. Two team schedule IDs missing; other schedules recover some encounters. |
| Brackets | Zustand persist in localStorage, mm2026-bracket | One browser and origin, no account or server copy. Clearing storage can lose it. |
| Share links | Array-position encoding | No season identifier; changing team/matchup order breaks old links. Opening a link replaces saved picks. |

Reviewed source under projects/personal/March Madness 2026/: hooks
useTournamentResults, useTop25GameLogs, useAppTeams; data teams, headToHead,
tournamentResults, bracketSeeding; powerScore, bracketLogic, bracketEncoder;
bracketStore; BracketBuilder and About components.

### Reproduced errors

1. In America/Chicago, UTC-parsed date strings followed by local getters generate
   March 16-April 5. The April 6 championship is never requested.
2. Five actual ESPN display names are missing from the results lookup:
   Miami (OH) RedHawks, Pennsylvania Quakers, Long Island University Sharks,
   Queens University Royals, and St. John's Red Storm. Missing early results
   prevent subsequent rounds from resolving.
3. Replaying the complete 2026 scoreboards through the existing resolver yields
   **44 of 67 results**. Supplying the full intended date range and adding those
   aliases in memory yields **67 of 67**, including Michigan as champion.
   This was a diagnostic experiment, not an app source fix.
4. Per-date failures are swallowed; incomplete responses can replace a good
   cache without an incomplete-data warning.

All 21 daily requests succeeded, returning 67 completed games. Full responses,
URLs, and fetch timestamps are saved privately in:
private-data/march-madness/2026-scoreboard-audit-20260925T060516Z.json.
This is outside public/ and is not a downloadable website dataset.

Additional probes returned the 2025 final (Florida 65, Houston 63), the 2026
final (Michigan 69, UConn 63), and both bundled First Four results matching the
app. Duke's requested 2026 schedule returned 34 events from November 2025 through
March 2026, although top-level metadata said 2027 preseason. Validate event dates
and requested season explicitly. This was a targeted audit, not an independent
cross-check of every statistic or injury against a second provider.

CTRS is an unvalidated heuristic, not a calibrated prediction. Its H2H input is
empty, giving every team the same ten points from the nominal 20% component.
Fetched H2H data feeds panels but never recomputes CTRS. Estimated Top-25 records,
efficiency and away splits account for another 60% of nominal weights. Remove
unsupported numbers or label them clearly, collect real inputs, and evaluate
historical performance before treating this as a reliable ranking.

The bracket colors correct/wrong picks but has no annual score history or
server-enforced deadline. Actual winners fill empty display slots and must never
be credited as predictions. Existing 2026 picks have no trusted submission time;
imported scores must be labeled retrospective, not verified pre-tournament entries.

## Durable yearly data

Historical ESPN data is available today. No retention/availability guarantee has
been established for these endpoints. Browser cache expiry is not archival
storage. Static source data survives locally; most fetched results/logs do not.
There is no database to persist in yet.

1. Fetch centrally from a scheduled Cloudflare Worker during the season. Store
   normalized season/team/game records in D1. Use stable provider IDs and event
   IDs, explicit tournament identity, UTC-safe dates, retries, freshness status,
   and last-known-good data. Reject incomplete replacements.
2. Keep raw responses and normalized snapshots in private R2 with URLs, fetch
   times, hashes, schema and model/scoring versions. Preserve selection-time
   analytics separately from final results to prevent hindsight contamination.
3. Once the final is complete, reconcile the expected bracket and game count
   against NCAA results. For 2026 the count is 67; future formats are configurable.
   Proposed correction window: 72 hours. Finalize only when completeness passes.
4. Freeze the season revision transactionally in D1 and reject routine edits.
   Later corrections create audited revisions. Make finalization retries safe.
5. Export verified database backups and final sports snapshots. Use R2 retention
   locks for finalized sports records. Keep personal/account/bracket backups
   separate, encrypted and subject to an appropriate retention policy, not an
   indefinite public-sports-data lock.
6. A local scheduled pull copies finalized archives and private backups to an
   append-only workspace folder and verifies hashes. If this PC is off, cloud
   copies persist and the local job catches up on its next run. Report failed
   or overdue copies. Test restoring a season without contacting ESPN.
7. D1 Time Travel is short-term recovery, not a permanent annual archive.

No retention locks or jobs are enabled yet. The saved scoreboards are a first
recovery snapshot, not a full season or user-bracket backup.

## Seasons, accounts, and scores

- Latest published season at /march-madness/; year picker and stable historical
  paths such as /march-madness/2026/bracket. Distinguish tournament year from
  basketball season label (2025-26).
- D1 entities: users, sessions, seasons, season_teams, games, source_snapshots,
  brackets, picks, scoring_versions, finalizations. Scope identifiers, caches
  and share links by season/revision.
- Discover each announced field and schedule, validate seeds/regions/play-in
  slots/round connections, then publish. Do not switch merely on January 1 or
  guess future fields. Unexpected formats or incomplete data require review.
- Guests build immediately. Offer **Save across devices** with Google sign-in.
  First sign-in creates the account and imports the guest draft, after showing
  any existing saved bracket. Use Ryan's personal Google Cloud project and
  minimal identity scope. Verify tokens server-side with a maintained library
  and create secure remembered sessions. An email-code option can follow if
  non-Google access is needed; no work OAuth credentials.
- Enforce ownership on every request, CSRF protection, rate limits, conflict
  detection and explicit saved/offline status. Public sharing is opt-in.
- Keep actual results separate from predictions. Store submitted picks and a
  scoring version. Proposed main-bracket points: 1/2/4/8/16/32; First Four shown
  separately. Show points, correct picks and round totals. Enforce the published
  deadline server-side; late practice brackets are labeled. New seasons never
  overwrite past brackets.
- Preserve the exact original 2026 decoder and array ordering. New links carry
  season/schema versions. Preview and validate imports before replacing picks.
  The new domain cannot read Vercel localStorage. Provide export/transfer on the
  old origin before retiring it. Existing Share Bracket links also carry picks.
  Lost browser storage without a saved link/export cannot be recovered centrally.

## Hosting recommendation

Use Ryan's personal Cloudflare account and separate deployments:

| New-domain path | Service |
| --- | --- |
| / and existing website pages | Existing website Worker and static assets |
| /mtg-cheat-sheet/* | Existing MTG Worker and feedback Durable Object |
| /march-madness/* | React/Vite assets, new Worker API and D1 |

Keep both tools in Projects. No website framework rewrite is needed. Cloudflare
supports path-based Worker routes over a root Custom Domain. Handle bare path
redirects, Vite asset base, React Router basename, nested reloads and share URLs.
API requests must not fall through to the SPA HTML.

MTG already has a private community feedback database: a SQLite-backed Durable
Object. Preserve the existing Worker name, class, migrations and binding on the
same personal account. Back up the feedback queue and test its same-origin
checks and cookies on the new domain. Old browser cookies do not transfer across
origins. Keep its daily GitHub refresh/deploy workflow. Copying only static files
would lose its API.

The site has no remote. Ryan registered ryanrobertbeck.com on 2026-09-25;
local canonical URLs are updated. Cloudflare login is restored; D1 is initialized. Domain onboarding, R2
activation and Google OAuth are pending.
Its deployment workflow is now manual. At audit time, March Madness had
no project Git repo; its recorded Vercel account is the work account. Current
Vercel production availability was not reverified in this audit.

Budget free allowances initially if sufficient; allow a $5/month Workers Paid
base when needed, plus domain registration and metered storage/usage. This is
not an all-inclusive quote. Configure usage alerts and limits. No separate
Postgres vendor or Vercel Pro subscription is needed for this proposal.

## Delivery sequence

1. **Preserve and repair 2026:** Git/private personal remote, preserve original
   decoder, collect schedules as well as scoreboards, fix dates/IDs/errors and
   misleading labels. Validate all 67 games against the official bracket.
2. **Yearly storage:** schemas, ingestion, finalization, private backups, local
   catch-up, 2026 backfill, and future-season fixtures.
3. **Accounts/history:** guest import, Google sign-in, autosave, scoring, past
   years, legacy transfer. Test cross-device restore and ownership isolation.
4. **Domain preparation:** choose domain, verify personal Cloudflare account,
   configure private remotes and CI branches/secrets, update origin/canonicals,
   add MTG to Projects, and stage path routing. Preserve MTG database identity.
5. **Publish/migrate:** run site and app checks, inspect final public artifacts,
   obtain first-publication go-ahead, launch and test real-domain saves, auth,
   feedback, routes and downloads. Keep old bracket transfer available until
   verified; then redirect old links preserving encoded picks. Retain rollback
   deployments and backups. Do not delete the Vercel project at initial cutover.

Only the existing dashboard-linked CSV downloads remain public. Never restore
the removed data archive or expose Metaculus/expert-elicitation datasets, raw
sports archives or private bracket backups. The old author site and migrated
blog posts remain separate from data archiving.


## Before completing publication: MTG follow-up

Requested by Ryan September 25, 2026. Remind Ryan of these remaining items before
final launch approval or completion of the full publication process:

- [ ] Implement the MTG mechanic definitions from the previously discussed list.
  Retrieve the actual proposed definitions from the conversation/review records;
  do not treat this reminder as approval of new or invented definitions.
- [ ] Revise the Help Improve page wording and empty state so an empty suggestion
  list reads naturally after the pending definitions are resolved.

Keep these items visible in the launch review until completed or explicitly
deferred by Ryan. A thread reminder also checks for approaching publication.

## Acceptance checks

- 67/67 2026 results including final, in UTC and Chicago.
- Source failures preserve complete data with visible freshness.
- Frozen season renders and scores with ESPN unreachable; backup restore agrees.
- New season preserves 2026 teams, picks, links and score versions.
- Guest import, legacy links and two-device login preserve picks.
- Ownership and deadlines enforced server-side; actual winners never earn picks.
- All domain paths survive direct reload; MTG feedback persists; site's public
  download allowlist still passes.

## Sources checked September 25, 2026

- [ESPN 2026 final](https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&dates=20260406&limit=50)
- [ESPN 2025 final](https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&dates=20250407&limit=50)
- [Cloudflare path routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/)
- [R2 retention locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Google identity verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

Launch preparation 2026-09-25: private D1 march-madness created and seeded
(a3530b66-c736-4728-9a80-d7b7da106fc6), finalized 2026 revision 2, 68 teams.
Production secrets are generated in the March Madness gitignored private-data
directory and not uploaded yet. Privacy page prepared locally at /privacy.
Workers plan could not be read with the CLI token; Ryan must confirm it.
