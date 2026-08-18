/* The Hall — portal behaviour
   Desktop: pure CSS hover does the work. This file only handles
   (a) touch devices, which have no hover, and
   (b) a gentle "one door wakes at a time" idle cycle on touch. */
(function () {
  var portals = Array.prototype.slice.call(document.querySelectorAll('.portal'));
  if (!portals.length) return;

  var canHover = window.matchMedia('(hover: hover)').matches;
  var reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Preload the scenes so the first hover doesn't stutter. */
  portals.forEach(function (p) {
    var sc = p.querySelector('.scene');
    var m = sc && /url\(["']?(.+?)["']?\)/.exec(getComputedStyle(sc).backgroundImage);
    if (m) { var i = new Image(); i.src = m[1]; }
  });

  if (canHover) return;

  /* --- touch: cycle which is awake, tap navigates --- */
  /* The wizard joins the rotation so he glows on his turn like the doors do
     — without hover it is the only thing that says he is tappable. */
  var wizard = document.querySelector('.wizard');
  var cycle = wizard ? portals.concat([wizard]) : portals;
  var i = 0;
  function wake(n) {
    cycle.forEach(function (p, k) { p.classList.toggle('is-awake', k === n); });
  }
  wake(0);
  if (!reduced) {
    var timer = setInterval(function () { i = (i + 1) % cycle.length; wake(i); }, 3600);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearInterval(timer);
    });
  }
  cycle.forEach(function (p, k) {
    p.addEventListener('touchstart', function () { wake(k); }, { passive: true });
  });
})();
