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
  var RES = 0.7;                        // dust canvas backing-store scale
  /* All the physics below is written in per-frame units that were tuned at
     60fps. DT rescales them to real elapsed time, so a 144Hz monitor gets the
     same cloud as a 60Hz phone instead of one 2.4x faster and 2.4x denser.
     Set once per animation frame; clamped so a background-tab stall cannot
     teleport particles. */
  var DT = 1;
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

  /* Where dust is allowed to be born: the visible book, not the layout box.
     StPageFlip's .stf__block is always the full open spread, so a closed book
     fills only half of it — spawning across the block puts dust on the empty
     paper beside the cover. The leather boards track the visible book
     exactly (there are two in landscape, and the left one is opacity:0
     whenever there is no book under it), so their visible union is the
     spawn box; the block is only the fallback for hosts without boards
     (the dust lab). */
  function spawnBoxReader(bookEl) {
    var boardEls = bookEl.parentElement ?
      bookEl.parentElement.querySelectorAll('.libtome-boards') : [];
    return function (rect) {
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (var i = 0; i < boardEls.length; i++) {
        if (boardEls[i].style.opacity === '0') continue;
        var r = boardEls[i].getBoundingClientRect();
        if (!r.width) continue;
        if (r.left < x0) x0 = r.left;
        if (r.right > x1) x1 = r.right;
        if (r.top < y0) y0 = r.top;
        if (r.bottom > y1) y1 = r.bottom;
      }
      if (x1 <= x0) {
        var el = bookEl.querySelector('.stf__block') || bookEl;
        var br = el.getBoundingClientRect();
        if (!br.width) return null;
        x0 = br.left; x1 = br.right; y0 = br.top; y1 = br.bottom;
      }
      return {
        x0: x0 - rect.left, x1: x1 - rect.left,
        y0: y0 - rect.top, y1: y1 - rect.top
      };
    };
  }

  function clampX(f, x) {
    if (!(f.bx1 > f.bx0)) return x;
    return Math.max(f.bx0, Math.min(f.bx1, x));
  }

  /* ------------------------------------------------------- the fold signal */
  function foldReader(bookEl) {
    var prev = null, lastDir = -1;   // -1 = forward (the crease sweeps left)
    var box = spawnBoxReader(bookEl);
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
      // the crease can be momentarily still at the very start and end of a
      // turn, so the direction is remembered rather than recomputed each frame
      if (Math.abs(v) > 0.2) lastDir = v < 0 ? -1 : 1;
      var b2 = box(rect);
      return {
        x: x, top: top, bottom: bot, v: v, h: Math.max(1, bot - top), hard: !clipped,
        dir: lastDir,
        bx0: b2 ? b2.x0 : 0, bx1: b2 ? b2.x1 : 0,
        by0: b2 ? b2.y0 : top, by1: b2 ? b2.y1 : bot
      };
    };
  }

  /* Every turn gets its own gust: a preferred direction, a strength, a
     density and a size scale. Without this, each flip throws an identical
     cloud and the repetition is obvious after three or four turns. */
  function makeGust() {
    var a = Math.random() * 6.283;
    return {
      gx: Math.cos(a), gy: Math.sin(a) * 0.8 - 0.25,   // leans upward on average
      lean: 0.25 + Math.random() * 0.85,
      rate: 0.72 + Math.random() * 0.75,
      size: 0.78 + Math.random() * 0.66,
      spread: 0.8 + Math.random() * 1.1,
      yBias: 0.25 + Math.random() * 0.9,
      life: 0.8 + Math.random() * 0.55
    };
  }
  var FLAT_GUST = makeGust();

  /* Dust does not get dragged along behind the page — the page slaps the air
     and it goes everywhere. A full circle of directions, the rightward half
     damped but not suppressed, only a small share of the crease's own motion,
     and this turn's gust laid over the top. */
  function throwVel(f, base, follow) {
    var g = f.gust || FLAT_GUST;
    var sp = base * g.spread * (0.25 + Math.pow(Math.random(), 0.5) * 2.1);

    if (follow) {
      // Thrown along the way the page is going, in a cone rather than a line,
      // so it looks pushed by the sheet instead of merely blown about.
      var dir = f.dir || -1;
      var a = (dir > 0 ? 0 : Math.PI) + rnd(-0.72, 0.72);
      return {
        vx: Math.cos(a) * sp * 1.15 + f.v * 0.16 + rnd(-0.2, 0.2),
        vy: Math.sin(a) * sp * 0.8 + g.gy * g.lean * sp * 0.3 + rnd(-0.2, 0.1)
      };
    }

    var ang = Math.random() * 6.283;
    var cx = Math.cos(ang), sy = Math.sin(ang);
    if (cx > 0) cx *= 0.45;
    return {
      vx: cx * sp + g.gx * g.lean * sp * 0.55 + f.v * 0.14 + rnd(-0.3, 0.3),
      vy: sy * sp + g.gy * g.lean * sp * 0.55 + rnd(-0.25, 0.15)
    };
  }

  /* where along the page edge a particle is born — varies per turn, and
     always on the book itself */
  function spawnY(f) {
    var g = f.gust || FLAT_GUST;
    var y = f.top + Math.pow(Math.random(), g.yBias) * f.h;
    if (f.by1 > f.by0) y = Math.max(f.by0, Math.min(f.by1, y));
    return y;
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
      emit: function (f, power, k) {
        // Fine and numerous rather than few and large — a handful of big
        // sprites reads as bubbles no matter how you fade them.
        var g = f.gust || FLAT_GUST;
        var n = Math.round(rnd(9, 21) * power * AMOUNT * g.rate * (k || 1));
        if (ps.length > 900) ps.splice(0, ps.length - 900);
        for (var i = 0; i < n; i++) {
          var y = spawnY(f);
          var v = throwVel(f, 1.15);
          ps.push({
            x: clampX(f, f.x + rnd(-9, 9)), y: y,
            vx: v.vx, vy: v.vy,
            s: rnd(3.5, 17) * (0.75 + power * 0.4) * g.size,
            grow: rnd(1.003, 1.013),
            rot: rnd(0, 6.28), spin: rnd(-0.014, 0.014),
            life: 0, fade: rnd(0.006, 0.017) / g.life,
            peak: rnd(0.06, 0.17),
            img: (Math.random() * sprites.length) | 0
          });
        }
      },
      frame: function (t, skipClear) {
        if (!skipClear) ctx.clearRect(0, 0, W, H);
        var drag = Math.pow(0.992, DT);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          p.x += p.vx * DT; p.y += p.vy * DT;
          p.vx *= drag; p.vy = p.vy * drag + 0.0022 * DT;
          p.s *= Math.pow(p.grow, DT); p.rot += p.spin * DT; p.life += p.fade * DT;
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
      emit: function (f, power, k) {
        var n = Math.round(rnd(3, 7) * power * AMOUNT * (k || 1));
        for (var i = 0; i < n; i++) {
          var y = f.top + Math.pow(Math.random(), 0.75) * f.h;
          ps.push({
            x: clampX(f, f.x + rnd(-8, 8)), y: y,
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
        var drag = Math.pow(0.985, DT);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          var c = curl(p.x * 0.012 + p.seedx, p.y * 0.012 + p.seedy, t * 0.00016);
          p.vx += c[0] * 0.5 * DT; p.vy += c[1] * 0.5 * DT;
          p.x += p.vx * DT; p.y += p.vy * DT;
          p.vx *= drag; p.vy = p.vy * drag + 0.005 * DT;
          p.s *= Math.pow(p.grow, DT); p.life += p.fade * DT;
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
        // blur smears neighbors together so the blobs stop reading as blobs
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
     Two layers on one canvas. The body: sparse, large, very faint soft
     blobs that overlap into a slow billowing cloud. The grain: fine
     motes hanging inside that cloud, catching the light. Both are
     advected by the same curl-noise field, slowly — dust hangs, it does
     not dart.
     ===================================================================== */
  var softSprite = null;
  function makeSoftSprite() {
    if (softSprite) return softSprite;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(111,90,62,0.85)');
    r.addColorStop(0.45, 'rgba(111,90,62,0.38)');
    r.addColorStop(1, 'rgba(111,90,62,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    softSprite = c;
    return c;
  }

  function mist(ctx, W, H) {
    var ps = [];
    var soft = makeSoftSprite();
    return {
      emit: function (f, power, k) {
        var g = f.gust || FLAT_GUST;
        var n = Math.round(rnd(60, 130) * power * AMOUNT * g.rate * (k || 1));
        if (ps.length > 6500) ps.splice(0, ps.length - 6500);
        var hasBox = f.bx1 > f.bx0;
        // A swinging cover is a dusty surface in motion: what sits on its
        // face gets carried with the board and flung off, hardest at the
        // fore-edge, which moves the fastest (it is the far end of the
        // lever). The hinge is the spine — the near edge of the spawn box,
        // since the boards hug the closed half during a cover flip.
        var onCover = f.hard && hasBox && Math.abs(f.v) > 0.05;
        for (var i = 0; i < n; i++) {
          var x, y, vx, vy, u;
          var v = throwVel(f, 0.85, Math.random() < 0.7);
          // about a quarter of the emission is cloud body: big, soft, very
          // faint, even slower than the grain, with a touch of lift
          var body = Math.random() < 0.25;
          if (onCover && Math.random() < 0.55) {
            // born on the moving board itself, between hinge and fore-edge,
            // biased outward; carried with the board (share of the edge's
            // own velocity grows with distance from the hinge) and flung
            // slightly up and off. Deliberately NOT clamped to the box —
            // the board is legitimately outside it mid-swing.
            u = Math.sqrt(Math.random());
            x = f.bx0 + (f.x - f.bx0) * u;
            y = f.top + Math.random() * f.h;
            var carry = Math.max(-5, Math.min(5, f.v * u * 0.5));
            vx = carry + v.vx * 0.35;
            vy = v.vy * 0.35 - u * rnd(0.05, 0.5);
          } else {
            // Dust lifts off the whole sheet, not just the crease: about
            // half comes off the fold, the rest from anywhere across the
            // spread. Density per unit width is what the eye reads, not the
            // split — the crease band is a tenth of the book's width, so
            // giving it much more than a tenth of the particles makes it a
            // stripe. Every spawn is clamped to the spawn box — dust is
            // born ON the book and billows outward; it never pops into
            // being beside it.
            if (!hasBox) x = f.x + rnd(-30, 30);
            else if (Math.random() < 0.16) x = clampX(f, f.x + rnd(-30, 30));
            else x = rnd(f.bx0, f.bx1);
            y = f.top + Math.random() * f.h;
            if (f.by1 > f.by0) y = Math.max(f.by0, Math.min(f.by1, y));
            // most of it is thrown the way the page is traveling, the rest
            // goes wherever it likes. The 0.32 is the overall speed of the
            // effect: dust drifts, it does not fly.
            vx = v.vx * (body ? 0.22 : 0.32);
            vy = v.vy * (body ? 0.22 : 0.32) - (body ? 0.06 : 0);
          }
          ps.push({
            x: x, y: y,
            vx: vx, vy: vy,
            cx: 0, cy: 0, off: (Math.random() * 3) | 0,
            body: body,
            // grain sizes vary per mote — mostly fine, the odd fleck;
            // body blobs are an order larger and grow gently as they thin
            s: body ? rnd(6, 18) * (0.8 + g.size * 0.35)
                    : (0.55 + Math.pow(Math.random(), 1.6) * 2.4) * (0.8 + g.size * 0.35),
            grow: body ? 1.0016 : 1,
            life: 1, decay: rnd(0.0010, 0.0032) / g.life / (body ? 1.3 : 1),
            fi: 0,
            a: body ? rnd(0.05, 0.12) : rnd(0.12, 0.4),
            pale: !body && Math.random() < 0.4
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
        var drag = Math.pow(0.9955, DT);
        var bodies = [];
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          // curl noise is four noise lookups a go; at three thousand motes
          // that is the whole frame budget. Each particle refreshes its own
          // flow vector every third frame and coasts on it in between.
          // The field itself evolves slowly and at a large scale — small
          // fast eddies are what made the motes read as gnats.
          if (((tick3 + p.off) % 3) === 0) {
            var c = curl(p.x * 0.013, p.y * 0.013, t * 0.00012);
            p.cx = c[0]; p.cy = c[1];
          }
          p.vx += p.cx * 0.30 * DT; p.vy += p.cy * 0.30 * DT;
          p.x += p.vx * DT; p.y += p.vy * DT;
          p.vx *= drag; p.vy = p.vy * drag + 0.0007 * DT;
          if (p.grow !== 1) p.s *= Math.pow(p.grow, DT);
          p.life -= p.decay * DT;
          if (p.life <= 0) { ps.splice(i, 1); continue; }
          // a slow ramp-in (about half a second) so a mote condenses into
          // view instead of popping
          if (p.fi < 1) p.fi = Math.min(1, p.fi + 0.035 * DT);
          var a = p.life * p.fi * p.a * edgeFade(p.x, p.y, W, H);
          if (a <= 0.008) continue;
          if (p.body) { p.dA = a; bodies.push(p); continue; }
          var b = Math.min(B - 1, (a * B) | 0) + (p.pale ? B : 0);
          (buckets[b] || (buckets[b] = [])).push(p);
        }

        // the cloud body first, so the grain reads as motes inside it
        for (var k2 = 0; k2 < bodies.length; k2++) {
          var q2 = bodies[k2];
          ctx.globalAlpha = q2.dA;
          ctx.drawImage(soft, q2.x - q2.s / 2, q2.y - q2.s / 2, q2.s, q2.s);
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
      emit: function (f, power, k) {
        if (live > 44) return;
        var n = Math.round(rnd(2, 4.2) * power * AMOUNT * (k || 1));
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
      emit: function (f, power, k) { a.emit(f, power * 0.8, k); b.emit(f, power * 0.65, k); },
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
        // The dust surface is deliberately much larger than the book so the
        // cloud can drift well clear of it, which makes clearing and filling
        // it the main per-frame cost. Rendering at 0.7 and letting CSS scale
        // up halves that, and on something this soft it is invisible.
        var canvas = el('canvas');
        canvas.width = Math.round(W * RES); canvas.height = Math.round(H * RES);
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        host.appendChild(canvas);
        var c2 = canvas.getContext('2d');
        c2.scale(RES, RES);
        engine = spec.make(c2, W, H);
      } else {
        engine = spec.make(host, W, H);
      }
    }

    var read = foldReader(bookEl);
    var readBox = spawnBoxReader(bookEl);
    var raf = null, idleAfter = 0, alive = 0, gust = makeGust(), lastFold = null;
    /* Emission is a short, timeboxed event, not a state. A turn OPENS a
       window (~1s for a cover, ~0.55s for a page); inside it the per-frame
       tracker spawns dust off the moving fold, and when it closes the cloud
       just drifts and thins. Hovering a page corner raises a fold too, and
       holding a drag half-turned keeps one alive — neither may spawn:
       without the window, a fold emits nothing. */
    var emitUntil = 0, powerScale = 1, lastWindow = -9999;

    /* Which way the turn is going, taken from the call rather than inferred.
       Crease motion tells you eventually, but the opening burst fires before
       the sheet has moved, so inference there returns the *previous* turn's
       direction and the first and biggest puff goes the wrong way. Dragging a
       corner still falls back to the crease. */
    var intent = 0;
    if (flip && typeof flip.flipNext === 'function') {
      var fn = flip.flipNext.bind(flip), fp = flip.flipPrev.bind(flip);
      flip.flipNext = function (c) { intent = -1; return fn(c); };
      flip.flipPrev = function (c) { intent = 1;  return fp(c); };
    }

    var lastT = 0;
    function loop(t) {
      raf = null;
      if (!engine) return;
      // real elapsed time, in 60fps frames. Clamped: a fresh kick or a
      // background-tab stall must not become one giant step.
      DT = lastT ? Math.min(3, Math.max(0.25, (t - lastT) / 16.667)) : 1;
      lastT = t;
      var f = read(host.getBoundingClientRect());
      if (f) {
        if (intent) f.dir = intent;
        lastFold = f;
        f.gust = gust;
        if (t < emitUntil) {
          // a hard board seen mid-window means this turn is a cover after
          // all — restore full power even if the burst guessed page
          if (f.hard) powerScale = 1;
          // emission is once per frame, so the count scales by DT too — the
          // same motes per second at any refresh rate
          engine.emit(f, Math.min(1.6, 0.35 + Math.abs(f.v) * 0.12) * powerScale, DT);
        }
        idleAfter = t + 2600;
      }
      alive = engine.frame(t || 0);
      if (f || alive || t < idleAfter) raf = requestAnimationFrame(loop);
      else lastT = 0;
    }
    function kick() { if (!raf) { lastT = 0; raf = requestAnimationFrame(loop); } }

    /* A burst the moment a flip starts, independent of the per-frame
       tracking. Hard covers and backward flips move differently and the
       tracker can miss the first frames of them; this guarantees that every
       flip of any kind visibly raises dust. */
    function burst() {
      if (!engine) return;
      var hr = host.getBoundingClientRect();
      // The fallback box is the VISIBLE book (boards, or block failing that),
      // not the layout block — a closed book fills half its block, and a
      // burst spread across the block puts dust on the empty paper beside it.
      var bb = readBox(hr);
      var f = read(hr);
      if (!f) {
        if (!bb) return;
        f = {
          x: (bb.x0 + bb.x1) / 2,
          top: bb.y0, bottom: bb.y1,
          h: Math.max(1, bb.y1 - bb.y0),
          v: 0
        };
      }
      // Without the book box the whole burst piles into the crease band, and
      // since the burst is the first thing on screen the entire effect reads
      // as a narrow vertical strip.
      if (!(f.bx1 > f.bx0) && bb) { f.bx0 = bb.x0; f.bx1 = bb.x1; f.by0 = bb.y0; f.by1 = bb.y1; }
      if (intent) f.dir = intent;
      f.gust = gust;
      for (var i = 0; i < 7; i++) engine.emit(f, 1.15 * powerScale, 1);
      kick();
    }

    if (flip && flip.on) {
      flip.on('changeState', function (e) {
        // Only a real turn opens the window: 'flipping' (a click or a
        // released drag) or 'user_fold' (a drag in progress). 'fold_corner'
        // is the corner lifting under a hovering pointer — no dust.
        if (e.data !== 'flipping' && e.data !== 'user_fold') return;
        var now = performance.now();
        // one window per gesture: the user_fold -> flipping transition of a
        // single drag-and-release must not double up
        if (now - lastWindow < 1400) return;
        lastWindow = now;
        // covers get the full treatment, page turns half of it. Opening is
        // current page 0; closing is page 1 heading backward (button path —
        // a click-started close corrects itself via f.hard mid-window).
        var idx = flip.getCurrentPageIndex ? flip.getCurrentPageIndex() : 0;
        var cover = idx === 0 || (idx === 1 && intent === 1);
        powerScale = cover ? 1 : 0.5;
        emitUntil = now + (cover ? 1000 : 550);
        gust = makeGust();            // a fresh gust for every turn
        burst();
      });
      flip.on('flip', function () { intent = 0; kick(); });
    }

    rebuild();
    return {
      kick: kick,
      rebuild: rebuild,
      alive: function () { return alive; },
      lastFold: function () { return lastFold; },
      clear: function () { if (engine && engine.clear) engine.clear(); },
      setAmount: function (v) { AMOUNT = v; }
    };
  }

  window.BookDust = {
    attach: attach,
    strategies: STRATEGIES,
    setAmount: function (v) { AMOUNT = v; }
  };
})();
