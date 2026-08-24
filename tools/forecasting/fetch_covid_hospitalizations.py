"""COVID and influenza hospitalisations, national and Virginia.

Source: healthdata.gov dataset g62h-syeh, the HHS "COVID-19 Reported Patient
Impact and Hospital Capacity by State" timeseries.

This one source fed three of the old dashboards -- COVID Hospitalizations,
Flu Hospitalizations and Weekly Hospitalizations. All three died the same
death: `RSocrata` was archived from CRAN and the runs began failing. **The
dependency was never necessary.** The plain CSV export works and always did,
which means one package leaving CRAN took down three pages for nothing.

The series is frozen: HHS stopped requiring the reporting it was built on, so
the data ends in spring 2024. This fetcher therefore records `historical`, and
exists to preserve the series rather than to keep it moving.

The file is ~38 MB, so it is parsed as a stream and only the columns actually
charted are kept.
"""
import collections
import csv
import io as _io

from _common import FetchError, get, main, record, write_csv

URL = "https://healthdata.gov/api/views/g62h-syeh/rows.csv?accessType=DOWNLOAD"

# Column -> output name. Everything else in the 135-column file is dropped.
WANT = {
    "total_adult_patients_hospitalized_confirmed_covid": "adult_covid",
    "total_pediatric_patients_hospitalized_confirmed_covid": "pediatric_covid",
    "total_patients_hospitalized_confirmed_influenza": "influenza",
    "staffed_icu_adult_patients_confirmed_covid": "icu_covid",
    "previous_day_admission_adult_covid_confirmed": "adult_covid_admissions",
    "inpatient_beds_used_covid": "beds_used_covid",
}


def iso(d):
    """Normalise the source's date to ISO.

    healthdata.gov serves this column as YYYY/MM/DD, not YYYY-MM-DD. Passing
    it straight through produces a CSV the chart module silently refuses to
    plot, because its date parser only matches dashes -- an empty chart with
    no error anywhere.
    """
    d = (d or "").strip()[:10]
    if len(d) == 10 and d[4] in "/-" and d[7] in "/-":
        return d.replace("/", "-")
    return ""


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def run():
    raw = get(URL, timeout=300).decode("utf-8-sig", "replace")
    rdr = csv.DictReader(_io.StringIO(raw))
    if "state" not in (rdr.fieldnames or []) or "date" not in (rdr.fieldnames or []):
        raise FetchError("unexpected columns: %s" % (rdr.fieldnames or [])[:8])

    missing = [c for c in WANT if c not in rdr.fieldnames]
    if missing:
        raise FetchError("source no longer has: %s" % missing)

    # date -> metric -> running sum, for the whole US and for Virginia alone.
    us = collections.defaultdict(lambda: collections.defaultdict(float))
    va = collections.defaultdict(lambda: collections.defaultdict(float))
    us_seen = collections.defaultdict(lambda: collections.defaultdict(bool))

    for row in rdr:
        d = iso(row.get("date"))
        if not d:
            continue
        target = va if row.get("state") == "VA" else None
        for col, name in WANT.items():
            v = num(row.get(col))
            if v is None:
                continue
            us[d][name] += v
            us_seen[d][name] = True
            if target is not None:
                target[d][name] += v

    if not us:
        raise FetchError("no rows parsed")

    def rows_for(store, seen=None):
        out = []
        for d in sorted(store):
            rec = {"date": d}
            for name in WANT.values():
                if seen is not None and not seen[d][name]:
                    rec[name] = ""
                else:
                    v = store[d].get(name)
                    rec[name] = "" if v is None else int(round(v))
            out.append(rec)
        return out

    fields = ["date"] + list(WANT.values())
    national = rows_for(us, us_seen)
    virginia = rows_for(va)

    write_csv("covid-hospitalizations", national, fields)
    write_csv("covid-hospitalizations-va", virginia, fields)

    last = national[-1]["date"]
    note = ("Patients in hospital with a confirmed diagnosis, summed across "
            "reporting states. HHS ended the reporting requirement this series "
            "was built on, so it stops here.")
    for slug, rows in (("covid-hospitalizations", national),
                       ("covid-hospitalizations-va", virginia)):
        record(slug, rows=len(rows), last_date=rows[-1]["date"],
               status="historical", source="healthdata.gov g62h-syeh (HHS)",
               note=note)
    print("covid-hospitalizations: %d days %s -> %s (VA: %d days)"
          % (len(national), national[0]["date"], last, len(virginia)))


if __name__ == "__main__":
    main(run)
