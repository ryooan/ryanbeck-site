/* The in-page copy editor. Served by tools/copy-server.mjs at
 * /__copy/editor.js and injected into HTML as it is proxied, so this file
 * never lives under public/ and cannot ship.
 *
 * A tab on the right edge; click it for this page's copy as text areas, edit,
 * save. Saving writes copy/*.md, applies it to the source, rebuilds the
 * dashboards and reloads.
 *
 * Everything is in a shadow root. The host pages carry ~19KB of CSS with
 * generic selectors (.panel, .wrap, .card) and the whole point of this thing
 * is to sit on top of them without either side touching the other.
 */
(function () {
  if (window.__copyEditor) return;
  window.__copyEditor = true;

  /* The proxy stamps the source file it served onto this tag. Reading it
     beats re-deriving it from the URL, which has two spellings per page and
     no spelling at all for the 404. */
  var SRC = (document.currentScript
             && document.currentScript.getAttribute('data-copy-src')) || '';

  var host = document.createElement('div');
  host.id = '__copy-editor';
  var root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  root.innerHTML = [
    '<style>',
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,',
    '"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.tab{position:fixed;right:0;top:38%;z-index:2147483646;',
    ' writing-mode:vertical-rl;padding:14px 7px;border:0;border-radius:7px 0 0 7px;',
    ' background:#241c14;color:#f4ead9;font-size:12px;font-weight:600;',
    ' letter-spacing:.09em;text-transform:uppercase;cursor:pointer;',
    ' box-shadow:0 2px 14px rgba(0,0,0,.25)}',
    '.tab:hover{background:#3a2d20}',
    '.tab.is-open{right:min(560px,92vw)}',
    '.panel{position:fixed;top:0;right:0;bottom:0;width:min(560px,92vw);',
    ' z-index:2147483645;background:#faf5ec;border-left:1px solid #d9cbb4;',
    ' box-shadow:-6px 0 26px rgba(0,0,0,.16);display:flex;flex-direction:column;',
    ' transform:translateX(101%);transition:transform .18s ease}',
    '.panel.is-open{transform:none}',
    '.hd{padding:14px 18px 12px;border-bottom:1px solid #e2d6c1;background:#f4ead9}',
    '.hd h2{margin:0;font-size:15px;color:#241c14}',
    '.hd p{margin:4px 0 0;font-size:11.5px;color:#6b5a45}',
    '.hd code{font:11px ui-monospace,Menlo,Consolas,monospace;color:#4a3d30}',
    '.body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:6px 18px 18px}',
    '.blk{padding:13px 0;border-bottom:1px solid #ece2d0}',
    '.blk label{display:block;font-size:11px;font-weight:700;color:#4a3d30;',
    ' text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}',
    '.blk textarea{width:100%;min-height:52px;padding:8px 10px;border-radius:5px;',
    ' border:1px solid #d9cbb4;background:#fff;color:#241c14;font-size:13.5px;',
    ' line-height:1.5;resize:vertical}',
    '.blk textarea:focus{outline:2px solid #c8722a;outline-offset:0;border-color:#c8722a}',
    '.blk.is-dirty textarea{border-color:#c8722a;background:#fffdf7}',
    '.blk .hint{margin:4px 0 0;font-size:11px;color:#8a775e}',
    '.ft{padding:12px 18px;border-top:1px solid #e2d6c1;background:#f4ead9;',
    ' display:flex;gap:10px;align-items:center}',
    'button.go{padding:8px 16px;border:0;border-radius:6px;background:#c8722a;',
    ' color:#fff;font-size:13px;font-weight:600;cursor:pointer}',
    'button.go:disabled{background:#c9bda8;cursor:default}',
    'button.rv{padding:8px 12px;border:1px solid #d9cbb4;border-radius:6px;',
    ' background:none;color:#4a3d30;font-size:12.5px;cursor:pointer}',
    '.msg{font-size:12px;color:#6b5a45}',
    '.msg.bad{color:#a8341f}',
    '.empty{padding:26px 4px;color:#6b5a45;font-size:13px;line-height:1.55}',
    '</style>',
    '<button class="tab" type="button">Edit copy</button>',
    '<aside class="panel" aria-label="Edit this page\'s copy">',
    '  <div class="hd"><h2>Copy on this page</h2><p></p></div>',
    '  <div class="body"></div>',
    '  <div class="ft">',
    '    <button class="go" type="button" disabled>Save</button>',
    '    <button class="rv" type="button">Revert</button>',
    '    <span class="msg"></span>',
    '  </div>',
    '</aside>',
  ].join('');

  var tab = root.querySelector('.tab');
  var panel = root.querySelector('.panel');
  var bodyEl = root.querySelector('.body');
  var sub = root.querySelector('.hd p');
  var goBtn = root.querySelector('.go');
  var rvBtn = root.querySelector('.rv');
  var msg = root.querySelector('.msg');
  var blocks = [];
  var loaded = false;

  function say(text, bad) {
    msg.textContent = text || '';
    msg.className = 'msg' + (bad ? ' bad' : '');
  }

  function dirty() {
    return blocks.filter(function (b) {
      return b.el.value.trim() !== b.text.trim();
    });
  }

  function refresh() {
    var n = dirty().length;
    goBtn.disabled = !n;
    goBtn.textContent = n ? 'Save ' + n + ' change' + (n === 1 ? '' : 's')
                          : 'Save';
    blocks.forEach(function (b) {
      b.wrap.className = 'blk'
        + (b.el.value.trim() !== b.text.trim() ? ' is-dirty' : '');
    });
  }

  /* Highlight the words on the page while their box has focus. There is no
     mapping from a block back to its element, so this matches on the text
     itself -- which is exactly the text we were given, so it is reliable
     enough for a review aid and harmless when it misses. */
  var lit = null;
  function unlight() {
    if (lit) { lit.style.outline = ''; lit.style.borderRadius = ''; lit = null; }
  }
  function light(text) {
    unlight();
    var flat = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (flat.length < 4) return;
    var probe = flat.slice(0, 60);
    var els = document.querySelectorAll(
      'h1,h2,h3,p,span,li,figcaption,title,summary');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (t.indexOf(probe) === 0 && els[i].offsetParent !== null) {
        lit = els[i];
        lit.style.outline = '2px solid #c8722a';
        lit.style.borderRadius = '3px';
        /* Keep editing stationary. Scrolling the document on focus fights
           the browser's caret/selection scrolling, especially in a narrow
           viewport where the drawer covers the highlighted project card. */
        return;
      }
    }
  }

  function sectionIds() {
    return [].map.call(document.querySelectorAll('.series[id]'),
                       function (s) { return s.id; });
  }

  function load() {
    if (loaded) return Promise.resolve();
    return fetch('/__copy/blocks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname, sections: sectionIds(), file: SRC,
      }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      loaded = true;
      bodyEl.innerHTML = '';
      blocks = [];
      sub.innerHTML = d.blocks.length
        ? d.blocks.length + ' blocks &middot; <code>' + d.file + '</code>'
        : '';
      if (!d.blocks.length) {
        bodyEl.innerHTML = '<p class="empty">Nothing editable is mapped to '
          + '<code>' + location.pathname + '</code>'
          + (d.file ? ' (<code>' + d.file + '</code>)' : '')
          + '.<br><br>'
          + (/forecasting/.test(location.pathname)
              ? 'On the dashboards, chart titles, &ldquo;data to&rdquo; dates, '
                + 'status words and row counts are read from the data on every '
                + 'build, so they are deliberately not editable here.'
              : 'If you can see copy on this page, that is a bug \u2014 say so.')
          + '</p>';
        return;
      }
      d.blocks.forEach(function (b) {
        var wrap = document.createElement('div');
        wrap.className = 'blk';
        var lab = document.createElement('label');
        lab.textContent = b.label;
        var ta = document.createElement('textarea');
        ta.value = b.text;
        ta.rows = Math.min(14, Math.max(2, Math.ceil(b.text.length / 62)));
        lab.setAttribute('for', b.id);
        ta.id = b.id;
        wrap.appendChild(lab);
        wrap.appendChild(ta);
        if (b.shape !== 'plain') {
          var h = document.createElement('p');
          h.className = 'hint';
          h.textContent = 'Blank line = new paragraph.';
          wrap.appendChild(h);
        }
        bodyEl.appendChild(wrap);
        ta.addEventListener('input', refresh);
        ta.addEventListener('focus', function () { light(b.text); });
        ta.addEventListener('blur', unlight);
        blocks.push({ id: b.id, text: b.text, el: ta, wrap: wrap });
      });
      refresh();
    });
  }

  tab.addEventListener('click', function () {
    var open = panel.classList.toggle('is-open');
    tab.classList.toggle('is-open', open);
    tab.textContent = open ? 'Close' : 'Edit copy';
    if (open) load().catch(function (e) { say(String(e.message), true); });
    else unlight();
  });

  rvBtn.addEventListener('click', function () {
    blocks.forEach(function (b) { b.el.value = b.text; });
    refresh();
    say('Reverted to what is on the page.');
  });

  goBtn.addEventListener('click', function () {
    var changed = dirty();
    if (!changed.length) return;
    var edits = {};
    changed.forEach(function (b) { edits[b.id] = b.el.value; });
    goBtn.disabled = true;
    say('Saving, applying and rebuilding…');
    fetch('/__copy/save', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edits: edits }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { say(d.error || 'Save failed', true); refresh(); return; }
      say('Saved. Reloading…');
      /* The panel reopens itself after the reload so a run of edits does not
         mean re-opening the drawer every time. */
      sessionStorage.setItem('__copyOpen', '1');
      location.reload();
    }).catch(function (e) { say(String(e.message), true); refresh(); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) tab.click();
    if ((e.metaKey || e.ctrlKey) && e.key === 's'
        && panel.classList.contains('is-open')) {
      e.preventDefault();
      if (!goBtn.disabled) goBtn.click();
    }
  });

  if (sessionStorage.getItem('__copyOpen')) {
    sessionStorage.removeItem('__copyOpen');
    tab.click();
  }
})();
