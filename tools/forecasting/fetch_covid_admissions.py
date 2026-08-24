"""Weekly US hospital admissions for COVID, influenza and RSV -- current.

Source: CDC NHSN Hospital Respiratory Data, dataset `ua7e-t2fy` on
data.cdc.gov.

**This replaces the COVIDWeekly dashboard's dead source, and it is a strict
improvement on it.** That page ran on the reichlab COVID-19 Forecast Hub,
which was archived in November 2024 with its data stopping on 2024-04-19; the
page kept regenerating a chart from it every ten hours for two years.

Hospitals never stopped reporting. The requirement moved to NHSN, and the
resulting series runs **2020-08-08 to the present** -- so it covers everything
reichlab had and roughly two further years, in one place. It is updated
weekly.

`totalconfc19newadm` is the same quantity the old dashboard plotted: new
admissions with a laboratory-confirmed COVID diagnosis, summed nationally.
The file carries influenza and RSV from the same rows, since they arrive free
and the old set had separate pages for them.

The jurisdiction to filter on is `USA`, which is a real rollup row in this
dataset rather than something to be summed -- adding the 66 state and
territory rows together would double-count it.
"""
import datetime as dt
import urllib.parse

from _common import FetchError, get_json, main, record, write_csv

BASE = "https://data.cdc.gov/resource/ua7e-t2fy.json"

COLS = {
    "totalconfc19newadm": "covid",
    "totalconfflunewadm": "influenza",
    "totalconfrsvnewadm": "rsv",
}
# Reported as a rate as well; worth keeping, since raw counts move with how
# many hospitals reported that week.
RATE = {"totalconfc19newadmper100k": "covid_per_100k"}


def num(v):
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def run():
    sel = ",".join(["weekendingdate"] + list(COLS) + list(RATE))
    rows = []
    offset, page = 0, 5000
    while True:
        q = {
            "jurisdiction": "USA",
            "$select": sel,
            "$order": "weekendingdate",
            "$limit": str(page),
            "$offset": str(offset),
        }
        chunk = get_json(BASE + "?" + urllib.parse.urlencode(q), timeout=120)
        if not isinstance(chunk, list):
            raise FetchError("unexpected response: %s" % str(chunk)[:200])
        rows += chunk
        if len(chunk) < page:
            break
        offset += page

    if not rows:
        raise FetchError("no USA rows returned -- has the jurisdiction label "
                         "changed?")

    out = []
    for r in rows:
        d = (r.get("weekendingdate") or "")[:10]
        if len(d) != 10:
            continue
        rec = {"date": d}
        got = False
        for src, name in COLS.items():
            v = num(r.get(src))
            rec[name] = "" if v is None else int(round(v))
            if v is not None:
                got = True
        for src, name in RATE.items():
            v = num(r.get(src))
            rec[name] = "" if v is None else round(v, 2)
        if got:
            out.append(rec)

    out.sort(key=lambda r: r["date"])
    fields = ["date"] + list(COLS.values()) + list(RATE.values())
    write_csv("covid-weekly-admissions", out, fields)

    last = out[-1]["date"]
    age = (dt.date.today() - dt.date.fromisoformat(last)).days
    record("covid-weekly-admissions", rows=len(out), last_date=last,
           status="live" if age <= 45 else "stale",
           source="CDC NHSN Hospital Respiratory Data",
           note=("Weekly new hospital admissions with a laboratory-confirmed "
                 "diagnosis, national. Replaces the archived reichlab series "
                 "and extends it in both directions."))
    print("covid-weekly-admissions: %d weeks %s -> %s (latest COVID %s)"
          % (len(out), out[0]["date"], last, out[-1]["covid"]))


if __name__ == "__main__":
    main(run)
