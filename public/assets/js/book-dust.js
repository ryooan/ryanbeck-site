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
      // StPageFlip sets display, zIndex and clipPath as inline styles, so
      // these can be read straight off .style. Going through
      // getComputedStyle here forces a style recalc on every item on every
      // frame of the animation, which is expensive enough to cost frames.
      var items = bookEl.querySelectorAll('.stf__item');
      var flipping = null, clipped = false;
      for (var i = 0; i < items.length; i++) {
        var st = items[i].style;
        if (st.display === 'none' || !st.display || (+st.zIndex || 0) < 5) continue;
        flipping = items[i];
        // note: StPageFlip writes clipPath as the literal string 'none' on a
        // hard cover, so truthiness alone would call every cover a soft fold
        clipped = !!st.clipPath && st.clipPath !== 'none';
        break;
      }
      if (!flipping) { prev = null; return null; }

      var fr = flipping.getBoundingClientRect();
      if (!fr.width && !fr.height) { prev = null; return null; }

      var x;
      if (clipped) {
        // A soft page: StPageFlip draws .stf__outerShadow along the crease,
        // which is exactly where the paper is bending.
        var sh = bookEl.querySelector('.stf__outerShadow');
        var sr = sh && sh.getBoundingClientRect();
        if (!sr || !sr.width) { prev = null; return null; }
        x = (sr.left + sr.width / 2) - rect.left;
      } else {
        // A hard cover: no crease at all, it swings as a board. There is a
        // .stf__hardShadow instead, and the edge that matters is whichever
        // side of the board is furthest from the spine.
        var blk = bookEl.querySelector('.stf__block');
        var br = blk ? blk.getBoundingClientRect() : fr;
        var cx = br.left + br.width / 2;
        var far = Math.abs(fr.left - cx) > Math.abs(fr.right - cx) ? fr.left : fr.right;
        x = far - rect.left;
      }

      var top = fr.top - rect.top, bot = fr.bottom - rect.top;
      var v = prev === null ? 0 : x - prev;
      prev = x;
      return { x: x, top: top, bottom: bot, v: v, h: Math.max(1, bot - top), hard: !clipped };
    };
  }

  /* Dust does not just get dragged along behind the page — the page slaps
     the air and it goes everywhere. Up, down and left freely, with only a
     little to the right, and only a small share of the crease's own motion. */
  function throwVel(f, base) {
    var ang = Math.random() * 6.283;
    var cx = Math.cos(ang), sy = Math.sin(ang);
    if (cx > 0) cx *= 0.30;
    var sp = base * (0.3 + Math.pow(Math.random(), 0.6) * 1.6);
    return { vx: cx * sp + f.v * 0.16 + rnd(-0.15, 0.15),
             vy: sy * sp - 0.2 };
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
        // Fine and numerous rather than few and large — a handful of big
        // sprites reads as bubbles no matter how you fade them.
        var n = Math.round(rnd(9, 21) * power * AMOUNT);
        if (ps.length > 900) ps.splice(0, ps.length - 900);
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.pow(Math.random(), 0.8) * f.h;
          var v = throwVel(f, 1.15);
          ps.push({
            x: f.x + rnd(-9, 9), y: y,
            vx: v.vx, vy: v.vy,
            s: rnd(3.5, 17) * (0.75 + power * 0.4),
            grow: rnd(1.003, 1.013),
            rot: rnd(0, 6.28), spin: rnd(-0.014, 0.014),
            life: 0, fade: rnd(0.006, 0.017),
            peak: rnd(0.06, 0.17),
            img: (Math.random() * sprites.length) | 0
          });
        }
      },
      frame: function (t, skipClear) {
        if (!skipClear) ctx.clearRect(0, 0, W, H);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.992; p.vy = p.vy * 0.992 + 0.0022;
          p.s *= p.grow; p.rot += p.spin; p.life += p.fade;
          if (p.life >= 1) { ps.splice(i, 1); continue; }
          var k = p.life < 0.18 ? p.life / 0.18 : 1 - (p.life - 0.18) / 0.82;
          var im = sprites[p.img];
          if (!im.complete || !im.naturalWidth) continue;
          ctx.globalAlpha = k * p.peak * edgeFade(p.x, p.y, W, H);
          if (p.s < 8) {
            // too small for the rotation to be visible, and skipping the
            // transform saves the save/restore pair
            ctx.drawImage(im, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
          } else {
            var c = Math.cos(p.rot), n2 = Math.sin(p.rot);
            ctx.setTransform(c, n2, -n2, c, p.x, p.y);
            ctx.drawImage(im, -p.s / 2, -p.s / 2, p.s, p.s);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
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
            vx: throwVel(f, 1.2).vx, vy: throwVel(f, 1.2).vy,
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
        var n = Math.round(rnd(95, 200) * power * AMOUNT);
        if (ps.length > 3200) ps.splice(0, ps.length - 3200);
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.random() * f.h;
          var v = throwVel(f, 1.6);
          ps.push({
            x: f.x + rnd(-12, 12), y: y,
            vx: v.vx, vy: v.vy,
            cx: 0, cy: 0, off: (Math.random() * 3) | 0,
            s: rnd(0.7, 2.1),
            life: 1, decay: rnd(0.004, 0.013),
            a: rnd(0.12, 0.4),
            pale: Math.random() < 0.4
          });
        }
      },
      frame: function (t, skipClear) {
        if (!skipClear) ctx.clearRect(0, 0, W, H);
        // Thousands of motes a frame. Two things make that affordable:
        // fillRect instead of arc, and bucketing by opacity so globalAlpha
        // is set about sixteen times a frame rather than three thousand.
        var B = 8, buckets = [], bi;
        for (bi = 0; bi < B * 2; bi++) buckets.push(null);

        var tick3 = (t / 16) | 0;
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          // curl noise is four noise lookups a go; at three thousand motes
          // that is the whole frame budget. Each particle refreshes its own
          // flow vector every third frame and coasts on it in between.
          if (((tick3 + p.off) % 3) === 0) {
            var c = curl(p.x * 0.018, p.y * 0.018, t * 0.00028);
            p.cx = c[0]; p.cy = c[1];
          }
          p.vx += p.cx * 1.5; p.vy += p.cy * 1.5;
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.986; p.vy = p.vy * 0.986 + 0.004;
          p.life -= p.decay;
          if (p.life <= 0) { ps.splice(i, 1); continue; }
          var a = p.life * p.a * edgeFade(p.x, p.y, W, H);
          if (a <= 0.012) continue;
          var b = Math.min(B - 1, (a * B) | 0) + (p.pale ? B : 0);
          (buckets[b] || (buckets[b] = [])).push(p);
        }

        for (bi = 0; bi < B * 2; bi++) {
          var list = buckets[bi];
          if (!list) continue;
          ctx.globalAlpha = ((bi % B) + 0.5) / B;
          ctx.fillStyle = bi >= B ? '#fff6e0' : '#6f5a3e';
          for (var j = 0; j < list.length; j++) {
            var q = list[j];
            ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
          }
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
          var sv = throwVel(f, 1.0);
          var dx = sv.vx * 34, dy = sv.vy * 34;
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


  /* =====================================================================
     STRATEGY 5 — BOTH
     Puffs for body, mist on top for grain. They share one canvas, so the
     wrapper clears it once and tells each engine not to.
     ===================================================================== */
  function both(ctx, W, H) {
    var a = puffs(ctx, W, H), b = mist(ctx, W, H);
    return {
      emit: function (f, power) { a.emit(f, power * 0.8); b.emit(f, power * 0.65); },
      frame: function (t) {
        ctx.clearRect(0, 0, W, H);
        return a.frame(t, true) + b.frame(t, true);
      },
      clear: function () { a.clear(); b.clear(); }
    };
  }

  var STRATEGIES = {
    puffs: { label: 'Puffs', make: puffs, kind: 'canvas' },
    cloud: { label: 'Cloud', make: cloud, kind: 'canvas' },
    mist:  { label: 'Mist',  make: mist,  kind: 'canvas' },
    smoke: { label: 'Smoke', make: smoke, kind: 'svg'  },
    both:  { label: 'Both',  make: both,  kind: 'canvas' }
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
