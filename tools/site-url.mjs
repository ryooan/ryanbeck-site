#!/usr/bin/env node
/* Propagate site.config.json's origin into the files that name the site.
 *
 * This site has no build step on purpose, so the domain cannot be a variable
 * interpolated at render time -- the HTML is what ships. The next best thing
 * is one file that defines it, one command that rewrites the rest, and a
 * check that fails the build when they disagree.
 *
 *   node tools/site-url.mjs          # report drift, change nothing
 *   node tools/site-url.mjs --write  # rewrite every file to match the config
 *
 * `npm test` runs the reporting form.
 *
 * Only Python, the Worker and the browser get the config for free -- they can
 * read or be handed it at runtime, so they hold no domain at all. Static HTML,
 * the sitemap, robots.txt and wrangler.toml are rewritten here.
 *
 * IMPORTANT: this matches SPECIFIC SLOTS, never "any URL". An earlier version
 * rewrote every host that was not on an allowlist, which meant it happily
 * pointed amazon.com and goodreads.com at this site. The site's own address
 * only ever appears in a canonical tag, an og: tag, a <loc>, robots' Sitemap
 * line, or a marked constant -- so those are the only things touched.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const ORIGIN = cfg.origin.replace(/\/$/, '');

/* Each rule is [file glob-ish path, regex with the origin as group 1]. The
 * regex must capture ONLY the scheme+host so the path after it survives. */
const H = 'https?://[a-z0-9.-]+\\.[a-z]{2,}';
const RULES = [
  // <link rel="canonical" href="ORIGIN/...">
  [/(<link\s+rel="canonical"\s+href=")https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi, 1],
  // <meta property="og:url|og:image" content="ORIGIN/...">
  [new RegExp(
    `(<meta\\s+property="og:(?:url|image)"\\s+content=")${H}`, 'gi'), 1],
  // <meta name="twitter:image" content="ORIGIN/...">
  [new RegExp(`(<meta\\s+name="twitter:image"\\s+content=")${H}`, 'gi'), 1],
  // sitemap <loc>ORIGIN/...</loc>
  [new RegExp(`(<loc>)${H}`, 'gi'), 1],
  // robots.txt "Sitemap: ORIGIN/sitemap.xml"
  [new RegExp(`(Sitemap:\\s*)${H}`, 'gi'), 1],
  // A line explicitly marked as carrying the site origin:
  //   pattern = "example.com"   # site-url
  [/(^.*?["'])[a-z0-9.-]+\.[a-z]{2,}(["'].*#\s*site-url\s*$)/gim, 2],
];

const FILES = [
  'public/index.html', 'public/projects.html', 'public/writing.html',
  'public/blog.html', 'public/about.html', 'public/about-plain.html', 'public/privacy.html',
  'public/park-guides.html', 'public/404.html', 'public/compare.html',
  'public/dust-lab.html', 'public/not-human.html',
  'public/sitemap.xml', 'public/robots.txt',
  'wrangler.toml',
];

const HOST = ORIGIN.replace(/^https?:\/\//, '');
if (existsSync(join(ROOT, 'public/posts'))) {
  for (const file of readdirSync(join(ROOT, 'public/posts'), { recursive: true })) {
    if (file.endsWith('.html')) FILES.push('public/posts/' + file.replaceAll('\\', '/'));
  }
}
const write = process.argv.includes('--write');
const stale = [];

for (const rel of FILES) {
  const path = join(ROOT, rel);
  let src;
  try { src = readFileSync(path, 'utf8'); } catch { continue; }
  let out = src;

  for (const [re, groups] of RULES) {
    out = out.replace(re, (...a) =>
      groups === 2 ? a[1] + HOST + a[2] : a[1] + ORIGIN);
  }

  if (out !== src) {
    stale.push(rel);
    if (write) writeFileSync(path, out);
  }
}

if (!stale.length) {
  console.log(`Site URL OK — every file uses ${HOST}.`);
} else if (write) {
  console.log(`Site URL set to ${HOST} in ${stale.length} file(s):`);
  stale.forEach((n) => console.log('  ' + n));
  console.log('\nNow run: python tools/forecasting/build_page.py');
} else {
  console.error(
    `Site URL drift — ${stale.length} file(s) disagree with ` +
    `site.config.json (${HOST}):`);
  stale.forEach((n) => console.error('  ' + n));
  console.error('\nFix with: npm run site-url');
  process.exit(1);
}

if (!cfg.chosen) {
  console.log(
    `\n  ⚠ ${HOST} is a PLACEHOLDER — site.config.json says ` +
    '"chosen": false.' +
    '\n    ryanbeck.com is taken. The real domain is still to be picked.' +
    '\n    Set `origin`, run `npm run site-url`, then flip `chosen` to true.');
}
