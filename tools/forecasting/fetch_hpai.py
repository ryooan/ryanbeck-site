"""Birds depopulated in the US highly-pathogenic avian influenza outbreak.

Source: CDC's mirror of the USDA APHIS confirmed-detections table.

The file is one row per confirmed flock, so the series is built by summing
"Flock Size" into the week each outbreak was confirmed, plus a running total.
A cumulative line is the honest shape here: individual weeks are spiky because
a single commercial layer flock can be several million birds on its own.

Note on the source, because it looks fine and is not: the CSV downloads
cleanly and the old workflow has been succeeding on it for months, but the
data itself stops in mid-2025. The status this fetcher records is driven by
the last date in the data, so the page says so instead of showing a tick.
"""
import csv
import datetime as dt
import io as _io

from _common import FetchError, get, main, record, write_csv

URL = ("https://www.cdc.gov/bird-flu/modules/situation-summary/"
       "commercial-backyard-flocks.csv")

# If the newest outbreak is older than this, the mirror has stopped moving
# rather than the outbreak having stopped.
STALE_AFTER_DAYS = 120


def run():
    text = get(URL).decode("utf-8-sig")
    rows = list(csv.DictReader(_io.StringIO(text)))
    if not rows:
        raise FetchError("HPAI CSV was empty")
    if "Outbreak Date" not in rows[0] or "Flock Size" not in rows[0]:
        raise FetchError("unexpected columns: %s" % list(rows[0]))

    by_week = {}
    flocks = {}
    for r in rows:
        raw = (r.get("Outbreak Date") or "").strip()
        if not raw:
            continue
        try:
            d = dt.datetime.strptime(raw, "%m-%d-%Y").date()
        except ValueError:
            continue
        size = (r.get("Flock Size") or "").replace(",", "").strip()
        try:
            n = int(float(size)) if size else 0
        except ValueError:
            n = 0
        # Week beginning Monday, so weeks line up with the other series here.
        wk = (d - dt.timedelta(days=d.weekday())).isoformat()
        by_week[wk] = by_week.get(wk, 0) + n
        flocks[wk] = flocks.get(wk, 0) + 1

    if not by_week:
        raise FetchError("no parseable outbreak dates")

    out, running = [], 0
    for wk in sorted(by_week):
        running += by_week[wk]
        out.append({
            "date": wk,
            "birds": by_week[wk],
            "flocks": flocks[wk],
            "cumulative": running,
        })

    write_csv("hpai-depopulations", out,
              ["date", "birds", "flocks", "cumulative"])

    last = out[-1]["date"]
    age = (dt.date.today() - dt.date.fromisoformat(last)).days
    stale = age > STALE_AFTER_DAYS
    record("hpai-depopulations", rows=len(out), last_date=last,
           status="stale" if stale else "live",
           source="CDC mirror of USDA APHIS confirmed detections",
           note=("Birds killed in confirmed commercial and backyard flocks. "
                 + ("The CDC mirror has not been updated since this date; the "
                    "outbreak itself has not stopped." if stale else "")))
    print("hpai-depopulations: %d weeks %s -> %s, %s birds total%s"
          % (len(out), out[0]["date"], last, format(running, ","),
             "  [STALE: %d days old]" % age if stale else ""))


if __name__ == "__main__":
    main(run)
