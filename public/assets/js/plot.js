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

  /* Series colours, in the order lines are declared. Ember first because the
     first series is the subject of the chart; the rest recede. */
  function seriesColour(pal, i) {
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
    percent: function (v) { return (Math.round(v * 10) / 10) + '%'; }
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

  /* Date ticks on boundaries a reader recognises — years, or months when the
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
        colour: s.color || seriesColour(pal, i),
        dash: !!s.dash,
        pts: pts
      };
    });

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

    var t0 = Math.min.apply(null, all.map(function (p) { return p.t; }));
    var t1 = Math.max.apply(null, all.map(function (p) { return p.t; }));
    var v0 = Math.min.apply(null, withV.map(function (p) { return p.v; }));
    var v1 = Math.max.apply(null, withV.map(function (p) { return p.v; }));
    if (opt.zero) v0 = Math.min(0, v0);
    var padV = (v1 - v0) * 0.08 || Math.abs(v1 || 1) * 0.1;
    v0 -= padV; v1 += padV;

    /* --- DOM shell --- */
    host.classList.add('plot');
    host.innerHTML = '';
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
      sw.style.setProperty('--c', s.colour);
      li.appendChild(sw);
      li.appendChild(document.createTextNode(s.label));
      legend.appendChild(li);
    });
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
      var H = opt.height || Math.max(220, Math.min(400, Math.round(W * 0.46)));
      var m = { t: 12, r: 14, b: 26, l: 56 };
      var iw = Math.max(10, W - m.l - m.r);
      var ih = Math.max(10, H - m.t - m.b);
      geom = { W: W, H: H, m: m, iw: iw, ih: ih };

      function sx(t) { return m.l + (t - t0) / (t1 - t0 || 1) * iw; }
      function sy(v) { return m.t + ih - (v - v0) / (v1 - v0 || 1) * ih; }
      geom.sx = sx; geom.sy = sy;

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
      series.forEach(function (s) {
        var pts = decimate(s.pts, t0, t1, iw);
        drawn.push(pts);
        var d = '', pen = false;
        pts.forEach(function (p) {
          if (p.v == null) { pen = false; return; }
          d += (pen ? 'L' : 'M') + sx(p.t).toFixed(1) + ' ' + sy(p.v).toFixed(1);
          pen = true;
        });
        if (d) {
          svg.appendChild(el('path', {
            d: d, fill: 'none', stroke: s.colour, 'stroke-width': s.dash ? 1.6 : 2,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
            'stroke-dasharray': s.dash ? '5 4' : null
          }));
        }
      });

      geom.cursor = el('line', {
        y1: m.t, y2: m.t + ih, stroke: pal.ink,
        'stroke-opacity': 0.35, 'stroke-width': 1, visibility: 'hidden'
      });
      svg.appendChild(geom.cursor);
      geom.dots = series.map(function (s) {
        var c = el('circle', {
          r: 3.5, fill: pal.paper, stroke: s.colour,
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

      var lines = ['<b>' + fmtDate(at, (t1 - t0) / 86400000 < 1100) + '</b>'];
      series.forEach(function (s, k) {
        var pts = drawn[k];
        var j = nearestIndex(pts, at);
        var p = pts[j];
        var dot = geom.dots[k];
        if (p && p.v != null && Math.abs(p.t - at) < 86400000 * 6) {
          dot.setAttribute('cx', geom.sx(p.t));
          dot.setAttribute('cy', geom.sy(p.v));
          dot.setAttribute('visibility', 'visible');
          lines.push('<span class="k" style="--c:' + s.colour + '"></span>' +
            s.label + ' <b>' + fmt(p.v) + '</b>');
        } else {
          dot.setAttribute('visibility', 'hidden');
          lines.push('<span class="k" style="--c:' + s.colour + '"></span>' +
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
        return build(host, opt, data);
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
