"""Birds killed in the US highly-pathogenic avian influenza outbreak.

Source: USDA APHIS, via the `ExportToCsv` view of its public Tableau
workbook. Full detection detail -- one row per confirmed flock, with the date,
state, county, production type and birds affected.

## Why this URL, and how it was found

The obvious source is the CDC's mirror at
`cdc.gov/bird-flu/modules/situation-summary/commercial-backyard-flocks.csv`,
which is what this fetcher used to read. **It still returns HTTP 200 and 112 KB
of perfectly valid CSV, and it has not been updated since June 2025.** That is
the most dangerous shape a dead source can take: nothing fails.

APHIS moved the data into a Tableau dashboard, which looks like a dead end --
the page has no data link, the embed is a JavaScript shell, and Tableau's
`vizportal` listing API returns 401 to anonymous callers. Guessing view names
(`CommercialFlocks`, `BirdsAffected`, `Detections`) all 404.

The answer came from loading the dashboard in a real browser and reading the
response to its own `POST .../startSession/viewing` call, which announces:

    "visible_sheets": ["HPAI 2022 Confirmed Detections", "ExportToCsv"]

There is a second published view called `ExportToCsv` -- the sheet behind the
dashboard's own Download Data button. Appending `.csv` to any Tableau view
URL exports it, so **no session, no scraping, and no vizql reverse-engineering
is needed**; the whole trick was learning the view's name.

Two notes for whoever maintains this:

* The dashboard's *default* view also exports, but only gives a summary of
  backyard flock counts by month, and it ignores every filter parameter. If
  you find yourself parsing that, you have the wrong view.
* If `ExportToCsv` ever 404s, repeat the trick: open the dashboard in a
  browser, watch the `startSession` response, and read `visible_sheets`.
"""
import csv
import datetime as dt
import io as _io

from _common import UA, FetchError, get, main, record, write_csv

URL = ("https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/"
       "VS_Avian_HPAIConfirmedDetections2022/ExportToCsv.csv")

# Tableau serves this through a CDN that is picky about a bare user agent.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; %s)" % UA}

DATE_COL = "Confirmed Diagnosis"
BIRDS_COL = "Birds Affected (Table)"
TYPE_COL = "Production"

STALE_AFTER_DAYS = 120


def count(v):
    """'231,400' -> 231400. Blank and non-numeric become 0, not an error:
    a handful of rows genuinely carry no bird count."""
    v = (v or "").replace(",", "").strip()
    try:
        return int(float(v))
    except ValueError:
        return 0


def run():
    text = get(URL, headers=HEADERS, timeout=180).decode("utf-8-sig", "replace")
    rows = list(csv.DictReader(_io.StringIO(text)))
    if not rows:
        raise FetchError("HPAI export was empty")
    for col in (DATE_COL, BIRDS_COL, TYPE_COL):
        if col not in rows[0]:
            raise FetchError("column %r missing; the export view changed. "
                             "Columns seen: %s" % (col, list(rows[0])))

    weeks = {}
    for r in rows:
        raw = (r.get(DATE_COL) or "").strip()[:10]
        try:
            d = dt.date.fromisoformat(raw)
        except ValueError:
            continue
        n = count(r.get(BIRDS_COL))
        # APHIS labels non-commercial flocks under WOAH categories; anything
        # not explicitly Commercial is counted as backyard, which is how the
        # old dashboard split them.
        commercial = (r.get(TYPE_COL) or "").strip().lower().startswith("commercial")

        wk = (d - dt.timedelta(days=d.weekday())).isoformat()
        w = weeks.setdefault(wk, {"birds": 0, "commercial": 0,
                                  "backyard": 0, "flocks": 0})
        w["birds"] += n
        w["flocks"] += 1
        w["commercial" if commercial else "backyard"] += n

    if not weeks:
        raise FetchError("no parseable confirmation dates")

    out, running = [], 0
    for wk in sorted(weeks):
        w = weeks[wk]
        running += w["birds"]
        out.append({
            "date": wk,
            "birds": w["birds"],
            "commercial": w["commercial"],
            "backyard": w["backyard"],
            "flocks": w["flocks"],
            "cumulative": running,
        })

    write_csv("hpai-depopulations", out,
              ["date", "birds", "commercial", "backyard", "flocks",
               "cumulative"])

    last = out[-1]["date"]
    age = (dt.date.today() - dt.date.fromisoformat(last)).days
    stale = age > STALE_AFTER_DAYS
    record("hpai-depopulations", rows=len(out), last_date=last,
           status="stale" if stale else "live",
           source="USDA APHIS confirmed detections",
           note=("Birds killed in confirmed commercial and backyard flocks, "
                 "from the full detection export behind the APHIS dashboard."))
    print("hpai-depopulations: %d weeks %s -> %s, %s birds total%s"
          % (len(out), out[0]["date"], last, format(running, ","),
             "  [STALE: %d days]" % age if stale else ""))


if __name__ == "__main__":
    main(run)
