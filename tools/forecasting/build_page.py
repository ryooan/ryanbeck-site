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
            "Annual revenue of Alphabet, Amazon, Apple, Meta and Microsoft, "
            "read straight out of their SEC filings. Billions of dollars. The "
            "five do not share a fiscal calendar — Apple's year ends in "
            "September and Microsoft's in June — so the combined line is "
            "blank for any year where they have not all filed yet."),
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
            "Amazon and Apple both spike every December. "
            "<strong>The old version of this chart had two false spikes in it</strong>: "
            "Apple appearing to earn $383bn in a quarter and Microsoft $332bn. "
            "Those are the companies’ <em>annual</em> figures, which reached the "
            "quarterly series because the old code selected filings by form "
            "rather than by how long the reporting period actually was. Quarters "
            "here are picked by duration. The fourth quarter is then derived "
            "from the annual total, because a 10-K often reports the year "
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
            "This is the series that prompted the rebuild: its job succeeded "
            "every ten hours for two years and republished a chart each time, "
            "while the repository behind it had been archived in November 2024 "
            "and the data had stopped the previous April."
            "<br><br>"
            "<strong>It is live again, and longer than it ever was.</strong> "
            "Hospitals never stopped reporting — the requirement moved to "
            "the CDC’s National Healthcare Safety Network, which carries "
            "the same measure from August 2020 to last week. That covers "
            "everything the archived source had plus the two years it missed. "
            "Influenza and RSV come from the same rows, so all three "
            "respiratory admissions are here on one chart."),
        "source": "CDC NHSN Hospital Respiratory Data",
        "source_url": "https://data.cdc.gov/resource/ua7e-t2fy",
        "extra_csv": "covid-weekly-admissions-reichlab.csv",
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
            "layout": "us-grid",
            "defaultMode": "change",
            "changeLagWeeks": 4,
            "changeWeeks": 6,
            "valueRanges": ["6m", "1y", "2y", "5y"],
        },
        "note": (
            "The same admissions, state by state, laid out roughly as the map "
            "is — so you find a state where you expect it, and a bad week "
            "across the southeast reads as a block of colour rather than eight "
            "scattered cells. It opens on percentage change against four weeks "
            "earlier, which is what makes a small state climbing fast as "
            "visible as a large one. The buttons switch to the underlying "
            "admissions per 100,000 over a window. Either way every panel "
            "shares one vertical scale, so the boxes are honestly comparable."),
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
                {"col": "birds", "label": "Killed that week", "axis": "right"},
            ],
        },
        "note": (
            "Birds killed in confirmed commercial and backyard flocks during "
            "the H5N1 outbreak. The weekly count sits on its own axis on the "
            "right: a single commercial layer flock can be several million "
            "birds, so the weeks are spiky, and on the running total’s "
            "scale they would be a flat line along the bottom. The download "
            "splits each week into commercial and backyard birds."
            "<br><br>"
            "This chart read “source stalled” until recently, and "
            "the reason is worth keeping. It was fed by a CDC mirror that "
            "still returns a perfectly valid file and stopped being updated in "
            "June 2025 — nothing failed, the numbers simply stopped "
            "moving. USDA had put the data behind a Tableau dashboard with no "
            "obvious download. It turned out the dashboard publishes a second "
            "hidden view, and asking for that view as CSV returns the whole "
            "detection table. Thirty-three million birds were missing from "
            "this chart."),
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

# The sidebar. Each entry becomes its own page at /forecasting/<slug>, so a
# grouping can be linked to directly -- which is the point of splitting them
# up rather than running one long scroll.
#
# Grouped by subject, not by status: a reader looking for flu wants the live
# series and the frozen one next to each other, with each labelled.
GROUPS = [
    {
        "slug": "respiratory",
        "nav": "Respiratory illness",
        "title": "Respiratory illness",
        "kicker": "COVID, influenza and RSV",
        "blurb": (
            "<p>Weekly hospital admissions for the three respiratory viruses "
            "that get forecast most, nationally and by state.</p>"
            "<p><strong>This grouping is why the whole set was rebuilt.</strong> "
            "The old COVID page ran a scheduled job every ten hours for two "
            "years and reported success every time, while the repository "
            "behind it had been archived and its data had stopped in April "
            "2024. Nobody was lying; nothing failed. The job fetched a file, "
            "the file was valid, and the chart was redrawn with today’s "
            "date on it. What was missing was any statement of when the "
            "<em>data</em> ended.</p>"
            "<p>Hospitals had never stopped reporting — the requirement "
            "moved to the CDC’s National Healthcare Safety Network, where "
            "the same measure runs from August 2020 to last week. So the "
            "series is not only alive, it is longer than it ever was.</p>"),
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
            "ceiling itself, from the Daily Treasury Statement. Built to "
            "forecast X-date questions without re-reading a spreadsheet every "
            "morning.</p>"
            "<p>The shaded stretches are the eight occasions Congress has "
            "suspended the limit rather than raised it. During a suspension "
            "there is no ceiling to plot, so the line stops — which is "
            "more honest than the alternative, because Treasury publishes a "
            "zero in that field and drawing it would send the ceiling to the "
            "floor.</p>"),
        "sections": ["debt-limit"],
    },
    {
        "slug": "big-tech-revenue",
        "nav": "Big-tech revenue",
        "title": "Big-tech revenue",
        "kicker": "SEC filings",
        "blurb": (
            "<p>Revenue for Alphabet, Amazon, Apple, Meta and Microsoft, read "
            "out of their SEC filings, annually and by quarter. Built for a "
            "question on their combined revenue.</p>"
            "<p>The five do not share a fiscal calendar — Apple’s "
            "year ends in September and Microsoft’s in June — so the "
            "combined line is blank for any period where they have not all "
            "filed. A partial sum drawn on the same axis reads as revenue "
            "collapsing.</p>"),
        "sections": ["faamg-revenues", "faamg-revenues-quarterly"],
    },
    {
        "slug": "refugee-admissions",
        "nav": "Refugee admissions",
        "title": "US refugee admissions",
        "kicker": "State Department, monthly",
        "blurb": (
            "<p>People admitted to the United States as refugees, from the "
            "State Department’s Refugee Processing Center. Fiscal years "
            "run October to September.</p>"
            "<p>The annual ceiling is set by presidential determination and is "
            "a cap rather than a target — admissions have come in well "
            "under it far more often than they have approached it. The long "
            "view reaches back to 1975, where the two peaks are the Vietnamese "
            "and Soviet resettlements.</p>"),
        "sections": ["refugee-admissions", "refugee-admissions-annual"],
    },
    {
        "slug": "semiconductors",
        "nav": "Semiconductor trade",
        "title": "Semiconductor trade",
        "kicker": "UN Comtrade",
        "blurb": (
            "<p>US exports of chips and chipmaking equipment to China, and "
            "what China buys from the whole world. Built for a set of "
            "questions on export controls.</p>"
            "<p>Chips are HS 8542; equipment is HS 8486, 903082, 903141, "
            "854311 and 901041, summed — the same commodity codes the "
            "original used. Monthly trade is noisy, so a six-month rolling "
            "average is carried alongside the raw months, as before.</p>"),
        "sections": ["semiconductors-us-exports-china",
                     "semiconductors-china-imports"],
    },
    {
        "slug": "bird-flu",
        "nav": "Bird flu",
        "title": "Bird flu",
        "kicker": "USDA APHIS",
        "blurb": (
            "<p>Birds killed in confirmed commercial and backyard flocks "
            "during the H5N1 outbreak, from USDA’s detection records.</p>"
            "<p>This one is worth reading twice. It spent months showing 174.8 "
            "million birds and a note saying its source had stalled — "
            "true, but the wrong conclusion. The feed it read, a CDC mirror, "
            "had quietly stopped updating while still returning a perfectly "
            "valid file. The outbreak had not stopped at all, and USDA had "
            "moved its data behind a dashboard with no obvious download. The "
            "real total was 33 million birds higher.</p>"),
        "sections": ["hpai-depopulations"],
    },
    {
        "slug": "virginia-covid",
        "nav": "Virginia COVID",
        "title": "Virginia COVID",
        "kicker": "VDH, retired",
        "blurb": (
            "<p>Two Virginia series that no longer update, kept because the "
            "history is real and in one case is the only copy left.</p>"
            "<p>The vaccination series is complete: nearly ten million rows, "
            "which turned out never to have been lost when the old endpoints "
            "started returning 404s — the dataset had simply moved hosts. "
            "The cases-by-age series is not complete, and the page says so "
            "rather than showing a stub and hoping nobody checks.</p>"),
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
        "last_h": e(human(info["last_date"])), "title": e(sec["title"]),
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
                   e(human(info["last_date"])), format(info["rows"], ",")))
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
    <p class="series-note">124 files, about 18 MB, one CSV per data frame,
    gzipped. <a href="/data/forecasting/archive/MANIFEST.csv">The manifest</a>
    lists every one with its row count, column count and date range.</p>
    <p class="series-note" style="margin-top:14px">The largest single item is
    the full HHS hospital-capacity panel &mdash; 66,966 rows by 135 columns,
    every state, 2020 to 2023, including age-banded admissions. That is the
    best age-stratified COVID series that survives anywhere for Virginia, and
    it is the reason the retired VDH cases-by-age page points at it.</p>
  </section>
  <section class="series">
    <h2>Why it exists</h2>
    <p class="series-note">Because the old dashboards fetched, analysed,
    plotted and published in one step, nothing was ever kept. A rendered PNG
    was committed; the numbers behind it were not. When a source went away, so
    did its history.</p>
    <p class="series-note" style="margin-top:14px">No source data was ever
    committed to the old repository &mdash; checked across all 9,026 of its
    commits. What survived did so by accident, in R session files on one
    machine, and for several of these series that was the only copy in
    existence. Extracting them was the first thing done here and the only step
    that got more expensive by waiting.</p>
  </section>
"""
    arch = page(slug="archive", title="The archive",
                kicker="rescued data", blurb=(
                    "<p>Several of these series outlived the places they came "
                    "from. Where a source has gone for good the history is kept "
                    "here rather than lost with it.</p>"),
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
    <p class="series-note">%(live)d of these refresh on a schedule. The rest are
    frozen at the date their source stopped, and are kept rather than deleted.
    <strong>Every state below is computed from the last date in the data, never
    from when the job last ran</strong> &mdash; which is the one thing the
    versions these replaced could not tell you.</p>
    %(table)s
  </section>
  <section class="series">
    <h2>How it works</h2>
    <p class="series-note">Small Python fetchers pull each source, write tidy
    CSV, and record what they found. This page is generated from that record.
    The charts are one dependency-free file: every dashboard here died of
    dependency rot at least once, so importing a charting library to fix them
    would have been reproducing the disease.</p>
    <p class="series-note" style="margin-top:14px">Every series is downloadable
    from its own section, and
    <a href="/data/forecasting/manifest.json">manifest.json</a> carries the
    machine-readable state of all of them.</p>
  </section>
""" % {"live": live, "table": status_table(meta)}

    idx = page(slug="", title="Forecasting data", kicker="Through the first door",
               blurb=(
                   "<p>Numbers I kept reaching for while forecasting, collected "
                   "so I would stop re-downloading them by hand. Pick a subject "
                   "from the list.</p>"
                   "<p>Each series states the date its data actually ends, which "
                   "is not always the date it last ran. That distinction is the "
                   "point: a scheduled job reporting success tells you it "
                   "fetched something, not that anyone upstream is still "
                   "publishing.</p>"),
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
