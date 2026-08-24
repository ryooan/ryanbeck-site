"""Shared pieces for the forecasting fetchers.

Every fetcher does the same four things: pull from an upstream API, tidy the
result, write a CSV under public/data/forecasting/, and record what happened
in the manifest the page reads. This module is those four things, so a
fetcher is only the part that is actually specific to its source.

The design rule behind all of it: **a fetcher never destroys data it cannot
re-fetch.** Several of these dashboards died because a source went away while
the only copy lived in a rendered HTML page. So writes are atomic, a run that
returns fewer rows than the file already has refuses to overwrite it, and the
manifest always records the last date actually present in the data rather than
the time the job ran. A job succeeding tells you nothing; COVIDWeekly ran
green every ten hours for two years while publishing data that stopped in
April 2024.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "public", "data", "forecasting")
MANIFEST = os.path.join(DATA, "manifest.json")

# Some sources (the CDC bird-flu CSV in particular) filter on user agent and
# return 403 to anything that looks automated. That endpoint is NOT dead --
# it works from GitHub Actions. Identify honestly and it behaves.
UA = "ryanbeck.com forecasting-data (+https://ryanbeck.com/forecasting-data)"


def secret(name, *, required=True):
    """Read a credential from the environment, falling back to the workspace
    _shared/.env. Nothing here ever writes a key into the repo -- the .env is
    gitignored, and CI supplies the same name as an Actions secret.
    """
    if os.environ.get(name):
        return os.environ[name]
    # Walk up from the repo looking for the workspace's _shared/.env, rather
    # than hardcoding a depth -- the repo can be cloned anywhere, and in CI
    # there is no _shared at all (the value arrives as an Actions secret).
    env, d = None, ROOT
    for _ in range(6):
        cand = os.path.join(d, "_shared", ".env")
        if os.path.exists(cand):
            env = cand
            break
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    if env:
        with open(env, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == name:
                    return v.strip().strip('"').strip("'")
    if required:
        raise FetchError(
            "%s is not set. Put it in _shared/.env or the environment." % name)
    return None


class FetchError(RuntimeError):
    """Upstream could not be reached or returned something unusable."""


def get(url, *, headers=None, retries=3, timeout=60, backoff=3.0):
    """GET with retries. Returns bytes.

    Retries only on transport errors and 5xx/429 -- a 404 means the endpoint
    moved and no amount of retrying will find it, which is exactly how half
    these dashboards failed.
    """
    hdrs = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise FetchError("%s -> HTTP %s" % (url, e.code)) from e
        except Exception as e:                      # noqa: BLE001 - transport
            last = e
        if attempt < retries - 1:
            time.sleep(backoff * (attempt + 1))
    raise FetchError("%s -> %s" % (url, last))


def get_json(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


def _replace(tmp, path, retries=10):
    """os.replace, but survive a Windows file lock.

    On Windows a replace fails outright if anything has the target open --
    the dev server watching public/, an indexer, a virus scanner. The write
    itself is fine; the rename is what loses. Retrying briefly clears it in
    practice. Only if every attempt fails does this fall back to a non-atomic
    in-place write, which is still better than dropping a completed fetch.
    """
    for i in range(retries):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.15 * (i + 1))
    with open(tmp, "rb") as src, open(path, "wb") as dst:
        dst.write(src.read())
    os.remove(tmp)


def write_csv(name, rows, fields, *, allow_shrink=False):
    """Write rows to public/data/forecasting/<name>.csv, atomically.

    Refuses to shrink an existing file unless told to. A source that starts
    returning a truncated response is far more common than a series that
    genuinely gets shorter, and the truncated version overwriting a good file
    is unrecoverable once the source is gone.
    """
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name + ".csv")

    if os.path.exists(path) and not allow_shrink:
        with open(path, newline="", encoding="utf-8") as f:
            existing = sum(1 for _ in f) - 1
        if len(rows) < existing:
            raise FetchError(
                "%s: upstream returned %d rows but the committed file has %d. "
                "Refusing to overwrite -- pass allow_shrink=True if the series "
                "really did get shorter." % (name, len(rows), existing))

    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    _replace(tmp, path)
    return path


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    return {"series": {}}


def record(slug, *, rows, last_date, status, source, note=""):
    """Update one series' entry in the manifest the page reads.

    `last_date` is the last date in the DATA, not the time of the run. That
    distinction is the whole point: it is what lets a chart say "Historical --
    ended April 2024" by itself, instead of showing a green tick forever.
    """
    m = load_manifest()
    m.setdefault("series", {})[slug] = {
        "rows": rows,
        "last_date": last_date,
        "status": status,               # live | historical | stale
        "source": source,
        "note": note,
        "fetched": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    m["generated"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, MANIFEST)


def main(fn):
    """Run a fetcher, and make failure loud and specific."""
    try:
        fn()
    except FetchError as e:
        print("FETCH FAILED: %s" % e, file=sys.stderr)
        raise SystemExit(1)
