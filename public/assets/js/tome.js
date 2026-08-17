/* ============================================================
   The tome.

   Pages are authored in the HTML as <article class="page-src">.
   This script reads them and assembles a book: two pages per leaf
   on a wide screen, one per leaf on a phone. If it never runs, or
   the reader prefers reduced motion, the articles stay on the page
   and you simply read them.
   ============================================================ */
(function () {
  var root = document.querySelector('[data-tome]');
  if (!root) return;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var source   = root.querySelector('.tome-fallback');
  var articles = [].slice.call(source.querySelectorAll('.page-src'));
  if (articles.length < 2) return;

  var stage, book, canvas, ctx, leaves = [], index = 0, spread = true, busy = false;
  var prevBtn, nextBtn, progress, zonePrev, zoneNext;

  /* ---------------------------------------------------------- build */
  function build() {
    spread = window.matchMedia('(min-width: 821px)').matches;

    root.innerHTML = '';
    root.className = 'tome';
    root.setAttribute('data-tome', '');
    root.dataset.open = '0';
    leaves = [];

    var viewport = el('div', 'tome-viewport');
    stage = el('div', 'tome-stage');
    book  = el('div', 'book');

    var edgeL = el('span', 'edge left'), edgeR = el('span', 'edge right');
    var backCover = el('div', 'back-cover');

    // In spread mode a leaf carries two pages; on a phone it carries one and
    // the verso is never seen, because it swings off the left of the screen.
    var per = spread ? 2 : 1;
    for (var i = 0; i < articles.length; i += per) {
      var leaf = el('div', 'leaf');
      leaf.appendChild(face('front', articles[i]));
      leaf.appendChild(face('back', spread ? articles[i + 1] : null));
      leaf.appendChild(el('span', 'sheen'));
      book.appendChild(leaf);
      leaves.push(leaf);
    }

    book.appendChild(backCover);
    book.appendChild(edgeL);
    book.appendChild(edgeR);
    stage.appendChild(book);

    canvas = el('canvas', 'dust');
    stage.appendChild(canvas);

    viewport.appendChild(stage);

    zonePrev = el('button', 'turn-zone prev');
    zonePrev.setAttribute('aria-label', 'Previous page');
    zoneNext = el('button', 'turn-zone next');
    zoneNext.setAttribute('aria-label', 'Next page');
    viewport.appendChild(zonePrev);
    viewport.appendChild(zoneNext);

    root.appendChild(viewport);

    var controls = el('div', 'tome-controls');
    prevBtn  = button('Back', prev);
    progress = el('span', 'tome-progress');
    nextBtn  = button('Turn the page', next);
    controls.appendChild(prevBtn);
    controls.appendChild(progress);
    controls.appendChild(nextBtn);
    root.appendChild(controls);

    root._edges = { l: edgeL, r: edgeR };
    index = 0;
    layout();
    sizeCanvas();
  }

  function face(side, article) {
    var f = el('div', 'face ' + side);
    if (article && article.dataset.type === 'cover') f.classList.add('cover');
    if (article) {
      var sheet = el('div', article.dataset.type === 'cover' ? 'cover-inner' : 'sheet');
      sheet.innerHTML = article.innerHTML;
      f.appendChild(sheet);
      if (article.dataset.type === 'cover') f.appendChild(el('span', 'cover-dust'));
    }
    return f;
  }

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function button(label, fn) {
    var b = el('button', 'tome-btn'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', fn); return b;
  }

  /* ---------------------------------------------------------- state */
  function layout(skip) {
    var n = leaves.length;
    leaves.forEach(function (leaf, i) {
      if (leaf === skip) return;          // mid-flight, leave it alone
      var flipped = i < index;
      leaf.classList.toggle('flipped', flipped);
      // Unflipped pages stack to the right with the current one on top;
      // flipped ones stack to the left, most recently turned on top.
      leaf.style.zIndex = String(flipped ? i + 1 : n - i + 1);
    });
    // On a phone only the recto is on screen, so the book never slides.
    book.style.setProperty('--shift', (spread && index === 0) ? '-25%' : '0%');
    root.dataset.open = index === 0 ? '0' : '1';
    root._edges.r.style.setProperty('--right', String(1 - index / n));
    root._edges.l.style.setProperty('--left',  String(index / n));

    prevBtn.disabled = zonePrev.disabled = index === 0;
    nextBtn.disabled = zoneNext.disabled = index >= n;
    nextBtn.textContent = index === 0 ? 'Open it' : (index >= n ? 'The end' : 'Turn the page');
    progress.textContent = index === 0 ? 'closed' : index + ' / ' + n;
  }

  function turn(dir) {
    var n = leaves.length;
    var target = index + dir;
    if (busy || target < 0 || target > n) return;
    busy = true;

    var leaf = leaves[dir > 0 ? index : target];
    var fwd = dir > 0;

    leaf.classList.add('turning');
    leaf.style.zIndex = String(leaves.length + 5);     // the turning sheet is on top
    leaf.classList.remove('flipped');
    leaf.classList.add(fwd ? 'turn-fwd' : 'turn-back');

    index = target;
    // everything except the sheet in flight settles into its new place now
    layout(leaf);

    puff(dir, .85);
    setTimeout(function () { puff(dir, .8); },  340);
    setTimeout(function () { puff(dir, .7); },  760);
    setTimeout(function () { puff(dir, .55); }, 1200);

    setTimeout(function () {
      leaf.classList.remove('turning', 'turn-fwd', 'turn-back');
      leaf.style.animation = 'none';
      leaf.offsetHeight;                                 // flush, then rest
      leaf.style.animation = '';
      layout();
      book.classList.add('thump');
      puff(dir, 1.1);                     // the sheet lands and lifts the dust
      setTimeout(function () { book.classList.remove('thump'); }, 520);
      busy = false;
    }, 1900);
  }
  function next() { turn(1); }
  function prev() { turn(-1); }

  /* ---------------------------------------------------------- dust */
  var parts = [], haze = [], raf = null, dpr = 1, sprites = null;

  function makeSprites() {
    // Two motes: a pale one that catches the light and a darker one that
    // reads against the page. Real dust does both; one alone looks like snow.
    function sprite(rgb, soft) {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var g = c.getContext('2d');
      var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(' + rgb + ',1)');
      rg.addColorStop(soft ? 0.18 : 0.42, 'rgba(' + rgb + ',' + (soft ? 0.5 : 0.55) + ')');
      rg.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
      return c;
    }
    sprites = {
      pale: sprite('255,247,228', false),
      dark: sprite('124,100,68', false),
      haze: sprite('158,136,102', true)
    };
  }

  function sizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!sprites) makeSprites();
  }

  function puff(dir, scale) {
    if (!ctx) return;
    scale = scale === undefined ? 1 : scale;
    var r = canvas.getBoundingClientRect();
    var spineX = r.width * 0.5;
    // Lots of very small particles clustered around a few origins reads as a
    // cloud. A few big ones reads as confetti, which is what this used to be.
    var clumps = 5 + Math.round(4 * scale);
    var count = Math.round((spread ? 620 : 420) * scale);
    var origins = [];
    for (var c = 0; c < clumps; c++) {
      origins.push({
        x: spineX + dir * Math.pow(Math.random(), 0.55) * r.width * 0.42,
        y: r.height * (0.10 + Math.random() * 0.80),
        r: r.width * (0.03 + Math.random() * 0.075)
      });
    }

    for (var i = 0; i < count; i++) {
      var o = origins[(Math.random() * origins.length) | 0];
      var ang = Math.random() * 6.283, rad = Math.pow(Math.random(), 0.6) * o.r;
      var speed = (0.25 + Math.random() * 1.5) * (0.55 + scale * 0.55);
      parts.push({
        x: o.x + Math.cos(ang) * rad,
        y: o.y + Math.sin(ang) * rad * 0.8,
        vx: dir * speed * (0.35 + Math.random() * 0.9) + (Math.random() - .5) * 0.75,
        vy: -speed * (0.25 + Math.random() * 0.7),
        s: (1.4 + Math.random() * 4.6) * (spread ? 1 : .85),
        life: 1, decay: 0.0035 + Math.random() * 0.010,
        pale: Math.random() < 0.40,
        a: 0.20 + Math.random() * 0.30
      });
    }
    // the soft body of the cloud, sitting under all those specks
    for (var h = 0; h < Math.round(16 * scale); h++) {
      var oh = origins[(Math.random() * origins.length) | 0];
      haze.push({
        x: oh.x + (Math.random() - .5) * r.width * 0.08,
        y: oh.y + (Math.random() - .5) * r.height * 0.08,
        s: r.width * (0.055 + Math.random() * 0.13),
        grow: 1.7 + Math.random() * 1.5,
        vx: dir * (0.12 + Math.random() * 0.42), vy: -0.09 - Math.random() * 0.16,
        life: 1, decay: 0.0055 + Math.random() * 0.006
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function ambient() {
    if (!ctx || document.hidden) return;
    var r = canvas.getBoundingClientRect();
    if (parts.length < 90) {
      parts.push({
        x: Math.random() * r.width, y: r.height * (0.15 + Math.random() * 0.85),
        vx: (Math.random() - .5) * .25, vy: -0.06 - Math.random() * 0.14,
        s: 1.2 + Math.random() * 2.6, life: .6, decay: 0.0013 + Math.random() * 0.0022,
        pale: Math.random() < 0.5, a: 0.12 + Math.random() * 0.14
      });
      if (!raf) raf = requestAnimationFrame(tick);
    }
  }

  // Without this the cloud gets sliced off in a straight line at the canvas
  // border, which instantly gives the game away.
  function edgeFade(x, y, r) {
    var m = Math.min(r.width, r.height) * 0.14;
    var fx = Math.min(x, r.width - x) / m;
    var fy = Math.min(y, r.height - y) / m;
    return Math.max(0, Math.min(1, Math.min(fx, fy)));
  }

  function tick() {
    raf = null;
    if (!ctx) return;
    var r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    var i, p;
    for (i = haze.length - 1; i >= 0; i--) {
      p = haze[i];
      p.x += p.vx; p.y += p.vy; p.s *= 1 + (p.grow - 1) * 0.012;
      p.life -= p.decay;
      if (p.life <= 0) { haze.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life) * 0.14 * edgeFade(p.x, p.y, r);
      ctx.drawImage(sprites.haze, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }

    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.977; p.vy = p.vy * 0.977 + 0.010;   // drag, then it settles
      p.life -= p.decay;
      if (p.life <= 0 || p.y > r.height * 1.25) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * p.a * edgeFade(p.x, p.y, r);
      ctx.drawImage(p.pale ? sprites.pale : sprites.dark, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    if (parts.length || haze.length) raf = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------- input */
  function wire() {
    root.addEventListener('click', function (e) {
      var z = e.target.closest('.turn-zone');
      if (!z) return;
      z.classList.contains('next') ? next() : prev();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); }
      else return;
      e.preventDefault();
    });

    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 46) (dx < 0 ? next : prev)();
      x0 = null;
    }, { passive: true });

    var mode = window.matchMedia('(min-width: 821px)');
    (mode.addEventListener ? mode.addEventListener.bind(mode, 'change') : mode.addListener.bind(mode))(function () {
      leaves = []; parts = []; build();
    });
    window.addEventListener('resize', debounce(sizeCanvas, 180));
    setInterval(ambient, 900);
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  build();
  wire();
})();
