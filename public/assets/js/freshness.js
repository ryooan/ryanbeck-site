/* Re-checks the dashboard status labels against today's date.
   ------------------------------------------------------------------
   build_page.py decides Live versus Out of date when it runs, from the
   last date in each series' data. If nothing rebuilds the pages, that
   decision would stand forever, so the generator also writes the data's
   last date and the allowed age (EXPECT_DAYS) onto each label and this
   repeats the check in the browser. It only ever downgrades: a series
   the generator already marked is left alone.
   ------------------------------------------------------------------ */
(function () {
  var DAY = 86400000;
  var today = Date.now();

  function age(iso) {
    var t = Date.parse(iso + 'T00:00:00Z');
    return isNaN(t) ? null : Math.floor((today - t) / DAY);
  }
  function overdue(iso, limit) {
    var a = age(iso);
    return a !== null && a > limit;
  }

  /* Mirrors age_phrase() in build_page.py. */
  function phrase(days) {
    if (days <= 10) return 'up to date';
    if (days < 75) return days + ' days ago';
    if (days < 400) return 'about ' + Math.round(days / 30.4) + ' months ago';
    return 'about ' + (days / 365.25).toFixed(1) + ' years ago';
  }

  document.querySelectorAll('.status.is-live[data-expect]').forEach(function (el) {
    if (!overdue(el.getAttribute('data-last'), +el.getAttribute('data-expect'))) return;
    el.classList.remove('is-live');
    el.classList.add('is-overdue');
    el.textContent = 'Out of date';
  });

  document.querySelectorAll('[data-age-of]').forEach(function (el) {
    var a = age(el.getAttribute('data-age-of'));
    if (a !== null) el.textContent = phrase(a);
  });

  document.querySelectorAll('.dot.is-live[data-checks]').forEach(function (el) {
    var late = el.getAttribute('data-checks').split(' ').some(function (pair) {
      var p = pair.split(':');
      return overdue(p[0], +p[1]);
    });
    if (!late) return;
    el.classList.remove('is-live');
    el.classList.add('is-overdue');
  });
})();
