"""Generate public/forecasting-data.html from the manifest and the series list.

The page is generated rather than hand-written because its status lines have
to come from the data. A hand-written "updated weekly" is a claim that rots;
"Data ends 9 June 2025" is a fact the file itself can be asked for. That
distinction is the entire reason this rebuild exists -- COVIDWeekly showed a
green tick every ten hours for two years while publishing a series that had
stopped.

Run after the fetchers:

    python tools/forecasting/build_page.py
"""
import datetime as dt
import html
import json
import os

from _common import DATA, ROOT, load_manifest

OUT = os.path.join(ROOT, "public", "forecasting-data.html")

# Order is editorial: what is live and interesting first, what is frozen
# after, and the archive last.
SECTIONS = [
    {
        "slug": "debt-limit",
        "title": "US debt limit",
        "csv": "debt-limit.csv",
        "plot": {
            "format": "usd-millions",
            "series": [
                {"col": "debt_subject_to_limit", "label": "Debt subject to limit"},
                {"col": "statutory_limit", "label": "Statutory ceiling", "dash": True},
            ],
            "band": {"col": "suspended", "label": "Limit suspended"},
        },
        "note": (
            "Federal debt subject to the statutory ceiling, from Treasury's "
            "Daily Treasury Statement, against the ceiling itself. The shaded "
            "stretches are the eight periods when Congress suspended the limit "
            "rather than raising it — during a suspension there is no "
            "number to plot, so the ceiling line stops."),
        "source": "Treasury Fiscal Data, Daily Treasury Statement",
        "source_url": "https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/debt-subject-to-limit",
    },
    {
        "slug": "refugee-admissions",
        "title": "US refugee admissions",
        "csv": "refugee-admissions.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [{"col": "admissions", "label": "Arrivals in month"}],
        },
        "note": (
            "People admitted to the United States as refugees each month, from "
            "the State Department's Refugee Processing Center. Fiscal years run "
            "October to September; the annual ceiling is set by presidential "
            "determination and is a cap, not a target."),
        "source": "State Department Refugee Processing Center",
        "source_url": "https://www.wrapsnet.org/admissions-and-arrivals/",
        "extra_csv": "refugee-admissions-annual.csv",
    },
    {
        "slug": "refugee-admissions-annual",
        "title": "Refugee admissions by fiscal year",
        "csv": "refugee-admissions-annual.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [
                {"col": "admissions", "label": "Admitted"},
                {"col": "ceiling", "label": "Presidential ceiling", "dash": True},
            ],
        },
        "note": (
            "The same arrivals totalled by fiscal year, back to 1975 — the "
            "Vietnamese and Soviet resettlements are the two peaks. The dashed "
            "line is the annual ceiling set by presidential determination, a "
            "cap rather than a target, and only published for recent years."),
        "source": "State Department Refugee Processing Center",
        "source_url": "https://www.wrapsnet.org/admissions-and-arrivals/",
    },
    {
        "slug": "faamg-revenues",
        "title": "Big-tech combined revenue",
        "csv": "faamg-revenues.csv",
        "plot": {
            "format": "usd-billions",
            "zero": True,
            "series": [
                {"col": "combined", "label": "All five combined"},
                {"col": "amazon", "label": "Amazon"},
                {"col": "apple", "label": "Apple"},
                {"col": "alphabet", "label": "Alphabet"},
            ],
        },
        "note": (
            "Annual revenue of Alphabet, Amazon, Apple, Meta and Microsoft, "
            "read straight out of their SEC filings. Billions of dollars. The "
            "five do not share a fiscal calendar — Apple's year ends in "
            "September and Microsoft's in June — so the combined line is "
            "blank for any year where they have not all filed yet."),
        "source": "SEC XBRL company facts",
        "source_url": "https://www.sec.gov/edgar/sec-api-documentation",
    },
    {
        "slug": "flu-hospitalizations",
        "title": "US influenza hospitalisations",
        "csv": "flu-hospitalizations.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [{"col": "admissions", "label": "Weekly admissions"}],
        },
        "note": (
            "Weekly hospital admissions with a confirmed influenza diagnosis, "
            "from the CDC's FluSight forecasting hub. Per-state figures are in "
            "the companion file."),
        "source": "CDC FluSight forecast hub",
        "source_url": "https://github.com/cdcepi/FluSight-forecast-hub",
        "extra_csv": "flu-hospitalizations-states.csv",
    },
    {
        "slug": "flu-hospitalizations-states",
        "title": "Influenza admissions, state by state",
        "csv": "flu-hospitalizations-states.csv",
        "plot": {
            "format": "rate",
            "panelBy": "location",
            "value": "rate_per_100k",
            "panelNote": ("Admissions per 100,000 residents, so a small state "
                          "and a large one can be read against each other."),
        },
        "note": (
            "The same weekly flu admissions, split by state and shown as a "
            "rate per 100,000 residents. Every panel shares one vertical "
            "scale, so the boxes are directly comparable. The rate rather "
            "than the raw count is what makes that readable: on raw "
            "admissions Texas out-tops Hawaii fifty-five-fold and most of "
            "the grid flattens into unreadable slivers, where per head the "
            "spread is about four-fold and each state’s season has a "
            "visible shape."),
        "source": "CDC FluSight forecast hub",
        "source_url": "https://github.com/cdcepi/FluSight-forecast-hub",
    },
    {
        "slug": "semiconductors-us-exports-china",
        "title": "US semiconductor exports to China",
        "csv": "semiconductors-us-exports-china.csv",
        "plot": {
            "format": "usd",
            "zero": True,
            "series": [
                {"col": "chips", "label": "Chips (HS 8542)"},
                {"col": "equipment", "label": "Manufacturing equipment"},
            ],
        },
        "note": (
            "Monthly US exports to China of semiconductors and of the "
            "equipment used to make them, from UN Comtrade. This one was dead "
            "for three years: the old Comtrade endpoint was retired and the "
            "code that built the page had been deleted from the repo. The code "
            "was recovered from git history and the series now runs on the "
            "current API."),
        "source": "UN Comtrade",
        "source_url": "https://comtradeplus.un.org/",
    },
    {
        "slug": "semiconductors-china-imports",
        "title": "China's semiconductor imports",
        "csv": "semiconductors-china-imports.csv",
        "plot": {
            "format": "usd",
            "zero": True,
            "series": [
                {"col": "chips", "label": "Chips (HS 8542)"},
                {"col": "equipment", "label": "Manufacturing equipment"},
            ],
        },
        "note": (
            "What China buys from the whole world, annually — the "
            "denominator for the export series above."),
        "source": "UN Comtrade",
        "source_url": "https://comtradeplus.un.org/",
    },
    {
        "slug": "hpai-depopulations",
        "title": "Birds killed in the bird-flu outbreak",
        "csv": "hpai-depopulations.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [
                {"col": "cumulative", "label": "Running total"},
                {"col": "birds", "label": "Killed that week"},
            ],
        },
        "note": (
            "Birds killed in confirmed commercial and backyard flocks during "
            "the H5N1 outbreak. Weekly counts are spiky because a single "
            "commercial layer flock can be several million birds on its own, "
            "so the running total is the clearer line."),
        "source": "CDC mirror of USDA APHIS confirmed detections",
        "source_url": "https://www.cdc.gov/bird-flu/situation-summary/data-map-commercial.html",
    },
    {
        "slug": "covid-weekly-admissions",
        "title": "US COVID hospital admissions, weekly",
        "csv": "covid-weekly-admissions.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [{"col": "admissions", "label": "Weekly admissions"}],
        },
        "note": (
            "This is the series that prompted the rebuild. Its job succeeded "
            "every ten hours for two years and republished a chart each time, "
            "while the repository behind it had been archived in November 2024 "
            "and the data had stopped the previous April. Nothing in the old "
            "setup would ever have mentioned it."),
        "source": "reichlab COVID-19 Forecast Hub (archived)",
        "source_url": "https://github.com/reichlab/covid19-forecast-hub",
    },
    {
        "slug": "covid-hospitalizations",
        "title": "COVID and flu patients in hospital",
        "csv": "covid-hospitalizations.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [
                {"col": "adult_covid", "label": "Adults with COVID"},
                {"col": "influenza", "label": "Confirmed influenza"},
                {"col": "icu_covid", "label": "COVID in adult ICU"},
            ],
        },
        "note": (
            "Patients in hospital on a given day, summed across reporting "
            "states, from the HHS capacity dataset. Three of the old "
            "dashboards ran on this one source and all three died together "
            "when the R package they used to read it left CRAN — the plain "
            "CSV export worked the whole time. HHS later ended the reporting "
            "requirement, so the series genuinely stops in April 2024."),
        "source": "healthdata.gov g62h-syeh (HHS)",
        "source_url": "https://healthdata.gov/dataset/g62h-syeh",
        "extra_csv": "covid-hospitalizations-va.csv",
    },
    {
        "slug": "va-vaccinations",
        "title": "Virginia COVID vaccinations",
        "csv": "va-vaccinations.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [
                {"col": "at_least_one_dose", "label": "At least one dose"},
                {"col": "fully_vaccinated", "label": "Fully vaccinated"},
            ],
        },
        "note": (
            "People in Virginia by vaccination status. The dashboard broke in "
            "early 2024 when the state retired the endpoints it read, and the "
            "job was switched off by hand. The data was never lost — it "
            "moved to Virginia's open-data platform and the history is "
            "complete, nearly ten million rows of it. Per-age-group figures "
            "are in the companion file."),
        "source": "data.virginia.gov (VDH)",
        "source_url": "https://data.virginia.gov/",
        "extra_csv": "va-vaccinations-by-age.csv",
    },
    {
        "slug": "vdh-cases-by-age",
        "title": "Virginia COVID cases by age",
        "csv": "vdh-cases-by-age-wide.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "series": [{"col": "total_cases", "label": "Cumulative cases"}],
        },
        "note": (
            "Five months, and that is all there is. VDH retired this dataset "
            "and kept only 2024 — everything before April of that year is "
            "gone from the source. Before publishing this as a stub I checked "
            "the Internet Archive (its captures hold about one day of data "
            "each), the CDC's equivalent (region-level, not state), the "
            "datastore behind the retired set (73,920 rows and no more), and "
            "every R workspace on my own machine. It is genuinely gone. For "
            "an age-stratified Virginia series with no hole in it, the HHS "
            "panel above carries age-banded admissions from 2020 to 2023."),
        "source": "data.virginia.gov (VDH, retired dataset)",
        "source_url": "https://data.virginia.gov/",
        "extra_csv": "vdh-cases-by-age.csv",
    },
]

STATUS_WORDS = {
    "live": "Live",
    "stale": "Source stalled",
    "historical": "Historical",
}


def human(iso):
    d = dt.date.fromisoformat(iso[:10])
    return "%d %s %d" % (d.day, ["January", "February", "March", "April",
                                 "May", "June", "July", "August", "September",
                                 "October", "November", "December"][d.month - 1],
                         d.year)


def age_phrase(iso):
    days = (dt.date.today() - dt.date.fromisoformat(iso[:10])).days
    if days <= 10:
        return "up to date"
    if days < 75:
        return "%d days ago" % days
    if days < 400:
        return "about %d months ago" % round(days / 30.4)
    return "about %.1f years ago" % (days / 365.25)


def e(s):
    return html.escape(str(s), quote=True)


def section_html(sec, meta):
    info = meta.get(sec["slug"])
    if not info:
        return ""                       # no data fetched yet: omit entirely

    status = info["status"]
    word = STATUS_WORDS.get(status, status.title())
    last = info["last_date"]

    plot = dict(sec["plot"])
    plot["csv"] = "/data/forecasting/" + sec["csv"]
    plot["x"] = "date"
    plot["alt"] = sec["title"]
    cfg = e(json.dumps(plot, separators=(",", ":")))

    downloads = ['<a href="/data/forecasting/%s">%s</a>'
                 % (sec["csv"], sec["csv"])]
    if sec.get("extra_csv"):
        downloads.append('<a href="/data/forecasting/%s">%s</a>'
                         % (sec["extra_csv"], sec["extra_csv"]))

    return """
  <section class="series" id="%(slug)s">
    <span class="status is-%(status)s">%(word)s &middot; data to %(last_h)s</span>
    <h2>%(title)s</h2>
    <p class="series-note">%(note)s</p>
    <div class="plot-mount" data-plot='%(cfg)s'></div>
    <p class="series-source">%(rows)s rows, latest %(age)s &middot;
      source: <a href="%(surl)s" rel="noopener">%(source)s</a> &middot;
      download: %(dl)s</p>
  </section>
""" % {
        "slug": e(sec["slug"]),
        "status": e(status),
        "word": e(word),
        "last_h": e(human(last)),
        "title": e(sec["title"]),
        "note": sec["note"],
        "cfg": cfg,
        "rows": format(info["rows"], ","),
        "age": e(age_phrase(last)),
        "surl": e(sec["source_url"]),
        "source": e(sec["source"]),
        "dl": " &middot; ".join(downloads),
    }


def build():
    meta = load_manifest().get("series", {})

    def group(pred):
        return "".join(section_html(x, meta) for x in SECTIONS
                       if x["slug"] in meta and pred(meta[x["slug"]]["status"]))

    live_html = group(lambda st: st != "historical")
    hist_html = group(lambda st: st == "historical")
    body = live_html
    if hist_html:
        body += HIST_HEADING + hist_html

    live = sum(1 for s in SECTIONS
               if meta.get(s["slug"], {}).get("status") == "live")
    shown = sum(1 for s in SECTIONS if s["slug"] in meta)

    page = PAGE % {
        "body": body,
        "count": shown,
        "live": live,
        "built": dt.date.today().isoformat(),
        "built_h": human(dt.date.today().isoformat()),
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    print("forecasting-data.html: %d sections (%d live)" % (shown, live))


HIST_HEADING = """
  </section>

  <section class="wrap"><hr class="rule">
    <h2>No longer updating</h2>
    <p class="lede">These stopped, and the pages that drew them mostly did not
    notice. Where the numbers still exist anywhere, they are here, frozen at the
    date the source stopped rather than deleted.</p>
    <p class="lede" style="margin-top:14px">One is missing entirely. The New
    York evictions series ran on Eviction Lab data that now refuses automated
    requests, and no copy of it survived locally &mdash; so unlike the rest, it
    is not here at all. Saying so is more useful than an empty frame.</p>
  </section>

  <section class="wrap">
"""

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Forecasting Data &middot; Ryan Beck</title>
<meta name="description" content="Live data series Ryan Beck maintains for forecasting: the debt limit, refugee admissions, big-tech revenue, flu hospitalisations, semiconductor trade and the bird-flu outbreak.">
<link rel="canonical" href="https://ryanbeck.com/forecasting-data">
<meta name="theme-color" content="#f4ead9">

<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Ryan Beck">
<meta property="og:title" content="Forecasting Data &middot; Ryan Beck">
<meta property="og:description" content="Live data series maintained for forecasting, each with an interactive chart and the date its data actually ends.">
<meta property="og:url" content="https://ryanbeck.com/forecasting-data">
<meta property="og:image" content="https://ryanbeck.com/assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@ryanbeck111">
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/plot.css">
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="index.html"><img src="assets/wordmark.svg" alt="Ryan Beck" width="827" height="112"></a>
    <nav class="nav" aria-label="Main">
      <a href="projects.html">Projects</a>
      <a href="writing.html">Fiction</a>
      <a href="blog.html">Blog</a>
      <a href="about.html">About</a>
    </nav>
  </div>
</header>
<main>
  <section class="wrap page-head">
    <span class="runic">Through the first door</span>
    <h1>Forecasting data</h1>
    <p class="lede">Numbers I kept reaching for while forecasting, collected so I
    would stop re-downloading them by hand. Each series below refreshes itself on a
    schedule, and each one states the date its data actually ends &mdash; which is
    not always the date it last ran.</p>
    <p class="lede" style="margin-top:14px">That distinction is the point. A
    scheduled job reporting success tells you it fetched something, not that anyone
    upstream is still publishing. One of these pages ran green every ten hours for
    two years while showing a series that had stopped; the status line on each
    chart now comes from the data itself, so it cannot make that claim.</p>
    <p class="lede" style="margin-top:14px"><a href="projects.html">&larr; All projects</a></p>
  </section>

  <section class="wrap">
%(body)s
  </section>

  <section class="wrap"><hr class="rule">
    <h2>The archive</h2>
    <p class="lede">Several of these series outlived the places they came from.
    Where a source has gone for good the history is kept here rather than lost with
    it &mdash; 124 files of it, pulled out of old R session files that were, for a
    few of these, the only surviving copy.</p>
    <p class="lede" style="margin-top:14px"><a href="/data/forecasting/archive/MANIFEST.csv">Browse the archive manifest</a>
    &mdash; every file with its row count and date range.</p>
  </section>

  <section class="wrap"><hr class="rule">
    <h2>Want the source?</h2>
    <p class="lede">The fetchers are small Python scripts and the charts are one
    dependency-free file. Everything is public &mdash; fork it, or tell me what I
    got wrong.</p>
    <div class="btn-row">
      <a class="btn" href="https://github.com/" rel="me">GitHub</a>
      <a class="btn ghost" href="mailto:ryanbeckauthor@gmail.com">Get in touch</a>
    </div>
  </section>
</main>
<footer class="site-foot">
  <div class="wrap">
    <span>&copy; 2026 Ryan Beck</span>
    <span><a href="index.html">&larr; back to the hall</a></span>
    <span><a href="mailto:ryanbeckauthor@gmail.com">ryanbeckauthor@gmail.com</a></span>
  </div>
</footer>
<script src="assets/js/nav.js" defer></script>
<script src="assets/js/plot.js" defer></script>
</body>
</html>
"""

if __name__ == "__main__":
    build()
