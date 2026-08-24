"""US debt subject to limit, against the statutory ceiling.

Source: Treasury Fiscal Data, Daily Treasury Statement.
Values are millions of dollars, as published.

This dashboard went dark on 2026-02-03 and stayed dark for six months because
the R called `summarise_each()`, which dplyr removed. Two other things were
wrong with it that nobody had noticed yet, and both are fixed here:

1. **The endpoint moved.** `dts/dts_table_3c` now 404s; the dataset is served
   as `dts/debt_subject_to_limit`. The old URL would have failed even with
   working dplyr.

2. **Pagination was hardcoded to four pages** of 10,000. The series is at
   39,932 rows -- roughly 68 rows short of spilling into a fifth page, at
   which point the old code would have started silently dropping the oldest
   data with no error at all. This version follows `meta.total-pages`.

3. **Asking for fewer fields loses rows.** See the note on FIELDS below.
   This one is not in the original -- it is a trap this rewrite fell into and
   only caught by diffing against the archived R output.

The category names change across eras: "Debt Not Subject to Limit" became
"Less Debt Not Subject to Limit", and "Other Debt Subject to Limit" became
"Plus Other ...". Both spellings are summed, so the transition is seamless --
a date simply has no row for whichever name was not in use then.
"""
import collections

from _common import FetchError, get_json, main, record, write_csv

BASE = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
        "/v1/accounting/dts/debt_subject_to_limit")
# debt_catg_desc is requested even though nothing below reads it, and it must
# stay. The DTS breaks "Less Debt Not Subject to Limit" into several lines per
# date -- on 2008-11-12 both "Other Debt" and "Hope Bonds" are 494 -- and once
# the description is dropped those two rows become byte-identical, at which
# point the API returns 7 rows instead of 8. Narrowing the field list to what
# you use silently loses $494M on that date and on 44 others. Verified against
# the archived R output: with this field the totals match exactly.
FIELDS = "record_date,debt_catg,debt_catg_desc,close_today_bal"

# How each published category folds into "debt subject to the limit".
# Anything not listed here is ignored rather than guessed at.
SIGNS = {
    "Debt Held by the Public": +1,
    "Intragovernmental Holdings": +1,
    "Other Debt Subject to Limit": +1,
    "Plus Other Debt Subject to Limit": +1,
    "Debt Not Subject to Limit": -1,
    "Less Debt Not Subject to Limit": -1,
}
LIMIT_CATG = "Statutory Debt Limit"


def fetch_all():
    """Every row, following the API's own page count."""
    rows, page, pages = [], 1, None
    while pages is None or page <= pages:
        url = ("%s?page[size]=10000&page[number]=%d&sort=record_date&fields=%s"
               % (BASE, page, FIELDS))
        d = get_json(url)
        if "data" not in d:
            raise FetchError("unexpected response on page %d: %s"
                             % (page, str(d)[:200]))
        rows += d["data"]
        if pages is None:
            pages = int(d.get("meta", {}).get("total-pages", 1))
        page += 1
    return rows


def build(raw):
    """Collapse to one row per date: debt subject to limit, and the ceiling.

    Several categories repeat within a single date (the DTS breaks "not
    subject to limit" into multiple lines), so each date is a sum over its
    rows, not a lookup.
    """
    subject = collections.defaultdict(float)
    limit = {}
    seen = collections.defaultdict(set)

    for r in raw:
        d, catg = r["record_date"], r["debt_catg"]
        try:
            v = float(r["close_today_bal"])
        except (TypeError, ValueError):
            continue                      # null/blank balance: contributes 0
        if catg in SIGNS:
            subject[d] += SIGNS[catg] * v
            seen[d].add(catg)
        elif catg == LIMIT_CATG:
            limit[d] = v

    out = []
    for d in sorted(subject):
        # A date needs at least the two main components to be meaningful --
        # which is also what makes "no ceiling row" safe to read as suspended
        # rather than as a date the DTS simply had not filled in yet.
        if not {"Debt Held by the Public", "Intragovernmental Holdings"} <= seen[d]:
            continue
        lim = limit.get(d)
        # A suspended ceiling shows up two different ways, and both mean the
        # same thing. Through the 2023-25 suspension Treasury published a
        # literal 0; through the earlier ones (2013, 2015-17, 2017-19,
        # 2019-21) it simply omits the "Statutory Debt Limit" row for the
        # date. Treating only the 0 as a suspension finds 395 days instead of
        # 1,732 and leaves four of the five suspensions unshaded.
        #
        # The original R got this right by accident: pivoting then summing
        # with na.rm turned an absent category into 0, so both spellings
        # collapsed before it looked at them. Here the distinction survives
        # to this point, so it has to be handled on purpose.
        suspended = lim is None or lim == 0
        out.append({
            "date": d,
            "debt_subject_to_limit": round(subject[d], 2),
            "statutory_limit": "" if (lim is None or suspended) else round(lim, 2),
            "suspended": 1 if suspended else 0,
        })
    return out


def run():
    raw = fetch_all()
    rows = build(raw)
    if not rows:
        raise FetchError("no usable rows after transform")

    write_csv("debt-limit", rows,
              ["date", "debt_subject_to_limit", "statutory_limit", "suspended"])

    last = rows[-1]["date"]
    record("debt-limit", rows=len(rows), last_date=last, status="live",
           source="Treasury Fiscal Data - Daily Treasury Statement",
           note="Millions of dollars. Ceiling is blank while suspended.")
    susp = sum(r["suspended"] for r in rows)
    print("debt-limit: %d dates, %s -> %s (%d suspended)"
          % (len(rows), rows[0]["date"], last, susp))


if __name__ == "__main__":
    main(run)
