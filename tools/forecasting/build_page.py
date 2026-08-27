"""Generate the forecasting dashboard under public/forecasting/.

The page is generated rather than hand-written because its status lines have
to come from the data. A hand-written "updated weekly" is a claim that rots;
"Data ends 9 June 2025" is a fact the file itself can be asked for. That
distinction is the entire reason this rebuild exists -- COVIDWeekly showed a
green tick every ten hours for two years while publishing a series that had
stopped.

One page per grouping, each at its own URL so a subject can be linked to
directly, plus an index and the archive page. The sidebar is shared and marks
where you are.

The pages are generated rather than hand-written because their status lines
have to come from the data. A hand-written "updated weekly" is a claim that
rots; "Data ends 9 June 2025" is a fact the file itself can be asked for. That
distinction is the entire reason this rebuild exists -- the COVID page showed a
green tick every ten hours for two years while publishing a series that had
stopped.

This also rewrites a delimited block in public/_redirects, because
wrangler.toml sets html_handling = "none": without an explicit rewrite per
page, /forecasting/respiratory 404s in production while working fine locally.

Run after the fetchers:

    python tools/forecasting/build_page.py
"""
import csv
import datetime as dt
import html
import json
import os
import re

from _common import DATA, ROOT, load_manifest

# Every chart on the site, keyed by slug. GROUPS below decides which page each
# one lands on and in what order; this list is just the definitions.
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
            "Shaded bands are the eight suspensions. The ceiling line breaks "
            "inside each one because there is no ceiling to plot. Hovering a "
            "suspended date reads “no data” for the ceiling rather than zero."),
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
            "defaultRange": "2y",
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
            "labelCol": "fiscal_year",
            "labelPrefix": "FY ",
            "series": [
                {"col": "admissions", "label": "Admitted"},
                {"col": "ceiling", "label": "Presidential ceiling", "dash": True},
            ],
        },
        "note": (
            "The same arrivals totaled by fiscal year. The dashed line is the "
            "annual ceiling, which is only published for recent years."),
        "source": "State Department Refugee Processing Center",
        "source_url": "https://www.wrapsnet.org/admissions-and-arrivals/",
    },
    {
        "slug": "faamg-revenues",
        "title": "Big-tech revenue by fiscal year",
        "csv": "faamg-revenues.csv",
        "plot": {
            "format": "usd-billions",
            "zero": True,
            "labelCol": "fiscal_year",
            "labelPrefix": "FY ",
            "series": [
                {"col": "combined", "label": "All five combined"},
                {"col": "amazon", "label": "Amazon"},
                {"col": "apple", "label": "Apple"},
                {"col": "alphabet", "label": "Alphabet"},
            ],
        },
        "note": (
            "Each company's full fiscal year, and the five added together. The "
            "combined line is blank for a year any of them has not finished "
            "reporting."),
        "source": "SEC XBRL company facts",
        "source_url": "https://www.sec.gov/edgar/sec-api-documentation",
    },
    {
        "slug": "faamg-revenues-quarterly",
        "title": "Big-tech revenue by quarter",
        "csv": "faamg-revenues-quarterly.csv",
        "plot": {
            "format": "usd-billions",
            "zero": True,
            "labelCol": "quarter",
            "defaultRange": "5y",
            "series": [
                {"col": "amazon", "label": "Amazon"},
                {"col": "apple", "label": "Apple"},
                {"col": "alphabet", "label": "Alphabet"},
                {"col": "microsoft", "label": "Microsoft"},
                {"col": "meta", "label": "Meta"},
            ],
        },
        "note": (
            "The same five by quarter, which is where the seasonality lives — "
            "Amazon and Apple both spike every December.<br><br>Two notes on "
            "the derivation. Quarters are selected by the length of the "
            "reporting period rather than by filing type, because a 10-K "
            "carries both the twelve-month total and three-month figures, and "
            "mixing them puts an annual number in the quarterly line. The "
            "fourth quarter is calculated as the annual total minus the three "
            "reported quarters, since a 10-K frequently reports the year "
            "without ever stating Q4 on its own."),
        "source": "SEC XBRL company facts",
        "source_url": "https://www.sec.gov/edgar/sec-api-documentation",
    },
    {
        "slug": "covid-weekly-admissions",
        "title": "US respiratory hospital admissions, weekly",
        "csv": "covid-weekly-admissions.csv",
        "plot": {
            "format": "number",
            "zero": True,
            "defaultRange": "2y",
            "series": [
                {"col": "covid", "label": "COVID-19"},
                {"col": "influenza", "label": "Influenza"},
                {"col": "rsv", "label": "RSV"},
            ],
        },
        "note": (
            "New hospital admissions each week with a laboratory-confirmed "
            "diagnosis, summed nationally. Influenza and RSV are reported in "
            "the same returns and are shown alongside COVID-19.<br><br>A "
            "different series for the same measure, from the archived reichlab "
            "forecast hub, was widely used up to April 2024 and runs about 4% "
            "lower at the median — the two programs count admissions under "
            "different criteria. Figures read off older charts will not match "
            "these. That series is included in the download for comparison."),
        "source": "CDC NHSN Hospital Respiratory Data",
        "source_url": "https://data.cdc.gov/resource/ua7e-t2fy",
        "extra_csv": "covid-weekly-admissions-reichlab.csv",
    },
    {
        "slug": "flu-hospitalizations",
        "title": "US influenza hospitalizations",
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
            "layout": "us-grid",
            "defaultMode": "change",
            "changeLagWeeks": 4,
            "changeWeeks": 6,
            "valueRanges": ["6m", "1y", "2y", "5y"],
        },
        "note": (
            "The same admissions state by state, laid out roughly as the map "
            "is, so a bad week across one region reads as a block of color. It "
            "opens on percentage change against four weeks earlier, which is "
            "what makes a small state climbing fast as visible as a large one; "
            "the buttons switch to admissions per 100,000 over a "
            "window.<br><br>Every panel shares one vertical scale. Per head "
            "rather than raw counts is what makes that readable — on raw "
            "admissions the spread between the largest and smallest states is "
            "more than fiftyfold, and most of the grid flattens into slivers."),
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
                {"col": "chips_avg6", "label": "Chips, 6-month average",
                 "dash": True, "color": "#8a4a1c"},
                {"col": "equipment", "label": "Manufacturing equipment"},
                {"col": "equipment_avg6", "label": "Equipment, 6-month average",
                 "dash": True, "color": "#4a3d30"},
            ],
        },
        "note": (
            "Monthly, with a six-month rolling average over the top. The "
            "download also carries a twelve-month rolling sum."),
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
            "labelCol": "year",
            "series": [
                {"col": "chips", "label": "Chips (HS 8542)"},
                {"col": "equipment", "label": "Manufacturing equipment"},
            ],
        },
        "note": (
            "Annual, and the denominator for the export series above — what "
            "share of China's purchases the US supplies."),
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
                {"col": "birds", "label": "Killed that week", "axis": "right"},
            ],
        },
        "note": (
            "Weekly count on the right-hand axis, running total on the left. "
            "They differ by two orders of magnitude, so on a shared scale the "
            "weeks would be a flat line along the bottom. The download splits "
            "each week into commercial and backyard birds, and carries the "
            "state, county and production type of every confirmed flock."),
        "source": "USDA APHIS confirmed detections",
        "source_url": "https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks",
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
            "states, from the HHS hospital-capacity dataset. This is a census "
            "rather than a count of admissions — everyone in a bed that day, "
            "however long they have been there — so it runs far higher than the "
            "admissions series above and should not be read against it. HHS "
            "ended the reporting requirement behind it, so the series stops in "
            "April 2024."),
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
            "Counts rather than percentages, from the state’s open-data "
            "platform. The companion file carries the same figures split by age "
            "group."),
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
            "Cumulative case, hospitalization and death counts by age band. "
            "Earlier figures do not appear to be available anywhere: the "
            "Internet Archive’s captures of the original endpoint hold about "
            "one day of data each, and the CDC’s equivalent series is reported "
            "by HHS region rather than by state."),
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

# The sidebar. Each entry becomes its own page at /forecasting/<slug>, so a
# grouping can be linked to directly -- which is the point of splitting them
# up rather than running one long scroll.
#
# Grouped by subject, not by status: a reader looking for flu wants the live
# series and the frozen one next to each other, with each labeled.
GROUPS = [
    {
        "slug": "respiratory",
        "nav": "Respiratory illness",
        "title": "Respiratory illness",
        "kicker": "COVID, influenza and RSV",
        "blurb": (
            "<p>Weekly hospital admissions for COVID-19, influenza and RSV, "
            "nationally and state by state.</p><p>National figures come from "
            "the CDC’s National Healthcare Safety Network, which hospitals "
            "report to each week; the series runs from August 2020. State-level "
            "influenza comes from the CDC’s FluSight forecasting hub.</p><p>All "
            "of these count <em>laboratory-confirmed</em> admissions rather "
            "than everyone admitted with the illness, so they undercount by a "
            "margin that moves with how much testing is being done. They read "
            "more reliably as a trend than as a total.</p>"),
        "sections": ["covid-weekly-admissions", "flu-hospitalizations",
                     "flu-hospitalizations-states", "covid-hospitalizations"],
    },
    {
        "slug": "debt-limit",
        "nav": "The debt limit",
        "title": "The US debt limit",
        "kicker": "Treasury, daily",
        "blurb": (
            "<p>Federal debt subject to the statutory ceiling, against the "
            "ceiling itself, from Treasury’s Daily Treasury Statement. Millions "
            "of dollars, updated each business day.</p><p>The shaded stretches "
            "are the eight occasions Congress has suspended the limit rather "
            "than raised it. There is no ceiling during a suspension, so the "
            "line stops rather than running flat — Treasury publishes a zero in "
            "that field, and plotting it would send the ceiling to the floor. "
            "When a suspension ends, the limit is reset to whatever the debt "
            "has reached by then.</p>"),
        "sections": ["debt-limit"],
    },
    {
        "slug": "big-tech-revenue",
        "nav": "Big-tech revenue",
        "title": "Big-tech revenue",
        "kicker": "SEC filings",
        "blurb": (
            "<p>Revenue for Alphabet, Amazon, Apple, Meta and Microsoft, read "
            "out of their SEC filings, annually and by quarter. Billions of US "
            "dollars.</p><p>The five do not share a fiscal calendar — Apple’s "
            "year ends in September and Microsoft’s in June — so the combined "
            "line is blank for any period where they have not all filed yet. "
            "Quarters are placed in the calendar quarter they <em>end</em> in, "
            "which is what lets the five line up; the consequence is that "
            "adding four calendar quarters for Apple or Microsoft will not "
            "equal their fiscal year.</p>"),
        "sections": ["faamg-revenues", "faamg-revenues-quarterly"],
    },
    {
        "slug": "refugee-admissions",
        "nav": "Refugee admissions",
        "title": "US refugee admissions",
        "kicker": "State Department, monthly",
        "blurb": (
            "<p>People admitted to the United States as refugees, from the "
            "State Department’s Refugee Processing Center. Fiscal years run "
            "October to September, so the monthly series maps October through "
            "December onto the previous calendar year.</p><p>The annual ceiling "
            "is set by presidential determination and is a cap rather than a "
            "target: admissions have come in well under it far more often than "
            "they have approached it. The long view reaches back to 1975 — the "
            "two peaks are the Indochinese resettlement after the fall of "
            "Saigon and the Soviet and Southeast Asian programs around "
            "1990.</p>"),
        "sections": ["refugee-admissions", "refugee-admissions-annual"],
    },
    {
        "slug": "semiconductors",
        "nav": "Semiconductor trade",
        "title": "Semiconductor trade",
        "kicker": "UN Comtrade",
        "blurb": (
            "<p>US exports of chips and chipmaking equipment to China, and what "
            "China buys from the whole world, from UN Comtrade. Values are US "
            "dollars.</p><p>Chips are HS 8542. Equipment is HS 8486, 903082, "
            "903141, 854311 and 901041, summed. Monthly trade is noisy enough "
            "that the raw line is hard to read a trend off, so a six-month "
            "rolling average is carried alongside it.</p><p>The two charts are "
            "measured independently and will not reconcile. US exports are "
            "monthly and reported by the United States; China’s imports are "
            "annual and reported by China. Trading partners routinely disagree "
            "about the same shipments, since they classify goods differently "
            "and record them at different moments.</p>"),
        "sections": ["semiconductors-us-exports-china",
                     "semiconductors-china-imports"],
    },
    {
        "slug": "bird-flu",
        "nav": "Bird flu",
        "title": "Bird flu",
        "kicker": "USDA APHIS",
        "blurb": (
            "<p>Birds killed in confirmed commercial and backyard flocks during "
            "the H5N1 outbreak, from USDA APHIS detection records.</p><p>A "
            "flock is counted on the date its infection was confirmed, and "
            "confirmation means the entire flock is depopulated — so a single "
            "commercial layer operation can add several million birds in one "
            "week. That makes the weekly figure extremely spiky and the running "
            "total the more readable line.</p><p>Backyard flocks are a large "
            "share of the detections and a very small share of the birds.</p>"),
        "sections": ["hpai-depopulations"],
    },
    {
        "slug": "virginia-covid",
        "nav": "Virginia COVID",
        "title": "Virginia COVID",
        "kicker": "VDH, retired",
        "blurb": (
            "<p>Two series from the Virginia Department of Health. Neither is "
            "still updating.</p><p>Vaccinations run from March 2021 to "
            "September 2023 and are complete for that window — nearly ten "
            "million rows, by locality, age group and vaccination "
            "status.</p><p>Cases by age cover only 17 April to 24 September "
            "2024, which is the whole of what VDH kept when it retired that "
            "dataset. For an age-stratified Virginia series without a gap, the "
            "HHS hospitalization panel on the <a "
            "href=\"/forecasting/respiratory\">respiratory page</a> carries "
            "admissions broken down by age band from 2020 to 2023.</p>"),
        "sections": ["va-vaccinations", "vdh-cases-by-age"],
    },
]


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


SECTION_BY_SLUG = {s["slug"]: s for s in SECTIONS}


def period_label(sec, info):
    """The label for the last period, for series dated to a period start.

    A fiscal-year row is dated 1 October of the *previous* calendar year, and
    an annual trade row to 1 January, so "data to 1 October 2025" reads as
    stale when the chart is showing FY2026. Where a section names a label
    column, the status line uses that instead of the raw date.
    """
    col = sec.get("plot", {}).get("labelCol")
    if not col:
        return None
    path = os.path.join(DATA, sec["csv"])
    if not os.path.exists(path):
        return None
    want = info["last_date"][:10]
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("date", "")[:10] == want and row.get(col):
                return (sec["plot"].get("labelPrefix") or "") + row[col]
    return None


def section_html(sec, meta):
    info = meta.get(sec["slug"])
    if not info:
        return ""

    status = info["status"]
    plot = dict(sec["plot"])
    plot["csv"] = "/data/forecasting/" + sec["csv"]
    plot["x"] = "date"
    plot["alt"] = sec["title"]
    cfg = e(json.dumps(plot, separators=(",", ":")))

    downloads = ['<a href="/data/forecasting/%s">%s</a>' % (sec["csv"], sec["csv"])]
    if sec.get("extra_csv"):
        downloads.append('<a href="/data/forecasting/%s">%s</a>'
                         % (sec["extra_csv"], sec["extra_csv"]))

    label = period_label(sec, info)
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
        "slug": e(sec["slug"]), "status": e(status),
        "word": e(STATUS_WORDS.get(status, status.title())),
        "last_h": e(label or human(info["last_date"])), "title": e(sec["title"]),
        "note": sec["note"], "cfg": cfg,
        "rows": format(info["rows"], ","), "age": e(age_phrase(info["last_date"])),
        "surl": e(sec["source_url"]), "source": e(sec["source"]),
        "dl": " &middot; ".join(downloads),
    }


def sidebar(active, meta):
    """The grouping list. Every entry carries the worst status inside it, so
    the sidebar itself says where something has stopped without being opened."""
    items = []
    for g in GROUPS:
        states = [meta[s]["status"] for s in g["sections"] if s in meta]
        worst = ("stale" if "stale" in states
                 else "historical" if states and all(x == "historical" for x in states)
                 else "live" if states else "")
        items.append(
            '    <li><a href="/forecasting/%s"%s>%s'
            '<span class="dot is-%s" aria-hidden="true"></span></a></li>'
            % (e(g["slug"]),
               ' aria-current="page"' if g["slug"] == active else "",
               e(g["nav"]), e(worst or "live")))
    return """
<nav class="dash-nav" aria-label="Forecasting data sections">
  <p class="dash-nav-head"><a href="/forecasting">Forecasting data</a></p>
  <ul>
%s
  </ul>
  <p class="dash-nav-foot"><a href="/forecasting/archive">The archive</a></p>
  <p class="dash-nav-foot"><a href="/projects">&larr; All projects</a></p>
</nav>""" % "\n".join(items)


def status_table(meta):
    rows = []
    for g in GROUPS:
        for slug in g["sections"]:
            sec, info = SECTION_BY_SLUG.get(slug), meta.get(slug)
            if not sec or not info:
                continue
            rows.append(
                '<tr><td><a href="/forecasting/%s#%s">%s</a></td>'
                '<td><span class="status is-%s">%s</span></td>'
                '<td>%s</td><td class="num">%s</td></tr>'
                % (e(g["slug"]), e(slug), e(sec["title"]), e(info["status"]),
                   e(STATUS_WORDS.get(info["status"], info["status"])),
                   e(period_label(sec, info) or human(info["last_date"])),
                   format(info["rows"], ",")))
    return ("<div class=\"table-wrap\"><table class=\"status-table\">"
            "<thead><tr><th>Series</th><th>State</th><th>Data ends</th>"
            "<th class=\"num\">Rows</th></tr></thead><tbody>"
            + "".join(rows) + "</tbody></table></div>")


def page(*, slug, title, kicker, blurb, body, meta, desc):
    # Escape the parts, then join with the entity -- escaping the joined
    # string turns "&middot;" into a literal "&middot;" in the tab.
    parts = [e(title)] if title.lower().startswith("forecasting") else             [e(title), "Forecasting Data"]
    doc_title = " &middot; ".join(parts + ["Ryan Beck"])
    return PAGE % {
        "title": doc_title,
        "desc": e(desc),
        "canonical": "https://ryanbeck.com/forecasting/%s" % slug if slug else
                     "https://ryanbeck.com/forecasting",
        "sidebar": sidebar(slug, meta),
        "kicker": e(kicker),
        "h1": e(title),
        "blurb": blurb,
        "body": body,
    }


def build():
    meta = load_manifest().get("series", {})
    outdir = os.path.join(ROOT, "public", "forecasting")
    os.makedirs(outdir, exist_ok=True)
    written = []

    for g in GROUPS:
        body = "".join(section_html(SECTION_BY_SLUG[s], meta)
                       for s in g["sections"] if s in SECTION_BY_SLUG)
        if not body.strip():
            continue
        first = next((s for s in g["sections"] if s in meta), None)
        desc = re.sub(r"<[^>]+>", " ", g["blurb"])
        desc = re.sub(r"\s+", " ", desc).strip()[:180]
        out = page(slug=g["slug"], title=g["title"], kicker=g["kicker"],
                   blurb=g["blurb"], body=body, meta=meta, desc=desc)
        path = os.path.join(outdir, g["slug"] + ".html")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        written.append(g["slug"])

    # --- the archive page ---
    archive_body = """
  <section class="series">
    <h2>What is in it</h2>
    <p class="series-note">124 files, about 18 MB, one CSV per table, gzipped.
    <a href="/data/forecasting/archive/MANIFEST.csv">The manifest</a> lists
    every one with its row count, column count and date range.</p>
    <p class="series-note" style="margin-top:14px">The largest single item is
    the HHS hospital-capacity panel &mdash; 66,966 rows by 135 columns, every
    state, 2020 to 2023, including admissions broken down by age band. It is
    the most detailed age-stratified COVID series here, which is why the
    Virginia cases-by-age section points at it.</p>
  </section>
  <section class="series">
    <h2>Provenance and caveats</h2>
    <p class="series-note">These were extracted from R session files saved
    while the series were being maintained. For several of them the upstream
    source has since been retired, so this is the only copy I am aware of.</p>
    <p class="series-note" style="margin-top:14px">Figures are as the sources
    reported them at the time and have not been adjusted. Agencies restate, so
    a few values differ from what the same source returns today &mdash; in the
    HHS hospitalization panel about 2% of Virginia dates differ, all by under
    1% and in both directions.</p>
  </section>
"""
    arch = page(slug="archive", title="The archive",
                kicker="historical data", blurb=(
                    "<p>Historical data for series whose sources have since "
                    "been retired, kept as plain gzipped CSV so it stays "
                    "readable without any particular tool.</p>"),
                body=archive_body, meta=meta,
                desc="The rescued historical data behind the forecasting "
                     "dashboards: 124 files pulled out of old R session files.")
    with open(os.path.join(outdir, "archive.html"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(arch)
    written.append("archive")

    # --- the index ---
    live = sum(1 for s in meta.values() if s["status"] == "live")
    idx_body = """
  <section class="series">
    <h2>Every series at a glance</h2>
    <p class="series-note">%(live)d of these refresh on a schedule; the rest are
    frozen at the point their source stopped publishing. <strong>Every date
    below is the last date present in the data</strong>, not the last time it
    was fetched.</p>
    %(table)s
  </section>
  <section class="series">
    <h2>Using the data</h2>
    <p class="series-note">Every series can be downloaded as CSV from its own
    section. The files are tidy &mdash; one row per period, one column per
    measure, ISO dates &mdash; so they open straight into a spreadsheet or load
    in one line of pandas or readr.</p>
    <p class="series-note" style="margin-top:14px"><a href="/data/forecasting/manifest.json">manifest.json</a>
    carries the same information machine-readably: row count, last date and
    source for every series.</p>
  </section>
""" % {"live": live, "table": status_table(meta)}

    idx = page(slug="", title="Forecasting data", kicker="Through the first door",
               blurb=(
                   "<p>Data I use for forecasting, collected in one place and "
                   "kept current. Pick a subject from the list.</p>"
                   "<p>Each chart shows the last date present in its data, links "
                   "to its source, and can be downloaded as CSV.</p>"),
               body=idx_body, meta=meta,
               desc="Live data series maintained for forecasting: the debt "
                    "limit, respiratory illness, refugee admissions, big-tech "
                    "revenue, semiconductor trade and bird flu.")
    with open(os.path.join(outdir, "index.html"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(idx)

    write_redirects(written)
    print("forecasting/: index + %d pages (%d live series)"
          % (len(written), live))


def write_redirects(slugs):
    """Keep the pretty-URL rewrites in step with the pages that exist.

    wrangler.toml sets html_handling = "none", so /forecasting/respiratory does
    not resolve to respiratory.html on its own -- every page needs a line here
    or it 404s in production while working fine from a file server.
    """
    path = os.path.join(ROOT, "public", "_redirects")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start = "# >>> forecasting (generated by tools/forecasting/build_page.py)"
    end = "# <<< forecasting"
    block = [start,
             "/forecasting            /forecasting/index.html   200",
             "/forecasting/           /forecasting/index.html   200"]
    for s in slugs:
        block.append("/forecasting/%-11s /forecasting/%s.html   200" % (s, s))
    block.append("# The page these replaced. Redirect to the pretty URL, not")
    block.append("# to index.html, so the .html spelling never shows up in a bar.")
    block.append("/forecasting-data       /forecasting              301")
    block.append(end)
    new = "\n".join(block)

    if start in text and end in text:
        a = text.index(start)
        b = text.index(end) + len(end)
        text = text[:a] + new + text[b:]
    else:
        text = text.rstrip() + "\n\n" + new + "\n"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(canonical)s">
<meta name="theme-color" content="#f4ead9">

<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Ryan Beck">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(canonical)s">
<meta property="og:image" content="https://ryanbeck.com/assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@ryanbeck111">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/plot.css">
</head>
<body class="dash-page">
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="/"><img src="/assets/wordmark.svg" alt="Ryan Beck" width="827" height="112"></a>
    <nav class="nav" aria-label="Main">
      <a href="/projects">Projects</a>
      <a href="/writing">Fiction</a>
      <a href="/blog">Blog</a>
      <a href="/about">About</a>
    </nav>
  </div>
</header>
<div class="dash">
%(sidebar)s
  <main class="dash-main">
    <header class="dash-head">
      <span class="runic">%(kicker)s</span>
      <h1>%(h1)s</h1>
      <div class="dash-blurb">%(blurb)s</div>
    </header>
%(body)s
  </main>
</div>
<footer class="site-foot">
  <div class="wrap">
    <span>&copy; 2026 Ryan Beck</span>
    <span><a href="/">&larr; back to the hall</a></span>
    <span><a href="mailto:ryanbeckauthor@gmail.com">ryanbeckauthor@gmail.com</a></span>
  </div>
</footer>
<script src="/assets/js/nav.js" defer></script>
<script src="/assets/js/plot.js" defer></script>
</body>
</html>
"""


if __name__ == "__main__":
    build()
