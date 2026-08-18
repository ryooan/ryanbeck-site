/* The Hall — portal behaviour
   One of the doors (or the wizard) is always awake, everywhere: the same
   3.6s rotation runs on desktop and on touch. On desktop, hover outranks
   it — the moment a pointer settles on any of them the rotation stands
   down, and it resumes when the pointer leaves. On touch, a tap wakes what
   it touched and the tap navigates. */
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

  /* The wizard joins the rotation so he glows on his turn like the doors do. */
  var wizard = document.querySelector('.wizard');
  var cycle = wizard ? portals.concat([wizard]) : portals;
  var i = 0, hovered = false;
  function wake(n) {
    cycle.forEach(function (p, k) { p.classList.toggle('is-awake', k === n); });
  }

  wake(0);
  if (!reduced) {
    setInterval(function () {
      if (hovered || document.hidden) return;
      i = (i + 1) % cycle.length;
      wake(i);
    }, 3600);
  }

  if (canHover) {
    cycle.forEach(function (p) {
      p.addEventListener('pointerenter', function () { hovered = true; wake(-1); });
      p.addEventListener('pointerleave', function () { hovered = false; });
    });
  } else {
    cycle.forEach(function (p, k) {
      p.addEventListener('touchstart', function () { i = k; wake(k); }, { passive: true });
    });
  }
})();
