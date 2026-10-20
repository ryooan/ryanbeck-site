"""Generate the forecasting dashboard under public/forecasting/.

The page is generated rather than hand-written because its status lines have
to come from the data. A hand-written "updated weekly" is a claim that rots;
"Data ends 9 June 2025" is a fact the file itself can be asked for. That
distinction is the entire reason this rebuild exists -- COVIDWeekly showed a
green tick every ten hours for two years while publishing a series that had
stopped.

One page per grouping, each at its own URL so a subject can be linked to
directly, plus an index. The sidebar is shared and marks
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

from _common import DATA, HOST, ORIGIN, ROOT, load_manifest

# Every chart on the site, keyed by slug. GROUPS below decides which page each
# one lands on and in what order; this list is just the definitions.
SECTIONS = [
    {
        "slug": "debt-limit",
        "title": "US debt limit",
        "csv": "debt-limit.csv",
        "plot": {
            "yLabel": "Debt outstanding",
            "format": "usd-millions",
            "series": [
                {"col": "debt_subject_to_limit", "label": "Debt subject to limit"},
                {"col": "statutory_limit", "label": "Statutory ceiling", "dash": True},
            ],
            "band": {"col": "suspended", "label": "Limit suspended"},
            "trend": {
                "col": "debt_subject_to_limit",
                "limitCol": "statutory_limit",
                "suspendedCol": "suspended",
                "label": "Trend",
                "atLimitPct": 0.5,
                "suspendedMonths": 12,
                "maxMonths": 36,
            },
        },
        "note": (
            "Shading marks periods when the debt limit was suspended. The trend projects debt growth since the latest limit change; toggle it in the legend."),
        "source": "Treasury Fiscal Data, Daily Treasury Statement",
        "source_url": "https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/debt-subject-to-limit",
    },
    {
        "slug": "refugee-admissions",
        "title": "US refugee admissions by month",
        "csv": "refugee-admissions.csv",
        "plot": {
            "yLabel": "People admitted",
            "format": "number",
            "zero": True,
            "defaultRange": "2y",
            "series": [{"col": "admissions", "label": "Arrivals in month"}],
        },
        "note": (
            "Monthly refugee admissions. US fiscal years run from October through September."),
        "source": "State Department Refugee Processing Center",
        "source_url": "https://www.wrapsnet.org/admissions-and-arrivals/",
        "extra_csv": "refugee-admissions-annual.csv",
    },
    {
        "slug": "refugee-admissions-annual",
        "title": "Refugee admissions by fiscal year",
        "csv": "refugee-admissions-annual.csv",
        "plot": {
            "yLabel": "People admitted",
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
            "Annual admissions and the statutory ceiling. Ceiling data is available for recent years."),
        "source": "State Department Refugee Processing Center",
        "source_url": "https://www.wrapsnet.org/admissions-and-arrivals/",
    },
    {
        "slug": "faamg-revenues",
        "title": "Big-tech revenue by fiscal year",
        "csv": "faamg-revenues.csv",
        "plot": {
            "yLabel": "Revenue",
            "format": "usd-billions",
            "zero": True,
            "labelCol": "fiscal_year",
            "labelPrefix": "FY ",
            "series": [
                {"col": "combined", "label": "All five combined"},
                {"col": "amazon", "label": "Amazon"},
                {"col": "apple", "label": "Apple"},
                {"col": "alphabet", "label": "Alphabet"},
                {"col": "microsoft", "label": "Microsoft"},
                {"col": "meta", "label": "Meta"},
            ],
        },
        "note": (
            "Company fiscal years ending in the labeled year: Apple ends in September, Microsoft in June, and the others in December. The combined total spans different reporting periods."),
        "source": "SEC XBRL company facts",
        "source_url": "https://www.sec.gov/edgar/sec-api-documentation",
    },
    {
        "slug": "faamg-revenues-quarterly",
        "title": "Big-tech revenue by calendar quarter",
        "csv": "faamg-revenues-quarterly.csv",
        "plot": {
            "yLabel": "Revenue",
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
            "Calendar-quarter labels group reported fiscal quarters by their midpoint. Apple uses roughly 13-week periods, so dates can differ slightly. Missing fourth quarters are derived from annual totals."),
        "source": "SEC XBRL company facts",
        "source_url": "https://www.sec.gov/edgar/sec-api-documentation",
    },
    {
        "slug": "covid-weekly-admissions",
        "title": "US respiratory hospital admissions, weekly",
        "csv": "covid-weekly-admissions.csv",
        "plot": {
            "yLabel": "New admissions per week",
            "format": "number",
            "zero": True,
            "defaultRange": "2y",
            "series": [
                {"col": "covid", "label": "COVID-19"},
                {"col": "influenza", "label": "Influenza"},
                {"col": "rsv", "label": "RSV"},
            ],
            "band": {"col": "voluntary_reporting",
                     "label": "Voluntary reporting: coverage fell to a third"},
        },
        "note": (
            "Reporting was voluntary from May through October 2024. Hospital participation fell to about 31%, limiting comparisons across the shaded period. Reporting coverage and the older Reichlab series are included in the downloads."),
        "source": "CDC NHSN Hospital Respiratory Data",
        "source_url": "https://data.cdc.gov/resource/ua7e-t2fy",
        "extra_csv": "covid-weekly-admissions-reichlab.csv",
    },
    {
        "slug": "flu-hospitalizations",
        "title": "US influenza hospitalizations",
        "csv": "flu-hospitalizations.csv",
        "plot": {
            "yLabel": "Patients in the hospital",
            "format": "number",
            "zero": True,
            "series": [{"col": "admissions", "label": "Weekly admissions"}],
        },
        "note": (
            "Weekly confirmed influenza admissions from CDC FluSight. State totals are available in the companion CSV."),
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
            "countCol": "admissions",
            "layout": "us-grid",
            "defaultMode": "change",
            "changeLagWeeks": 4,
            "changeWeeks": 6,
            "valueRanges": ["6m", "1y", "2y", "5y"],
        },
        "note": (
            "Compare changes over four weeks or admissions per 100,000 residents. All states share a scale. FluSight snapshots may differ from revised national figures."),
        "source": "CDC FluSight forecast hub",
        "source_url": "https://github.com/cdcepi/FluSight-forecast-hub",
        "extra_csv": "flu-hospitalizations.csv",
    },
    {
        "slug": "semiconductors-us-exports-china",
        "title": "US semiconductor exports to China",
        "csv": "semiconductors-us-exports-china.csv",
        "plot": {
            "yLabel": "Export value",
            "format": "usd",
            "zero": True,
            "series": [
                # The averages carry the chart and are the only two series
                # shown on load; the monthly lines they smooth are noisy
                # enough to bury them, and are a legend click away.
                {"col": "chips_avg6", "label": "Chips, 6-month average",
                 "color": "#a8481f"},
                {"col": "equipment_avg6", "label": "Equipment, 6-month average",
                 "color": "#2f6b7a"},
                {"col": "chips", "label": "Chips, monthly (HS 8542)",
                 "color": "#d59a72", "width": 1.2, "off": True},
                {"col": "equipment", "label": "Equipment, monthly",
                 "color": "#8fb6bf", "width": 1.2, "off": True},
            ],
        },
        "note": (
            "Six-month averages. Use the legend to show monthly values. The CSV includes twelve-month totals."),
        "source": "UN Comtrade",
        "source_url": "https://comtradeplus.un.org/",
    },
    {
        "slug": "semiconductors-china-imports",
        "title": "China's semiconductor imports",
        "csv": "semiconductors-china-imports.csv",
        "plot": {
            "yLabel": "Import value",
            "format": "usd",
            "zero": True,
            "labelCol": "year",
            "series": [
                {"col": "chips", "label": "Chips (HS 8542)"},
                {"col": "equipment", "label": "Manufacturing equipment"},
            ],
        },
        "note": (
            "Annual imports from all countries, reported by China."),
        "source": "UN Comtrade",
        "source_url": "https://comtradeplus.un.org/",
    },
    {
        "slug": "hpai-depopulations",
        "title": "Birds killed in the bird-flu outbreak",
        "csv": "hpai-depopulations.csv",
        "plot": {
            "yLabel": "Birds killed, running total",
            "yLabelRight": "Birds killed that week",
            "format": "number",
            "zero": True,
            "series": [
                {"col": "cumulative", "label": "Running total"},
                {"col": "birds", "label": "Killed that week", "axis": "right"},
            ],
        },
        "note": (
            "Weekly count on the right axis; cumulative total on the left. Downloads include flock location, production type, and commercial or backyard status."),
        "source": "USDA APHIS confirmed detections",
        "source_url": "https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks",
    },
    {
        "slug": "covid-hospitalizations",
        "title": "COVID and flu patients in the hospital",
        "csv": "covid-hospitalizations.csv",
        "plot": {
            "yLabel": "Patients in the hospital",
            "format": "number",
            "zero": True,
            "series": [
                {"col": "adult_covid", "label": "Adults with COVID"},
                {"col": "influenza", "label": "Confirmed influenza"},
                {"col": "icu_covid", "label": "COVID in adult ICU"},
            ],
        },
        "note": (
            "Daily hospitalized patients across reporting states. Counts include patients admitted on earlier days. Reporting ended in April 2024."),
        "source": "healthdata.gov g62h-syeh (HHS)",
        "source_url": "https://healthdata.gov/dataset/g62h-syeh",
        "extra_csv": "covid-hospitalizations-va.csv",
    },
    {
        "slug": "va-vaccinations",
        "title": "Virginia COVID vaccinations",
        "csv": "va-vaccinations.csv",
        "plot": {
            "yLabel": "People",
            "format": "number",
            "zero": True,
            "series": [
                {"col": "at_least_one_dose", "label": "At least one dose"},
                {"col": "fully_vaccinated", "label": "Fully vaccinated"},
            ],
        },
        "note": (
            "People by vaccination status. Age-group counts are included in the companion CSV."),
        "source": "data.virginia.gov (VDH)",
        "source_url": "https://data.virginia.gov/",
        "extra_csv": "va-vaccinations-by-age.csv",
    },
]

STATUS_WORDS = {
    "live": "Live",
    "overdue": "Out of date",
    "stale": "Source stalled",
    "historical": "Historical",
}

# How old the newest row of a "live" series may get, in days, before the page
# stops calling it Live. The fetchers set "live" when they run, so without this
# a series whose refresh stopped kept its green Live label indefinitely --
# which is what happened from late August to October 2026, when nothing ran.
# Measured from the data's own last date, never from when anything ran. Each
# allows for how often the source publishes plus its usual reporting lag, and
# for how series are dated (monthly rows sit on the 1st, fiscal years on
# 1 October of the previous year, annual rows on 1 January).
#
# The page repeats the check in the browser (assets/js/freshness.js) from the
# same numbers, so a page nobody rebuilds still goes Out of date on its own.
EXPECT_DAYS = {
    "debt-limit": 10,                       # Treasury, daily
    "covid-weekly-admissions": 45,          # weekly; same bound the fetcher uses
    "flu-hospitalizations": 60,             # FluSight target data, weekly
    "flu-hospitalizations-states": 60,
    "hpai-depopulations": 120,              # sporadic; fetch_hpai STALE_AFTER_DAYS
    "refugee-admissions": 100,              # monthly, a few weeks behind
    "refugee-admissions-annual": 430,       # one row per fiscal year
    "faamg-revenues-quarterly": 200,        # quarters by midpoint, 10-Q lag
    "faamg-revenues": 800,                  # calendar years, complete after Q4 filings
    "semiconductors-us-exports-china": 120, # Comtrade monthly, ~2 months behind
    "semiconductors-china-imports": 1100,   # Comtrade annual, China reports late
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
            "<p>Weekly confirmed COVID-19, influenza and RSV hospital admissions from CDC NHSN and FluSight. Testing and reporting coverage affect the totals.</p>"),
        # flu-hospitalizations is deliberately absent: FluSight's national
        # target data IS NHSN's, snapshotted. Across all 231 of its weeks the
        # median difference from the NHSN line above is 0.12%, and the largest
        # gaps are at the recent end where FluSight has not yet picked up
        # NHSN's backfill. NHSN also starts 2020 rather than 2022 and runs
        # fresher, so the second chart was the same series, shorter and
        # staler. The fetcher stays -- the state grid needs its per-state file.
        "sections": ["covid-weekly-admissions",
                     "flu-hospitalizations-states", "covid-hospitalizations"],
    },
    {
        "slug": "debt-limit",
        "nav": "The debt limit",
        "title": "The US debt limit",
        "kicker": "Treasury, daily",
        "blurb": (
            "<p>Federal debt subject to the statutory limit and the limit itself, from the Daily Treasury Statement. Values are millions of dollars.</p>"),
        "sections": ["debt-limit"],
    },
    {
        "slug": "big-tech-revenue",
        "nav": "Big-tech revenue",
        "title": "Big-tech revenue",
        "kicker": "SEC filings",
        "blurb": (
            "<p>Annual and quarterly revenue for Alphabet, Amazon, Apple, Meta and Microsoft, in billions of US dollars. Fiscal calendars differ by company.</p>"),
        "sections": ["faamg-revenues", "faamg-revenues-quarterly"],
    },
    {
        "slug": "refugee-admissions",
        "nav": "Refugee admissions",
        "title": "US refugee admissions",
        "kicker": "State Department, monthly",
        "blurb": (
            "<p>US refugee admissions and annual ceilings, from the State Department’s Refugee Processing Center.</p>"),
        "sections": ["refugee-admissions", "refugee-admissions-annual"],
    },
    {
        "slug": "semiconductors",
        "nav": "Semiconductor trade",
        "title": "Semiconductor trade",
        "kicker": "UN Comtrade",
        "blurb": (
            "<p>US exports to China and China’s worldwide imports, from UN Comtrade. Chips: HS 8542. Equipment: HS 8486, 903082, 903141, 854311 and 901041. Values are US dollars; countries report independently.</p>"),
        "sections": ["semiconductors-us-exports-china",
                     "semiconductors-china-imports"],
    },
    {
        "slug": "bird-flu",
        "nav": "Bird flu",
        "title": "Bird flu",
        "kicker": "USDA APHIS",
        "blurb": (
            "<p>Birds in flocks depopulated during the H5N1 outbreak, from USDA APHIS. Counts use the confirmation date; large commercial flocks can cause weekly spikes.</p>"),
        "sections": ["hpai-depopulations"],
    },
    {
        "slug": "virginia-covid",
        "nav": "Virginia COVID",
        "title": "Virginia COVID",
        "kicker": "VDH, retired",
        "blurb": (
            "<p>Virginia vaccination counts, March 2021 to September 2023. Duplicate records on February 21, 2023 were removed. July 24, 2021 is omitted because the source doubled its counts.</p>"),
        "sections": ["va-vaccinations"],
    },
]


# Landing-page prose uses the same literal fields as subject-page copy so
# the local editor can round-trip it without editing generated HTML.
LANDING = {
    "slug": "index",
    "title": "Data Dashboards",
    "kicker": "Through the first door",
    "blurb": (
        "<p>Overview of data series available</p>"),
    "description": (
        "Live data series maintained for forecasting: the debt limit, "
        "respiratory illness, refugee admissions, big-tech revenue, "
        "semiconductor trade and bird flu."),
}


def human(iso):
    d = dt.date.fromisoformat(iso[:10])
    return "%d %s %d" % (d.day, ["January", "February", "March", "April",
                                 "May", "June", "July", "August", "September",
                                 "October", "November", "December"][d.month - 1],
                         d.year)


def age_phrase(iso):
    # Mirrored in assets/js/freshness.js; change both together.
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


def data_age(iso):
    return (dt.date.today() - dt.date.fromisoformat(iso[:10])).days


def status_of(slug, info):
    """The status to print: the fetcher's, unless a live series' data is now
    older than its source should allow."""
    status = info["status"]
    limit = EXPECT_DAYS.get(slug)
    if status == "live" and limit is not None and data_age(info["last_date"]) > limit:
        return "overdue"
    return status


def freshness_attrs(slug, info):
    """What assets/js/freshness.js needs to redo status_of() in the browser."""
    limit = EXPECT_DAYS.get(slug)
    if info["status"] != "live" or limit is None:
        return ""
    return ' data-last="%s" data-expect="%d"' % (e(info["last_date"][:10]), limit)


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

    status = status_of(sec["slug"], info)
    plot = dict(sec["plot"])
    plot["csv"] = "/data/forecasting/" + sec["csv"]
    plot["x"] = "date"
    plot["alt"] = sec["title"]

    # The chart carries its own title and provenance so a shared PNG stands up
    # without the page around it. Both are built from the manifest, so the
    # date in a shared image is the date of the data in it.
    label = period_label(sec, info)
    plot["slug"] = sec["slug"]
    plot["credit"] = HOST + "/forecasting"
    plot["embed"] = "/forecasting/embed/" + sec["slug"]
    plot["sourceUrl"] = sec["source_url"]
    plot["title"] = sec["title"]
    plot["subtitle"] = "%s · data to %s" % (
        sec["source"], label or human(info["last_date"]))
    cfg = e(json.dumps(plot, separators=(",", ":")))

    downloads = ['<a href="/data/forecasting/%s">%s</a>' % (sec["csv"], sec["csv"])]
    if sec.get("extra_csv"):
        downloads.append('<a href="/data/forecasting/%s">%s</a>'
                         % (sec["extra_csv"], sec["extra_csv"]))

    # The heading is for the document outline, the sidebar anchors and screen
    # readers; the visible one is drawn inside the chart, so showing both
    # would print the same words twice. Likewise the status word has moved
    # down to the metadata line -- the chart's own subtitle already carries
    # the date, and a second pill above it repeated it.
    return """
  <section class="series" id="%(slug)s">
    <h2 class="sr-only">%(title)s</h2>
    <div class="plot-mount" data-plot='%(cfg)s'></div>
    %(note)s
    <p class="series-source"><span class="status is-%(status)s"%(fresh)s>%(word)s</span>
      %(rows)s rows, latest <span data-age-of="%(last)s">%(age)s</span> &middot;
      source: <a href="%(surl)s" rel="noopener">%(source)s</a> &middot;
      download: %(dl)s</p>
  </section>
""" % {
        "slug": e(sec["slug"]), "status": e(status),
        "fresh": freshness_attrs(sec["slug"], info),
        "last": e(info["last_date"][:10]),
        "word": e(STATUS_WORDS.get(status, status.title())),
        "last_h": e(label or human(info["last_date"])), "title": e(sec["title"]),
        # A blanked note leaves no element at all rather than an empty one.
        # These pages are generated, so the right answer is not to emit it --
        # the CSS :empty fallback is for the hand-written pages, which have no
        # generator to make the decision for them.
        "note": ('<p class="series-note">%s</p>' % sec["note"]
                 if str(sec["note"]).strip() else ""),
        "cfg": cfg,
        "rows": format(info["rows"], ","), "age": e(age_phrase(info["last_date"])),
        "surl": e(sec["source_url"]), "source": e(sec["source"]),
        "dl": " &middot; ".join(downloads),
    }


def sidebar(active, meta):
    """The grouping list. Every entry carries the worst status inside it, so
    the sidebar itself says where something has stopped without being opened."""
    items = []
    for g in GROUPS:
        states = [status_of(s, meta[s]) for s in g["sections"] if s in meta]
        worst = ("stale" if "stale" in states
                 else "overdue" if "overdue" in states
                 else "historical" if states and all(x == "historical" for x in states)
                 else "live" if states else "")
        # Every live series in the group, so the browser can turn the dot
        # Out of date as soon as any one of them is.
        checks = " ".join("%s:%d" % (meta[s]["last_date"][:10], EXPECT_DAYS[s])
                          for s in g["sections"]
                          if s in meta and meta[s]["status"] == "live" and s in EXPECT_DAYS)
        items.append(
            '    <li><a href="/forecasting/%s"%s>%s'
            '<span class="dot is-%s"%s aria-hidden="true"></span></a></li>'
            % (e(g["slug"]),
               ' aria-current="page"' if g["slug"] == active else "",
               e(g["nav"]), e(worst or "live"),
               ' data-checks="%s"' % checks if checks else ""))
    return """
<nav class="dash-nav" aria-label="Data dashboard sections">
  <p class="dash-nav-head"><a href="/forecasting">Data Dashboards</a></p>
  <ul>
%s
  </ul>
  <p class="dash-nav-foot"><a href="/projects">&larr; All projects</a></p>
</nav>""" % "\n".join(items)


def status_table(meta):
    groups = []
    for g in GROUPS:
        rows = []
        for slug in g["sections"]:
            sec, info = SECTION_BY_SLUG.get(slug), meta.get(slug)
            if not sec or not info:
                continue
            status = status_of(slug, info)
            rows.append(
                '<tr><td><a href="/forecasting/%s#%s">%s</a></td>'
                '<td><span class="status is-%s"%s>%s</span></td>'
                '<td>%s</td></tr>'
                % (e(g["slug"]), e(slug), e(sec["title"]), e(status),
                   freshness_attrs(slug, info),
                   e(STATUS_WORDS.get(status, status)),
                   e(period_label(sec, info) or human(info["last_date"]))))
        if rows:
            groups.append(
                '<tbody><tr class="status-group"><th colspan="3" scope="rowgroup">'
                '<a href="/forecasting/%s">%s</a></th></tr>%s</tbody>'
                % (e(g["slug"]), e(g["title"]), "".join(rows)))
    return ('<div class="table-wrap"><table class="status-table">'
            '<thead><tr><th scope="col">Series</th><th scope="col">State</th>'
            '<th scope="col">Data through</th></tr></thead>'
            + "".join(groups) + '</table></div>')


def page(*, slug, title, kicker, blurb, body, meta, desc):
    # Escape the parts, then join with the entity -- escaping the joined
    # string turns "&middot;" into a literal "&middot;" in the tab.
    parts = ([e(title)] if title.lower().startswith("data dashboards")
             else [e(title), "Data Dashboards"])
    doc_title = " &middot; ".join(parts + ["Ryan Beck"])
    return PAGE % {
        "origin": ORIGIN,
        "title": doc_title,
        "desc": e(desc),
        "canonical": "%s/forecasting/%s" % (ORIGIN, slug) if slug else
                     "%s/forecasting" % ORIGIN,
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

    # --- the index ---
    live = sum(1 for slug, s in meta.items() if status_of(slug, s) == "live")
    idx_body = status_table(meta)

    idx = page(slug="", title=LANDING["title"], kicker=LANDING["kicker"],
               blurb=LANDING["blurb"],
               body=idx_body, meta=meta,
               desc=LANDING["description"])
    with open(os.path.join(outdir, "index.html"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(idx)

    embeds = write_embeds(outdir, meta)

    write_redirects(written, embeds)
    print("forecasting/: index + %d pages, %d embeds (%d live series)"
          % (len(written), len(embeds), live))


def write_embeds(outdir, meta):
    """One bare page per chart, for iframing elsewhere.

    Same plot config as the section on its own page, minus the `embed` key --
    an embedded chart offering its own embed code is a loop, and the page it
    would hand out is the one the reader is already looking at.
    """
    edir = os.path.join(outdir, "embed")
    if not os.path.isdir(edir):
        os.makedirs(edir)
    out = []
    for sec in SECTIONS:
        info = meta.get(sec["slug"])
        if not info:
            continue
        plot = dict(sec["plot"])
        plot["csv"] = "/data/forecasting/" + sec["csv"]
        plot["x"] = "date"
        plot["alt"] = sec["title"]
        plot["slug"] = sec["slug"]
        plot["credit"] = HOST + "/forecasting"
        plot["sourceUrl"] = sec["source_url"]
        plot["title"] = sec["title"]
        plot["subtitle"] = "%s · data to %s" % (
            sec["source"], period_label(sec, info) or human(info["last_date"]))
        with open(os.path.join(edir, sec["slug"] + ".html"), "w",
                  encoding="utf-8", newline="\n") as f:
            f.write(EMBED % {
                "host": e(HOST),
                "title": e(sec["title"]),
                "cfg": e(json.dumps(plot, separators=(",", ":"))),
                "home": "/forecasting/%s#%s" % (
                    group_of(sec["slug"]), sec["slug"]),
            })
        out.append(sec["slug"])
    return out


def group_of(section_slug):
    """Which grouping page carries a section."""
    for g in GROUPS:
        if section_slug in g["sections"]:
            return g["slug"]
    return ""


def write_redirects(slugs, embeds=()):
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
    for s in embeds:
        block.append("/forecasting/embed/%s /forecasting/embed/%s.html   200"
                     % (s, s))
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


EMBED = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>%(title)s</title>
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/plot.css">
</head>
<body class="embed-page">
<div class="plot-mount" data-plot='%(cfg)s'></div>
<p class="embed-credit"><a href="%(home)s" target="_blank" rel="noopener">%(title)s · %(host)s</a></p>
<script src="/assets/js/plot.js" defer></script>
</body>
</html>
"""


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
<meta property="og:image" content="%(origin)s/assets/og.jpg">
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
<script src="/assets/js/freshness.js" defer></script>
</body>
</html>
"""


if __name__ == "__main__":
    build()
