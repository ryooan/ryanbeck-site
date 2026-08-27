/* Plot — the chart module for the forecasting page.

   Written rather than imported, and the reason is specific to this project:
   every dashboard being rebuilt here died of dependency rot. RSocrata left
   CRAN and took two pages down. dplyr dropped summarise_each() and the debt
   limit went dark for six months. Adding a third-party chart library to the
   rebuild would reproduce the exact failure mode being fixed. This file has
   no dependencies and cannot be archived out from under the site.

   It draws one shape: a time series on a shared date axis, optionally with
   several lines, shaded date bands, and a gap where data is missing. That
   covers every chart on the page, so the module stays small enough to read
   in one sitting.

   Usage — one call per chart, data loaded from a CSV on this origin:

     Plot.render(document.querySelector('#debt'), {
       csv: '/data/forecasting/debt-limit.csv',
       x: 'date',
       series: [
         { col: 'debt_subject_to_limit', label: 'Debt subject to limit' },
         { col: 'statutory_limit', label: 'Statutory ceiling', dash: true }
       ],
       band: { col: 'suspended', label: 'Limit suspended' },
       format: 'usd-millions'
     });

   Missing values break the line rather than interpolating across them. That
   is deliberate: several of these series have real holes in them, and a
   chart that quietly draws through a gap is lying about what is known. */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* The site's palette, read from CSS so a theme change moves the charts too.
     Falls back to literals if the stylesheet has not applied yet. */
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      return (cs.getPropertyValue(name) || '').trim() || fallback;
    }
    return {
      ink: v('--ink', '#241c14'),
      soft: v('--ink-soft', '#4a3d30'),
      faint: v('--ink-faint', '#7a6a58'),
      ember: v('--ember', '#c8722a'),
      hot: v('--ember-hot', '#f2a44c'),
      gold: v('--gold', '#c9a227'),
      edge: v('--parchment-edge', '#d9c7ab'),
      paper: v('--parchment', '#f4ead9')
    };
  }

  /* Series colors, in the order lines are declared. Ember first because the
     first series is the subject of the chart; the rest recede. */
  function seriesColor(pal, i) {
    return [pal.ember, pal.ink, pal.gold, pal.faint][i % 4];
  }

  /* ---- data ------------------------------------------------------------ */

  /* A small CSV reader. Handles quoted fields and embedded commas, which the
     naive split(',') does not, and which the archive extracts do contain. */
  function parseCSV(text) {
    var rows = [], row = [], field = '', quoted = false, i = 0;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      var c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return { fields: [], rows: [] };

    var head = rows.shift();
    return {
      fields: head,
      rows: rows.filter(function (r) { return r.length === head.length; })
        .map(function (r) {
          var o = {};
          for (var j = 0; j < head.length; j++) o[head[j]] = r[j];
          return o;
        })
    };
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }

  /* ---- formatting ------------------------------------------------------ */

  /* Zero is zero in every unit; "$0.0B" on a baseline just reads as noise. */
  function zeroOr(v, fn) { return v === 0 ? '0' : fn(v); }

  var FORMATS = {
    /* Source values are millions of dollars; nobody reads "39844182". */
    'usd-millions': function (v) {
      if (v === 0) return '$0';
      var a = Math.abs(v);
      if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'T';
      if (a >= 1e3) return '$' + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'B';
      return '$' + Math.round(v) + 'M';
    },
    /* Values already stored in billions -- the SEC series keeps its CSV in
       billions because that is what a person reading the file wants. */
    'usd-billions': function (v) {
      if (v === 0) return '$0';
      var a = Math.abs(v);
      if (a >= 1000) return '$' + (v / 1000).toFixed(2) + 'T';
      if (a >= 10) return '$' + Math.round(v) + 'B';
      return '$' + v.toFixed(1) + 'B';
    },
    /* Raw dollars, as Comtrade reports them. */
    usd: function (v) {
      if (v === 0) return '$0';
      var a = Math.abs(v);
      if (a >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T';
      if (a >= 1e9) return '$' + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
      if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
      return '$' + Math.round(v);
    },
    number: function (v) {
      var a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
      if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (a >= 1e4) return Math.round(v / 1e3) + 'k';
      return String(Math.round(v * 100) / 100);
    },
    percent: function (v) { return (Math.round(v * 10) / 10) + '%'; },
    /* Admissions per 100,000 people. */
    rate: function (v) { return (Math.round(v * 10) / 10) + ' / 100k'; }
  };

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(t, withDay) {
    var d = new Date(t);
    return (withDay ? d.getUTCDate() + ' ' : '') +
      MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* ---- scales ---------------------------------------------------------- */

  /* Round a range outward to values a person would choose. */
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { hi = lo + 1; }
    var raw = (hi - lo) / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    var out = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
      out.push(Math.round(t / step) * step);
    }
    return out;
  }

  /* Date ticks on boundaries a reader recognizes — years, or months when the
     window is short enough that every tick would otherwise read the same. */
  function dateTicks(t0, t1, count) {
    var span = (t1 - t0) / 86400000, out = [], d, y;
    if (span > 1100) {
      var years = span / 365.25;
      var step = Math.max(1, Math.ceil(years / count));
      y = new Date(t0).getUTCFullYear();
      if (Date.UTC(y, 0, 1) < t0) y++;
      for (; Date.UTC(y, 0, 1) <= t1; y += step) out.push(Date.UTC(y, 0, 1));
    } else {
      var months = Math.max(1, Math.ceil((span / 30.4) / count));
      d = new Date(t0);
      var mm = d.getUTCMonth(), yy = d.getUTCFullYear();
      if (Date.UTC(yy, mm, 1) < t0) mm++;
      for (; Date.UTC(yy, mm, 1) <= t1; mm += months) out.push(Date.UTC(yy, mm, 1));
    }
    return out;
  }

  /* ---- drawing helpers ------------------------------------------------- */

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
        n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }

  /* Collapse runs of points that land on the same pixel column, keeping the
     column's min and max. Straight decimation would drop spikes, and a spike
     in this data is usually the point of the chart. */
  function decimate(pts, x0, x1, width) {
    if (pts.length < width * 2) return pts;
    var out = [], col = -1, lo = null, hi = null, first = null;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.v == null) {                 // a gap: flush and pass it through
        if (first) { out.push(first, lo, hi); lo = hi = first = null; col = -1; }
        out.push(p);
        continue;
      }
      var c = Math.round((p.t - x0) / (x1 - x0) * width);
      if (c !== col) {
        if (first) out.push(first, lo, hi);
        col = c; first = p; lo = p; hi = p;
      } else {
        if (p.v < lo.v) lo = p;
        if (p.v > hi.v) hi = p;
      }
    }
    if (first) out.push(first, lo, hi);
    // Restore chronological order; min/max within a column may be reversed.
    out.sort(function (a, b) { return a.t - b.t; });
    return out.filter(function (p, i, a) { return i === 0 || p !== a[i - 1]; });
  }

  /* ---- time ranges ----------------------------------------------------- */

  var DAY = 86400000;
  var RANGES = [
    { k: '6m', d: 183, label: '6M' },
    { k: '1y', d: 365, label: '1Y' },
    { k: '2y', d: 730, label: '2Y' },
    { k: '5y', d: 1826, label: '5Y' },
    { k: '10y', d: 3653, label: '10Y' },
    { k: '20y', d: 7305, label: '20Y' },
    { k: 'all', d: Infinity, label: 'All' }
  ];

  /* Which ranges are worth offering for this particular series.

     Driven by the data rather than declared per chart, because the wrong
     buttons are worse than none: "6M" on a chart with one point a year offers
     to show you half a point. A range earns its button only if the window
     holds at least MIN_PTS observations at this series' own cadence, and only
     if it is meaningfully shorter than the history -- "5Y" on five years of
     data is just "All" spelled differently. */
  function autoRanges(pts) {
    var MIN_PTS = 5;
    /* Unique timestamps. `pts` arrives as every series concatenated, so a
       chart with two lines has each date twice -- and the duplicate pairs are
       zero-day gaps, which drag the median cadence to nothing and make every
       range look justified. That is how an annual chart came to offer "2Y",
       a window containing two points. */
    var seen = {}, times = [];
    pts.forEach(function (p) {
      if (seen[p.t]) return;
      seen[p.t] = 1;
      times.push(p.t);
    });
    times.sort(function (a, b) { return a - b; });
    if (times.length < 2) return [];
    var span = (times[times.length - 1] - times[0]) / DAY;

    /* Median gap, not mean: a single long hole in a series (and several here
       have one) would drag a mean far enough to suppress every button. */
    var gaps = [];
    for (var i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
    gaps.sort(function (a, b) { return a - b; });
    var cadence = gaps[Math.floor(gaps.length / 2)] || 1;

    var out = RANGES.filter(function (r) {
      if (r.k === 'all') return false;
      return r.d >= cadence * MIN_PTS && r.d <= span * 0.75;
    });
    /* Keep it to four buttons plus All; drop from the short end, since the
       long views are the ones that differ most from each other. */
    while (out.length > 4) out.shift();
    return out.length ? out.concat([RANGES[RANGES.length - 1]]) : [];
  }

  /* ---- trend ----------------------------------------------------------- */

  /* A least-squares trend fitted to the CURRENT policy regime only, and
     projected to the thing that would end it.

     Fitting the whole history would be meaningless here: the debt limit is a
     step function, and each step resets the problem. What matters is the run
     since the last change -- how fast debt is climbing under the ceiling in
     force now, and when that pace would reach it.

     A discontinuity is a change in the ceiling OR the start or end of a
     suspension. Everything from the most recent one is the fit window.

     Where the projection stops:
       - with a ceiling in force, at the date the fitted line reaches it
       - during a suspension there is nothing to reach, so one year out

     And it is suppressed entirely when debt is already at the ceiling. In
     early 2025 the gap sat at exactly 0.000% for months while Treasury ran
     extraordinary measures; a trend line there would project a crossing that
     has already happened and imply room that does not exist. */
  function computeTrend(rows, opt, xKey) {
    var cfg = opt.trend;
    if (!cfg) return null;

    var pts = [];
    rows.forEach(function (r) {
      var t = parseDate(r[xKey]);
      var v = r[cfg.col] === '' || r[cfg.col] == null ? null : +r[cfg.col];
      if (isNaN(t) || v == null || isNaN(v)) return;
      var lim = (cfg.limitCol && r[cfg.limitCol] !== '' && r[cfg.limitCol] != null)
        ? +r[cfg.limitCol] : null;
      var susp = cfg.suspendedCol
        ? (r[cfg.suspendedCol] === '1' || r[cfg.suspendedCol] === 'true') : false;
      pts.push({ t: t, v: v, lim: lim, susp: susp });
    });
    if (pts.length < 10) return null;
    pts.sort(function (a, b) { return a.t - b.t; });

    var start = 0;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].susp !== pts[i - 1].susp || pts[i].lim !== pts[i - 1].lim) start = i;
    }
    var seg = pts.slice(start);
    if (seg.length < (cfg.minPoints || 8)) return null;

    var last = seg[seg.length - 1];
    var atPct = cfg.atLimitPct == null ? 0.5 : cfg.atLimitPct;
    if (last.lim != null && (last.lim - last.v) / last.lim * 100 < atPct) {
      return { suppressed: 'at-limit' };
    }

    var t0 = seg[0].t, n = seg.length;
    var mx = 0, my = 0, k;
    for (k = 0; k < n; k++) { mx += (seg[k].t - t0) / DAY; my += seg[k].v; }
    mx /= n; my /= n;
    var num = 0, den = 0;
    for (k = 0; k < n; k++) {
      var dx = (seg[k].t - t0) / DAY - mx;
      num += dx * (seg[k].v - my);
      den += dx * dx;
    }
    if (!den) return null;
    var slope = num / den;               // units per day
    var icpt = my - slope * mx;
    function at(days) { return slope * days + icpt; }

    var lastDay = (last.t - t0) / DAY;
    var capDay = lastDay + (cfg.maxMonths || 36) * 30.44;
    var endDay, hits = null;

    if (last.lim == null) {
      endDay = lastDay + (cfg.suspendedMonths || 12) * 30.44;
    } else if (slope <= 0) {
      return null;                       // going nowhere near the ceiling
    } else {
      var cross = (last.lim - icpt) / slope;
      if (cross <= lastDay) return null; // already there; the at-limit test
                                         // above normally catches this
      endDay = Math.min(cross, capDay);
      if (cross <= capDay) hits = t0 + cross * DAY;
    }

    return {
      t0: t0, slope: slope, icpt: icpt,
      startT: seg[0].t, lastT: last.t, endT: t0 + endDay * DAY,
      startV: at(0), lastV: at(lastDay), endV: at(endDay),
      hitsT: hits, limit: last.lim, suspended: last.lim == null,
      perMonth: slope * 30.44
    };
  }

  /* ---- the chart ------------------------------------------------------- */

  function build(host, opt, data) {
    var pal = palette();
    var fmt = FORMATS[opt.format] || FORMATS.number;
    var xKey = opt.x || 'date';

    /* Turn the table into one array of {t, v} per series, once. */
    var series = opt.series.map(function (s, i) {
      var pts = data.rows.map(function (r) {
        var raw = r[s.col];
        var v = (raw === '' || raw == null) ? null : +raw;
        return { t: parseDate(r[xKey]), v: (v == null || isNaN(v)) ? null : v };
      }).filter(function (p) { return !isNaN(p.t); });
      return {
        label: s.label || s.col,
        color: s.color || seriesColor(pal, i),
        dash: !!s.dash,
        right: s.axis === 'right',
        pts: pts
      };
    });

    /* An optional per-point label, for series whose x value is not really a
       date. The fiscal-year chart dates FY1975 to 1 October 1974, which is
       correct for placing it on a time axis and useless to read: hovering it
       said "Oct 1974" when the answer is "FY 1975". */
    var labels = null;
    if (opt.labelCol) {
      labels = {};
      data.rows.forEach(function (r) {
        var t = parseDate(r[xKey]);
        if (!isNaN(t) && r[opt.labelCol] !== '' && r[opt.labelCol] != null) {
          labels[t] = (opt.labelPrefix || '') + r[opt.labelCol];
        }
      });
    }

    /* Date bands (the debt-limit suspensions) as contiguous runs of a flag. */
    var bands = [];
    if (opt.band && opt.band.col) {
      var open = null;
      data.rows.forEach(function (r) {
        var on = r[opt.band.col] === '1' || r[opt.band.col] === 'true';
        var t = parseDate(r[xKey]);
        if (on && open === null) open = t;
        if (!on && open !== null) { bands.push([open, t]); open = null; }
      });
      if (open !== null) bands.push([open, parseDate(data.rows[data.rows.length - 1][xKey])]);
    }

    var all = series.reduce(function (a, s) { return a.concat(s.pts); }, []);
    var withV = all.filter(function (p) { return p.v != null; });
    if (!withV.length) throw new Error('no numeric data');

    var trend = computeTrend(data.rows, opt, xKey);
    var trendOn = !!(trend && !trend.suppressed);

    var fullT0 = Math.min.apply(null, all.map(function (p) { return p.t; }));
    var fullT1 = Math.max.apply(null, all.map(function (p) { return p.t; }));

    /* The visible window, and the y-scale that fits it. Recomputed whenever
       the range changes -- keeping the full-history y-scale while zoomed in
       flattens the recent data into a band at the bottom, which defeats the
       point of zooming. */
    var t0, t1, v0, v1, shown;
    /* A second y-scale, for series marked axis:"right". Two quantities of
       wildly different magnitude on one axis makes the smaller one a flat
       line along the bottom -- a cumulative total and its weekly increments
       differ by two orders of magnitude, so the increments vanish. */
    var v0R, v1R;
    var hasRight = opt.series.some(function (x) { return x.axis === 'right'; });
    var ranges = opt.ranges === false ? []
      : (Array.isArray(opt.ranges)
          ? RANGES.filter(function (r) { return opt.ranges.indexOf(r.k) >= 0; })
          : autoRanges(all));
    var active = opt.defaultRange || 'all';
    if (!ranges.some(function (r) { return r.k === active; })) active = 'all';

    function setWindow(key) {
      active = key;
      var r = RANGES.filter(function (x) { return x.k === key; })[0] || RANGES[RANGES.length - 1];
      /* With the trend showing, the axis has to reach the projection or the
         forecast falls off the end. Turning it off refits to the data. */
      t1 = (trendOn && trend && trend.endT > fullT1) ? trend.endT : fullT1;
      t0 = (r.d === Infinity) ? fullT0 : Math.max(fullT0, t1 - r.d * DAY);

      shown = series.map(function (s) {
        return s.pts.filter(function (p) { return p.t >= t0 && p.t <= t1; });
      });
      function trendExtra() {
        if (!(trendOn && trend && !trend.suppressed)) return [];
        var out = [];
        [trend.startT, trend.lastT, trend.endT].forEach(function (t) {
          if (t >= t0 && t <= t1) {
            out.push(trend.slope * ((t - trend.t0) / DAY) + trend.icpt);
          }
        });
        return out;
      }

      function scaleOf(want) {
        var vis = [];
        shown.forEach(function (arr, i) {
          if (!!series[i].right !== want) return;
          arr.forEach(function (p) { if (p.v != null) vis.push(p.v); });
        });
        if (!want) vis = vis.concat(trendExtra());
        if (!vis.length) vis = withV.map(function (p) { return p.v; });
        var a = Math.min.apply(null, vis), b = Math.max.apply(null, vis);
        if (opt.zero) a = Math.min(0, a);
        var pad = (b - a) * 0.08 || Math.abs(b || 1) * 0.1;
        return [a - pad, b + pad];
      }
      var L = scaleOf(false);
      v0 = L[0]; v1 = L[1];
      if (hasRight) { var R = scaleOf(true); v0R = R[0]; v1R = R[1]; }
    }
    setWindow(active);

    /* --- DOM shell --- */
    host.classList.add('plot');
    host.innerHTML = '';

    var rangeBar = null, rangeBtns = [];
    if (ranges.length) {
      rangeBar = document.createElement('div');
      rangeBar.className = 'plot-ranges';
      rangeBar.setAttribute('role', 'group');
      rangeBar.setAttribute('aria-label', 'Time range');
      ranges.forEach(function (r) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'plot-range';
        b.textContent = r.label;
        b.dataset.range = r.k;
        b.setAttribute('aria-pressed', String(r.k === active));
        b.addEventListener('click', function () {
          if (r.k === active) return;
          hide();
          host.__at = null;
          setWindow(r.k);
          rangeBtns.forEach(function (o) {
            o.setAttribute('aria-pressed', String(o.dataset.range === active));
          });
          draw();
        });
        rangeBtns.push(b);
        rangeBar.appendChild(b);
      });
      host.appendChild(rangeBar);
    }

    var trendBtn = null;
    if (trend && !trend.suppressed) {
      if (!rangeBar) {
        rangeBar = document.createElement('div');
        rangeBar.className = 'plot-ranges';
        host.appendChild(rangeBar);
      }
      trendBtn = document.createElement('button');
      trendBtn.type = 'button';
      trendBtn.className = 'plot-range is-trend';
      trendBtn.textContent = opt.trend.label || 'Trend';
      trendBtn.setAttribute('aria-pressed', 'true');
      trendBtn.addEventListener('click', function () {
        trendOn = !trendOn;
        trendBtn.setAttribute('aria-pressed', String(trendOn));
        hide();
        host.__at = null;
        setWindow(active);
        draw();
      });
      rangeBar.appendChild(trendBtn);
    }

    var figure = document.createElement('div');
    figure.className = 'plot-canvas';
    var tip = document.createElement('div');
    tip.className = 'plot-tip';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    host.appendChild(figure);
    host.appendChild(tip);

    var legend = document.createElement('ul');
    legend.className = 'plot-legend';
    series.forEach(function (s) {
      var li = document.createElement('li');
      var sw = document.createElement('span');
      sw.className = 'plot-swatch' + (s.dash ? ' is-dash' : '');
      sw.style.setProperty('--c', s.color);
      li.appendChild(sw);
      li.appendChild(document.createTextNode(
        s.label + (s.right ? ' (right axis)' : '')));
      legend.appendChild(li);
    });
    if (trend && !trend.suppressed) {
      var li3 = document.createElement('li');
      var sw3 = document.createElement('span');
      sw3.className = 'plot-swatch is-dash';
      sw3.style.setProperty('--c', TREND);
      li3.appendChild(sw3);
      var txt = (opt.trend.label || 'Trend') + ' — ';
      if (trend.suspended) {
        txt += 'no ceiling in force, projected a year out';
      } else if (trend.hitsT) {
        txt += 'reaches the ceiling ' + fmtDate(trend.hitsT, false);
      } else {
        txt += 'does not reach the ceiling within three years';
      }
      li3.appendChild(document.createTextNode(txt));
      legend.appendChild(li3);
    }
    if (bands.length && opt.band.label) {
      var li2 = document.createElement('li');
      var sw2 = document.createElement('span');
      sw2.className = 'plot-swatch is-band';
      li2.appendChild(sw2);
      li2.appendChild(document.createTextNode(opt.band.label));
      legend.appendChild(li2);
    }
    host.appendChild(legend);

    var svg, geom = {}, drawn = [];

    function draw() {
      var W = figure.clientWidth || 720;
            /* Height tracks width but is capped, or a full-bleed chart on a wide
         monitor becomes a letterbox. The cap rose with the dashboard's
         column: at 1200px, 0.46 would be 550. */
      var H = opt.height || Math.max(220, Math.min(460, Math.round(W * 0.42)));
      var m = { t: 12, r: hasRight ? 56 : 14, b: 26, l: 56 };
      var iw = Math.max(10, W - m.l - m.r);
      var ih = Math.max(10, H - m.t - m.b);
      geom = { W: W, H: H, m: m, iw: iw, ih: ih };

      function sx(t) { return m.l + (t - t0) / (t1 - t0 || 1) * iw; }
      function sy(v) { return m.t + ih - (v - v0) / (v1 - v0 || 1) * ih; }
      function syR(v) { return m.t + ih - (v - v0R) / (v1R - v0R || 1) * ih; }
      geom.sx = sx; geom.sy = sy; geom.syR = syR;

      if (svg) svg.remove();
      svg = el('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
        role: 'img', 'aria-label': opt.alt || (opt.title || 'Time series chart')
      });

      bands.forEach(function (b) {
        svg.appendChild(el('rect', {
          x: sx(b[0]), y: m.t, width: Math.max(1, sx(b[1]) - sx(b[0])), height: ih,
          fill: pal.ink, opacity: 0.07
        }));
      });

      niceTicks(v0, v1, 5).forEach(function (v) {
        if (v < v0 || v > v1) return;
        var y = sy(v);
        svg.appendChild(el('line', {
          x1: m.l, x2: m.l + iw, y1: y, y2: y,
          stroke: pal.ink, 'stroke-opacity': 0.11
        }));
        var lab = el('text', {
          x: m.l - 8, y: y + 4, 'text-anchor': 'end',
          class: 'plot-axis', fill: pal.faint
        });
        lab.textContent = fmt(v);
        svg.appendChild(lab);
      });

      if (hasRight) {
        var rFmt = FORMATS[opt.formatRight] || fmt;
        var rCol = (opt.series.filter(function (x) { return x.axis === 'right'; })[0] || {});
        var rTint = rCol.color || seriesColor(pal, opt.series.indexOf(
          opt.series.filter(function (x) { return x.axis === 'right'; })[0]));
        niceTicks(v0R, v1R, 5).forEach(function (v) {
          if (v < v0R || v > v1R) return;
          var lab = el('text', {
            x: m.l + iw + 8, y: syR(v) + 4, 'text-anchor': 'start',
            class: 'plot-axis', fill: rTint, 'fill-opacity': .85
          });
          lab.textContent = rFmt(v);
          svg.appendChild(lab);
        });
      }

      dateTicks(t0, t1, Math.max(2, Math.round(iw / 110))).forEach(function (t) {
        var x = sx(t);
        if (x < m.l - 1 || x > m.l + iw + 1) return;
        var lab = el('text', {
          x: x, y: m.t + ih + 18, 'text-anchor': 'middle',
          class: 'plot-axis', fill: pal.faint
        });
        lab.textContent = (t1 - t0) / 86400000 > 1100
          ? new Date(t).getUTCFullYear()
          : MONTHS[new Date(t).getUTCMonth()] + ' ' + String(new Date(t).getUTCFullYear()).slice(2);
        svg.appendChild(lab);
      });

      svg.appendChild(el('line', {
        x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih,
        stroke: pal.ink, 'stroke-opacity': 0.28
      }));

      drawn = [];
      series.forEach(function (s, si) {
        var pts = decimate(shown[si], t0, t1, iw);
        drawn.push(pts);
        var Y = s.right ? syR : sy;
        var d = '', pen = false;
        pts.forEach(function (p) {
          if (p.v == null) { pen = false; return; }
          d += (pen ? 'L' : 'M') + sx(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1);
          pen = true;
        });
        if (d) {
          svg.appendChild(el('path', {
            d: d, fill: 'none', stroke: s.color, 'stroke-width': s.dash ? 1.6 : 2,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
            'stroke-dasharray': s.dash ? '5 4' : null
          }));
        }
      });

      if (trendOn && trend && !trend.suppressed) {
        function ty(t) {
          return sy(trend.slope * ((t - trend.t0) / DAY) + trend.icpt);
        }
        var a = Math.max(trend.startT, t0), b = Math.min(trend.lastT, t1);
        /* Solid across the stretch it was fitted to, dashed beyond the last
           observation. The reader should be able to see where measurement
           stops and extrapolation starts without reading a caption. */
        if (b > a) {
          svg.appendChild(el('line', {
            x1: sx(a), y1: ty(a), x2: sx(b), y2: ty(b),
            stroke: TREND, 'stroke-width': 1.8, 'stroke-opacity': .95
          }));
        }
        var c = Math.max(trend.lastT, t0), d2 = Math.min(trend.endT, t1);
        if (d2 > c) {
          svg.appendChild(el('line', {
            x1: sx(c), y1: ty(c), x2: sx(d2), y2: ty(d2),
            stroke: TREND, 'stroke-width': 1.8, 'stroke-dasharray': '6 4',
            'stroke-opacity': .95
          }));
          /* Mark the crossing, which is the number the whole line exists to
             produce. */
          if (trend.hitsT && trend.hitsT >= t0 && trend.hitsT <= t1) {
            svg.appendChild(el('circle', {
              cx: sx(trend.hitsT), cy: ty(trend.hitsT), r: 4,
              fill: pal.paper, stroke: TREND, 'stroke-width': 2
            }));
          }
        }
      }

      geom.cursor = el('line', {
        y1: m.t, y2: m.t + ih, stroke: pal.ink,
        'stroke-opacity': 0.35, 'stroke-width': 1, visibility: 'hidden'
      });
      svg.appendChild(geom.cursor);
      geom.dots = series.map(function (s) {
        var c = el('circle', {
          r: 3.5, fill: pal.paper, stroke: s.color,
          'stroke-width': 2, visibility: 'hidden'
        });
        svg.appendChild(c);
        return c;
      });

      figure.appendChild(svg);
    }

    /* --- hover / focus readout --- */

    function nearestIndex(pts, t) {
      var lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (pts[mid].t < t) lo = mid + 1; else hi = mid;
      }
      if (lo > 0 && Math.abs(pts[lo - 1].t - t) < Math.abs(pts[lo].t - t)) lo--;
      return lo;
    }

    function show(t) {
      if (!drawn.length || !drawn[0].length) return;
      var ref = drawn[0];
      var i = nearestIndex(ref, t);
      var at = ref[i].t;
      geom.cursor.setAttribute('x1', geom.sx(at));
      geom.cursor.setAttribute('x2', geom.sx(at));
      geom.cursor.setAttribute('visibility', 'visible');

      var head = (labels && labels[at]) || fmtDate(at, (t1 - t0) / 86400000 < 1100);
      var lines = ['<b>' + head + '</b>'];
      series.forEach(function (s, k) {
        var pts = drawn[k];
        var j = nearestIndex(pts, at);
        var p = pts[j];
        var dot = geom.dots[k];
        if (p && p.v != null && Math.abs(p.t - at) < 86400000 * 6) {
          dot.setAttribute('cx', geom.sx(p.t));
          dot.setAttribute('cy', (s.right ? geom.syR : geom.sy)(p.v));
          dot.setAttribute('visibility', 'visible');
          lines.push('<span class="k" style="--c:' + s.color + '"></span>' +
            s.label + ' <b>' + fmt(p.v) + '</b>');
        } else {
          dot.setAttribute('visibility', 'hidden');
          lines.push('<span class="k" style="--c:' + s.color + '"></span>' +
            s.label + ' <i>no data</i>');
        }
      });
      tip.innerHTML = lines.join('<br>');
      tip.hidden = false;

      var x = geom.sx(at);
      var w = tip.offsetWidth || 150;
      tip.style.left = Math.max(0, Math.min(geom.W - w, x - w / 2)) + 'px';
      tip.style.top = '0px';
      host.__at = at;
    }

    function hide() {
      tip.hidden = true;
      if (geom.cursor) geom.cursor.setAttribute('visibility', 'hidden');
      (geom.dots || []).forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
    }

    function fromEvent(e) {
      var r = figure.getBoundingClientRect();
      var x = e.clientX - r.left;
      var f = (x - geom.m.l) / (geom.iw || 1);
      return t0 + Math.max(0, Math.min(1, f)) * (t1 - t0);
    }

    figure.addEventListener('pointermove', function (e) { show(fromEvent(e)); });
    figure.addEventListener('pointerdown', function (e) { show(fromEvent(e)); });
    figure.addEventListener('pointerleave', hide);

    /* Keyboard: the chart is focusable and arrow keys walk the series, so the
       numbers are reachable without a pointer. */
    figure.tabIndex = 0;
    figure.addEventListener('focus', function () { show(host.__at || t1); });
    figure.addEventListener('blur', hide);
    figure.addEventListener('keydown', function (e) {
      var ref = drawn[0];
      if (!ref || !ref.length) return;
      var i = nearestIndex(ref, host.__at || t1);
      if (e.key === 'ArrowRight') i = Math.min(ref.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = ref.length - 1;
      else if (e.key === 'Escape') { hide(); return; }
      else return;
      e.preventDefault();
      show(ref[i].t);
    });

    draw();
    if (window.ResizeObserver) {
      var last = figure.clientWidth;
      new ResizeObserver(function () {
        if (Math.abs(figure.clientWidth - last) < 2) return;
        last = figure.clientWidth;
        hide();
        draw();
      }).observe(figure);
    }

    return { last: withV.length ? all[all.length - 1] : null };
  }

  /* ---- entry point ----------------------------------------------------- */


  /* ---- small multiples ------------------------------------------------- */

  /* A tile grid of the United States: each state one cell, placed roughly
     where it sits on the map. Reading a grid of fifty boxes alphabetically
     means hunting for a label every time; laid out geographically you find a
     state where you expect it and regional patterns show up on their own —
     a bad flu week in the southeast is a block of color, not eight
     scattered cells.

     Rows and columns, 11 wide. This is the arrangement the old dashboard
     used, which is the common US tile-grid layout. */
  var US_GRID = {
    AK: [0, 0], ME: [0, 11],
    WA: [1, 1], ID: [1, 2], MT: [1, 3], ND: [1, 4], MN: [1, 5], WI: [1, 6],
    MI: [1, 7], NY: [1, 9], VT: [1, 10], NH: [1, 11],
    OR: [2, 1], NV: [2, 2], WY: [2, 3], SD: [2, 4], IA: [2, 5], IL: [2, 6],
    IN: [2, 7], OH: [2, 8], PA: [2, 9], CT: [2, 10], MA: [2, 11],
    CA: [3, 1], UT: [3, 2], CO: [3, 3], NE: [3, 4], MO: [3, 5], KY: [3, 6],
    WV: [3, 7], VA: [3, 8], MD: [3, 9], NJ: [3, 10], RI: [3, 11],
    AZ: [4, 2], NM: [4, 3], KS: [4, 4], AR: [4, 5], TN: [4, 6], NC: [4, 7],
    SC: [4, 8], DC: [4, 9], DE: [4, 10],
    OK: [5, 4], LA: [5, 5], MS: [5, 6], AL: [5, 7], GA: [5, 8],
    HI: [6, 1], TX: [6, 4], FL: [6, 9],
    PR: [6, 11]
  };

  /* Odd rows are offset half a tile. That single change is most of what makes
     this read as a map rather than a spreadsheet -- a strict rectangular grid
     of fifty boxes never does, however carefully the states are placed. The
     offset is done by laying the grid out in HALF columns and starting odd
     rows one half-column in, rather than by transforming the tiles, so
     nothing overflows its container. */
  var GRID_COLS = 12;

  var STATE_ABBR = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT',
    'Delaware': 'DE', 'District of Columbia': 'DC', 'Florida': 'FL',
    'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL',
    'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
    'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
    'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
    'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
    'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
    'Puerto Rico': 'PR', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
  };

  /* The line carries the color, and carries it PER POINT: a stretch above
     zero is red, a stretch below is green, and it passes through gray at the
     crossing. So one panel can show both, which is the information -- a state
     that fell and then turned back up says so in the shape and the color at
     once.

     Drawn as a vertical gradient rather than as per-segment strokes, because
     the color depends only on the y value. One gradient, mapped to the
     panel's own scale, tints every segment correctly and blends within a
     segment the way a continuous scale should. */
  /* Cool against a warm page, so a computed line never reads as another
     measured series. */
  var TREND = 'rgb(72,88,140)';

  var CHANGE_UP = 'rgb(168,52,34)';
  var CHANGE_MID = 'rgb(150,138,122)';
  var CHANGE_DOWN = 'rgb(46,96,62)';

  function buildPanels(host, opt, data) {
    var pal = palette();
    var fmt = FORMATS[opt.format] || FORMATS.number;
    var xKey = opt.x || 'date';
    var byKey = opt.panelBy;
    var vKey = opt.value;
    var geo = opt.layout === 'us-grid';

    /* --- gather --- */
    var groups = {};
    data.rows.forEach(function (r) {
      var name = r[byKey];
      if (!name) return;
      var t = parseDate(r[xKey]);
      if (isNaN(t)) return;
      var raw = r[vKey];
      var v = (raw === '' || raw == null) ? null : +raw;
      (groups[name] || (groups[name] = [])).push({
        t: t, v: (v == null || isNaN(v)) ? null : v
      });
    });

    var names = Object.keys(groups);
    if (!names.length) throw new Error('nothing to panel by "' + byKey + '"');
    names.forEach(function (n) {
      groups[n].sort(function (a, b) { return a.t - b.t; });
    });

    var tMax = -Infinity;
    names.forEach(function (n) {
      var p = groups[n];
      if (p.length && p[p.length - 1].t > tMax) tMax = p[p.length - 1].t;
    });

    /* --- modes ---
       'change' is the default and shows the same thing the old dashboard
       did: percentage change against four weeks earlier, so a state that is
       small but climbing fast is as visible as a large one. The value modes
       show the underlying admissions over a window. */
    var LAG_WEEKS = opt.changeLagWeeks || 4;
    var modes = [{ k: 'change', label: opt.changeLabel || '4-week change' }];
    (opt.valueRanges || ['6m', '1y', '2y', '5y']).forEach(function (k) {
      var r = RANGES.filter(function (x) { return x.k === k; })[0];
      if (r) modes.push({ k: k, label: r.label, days: r.d });
    });
    var mode = opt.defaultMode || 'change';

    /* --- shell --- */
    host.classList.add('plot', 'plot-panels');
    host.innerHTML = '';

    var bar = document.createElement('div');
    bar.className = 'plot-ranges panel-modes';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'What each panel shows');
    var btns = [];
    modes.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'plot-range';
      b.textContent = m.label;
      b.dataset.mode = m.k;
      b.setAttribute('aria-pressed', String(m.k === mode));
      b.addEventListener('click', function () {
        if (m.k === mode) return;
        mode = m.k;
        btns.forEach(function (o) {
          o.setAttribute('aria-pressed', String(o.dataset.mode === mode));
        });
        render();
      });
      btns.push(b);
      bar.appendChild(b);
    });
    host.appendChild(bar);

    var note = document.createElement('p');
    note.className = 'panel-note';
    host.appendChild(note);

    var grid = document.createElement('div');
    grid.className = 'panel-grid' + (geo ? ' is-geo' : '');
    host.appendChild(grid);

    /* --- per-mode series --- */
    function seriesFor(name) {
      var pts = groups[name];
      if (mode !== 'change') {
        var days = modes.filter(function (m) { return m.k === mode; })[0].days;
        var from = tMax - days * DAY;
        return pts.filter(function (p) { return p.t >= from; });
      }

      /* Percentage change against ONE fixed reference week -- the week
         LAG_WEEKS before the latest -- not against a rolling lag. Every point
         is measured from the same starting line, so the first is 0% by
         construction and the line traces where the state has got to since.
         A rolling lag gives a series of unrelated comparisons instead, which
         is a different and much harder quantity to read. */
      var refT = tMax - LAG_WEEKS * 7 * DAY;
      var ref = null;
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].t === refT) { ref = pts[i].v; break; }
      }
      /* No reference, or a reference of zero, means the change is undefined
         rather than large -- a handful of admissions divided by nothing is
         not a percentage. Those panels are drawn as no-data rather than given
         an arbitrary denominator. */
      if (ref == null || ref === 0) return null;

      var out = [];
      pts.forEach(function (p) {
        if (p.t < refT || p.t > tMax) return;
        out.push({ t: p.t, v: p.v == null ? null : (p.v / ref - 1) * 100 });
      });
      return out;
    }

    function render() {
      grid.innerHTML = '';
      var isChange = mode === 'change';

      var series = {};
      names.forEach(function (n) { series[n] = seriesFor(n); });

      var lo = Infinity, hi = -Infinity;
      names.forEach(function (n) {
        (series[n] || []).forEach(function (p) {
          if (p.v == null) return;
          if (p.v < lo) lo = p.v;
          if (p.v > hi) hi = p.v;
        });
      });
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (isChange) {
        var span = Math.max(Math.abs(lo), Math.abs(hi), 10);
        lo = -span; hi = span;                 // symmetric, so zero is centred
      } else {
        lo = Math.min(0, lo);
        if (hi <= lo) hi = lo + 1;
      }

      var gaps = names.filter(function (n) { return !series[n]; }).length;
      note.innerHTML = isChange
        ? ('Percentage change against ' + LAG_WEEKS + ' weeks earlier, traced '
           + 'week by week from that one reference. The line runs '
           + '<span class="key key-up"></span> above zero and '
           + '<span class="key key-dn"></span> below it, so a state that fell '
           + 'and turned back up shows both. Every panel shares one scale.'
           + (gaps ? ' ' + gaps + ' greyed panels had no admissions in the '
              + 'reference week, which leaves the change undefined.' : ''))
        : ('Weekly admissions per 100,000 residents. Every panel shares one '
           + 'vertical scale, topping out at ' + fmt(hi) + ', so a small state '
           + 'and a large one can be read against each other.');

      var W = 100, H = 46, m = 3;
      var order = geo
        ? names.slice().sort(function (a, b) {
            var ga = US_GRID[STATE_ABBR[a] || a] || [99, 99];
            var gb = US_GRID[STATE_ABBR[b] || b] || [99, 99];
            return ga[0] - gb[0] || ga[1] - gb[1];
          })
        : names.slice().sort();

      order.forEach(function (n) {
        var pts = series[n];
        var abbr = STATE_ABBR[n] || n;
        var cell = document.createElement('figure');
        cell.className = 'panel' + (pts ? '' : ' is-nodata');

        if (geo && US_GRID[abbr]) {
          var gr = US_GRID[abbr];
          /* Half-column placement: odd rows start one half-column in. That
             offset is most of what makes the grid read as a map. */
          var start = gr[1] * 2 + 1 + (gr[0] % 2 ? 1 : 0);
          cell.style.gridRow = String(gr[0] + 1);
          cell.style.gridColumn = start + ' / span 2';
        }

        var last = null;
        if (pts) {
          for (var i = pts.length - 1; i >= 0; i--) {
            if (pts[i].v != null) { last = pts[i].v; break; }
          }
        }

        var cap = document.createElement('figcaption');
        cap.innerHTML = '<span class="panel-name"></span>'
                      + '<span class="panel-peak"></span>';
        cap.querySelector('.panel-name').textContent = geo ? abbr : n;
        cap.querySelector('.panel-peak').textContent = last == null
          ? '\u2013'
          : (isChange ? (last > 0 ? '+' : '') + Math.round(last) + '%'
                      : fmt(last));
        cell.appendChild(cap);

        var svg = el('svg', {
          viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none',
          role: 'img',
          'aria-label': n + ': ' + (last == null ? 'no data'
            : (isChange ? Math.round(last) + ' percent change' : fmt(last)))
        });

        function sx(i, len) {
          return m + (len < 2 ? 0.5 : i / (len - 1)) * (W - m * 2);
        }
        function sy(v) { return H - m - (v - lo) / (hi - lo || 1) * (H - m * 2); }

        if (isChange) {
          svg.appendChild(el('line', {
            x1: m, x2: W - m, y1: sy(0), y2: sy(0),
            stroke: pal.ink, 'stroke-opacity': 0.22, 'stroke-dasharray': '2 2',
            'vector-effect': 'non-scaling-stroke'
          }));
        }

        if (pts && pts.length) {
          var stroke = pal.ember;
          if (isChange) {
            var gid = 'chg-' + abbr;
            var defs = el('defs', {});
            var lg = el('linearGradient', {
              id: gid, gradientUnits: 'userSpaceOnUse',
              x1: 0, y1: sy(hi), x2: 0, y2: sy(lo)
            });
            [[0, CHANGE_UP], [0.5, CHANGE_MID], [1, CHANGE_DOWN]]
              .forEach(function (st) {
                lg.appendChild(el('stop', {
                  offset: st[0], 'stop-color': st[1]
                }));
              });
            defs.appendChild(lg);
            svg.appendChild(defs);
            stroke = 'url(#' + gid + ')';
          }

          var d = '', area = '', pen = false;
          pts.forEach(function (p, i) {
            if (p.v == null) { pen = false; return; }
            var x = sx(i, pts.length).toFixed(1), y = sy(p.v).toFixed(1);
            d += (pen ? 'L' : 'M') + x + ' ' + y;
            if (!isChange) {
              area += (pen ? 'L' : 'M' + x + ' ' + (H - m) + 'L') + x + ' ' + y;
            }
            pen = true;
          });
          if (area) {
            area += 'L' + sx(pts.length - 1, pts.length).toFixed(1)
                 + ' ' + (H - m) + 'Z';
            svg.appendChild(el('path', {
              d: area, fill: pal.ember, 'fill-opacity': 0.13, stroke: 'none'
            }));
          }
          if (d) {
            svg.appendChild(el('path', {
              d: d, fill: 'none', stroke: stroke,
              'stroke-width': isChange ? 2 : 1.5,
              'stroke-linejoin': 'round', 'stroke-linecap': 'round',
              'vector-effect': 'non-scaling-stroke'
            }));
          }
        }
        cell.appendChild(svg);
        grid.appendChild(cell);
      });
    }

    render();
    return { panels: names.length };
  }

  function render(host, opt) {
    if (!host) return Promise.resolve(null);
    host.classList.add('is-loading');
    return fetch(opt.csv, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        var data = parseCSV(text);
        if (!data.rows.length) throw new Error('empty CSV');
        host.classList.remove('is-loading');
        return (opt.panelBy ? buildPanels : build)(host, opt, data);
      })
      .catch(function (err) {
        host.classList.remove('is-loading');
        host.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'plot-error';
        /* Say which chart failed and why. A blank rectangle is the thing this
           whole project exists to stop. */
        p.textContent = 'This chart could not load its data (' + err.message + ').';
        host.appendChild(p);
        return null;
      });
  }

  /* Render everything declared in markup: <div class="plot-mount"
     data-plot='{...}'></div>.

     Every chart mounts on load. There is no lazy loading, and that is a
     deliberate reversal: two earlier versions deferred below-the-fold charts
     (first with IntersectionObserver, then with a scroll handler) and neither
     could be verified, because the embedded browser this was built in fires
     neither IO callbacks nor scroll events nor requestAnimationFrame.

     It is not worth the risk it carries. The charted files come to about
     190 KB before compression, on an origin that serves them from cache --
     less than one photograph. Weighed against a reader meeting a column of
     blank rectangles because their browser did something the deferral did not
     expect, eager mounting is the better trade. If the page ever grows to the
     point where this matters, defer it then, and test it in a real browser. */
  function auto() {
    var mounts = [].slice.call(document.querySelectorAll('[data-plot]'));
    mounts.forEach(function (m) {
      var opt;
      try { opt = JSON.parse(m.getAttribute('data-plot')); }
      catch (e) {
        m.innerHTML = '<p class="plot-error">This chart is misconfigured (' +
          e.message + ').</p>';
        return;
      }
      render(m, opt);
    });
  }

  window.Plot = { render: render, parseCSV: parseCSV, formats: FORMATS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto);
  } else auto();
})();
