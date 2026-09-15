/* Full-size pictures in a dismissable modal.
   Any <a class="fig-zoom"> opens its href (the full-size image) in a <dialog>
   instead of navigating; without JS, or with a modifier key held, the link
   simply opens the image. Clicking anywhere -- the picture, the dim backdrop
   or the close button -- dismisses it, and so does Escape (native to
   <dialog>). In the about book, StPageFlip ignores presses that land on a
   link (checkTarget in tome-lib.js), so the click opens the picture rather
   than turning the page. */
(function () {
  var dlg;

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="Close">&times;</button>' +
      '<figure><img alt=""><figcaption></figcaption></figure>';
    dlg.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () {
      dlg.querySelector('img').removeAttribute('src');
    });
    document.body.appendChild(dlg);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.fig-zoom');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof HTMLDialogElement === 'undefined') return;
    e.preventDefault();
    if (!dlg) build();
    var thumb = a.querySelector('img');
    var fig = a.closest('figure');
    var cap = fig && fig.querySelector('.fig-cap');
    var img = dlg.querySelector('img');
    img.src = a.href;
    img.alt = thumb ? thumb.alt : '';
    dlg.querySelector('figcaption').textContent = cap ? cap.textContent : '';
    dlg.showModal();
  });
})();
