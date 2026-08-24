"""Semiconductor trade: US chip and equipment exports to China, and China's
imports of both from the world.

Source: UN Comtrade. Values are US dollars.

This dashboard has been dead since 2023-04-03 and was the worst-off of the
set: the legacy `comtrade.un.org/api/get` endpoint was retired, and the
`.Rmd` that built the page had been deleted from the repo, so there was
nothing left to port. The source was recovered out of git history (it is kept
beside this file as reference-INFER_Trade_Data.Rmd) and the commodity codes
below come from it unchanged.

Three things about the current API that the old one did not do, each of which
silently returns wrong numbers rather than an error:

1. **partner2Code.** Without `partner2Code=0` the response is broken out by
   second partner and a year appears dozens of times -- summing those rows
   double-counts, and taking the first gives you a $2,042 answer where the
   truth is $230 billion.
2. **Monthly needs explicit periods.** Omitting `period` quietly returns the
   most recent 12 months only; a bare year returns nothing at all. Months are
   requested one year per call.
3. **Twelve periods per call, maximum.** More than that is a 400.
"""
import collections
import datetime as dt

from _common import FetchError, get_json, main, record, secret, write_csv

API = "https://comtradeapi.un.org/data/v1/get/C"

USA, CHINA, WORLD = 842, 156, 0

# From the recovered source, unchanged.
CHIPS = "8542"
EQUIPMENT = "8486,903082,903141,854311,901041"

# How far back each frequency actually goes. These are measured, not assumed,
# and the assumption they replace was wrong in an instructive way: a query with
# no `period` returns 2014 onward, and I read that as the start of the data. It
# is the API's default window. The old dashboard plotted monthly figures from
# January 2010, which is what exposed it.
#
# Monthly genuinely starts around 2010 -- 2008 and earlier return nothing.
# Annual reaches back to at least 1996, with real holes in it (2008 returns no
# rows at all). Gaps are left as gaps; the chart breaks the line rather than
# drawing through them.
FIRST_MONTHLY_YEAR = 2010
FIRST_ANNUAL_YEAR = 2000


def query(key, freq, *, reporter, partner, flow, cmd, period=None):
    url = ("%s/%s/HS?reporterCode=%d&partnerCode=%d&partner2Code=0"
           "&cmdCode=%s&flowCode=%s" % (API, freq, reporter, partner, cmd, flow))
    if period:
        url += "&period=" + period
    d = get_json(url, headers={"Ocp-Apim-Subscription-Key": key})
    if "data" not in d:
        raise FetchError("Comtrade returned no data block: %s" % str(d)[:200])
    return d["data"]


def total_by_period(rows):
    """Sum primaryValue per period.

    A multi-code request returns one row per commodity code, so the equipment
    series genuinely needs adding up; the chips series has a single code and
    the sum is a no-op.
    """
    out = collections.defaultdict(float)
    for r in rows:
        v = r.get("primaryValue")
        if v in (None, ""):
            continue
        out[str(r["period"])] += float(v)
    return out


def months(year):
    return ",".join("%d%02d" % (year, m) for m in range(1, 13))


def run():
    key = secret("COMTRADE_API_KEY")
    this_year = dt.date.today().year

    # ---- monthly: US exports to China -----------------------------------
    chips, equip = {}, {}
    for y in range(FIRST_MONTHLY_YEAR, this_year + 1):
        p = months(y)
        chips.update(total_by_period(query(
            key, "M", reporter=USA, partner=CHINA, flow="X",
            cmd=CHIPS, period=p)))
        equip.update(total_by_period(query(
            key, "M", reporter=USA, partner=CHINA, flow="X",
            cmd=EQUIPMENT, period=p)))

    monthly = []
    for p in sorted(set(chips) | set(equip)):
        if len(p) != 6:
            continue
        monthly.append({
            "date": "%s-%s-01" % (p[:4], p[4:]),
            "chips": round(chips.get(p, 0.0), 2),
            "equipment": round(equip.get(p, 0.0), 2),
        })
    if not monthly:
        raise FetchError("no monthly rows returned")
    write_csv("semiconductors-us-exports-china", monthly,
              ["date", "chips", "equipment"])

    # ---- annual: China's imports from the world --------------------------
    # Twelve periods per call, so the year range is requested in batches.
    ch, eq = {}, {}
    years = list(range(FIRST_ANNUAL_YEAR, this_year + 1))
    for i in range(0, len(years), 12):
        batch = ",".join(str(y) for y in years[i:i + 12])
        ch.update(total_by_period(query(key, "A", reporter=CHINA,
                                        partner=WORLD, flow="M",
                                        cmd=CHIPS, period=batch)))
        eq.update(total_by_period(query(key, "A", reporter=CHINA,
                                        partner=WORLD, flow="M",
                                        cmd=EQUIPMENT, period=batch)))
    annual = []
    for p in sorted(set(ch) | set(eq)):
        if len(p) != 4:
            continue
        annual.append({
            "date": "%s-01-01" % p,
            "chips": round(ch.get(p, 0.0), 2),
            "equipment": round(eq.get(p, 0.0), 2),
        })
    if not annual:
        raise FetchError("no annual rows returned")
    write_csv("semiconductors-china-imports", annual,
              ["date", "chips", "equipment"])

    note = ("US dollars. Chips are HS 8542; equipment is HS 8486, 903082, "
            "903141, 854311 and 901041, summed.")
    record("semiconductors-us-exports-china", rows=len(monthly),
           last_date=monthly[-1]["date"], status="live",
           source="UN Comtrade", note=note)
    record("semiconductors-china-imports", rows=len(annual),
           last_date=annual[-1]["date"], status="live",
           source="UN Comtrade", note=note)

    have = {int(r["date"][:4]) for r in annual}
    holes = [y for y in range(min(have), max(have) + 1) if y not in have]
    print("semiconductors: %d months %s -> %s; %d years %s -> %s%s"
          % (len(monthly), monthly[0]["date"], monthly[-1]["date"],
             len(annual), annual[0]["date"][:4], annual[-1]["date"][:4],
             ("  [no data for %s]" % ", ".join(map(str, holes))) if holes else ""))


if __name__ == "__main__":
    main(run)
