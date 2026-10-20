"""Weekly US influenza hospital admissions.

Source: CDC FluSight forecast hub, `target-hospital-admissions.csv`.

Two files come out of this. The national series drives the chart on the page;
the state file is kept because it is the only place the per-state history is
retained, and because the old dashboard's 50-state small multiples will want
it. Both are small enough to commit weekly without the repo noticing.
"""
import csv
import io as _io

from _common import FetchError, get, main, record, write_csv

URL = ("https://raw.githubusercontent.com/cdcepi/FluSight-forecast-hub/"
       "main/target-data/target-hospital-admissions.csv")

# The hub labels the national row "US"; everything else is a state or
# territory. Treating it as just another location would double the totals.
NATIONAL = ("US", "United States")


def run():
    text = get(URL).decode("utf-8-sig")
    rows = list(csv.DictReader(_io.StringIO(text)))
    if not rows:
        raise FetchError("FluSight target file was empty")

    need = {"date", "location_name", "value"}
    if not need <= set(rows[0]):
        raise FetchError("unexpected columns: %s" % list(rows[0]))

    national, states = [], []
    for r in rows:
        try:
            v = float(r["value"])
        except (TypeError, ValueError):
            continue
        rec = {
            "date": r["date"],
            "location": r["location_name"],
            "admissions": int(round(v)),
            "rate_per_100k": r.get("weekly_rate", ""),
        }
        (national if r["location_name"] in NATIONAL else states).append(rec)

    if not national:
        raise FetchError("no national rows found; location labels may have changed")

    national.sort(key=lambda r: r["date"])
    states.sort(key=lambda r: (r["date"], r["location"]))

    write_csv("flu-hospitalizations", national,
              ["date", "admissions", "rate_per_100k"])
    write_csv("flu-hospitalizations-states", states,
              ["date", "location", "admissions", "rate_per_100k"])

    last = national[-1]["date"]
    record("flu-hospitalizations", rows=len(national), last_date=last,
           status="live", source="CDC FluSight forecast hub",
           note="Weekly hospital admissions with a confirmed influenza diagnosis.")
    # Recorded separately: the dashboard gives the state grid its own status
    # line, and without this its entry kept the date of the first run.
    record("flu-hospitalizations-states", rows=len(states),
           last_date=states[-1]["date"], status="live",
           source="CDC FluSight forecast hub",
           note="Weekly admissions by state.")
    print("flu-hospitalizations: %d weeks %s -> %s (+%d state rows)"
          % (len(national), national[0]["date"], last, len(states)))


if __name__ == "__main__":
    main(run)
