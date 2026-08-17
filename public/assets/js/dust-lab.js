/* ============================================================
   Dust lab — the same StPageFlip book four times, each with a
   different dust engine from book-dust.js, so the only variable
   on the page is what draws the dust.
   ============================================================ */
(function () {
  var PageFlip = window.LibTome && window.LibTome.PageFlip;
  if (!PageFlip) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (!window.BookDust) return;
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  /* ---------------------------------------------------------------- a cell */
  var cells = [].slice.call(document.querySelectorAll('[data-dust]'));
  var books = [];

  cells.forEach(function (cell) {
    var kind = cell.dataset.dust;
    if (!window.BookDust.strategies[kind]) return;

    var articles = [].slice.call(cell.querySelectorAll('.page-src'));
    var stage = el('div', 'lab-stage');
    var boards = el('div', 'libtome-boards');
    var bookEl = el('div', 'libtome-book');
    var host = el('div', 'lab-dust');

    articles.forEach(function (a, i) {
      var page = el('div', 'page');
      if (i === 0 || i === articles.length - 1) page.setAttribute('data-density', 'hard');
      var sheet = el('div', a.dataset.type === 'cover' ? 'cover-inner' : 'sheet');
      sheet.innerHTML = a.innerHTML;
      page.appendChild(sheet);
      bookEl.appendChild(page);
    });

    cell.querySelector('.tome-fallback').remove();
    stage.appendChild(boards); stage.appendChild(bookEl); stage.appendChild(host);
    cell.appendChild(stage);

    var flip = new PageFlip(bookEl, {
      width: 300, height: 415, size: 'stretch',
      minWidth: 140, maxWidth: 460, minHeight: 190, maxHeight: 640,
      showCover: true, usePortrait: true, mobileScrollSupport: false,
      drawShadow: true, maxShadowOpacity: 0.55, flippingTime: 1100,
      showPageCorners: true, swipeDistance: 24, clickEventForward: true, useMouseEvents: true
    });
    flip.loadFromHTML(bookEl.querySelectorAll('.page'));

    var dust = window.BookDust.attach(bookEl, host, flip, { kind: kind });
    function build() { dust.rebuild(); }

    function sizeBoards() {
      var blk = bookEl.querySelector('.stf__block') || bookEl;
      var b = blk.getBoundingClientRect(), s = stage.getBoundingClientRect();
      if (!b.width) return;
      var idx = flip.getCurrentPageIndex(), n = flip.getPageCount();
      var half = flip.getOrientation() === 'landscape' && (idx === 0 || idx >= n - 1);
      var w = half ? b.width / 2 : b.width;
      var x = b.left - s.left + (half && idx === 0 ? b.width / 2 : 0);
      boards.style.left = (x - w * 0.016) + 'px';
      boards.style.top = (b.top - s.top - b.height * 0.013) + 'px';
      boards.style.width = (w * 1.032) + 'px';
      boards.style.height = (b.height * 1.026) + 'px';
    }

    function fit() {
      var blk = bookEl.querySelector('.stf__block');
      if (!blk) return;
      var r = blk.getBoundingClientRect();
      if (!r.width) return;
      var pw = flip.getOrientation() === 'landscape' ? r.width / 2 : r.width;
      // hidden pages measure as zero, so the base size comes from geometry
      cell.style.setProperty('--sheet-fs', (pw * 0.0385).toFixed(2) + 'px');
      // then anything on screen that still overruns gets nudged down
      cell.querySelectorAll('.sheet').forEach(function (sh) {
        if (!sh.clientHeight) return;
        sh.style.fontSize = '';
        var size = parseFloat(getComputedStyle(sh).fontSize), guard = 0;
        while (sh.scrollHeight > sh.clientHeight + 1 && guard++ < 14) {
          size *= 0.955; sh.style.fontSize = size.toFixed(2) + 'px';
        }
      });
    }

    var kick = dust.kick;
    flip.on('flip', function () { kick(); setTimeout(function () { sizeBoards(); fit(); status(); }, 30); });
    flip.on('changeOrientation', function () { setTimeout(function () { build(); sizeBoards(); fit(); }, 60); });

    var next = cell.querySelector('[data-next]'), prev = cell.querySelector('[data-prev]');
    var prog = cell.querySelector('[data-prog]');
    function status() {
      var i = flip.getCurrentPageIndex(), n = flip.getPageCount();
      if (prog) prog.textContent = i === 0 ? 'closed' : i + ' / ' + (n - 1);
      if (prev) prev.disabled = i === 0;
      if (next) next.textContent = i === 0 ? 'Open' : (i >= n - 1 ? 'End' : 'Turn');
    }
    if (next) next.addEventListener('click', function () { flip.flipNext(); kick(); });
    if (prev) prev.addEventListener('click', function () { flip.flipPrev(); kick(); });

    setTimeout(function () { build(); sizeBoards(); fit(); status(); }, 80);
    window.addEventListener('resize', function () {
      clearTimeout(cell._t);
      cell._t = setTimeout(function () { build(); sizeBoards(); fit(); }, 220);
    });

    cell._dust = dust;
    books.push({ flip: flip, kick: kick });
  });

  /* ------------------------------------------------------------- lab chrome */
  var all = document.querySelector('[data-turn-all]');
  if (all) all.addEventListener('click', function () {
    books.forEach(function (b) { b.flip.flipNext(); b.kick(); });
  });
  var back = document.querySelector('[data-back-all]');
  if (back) back.addEventListener('click', function () {
    books.forEach(function (b) { b.flip.flipPrev(); b.kick(); });
  });
  var slider = document.querySelector('[data-amount]');
  if (slider) slider.addEventListener('input', function () {
    window.BookDust.setAmount(+slider.value);
    var out = document.querySelector('[data-amount-out]');
    if (out) out.textContent = (+slider.value).toFixed(2).replace(/0$/, '') + '×';
  });
})();
