/* Only CSVs linked from actual dashboard pages may be served as datasets. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const publicFiles = readdirSync('public', { recursive: true }).map(p => p.replaceAll('\\', '/'));
const linked = new Set();
for (const file of readdirSync('public/forecasting')) {
  if (!file.endsWith('.html')) continue;
  const html = readFileSync(join('public/forecasting', file), 'utf8');
  assert(!html.includes('/forecasting/archive'), 'Removed archive is still linked');
  for (const match of html.matchAll(/href="(\/data\/forecasting\/[^"?#]+\.csv)"/g)) {
    linked.add(match[1].slice(1));
  }
}
const served = publicFiles.filter(p => p.startsWith('data/') && !p.endsWith('/') && /\.[^/]+$/.test(p));
assert.deepEqual(new Set(served), linked, 'Public data must exactly match dashboard CSV download links');
const approved = JSON.parse(readFileSync('tools/forecasting/public-csvs.json', 'utf8'));
assert.deepEqual(new Set(approved.map(p => 'data/forecasting/' + p)), linked, 'CSV allowlist drift');
assert(!existsSync('public/forecasting/archive.html'), 'Archive page must not be served');
for (const file of publicFiles) {
  if (/\.(csv|gz|xlsx?|rdata|rds|parquet|zip)$/i.test(file)) {
    assert(linked.has(file), 'Unapproved public dataset: ' + file);
  }
}
console.log(`Public data checked: only ${linked.size} dashboard-linked CSVs are served.`);
