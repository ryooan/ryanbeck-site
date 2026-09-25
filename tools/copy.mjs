#!/usr/bin/env node
/* Round-trip the site's copy through editable markdown.
 *
 *   node tools/copy.mjs extract   # site  -> copy/*.md   (+ copy/.copy-lock.json)
 *   node tools/copy.mjs apply     # copy/*.md -> site
 *   node tools/copy.mjs check     # would applying change anything?
 *
 * Why a lock file. Extraction has to read HTML and Python; putting text BACK
 * into them must not. So extraction records, for every block, the exact
 * source file, the exact byte range, and the exact original text. Applying
 * never parses anything: it rebuilds each file from its original bytes,
 * splicing new text into recorded ranges. The lock also carries a hash of
 * each source file, so if a file changed after extraction the apply refuses
 * rather than splicing into moved offsets.
 *
 * The proof that extraction is faithful is `extract` then `apply` with no
 * edits leaving a clean git diff. That is what `check` runs.
 *
 * about-plain.html deliberately repeats about.html's words. Both are
 * extracted, and blocks whose text matches are linked so an edit to one is
 * written to both -- see PAIRS.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync }
  from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'copy');
const LOCK = join(OUT, '.copy-lock.json');

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/* ------------------------------------------------------------------ html */

/* Find every occurrence of an element, returning its inner range. Counts
 * nested same-name tags so a <p> inside a <div> does not close the <div>.
 * Deliberately small: this runs over eight hand-written files whose shape we
 * control, not over the open web. */
function findAll(src, tag, attrRe) {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  const out = [];
  let m;
  while ((m = open.exec(src))) {
    const attrs = m[1] || '';
    if (attrRe && !attrRe.test(attrs)) continue;
    const from = m.index + m[0].length;
    let depth = 1;
    const scan = new RegExp(`<(/?)${tag}(\\s[^>]*)?>`, 'gi');
    scan.lastIndex = from;
    let t;
    while ((t = scan.exec(src))) {
      depth += t[1] ? -1 : 1;
      if (!depth) break;
    }
    if (!depth && t) out.push({ start: from, end: t.index, attrs });
  }
  return out;
}

function attrRange(src, re) {
  /* re must have exactly one capture group, the attribute VALUE. */
  const m = re.exec(src);
  if (!m) return null;
  const v = m[1];
  const start = m.index + m[0].lastIndexOf(v);
  return { start, end: start + v.length };
}

/* ---------------------------------------------------------- presentation */

/* Entity <-> character. Two rules, both learned the hard way:
 *
 * `&#x27;` is U+0027, a STRAIGHT apostrophe -- it was mapped to a curly
 * one here, so "everyone&#x27;s" was shown in the editor with a curly
 * apostrophe when the page actually renders a straight one. A reviewer
 * would have been reading punctuation the site does not have.
 *
 * The third column is whether a character may be re-spelled as this
 * entity when a block is EDITED. Quotes are false: `"` closes an HTML
 * attribute and delimits a Python string, and turning one into `&quot;`
 * broke an <a href> the one time it was tried. A literal quote in text is
 * valid anyway -- these files declare UTF-8. */
const ENT = [
  ['&mdash;', '\u2014', true], ['&ndash;', '\u2013', true],
  ['&middot;', '\u00b7', true], ['&larr;', '\u2190', true],
  ['&rarr;', '\u2192', true], ['&times;', '\u00d7', true],
  ['&plusmn;', '\u00b1', true], ['&hellip;', '\u2026', true],
  ['&rsquo;', '\u2019', true], ['&lsquo;', '\u2018', true],
  ['&ldquo;', '\u201c', true], ['&rdquo;', '\u201d', true],
  ['&nbsp;', ' ', true],
  ['&#x27;', "'", false], ['&quot;', '"', false],
  ['&amp;', '&', true],               /* last out, first back in */
];

/* HTML -> what a person edits. Paragraph tags become blank lines; inline
 * tags (<a>, <em>, <strong>) stay, because rewriting them as markdown and
 * back loses attributes and is not worth the risk on forty blocks. */
function toMd(html) {
  /* These files are checked out with CRLF on Windows. Left in, a
     carriage return survives the unwrap below and sits inside the
     paragraph -- invisible in the markdown, but a <textarea> strips it,
     so every such block came back from the browser editor looking edited
     when nobody had touched it. */
  let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '');
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  s = s.replace(/^\s*<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '');
  s = s.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  for (const [e, c] of ENT) s = s.split(e).join(c);
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]{2,}/g, ' ');
  /* Source files wrap at 80 columns. Those are not paragraph breaks, and
     leaving them in makes every paragraph look pre-broken in the editor.
     Fold single newlines into spaces; blank lines stay as breaks. */
  s = s.replace(/([^\n])\n(?!\n)/g, '$1 ').replace(/ {2,}/g, ' ');
  return s.trim();
}

/* ...and back. `shape` records how the original was built so the rebuild
 * matches it: a multi-paragraph block returns <p>..</p><p>..</p>, a plain
 * one returns bare text. */
function fromMd(md, shape, ents) {
  let s = md.trim();
  /* `ents` is the set the SOURCE FILE uses, not the block. A file either
     writes `&mdash;` or writes the character; that is a whole-file habit, and
     reading it per block meant an edit that stripped the last entity out of a
     block made every later edit to that block drift to the other style. */
  const use = ENT.filter(([e, , back]) => back && (!ents || ents.includes(e)));
  if (!ents || ents.includes('&amp;')) s = s.split('&').join('&amp;');
  for (const [e, c] of use) if (e !== '&amp;') s = s.split(c).join(e);
  const paras = s.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim())
                 .filter(Boolean);
  if (shape === 'p-list') return paras.map((p) => `<p>${p}</p>`).join('');
  if (shape === 'br-list') return paras.join('<br><br>');
  return paras.join(' ');
}

/* --------------------------------------------------------------- sources */

const blocks = [];           /* {id, file, start, end, label, shape, text} */

/* Which entity spellings a source file uses, cached per file. Whole-file,
   because it is a whole-file convention -- see fromMd(). */
const entCache = {};
function fileEnts(file, src) {
  if (!entCache[file]) {
    entCache[file] = ENT.filter(([e]) => src.includes(e)).map(([e]) => e);
  }
  return entCache[file];
}

function push(file, src, range, id, label, shape) {
  if (!range) return;
  const raw = src.slice(range.start, range.end);
  /* Skip an element that holds MARKUP but no words -- `<h1><img></h1>` has no
     copy in it, and extracting it hands back a tag to edit and re-escapes its
     quotes on the way home.

     An element that is entirely EMPTY is the opposite case and must be kept:
     that is a field somebody blanked, and dropping it took the field out of
     the editor so the words could never be typed back. Four fields on the
     projects page vanished that way. The test is therefore "has content that
     is all markup", not "renders to nothing". */
  const words = raw.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
  if (raw.trim() && !words) return;
  blocks.push({
    id, file, label, shape: shape || 'plain',
    start: range.start, end: range.end,
    text: shape === 'raw' ? raw : toMd(raw),
    ents: fileEnts(file, src),
  });
}

const PAGES = {
  'index.html': 'home',
  'projects.html': 'projects',
  'writing.html': 'writing',
  'blog.html': 'blog',
  'about.html': 'about',
  /* about-plain.html is GENERATED from about.html by
     tools/build-about-plain.mjs, so it is deliberately absent: an edit made
     here would be silently overwritten on the next build. Edit the book. */
  'park-guides.html': 'parkguides',
  '404.html': 'notfound',
};

function extractHtml(name, key) {
  const file = `public/${name}`;
  const src = readFileSync(join(ROOT, file), 'utf8');

  push(file, src, attrRange(src, /<title>([^<]*)<\/title>/i),
       `${key}.meta.title`, 'Browser tab / search result title');
  push(file, src,
       attrRange(src, /<meta name="description" content="([^"]*)"/i),
       `${key}.meta.description`, 'Search + social description');

  const main = findAll(src, 'main')[0];

  /* A post list is not site copy. The Substack half is replaced at runtime
     from the feed, so editing it changes nothing a reader will ever see; the
     "Earlier writing" half is the titles and opening lines of Ryan's own
     posts, which belong to the posts, not to this page. Both are `ul.posts`,
     so both come out. */
  const feeds = findAll(src, 'ul', /class="(?:[^"]*\s)?posts(?:\s[^"]*)?"/);
  const inFeed = (r) =>
    feeds.some((f) => r.start >= f.start && r.end <= f.end);

  const inMain = (r) =>
    (!main || (r.start >= main.start && r.end <= main.end)) && !inFeed(r);

  findAll(src, 'h1').filter(inMain).forEach((r, i) =>
    push(file, src, r, `${key}.h1${i ? '.' + i : ''}`, 'Page heading'));

  findAll(src, 'h2').filter(inMain).forEach((r, i) =>
    push(file, src, r, `${key}.h2.${i + 1}`, 'Section heading'));

  findAll(src, 'h3').filter(inMain).forEach((r, i) =>
    push(file, src, r, `${key}.h3.${i + 1}`, 'Sub-heading'));

  findAll(src, 'p').filter(inMain).forEach((r, i) => {
    const cls = (/class="([^"]*)"/.exec(r.attrs) || [, ''])[1];
    const label = cls.includes('lede') ? 'Intro paragraph'
                : cls.includes('kicker') ? 'Chapter label'
                : cls.includes('meta') ? 'Small caption'
                : cls.includes('x') ? 'Post excerpt'
                : 'Body paragraph';
    push(file, src, r, `${key}.p.${i + 1}`, label);
  });

  findAll(src, 'span', /class="tag"/).filter(inMain).forEach((r, i) =>
    push(file, src, r, `${key}.tag.${i + 1}`, 'Card tag'));

  /* "Body paragraph" forty times over tells a reviewer nothing about what
     they are looking at. Name each block after the nearest heading above it,
     so a card's description reads "Herder - body paragraph". */
  const mine = blocks.filter((b) => b.file === file)
                     .sort((a, b) => a.start - b.start);
  let heading = null;
  for (const b of mine) {
    if (/\.(h1|h2|h3)/.test(b.id)) {
      heading = b.text.replace(/<[^>]*>/g, '').trim();
    } else if (heading && !/\.meta\./.test(b.id)) {
      b.label = heading + ' \u2014 ' + b.label.toLowerCase();
    }
  }

  /* The one alt text that describes real artwork rather than decoration. */
  const alt = attrRange(src, /<img[^>]*class="hall-art"[^>]*alt="([^"]*)"/i)
           || attrRange(src, /alt="(A wizard[^"]*)"/i);
  push(file, src, alt, `${key}.art.alt`, 'Artwork alt text');
}

/* ------------------------------------------------------- the dashboards */

/* build_page.py holds the dashboard's prose in two Python lists. The values
 * are implicit-concatenated string literals, so they are read and written as
 * a unit: the whole literal group is one block. */
function pyStrings(src, from) {
  /* Match a run of adjacent "..." literals starting at `from`. */
  const re = /"(?:[^"\\]|\\.)*"(?:\s*\n?\s*"(?:[^"\\]|\\.)*")*/y;
  re.lastIndex = from;
  const m = re.exec(src);
  return m ? { start: m.index, end: m.index + m[0].length, raw: m[0] } : null;
}

function pyDecode(raw) {
  return raw
    .split(/"\s*\n?\s*"/).join('')
    .replace(/^"|"$/g, '')
    .replace(/\\u([0-9a-fA-F]{4})/g,
             (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function pyEncode(text, indent) {
  /* An emptied field must still be a STRING. Returning nothing left the
     surrounding parentheses behind as `"note": ()`, which is an empty tuple:
     the page then published the literal characters "()" as copy, and the
     block stopped parsing as a string literal at all, so the editor could no
     longer see the field to type it back. */
  if (!text.trim()) return '""';
  /* Wrap at 72 columns into adjacent literals, the way the file is written. */
  const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const words = esc.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 66) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  const pad = ' '.repeat(indent);
  return lines.map((l, i) =>
    `"${l}${i < lines.length - 1 ? ' ' : ''}"`).join('\n' + pad);
}

function extractDashboards() {
  const file = 'tools/forecasting/build_page.py';
  const src = readFileSync(join(ROOT, file), 'utf8');
  const G = src.indexOf('GROUPS = [');
  const L = src.indexOf('LANDING = {');

  /* Chart titles and notes (SECTIONS), then page prose (GROUPS). */
  const want = [
    { key: 'title', label: 'Chart title', upto: G },
    { key: 'note', label: 'Chart explanation', upto: G, shape: 'br-list' },
    { key: 'nav', label: 'Sidebar label', from: G },
    { key: 'title', label: 'Page heading', from: G },
    { key: 'kicker', label: 'Page kicker', from: G },
    { key: 'blurb', label: 'Page introduction', from: G, shape: 'p-list' },
    ...[
      ['description', 'Search + social description'],
    ].map(([key, label]) => ({ key, label, from: L })),
  ];

  for (const w of want) {
    const re = new RegExp(`"${w.key}":\\s*\\(?\\s*`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const at = m.index + m[0].length;
      if (w.upto && m.index > w.upto) continue;
      if (w.from && m.index < w.from) continue;
      const lit = pyStrings(src, at);
      if (!lit) continue;
      /* Name the block after the slug it belongs to. */
      const slugM = /"slug":\s*"([^"]+)"/g;
      let slug = '', s2;
      slugM.lastIndex = w.from ? w.from : 0;
      while ((s2 = slugM.exec(src)) && s2.index < m.index) slug = s2[1];
      const scope = w.from ? 'page' : 'chart';
      const id = `dash.${scope}.${slug}.${w.key}`;
      if (blocks.some((b) => b.id === id)) continue;
      const decoded = pyDecode(lit.raw);
      blocks.push({
        id, file, label: w.label, shape: w.shape || 'plain',
        start: lit.start, end: lit.end,
        text: toMd(decoded),
        /* Must be set here too. Without it fromMd() falls back to converting
           every character it knows, which escaped the quotes of an <a href>
           into &quot; and broke the link. */
        // These landing-page values are escaped by page(), unlike its HTML
        // prose. Keep punctuation and ampersands literal to avoid double escaping.
        ents: slug === 'index' && ['title', 'kicker', 'description'].includes(w.key)
          ? [] : fileEnts(file, src),
        py: true, indent: 12,
      });
    }
  }
}

/* Three blocks all labeled "Chart explanation" on one page tells a reviewer
 * nothing. Name each after its chart, and each page block after its page. */
function nameDashboards() {
  const titleOf = {};
  for (const b of blocks) {
    const m = /^dash\.(chart|page)\.(.+)\.title$/.exec(b.id);
    if (m) titleOf[m[1] + ':' + m[2]] = b.text.replace(/<[^>]*>/g, '').trim();
  }
  for (const b of blocks) {
    const m = /^dash\.(chart|page)\.(.+)\.(note|blurb|kicker|nav)$/.exec(b.id);
    if (!m) continue;
    const t = titleOf[m[1] + ':' + m[2]];
    if (t) b.label = t + ' — ' + b.label.toLowerCase();
  }
}

/* ------------------------------------------------------------- grouping */

/* Warnings that belong at the top of one particular file. */
const NOTES = {
  '06-about-plain.md': [
    '> **This repeats 05-about.md on purpose.** `about-plain.html` is the',
    '> no-JavaScript version of the book, linked from its colophon. If you',
    '> change a sentence in one, change it in the other, or the two versions',
    '> of the page drift apart. Nothing links them automatically.',
  ].join('\n'),
  '04-blog.md': [
    '> **The Substack half of this list is replaced at runtime** once',
    '> `/api/substack` is live, so those titles and blurbs are only a fallback',
    '> for when the feed is unreachable. The "Earlier writing" entries below',
    '> them are permanent, and are excerpts of the posts themselves.',
  ].join('\n'),
  '09-dashboards-charts.md': [
    '> Chart titles and notes are editable here. Source labels and data dates',
    '> are generated from the dataset metadata.',
  ].join('\n'),
};

const FILES = [
  ['01-home.md', 'The hall (home page)', (b) => b.id.startsWith('home.')],
  ['02-projects.md', 'Projects page', (b) => b.id.startsWith('projects.')],
  ['03-writing.md', 'Fiction page', (b) => b.id.startsWith('writing.')],
  ['04-blog.md', 'Blog page', (b) => b.id.startsWith('blog.')],
  ['05-about.md', 'About (the book)', (b) => b.id.startsWith('about.')],
  ['06-about-plain.md', 'About (plain version)',
   (b) => b.id.startsWith('aboutplain.')],
  ['07-park-guides.md', 'Park guides page',
   (b) => b.id.startsWith('parkguides.')],
  ['08-dashboards-pages.md', 'Data Dashboards — page copy',
   (b) => b.id.startsWith('dash.page.')],
  ['09-dashboards-charts.md', 'Data Dashboards — chart titles and notes',
   (b) => b.id.startsWith('dash.chart.')],
  ['10-odds-and-ends.md', 'Odds and ends',
   (b) => b.id.startsWith('notfound.')],
];

const HEAD = `<!-- Generated by tools/copy.mjs. Edit the text under each
     heading; leave the \`id:\` comments alone -- they are how the words get
     back into the site. Blank lines separate paragraphs. Inline <a>, <em>
     and <strong> tags are real markup: keep them if you want them.
     When you are done: node tools/copy.mjs apply -->\n`;

function write() {
  if (!existsSync(OUT)) mkdirSync(OUT);
  const used = new Set();
  for (const [name, heading, pick] of FILES) {
    const mine = blocks.filter(pick);
    mine.forEach((b) => used.add(b.id));
    if (!mine.length) continue;
    let md = `# ${heading}\n\n${HEAD}\n`;
    if (NOTES[name]) md += `\n${NOTES[name]}\n`;
    let lastFile = null;
    for (const b of mine) {
      if (b.file !== lastFile) {
        md += `\n---\n\n*Source: \`${b.file}\`*\n\n`;
        lastFile = b.file;
      }
      md += `## ${b.label}\n<!-- id: ${b.id} -->\n\n${b.text}\n\n`;
    }
    writeFileSync(join(OUT, name), md);
  }
  const rest = blocks.filter((b) => !used.has(b.id));
  if (rest.length) {
    let md = `# Odds and ends\n\n${HEAD}\n`;
    let lastFile = null;
    for (const b of rest) {
      if (b.file !== lastFile) {
        md += `\n---\n\n*Source: \`${b.file}\`*\n\n`;
        lastFile = b.file;
      }
      md += `## ${b.label}\n<!-- id: ${b.id} -->\n\n${b.text}\n\n`;
    }
    writeFileSync(join(OUT, '10-odds-and-ends.md'), md);
  }

  const files = {};
  for (const b of blocks) {
    files[b.file] = files[b.file]
      || sha(readFileSync(join(ROOT, b.file), 'utf8'));
  }
  writeFileSync(LOCK, JSON.stringify({ files, blocks }, null, 1));
}

/* ---------------------------------------------------------------- apply */

function readEdited() {
  const out = {};
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith('.md')) continue;
    const src = readFileSync(join(OUT, f), 'utf8');
    const re = /<!--\s*id:\s*([\w.-]+)\s*-->\n([\s\S]*?)(?=\n## |\n---\n|$)/g;
    let m;
    while ((m = re.exec(src))) out[m[1]] = m[2].trim();
  }
  return out;
}

function apply(dry) {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const edited = readEdited();
  const byFile = {};
  for (const b of lock.blocks) (byFile[b.file] ||= []).push(b);

  const changed = [];
  const warnings = [];
  for (const [file, list] of Object.entries(byFile)) {
    const path = join(ROOT, file);
    const src = readFileSync(path, 'utf8');
    if (sha(src) !== lock.files[file]) {
      console.error(
        `\n${file} has changed since the copy was extracted.\n` +
        '  Re-run `node tools/copy.mjs extract` (this discards edits not yet\n' +
        '  applied) or restore the file. Refusing to splice into moved text.');
      process.exit(1);
    }
    list.sort((a, b) => a.start - b.start);
    let out = '', cursor = 0, n = 0;
    for (const b of list) {
      const now = edited[b.id];
      if (now == null) continue;
      const was = src.slice(b.start, b.end);
      /* THE RULE THAT MAKES THIS SAFE: text you did not touch goes back
         exactly as it came out, byte for byte. Re-rendering an unedited
         block would reflow its line breaks and re-spell its entities, so
         every run would churn files nobody edited and `check` would never be
         clean. Only genuinely changed copy is rebuilt. */
      if (now !== b.text && b.shape === 'plain' && /\n\s*\n/.test(now)) {
        warnings.push(`  ${b.id}: blank line ignored — this block is the text `
          + 'inside a single element, so it stays one paragraph. Use the next '
          + 'block along for a second one.');
      }
      const rebuilt = now === b.text ? was
        : b.py
          ? pyEncode(fromMd(now, b.shape, b.ents), b.indent)
          : fromMd(now, b.shape, b.ents);
      out += src.slice(cursor, b.start) + rebuilt;
      cursor = b.end;
      if (rebuilt !== was) n++;
    }
    out += src.slice(cursor);
    if (out !== src) {
      changed.push(`${file} (${n} block${n === 1 ? '' : 's'})`);
      if (!dry) writeFileSync(path, out);
    }
  }
  if (warnings.length && !dry) {
    console.log('\nHeads up:');
    warnings.forEach((w) => console.log(w));
  }
  return changed;
}

/* ----------------------------------------------------------------- main */

const cmd = process.argv[2] || 'extract';

if (cmd === 'extract') {
  for (const [name, key] of Object.entries(PAGES)) extractHtml(name, key);
  extractDashboards();
  nameDashboards();
  blocks.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  write();
  const perFile = {};
  for (const b of blocks) perFile[b.file] = (perFile[b.file] || 0) + 1;
  console.log(`Extracted ${blocks.length} blocks of copy into copy/`);
  for (const [f, n] of Object.entries(perFile)) console.log(`  ${n
    .toString().padStart(3)}  ${f}`);
  console.log('\nEdit copy/*.md, then: node tools/copy.mjs apply');
} else if (cmd === 'apply') {
  const changed = apply(false);
  if (!changed.length) console.log('No copy changes to apply.');
  else {
    console.log('Applied copy edits to:');
    changed.forEach((c) => console.log('  ' + c));
    console.log('\nNow run: python tools/forecasting/build_page.py && npm test');
  }
} else if (cmd === 'check') {
  const changed = apply(true);
  if (!changed.length) console.log('Round-trip clean — copy/ matches the site.');
  else {
    console.log('copy/ differs from the site in:');
    changed.forEach((c) => console.log('  ' + c));
  }
} else {
  console.error('usage: copy.mjs [extract|apply|check]');
  process.exit(1);
}
