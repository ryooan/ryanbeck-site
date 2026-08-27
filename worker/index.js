/**
 * Everything static is served by Cloudflare's asset layer before this runs.
 * The Worker only wakes up for /api/* routes.
 */

/* The site's address comes from site.config.json, the one place it is
   defined. Wrangler bundles the JSON import at deploy time. */
import SITE from '../site.config.json';
const SITE_HOST = SITE.origin.replace(/^https?:\/\//, '');

const SUBSTACK_FEED = 'https://themissingnuance.substack.com/feed';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/substack') return substack(request, ctx);
    if (url.pathname === '/api/subscribe') return subscribe(request, env);

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ *
 * GET /api/substack — the latest posts from The Missing Nuance.
 * Substack's RSS has no CORS headers, so the browser can't read it
 * directly; we fetch it here and hand back clean JSON.
 * ------------------------------------------------------------------ */
async function substack(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL('/api/substack', request.url).toString(), { method: 'GET' });

  const hit = await cache.match(key);
  if (hit) return hit;

  let posts = [];
  try {
    const res = await fetch(SUBSTACK_FEED, {
      headers: { 'user-agent': SITE_HOST + '/1.0' },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!res.ok) throw new Error('feed ' + res.status);
    posts = parseFeed(await res.text()).slice(0, 8);
  } catch (err) {
    // Never break the page over this — the client keeps its static list.
    return json({ error: String(err), posts: [] }, 200, 60);
  }

  const out = json({ posts }, 200, 1800);
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

function parseFeed(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map(([, block]) => {
    const tag = (name) => {
      const m = block.match(
        new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`)
      );
      return m ? m[1].trim() : '';
    };
    const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const blurb = strip(tag('description'));
    return {
      title: strip(tag('title')),
      link: tag('link'),
      date: tag('pubDate'),
      blurb: blurb.length > 190 ? blurb.slice(0, 187).trimEnd() + '…' : blurb,
    };
  });
}

/* Substack's feed is full of numeric and named entities. */
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|rsquo|lsquo|ldquo|rdquo);/g, (_, e) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
         hellip: '…', mdash: '—', ndash: '–', rsquo: '\u2019', lsquo: '\u2018',
         ldquo: '\u201c', rdquo: '\u201d' }[e]));
}

/* ------------------------------------------------------------------ *
 * POST /api/subscribe — newsletter signup.
 * Right now this only validates and echoes. Wire it to whichever list
 * you actually use (Substack, Buttondown, Kit) by filling in the TODO.
 * ------------------------------------------------------------------ */
async function subscribe(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  let email = '';
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    email = (await request.json().catch(() => ({}))).email || '';
  } else {
    email = (await request.formData().catch(() => new FormData())).get('email') || '';
  }
  email = String(email).trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ error: 'that does not look like an email address' }, 400);
  }

  // TODO — pick one:
  //
  // Buttondown:
  //   await fetch('https://api.buttondown.email/v1/subscribers', {
  //     method: 'POST',
  //     headers: { authorization: `Token ${env.BUTTONDOWN_TOKEN}`, 'content-type': 'application/json' },
  //     body: JSON.stringify({ email_address: email }),
  //   });
  //
  // Substack has no public subscribe API — point the form at
  // https://themissingnuance.substack.com/subscribe instead and skip this route.
  //
  // Store the secret with:  npx wrangler secret put BUTTONDOWN_TOKEN

  return json({ ok: true, email });
}

/* ------------------------------------------------------------------ */
function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge
        ? `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=86400`
        : 'no-store',
    },
  });
}
