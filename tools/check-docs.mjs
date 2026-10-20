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
for (const s of ['serve', 'dev', 'deploy', 'test']) check(pkg.scripts[s], `package.json is missing the ${s} script`);

// wrangler must point at what we actually ship
const wrangler = read('wrangler.toml');
check(wrangler.includes('directory = "./public"'), 'wrangler assets directory is wrong');
check(read('worker/index.js').includes('/api/substack'), 'worker no longer serves /api/substack');
// not_found_handling = "404-page" answers unmatched paths before the Worker
// runs, so /api/* has to be listed or every API route returns the 404 page.
check(/run_worker_first\s*=\s*\[[^\]]*"\/api\/\*"/.test(wrangler),
  'wrangler.toml run_worker_first lost "/api/*" — /api/substack will 404');
if (existsSync('.deploy/wrangler.json')) {
  const deployed = JSON.parse(read('.deploy/wrangler.json')).assets?.run_worker_first || [];
  check(deployed.includes('/api/*'), '.deploy/wrangler.json run_worker_first lacks "/api/*" — regenerate it');
}

// html_handling = "none" is load-bearing: the platform default fights the
// _redirects 200-rewrites and every pretty URL dies in a 307 loop. The docs
// say so in three places, so the setting must actually be there.
check(/html_handling\s*=\s*"none"/.test(wrangler),
  'wrangler.toml lost html_handling = "none" — pretty URLs will 307-loop');
check(/^\/\s+\/index\.html\s+200/m.test(read('public/_redirects')),
  '_redirects lost the explicit root rewrite, which html_handling="none" requires');

// The docs warn that tome.css is shared furniture AND the hand-built book,
// so deleting it with compare.html breaks the about page. If about.html ever
// stops loading it, that warning is stale and should be rewritten.
check(read('public/about.html').includes('css/tome.css'),
  'about.html no longer loads tome.css — the CLAUDE.md warning about deleting it is now stale');

// CSS and JS must not be cached hard: nothing here has a hashed filename, so
// a long max-age pins visitors to stale code after a deploy.
const headers = read('public/_headers');
for (const dir of ['/assets/css/*', '/assets/js/*']) {
  const block = headers.split(dir)[1] || '';
  check(/no-cache/.test(block.split('\n').slice(0, 4).join('\n')),
    `_headers no longer sends no-cache for ${dir}`);
}

// The deploy workflow's branch and the repo's branch have to agree, or CI
// silently never runs. The docs call this out; keep them honest.
if (existsSync('.github/workflows/deploy.yml')) {
  const wf = read('.github/workflows/deploy.yml');
  const onMain = /branches:\s*\[\s*main\s*\]/.test(wf);
  const noted = /triggers on push to \*\*`main`\*\*, but this repo's\nbranch is \*\*`master`\*\*/.test(claude) ||
                /branch is `master`; the deploy workflow triggers on `main`/.test(read('AGENTS.md'));
  check(!onMain || noted, 'deploy.yml targets main but no doc explains the branch mismatch');
}

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
