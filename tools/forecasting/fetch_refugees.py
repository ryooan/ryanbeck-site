"""US refugee admissions, monthly and by fiscal year, against the ceiling.

Source: State Department Refugee Processing Center (wrapsnet.org). The page
links a workbook that is republished each month; the link has the report date
in its filename, so it has to be discovered rather than hardcoded.

Fiscal years run October-September, which is why the monthly series maps
OCT/NOV/DEC onto the *previous* calendar year.

Two things worth knowing, both of which the original R got wrong:

* **Picking the first .xlsx on the page is wrong.** The old code took
  `[grepl(".xlsx$", .)][1]`, and the first workbook linked there today is the
  Affiliate Directory, not the admissions report. Matched on the filename
  instead.

* **Unreported months are not zeros.** The workbook always has twelve month
  columns; the ones after the report date are 0, not blank. Publishing those
  draws admissions falling off a cliff every year. The "as of" date in the
  sheet header is parsed, and months past it are left empty.
"""
import datetime as dt
import io as _io
import re

import openpyxl

from _common import FetchError, get, main, record, write_csv

PAGE = "https://www.wrapsnet.org/admissions-and-arrivals/"
BASE = "https://www.wrapsnet.org"

MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR",
          "APR", "MAY", "JUN", "JUL", "AUG", "SEP"]


def find_workbook():
    html = get(PAGE).decode("utf-8", "replace")
    links = re.findall(r'href=[\'"]([^\'"]+\.xlsx?)[\'"]', html, re.I)
    for href in links:
        if re.search(r"refugee\s*admissions?\s*report", href, re.I):
            return BASE + href.replace(" ", "%20")
    raise FetchError("no 'Refugee Admissions Report' workbook linked on %s "
                     "(saw: %s)" % (PAGE, links[:5]))


def as_of(ws):
    """The report date from the sheet header, e.g. 'as of 31-July-2026'."""
    for row in ws.iter_rows(min_row=1, max_row=6, max_col=3, values_only=True):
        for c in row:
            if not c:
                continue
            m = re.search(r"as of\s+(\d{1,2})-([A-Za-z]+)-(\d{4})", str(c))
            if m:
                try:
                    return dt.datetime.strptime(
                        "%s %s %s" % (m.group(1), m.group(2)[:3], m.group(3)),
                        "%d %b %Y").date()
                except ValueError:
                    pass
    return None


def grand_total_row(ws):
    for row in ws.iter_rows(values_only=True):
        label = " ".join(str(c) for c in row[:3] if c).lower()
        if "grand total" in label:
            return row
    return None


def run():
    url = find_workbook()
    blob = get(url, timeout=180)
    wb = openpyxl.load_workbook(_io.BytesIO(blob), data_only=True, read_only=True)

    years = sorted(s for s in wb.sheetnames if re.fullmatch(r"\d{4}", s))
    if not years:
        raise FetchError("no fiscal-year sheets in the workbook")

    report_date = as_of(wb[years[-1]])

    monthly, annual = [], []
    for y in years:
        fy = int(y)
        ws = wb[y]
        row = grand_total_row(ws)
        if not row:
            continue

        # Grand Total row: [_, label, ceiling, fy_total, OCT..SEP]
        ceiling = row[2] if len(row) > 2 else None
        fy_total = row[3] if len(row) > 3 else None
        vals = list(row[4:16]) + [None] * 12

        for i, mon in enumerate(MONTHS):
            cal_year = fy - 1 if i < 3 else fy
            month_no = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9][i]
            d = dt.date(cal_year, month_no, 1)
            # Anything after the report date has not been published yet.
            if report_date and d > report_date.replace(day=1):
                continue
            v = vals[i]
            monthly.append({
                "date": d.isoformat(),
                "admissions": "" if v is None else int(v),
                "fiscal_year": fy,
            })

        annual.append({
            "date": "%d-10-01" % (fy - 1),      # fiscal year start
            "fiscal_year": fy,
            "admissions": "" if fy_total is None else int(fy_total),
            "ceiling": "" if not isinstance(ceiling, (int, float)) else int(ceiling),
        })

    if not monthly:
        raise FetchError("no monthly rows extracted")

    monthly.sort(key=lambda r: r["date"])
    annual.sort(key=lambda r: r["fiscal_year"])

    write_csv("refugee-admissions", monthly,
              ["date", "admissions", "fiscal_year"])
    write_csv("refugee-admissions-annual", annual,
              ["date", "fiscal_year", "admissions", "ceiling"])

    last = monthly[-1]["date"]
    record("refugee-admissions", rows=len(monthly), last_date=last,
           status="live", source="State Dept Refugee Processing Center",
           note=("Monthly arrivals. Fiscal years run October-September; the "
                 "annual file carries the presidential ceiling."))
    print("refugee-admissions: %d months %s -> %s; %d fiscal years (report as of %s)"
          % (len(monthly), monthly[0]["date"], last, len(annual), report_date))


if __name__ == "__main__":
    main(run)
