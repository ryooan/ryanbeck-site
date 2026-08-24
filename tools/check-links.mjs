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

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
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
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    /* A relative href resolves against the page's own directory, not the
       root. Treating them all as root-relative passed subdirectory links
       that would 404 in a browser. */
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
