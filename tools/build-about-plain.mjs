#!/usr/bin/env node
/* Generate public/about-plain.html from public/about.html.
 *
 *   node tools/build-about-plain.mjs
 *
 * The plain page is the book's words as an ordinary document, for readers
 * with no JavaScript and for anyone who would rather just scroll. It used to
 * be a second hand-written file saying roughly the same things, and on
 * 2026-08-31 that stopped being true: Ryan rewrote the about copy in the book
 * and the plain page kept the draft he had replaced -- thirteen paragraphs in
 * one and not the other, including a job title that was no longer right, with
 * the colophon linking readers straight to the stale version.
 *
 * So it is generated. The book is the source; this is a view of it.
 *
 * ONLY <main> IS REPLACED. The head, topbar and footer of the existing file
 * are kept byte for byte, because they carry the canonical tag, the OG tags
 * and the nav -- and tools/site-url.mjs rewrites the domain in them. Rebuilding
 * those from a template here would mean two places to keep the domain right.
 *
 * The book's own furniture does not survive the trip, and must not: `.drop`,
 * `.marginal`, `.plate` and `.folio` are defined in tome.css, which the plain
 * page does not load, so they would render as unstyled text. They are
 * translated to classes site.css actually has.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'about.html');
const OUT = join(ROOT, 'public', 'about-plain.html');

const book = readFileSync(SRC, 'utf8');
const plain = readFileSync(OUT, 'utf8');

/* ---- pull the chapters out of the book ------------------------------- */

const articles = [];
const re = /<article class="page-src"([^>]*)>([\s\S]*?)<\/article>/g;
let m;
while ((m = re.exec(book))) {
  const type = (/data-type="([^"]+)"/.exec(m[1]) || [, 'text'])[1];
  articles.push({ type, html: m[2] });
}
if (!articles.length) {
  console.error('No <article class="page-src"> found in about.html.');
  process.exit(1);
}

/* ---- translate one chapter ------------------------------------------- */

function chapter(html) {
  let s = html;

  /* Book furniture with no meaning on a scrolling page. */
  s = s.replace(/\s*<p class="folio">[\s\S]*?<\/p>/g, '');
  /* The plain page IS the plain page; a link to it from itself is a loop. */
  s = s.replace(/\s*<p>\s*<a href="about-plain\.html">[\s\S]*?<\/a>\s*<\/p>/g, '');

  /* Classes that live in tome.css, which this page does not load. */
  s = s.replace(/<p class="drop">/g, '<p class="lede">');
  s = s.replace(/<p class="marginal">/g, '<p class="meta">');
  s = s.replace(/<p class="kicker">/g, '<span class="runic">')
       .replace(/(<span class="runic">[^<]*)<\/p>/g, '$1</span>');

  return s.trim();
}

function plate(html) {
  /* Keep the portrait, drop the book's plate framing. */
  const fig = /<figure class="plate">([\s\S]*?)<\/figure>/.exec(html);
  if (!fig) return '';
  return `<figure class="portrait">${fig[1].trim()}</figure>`;
}

/* ---- build <main> ----------------------------------------------------- */

const head = /<div class="wrap tome-head">([\s\S]*?)<\/div>/.exec(book);
const parts = [];

parts.push('<main>');
parts.push('  <section class="wrap page-head">');
parts.push(head ? head[1].trim().split('\n').map((l) => '    ' + l.trim())
                    .join('\n')
                : '    <h1>About</h1>');
parts.push('    <p class="lede" style="margin-top:14px">'
  + '<a href="about.html">Read it as the book instead &rarr;</a></p>');
parts.push('  </section>');

for (const a of articles) {
  if (a.type === 'cover' || a.type === 'backcover') continue;
  /* The colophon is about the BOOK -- its lettering, its leather, its
     generated page stock and dust. On a page with no book it describes
     something the reader cannot see. */
  if (/<p class="kicker">\s*Colophon\s*<\/p>/i.test(a.html)) continue;
  const body = a.type === 'plate' ? plate(a.html) : chapter(a.html);
  if (!body.replace(/<[^>]*>/g, '').trim() && a.type !== 'plate') continue;
  parts.push('');
  parts.push('  <section class="wrap">');
  parts.push(body.split('\n').map((l) => '    ' + l.trim()).join('\n'));
  parts.push('  </section>');
}

parts.push('</main>');
const main = parts.join('\n');

/* ---- splice it into the existing shell -------------------------------- */

const a = plain.indexOf('<main>');
const b = plain.indexOf('</main>') + '</main>'.length;
if (a < 0 || b < a) {
  console.error('about-plain.html has no <main> to replace.');
  process.exit(1);
}
const out = plain.slice(0, a) + main + plain.slice(b);
writeFileSync(OUT, out);

const kept = articles.filter((x) => x.type !== 'cover' && x.type !== 'backcover');
console.log(`about-plain.html rebuilt from about.html — ${kept.length} sections`);
