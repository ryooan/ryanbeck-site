"""Virginia COVID cases by age group.

Source: data.virginia.gov CKAN datastore, resource
80763ab6-df66-4f1a-b96b-71fe4538b08e -- VDH's "RETIRED Dataset" of cases by
age group.

**Read this before extending the series.** What survives is a five-month
window, 2024-04-17 to 2024-09-24, and that is not an artefact of looking in
one place. Ruled out, in order:

* The Wayback Machine has ~50 captures of the old Socrata endpoint between
  July 2020 and January 2021, but each one caught only Socrata's default first
  1,000 rows -- about one day of data apiece.
* CDC's by-age series is HHS-region level, not state level.
* The CKAN datastore behind this retired dataset holds exactly 73,920 records
  and no more, confirmed by counting it directly. VDH truncated what it
  publishes rather than moving it.
* No local copy exists. Every .RData workspace on Ryan's machine was searched
  and none references this dataset; the apparent "age" matches in those files
  are `weekly_percentAGE_change` and `Rolling.AverAGE`.

So the chart has a hole in it, and it says so. That is the honest version:
the alternative is interpolating across three and a half years of missing
data, which would look better and be a lie.

If you want an age-stratified Virginia COVID series with no gap, use
`covid-hospitalizations-va.csv` instead -- the HHS panel carries age-banded
admissions from 2020-03 to 2023-07. Admissions rather than cases, but whole.
"""
import collections
import urllib.parse

from _common import FetchError, get_json, main, record, write_csv

SQL_URL = "https://data.virginia.gov/api/3/action/datastore_search_sql?sql="
RID = "80763ab6-df66-4f1a-b96b-71fe4538b08e"

AGE_TYPE = "Case Age Group"


def q(sql):
    d = get_json(SQL_URL + urllib.parse.quote(sql), timeout=300)
    if not d.get("success"):
        raise FetchError("CKAN rejected the query: %s" % str(d.get("error"))[:200])
    return d["result"]["records"]


def run():
    # Note the column is Report_date here -- underscore -- where the
    # vaccination dataset on the same platform uses "Report Date". They are
    # not consistent, and guessing gets you an UndefinedColumn error.
    rows = q('SELECT "Report_date" AS d, "Age Group" AS ag, '
             'SUM(("Case Count")::numeric) AS cases, '
             'SUM(("Hospitalized Count")::numeric) AS hosp, '
             'SUM(("Death Count")::numeric) AS deaths '
             'FROM "%s" WHERE "Age Group Type" = \'%s\' '
             'GROUP BY 1,2 ORDER BY 1,2' % (RID, AGE_TYPE))
    if not rows:
        raise FetchError("no rows returned")

    out = []
    for r in rows:
        d = (r["d"] or "")[:10]
        if len(d) != 10:
            continue
        out.append({
            "date": d,
            "age_group": r["ag"],
            "cases": int(float(r["cases"] or 0)),
            "hospitalized": int(float(r["hosp"] or 0)),
            "deaths": int(float(r["deaths"] or 0)),
        })
    out.sort(key=lambda r: (r["date"], r["age_group"]))
    write_csv("vdh-cases-by-age", out,
              ["date", "age_group", "cases", "hospitalized", "deaths"])

    # A wide view of total cases per date, for the chart.
    wide = collections.defaultdict(dict)
    for r in out:
        wide[r["date"]][r["age_group"]] = r["cases"]
    groups = sorted({r["age_group"] for r in out})
    totals = [{"date": d,
               "total_cases": sum(wide[d].values()),
               **{g.replace(" ", "_").replace("+", "plus"): wide[d].get(g, "")
                  for g in groups}}
              for d in sorted(wide)]
    write_csv("vdh-cases-by-age-wide", totals,
              ["date", "total_cases"] +
              [g.replace(" ", "_").replace("+", "plus") for g in groups])

    record("vdh-cases-by-age", rows=len(out), last_date=out[-1]["date"],
           status="historical", source="data.virginia.gov (VDH, retired)",
           note=("Cumulative counts by age band. VDH retired this dataset and "
                 "kept only five months of it; everything before 2024-04-17 is "
                 "gone. See fetch_vdh_age.py for what was ruled out."))
    print("vdh-cases-by-age: %d rows, %s -> %s, %d age groups"
          % (len(out), out[0]["date"], out[-1]["date"], len(groups)))


if __name__ == "__main__":
    main(run)
