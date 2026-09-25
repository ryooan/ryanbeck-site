#!/usr/bin/env node
/* Edit the site's copy in the browser, on the page it appears on.
 *
 *   npm run edit          # then open http://localhost:8788
 *
 * Every page gets a tab on its right edge. Open it and you get the copy for
 * THAT page as text areas; save and the words are written into copy/*.md,
 * applied to the source, the dashboards rebuilt, and the page reloaded.
 *
 * WHY THIS IS A PROXY, AND NOT A SCRIPT ON THE SITE.
 * The obvious build is a <script> tag on every page that turns itself off
 * unless the hostname is localhost. That ships a dev tool to production and
 * costs every real visitor a request for something they can never use. This
 * server sits in FRONT of `wrangler dev` instead and injects the editor into
 * HTML on its way past, so nothing under public/ knows the editor exists and
 * there is nothing to strip before deploying. It also means routing,
 * _redirects and /api/* stay wrangler's job, exactly as in production.
 *
 * It binds to 127.0.0.1 and refuses a request that did not come from the
 * loopback interface: this thing writes files.
 */
import { createServer, request as httpRequest } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPY = join(ROOT, 'copy');

const PORT = Number(process.env.EDIT_PORT || 8788);
const UPSTREAM = Number(process.env.SITE_PORT || 8787);

/* --------------------------------------------------------- which blocks */

/* A page's copy lives in a source file; this says which. Dashboard pages all
 * come out of one Python file, so those are narrowed further by the section
 * ids the page itself reports -- see /__copy/blocks. */
function fileForPath(path) {
  /* Both spellings of every URL have to work. _redirects gives each page a
     pretty URL, but every link INSIDE the site is written the short way --
     href="projects.html" -- so browsing from the nav lands on
     /projects.html and matching only the pretty form found nothing. */
  let p = String(path || '/').split('?')[0].split('#')[0];
  p = p.replace(/\.html$/i, '').replace(/\/index$/i, '/');
  p = p.replace(/(.)\/+$/, '$1') || '/';

  if (p.startsWith('/forecasting')) return 'tools/forecasting/build_page.py';
  const map = {
    '/': 'public/index.html',
    '/projects': 'public/projects.html',
    '/writing': 'public/writing.html',
    '/blog': 'public/blog.html',
    '/about': 'public/about.html',
    /* Generated from about.html; nothing here is editable. The panel says
       so rather than offering boxes whose contents get overwritten. */
    '/park-guides': 'public/park-guides.html',
    '/404': 'public/404.html',
  };
  return map[p] || null;
}

const KNOWN_FILES = new Set([
  'public/index.html', 'public/projects.html', 'public/writing.html',
  'public/blog.html', 'public/about.html',
  'public/park-guides.html', 'public/404.html',
  'tools/forecasting/build_page.py',
]);

function lock() {
  return JSON.parse(readFileSync(join(COPY, '.copy-lock.json'), 'utf8'));
}

function blocksFor(path, sections, known) {
  /* The proxy knows exactly which file it served, including when the answer
     was the 404 page. Trust that over re-deriving it from the URL. */
  const file = KNOWN_FILES.has(known) ? known : fileForPath(path);
  const all = lock().blocks;
  if (!file) return [];
  if (file !== 'tools/forecasting/build_page.py') {
    return all.filter((b) => b.file === file);
  }
  /* The dashboard pages share one source file. Keep this page's own
     introduction plus the note under each chart actually on it. */
  const slug = (String(path).split('?')[0].replace(/\.html$/i, '')
                  .replace(/\/+$/, '').split('/')[2] || '');
  if (!slug || slug === 'index') {
    return all.filter((b) => b.id.startsWith('dash.page.index.'));
  }
  const want = sections || [];
  const pick = (id) => all.filter((b) => b.id === id);
  /* Page furniture first, then each chart in the order it appears. The lock
     is grouped by position in the Python file, which is not the order a
     reader meets them on the page. */
  return [
    ...pick(`dash.page.${slug}.title`),
    ...pick(`dash.page.${slug}.kicker`),
    ...pick(`dash.page.${slug}.nav`),
    ...pick(`dash.page.${slug}.blurb`),
    ...want.flatMap((sec) => [
      ...pick(`dash.chart.${sec}.title`),
      ...pick(`dash.chart.${sec}.note`),
    ]),
  ];
}

/* ------------------------------------------------------------- the save */

const BLOCK_RE = (id) =>
  new RegExp(`(<!--\\s*id:\\s*${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*-->\\n)([\\s\\S]*?)(?=\\n## |\\n---\\n|$)`);

function writeEdits(edits) {
  const touched = [];
  for (const name of readdirSync(COPY)) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const path = join(COPY, name);
    const src = readFileSync(path, 'utf8');
    let out = src;
    for (const [id, text] of Object.entries(edits)) {
      const m = BLOCK_RE(id).exec(out);
      if (!m) continue;
      out = out.slice(0, m.index + m[1].length)
          + '\n' + text.trim() + '\n'
          + out.slice(m.index + m[0].length);
    }
    if (out !== src) { writeFileSync(path, out); touched.push(name); }
  }
  return touched;
}

async function save(edits) {
  const touched = writeEdits(edits);
  if (!touched.length) return { ok: true, note: 'Nothing changed.' };
  const steps = [];
  const sh = async (cmd, args) => {
    const { stdout, stderr } = await run(cmd, args, { cwd: ROOT });
    steps.push((stdout || '').trim() || (stderr || '').trim());
  };
  /* Order matters. `apply` refuses to splice into a file whose hash has
     moved, so the final `extract` is not optional -- it re-points the lock at
     what the files now say, ready for the next save. */
  await sh('node', ['tools/copy.mjs', 'apply']);
  await sh('python', ['tools/forecasting/build_page.py']);
  /* The plain about page is a view of the book, so an edit to the book has
     to be pushed through it -- otherwise the two drift apart again, which is
     the exact failure this generator was written to end. */
  await sh('node', ['tools/build-about-plain.mjs']);
  await sh('node', ['tools/copy.mjs', 'extract']);
  return { ok: true, files: touched, log: steps.filter(Boolean) };
}

/* --------------------------------------------------------------- server */

const EDITOR = readFileSync(join(ROOT, 'tools', 'copy-editor.js'), 'utf8');
const tagFor = (file) =>
  `<script src="/__copy/editor.js" data-copy-src="${file || ''}" ` +
  'defer></script>';

function body(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 4e6) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } });
  });
}

const server = createServer(async (req, res) => {
  /* This process writes to the repo. Nothing off-box gets to talk to it. */
  const ip = req.socket.remoteAddress || '';
  if (!/^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(ip)) {
    res.writeHead(403).end('local only');
    return;
  }

  if (req.url === '/__copy/editor.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8',
                         'cache-control': 'no-store' });
    res.end(EDITOR);
    return;
  }

  if (req.url === '/__copy/blocks' && req.method === 'POST') {
    try {
      const { path, sections, file } = await body(req);
      const list = blocksFor(path, sections, file);
      const blocks = list.map((b) => ({
        id: b.id, label: b.label, text: b.text, shape: b.shape,
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        blocks,
        file: KNOWN_FILES.has(file) ? file : fileForPath(path),
      }));
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (req.url === '/__copy/save' && req.method === 'POST') {
    try {
      const { edits } = await body(req);
      const out = await save(edits || {});
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.stderr || e.message) }));
    }
    return;
  }

  /* Everything else is the real site, proxied. */
  const up = httpRequest({
    host: '127.0.0.1', port: UPSTREAM, path: req.url, method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${UPSTREAM}`,
               /* Ask for plain bytes so the HTML can be rewritten. */
               'accept-encoding': 'identity' },
  }, (r) => {
    const type = r.headers['content-type'] || '';
    if (!type.includes('text/html')) {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
      return;
    }
    let html = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { html += c; });
    r.on('end', () => {
      /* A 404 really is the 404 page's copy, whatever the URL said. */
      const file = r.statusCode === 404
        ? 'public/404.html'
        : fileForPath(new URL(req.url, 'http://x').pathname);
      const TAG = tagFor(file);
      html = html.includes('</body>')
        ? html.replace('</body>', TAG + '\n</body>')
        : html + TAG;
      const h = { ...r.headers, 'cache-control': 'no-store' };
      delete h['content-length'];
      delete h['content-encoding'];
      res.writeHead(r.statusCode, h);
      res.end(html);
    });
  });
  up.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/html' }).end(
      `<h1>The site is not running</h1><p>Nothing is answering on port
       ${UPSTREAM}. This server only adds the copy editor; the site itself is
       <code>wrangler dev</code>.</p>`);
  });
  req.pipe(up);
});

/* ----------------------------------------------------------------- boot */

function portOpen(port) {
  /* GET with a timeout, not HEAD. A bare HEAD hangs forever against a
     wrangler that does not answer it -- no response, no error, so the promise
     never settles and the whole server sits in its boot probe printing
     nothing. Anything that answers at all counts as open, including a 404. */
  return new Promise((resolve) => {
    const q = httpRequest(
      { host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 2000 },
      (res) => { res.resume(); resolve(true); });
    q.on('timeout', () => { q.destroy(); resolve(false); });
    q.on('error', () => resolve(false));
    q.end();
  });
}


const already = await portOpen(UPSTREAM);
let child = null;
if (!already) {
  console.log(`Starting wrangler dev on :${UPSTREAM} …`);
  child = spawn('npx', ['wrangler', 'dev', '--port', String(UPSTREAM)],
    { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });
  /* 90s, not 30. _redirects grew by forty rules when the ryanbeckauthor
     archive landed, and wrangler parses every one of them at boot --
     it now takes well over half a minute to answer, and the shorter
     wait gave up on a server that was starting normally. */
  for (let i = 0; i < 180 && !(await portOpen(UPSTREAM)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await portOpen(UPSTREAM))) {
    console.error(`wrangler did not come up on :${UPSTREAM}. ` +
                  'Run `npm run dev` in another terminal, then this again.');
    process.exit(1);
  }
}

const bye = () => { if (child) child.kill(); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Copy editor:  http://localhost:${PORT}`);
  console.log(`  (the site itself is on :${UPSTREAM}` +
              `${already ? ', already running' : ', started here'})\n`);
  console.log('  Open any page and use the tab on the right edge.');
  console.log('  Saving writes copy/*.md, applies it, and rebuilds.\n');
});
