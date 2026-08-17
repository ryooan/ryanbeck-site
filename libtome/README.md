# Vendor bundle for the library version of the book

Not part of the site build. This exists only to produce
`../public/assets/vendor/lib-tome.bundle.js`, which `compare.html` loads.

```bash
npm install
npm run build
```

Bundles StPageFlip (`page-flip`) and tsParticles (engine + slim + the emitters
plugin) and hangs them on `window.LibTome`. 233 KB minified, 65 KB gzipped —
for comparison, the hand-built book is about 4 KB of JS and no dependencies.

If the hand-built version wins, delete this folder along with
`public/compare.html`, `public/assets/js/tome-lib.js`,
`public/assets/css/tome-lib.css` and `public/assets/vendor/`.
