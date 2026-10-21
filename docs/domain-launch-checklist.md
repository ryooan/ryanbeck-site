# Release checklist

## Live release, September 25, 2026

Live at https://ryanrobertbeck.com on personal Cloudflare account
Ryan's personal Cloudflare account, with Ryan's launch authorization.
Namecheap registration uses Cloudflare DNS; www redirects to the canonical host.

| Service | Deployed source | Worker version |
| --- | --- | --- |
| Website / | c38b0ce | b9bef9c1-e866-4d83-a474-4a1561065a91 |
| www redirect | c38b0ce | 88431447-62a8-4c56-8ed6-296cb9b60011 |
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
available for old-browser bracket transfers. Website source is public at
github.com/ryooan/ryanbeck-site (since 2026-10-20); Metaculus work data in the
recovered archive was purged from the history first (see private-data/README.md).

Ryan was reminded before publication and explicitly deferred MTG pending definitions
and Help Improve empty-list wording until after launch. Both remain follow-ups;
the acknowledged prepublication reminder is paused.

## Remaining owner steps

1. Visit https://ryanrobertbeck.com/march-madness/ and expand My bracket, Account
   sync, Continue with Google. Verify login and remembered account after reload;
   then verify the same saved bracket on another browser/device. If Google rejects
   the origin, edit https://console.cloud.google.com/auth/clients to include exactly
   https://ryanrobertbeck.com. Check https://console.cloud.google.com/auth/audience
   for production audience. Privacy: https://ryanrobertbeck.com/privacy.
2. Open PowerShell as Administrator under Ryan's Windows account and run:

```powershell
Set-Location 'C:\Users\ryooa\Documents\AI Wiki and Projects\projects\personal\March Madness 2026'
.\scripts\install-local-backup.ps1 -EnvironmentFile .env.backup
```

The task runs daily at 03:00 and at logon, downloads verified private archives,
and records last-success.json in private-data/production-archives. It sends no
email or Slack. Cloud collection continues when the PC is off.

## Follow-ups

- Completed 2026-09-25: approved MTG definitions published; four terms excluded.
- Completed 2026-09-25: Help Improve redesigned and empty-list wording revised.
- Review private website Git history before adding a remote source backup.
- Preserve original raw historical sports inputs in private remote storage.
- Verify the first nonempty NCAA availability feed during tournament season.
- Keep old Vercel until old-browser bracket transfers are complete.
