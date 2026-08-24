"""Weekly US COVID hospital admissions as the *archived* reichlab hub had them.

**Superseded by fetch_covid_admissions.py, and kept anyway.** The page charts
the CDC NHSN series, which is live and covers everything this one did. This
fetcher is retained because the two do not agree, and the difference is
methodological rather than a mistake: across 193 overlapping full weeks NHSN
runs about 4% higher at the median and up to 17% higher in 2020, since the two
programmes count admissions under different inclusion criteria.

Anyone comparing the new chart against the old dashboard's numbers will see
that gap. This file is the record of what the old numbers actually were, so
the comparison can be made rather than argued about. It writes
`covid-weekly-admissions-reichlab.csv` and is not charted.

Source: reichlab/covid19-forecast-hub, `data-truth/truth-Incident
Hospitalizations.csv`.

**This is the dashboard that made the whole rebuild necessary.** Its workflow
succeeded every ten hours for two years and re-committed a fresh chart each
time. The repository behind it was archived in November 2024 and its data
stops on 2024-04-19. Nothing in the old setup would ever have said so: the job
was green, the file was rewritten, the page had today's date on it.

So this fetcher records `historical` with the real last date, and the page
prints it. That is the entire design principle in one file.

One practical note: the truth files are stored with **git-lfs**, so
`raw.githubusercontent.com` returns a 132-byte pointer rather than the data.
The bytes come from `media.githubusercontent.com/media/...` instead. A fetcher
reading the pointer would parse it as a one-line CSV and quietly publish
nothing.
"""
import collections
import csv
import io as _io

from _common import FetchError, get, main, record, write_csv

# media.githubusercontent, NOT raw -- see the note above.
URL = ("https://media.githubusercontent.com/media/reichlab/"
       "covid19-forecast-hub/master/data-truth/"
       "truth-Incident%20Hospitalizations.csv")

NATIONAL = ("US", "United States")


def run():
    text = get(URL, timeout=180).decode("utf-8-sig", "replace")
    if text.startswith("version https://git-lfs"):
        raise FetchError("got a git-lfs pointer, not the data -- use the "
                         "media.githubusercontent.com host")

    rows = list(csv.DictReader(_io.StringIO(text)))
    if not rows or "date" not in rows[0]:
        raise FetchError("unexpected columns: %s" % list(rows[0] if rows else []))

    # Source is daily and per-location; the dashboard plotted national weeks.
    weeks = collections.defaultdict(float)
    seen = collections.defaultdict(bool)
    import datetime as dt
    for r in rows:
        if r.get("location_name") not in NATIONAL:
            continue
        try:
            d = dt.date.fromisoformat(r["date"][:10])
            v = float(r["value"])
        except (ValueError, TypeError, KeyError):
            continue
        wk = (d - dt.timedelta(days=d.weekday())).isoformat()
        weeks[wk] += v
        seen[wk] = True

    if not weeks:
        raise FetchError("no national rows found")

    out = [{"date": w, "admissions": int(round(weeks[w]))}
           for w in sorted(weeks)]
    # The final partial week is an artefact of where the data stops, not a
    # collapse in admissions; drop it rather than draw a cliff.
    if len(out) > 1:
        out = out[:-1]

    write_csv("covid-weekly-admissions-reichlab", out, ["date", "admissions"])

    last = out[-1]["date"]
    record("covid-weekly-admissions-reichlab", rows=len(out), last_date=last,
           status="historical", source="reichlab COVID-19 Forecast Hub",
           note=("Archived. Superseded on the page by the CDC NHSN series, "
                 "which runs about 4% higher at the median because the two "
                 "count admissions differently."))
    print("covid-weekly-admissions-reichlab: %d weeks %s -> %s (archival)"
          % (len(out), out[0]["date"], last))


if __name__ == "__main__":
    main(run)
