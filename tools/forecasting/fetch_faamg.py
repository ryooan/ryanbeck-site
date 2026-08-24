"""Annual revenue of Alphabet, Amazon, Apple, Meta and Microsoft.

Source: SEC XBRL company-concept API (data.sec.gov).

Built for an INFER question on the combined revenue of the five, so the file
carries each company plus the combined total.

Two wrinkles in XBRL that this has to handle, both of which produce
plausible-looking wrong numbers if ignored:

* **The revenue tag changed.** Filings from around 2018 use
  `RevenueFromContractWithCustomerExcludingAssessedTax`; older ones use
  `Revenues` or `SalesRevenueNet`. Tags are tried in order and the first that
  covers a fiscal year wins, so the series does not break at the changeover.

* **A 10-K contains more than the year it reports.** Each filing restates the
  two prior years, and quarterly facts share the same form. Entries are
  therefore filtered to full-year durations (330-400 days) and de-duplicated
  by fiscal-year end, keeping the most recently filed value -- which is also
  the restated one, if a year was ever restated.

Fiscal years are not calendar years and are not aligned across these five
(Apple ends in September, Microsoft in June). The file records each company's
fiscal-year end date, and the combined total sums by fiscal year label rather
than pretending the periods coincide.
"""
import collections
import datetime as dt

from _common import FetchError, get_json, main, record, write_csv

COMPANIES = [
    ("alphabet", 1652044, "Alphabet"),
    ("amazon", 1018724, "Amazon"),
    ("apple", 320193, "Apple"),
    ("meta", 1326801, "Meta"),
    ("microsoft", 789019, "Microsoft"),
]

TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
]

URL = ("https://data.sec.gov/api/xbrl/companyconcept/"
       "CIK%010d/us-gaap/%s.json")


def full_years(cik, tag):
    """{fiscal_year: (end_date, value)} for one company and one tag."""
    try:
        d = get_json(URL % (cik, tag))
    except FetchError:
        return {}                       # company never used this tag
    out = {}
    for x in d.get("units", {}).get("USD", []):
        if x.get("form") != "10-K" or x.get("fp") != "FY":
            continue
        if not x.get("start") or not x.get("end"):
            continue
        try:
            a = dt.date.fromisoformat(x["start"])
            b = dt.date.fromisoformat(x["end"])
        except ValueError:
            continue
        if not 330 < (b - a).days < 400:
            continue                    # a quarter, or a stub period
        fy = x.get("fy")
        if fy is None:
            continue
        key = b.year                    # fiscal year by the year it ends in
        prev = out.get(key)
        # Keep the most recently filed figure for a year, so restatements win.
        if prev is None or (x.get("filed") or "") >= prev[2]:
            out[key] = (b.isoformat(), float(x["val"]), x.get("filed") or "")
    return {k: (v[0], v[1]) for k, v in out.items()}


def run():
    per = {}
    for slug, cik, _name in COMPANIES:
        merged = {}
        for tag in TAGS:
            for fy, val in full_years(cik, tag).items():
                merged.setdefault(fy, val)   # first tag to cover a year wins
        if not merged:
            raise FetchError("no revenue found for %s (CIK %d)" % (slug, cik))
        per[slug] = merged

    years = sorted(set().union(*[set(v) for v in per.values()]))
    rows = []
    for y in years:
        row = {"date": "%d-01-01" % y, "fiscal_year": y}
        total, complete = 0.0, True
        for slug, _cik, _n in COMPANIES:
            got = per[slug].get(y)
            if got is None:
                row[slug] = ""
                complete = False
            else:
                row[slug] = round(got[1] / 1e9, 3)     # billions
                total += got[1]
        # Only publish a combined figure when all five reported -- a partial
        # sum drawn on the same axis reads as a collapse in revenue.
        row["combined"] = round(total / 1e9, 3) if complete else ""
        rows.append(row)

    fields = ["date", "fiscal_year"] + [c[0] for c in COMPANIES] + ["combined"]
    write_csv("faamg-revenues", rows, fields)

    full = [r for r in rows if r["combined"] != ""]
    last = full[-1] if full else rows[-1]
    record("faamg-revenues", rows=len(rows), last_date=last["date"],
           status="live", source="SEC XBRL company facts",
           note=("Billions of US dollars, by each company's own fiscal year. "
                 "Combined is blank for years where not all five have filed."))
    print("faamg-revenues: %d fiscal years %d -> %d (last complete: %s, $%.0fB)"
          % (len(rows), rows[0]["fiscal_year"], rows[-1]["fiscal_year"],
             last["fiscal_year"], last["combined"] or 0))


if __name__ == "__main__":
    main(run)
