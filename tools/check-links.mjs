/* Walks every .html under public/ and fails if an internal href or src points
   at a file that doesn't exist. Cheap insurance against a bad rename.
 *
 * Recursive on purpose: it used to read only the top level, so anything in a
 * subdirectory was neither checked nor able to have its own links checked.
 * That was harmless while public/ was flat and stopped being so when the
 * forecasting dashboard moved into public/forecasting/. */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const ROOT = resolve('public');

/* The ryanbeckauthor archive is a mirror of the old site as it was actually
   served. A dead link inside it is a historical fact about that site, not a
   defect in this one -- works.html has pointed at a missing /works/SEER.html
   for years. Fixing them would make the archive a fiction, so it is not
   walked. Links INTO it from the live pages are still checked, because those
   are ours. */
const ARCHIVE = 'ryanbeckauthor';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ARCHIVE) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.html')) out.push(relative(ROOT, full));
  }
  return out;
}
const pages = walk(ROOT);
const problems = [];

for (const page of pages) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:|#|\/api\/)/.test(ref)) continue;
    let clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    /* A relative href resolves against the page's own directory, not the
       root. Treating them all as root-relative passed subdirectory links
       that would 404 in a browser. */
    /* A URL path is percent-encoded; the file on disk is not. The archive
       has posts named "Robots-and-Rubik's-Cubes.html", linked as %27, and a
       literal comparison called every one of them broken. The server itself
       redirects the encoded form to the decoded one and serves it. */
    try { clean = decodeURIComponent(clean); } catch { /* leave as-is */ }
    const target = clean.startsWith('/')
      ? join(ROOT, clean)
      : join(ROOT, dirname(page), clean);
    const pretty = ['', '.html'].some((ext) => existsSync(target + ext));
    if (!pretty) problems.push(`${page} -> ${ref}`);
  }
}

if (problems.length) {
  console.error('Broken internal links:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`OK — ${pages.length} pages, no broken internal links.`);
