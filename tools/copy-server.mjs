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
  const p = path.replace(/\/+$/, '') || '/';
  if (p.startsWith('/forecasting')) return 'tools/forecasting/build_page.py';
  const map = {
    '/': 'public/index.html',
    '/projects': 'public/projects.html',
    '/writing': 'public/writing.html',
    '/blog': 'public/blog.html',
    '/about': 'public/about.html',
    '/about-plain': 'public/about-plain.html',
    '/park-guides': 'public/park-guides.html',
  };
  return map[p] || null;
}

function lock() {
  return JSON.parse(readFileSync(join(COPY, '.copy-lock.json'), 'utf8'));
}

function blocksFor(path, sections) {
  const file = fileForPath(path);
  const all = lock().blocks;
  if (!file) return [];
  if (file !== 'tools/forecasting/build_page.py') {
    return all.filter((b) => b.file === file);
  }
  /* The dashboard pages share one source file. Keep this page's own
     introduction plus the note under each chart actually on it. */
  const slug = (path.replace(/\/+$/, '').split('/')[2] || '');
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
  await sh('node', ['tools/copy.mjs', 'extract']);
  return { ok: true, files: touched, log: steps.filter(Boolean) };
}

/* --------------------------------------------------------------- server */

const EDITOR = readFileSync(join(ROOT, 'tools', 'copy-editor.js'), 'utf8');
const TAG = '<script src="/__copy/editor.js" defer></script>';

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
      const { path, sections } = await body(req);
      const blocks = blocksFor(path, sections).map((b) => ({
        id: b.id, label: b.label, text: b.text, shape: b.shape,
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ blocks, file: fileForPath(path) }));
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
  return new Promise((resolve) => {
    const r = httpRequest({ host: '127.0.0.1', port, path: '/', method: 'HEAD' },
      () => resolve(true));
    r.on('error', () => resolve(false));
    r.end();
  });
}

const already = await portOpen(UPSTREAM);
let child = null;
if (!already) {
  console.log(`Starting wrangler dev on :${UPSTREAM} …`);
  child = spawn('npx', ['wrangler', 'dev', '--port', String(UPSTREAM)],
    { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 60 && !(await portOpen(UPSTREAM)); i++) {
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
