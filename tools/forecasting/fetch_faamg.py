"""Revenue of Alphabet, Amazon, Apple, Meta and Microsoft -- annual and quarterly.

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

## The quarterly series, and the spikes in the old one

The old dashboard's quarterly chart had two enormous spikes in it: Apple
jumping to ~$383B in 2023 and Microsoft to ~$332B at the end. Those are not
quarters. They are the **annual** figures -- Apple FY2023 revenue is $383.285B
and Microsoft FY2026 is $331.839B -- landing in the quarterly series because
the old code selected on form and fiscal period rather than on **how long the
period actually was**. A 10-K contains both: the twelve-month total and, often,
three-month figures.

So quarters here are chosen by duration: 80 to 100 days. That removes the
spikes, and immediately exposes the second problem, which is why the naive fix
is not enough.

**A 10-K does not always report the fourth quarter as a quarter.** Three 10-Qs
cover Q1-Q3 and the 10-K reports the year; the final quarter frequently exists
nowhere as a three-month fact. Filtering on duration alone therefore leaves a
hole every twelve months -- Apple is missing the quarter ending September 2025,
Microsoft the one ending June 2025 -- which is worse than a spike, because a
gap looks like nothing is wrong.

The missing quarter is derived: annual minus the three quarters inside that
fiscal year. Checked against what the companies actually reported:

    Apple     FY2023 Q4  derived $89.5B   reported $89.498B
    Apple     FY2024 Q4  derived $94.9B   reported $94.930B
    Microsoft FY2024 Q4  derived $64.7B   reported $64.727B
    Alphabet    Q4 2024  derived $96.5B   reported $96.469B
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


def raw_entries(cik):
    """Every USD fact for this company across the candidate tags.

    Returns (start, end, days, value, filed) tuples. Both the annual and the
    quarterly builders read from this, so the tags are fetched once.
    """
    out = []
    for tag in TAGS:
        try:
            d = get_json(URL % (cik, tag))
        except FetchError:
            continue                    # company never used this tag
        for x in d.get("units", {}).get("USD", []):
            s_, e_ = x.get("start"), x.get("end")
            if not s_ or not e_:
                continue
            try:
                a = dt.date.fromisoformat(s_)
                b = dt.date.fromisoformat(e_)
            except ValueError:
                continue
            out.append((a, b, (b - a).days, float(x["val"]), x.get("filed") or ""))
    return out


def quarters_for(cik):
    """{period end date: value} for every quarter, including derived ones."""
    es = raw_entries(cik)

    q, y = {}, {}
    for a, b, n, v, filed in es:
        if 80 <= n <= 100:              # a quarter
            if b not in q or filed >= q[b][1]:
                q[b] = (v, filed, a)
        elif 330 <= n <= 400:           # a fiscal year
            if b not in y or filed >= y[b][1]:
                y[b] = (v, filed, a)

    # Fill the quarter a 10-K reports only inside its annual total.
    for y_end, (y_val, _f, y_start) in y.items():
        inside = [b for b in q if y_start <= q[b][2] and b <= y_end]
        if len(inside) != 3:
            continue                    # already complete, or too little to infer
        gap = y_val - sum(q[b][0] for b in inside)
        if gap <= 0:
            continue                    # would not be a plausible quarter
        # Place it at the fiscal year end, which is where the missing quarter
        # ends by definition.
        if y_end not in q:
            q[y_end] = (gap, "derived", max(inside))

    return {b: v for b, (v, _f, _a) in q.items()}


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


def cal_quarter(d):
    """Label a period-end date by the calendar quarter it falls in."""
    return d.year, (d.month - 1) // 3 + 1


def build_quarterly():
    per = {}
    for slug, cik, _name in COMPANIES:
        qs = quarters_for(cik)
        if not qs:
            raise FetchError("no quarters found for %s" % slug)
        by_cq = {}
        for end, val in qs.items():
            by_cq[cal_quarter(end)] = (val, end)
        per[slug] = by_cq

    all_q = sorted(set().union(*[set(v) for v in per.values()]))
    rows = []
    for cq in all_q:
        yr, qn = cq
        # Date the point at the end of the calendar quarter.
        end_month = qn * 3
        row = {"date": "%d-%02d-01" % (yr, end_month), "quarter": "%dQ%d" % (yr, qn)}
        total, complete = 0.0, True
        for slug, _c, _n in COMPANIES:
            got = per[slug].get(cq)
            if got is None:
                row[slug] = ""
                complete = False
            else:
                row[slug] = round(got[0] / 1e9, 3)
                total += got[0]
        row["combined"] = round(total / 1e9, 3) if complete else ""
        rows.append(row)
    return rows


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

    # ---- quarterly --------------------------------------------------------
    qrows = build_quarterly()
    qfields = ["date", "quarter"] + [c[0] for c in COMPANIES] + ["combined"]
    write_csv("faamg-revenues-quarterly", qrows, qfields)
    qfull = [r for r in qrows if r["combined"] != ""]
    record("faamg-revenues-quarterly", rows=len(qrows),
           last_date=(qfull or qrows)[-1]["date"], status="live",
           source="SEC XBRL company facts",
           note=("Billions of US dollars per quarter, aligned by the calendar "
                 "quarter each fiscal quarter ends in."))
    biggest = max((r[c[0]] for r in qrows for c in COMPANIES
                   if isinstance(r[c[0]], float)), default=0)
    print("faamg-revenues-quarterly: %d quarters %s -> %s (largest single "
          "quarter $%.1fB)" % (len(qrows), qrows[0]["quarter"],
                               qrows[-1]["quarter"], biggest))

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
