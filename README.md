# Ryan Beck — personal site

*New here? Read `HANDOFF.md` first.*

A static, dependency-free site. No build step, no framework, no `npm install`.
Open `index.html` in a browser and it works.

## Run it locally

```bash
npm run serve     # static only  -> http://localhost:8000
npm run dev       # wrangler, if you're touching /api
npm run deploy    # push to Cloudflare
```

(You need a server rather than double-clicking the file, because the pages
load assets by path.)

## What's here

```
public/               everything that gets served
  index.html          the hall — the three doors + the wizard
  projects.html       card grid
  writing.html        fiction / author page
  blog.html           Substack feed + older archive
  about.html          the book
  about-plain.html    the same content as an ordinary page
  compare.html        experiment: hand-built book vs libraries (noindex)
  dust-lab.html       experiment: four dust engines (noindex)
  404.html
  _headers            caching + security headers
  _redirects          old ryanbeckauthor.com paths, extensionless URLs
  robots.txt  sitemap.xml  site.webmanifest  favicon.ico

  assets/
  portal-hall.webp    the drawing (webp) + .png fallback. Flattened onto
                      #e9dac9 with only the doorways punched out, which is
                      why it blends into the page with no visible edge
  css/site.css        all styling, one file
  wordmark.svg        RYAN BECK, drawn to match the carved door lintels
  js/portal.js        touch-device behaviour for the doors
  js/substack.js      pulls live posts from /api/substack
  js/nav.js           highlights the current nav item
  scenes/             what you see through each door
    projects.jpg  fiction.jpg  blog.jpg     <- swap these for real art
    fire-a.webp   fire-b.webp               <- the rotating ring of fire
  cards/card-1..6.jpg  project card art     <- swap these
  covers/              book covers + portrait <- swap these
  og.jpg               social card
worker/index.js       /api/substack and /api/subscribe
tools/                make-fire.py, make-wordmark.py,
                      make-tome-textures.py, make-dust.py,
                      check-links.mjs
wrangler.toml         Cloudflare config
CLAUDE.md             architecture notes for Claude Code
HOSTING.md            where to deploy it and why
```

## How the doors work

The drawing is a PNG whose three doorways are **fully transparent**. I traced
the exact outline of each opening and turned it into an SVG `clipPath`
(`clip-path: url(#clip-projects)` and friends, in `index.html`). Each portal
is a `<a>` sitting *behind* the artwork, clipped to that shape, so:

- the scene only ever shows through the door opening, never around it
- the clip also clips the click target, so hovering the stone wall does nothing

Inside each portal, stacked back to front:

| layer | what it does |
|---|---|
| `.scene` | the image beyond the door. Dark and blurred at rest; on hover it brightens and pushes from `scale(1.17)` to `scale(1.30)` — a slow continuous dolly, not a one-shot zoom |
| `.veil` | the darkness. Fades from ~1 to 0.1 |
| `.rim` | an inner shadow that opens outward as the scene pushes in — this is what sells the vertigo |
| `.ember` | a faint pulse so a sleeping door doesn't look dead |
| `.swirl` ×2 | two counter-rotating rings of fire, 24s and 15s, one sharp and one blurred |

Everything is CSS. No canvas, no WebGL, no animation library.

### Swapping the scene behind a door

One line in `index.html`:

```html
<span class="scene" style="background-image:url(&quot;assets/scenes/fiction.jpg&quot;)"></span>
```

Portrait images around 760×912 work best — the doorway is roughly 5:6. Put the
thing you want people to notice dead centre; the ring of fire eats the edges.

### Retuning the effect

All in `assets/css/site.css` under `/* --- a doorway --- */`:

- **zoom depth** — `.portal:is(:hover,…) .scene { transform: scale(1.17) }` and the `portal-drift` keyframes
- **how dark at rest** — `.portal .scene { filter: brightness(.07) }` and `.portal .veil`
- **fire speed** — the `fire-spin` / `fire-spin-r` durations
- **fire size** — `.swirl { width: 164% }` and `.swirl.b { width: 184% }`. Bigger = the ring hugs the frame more tightly; smaller = it closes in around the centre of the image

The fire rings are generated PNGs, not gradients. `tools/make-fire.py` regenerates
them if you want different flames.

### The wake cycle

One door (or the wizard) is always awake: `portal.js` rotates the glow every
3.6s on every device. Hovering anything pauses the rotation; on a phone a
tap wakes what it touched and navigates. A plain text nav also sits on the
artwork's sand at every size — the doors are only ~40px wide on a phone,
which is too small to be the only way in.

Everything respects `prefers-reduced-motion`.

## The wizard

He's part of the drawing, so he can't be a separate image. Instead there's an
`<a>` clipped to a hand-traced polygon of his silhouette (`#clip-wizard`), with
a copy of the artwork as its background positioned to line up exactly. On hover
it gets a warm `drop-shadow`, so he appears to glow. Adjust the polygon in
`index.html` if the hit area feels off.

## Substack

Substack's RSS feed sends no CORS headers, so a browser can't read it directly.
`assets/js/substack.js` calls `/api/substack` on your own origin and silently
falls back to the hand-written list if that route doesn't exist yet. The file
has a ~10 line serverless handler in its header comment — drop it in when you
deploy somewhere that runs functions.

Until then the page shows the static list, which is a fine place to start.

## The about page is a book

`about.html` renders the about content as a book you click through:
[StPageFlip](https://github.com/Nodlik/StPageFlip) for the page turns, and a
canvas dust engine of our own that reads the crease StPageFlip draws and throws
dust off it. `about-plain.html` is the same content as an ordinary page, linked
from the colophon, if you would rather ship that.

Pages are authored as plain `<article>` elements in the HTML — the book is
assembled from them at runtime, so with JS off or reduced motion on you just
read the articles.

Two pages are experiments kept as a record and unlinked from the nav:
`compare.html` (this book beside an earlier hand-built one) and
`dust-lab.html` (four dust engines side by side, with a density slider).
CLAUDE.md says what to delete if you want them gone.

## Things left as placeholders

- every project card (art, title, copy, links)
- both book covers
- the portrait on the about page
- all about-page copy
- the newsletter form posts nowhere

## Deploying

```bash
npx wrangler login
npm run deploy
```

Or push to `main` — `.github/workflows/deploy.yml` does it, given
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repo secrets.

See HOSTING.md for why Cloudflare, and CLAUDE.md for how the doors actually work.
