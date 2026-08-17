/* ============================================================
   book-dust — four ways to draw dust coming off a turning page.

   Shared by the about page and the dust lab. Every strategy is fed
   the same signal: StPageFlip renders a .stf__outerShadow element
   along the crease, so reading its box each frame gives the live
   position and speed of the fold. Dust is born there and thrown
   outward — it is not an overlay playing on a timer.

     BookDust.attach(bookEl, hostEl, flip, { kind, amount })

   returns { kick, rebuild, setAmount }.
   ============================================================ */
(function () {
  var AMOUNT = 1;
  var DUST_SRCS = window.__DUST_SRCS || [1, 2, 3, 4].map(function (n) {
    return 'assets/tome/dust-' + n + '.png';
  });
  var sprites = DUST_SRCS.map(function (src) { var i = new Image(); i.src = src; return i; });

  /* ---------------------------------------------------------------- utils */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  // cheap smooth 2D noise, enough for a flow field
  var P = new Uint8Array(512);
  (function () { for (var i = 0; i < 256; i++) P[i] = P[i + 256] = (Math.random() * 256) | 0; })();
  function noise(x, y) {
    var xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    var xf = x - Math.floor(x), yf = y - Math.floor(y);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    function g(a, b) { return P[(P[a] + b) & 511] / 255 - 0.5; }
    var n00 = g(xi, yi), n10 = g(xi + 1, yi), n01 = g(xi, yi + 1), n11 = g(xi + 1, yi + 1);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
  }
  function curl(x, y, t) {
    var e = 0.35;
    var n1 = noise(x, y + e + t), n2 = noise(x, y - e + t);
    var n3 = noise(x + e, y + t), n4 = noise(x - e, y + t);
    return [(n1 - n2) / (2 * e), -(n3 - n4) / (2 * e)];
  }

  /* ------------------------------------------------------- the fold signal */
  function foldReader(bookEl) {
    var prev = null;
    return function (rect) {
      var sh = bookEl.querySelector('.stf__outerShadow');
      var flipping = null;
      var items = bookEl.querySelectorAll('.stf__item');
      for (var i = 0; i < items.length; i++) {
        var cs = getComputedStyle(items[i]);
        if (cs.display !== 'none' && cs.clipPath && cs.clipPath !== 'none' && (+cs.zIndex || 0) >= 5) {
          flipping = items[i]; break;
        }
      }
      if (!sh || !flipping) { prev = null; return null; }
      var sr = sh.getBoundingClientRect(), fr = flipping.getBoundingClientRect();
      if (!sr.width && !fr.width) { prev = null; return null; }

      var x = (sr.left + sr.width / 2) - rect.left;      // the crease
      var top = fr.top - rect.top, bot = fr.bottom - rect.top;
      var v = prev === null ? 0 : x - prev;
      prev = x;
      return { x: x, top: top, bottom: bot, v: v, h: Math.max(1, bot - top) };
    };
  }

  /* =====================================================================
     STRATEGY 1 — PUFFS
     Sprite billboards: irregular alpha clouds that grow, rotate, drift
     and fade. Many small ones, heavily overlapped, so they read as a
     mass rather than as separate blobs.
     ===================================================================== */
  function puffs(ctx, W, H) {
    var ps = [];
    return {
      emit: function (f, power) {
        var n = Math.round(rnd(2, 5) * power * AMOUNT);
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.pow(Math.random(), 0.8) * f.h;
          ps.push({
            x: f.x + rnd(-6, 6), y: y,
            vx: f.v * rnd(0.25, 0.7) + rnd(-0.5, 0.5),
            vy: rnd(-1.1, -0.15),
            s: rnd(10, 44) * (0.7 + power * 0.5),
            grow: rnd(1.004, 1.019),
            rot: rnd(0, 6.28), spin: rnd(-0.01, 0.01),
            life: 0, fade: rnd(0.006, 0.016),
            peak: rnd(0.05, 0.14),
            img: (Math.random() * sprites.length) | 0
          });
        }
      },
      frame: function () {
        ctx.clearRect(0, 0, W, H);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.99; p.vy = p.vy * 0.99 + 0.004;
          p.s *= p.grow; p.rot += p.spin; p.life += p.fade;
          if (p.life >= 1) { ps.splice(i, 1); continue; }
          var k = p.life < 0.18 ? p.life / 0.18 : 1 - (p.life - 0.18) / 0.82;
          var im = sprites[p.img];
          if (!im.complete || !im.naturalWidth) continue;
          ctx.globalAlpha = k * p.peak * edgeFade(p.x, p.y, W, H);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(im, -p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
        }
        ctx.globalAlpha = 1;
        return ps.length;
      },
      clear: function () { ps.length = 0; }
    };
  }

  /* =====================================================================
     STRATEGY 2 — CLOUD
     The same particles, but drawn to an offscreen buffer with additive
     blending and then pushed through blur + contrast. Overlapping blobs
     fuse into one continuous mass with a soft ragged boundary, which is
     what stops it looking like a bag of bubbles.
     ===================================================================== */
  function cloud(ctx, W, H) {
    var ps = [];
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var oc = off.getContext('2d');
    return {
      emit: function (f, power) {
        var n = Math.round(rnd(3, 7) * power * AMOUNT);
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.pow(Math.random(), 0.75) * f.h;
          ps.push({
            x: f.x + rnd(-8, 8), y: y,
            vx: f.v * rnd(0.3, 0.8) + rnd(-0.6, 0.6),
            vy: rnd(-1.3, -0.2),
            s: rnd(16, 52) * (0.7 + power * 0.5),
            grow: rnd(1.006, 1.022),
            life: 0, fade: rnd(0.007, 0.017),
            seedx: rnd(0, 100), seedy: rnd(0, 100)
          });
        }
      },
      frame: function (t) {
        oc.clearRect(0, 0, W, H);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          var c = curl(p.x * 0.012 + p.seedx, p.y * 0.012 + p.seedy, t * 0.00016);
          p.vx += c[0] * 0.5; p.vy += c[1] * 0.5;
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.005;
          p.s *= p.grow; p.life += p.fade;
          if (p.life >= 1) { ps.splice(i, 1); continue; }
          var k = p.life < 0.2 ? p.life / 0.2 : 1 - (p.life - 0.2) / 0.8;
          // plain source-over, translucent: overlaps accumulate into a
          // denser mass. Additive blending here turns dust into fire.
          var a = k * 0.16 * edgeFade(p.x, p.y, W, H);
          var g = oc.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
          g.addColorStop(0, 'rgba(112,90,60,' + a.toFixed(3) + ')');
          g.addColorStop(0.55, 'rgba(112,90,60,' + (a * 0.55).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(112,90,60,0)');
          oc.fillStyle = g;
          oc.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        }

        ctx.clearRect(0, 0, W, H);
        // blur smears neighbours together so the blobs stop reading as blobs
        ctx.filter = 'blur(6px)';
        ctx.globalAlpha = 0.95;
        ctx.drawImage(off, 0, 0);
        ctx.filter = 'none'; ctx.globalAlpha = 1;
        return ps.length;
      },
      clear: function () { ps.length = 0; }
    };
  }

  /* =====================================================================
     STRATEGY 3 — MIST
     No sprites at all. A few thousand single pixels pushed around by a
     curl-noise flow field. Reads as fine airborne dust catching the
     light rather than as smoke.
     ===================================================================== */
  function mist(ctx, W, H) {
    var ps = [];
    return {
      emit: function (f, power) {
        var n = Math.round(rnd(40, 90) * power * AMOUNT);
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.random() * f.h;
          ps.push({
            x: f.x + rnd(-10, 10), y: y,
            vx: f.v * rnd(0.2, 0.9) + rnd(-0.7, 0.7),
            vy: rnd(-1.6, -0.1),
            s: rnd(0.7, 2.1),
            life: 1, decay: rnd(0.004, 0.013),
            a: rnd(0.12, 0.4),
            pale: Math.random() < 0.4
          });
        }
      },
      frame: function (t) {
        ctx.clearRect(0, 0, W, H);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          var c = curl(p.x * 0.018, p.y * 0.018, t * 0.00028);
          p.vx += c[0] * 1.5; p.vy += c[1] * 1.5;
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.983; p.vy = p.vy * 0.983 + 0.007;
          p.life -= p.decay;
          if (p.life <= 0) { ps.splice(i, 1); continue; }
          ctx.globalAlpha = p.life * p.a * edgeFade(p.x, p.y, W, H);
          ctx.fillStyle = p.pale ? '#fff6e0' : '#6f5a3e';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return ps.length;
      },
      clear: function () { ps.length = 0; }
    };
  }

  /* =====================================================================
     STRATEGY 4 — SMOKE
     No canvas. Soft SVG ellipses run through feTurbulence +
     feDisplacementMap, so their edges are chewed into wisps, then
     animated outward with CSS and discarded. Composited by the GPU.
     ===================================================================== */
  function smoke(host, W, H) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    var uid = 'sm' + Math.random().toString(36).slice(2, 8);
    svg.innerHTML =
      '<defs><filter id="' + uid + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="5" seed="7" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="62" xChannelSelector="R" yChannelSelector="G"/>' +
      '<feGaussianBlur stdDeviation="3"/>' +
      '</filter></defs><g id="' + uid + '-g" filter="url(#' + uid + ')"></g>';
    host.appendChild(svg);
    var g = svg.querySelector('#' + uid + '-g');
    var live = 0;

    return {
      emit: function (f, power) {
        if (live > 44) return;
        var n = Math.round(rnd(2, 4.2) * power * AMOUNT);
        for (var i = 0; i < n; i++) {
          var e = document.createElementNS(ns, 'ellipse');
          var r = rnd(20, 44);
          e.setAttribute('cx', f.x + rnd(-8, 8));
          e.setAttribute('cy', f.top + Math.pow(Math.random(), 0.8) * f.h);
          e.setAttribute('rx', r); e.setAttribute('ry', r * rnd(0.7, 1.1));
          e.setAttribute('fill', 'rgba(132,108,76,' + rnd(0.20, 0.42).toFixed(3) + ')');
          var dx = f.v * rnd(8, 20) + rnd(-34, 34), dy = rnd(-92, -26);
          var dur = rnd(1500, 2900);
          e.animate([
            { transform: 'translate(0,0) scale(.35)', opacity: 0 },
            { transform: 'translate(' + dx * 0.35 + 'px,' + dy * 0.35 + 'px) scale(1.1)', opacity: 1, offset: 0.22 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(2.4)', opacity: 0 }
          ], { duration: dur, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' });
          g.appendChild(e); live++;
          setTimeout(function (node) { return function () { node.remove(); live--; }; }(e), dur + 60);
        }
      },
      frame: function () { return live; },
      clear: function () { g.innerHTML = ''; live = 0; }
    };
  }

  function edgeFade(x, y, W, H) {
    var m = Math.min(W, H) * 0.18;
    return Math.max(0, Math.min(1, Math.min(Math.min(x, W - x), Math.min(y, H - y)) / m));
  }


  var STRATEGIES = {
    puffs: { label: 'Puffs', make: puffs, kind: 'canvas' },
    cloud: { label: 'Cloud', make: cloud, kind: 'canvas' },
    mist:  { label: 'Mist',  make: mist,  kind: 'canvas' },
    smoke: { label: 'Smoke', make: smoke, kind: 'svg'  }
  };

  function attach(bookEl, host, flip, opts) {
    opts = opts || {};
    var spec = STRATEGIES[opts.kind] || STRATEGIES.cloud;
    var engine = null, W = 0, H = 0;

    function rebuild() {
      var r = host.getBoundingClientRect();
      W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
      host.innerHTML = '';
      if (spec.kind === 'canvas') {
        var canvas = el('canvas');
        canvas.width = W; canvas.height = H;
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        host.appendChild(canvas);
        engine = spec.make(canvas.getContext('2d'), W, H);
      } else {
        engine = spec.make(host, W, H);
      }
    }

    var read = foldReader(bookEl);
    var raf = null, idleAfter = 0, alive = 0;

    function loop(t) {
      raf = null;
      if (!engine) return;
      var f = read(host.getBoundingClientRect());
      if (f) {
        engine.emit(f, Math.min(1.6, 0.35 + Math.abs(f.v) * 0.12));
        idleAfter = t + 2600;
      }
      alive = engine.frame(t || 0);
      if (f || alive || t < idleAfter) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }

    if (flip && flip.on) {
      flip.on('changeState', function (e) { if (e.data !== 'read') kick(); });
      flip.on('flip', kick);
    }

    rebuild();
    return {
      kick: kick,
      rebuild: rebuild,
      alive: function () { return alive; },
      setAmount: function (v) { AMOUNT = v; }
    };
  }

  window.BookDust = {
    attach: attach,
    strategies: STRATEGIES,
    setAmount: function (v) { AMOUNT = v; }
  };
})();
