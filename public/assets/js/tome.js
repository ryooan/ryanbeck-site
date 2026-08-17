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
  function layout() {
    var n = leaves.length;
    leaves.forEach(function (leaf, i) {
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
    leaf.classList.add('turning');
    index = target;
    layout();

    puff(dir, .9);
    setTimeout(function () { puff(dir, .7); }, 330);
    setTimeout(function () { puff(dir, .5); }, 700);

    setTimeout(function () {
      leaf.classList.remove('turning');
      book.classList.add('thump');
      puff(dir, 1);                       // the sheet lands and lifts the dust
      setTimeout(function () { book.classList.remove('thump'); }, 520);
      busy = false;
    }, 1250);
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
      rg.addColorStop(soft ? 0.35 : 0.5, 'rgba(' + rgb + ',0.6)');
      rg.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
      return c;
    }
    sprites = {
      pale: sprite('255,247,228', false),
      dark: sprite('124,100,68', false),
      haze: sprite('146,122,88', true)
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
    var count = Math.round((spread ? 150 : 105) * scale);

    for (var i = 0; i < count; i++) {
      // most of it comes off the spine and the leading edge of the sheet
      var t = Math.pow(Math.random(), 0.6);
      var x = spineX + dir * t * r.width * 0.44 * (Math.random() < .82 ? 1 : -0.35);
      var y = r.height * (0.10 + Math.random() * 0.82);
      var speed = (0.6 + Math.random() * 3.1) * (0.6 + scale * 0.6);
      parts.push({
        x: x, y: y,
        vx: dir * speed * (0.45 + Math.random()) + (Math.random() - .5) * 1.3,
        vy: -speed * (0.3 + Math.random() * 0.85),
        s: (3 + Math.random() * 13) * (spread ? 1 : .8),
        life: 1, decay: 0.0035 + Math.random() * 0.009,
        pale: Math.random() < 0.45,
        a: 0.20 + Math.random() * 0.34
      });
    }
    // a slow cloud that hangs where the page was
    for (var h = 0; h < Math.round(4 * scale); h++) {
      haze.push({
        x: spineX + dir * Math.random() * r.width * 0.3,
        y: r.height * (0.2 + Math.random() * 0.6),
        s: r.width * (0.10 + Math.random() * 0.16),
        grow: 1 + Math.random() * 0.9,
        vx: dir * (0.2 + Math.random() * 0.6), vy: -0.12 - Math.random() * 0.2,
        life: 1, decay: 0.006 + Math.random() * 0.006
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function ambient() {
    if (!ctx || document.hidden) return;
    var r = canvas.getBoundingClientRect();
    if (parts.length < 46) {
      parts.push({
        x: Math.random() * r.width, y: r.height * (0.15 + Math.random() * 0.85),
        vx: (Math.random() - .5) * .25, vy: -0.06 - Math.random() * 0.14,
        s: 3 + Math.random() * 7, life: .6, decay: 0.0013 + Math.random() * 0.0022,
        pale: Math.random() < 0.5, a: 0.16 + Math.random() * 0.16
      });
      if (!raf) raf = requestAnimationFrame(tick);
    }
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
      ctx.globalAlpha = Math.max(0, p.life) * 0.11;
      ctx.drawImage(sprites.haze, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }

    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.982; p.vy = p.vy * 0.982 + 0.014;   // drag, then it settles
      p.life -= p.decay;
      if (p.life <= 0 || p.y > r.height * 1.25) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * p.a;
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
