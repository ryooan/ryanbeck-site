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


    viewport.appendChild(stage);

    zonePrev = el('button', 'turn-zone prev');
    zonePrev.setAttribute('aria-label', 'Previous page');
    zoneNext = el('button', 'turn-zone next');
    zoneNext.setAttribute('aria-label', 'Next page');
    viewport.appendChild(zonePrev);
    viewport.appendChild(zoneNext);

    root.appendChild(viewport);

    // The canvas is a child of .tome, not of the (clipped) stage, so dust can
    // drift off the book and out over the page.
    canvas = el('canvas', 'dust');
    root.appendChild(canvas);

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
    fitSheets();
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

  /* A page that overflows its sheet looks broken, and the content is fixed
     while the book's size isn't. Shrink type until it fits. */
  function fitSheets() {
    root.querySelectorAll('.sheet').forEach(function (sheet) {
      sheet.style.fontSize = '';
      var base = parseFloat(getComputedStyle(sheet).fontSize);
      var size = base, guard = 0;
      while (sheet.scrollHeight > sheet.clientHeight + 1 && guard++ < 14 && size > base * 0.62) {
        size *= 0.955;
        sheet.style.fontSize = size.toFixed(2) + 'px';
      }
    });
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

    startEmitter(dir, 1900);

    setTimeout(function () {
      leaf.classList.remove('turning', 'turn-fwd', 'turn-back');
      leaf.style.animation = 'none';
      leaf.offsetHeight;                                 // flush, then rest
      leaf.style.animation = '';
      layout();
      book.classList.add('thump');
      thumpPuff(dir);                     // the sheet lands and lifts the dust
      setTimeout(function () { book.classList.remove('thump'); }, 520);
      busy = false;
    }, 1900);
  }
  function next() { turn(1); }
  function prev() { turn(-1); }

  /* ---------------------------------------------------------- dust */
  /* Billboard puffs, not points. Dust is a volume — a scatter of dots reads
     as static no matter how small you make it. Each puff is an irregular
     alpha cloud that spawns small at the edge of the moving sheet, grows,
     turns, drifts away from the book and fades. Growth is doing double duty:
     it's also what makes the dust read as coming off the book toward you. */
  var puffs = [], specks = [], raf = null, dpr = 1, sprites = [], emitter = null;

  function loadSprites() {
    for (var i = 1; i <= 4; i++) {
      var im = new Image();
      im.src = 'assets/tome/dust-' + i + '.png';
      sprites.push(im);
    }
  }

  function speckSprite() {
    var c = document.createElement('canvas');
    c.width = c.height = 32;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(122,100,70,1)');
    rg.addColorStop(0.45, 'rgba(122,100,70,0.5)');
    rg.addColorStop(1, 'rgba(122,100,70,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    return c;
  }
  var speckImg = null;

  function sizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!speckImg) speckImg = speckSprite();
  }

  /* Where the book actually is, in canvas coordinates. */
  function geom() {
    var cr = canvas.getBoundingClientRect();
    var br = (root.querySelector('.back-cover') || book).getBoundingClientRect();
    var lr = leaves[0].getBoundingClientRect();
    return {
      w: cr.width, h: cr.height,
      top: br.top - cr.top, bottom: br.bottom - cr.top,
      left: br.left - cr.left, right: br.right - cr.left,
      spine: (spread ? (br.left + br.right) / 2 : lr.left) - cr.left,
      page: lr.width
    };
  }

  function addPuff(x, y, dir, g, opts) {
    opts = opts || {};
    var away = (x - (g.left + g.right) / 2) >= 0 ? 1 : -1;
    puffs.push({
      x: x, y: y,
      sprite: (Math.random() * 4) | 0,
      s: g.page * (0.17 + Math.random() * 0.26) * (opts.big || 1),
      grow: 1.008 + Math.random() * 0.014,
      vx: (dir * (0.5 + Math.random() * 1.5) + away * (0.55 + Math.random() * 1.15)) * (opts.push || 1),
      vy: -(0.42 + Math.random() * 1.05) * (opts.push || 1),
      rot: Math.random() * 6.283,
      spin: (Math.random() - 0.5) * 0.012,
      life: 0, fade: 0.0068 + Math.random() * 0.008,
      peak: 0.11 + Math.random() * 0.15
    });
  }

  function addSpecks(x, y, dir, g, n) {
    for (var i = 0; i < n; i++) {
      specks.push({
        x: x + (Math.random() - .5) * g.page * 0.1,
        y: y + (Math.random() - .5) * g.h * 0.1,
        vx: dir * (0.3 + Math.random() * 1.5) + (Math.random() - .5) * 0.7,
        vy: -(0.25 + Math.random() * 1.1),
        s: 1.1 + Math.random() * 2.4,
        life: 1, decay: 0.006 + Math.random() * 0.012,
        a: 0.16 + Math.random() * 0.24
      });
    }
  }

  /* Emit continuously along the leading edge of the sheet while it turns,
     rather than in a few fixed bursts — the dust then follows the page. */
  function startEmitter(dir, ms) {
    emitter = { dir: dir, t0: performance.now(), ms: ms };
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function emit(now) {
    if (!emitter || !ctx || !leaves.length) return;
    var t = now - emitter.t0;
    if (t > emitter.ms) { emitter = null; return; }

    var g = geom();
    var dir = emitter.dir;

    // read the sheet in flight to find its leading edge
    var turning = root.querySelector('.leaf.turning');
    var ang = 0;
    if (turning) {
      var m = new DOMMatrix(getComputedStyle(turning).transform);
      ang = Math.atan2(m.m13, m.m11);           // 0 .. -pi
    }
    // the free edge of the sheet, which is where the dust actually comes off
    var edge = g.spine + Math.cos(ang) * g.page * dir;

    var burst = t < 240 ? 2.0 : (t > emitter.ms - 300 ? 1.7 : 0.8);
    var n = Math.random() < burst % 1 ? Math.ceil(burst) : Math.floor(burst);
    for (var i = 0; i < n; i++) {
      var y = g.top + (0.06 + Math.random() * 0.88) * (g.bottom - g.top);
      var x = edge + (Math.random() - .5) * g.page * 0.16;
      addPuff(x, y, dir, g, { big: 0.8 + Math.random() * 0.7 });
    }
    addSpecks(edge, g.top + Math.random() * (g.bottom - g.top), dir, g, 2);
  }

  function thumpPuff(dir) {
    if (!ctx) return;
    var g = geom();
    for (var i = 0; i < 10; i++) {
      var y = g.top + (0.05 + Math.random() * 0.9) * (g.bottom - g.top);
      var x = g.spine + dir * Math.random() * g.page * 0.9;
      addPuff(x, y, dir, g, { big: 1.1 + Math.random() * 0.9, push: 1.4 });
    }
    addSpecks(g.spine + dir * g.page * 0.4, g.bottom - (g.bottom - g.top) * 0.2, dir, g, 26);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function ambient() {
    if (!ctx || document.hidden || !leaves.length) return;
    var g = geom();
    if (puffs.length < 4 && Math.random() < 0.5) {
      addPuff(g.left + Math.random() * (g.right - g.left),
              g.top + Math.random() * (g.bottom - g.top), 0, g, { big: 0.7, push: 0.25 });
      puffs[puffs.length - 1].peak *= 0.30;
      puffs[puffs.length - 1].fade *= 0.4;
    }
    if (specks.length < 14) addSpecks(g.left + Math.random() * (g.right - g.left),
                                      g.top + Math.random() * (g.bottom - g.top), 0, g, 3);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Without this the cloud gets sliced off in a straight line at the canvas
  // border, which instantly gives the game away.
  function edgeFade(x, y, r) {
    var m = Math.min(r.w, r.h) * 0.16;
    return Math.max(0, Math.min(1, Math.min(Math.min(x, r.w - x), Math.min(y, r.h - y)) / m));
  }

  function tick(now) {
    raf = null;
    if (!ctx) return;
    var r = { w: canvas.getBoundingClientRect().width, h: canvas.getBoundingClientRect().height };
    ctx.clearRect(0, 0, r.w, r.h);

    emit(now || performance.now());

    var i, p;
    for (i = puffs.length - 1; i >= 0; i--) {
      p = puffs[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.991; p.vy = p.vy * 0.991 + 0.004;
      p.s *= p.grow; p.rot += p.spin;
      p.life += p.fade;
      if (p.life >= 1) { puffs.splice(i, 1); continue; }
      // fade in over the first fifth of its life, then out
      var k = p.life < 0.2 ? p.life / 0.2 : 1 - (p.life - 0.2) / 0.8;
      var img = sprites[p.sprite];
      if (!img || !img.complete || !img.naturalWidth) continue;
      ctx.globalAlpha = k * p.peak * edgeFade(p.x, p.y, r);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }

    for (i = specks.length - 1; i >= 0; i--) {
      p = specks[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.978; p.vy = p.vy * 0.978 + 0.010;
      p.life -= p.decay;
      if (p.life <= 0) { specks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life) * p.a * edgeFade(p.x, p.y, r);
      ctx.drawImage(speckImg, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }

    ctx.globalAlpha = 1;
    if (puffs.length || specks.length || emitter) raf = requestAnimationFrame(tick);
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
    window.addEventListener('resize', debounce(function () { sizeCanvas(); fitSheets(); }, 180));
    setInterval(ambient, 900);
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  loadSprites();
  build();
  wire();
})();
