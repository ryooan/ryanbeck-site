/* Pull the latest posts from The Missing Nuance.
   ------------------------------------------------------------------
   Substack's RSS feed does NOT send CORS headers, so the browser can't
   read it directly — the request has to go through something on your own
   origin. This script calls /api/substack and quietly leaves the
   hand-written list in place if that endpoint isn't there yet.

   A minimal serverless version of that endpoint (Vercel / Netlify /
   Cloudflare all take a file like this):

     export default async function handler(req, res) {
       const xml  = await (await fetch('https://themissingnuance.substack.com/feed')).text();
       const item = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(m => {
         const g = (t) => (m[1].match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`)) || [,''])[1];
         return { title: g('title'), link: g('link'), date: g('pubDate'), blurb: g('description').replace(/<[^>]+>/g,'').slice(0,180) };
       });
       res.setHeader('cache-control','s-maxage=1800, stale-while-revalidate');
       res.json(item);
     }
   ------------------------------------------------------------------ */
(function () {
  var list = document.getElementById('substack-posts');
  if (!list) return;

  fetch('/api/substack', { headers: { accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var posts = Array.isArray(data) ? data : (data && data.posts) || [];
      if (!posts.length) return;
      list.innerHTML = posts.map(function (p) {
        var d = new Date(p.date);
        var when = isNaN(d) ? '' : d.toISOString().slice(0, 10);
        return '<li><a href="' + p.link + '">' +
               '<span class="t"><span class="source-pill substack">substack</span>' + esc(p.title) + '</span>' +
               '<span class="d">' + when + '</span>' +
               '<p class="x">' + esc(p.blurb || '') + '</p></a></li>';
      }).join('');
    })
    .catch(function () { /* no endpoint yet — the static list stands in */ });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
})();
