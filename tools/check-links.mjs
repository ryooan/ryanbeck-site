/* Walks public/*.html and fails if an internal href or src points at
   a file that doesn't exist. Cheap insurance against a bad rename. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('public');
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const problems = [];

for (const page of pages) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:|#|\/api\/)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.startsWith('/') ? join(ROOT, clean) : join(ROOT, clean);
    const pretty = ['', '.html'].some((ext) => existsSync(target + ext));
    if (!pretty) problems.push(`${page} -> ${ref}`);
  }
}

if (problems.length) {
  console.error('Broken internal links:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`OK — ${pages.length} pages, no broken internal links.`);
