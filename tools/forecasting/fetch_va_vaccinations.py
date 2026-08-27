"""Virginia COVID vaccinations, statewide, by status and by age group.

Source: data.virginia.gov CKAN datastore, resource
b05a0987-10b3-4386-b779-389affbab963.

The old dashboard died in February 2024 when the Socrata endpoints it used
started 404ing, and its workflow was switched off by hand. The data was never
lost -- the dataset moved to the state's CKAN platform and is complete:
9,944,092 rows, 2021-03-17 to 2023-09-19, county-level and age-stratified.

Ryan had started this port himself (the local Virginia_Vaccinations.Rmd of
2024-03-20 moves to `datastore_search`) but it does not work: it passes the
literal string "Report Date" to as.Date instead of the column, so every row
becomes NA, and the URL carries no `limit`, so CKAN returns its default 100
records. The instinct was right; this finishes it.

**Aggregate on the server.** Nine million rows is not something to paginate
through for a chart of a few hundred points. `datastore_search_sql` does the
GROUP BY and returns thousands of rows instead of millions.

**Two days in this series are wrong at the source, in two different ways.**

2023-02-21 is row duplication: VDH published every row two and three times
over, 42,593 rows where a normal day has about 13,881. Summing straight
through tripled the day. The duplicates are not identical either -- the same
locality, age band and status can appear with 37 and then 38 -- so `DISTINCT`
does not fix it, because that keeps both and adds them. The query takes MAX at
the finest grain (date, locality, age group, status) and sums those, which
collapses a repeat whatever value it carries.

2021-07-24 is not duplication and cannot be fixed by grouping. Every row is
unique, 135 localities per band as usual; the Case Age Group *values* are
themselves exactly doubled. The total that day is 9,703,802 against a Vaccine
Age Group total of 4,851,901 on the same date and roughly 4.85M on either
side. So the day is dropped by the outlier rule below and left blank, which
breaks the line rather than drawing a spike VDH never had.

Note the real column names, which is what the half-finished port tripped on:
they are `Report Date`, `Age Group`, `Vaccination Status` and `People by
vaccination status count` -- spaces and capitals, so they must be quoted.
"""
from _common import FetchError, get_json, main, record, write_csv

SQL_URL = "https://data.virginia.gov/api/3/action/datastore_search_sql?sql="
RID = "b05a0987-10b3-4386-b779-389affbab963"

# The dataset carries two parallel groupings; mixing them double-counts.
AGE_TYPE = "Case Age Group"


def q(sql):
    import urllib.parse
    d = get_json(SQL_URL + urllib.parse.quote(sql), timeout=300)
    if not d.get("success"):
        raise FetchError("CKAN rejected the query: %s" % str(d.get("error"))[:200])
    return d["result"]["records"]


def blank_outliers(rows, cols, ratio=1.4):
    """Blank a day that stands far above both of its neighbours.

    This is a cumulative count of people vaccinated: it can only creep. A
    single day 40% above the days on either side, and back down after, is not
    a surge -- it is an arithmetic error upstream, and 2021-07-24 is exactly
    double. Blanking breaks the line there, which is honest; leaving it draws
    a spike the state never reported.

    Deliberately narrow. It needs BOTH neighbours to be far below, so a real
    step change (a reporting-method switch, say) survives, and it only ever
    blanks -- nothing is rewritten to a value nobody published.
    """
    dropped = []
    for i in range(1, len(rows) - 1):
        for c in cols:
            a, b, d = rows[i - 1][c], rows[i][c], rows[i + 1][c]
            if "" in (a, b, d):
                continue
            a, b, d = float(a), float(b), float(d)
            if a > 0 and d > 0 and b > a * ratio and b > d * ratio:
                rows[i][c] = ""
                dropped.append((rows[i]["date"], c))
    return dropped


def run():
    # ---- statewide, by vaccination status --------------------------------
    rows = q('SELECT d, st, SUM(n) AS n FROM ('
             'SELECT "Report Date" AS d, "Vaccination Status" AS st, '
             '"Locality" AS loc, "Age Group" AS ag, '
             'MAX(("People by vaccination status count")::numeric) AS n '
             'FROM "%s" WHERE "Age Group Type" = \'%s\' '
             'GROUP BY 1,2,3,4) t GROUP BY 1,2 ORDER BY 1' % (RID, AGE_TYPE))
    if not rows:
        raise FetchError("no rows returned for the statewide query")

    by_date = {}
    for r in rows:
        d = (r["d"] or "")[:10]
        if len(d) != 10:
            continue
        by_date.setdefault(d, {})[r["st"]] = int(float(r["n"] or 0))

    out = []
    for d in sorted(by_date):
        v = by_date[d]
        out.append({
            "date": d,
            "at_least_one_dose": v.get("At Least One Dose", ""),
            "fully_vaccinated": v.get("Fully Vaccinated", ""),
        })

    dropped = blank_outliers(out, ["at_least_one_dose", "fully_vaccinated"])
    write_csv("va-vaccinations", out,
              ["date", "at_least_one_dose", "fully_vaccinated"])

    # ---- by age group, fully vaccinated ----------------------------------
    arows = q('SELECT d, ag, SUM(n) AS n FROM ('
              'SELECT "Report Date" AS d, "Age Group" AS ag, '
              '"Locality" AS loc, '
              'MAX(("People by vaccination status count")::numeric) AS n '
              'FROM "%s" WHERE "Age Group Type" = \'%s\' '
              'AND "Vaccination Status" = \'Fully Vaccinated\' '
              'GROUP BY 1,2,3) t GROUP BY 1,2 ORDER BY 1' % (RID, AGE_TYPE))
    aout = []
    for r in arows:
        d = (r["d"] or "")[:10]
        if len(d) != 10:
            continue
        aout.append({"date": d, "age_group": r["ag"],
                     "fully_vaccinated": int(float(r["n"] or 0))})
    aout.sort(key=lambda r: (r["date"], r["age_group"]))
    write_csv("va-vaccinations-by-age", aout,
              ["date", "age_group", "fully_vaccinated"])

    last = out[-1]["date"]
    note = ("People in Virginia by vaccination status. VDH stopped publishing "
            "this series in September 2023; the history is complete.")
    record("va-vaccinations", rows=len(out), last_date=last,
           status="historical", source="data.virginia.gov (VDH)", note=note)
    record("va-vaccinations-by-age", rows=len(aout), last_date=aout[-1]["date"],
           status="historical", source="data.virginia.gov (VDH)", note=note)
    print("va-vaccinations: %d days %s -> %s (+%d age rows)"
          % (len(out), out[0]["date"], last, len(aout)))
    if dropped:
        print("  blanked as upstream outliers: %s"
              % ", ".join("%s/%s" % x for x in dropped))


if __name__ == "__main__":
    main(run)
