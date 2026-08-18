/* Sanity-check the docs against the code.
 *
 * Documentation that quietly goes stale is worse than none, and this project
 * has a lot of it. This asserts the things most likely to drift: that every
 * file the docs name exists, that the dust engine they claim is live is the
 * one actually wired up, that the npm scripts they tell you to run exist, and
 * that the pages they call unlinked experiments really are.
 *
 *   node tools/check-docs.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
const read = f => readFileSync(f, 'utf8');
const claude = read('CLAUDE.md'), readme = read('README.md'), handoff = read('HANDOFF.md');
const about = read('public/about.html');
const fails = [];

const check = (cond, msg) => { if (!cond) fails.push(msg); };

// every file the docs name should exist
const named = new Set();
for (const doc of [claude, readme, handoff]) {
  for (const m of doc.matchAll(/`((?:public\/|tools\/|worker\/|assets\/|libtome\/)[\w./-]+)`/g)) named.add(m[1]);
}
for (const f of named) {
  const p = f.startsWith('assets/') ? 'public/' + f : f;
  check(existsSync(p), `docs name a file that does not exist: ${f}`);
}

// the dust engine the docs claim is live must be the one wired up
const kind = (about.match(/data-dust-kind="(\w+)"/) || [])[1];
check(kind === 'mist', `about.html uses ${kind}`);
check(/`mist`[^\n]*chosen one/.test(claude), 'CLAUDE.md does not mark mist as the chosen engine');

// npm scripts the docs tell you to run must exist
const pkg = JSON.parse(read('package.json'));
for (const s of ['serve', 'dev', 'deploy']) check(pkg.scripts[s], `package.json is missing the ${s} script`);

// wrangler must point at what we actually ship
check(read('wrangler.toml').includes('directory = "./public"'), 'wrangler assets directory is wrong');
check(read('worker/index.js').includes('/api/substack'), 'worker no longer serves /api/substack');

// the experiments the docs say are unlinked really are
for (const p of ['index.html', 'projects.html', 'writing.html', 'blog.html', 'about.html']) {
  const h = read('public/' + p);
  check(!/href="(compare|dust-lab)\.html"/.test(h.replace(/<footer[\s\S]*/, '')), `${p} links to an experiment page`);
}
for (const p of ['compare.html', 'dust-lab.html']) {
  check(read('public/' + p).includes('name="robots" content="noindex"'), `${p} is not noindex`);
}

console.log(fails.length ? 'PROBLEMS:\n - ' + fails.join('\n - ') : `Docs check out (${named.size} referenced files verified).`);
process.exit(fails.length ? 1 : 0);
