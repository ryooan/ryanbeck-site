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


def run():
    # ---- statewide, by vaccination status --------------------------------
    rows = q('SELECT "Report Date" AS d, "Vaccination Status" AS st, '
             'SUM(("People by vaccination status count")::numeric) AS n '
             'FROM "%s" WHERE "Age Group Type" = \'%s\' '
             'GROUP BY 1,2 ORDER BY 1' % (RID, AGE_TYPE))
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
    write_csv("va-vaccinations", out,
              ["date", "at_least_one_dose", "fully_vaccinated"])

    # ---- by age group, fully vaccinated ----------------------------------
    arows = q('SELECT "Report Date" AS d, "Age Group" AS ag, '
              'SUM(("People by vaccination status count")::numeric) AS n '
              'FROM "%s" WHERE "Age Group Type" = \'%s\' '
              'AND "Vaccination Status" = \'Fully Vaccinated\' '
              'GROUP BY 1,2 ORDER BY 1' % (RID, AGE_TYPE))
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


if __name__ == "__main__":
    main(run)
