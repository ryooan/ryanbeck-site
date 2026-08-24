# Forecasting Data — investigation and plan

**Status:** plan awaiting Ryan's review. Nothing has been changed in
`ryooan/ryooan.github.io`; everything below is findings plus a proposal.

Reference clone (shallow, read-only): `../forecasting-source/`
Recovered source that had been deleted upstream:
`recovered-INFER_Trade_Data.Rmd` (see §2.4).

---

---

## 0. Status — built 2026-08-23

Decided and done: it lives in the personal-website repo (§5.1), fetchers are
Python (§5.2), charts are the custom module (§3.3).

| | |
|---|---|
| **Series on the page** | 11 — seven current, four preserved as history |
| **Fetchers written** | 10 Python scripts + a page builder, in `tools/forecasting/` |
| **Chart module** | `public/assets/js/plot.js`, ~21 KB, no dependencies |
| **Archive committed** | 124 files, 18 MB, `public/data/forecasting/archive/` |
| **Schedules** | `.github/workflows/forecasting.yml`, cadence per source |

**Three dashboards came back from the dead.** Debt limit (six months dark, and
the endpoint had moved on top of the dplyr breakage). Semiconductor trade
(three years dark, source deleted from the repo, recovered from git history
and rebuilt on the new Comtrade API with Ryan's key). Refugee admissions
(working, but the old code picked the wrong workbook off the page).

**The port is verified, not assumed.** The debt-limit rewrite reproduces the
archived R output to the dollar on all 4,579 overlapping dates, then adds 667
dates the R never saw.

**Bugs found while porting, each of which returns wrong numbers silently** —
all documented in `personal-website/CLAUDE.md`:

- Treasury drops rows if you narrow the `fields` list ($494M on 45 dates)
- An absent ceiling row means *suspended*; reading only literal `0` finds 395
  suspended days instead of 1,732 and leaves 4 of 8 suspensions unshaded
- Comtrade without `partner2Code=0` answers $2,042 where the truth is $230bn
- The refugee workbook pads unreported months with zeros, not blanks
- The old R's `1:4` page loop was ~68 rows from silently truncating history

**A second COVIDWeekly found.** HPAI depopulations looked healthy — the job
succeeds, the CSV downloads — but the CDC mirror stopped updating in June
2025. The page now says "Source stalled · data to 9 June 2025" because the
status is computed from the data's own last date.

**Phase 3 done — all fourteen accounted for.** The retired series sit under a
"No longer updating" heading, frozen at the date their source stopped:

- **COVIDWeekly** recovered. The truth files are git-lfs, so
  `raw.githubusercontent.com` serves a 132-byte pointer that parses as a valid
  one-line CSV — a fetcher would publish nothing, successfully. The bytes come
  from `media.githubusercontent.com/media/...`.
- **COVID / Flu / Weekly Hospitalizations** — three dashboards, one HHS
  source, one cause of death (RSocrata leaving CRAN, for a dependency that was
  never needed). Cross-checked against Ryan's archived R: 1,088 of 1,110
  overlapping values identical; the 22 others differ by under 1% in both
  directions near his snapshot date, which is upstream restatement.
- **Virginia Vaccinations** — 9.9M rows aggregated server-side through CKAN's
  SQL endpoint. Finishes the port Ryan began in March 2024.
- **VDH Cases by Age** — published honestly with its five-month window and a
  documented list of what was ruled out.
- **New York Evictions** — the one genuine loss. Eviction Lab returns 403 to
  automated requests and nothing survived locally. Stated in prose on the
  page; no empty frame.

### Still to do

1. **The repo has no git remote and has never been deployed.** The schedules
   cannot run until it does, and `COMTRADE_API_KEY` needs adding as an Actions
   secret. This was already the site's top open task.
2. Chart module has no small-multiples mode yet; the 50-state flu data is
   committed and waiting for it.
3. Ledes on `projects.html` and the page intro still want Ryan's voice.

---

## 1. What exists today

Fourteen dashboards live in `ryooan/ryooan.github.io` under `forecasting/`.
Each is an R Markdown document that, on every run, **fetches from an upstream
source, renders ggplot charts to PNG, base64-embeds them into a standalone
HTML file, and commits that HTML**. Nine have GitHub Actions workflows; five
have none at all.

Two structural facts drive most of this plan:

**1.1 No data is ever saved — *in the repo*.** Verified properly (2026-08-23)
against **all 9,026 commits** using a blobless clone, not just the current
tree: the only data-shaped files ever committed are ten `depends.Rds` package
caches and six `json/*.json` blog link lists. No source data, ever. Each run's
only artefact is a picture.

⚠️ **But copies DO exist on Ryan's machine, and the first version of this
plan was wrong to imply otherwise.** `~/Documents/R/` is a full local R
workspace with seventeen project folders mapping almost one-to-one onto the
dashboards, and several hold `.RData` session workspaces — which contain the
loaded data frames:

| Local folder | `.RData` | Dashboard |
|---|---|---|
| `Virginia Hospitalizations/` | **10.7 MB** | COVID / VA hospitalizations |
| `One Billion Vaccines/` | 2.4 MB **+ a 50 MB `data.csv`** | (separate project) |
| `Refugee Data/` | 855 KB | US Refugee Admissions |
| `Weekly COVID/` | 805 KB | COVIDWeekly |
| `Weekly Flu/` | 251 KB | FluWeekly |

These are real archives that the repo never had. They need R to read — both
pure-Python parsers (`pyreadr`, `rdata`) fail on them, because the workspaces
also contain ggplot objects and closures. **R is not installed on this PC**
(it did not come across in the migration), so reading them is blocked on
installing it. See §6.

**Also found locally: a fix Ryan already wrote and never shipped.**
`~/Documents/R/VA Vaccinations/VA Vaccinations Script.R` (March 2024) has
already been migrated off the dead Socrata `/resource/` endpoints onto
data.virginia.gov's **CKAN `datastore_search` API**. The published repo still
carries the broken Socrata version. That working pattern should be the basis
for the VA ports rather than writing one from scratch.

And per `backup-and-migration`, the **old PC is still the only second copy** of
several things and `Documents\Metaculus` came across only partially — so it
may hold more than this machine does.

**1.2 The repo is 2.4 GB.** Each run commits a 0.7–4.7 MB HTML with images
embedded, several of them every ten hours, for years. Git keeps every version.
That is the entire explanation for the size.

---

### 1.2 The local R archive — opened 2026-08-23

R 4.6.1 is now installed (per-user at `C:/Users/ryooa/R/R-4.6.1`; the winget
machine-wide install needs a UAC prompt that a non-interactive session cannot
answer). `~/Documents/R/` holds 18 project folders and ten `.RData` session
workspaces, all of which load. What is in them:

| Workspace | Size | The data worth keeping |
|---|---|---|
| `CDC Plot Experimentation/` | 47.7 MB | 61 data frames; `covid_data` 68,461 rows to 2024-01-05, `influenza_data` 5,300 rows, RSV, ED visits |
| `metac-cdc-data/Animations/.../R/` | 54.8 MB | 56 data frames; the same series run a week later, to 2024-01-13 |
| `CDC Plots/` | 16.7 MB | 42 data frames; `covid_data` 66,947 rows to 2023-12-08 |
| `Virginia Hospitalizations/` | 10.3 MB | `df` **66,966 x 135** - the full HHS hospital-capacity panel, all states, 2020-01-01 to 2023-07-29; `df_va` the Virginia slice |
| `One Billion Vaccines/` | 2.3 MB + 49 MB CSV | `eu_vax` 231,648 x 18 |
| `Refugee Data/` | 0.8 MB | despite the folder name, holds `debtLimit` 4,579 rows **2005-10-03 to 2023-12-21** - the Debt Limit series |
| `Weekly COVID/`, `Weekly Flu/` | 0.8 / 0.2 MB | the weekly US series behind those two dashboards |

**These are the only surviving copies of several of these series** - none of it
was ever committed (verified across all 9,026 commits) and most of the upstream
sources are dead. Extract to Parquet/CSV before anything else happens.

**One unexpectedly useful find:** the HHS panel in `Virginia Hospitalizations`
carries age-banded admissions -
`previous_day_admission_adult_covid_confirmed_18_19` through `_80`, plus
paediatric `0_4` / `5_11` / `12_17`. That is an age-stratified Virginia COVID
series covering 2020-03 to 2023-07, and it is a defensible substitute for the
retired VDH by-age dashboard: admissions rather than cases, but complete and
already local, with no gap.

**Not found, after a direct search of every workspace: VDH cases by age.** The
"age" matches in those files are `weekly_percent`*age*`_change` and
`Rolling.Aver`*age* - false positives. Section 5.4 stands.

**Never published at all:** `RSV History/` (Feb 2024) exists locally with no
counterpart in the repo.

## 2. What is actually wrong — measured, not assumed

Every source below was probed directly on 2026-08-23, and every workflow's
real run history was read. Grouped by *cause*, because the fixes differ.

### 2.1 Live and healthy — 4 dashboards

| Dashboard | Last updated | Source | Source freshness |
|---|---|---|---|
| HPAI Depopulations | 2026-08-24 | CDC bird-flu CSV | current |
| US Refugee Admissions | 2026-08-23 | wrapsnet.org (scrape) | current |
| FluWeekly | 2026-08-24 | CDC FluSight hub | to 2026-07-04 |
| FAAMG Revenues | 2026-08-18 | SEC XBRL API | to 2026-06-30 |

Note: the CDC HPAI CSV returns 403 to a plain `curl` from here but succeeds
from GitHub Actions — it is user-agent filtered, not dead. Do not "fix" it.

### 2.2 Broken code, but the source is alive — 1 dashboard

| Dashboard | Last updated | Failure |
|---|---|---|
| Debt Limit | **2026-02-03** | `summarise_each()` was removed from dplyr; the run has failed every time since |

The Treasury API is **fully current (2026-08-20)**. This is six months of
missing data caused purely by a deprecated function call. It is the single
highest-value fix in the list and it is small.

### 2.3 Running green but publishing stale data — 1 dashboard

| Dashboard | Workflow | Reality |
|---|---|---|
| COVIDWeekly | succeeds every run, updated 2026-08-24 | its source repo (`reichlab/covid19-forecast-hub`) was **archived in Nov 2024**; the data ends **2024-04-19** |

This is the most misleading state in the whole set: a green tick every ten
hours, re-committing a chart whose last real data point is over two years old.
Nothing in the current setup would ever tell you.

### 2.4 Dead upstream — 8 dashboards

| Dashboard | Last updated | What happened |
|---|---|---|
| COVID Hospitalizations | 2025-04-16 | `RSocrata` gone from CRAN → run fails. Source also frozen at 2024-04-27 |
| Flu Hospitalizations | 2025-04-15 | same `RSocrata` failure; same frozen source |
| Weekly Hospitalizations | 2022-01-13 | same frozen source; no workflow at all |
| Virginia Vaccinations | 2024-02-08 | endpoints 404; workflow **disabled manually** |
| VDH Vaccine Output | 2022-01-13 | endpoints 404; no workflow |
| VDH Age Data | 2021-08-20 | endpoints 404; no workflow; no `.Rmd` in the repo (but see §5.4 — the code is embedded in the rendered page) |
| New York Evictions | 2021-12-15 | Eviction Lab returns 403; no workflow |
| Semiconductor Trade | 2023-04-03 | legacy UN Comtrade API retired; the replacement needs an API key. **Source `.Rmd` had been deleted** |

**Good news on recovery.** Most "dead" data is still retrievable:

- **Virginia vaccinations** — the dataset moved hosts. Found and verified at
  `data.dumfriesva.gov` (the VA open-data platform): **1,307,195 rows,
  2021-01-01 → 2022-12-31**, complete. The series genuinely ended; it is not
  lost.
- **COVID hospitalizations** (`healthdata.gov` g62h) — still serves its full
  history as plain CSV, frozen at 2024-04-27. **`RSocrata` was never
  necessary** — the plain CSV endpoint works, which means that dependency
  killed two dashboards for nothing.
- **COVID truth data** (reichlab) — archived but still downloadable, to
  2024-04-19.
- **Eviction Lab** — 403 on the old URL; needs a look at their current
  distribution before calling it unrecoverable.
- **Semiconductor trade** — source recovered from git history (334 lines,
  saved here). Reviving the *data* needs a free UN Comtrade API key.
- **VDH Age Data** — the R code survives *inside* the rendered page
  (rmarkdown code folding), and the dataset is still hosted as a "RETIRED"
  CSV. Coverage has a gap; see §5.4.

---

### 2.5 VA Vaccinations — a half-finished local fix, and a live source

`~/Documents/R/VA Vaccinations/Virginia_Vaccinations.Rmd` (2024-03-20) is
20 diff-lines ahead of the published copy: it drops `read.socrata` for CKAN's
`datastore_search`. **It does not work, and shipping it as-is would be wrong.**
Two bugs, both from a rename left half-done:

```r
df <- df %>% mutate(report_date = as.Date("Report Date","%Y-%m-%d"))
```

- `"Report Date"` is a string literal, not the column - every row becomes `NA`.
- The URL carries no `limit=`, so CKAN returns its default 100 records.
- Everything downstream still uses the old Socrata snake_case names
  (`vaccination_status`, `age_group`, `people_by_vaccination_status_count`).

It is a correct instinct on the right API, not a fix. What makes finishing it
worthwhile is that **the source is alive and complete** - resource
`b05a0987-10b3-4386-b779-389affbab963`, probed 2026-08-23:

- **9,944,092 rows**, `2021-03-17` to `2023-09-19` (frozen, not truncated)
- county-level, with `Age Group Type` / `Age Group` / `Vaccination Status`
- real column names are `Report Date`, `Age Group`,
  `People by vaccination status count` - quote them

At 9.9M rows, do not paginate the whole thing. Aggregate server-side with
`datastore_search_sql` (`GROUP BY "Report Date","Age Group"`) and pull back
thousands of rows instead of millions.

## 3. Proposal

### 3.1 Separate data from presentation

The root problem is that fetching, analysis, rendering and publishing are one
inseparable step. Splitting them fixes almost everything else at once:

```
fetch (scheduled)  →  data/*.csv committed  →  one page reads it  →  charts
```

- **The archive that does not exist starts existing.** Every run commits tidy
  CSV. A source dying then costs you nothing but future rows.
- **Repo bloat ends.** Small diffable text instead of multi-megabyte HTML.
- **Charts become interactive** for free, because the page has the data.
- **Staleness becomes visible** — a chart can state its own last data date,
  so a COVIDWeekly situation announces itself.

### 3.2 Move the fetchers from R to Python

Both failures in §2.2 and §2.4 are R-ecosystem rot: a CRAN package archived,
a dplyr verb removed. Each run also installs the full R toolchain on a Windows
runner. The fetch work itself is small — HTTP, parse, tidy, write CSV.

Recommend porting the **five that still have live sources** to Python
(`requests` + `pandas`), and keeping the R files archived for reference. The
analysis logic transfers directly; it is mostly filtering and rolling sums.

*Counter-argument, honestly:* if you would rather keep writing R, the same
split works with R — the win is the split, not the language. Porting is my
recommendation, not a requirement.

### 3.3 One page, not fourteen

`forecasting-data.html` on ryanbeck.com already exists as an index of links.
It becomes the destination itself: every dashboard a section on one page, each
with an interactive chart, a plain-language note on what it is, and a status
line — **Live · updated 3 hours ago** or **Historical · ended April 2024**.

Charting options, since the site's rule today is dependency-free JS:

| Option | Size | Trade-off |
|---|---|---|
| **Custom SVG module** | ~12 KB | Matches the site's parchment/ember palette exactly; no dependency; most work. Most charts here are the same shape, so one module covers them |
| **uPlot** | ~45 KB | Excellent time-series interaction out of the box; a new dependency; needs restyling to fit |
| Chart.js | ~200 KB | Familiar; heavier; generic look |
| Plotly (what `ggplotly` gives) | ~3 MB | Rejected — larger than the whole site |

Recommend the **custom module**: eight of these are plain time series, and the
site already has a strong visual identity that a generic library would fight.
Two charts (FluWeekly, COVIDWeekly) use 50-state small multiples, which the
module needs to handle as a panel grid.

### 3.4 Right-size the schedules

Several run **every ten hours** against data that updates weekly or
quarterly. Proposed: Treasury daily; FluSight and HPAI weekly; refugees
monthly; SEC quarterly. Retired ones run never.

---

## 4. Phases

**Phase 0 — archive everything reachable (do first, regardless of the rest).**
Snapshot all still-reachable sources to CSV: VA vaccinations, COVID
hospitalizations, reichlab truth, plus current state of the live five. Three
sources have already gone dark with no local copy; this stops the bleeding.
Small, and it is the only step that gets *more* expensive by waiting.

**Phase 1 — fix Debt Limit.** Live source, six months missing, one defunct
function. Highest value per hour in the project.

**Phase 2 — build the pipeline and the page.** Fetchers for the five live
dashboards; the chart module; the unified page; status lines driven by the
data's own last date.

**Phase 3 — fold in the retired ones** as historical sections, reading from
the Phase 0 archive, clearly labelled with the date the series ended.

**Phase 4 — decommission.** Point the old URLs at the new page, stop the old
workflows, and decide what to do about the 2.4 GB repo.

---

## 5. Decisions

### 5.1 Where it lives — DECIDED (Ryan, 2026-08-23): the personal-website repo

Put the whole thing inside `projects/personal/personal-website/`:

```
tools/forecasting/*.py              the fetchers
public/data/forecasting/*.csv       the committed data (and the archive)
public/forecasting-data.html        the one page, already exists
.github/workflows/forecasting-*.yml the schedules
```

Four reasons, in order of weight:

1. **The page reads its own origin.** `fetch('/data/forecasting/hpai.csv')` —
   no CORS, no rate limits, no runtime dependency on GitHub being up. Any
   other arrangement means the site either fetches cross-origin at runtime or
   grows a build step, and the site's whole premise is that it has neither.
2. **One deploy.** A data commit *is* a site deploy on Cloudflare. Nothing to
   orchestrate across repos.
3. **Cloudflare serves static assets free and unlimited** — only `/api/*`
   costs against the free tier. CSV files are exactly the free case.
4. **Python tooling there is established precedent**, not a new pattern:
   `tools/` already holds six Python generators (`make-fire.py`,
   `prep-scene.py`, `make-project-thumbs.py`, and others). Fetchers sit
   naturally beside them.

**The honest costs.** The website repo takes on scheduled commit churn — a
few KB of CSV per run, versus the 0.7–4.7 MB of HTML the old repo commits, so
this is roughly a thousandth of the current rate. And it makes *giving the
website repo a git remote* a hard prerequisite; it has none today and has
never been deployed (`HANDOFF.md`). That is already the site's top open task,
so this forces a decision that was pending anyway rather than adding a new one.

*If you would rather keep them apart*, the alternative is a separate
`forecasting-data` repo whose workflow pushes CSV into the website repo. It
works, it is just more moving parts for no gain I can see.

### 5.2 Fetchers in Python — DECIDED (Ryan, 2026-08-23)

Porting the live fetchers to Python. The R sources stay archived for
reference; both real failures were R-ecosystem rot.

### 5.3 Semiconductor trade — DECIDED and UNBLOCKED

The legacy Comtrade API is gone (302s to nowhere) and the replacement returns
401 without a key. The free tier is real and sufficient: **500 calls/day, up
to 100,000 records per call** — this dashboard needs about four calls a month.

**This needs you, not me — I do not create accounts.** Two minutes:

1. Create a UN Comtrade account, then sign in at
   <https://comtradedeveloper.un.org>
2. **Products → Free APIs** (listed as `comtrade - v1`), give the
   subscription any name, and the key is generated on the spot.
3. Put it in `_shared/.env` as `COMTRADE_API_KEY=...` and tell me.

The key goes in the `Ocp-Apim-Subscription-Key` header. I will keep it out of
the committed data and out of the repo; only the fetched numbers get
committed. The recovered `.Rmd` (§2.4) has the exact HS commodity codes the
old charts used, so the port is faithful rather than reinvented.

### 5.4 VDH Age Data — DECIDED: rebuild, with one caveat you should see first

**The code was never lost.** It is embedded in the rendered page — rmarkdown's
code folding means `VDH_Age_Data.html` carries its own full R source. Read it
back out; no archaeology needed. Same for any other dashboard whose `.Rmd`
went missing.

**The data is partly recoverable, and there is a hole in the middle:**

| Period | Source | Status |
|---|---|---|
| 2020-07 → 2021-01 | Wayback captures of the old Socrata endpoint | **50 daily cumulative snapshots** — sparse but real |
| 2021-01 → 2024-04 | nothing found | **gap** |
| 2024-04 → 2024-09 | VDH "RETIRED Dataset" CSV, still hosted | **complete daily**, 73,920 rows, 35 districts, 11 age bands |

Checked and ruled out, so nobody re-treads it: Wayback only ever captured
Socrata's default first 1,000 rows (~one day each); CDC's by-age series is
HHS-region level, not state; and the CKAN **datastore** behind the retired
dataset holds exactly the same 73,920 records (confirmed by SQL query against
it) — VDH genuinely truncated what it publishes. No local copy references this
dataset either. The gap is real, not an artefact of looking in one place.

So the rebuild produces a chart with a visible hole in it. Three ways to go,
and this one is genuinely your call:

- **Rebuild honestly** — plot what exists, mark the gap, note that VDH stopped
  publishing. A chart that shows its own gap is more truthful than one that
  quietly interpolates.
- **Rebuild the 2024 window only**, as a clean short series.
- **Keep hunting** — the remaining long shots are academic mirrors and any
  copy VDH gave to researchers. I would time-box this rather than open-end it.

My recommendation is the first: it is the only version that does not misstate
what is known.


**Key received and verified 2026-08-23.** Ryan's "ryan key" subscription is in
`_shared/.env` as `COMTRADE_API_KEY` (that file is gitignored - confirmed, not
assumed). Tested live against the recovered HS codes:

```
US -> China, HS 854231/2/3/9, annual
  2024  $5,763,497,658 / $33,730,180 / $365,684,166 / $2,500,753,114
  2023  $2,511,992,830 / $41,034,340 / $391,415,263 / $2,126,769,748
```

Auth is the `Ocp-Apim-Subscription-Key` header. The dashboard can be fully
revived on live data; the local `.Rmd` (2023-08-23) matches the copy recovered
from git history apart from line endings and three scratch URLs.

## 6. Still open (all resolved)


1. ~~Chart module~~ — DECIDED: custom. Built and in use.
2. **The old repo's 2.4 GB** — leave it, or rewrite history to shrink it?
   Destructive and needs a force-push; I will not touch it without an explicit
   go-ahead.
