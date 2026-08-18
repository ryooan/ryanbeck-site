/* ============================================================
   The library build.

   StPageFlip (page-flip) does the book: fold geometry, shadows,
   drag-a-corner, portrait/landscape switching.
   tsParticles does the dust: image-shape particles with life,
   wobble and rotation, spawned by emitters that are added when a
   flip starts and expire on their own.

   Same page content and same textures as the hand-built version —
   the articles are read out of the HTML exactly the same way.
   ============================================================ */
(function () {
  var root = document.querySelector('[data-tome-lib]');
  if (!root || !window.LibTome) return;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var PageFlip = window.LibTome.PageFlip;
  var tsParticles = window.LibTome.tsParticles;

  var source   = root.querySelector('.tome-fallback');
  var articles = [].slice.call(source.querySelectorAll('.page-src'));
  if (!articles.length) return;

  /* ---------------------------------------------------- markup */
  root.innerHTML = '';
  root.className = 'libtome';

  var stage  = document.createElement('div'); stage.className = 'libtome-stage';
  var verso  = document.createElement('div'); verso.className = 'libtome-verso';
  var boards = document.createElement('div'); boards.className = 'libtome-boards';
  var bookEl = document.createElement('div'); bookEl.className = 'libtome-book';
  var dustEl = document.createElement('div'); dustEl.className = 'libtome-dust'; dustEl.id = 'libtome-dust';

  articles.forEach(function (a, i) {
    var page = document.createElement('div');
    page.className = 'page';
    // StPageFlip treats "hard" pages as covers: they turn as boards, not paper
    if (i === 0 || i === articles.length - 1) page.setAttribute('data-density', 'hard');
    if (a.dataset.type) page.setAttribute('data-type', a.dataset.type);
    var sheet = document.createElement('div');
    sheet.className = a.dataset.type === 'cover' ? 'cover-inner' : 'sheet';
    sheet.innerHTML = a.innerHTML;
    page.appendChild(sheet);
    bookEl.appendChild(page);
  });

  var shield = document.createElement('div'); shield.className = 'libtome-shield';

  stage.appendChild(boards);
  stage.appendChild(verso);
  stage.appendChild(bookEl);
  stage.appendChild(shield);
  stage.appendChild(dustEl);
  root.appendChild(stage);

  var controls = document.createElement('div');
  controls.className = 'tome-controls';
  var prevBtn = btn('Back'), progress = document.createElement('span'), nextBtn = btn('Turn the page');
  progress.className = 'tome-progress';
  controls.appendChild(prevBtn); controls.appendChild(progress); controls.appendChild(nextBtn);
  root.appendChild(controls);

  /* same trick as the hand-built version: the content is fixed and the page
     size isn't, so shrink type until it fits */
  function fitSheets() {
    var blk = bookEl.querySelector('.stf__block');
    if (!blk) return;
    var r = blk.getBoundingClientRect();
    if (!r.width) return;
    var pw = flip.getOrientation() === 'landscape' ? r.width / 2 : r.width;
    // hidden pages measure as zero, so the base size comes from geometry
    root.style.setProperty('--sheet-fs', (pw * 0.0385).toFixed(2) + 'px');
    // then anything on screen that still overruns gets nudged down
    root.querySelectorAll('.sheet').forEach(function (sh) {
      if (!sh.clientHeight) return;
      sh.style.fontSize = '';
      var size = parseFloat(getComputedStyle(sh).fontSize), guard = 0;
      while (sh.scrollHeight > sh.clientHeight + 1 && guard++ < 14) {
        size *= 0.955; sh.style.fontSize = size.toFixed(2) + 'px';
      }
    });
  }

  function btn(label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tome-btn'; b.textContent = label;
    return b;
  }

  /* ---------------------------------------------------- the book */
  var portrait = window.matchMedia('(max-width: 820px)').matches;

  var flip = new PageFlip(bookEl, {
    width: 420,
    height: 580,
    size: 'stretch',
    minWidth: 200,
    maxWidth: 620,
    minHeight: 280,
    maxHeight: 860,
    showCover: true,
    usePortrait: true,
    mobileScrollSupport: false,
    drawShadow: true,
    maxShadowOpacity: 0.55,
    flippingTime: 1100,
    showPageCorners: true,
    swipeDistance: 24,
    clickEventForward: true,
    useMouseEvents: true
  });

  flip.loadFromHTML(bookEl.querySelectorAll('.page'));

  /* Which page the turn is heading for. The stage slides sideways when the
     book opens, and if that is driven off the 'flip' event it happens after
     the cover has finished swinging — the book lurches. Knowing the target up
     front lets the slide run alongside the cover. */
  var navIntent = 0;
  var _fn = flip.flipNext.bind(flip), _fp = flip.flipPrev.bind(flip);
  flip.flipNext = function (c) { navIntent = 1;  return _fn(c); };
  flip.flipPrev = function (c) { navIntent = -1; return _fp(c); };

  /* Clicking a page (clickEventForward) and dragging a corner start flips
     inside StPageFlip without ever calling flipNext/flipPrev, so navIntent
     stays 0 for them — and everything driven off the predicted target (the
     boards, is-open, the left-of-spine mask) then runs a whole cover-swing
     late. The half of the book the pointer went down on is the intent. */
  var clickIntent = 0;
  stage.addEventListener('pointerdown', function (e) {
    var blk = bookEl.querySelector('.stf__block');
    if (!blk) return;
    var b = blk.getBoundingClientRect();
    if (e.clientY < b.top - 24 || e.clientY > b.bottom + 24) return;
    clickIntent = e.clientX >= b.left + b.width / 2 ? 1 : -1;
  }, true);

  /* StPageFlip shows a closed book as a single page inside a full-width
     block, so the boards have to follow the *visible* half rather than the
     block, or a closed book looks twice as wide as it is. */
  function sizeBoards(targetIdx) {
    var blk = bookEl.querySelector('.stf__block') || bookEl;
    var b = blk.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!b.width) return;

    var idx = targetIdx === undefined ? flip.getCurrentPageIndex() : targetIdx;
    var n = flip.getPageCount();
    var landscape = flip.getOrientation() === 'landscape';
    var open = idx > 0 && idx < n - 1;
    var half = landscape && !open;

    var w = half ? b.width / 2 : b.width;
    var x = b.left - s.left + (half && idx === 0 ? b.width / 2 : 0);
    var top = b.top - s.top - b.height * 0.013;
    var hgt = b.height * 1.026;

    root.classList.toggle('is-open', open);

    if (!landscape && open) {
      // portrait, open: the verso and the left board carry on off the screen.
      // It stays blank — repeating the page you just read as a cropped sliver
      // reads as a glitch, not as a spread.
      verso.style.left   = (x - b.width) + 'px';
      verso.style.top    = (b.top - s.top) + 'px';
      verso.style.width  = b.width + 'px';
      verso.style.height = b.height + 'px';

      boards.style.left  = (x - b.width - w * 0.016) + 'px';
      boards.style.width = (b.width + w * 1.032) + 'px';
    } else {
      boards.style.left  = (x - w * 0.016) + 'px';
      boards.style.width = (w * 1.032) + 'px';
    }
    boards.style.top    = top + 'px';
    boards.style.height = hgt + 'px';
  }

  var LAST = 0;   // the last page of content; the page after it is the board
  function status() {
    var i = flip.getCurrentPageIndex(), n = flip.getPageCount();
    LAST = n - 2;
    progress.textContent = i === 0 ? 'closed' : i + ' / ' + LAST;
    nextBtn.textContent = i === 0 ? 'Open it' : (i >= LAST ? 'The end' : 'Turn the page');
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= LAST;
    sizeBoards();
    fitSheets();
    placeShield();
    maskLeftPage();
  }

  prevBtn.addEventListener('click', function () { flip.flipPrev(); });
  nextBtn.addEventListener('click', function () {
    if (flip.getCurrentPageIndex() < LAST) flip.flipNext();
  });
  /* In portrait, StPageFlip keeps the page you just left rendered on the left
     while the turn is in flight, so its text shows for a moment and then
     vanishes when the blank verso takes over. Hide any settled page sitting
     left of the spine — the sheet actually in flight (z-index 5) is left
     alone, so it still swings across properly.

     In landscape the left half needs policing too, but only around the
     covers: when the book is closed, or a flip is heading for closed,
     StPageFlip parks a settled page left of the spine where there is no book
     at all — a pale ghost beside the closed cover at load, and a full-width
     sheet of leather that sits under the whole closing swing. Nothing
     settled may render left of the spine in either state. */
  var maskTarget = null;   // predicted destination page while a flip is in flight
  function maskLeftPage() {
    var blk = bookEl.querySelector('.stf__block');
    if (!blk) return;
    var b = blk.getBoundingClientRect();
    var items = bookEl.querySelectorAll('.stf__item');
    var i, it, r, sheet, pastSpine, flying;

    if (flip.getOrientation() === 'landscape') {
      var closedish = maskTarget === 0 ||
                      (maskTarget === null && flip.getCurrentPageIndex() === 0);
      var spine = b.left + b.width / 2;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        sheet = it.querySelector('.sheet, .cover-inner');
        if (it.style.display === 'none') {
          it.style.visibility = '';
          if (sheet) sheet.style.visibility = '';
          continue;
        }
        r = it.getBoundingClientRect();
        pastSpine = (r.left + r.width / 2) < spine - 2;
        flying = (+it.style.zIndex || 0) >= 5;
        it.style.visibility = (closedish && pastSpine && !flying) ? 'hidden' : '';
        if (sheet) sheet.style.visibility = '';
      }
      return;
    }

    for (i = 0; i < items.length; i++) {
      it = items[i];
      sheet = it.querySelector('.sheet, .cover-inner');
      if (it.style.display === 'none') {
        it.style.visibility = '';
        if (sheet) sheet.style.visibility = '';
        continue;
      }
      r = it.getBoundingClientRect();
      pastSpine = (r.left + r.width / 2) < b.left + 2;
      flying = (+it.style.zIndex || 0) >= 5;

      // a settled page on the left has no business being there at all
      it.style.visibility = (pastSpine && !flying) ? 'hidden' : '';

      // the sheet in flight keeps its paper but drops its text once it is
      // past the spine, so it lands blank and matches the verso instead of
      // its words popping out of existence when StPageFlip hides it
      if (sheet) sheet.style.visibility = (pastSpine && flying) ? 'hidden' : '';
    }
  }
  var maskRaf = null;
  function maskLoop() {
    maskRaf = null;
    maskLeftPage();
    if (busyUntil > Date.now()) maskRaf = requestAnimationFrame(maskLoop);
  }
  var busyUntil = 0;

  /* At the last page, cover the forward half of the book with a shield that
     swallows pointer events. Letting the flip run and snapping back afterwards
     plays a whole animation that ends where it started, which just looks
     broken; this stops it happening at all. */
  ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function (ev) {
    shield.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  });

  function placeShield() {
    var blk = bookEl.querySelector('.stf__block');
    var i = flip.getCurrentPageIndex(), n = flip.getPageCount();
    if (!blk || i < n - 2) { shield.style.display = 'none'; return; }
    var b = blk.getBoundingClientRect(), s2 = stage.getBoundingClientRect();
    var landscape = flip.getOrientation() === 'landscape';
    var w = landscape ? b.width / 2 : b.width * 0.62;
    shield.style.display = 'block';
    shield.style.left   = (b.right - s2.left - w) + 'px';
    shield.style.top    = (b.top - s2.top) + 'px';
    shield.style.width  = w + 'px';
    shield.style.height = b.height + 'px';
  }

  flip.on('changeState', function (e) {
    root.classList.toggle('is-flipping', e.data !== 'read');
    if (e.data === 'read') { navIntent = 0; clickIntent = 0; maskTarget = null; maskLeftPage(); return; }
    var i = flip.getCurrentPageIndex();
    var intent = navIntent || clickIntent;
    var target = intent ? Math.max(0, Math.min(flip.getPageCount() - 1, i + intent)) : i;
    maskTarget = target;
    root.classList.toggle('is-open', target > 0 && target < flip.getPageCount() - 1);
    /* Board choreography for landscape covers. The board is the cover — a
       book has nothing lying under the half its cover has not reached — so
       it must never be seen moving on its own. Both snaps happen on frames
       where the cover conceals them:
       - OPENING: keep the half-width board through the whole swing (the
         left half of the screen is genuinely empty until the cover lands).
         The snap to full width happens in the 'flip' handler, the same
         frame StPageFlip settles the flying cover flat on the left.
       - CLOSING: snap to half width right now — at this frame the flying
         cover is still lying flat over the left half, exactly covering the
         board it is taking away. */
    var opening = flip.getOrientation() === 'landscape' && i === 0 && target > 0;
    if (!opening) sizeBoards(target);
    maskLeftPage();   // same frame as the snap, not a rAF later
    busyUntil = Date.now() + 1500;
    if (!maskRaf) maskRaf = requestAnimationFrame(maskLoop);
  });
  flip.on('flip', function () { navIntent = 0; clickIntent = 0; maskTarget = null; status(); });
  flip.on('changeOrientation', function () { setTimeout(function () { sizeBoards(); fitSheets(); }, 60); });
  flip.on('changeState', function (e) {
    if (e.data === 'flipping' || e.data === 'user_fold') puff();
  });
  window.addEventListener('resize', function () { setTimeout(function () { sizeBoards(); fitSheets(); }, 80); });
  // StPageFlip's first render is rAF-driven and can land well after load
  // (throttled tabs), so the closed-state mask gets a few chances to catch
  // whatever that first render leaves parked left of the spine.
  setTimeout(status, 60);
  setTimeout(maskLeftPage, 400);
  setTimeout(maskLeftPage, 1200);

  /* ---------------------------------------------------- the dust */
  /* Two paths. `tsparticles` is what the compare page uses, to show the
     library's own particle engine. Everything else goes through
     book-dust.js, which tracks the crease StPageFlip draws and throws dust
     off it. */
  var kind = root.dataset.dustKind || 'cloud';

  if (kind !== 'tsparticles' && window.BookDust) {
    var dust = window.BookDust.attach(bookEl, dustEl, flip, { kind: kind });
    window.addEventListener('resize', function () {
      clearTimeout(root._dt);
      root._dt = setTimeout(function () { dust.rebuild(); }, 220);
    });
    return;
  }

  var container = null;

  // slim first: the emitters plugin expects the base bundle to be registered
  window.LibTome.loadSlim(tsParticles).then(function () {
    return window.LibTome.loadEmittersPlugin(tsParticles);
  }).then(function () {
    return tsParticles.load({
      id: 'libtome-dust',
      options: {
        fullScreen: { enable: false },
        detectRetina: true,
        fpsLimit: 60,
        background: { color: 'transparent' },
        particles: {
          number: { value: 0 },
          shape: {
            type: 'image',
            options: {
              // the single-file preview swaps these for data URLs
              image: (window.__DUST_SRCS || [1, 2, 3, 4].map(function (n) {
                return 'assets/tome/dust-' + n + '.png';
              })).map(function (src) {
                return { src: src, width: 256, height: 256 };
              })
            }
          },
          size: {
            value: { min: 10, max: 46 },
            animation: { enable: true, speed: 9, startValue: 'min', destroy: 'none', sync: false }
          },
          opacity: {
            value: { min: 0.03, max: 0.20 },
            animation: { enable: true, speed: 0.7, startValue: 'min', destroy: 'none', sync: false }
          },
          rotate: {
            value: { min: 0, max: 360 },
            direction: 'random',
            animation: { enable: true, speed: 3, sync: false }
          },
          wobble: { enable: true, distance: 18, speed: { min: -8, max: 8 } },
          life: { duration: { value: { min: 1.6, max: 3.4 }, sync: false }, count: 1 },
          move: {
            enable: true,
            speed: { min: 0.3, max: 1.9 },
            direction: 'none',
            random: true,
            straight: false,
            outModes: { default: 'destroy' },
            gravity: { enable: true, acceleration: -1.1, maxSpeed: 4 },
            decay: 0.012
          }
        },
        emitters: []
      }
    });
  }).then(function (c) { container = c; window.LibTome.container = c; });

  /* An emitter per flip: it lives for about as long as the turn, spawns
     along a vertical band near the spine and the fore-edge, then removes
     itself. This is the library's own lifecycle — no manual particle loop. */
  function puff() {
    if (!container || !container.addEmitter) return;
    [{ x: 50, y: 50, w: 8, h: 78 }, { x: 74, y: 52, w: 26, h: 70 }].forEach(function (p, i) {
      container.addEmitter({
        life: { count: 1, duration: 1.15, delay: i * 0.08 },
        rate: { quantity: i ? 2 : 3, delay: 0.045 },
        size: { width: p.w, height: p.h, mode: 'percent' },
        position: { x: p.x, y: p.y },
        particles: {
          move: { speed: { min: 0.4, max: i ? 2.4 : 1.5 } }
        }
      });
    });
  }

  /* a few motes drifting at rest, so it looks dusty before you touch it */
  setInterval(function () {
    if (!container || document.hidden || !container.addEmitter) return;
    container.addEmitter({
      life: { count: 1, duration: 0.2 },
      rate: { quantity: 1, delay: 0.2 },
      size: { width: 80, height: 70, mode: 'percent' },
      position: { x: 50, y: 55 },
      particles: { opacity: { value: { min: 0.02, max: 0.09 } }, move: { speed: { min: 0.1, max: 0.5 } } }
    });
  }, 1400);
})();
