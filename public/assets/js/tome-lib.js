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


  /* ------------------------------------------------- per-page aging */
  /* A real book is not one texture at nine offsets. Every paper page gets
     its own recipe: a different patch of the stock, its own tint, its own
     foxing, an edge it darkens along, and sometimes a damp mark. All of it
     is drawn from a seeded PRNG keyed on the page index, so page three's
     stains are always page three's stains -- reload, resize and reflow do
     not shuffle them, and a screenshot of a bug is reproducible.

     The layers are handed to CSS as `--age` and painted by the page's
     ::before. They cannot be set on the element itself: `background` there
     is the stock, and an inline one would also override the leather on the
     hard covers. */
  function rng(seed) {
    var t = (seed * 2654435761) % 2147483647 + 0x6D2B79F5;
    return function () {
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function stain(el, seed) {
    var r = rng(seed);
    var f = function (a, b) { return a + r() * (b - a); };
    var n = function (v) { return v.toFixed(1); };

    /* The patch of stock. The SCALE range is what matters and it has to be
       wide: page.jpg is one sheet whose variation is nearly all large and
       soft, so at 112-184% every page was showing 54-89% of the same
       texture and the windows overlapped so heavily that nine pages read as
       one. At 105-290% a page shows anywhere from a third of the sheet to
       nearly all of it, which changes the apparent size of the grain and not
       just its position -- that is the difference the eye actually reads. */
    el.style.backgroundPosition = n(f(0, 100)) + '% ' + n(f(0, 100)) + '%';
    el.style.backgroundSize = n(f(105, 290)) + '% ' + n(f(105, 290)) + '%';

    /* How yellowed this sheet is. The stock is opaque, so the only way its
       own tone can differ page to page is to blend it against a color --
       multiply pushes a page towards the base, normal leaves it alone. Two
       in five get pushed, none of them far. */
    /* The channels are derived, not drawn independently: r >= g >= b by a
       bounded step, so the tint can only ever run warm. Rolling three free
       channels put a page at rgb(232,238,196), and multiplied through the
       stock that is not an aged sheet, it is a mouldy one.

       EVERY page gets a tint, and the range is narrow. An earlier version
       tinted two in five and left the rest alone, over a wider range: that
       sorts the book into plainly yellowed pages and plainly white ones,
       and the jump between two facing sheets reads as a mistake. Pages of
       one book came off one batch of stock. Let them differ by a shade, not
       by a generation. */
    var br = f(248, 253), bg = br - f(2, 7), bb = bg - f(5, 13);
    el.style.backgroundColor = 'rgb(' + Math.round(br) + ',' + Math.round(bg) +
      ',' + Math.round(bb) + ')';
    el.style.backgroundBlendMode = 'multiply';

    /* THE EDGE VIGNETTE IS THE THING THE EYE ACTUALLY READS AS "staining".
       It was `inset 0 0` on every page -- a perfectly symmetrical brown frame,
       same shape on all four sides, page after page. Varying only its blur and
       its alpha changes how heavy that frame is, never that it is the same
       frame, and no amount of foxing underneath competes with a border drawn
       round all four edges. Offsetting it is what breaks the repeat: the
       darkening piles into two sides and thins on the other two, so one sheet
       is grubby down its fore-edge and the next along its head. */
    var ox = f(-16, 16), oy = f(-16, 16);
    el.style.boxShadow =
      'inset ' + n(ox) + 'px ' + n(oy) + 'px ' + n(f(20, 44)) + 'px rgba(112,84,44,' +
        f(.16, .34).toFixed(2) + '), ' +
      'inset ' + n(-ox * f(.35, .9)) + 'px ' + n(-oy * f(.35, .9)) + 'px ' +
        n(f(34, 76)) + 'px rgba(98,74,40,' + f(.07, .19).toFixed(2) + ')';

    var L = [];

    /* One or two broad tonal patches: not marks you would point at, but the
       reason one page looks browner at the top and its neighbor does not.
       These carry most of the page-to-page difference. */
    var patches = 1 + Math.floor(r() * 2);
    while (patches--) {
      var pr = f(24, 58), pk = r() < .5 ? '146,110,54' : '128,102,66';
      L.push('radial-gradient(' + n(pr) + '% ' + n(pr * f(.6, 1.5)) + '% at ' +
             n(f(-10, 110)) + '% ' + n(f(-10, 110)) + '%, rgba(' + pk + ',' +
             f(.05, .12).toFixed(3) + ') 0%, rgba(' + pk + ',0) 78%)');
    }

    /* foxing: a handful of blotches, warm or cold, round or drawn out */
    var blots = 3 + Math.floor(r() * 4);
    while (blots--) {
      var rx = f(3, 15), ry = rx * f(.55, 1.9), ink = r() < .55 ? '150,108,48' : '124,94,60';
      L.push('radial-gradient(' + n(rx) + '% ' + n(ry) + '% at ' + n(f(3, 97)) + '% ' + n(f(3, 97)) +
             '%, rgba(' + ink + ',' + f(.09, .26).toFixed(3) + ') 0%, rgba(' + ink + ',0) 72%)');
    }

    /* a scatter of freckles on some pages -- small, dark, clustered */
    if (r() < .55) {
      var cx = f(10, 90), cy = f(10, 90), specks = 3 + Math.floor(r() * 5);
      while (specks--) {
        L.push('radial-gradient(' + f(.5, 1.5).toFixed(2) + '% ' + f(.5, 1.6).toFixed(2) +
               '% at ' + n(cx + f(-11, 11)) + '% ' + n(cy + f(-11, 11)) +
               '%, rgba(96,68,34,' + f(.14, .32).toFixed(2) + ') 0%, rgba(96,68,34,0) 80%)');
      }
    }

    /* one edge is grubbier than the others: usually the fore-edge, which is
       the one a thumb actually touches */
    var side = ['to left', 'to right', 'to top', 'to bottom'][Math.floor(r() * 4)];
    L.push('linear-gradient(' + side + ', rgba(126,94,50,' + f(.10, .24).toFixed(3) +
           ') 0%, rgba(126,94,50,0) ' + n(f(16, 44)) + '%)');

    /* Damp, on roughly a third of them. Two things keep it from reading as a
       coffee ring: the center sits well outside the page, so only a shallow
       arc of the tidemark crosses it, and a second offset ellipse breaks the
       arc so its edge is not a clean circle. The tidemark itself has to stay
       faint and wide -- a crisp narrow ring is a mug, a broad soft one is
       water that dried. */
    if (r() < .34) {
      var edge = r(), ink2 = '146,110,54';
      var wx = edge < .5 ? f(-46, -10) : f(110, 146), wy = f(-34, 134);
      for (var q = 0; q < 2; q++) {
        var band = f(.05, .085).toFixed(3);
        L.push('radial-gradient(' + n(f(64, 112)) + '% ' + n(f(52, 96)) + '% at ' +
               n(wx + f(-14, 14)) + '% ' + n(wy + f(-16, 16)) +
               '%, rgba(' + ink2 + ',.055) 0%, rgba(' + ink2 + ',.03) 58%, rgba(' + ink2 + ',' +
               band + ') ' + n(f(74, 82)) + '%, rgba(' + ink2 + ',0) ' + n(f(92, 99)) + '%)');
      }
    }

    /* and an overall cast, so no two sheets are quite the same white */
    var cast = r() < .5 ? '148,112,52' : '120,104,76';
    L.push('linear-gradient(rgba(' + cast + ',' + f(0, .035).toFixed(3) + '), rgba(' + cast + ',' +
           f(.01, .06).toFixed(3) + '))');

    el.style.setProperty('--age', L.join(', '));
  }

  var source   = root.querySelector('.tome-fallback');
  var articles = [].slice.call(source.querySelectorAll('.page-src'));
  if (!articles.length) return;

  /* ---------------------------------------------------- markup */
  root.innerHTML = '';
  root.className = 'libtome';

  var stage  = document.createElement('div'); stage.className = 'libtome-stage';
  var verso  = document.createElement('div'); verso.className = 'libtome-verso';
  // its own recipe, on a seed no real page uses -- in portrait it sits
  // beside the recto and matching it would read as a printing error
  stain(verso, 977);
  var boards = document.createElement('div'); boards.className = 'libtome-boards';
  // the left board is its own element in landscape, so opening the cover
  // never has to move a rectangle: the right board simply never changes,
  // and the left one materialises in place under the landed cover
  var boardsL = document.createElement('div'); boardsL.className = 'libtome-boards';
  boardsL.style.opacity = '0';
  var bookEl = document.createElement('div'); bookEl.className = 'libtome-book';
  var dustEl = document.createElement('div'); dustEl.className = 'libtome-dust'; dustEl.id = 'libtome-dust';

  articles.forEach(function (a, i) {
    var page = document.createElement('div');
    page.className = 'page';
    // StPageFlip treats "hard" pages as covers: they turn as boards, not paper
    if (i === 0 || i === articles.length - 1) page.setAttribute('data-density', 'hard');
    if (a.dataset.type) page.setAttribute('data-type', a.dataset.type);
    // Paper pages age individually; leather covers keep their CSS
    // background and are left alone. The recipe goes on a child .leaf,
    // NEVER on the page element itself: StPageFlip rewrites the item's
    // entire style.cssText on every draw, so any inline style set on the
    // page dies on the first frame it renders. (That is why the original
    // crop-window version of this never showed on screen either -- it
    // verified at load and was wiped by the first draw.) Children are not
    // touched, and the item's clip-path folds them along with everything
    // else. See stain() above.
    if (i !== 0 && i !== articles.length - 1) {
      var leaf = document.createElement('div');
      // NOT 'leaf': tome.css (which about.html loads for the shared book
      // furniture) already owns that class for the hand-built book's
      // half-spread leaves -- its width:50% shrank these to half a page
      leaf.className = 'age-leaf';
      stain(leaf, i + 1);
      page.appendChild(leaf);
    }
    var sheet = document.createElement('div');
    sheet.className = a.dataset.type === 'cover' ? 'cover-inner' : 'sheet';
    sheet.innerHTML = a.innerHTML;
    page.appendChild(sheet);
    bookEl.appendChild(page);
  });

  var shield = document.createElement('div'); shield.className = 'libtome-shield';

  stage.appendChild(boardsL);
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

  /* ---------------------------------------------------- chapters across a spread
     A chapter too long for one page is authored as a `text` article followed
     by a `continued` one. Fitting each page on its own shrank them to
     different sizes -- Writing sat at 91% on the left and 83% on the right,
     facing each other -- and left the break wherever it was typed.

     So a pair is treated as ONE stream of text: the break is chosen here, at
     any word, and both pages get the same type size. The rule is the largest
     size at which both pages fit, and at that size the break where the two
     pages are most evenly filled. The HTML keeps its authored break, so the
     plain page, the copy editor and the no-JS fallback never see this. */
  var VOID_TAG = /^(br|img|wbr|hr|source|input)$/i;

  /* Where a paragraph may break: whitespace outside any tag AND outside any
     inline element, so a link or an <em> is never split across the turn. */
  function wordBreaks(html) {
    var out = [], depth = 0, i = 0, n = html.length;
    while (i < n) {
      if (html[i] === '<') {
        var j = html.indexOf('>', i);
        if (j < 0) break;
        var tag = html.slice(i + 1, j), m = /^\/?\s*([a-z0-9]+)/i.exec(tag);
        if (m && !VOID_TAG.test(m[1]) && !/\/\s*$/.test(tag)) depth += tag[0] === '/' ? -1 : 1;
        i = j + 1;
        continue;
      }
      if (/\s/.test(html[i]) && depth === 0) {
        var k = i;
        while (k < n && /\s/.test(html[k])) k++;
        if (i > 0 && k < n) out.push(i);
        i = k;
        continue;
      }
      i++;
    }
    return out;
  }

  var pairs = [];
  articles.forEach(function (a, i) {
    var b = articles[i + 1];
    if (a.dataset.type !== 'text' || !b || b.dataset.type !== 'continued') return;
    var head = '', folioA = '', folioB = '', els = [];
    [].slice.call(a.children).forEach(function (el) {
      if (el.matches('p.kicker, h2')) head += el.outerHTML;
      else if (el.matches('p.folio')) folioA = el.outerHTML;
      else els.push(el);
    });
    [].slice.call(b.children).forEach(function (el) {
      if (el.matches('p.folio')) { folioB = el.outerHTML; return; }
      /* the authored half-paragraph rejoins the paragraph it was cut from */
      if (el.matches('p.cont') && els.length && els[els.length - 1].tagName === 'P') {
        var last = els[els.length - 1].cloneNode(true);
        last.innerHTML = last.innerHTML.replace(/\s+$/, '') + ' ' + el.innerHTML.replace(/^\s+/, '');
        els[els.length - 1] = last;
        return;
      }
      els.push(el);
    });
    var blocks = els.map(function (el) {
      var html = el.innerHTML.trim();
      return { tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') || '', html: html,
               breaks: el.tagName === 'P' ? wordBreaks(html) : [] };
    }).filter(function (bl) { return bl.html.replace(/<[^>]*>/g, '').trim(); });
    /* candidate breaks, in reading order: every word gap, then the block end */
    var cands = [];
    blocks.forEach(function (bl, bi) {
      bl.breaks.forEach(function (c) { cands.push({ b: bi, c: c }); });
      if (bi < blocks.length - 1) cands.push({ b: bi, c: -1 });
    });
    if (!cands.length) return;
    pairs.push({ A: bookEl.children[i].querySelector('.sheet'),
                 B: bookEl.children[i + 1].querySelector('.sheet'),
                 head: head, folioA: folioA, folioB: folioB,
                 blocks: blocks, cands: cands });
  });

  function tagged(bl, cls, inner) {
    return '<' + bl.tag + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + bl.tag + '>';
  }

  function splitAt(p, k) {
    var cand = p.cands[k], A = [], B = [];
    p.blocks.forEach(function (bl, bi) {
      if (bi < cand.b || (bi === cand.b && cand.c === -1)) A.push(tagged(bl, bl.cls, bl.html));
      else if (bi > cand.b) B.push(tagged(bl, bl.cls, bl.html));
      else {
        A.push(tagged(bl, bl.cls, bl.html.slice(0, cand.c)));
        B.push(tagged(bl, 'cont', bl.html.slice(cand.c).replace(/^\s+/, '')));
      }
    });
    return { a: p.head + A.join('') + p.folioA, b: B.join('') + p.folioB };
  }

  /* Measuring must happen in a box that is laid out: a page StPageFlip is not
     showing is display:none and measures zero, which reads as "fits". */
  var probe = null;
  function fill(html, px, pw, ph, type) {
    if (!probe) {
      probe = document.createElement('div');
      probe.className = 'page';
      probe.setAttribute('aria-hidden', 'true');
      probe.appendChild(document.createElement('div')).className = 'sheet';
      root.appendChild(probe);
    }
    probe.setAttribute('data-type', type);
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;display:block;visibility:hidden;' +
      'pointer-events:none;overflow:hidden;width:' + pw + 'px;height:' + ph + 'px';
    var sh = probe.firstChild;
    sh.style.cssText = 'bottom:auto;height:auto;font-size:' + px + 'px';
    sh.innerHTML = html;
    return sh.offsetHeight / ph;
  }

  function balance(p, pw, ph, base) {
    var n = p.cands.length, memo = {};
    function fills(k, px) {
      var key = k + '@' + px.toFixed(3);
      if (!memo[key]) {
        var s = splitAt(p, k);
        memo[key] = [fill(s.a, px, pw, ph, 'text'), fill(s.b, px, pw, ph, 'continued')];
      }
      return memo[key];
    }
    /* more on the left fills the left and empties the right, so the evenest
       break is where the two fills cross: a binary search, not a scan */
    function evenest(px) {
      var lo = 0, hi = n - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1, f = fills(mid, px);
        if (f[0] < f[1]) lo = mid + 1; else hi = mid;
      }
      var pick = lo, worst = Math.max.apply(null, fills(lo, px));
      if (lo > 0) {
        var w = Math.max.apply(null, fills(lo - 1, px));
        if (w < worst) { worst = w; pick = lo - 1; }
      }
      return { k: pick, worst: worst };
    }
    var FULL = 0.985, px = base, r = evenest(base);
    if (r.worst > FULL) {
      var lo = base * 0.5, hi = base, found = evenest(lo);
      for (var it = 0; it < 9; it++) {
        var mid = (lo + hi) / 2, m = evenest(mid);
        if (m.worst <= FULL) { lo = mid; found = m; } else hi = mid;
      }
      px = lo; r = found;
    }
    var s = splitAt(p, r.k);
    p.A.innerHTML = s.a;
    p.B.innerHTML = s.b;
    [p.A, p.B].forEach(function (sh) {
      sh.style.fontSize = px < base ? px.toFixed(2) + 'px' : '';
      sh.setAttribute('data-balanced', '');
    });
    p.size = px / base;
  }

  /* same trick as the hand-built version: the content is fixed and the page
     size isn't, so shrink type until it fits */
  var balancedFor = '';
  function fitSheets() {
    var blk = bookEl.querySelector('.stf__block');
    if (!blk) return;
    var r = blk.getBoundingClientRect();
    if (!r.width) return;
    var pw = flip.getOrientation() === 'landscape' ? r.width / 2 : r.width;
    var base = +(pw * 0.0385).toFixed(2);
    // hidden pages measure as zero, so the base size comes from geometry
    root.style.setProperty('--sheet-fs', base + 'px');
    /* Paired chapters are balanced once per page size. fitSheets runs on
       every turn, and re-measuring a few hundred layouts each time would be
       felt; nothing about the answer changes until the page does. */
    var key = Math.round(pw) + 'x' + Math.round(r.height);
    if (pairs.length && key !== balancedFor) {
      balancedFor = key;
      pairs.forEach(function (p) { balance(p, pw, r.height, base); });
      if (probe) { probe.remove(); probe = null; }
    }
    // then anything on screen that still overruns gets nudged down
    root.querySelectorAll('.sheet').forEach(function (sh) {
      if (!sh.clientHeight || sh.hasAttribute('data-balanced')) return;
      sh.style.fontSize = '';
      var size = parseFloat(getComputedStyle(sh).fontSize), guard = 0;
      while (sh.scrollHeight > sh.clientHeight + 1 && guard++ < 14) {
        size *= 0.955; sh.style.fontSize = size.toFixed(2) + 'px';
      }
    });
  }
  window.__tomePairs = pairs;   // debug handle, like __tomeFlip

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
  function sizeBoards(targetIdx, predicted) {
    var blk = bookEl.querySelector('.stf__block') || bookEl;
    var b = blk.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!b.width) return;

    var idx = targetIdx === undefined ? flip.getCurrentPageIndex() : targetIdx;
    var n = flip.getPageCount();
    var landscape = flip.getOrientation() === 'landscape';
    var open = idx > 0 && idx < n - 1;

    var top = b.top - s.top - b.height * 0.013;
    var hgt = b.height * 1.026;

    root.classList.toggle('is-open', open);

    if (landscape) {
      /* Two half-width boards, and NEITHER ever moves or resizes — a
         rectangle traveling on its own reads as furniture, not a book.
         The right board is simply always there. The left one is always
         positioned and only its opacity changes: it fades in IN PLACE
         under the cover in the same frame the cover lands flat on it
         (called from the 'flip' handler), and it vanishes instantly when
         a close begins, while the flying cover still lies exactly on top
         of it. The joint between them sits at the spine, hidden by the
         page block; the sliver visible above and below the pages reads
         as the hinge groove a real binding has. */
      var w2 = b.width / 2;
      var spine = b.left - s.left + w2;
      boards.style.left   = (spine - w2 * 0.016) + 'px';
      boards.style.width  = (w2 * 1.032) + 'px';
      boardsL.style.left  = (b.left - s.left - w2 * 0.016) + 'px';
      boardsL.style.width = (w2 * 1.032) + 'px';
      boardsL.style.top = boards.style.top = top + 'px';
      boardsL.style.height = boards.style.height = hgt + 'px';
      /* A PREDICTED target may hide the board but never light it. The
         prediction is `getCurrentPageIndex() + intent`, and clicking back
         through several pages quickly leaves that index a flip behind -- so
         a close predicted `target > 0`, and this branch answered by fading
         the board IN, relighting it for the whole closing swing. Lighting it
         is only ever correct from a settled state, which is the `status()`
         call with no arguments. */
      if (open) {
        if (!predicted && boardsL.style.opacity !== '1') {
          boardsL.style.transition = 'opacity .18s ease';
          boardsL.style.opacity = '1';
        }
      } else {
        boardsL.style.transition = 'none';
        boardsL.style.opacity = '0';
      }
      return;
    }

    boardsL.style.transition = 'none';
    boardsL.style.opacity = '0';
    var w = b.width;
    var x = b.left - s.left;
    if (open) {
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

  /* The last page you can turn to. In portrait that is the last page of
     content. In landscape the spreads are (1,2),(3,4)..., so when the content
     ends on an even (right-hand) page, the back board would sit alone on the
     left of one more spread, with nothing under it -- so the book stops at
     the spread that holds the last content page. */
  var LAST = 0;
  function lastIndex() {
    var n = flip.getPageCount(), last = n - 2;
    return flip.getOrientation() === 'landscape' && last % 2 === 0 ? last - 1 : last;
  }
  function status() {
    var i = flip.getCurrentPageIndex();
    LAST = lastIndex();
    progress.textContent = i === 0 ? 'closed' : i + ' / ' + LAST;
    nextBtn.textContent = i === 0 ? 'Open it' : (i >= LAST ? 'The end' : 'Turn the page');
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= LAST;
    sizeBoards();
    fitSheets();
    placeShield();
    maskLeftPage();
    maskShadows();
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

  /* Is a COVER (a hard page) currently in the air? Asked of the DOM rather
     than of a predicted target, because prediction is what broke here: the
     target is `getCurrentPageIndex() + intent`, and clicking back through
     several pages quickly leaves that index a flip or two behind, so the
     close was never recognized and the left board stayed lit under a cover
     that was already swinging shut. What is actually on screen cannot be
     stale. */
  /* NOTE StPageFlip does not wrap the pages it is given -- it stamps
     `stf__item` (and `--hard`/`--soft`) onto the very elements handed to it.
     `.stf__item` and `.page` are the same node, so `item.querySelector('.page')`
     is null and any code reaching *into* an item for its page silently does
     nothing. That is exactly how the first version of this function failed:
     it always returned false, so the rule below never once ran. */
  function hardInFlight() {
    var items = bookEl.querySelectorAll('.stf__item'), i, it, moving;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.style.display === 'none') continue;
      if (it.getAttribute('data-density') !== 'hard' && !it.classList.contains('--hard')) continue;
      /* Flight = lifted z-index, the same convention maskLeftPage trusts.
         A rotate-in-transform test was tried as a second signal and burned
         us: StPageFlip writes rotateY(0deg) into settled pages' cssText on
         every draw, so a parked back cover matched it and the left board
         vanished during ordinary page turns near the end of the book. */
      moving = (+it.style.zIndex || 0) >= 5;
      if (moving) return true;
    }
    return false;
  }

  /* Open between changeState and flip, so the rule above applies for exactly
     the length of one gesture. Without the latch the per-frame loop keeps
     running for ~1.5s after a flip lands and re-hides the board the instant
     the 'flip' handler fades it in. */
  var coverGesture = false;
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
  /* Nothing lies under the half a cover has not reached, and nothing can
     cast a shadow onto a half with no book in it. StPageFlip disagrees: a
     hard flip paints .stf__hardShadow across the full width, so opening the
     book laid a gray slab over the bare page beside it, and closing it did
     the same on the way back. Hide any shadow whose middle is over the empty
     half. Visibility, never display — the dust engine measures
     .stf__outerShadow's box every frame. */
  function maskShadows() {
    var blk = bookEl.querySelector('.stf__block');
    if (!blk) return;
    var b = blk.getBoundingClientRect();
    var landscape = flip.getOrientation() === 'landscape';
    var edge = landscape ? b.left + b.width / 2 : b.left;
    var empty = landscape ? boardsL.style.opacity !== '1' : true;
    var sh = bookEl.querySelectorAll('.stf__outerShadow, .stf__innerShadow, .stf__hardShadow, .stf__hardInnerShadow');
    for (var i = 0; i < sh.length; i++) {
      var r = sh[i].getBoundingClientRect();
      var over = r.width > 2 && (r.left + r.width / 2) < edge - 2;
      sh[i].style.visibility = (empty && over) ? 'hidden' : '';
    }
  }

  var maskRaf = null;
  function maskLoop() {
    maskRaf = null;
    if (coverGesture && hardInFlight() && flip.getOrientation() === 'landscape') {
      boardsL.style.transition = 'none';
      boardsL.style.opacity = '0';
    }
    maskLeftPage();
    maskShadows();
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
    var i = flip.getCurrentPageIndex();
    if (!blk || i < lastIndex()) { shield.style.display = 'none'; return; }
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
    if (e.data === 'read') {
      navIntent = 0; clickIntent = 0; maskTarget = null; coverGesture = false;
      maskLeftPage(); maskShadows(); return;
    }
    coverGesture = true;
    var i = flip.getCurrentPageIndex();
    var intent = navIntent || clickIntent;
    var target = intent ? Math.max(0, Math.min(flip.getPageCount() - 1, i + intent)) : i;
    maskTarget = target;
    root.classList.toggle('is-open', target > 0 && target < flip.getPageCount() - 1);
    /* Left-board choreography for landscape covers. The board is the cover
       — a book has nothing lying under the half its cover has not reached
       — so no board may be seen moving, and the left board only changes
       opacity, on frames where the cover conceals it:
       - OPENING: skip sizeBoards here, or the left board would fade in at
         the start of the swing over a still-empty left half. It fades in,
         in place, from the 'flip' handler — the same frame StPageFlip
         settles the flying cover flat on top of it.
       - CLOSING: sizeBoards now — it hides the left board instantly while
         the flying cover still lies flat over it, exactly covering what
         disappears. */
    var opening = flip.getOrientation() === 'landscape' && i === 0 && target > 0;
    if (!opening) sizeBoards(target, true);
    maskLeftPage();   // same frame as the snap, not a rAF later
    maskShadows();
    busyUntil = Date.now() + 1500;
    if (!maskRaf) maskRaf = requestAnimationFrame(maskLoop);
  });
  flip.on('flip', function () {
    navIntent = 0; clickIntent = 0; maskTarget = null;
    coverGesture = false;   // the cover has landed; the board may light again
    status();
  });
  /* Debug handle. The browser pane agents work in cannot composite, so the
     only way to exercise a flip is a harness page that pumps rAF by hand and
     drives this instance directly. Costs nothing in production. */
  window.__tomeFlip = flip;
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

  /* `data-dust-amount` scales the density away from book-dust.js's own
     calibrated 1.0, which is what the dust lab's slider means by 1.0x. The
     site runs at half of it: the lab is a bare book on a plain background
     where you are looking for the dust, and the same cloud over the real
     page is more than it needs. Set it here, not by moving AMOUNT, so the
     lab keeps showing the engines at their documented baseline. */
  if (kind !== 'tsparticles' && window.BookDust) {
    var amount = parseFloat(root.dataset.dustAmount);
    if (amount > 0) window.BookDust.setAmount(amount);
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
