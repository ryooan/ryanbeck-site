#!/usr/bin/env node
/* Mirror www.ryanbeckauthor.com into public/ryanbeckauthor/.
 *
 *   node tools/mirror-old-site.mjs           # crawl and write
 *   node tools/mirror-old-site.mjs --dry     # crawl, report, write nothing
 *
 * WHY THIS EXISTS, AND WHY IT IS URGENT. Ryan is pointing ryanbeckauthor.com
 * at this site. The moment that DNS changes, the old site stops answering and
 * every inbound link to nineteen posts breaks. So the old site is captured
 * here first and served at the same paths under /ryanbeckauthor/, which means
 * /2021/08/27/Afghanistan-Uncertainty.html can be redirected to
 * /ryanbeckauthor/2021/08/27/Afghanistan-Uncertainty.html and keep working.
 *
 * WHY IT CRAWLS RATHER THAN BUILDS. The Jekyll source is right here, in
 * projects/personal/forecasting-source (misleadingly named -- it is the whole
 * old website, of which the forecasting dashboards were one part). Building it
 * would be more exact, but Ruby and Jekyll are not installed on this machine
 * and its `_site` directory is a stale partial build: twelve pages, none of
 * the posts. Crawling the live site captures what is actually being served,
 * which is the thing that has to keep working.
 *
 * Links are rewritten so the archive navigates within itself, and NOTHING
 * else is touched -- no injected banner, no restyling. It is an archive; it
 * should look like what it is archiving.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync }
  from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'ryanbeckauthor');
const BASE = 'https://www.ryanbeckauthor.com';
const PREFIX = '/ryanbeckauthor';
const DRY = process.argv.includes('--dry');

/* Politeness: one request at a time with a small gap. This is a nineteen-post
   Jekyll site on GitHub Pages, not something to hammer. */
const GAP_MS = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Crawling from the homepage is not enough for "the entirety of the site".
   Nothing on it links to /works, /all-posts.json or thirteen of the fourteen
   forecasting dashboards -- the old site had no index for them, so a link
   crawl finds only the one that happens to be linked. The Jekyll SOURCE is
   the authoritative list of what the site publishes, so candidate URLs are
   derived from it and probed; whatever answers 200 gets archived. */
const SOURCE = join(ROOT, '..', 'forecasting-source');
const SKIP_DIRS = new Set(['_site', '_layouts', '_includes', '_data',
                           'my_collections', '.git', '.github']);
const SERVED = /\.(html|json|css|js|png|jpe?g|gif|svg|ico|webmanifest|xml|pdf|txt)$/i;

function seedsFromSource(dir = SOURCE, rel = '') {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('_')) continue;
      out.push(...seedsFromSource(join(dir, e.name), rel + '/' + e.name));
    } else if (SERVED.test(e.name)) {
      const p = rel + '/' + e.name;
      out.push(p);
      /* Jekyll serves a top-level page without its extension. */
      if (/\.html$/.test(e.name) && !rel.startsWith('/forecasting')) {
        out.push(p.replace(/\.html$/, ''));
      }
    }
  }
  return out;
}

const seen = new Set();
const queue = ['/'];
const written = [];
const failed = [];
let bytes = 0;

/* A URL path -> the file it is saved as. Jekyll serves /about with no
   extension; `html_handling = "none"` in wrangler.toml means the asset layer
   will not find about.html for /about on its own, so extensionless pages are
   saved WITH .html and given an explicit rewrite in _redirects. */
function fileFor(path) {
  let p = decodeURIComponent(path.split('#')[0].split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (!extname(p)) p += '.html';
  return p.replace(/^\/+/, '');
}

function isPage(contentType) {
  return /text\/html/.test(contentType || '');
}

/* Absolute-to-this-site and root-relative URLs both become /ryanbeckauthor/…
   Everything else (Substack, Amazon, Goodreads) is left exactly as it is. */
function rewrite(text) {
  let s = text;
  /* ORDER MATTERS. Rewriting the absolute URLs first turns
     href="https://www.ryanbeckauthor.com/subscribe" into
     href="/ryanbeckauthor/subscribe", which the root-relative rule below then
     matches and prefixes a SECOND time. Root-relative first is safe, because
     an absolute URL starts with "h" and cannot match `href="/`. */
  s = s.replace(/((?:href|src|action|content)=")\/(?!\/)/gi, `$1${PREFIX}/`);
  s = s.replace(/(url\(\s*['"]?)\/(?!\/)/gi, `$1${PREFIX}/`);
  s = s.replace(/(srcset=")([^"]*)"/gi, (m, a, list) =>
    a + list.replace(/(^|,\s*)\/(?!\/)/g, `$1${PREFIX}/`) + '"');

  for (const host of ['https://www.ryanbeckauthor.com',
                      'http://www.ryanbeckauthor.com',
                      'https://ryanbeckauthor.com',
                      'http://ryanbeckauthor.com']) {
    s = s.split(host).join(PREFIX);
  }
  /* Belt and braces: if any path did slip through twice, flatten it. */
  s = s.split(PREFIX + PREFIX).join(PREFIX);
  return s;
}


function absolutize(href, from) {
  try {
    const u = new URL(href, BASE + from);
    if (u.host !== 'www.ryanbeckauthor.com' && u.host !== 'ryanbeckauthor.com') {
      return null;
    }
    return u.pathname + (u.search || '');
  } catch { return null; }
}

/* Everything the page needs, so the archive is not a set of unstyled pages
   pointing at a host that no longer answers. */
function linksIn(html, from, isCss) {
  const out = new Set();
  const pats = isCss ? [/url\(\s*['"]?([^)'"]+)/gi] : [
    /<a[^>]+href="([^"#][^"]*)"/gi,
    /<link[^>]+href="([^"#][^"]*)"/gi,
    /<script[^>]+src="([^"]+)"/gi,
    /<img[^>]+src="([^"]+)"/gi,
    /<source[^>]+srcset="([^"]+)"/gi,
    /<meta[^>]+content="(\/[^"]+\.(?:png|jpe?g|gif|svg|webp|ico))"/gi,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(html))) {
      const p = absolutize(m[1].trim(), from);
      if (p) out.add(p);
    }
  }
  return [...out];
}

async function main() {
  const seeds = [...new Set(seedsFromSource())].filter((p) => !p.includes(' '));
  console.log(`Seeding ${seeds.length} candidate paths from the Jekyll source`);
  queue.push(...seeds);

  if (!DRY) {
    if (existsSync(OUT)) rmSync(OUT, { recursive: true });
    mkdirSync(OUT, { recursive: true });
  }

  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);

    let res;
    try {
      res = await fetch(BASE + path, {
        headers: { 'user-agent': 'ryanbeck-site-archiver (own site)' },
      });
    } catch (e) {
      failed.push(`${path} — ${e.message}`);
      continue;
    }
    if (!res.ok) {
      /* Seeds are candidates, so a 404 is a normal answer: the source holds
         files Jekyll does not publish. Only report one for a path something
         actually linked to. */
      if (!seeds.includes(path)) failed.push(`${path} — HTTP ${res.status}`);
      continue;
    }

    const type = res.headers.get('content-type') || '';
    const rel = fileFor(path);
    const dest = join(OUT, rel);

    if (isPage(type)) {
      const html = await res.text();
      linksIn(html, path).forEach((p) => { if (!seen.has(p)) queue.push(p); });
      const body = rewrite(html);
      bytes += Buffer.byteLength(body);
      if (!DRY) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, body);
      }
      written.push({ rel, path, kind: 'page' });
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      let body = buf;
      if (/text\/css/.test(type)) {
        const raw = buf.toString('utf8');
        /* Read the ORIGINAL, then rewrite. Reading the rewritten copy queues
           paths that already carry the prefix, and the old host 404s them. */
        linksIn(raw, path, true)
          .forEach((p) => { if (!seen.has(p)) queue.push(p); });
        body = Buffer.from(rewrite(raw));
      }
      bytes += body.length;
      if (!DRY) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, body);
      }
      written.push({ rel, path, kind: 'asset' });
    }
    await sleep(GAP_MS);
  }

  const pages = written.filter((w) => w.kind === 'page');
  const assets = written.filter((w) => w.kind === 'asset');
  console.log(`\n${DRY ? '[dry run] ' : ''}Mirrored ${written.length} files ` +
              `(${pages.length} pages, ${assets.length} assets), ` +
              `${(bytes / 1e6).toFixed(1)} MB`);

  /* Extensionless URLs need an explicit rewrite, same reason the forecasting
     pages do. Emitted as a delimited block so re-running replaces it. */
  const rewrites = pages
    .filter((p) => !extname(p.path.split('?')[0]) || p.path.endsWith('/'))
    .map((p) => {
      const from = PREFIX + p.path.replace(/\/$/, '');
      return `${(from || PREFIX).padEnd(58)} ${PREFIX}/${p.rel}   200`;
    });
  rewrites.unshift(`${PREFIX.padEnd(58)} ${PREFIX}/index.html   200`);

  /* Paths that exist ONLY on the old site, for when its domain lands here.
     Year folders and tags are safe as splats; the forecasting dashboards are
     listed one by one because /forecasting is also where the new Data
     Dashboards live, and a splat there would swallow them. */
  const years = [...new Set(pages
    .map((p) => (p.path.match(/^\/(20\d\d)\//) || [])[1])
    .filter(Boolean))].sort();
  const pad = (a, b) => a.padEnd(56) + ' ' + b;
  /* Exact paths first, splats after: wrangler warns that a literal rule
     below a splat is matched less efficiently, and it prints that warning
     once per rule at boot -- forty lines of it. */
  const incoming = [
    pad('/works', `${PREFIX}/works.html   301`),
    ...pages
      .filter((p) => p.path.startsWith('/forecasting/')
                  && p.path.endsWith('.html'))
      .map((p) => pad(p.path, `${PREFIX}${p.path}   301`)),
    ...years.map((y) => pad(`/${y}/*`, `${PREFIX}/${y}/:splat   301`)),
    pad('/tags/*', `${PREFIX}/tags/:splat   301`),
    pad('/vaccines/*', `${PREFIX}/vaccines/:splat   301`),
  ];

  if (!DRY) writeRedirects([...new Set(rewrites)], incoming);

  if (failed.length) {
    console.log(`\n${failed.length} did not come through:`);
    failed.slice(0, 20).forEach((f) => console.log('  ' + f));
  }
  console.log(`\nServed at ${PREFIX}/… — e.g.`);
  pages.slice(0, 3).forEach((p) => console.log(`  ${PREFIX}${p.path}`));
}

function writeRedirects(lines, incoming) {
  const path = join(ROOT, 'public', '_redirects');
  const start = '# >>> ryanbeckauthor archive (generated by tools/mirror-old-site.mjs)';
  const end = '# <<< ryanbeckauthor archive';
  const block = [
    start,
    '# The old site, captured before ryanbeckauthor.com is repointed here.',
    '#',
    '# Part one: a page whose URL has no extension needs an explicit rewrite,',
    '# because wrangler.toml sets html_handling = "none".',
    ...lines,
    '#',
    '# Part two: once ryanbeckauthor.com points HERE, a request for',
    '# ryanbeckauthor.com/2021/08/27/Foo.html arrives carrying that exact',
    '# path, so the paths unique to the old site are sent into the archive.',
    '# /about, /blog and /writing are deliberately absent: they exist on both',
    '# sites, and a visitor is better served by the current one.',
    ...incoming,
    end,
  ].join('\n');

  let text = '';
  try { text = readFileSync(path, 'utf8'); } catch { text = ''; }
  if (text.includes(start) && text.includes(end)) {
    text = text.slice(0, text.indexOf(start)) + block
         + text.slice(text.indexOf(end) + end.length);
  } else {
    text = text.replace(/\s*$/, '') + '\n\n' + block + '\n';
  }
  writeFileSync(path, text);
  console.log(`_redirects: ${lines.length} archive rewrites`);
}

await main();
