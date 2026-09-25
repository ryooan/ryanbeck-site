"""Migrate preserved author-site posts into the current layout, without rewriting prose.

Run: python tools/build-blog.py (requires tools/requirements.txt).
Sources remain in public/ryanbeckauthor; output is generated under public/posts.
Also updates the blog listing, dated incoming redirects, and sitemap.
"""
import html
import json
import re
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ARCHIVE = PUBLIC / "ryanbeckauthor"
ORIGIN = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))["origin"].rstrip("/")


def normalized(url):
    return unquote(urlsplit(url).path)


def build():
    posts = []
    for source in sorted(ARCHIVE.glob("20*/*/*/*.html"), reverse=True):
        soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
        body = soup.select_one(".post")
        if body is None:
            raise ValueError(f"Missing article: {source}")
        heading = body.find("h1", recursive=False)
        date = body.find("p", recursive=False)
        if heading is None or date is None:
            raise ValueError(f"Missing title/date: {source}")
        title = heading.get_text(" ", strip=True)
        date_text = date.get_text(" ", strip=True)
        heading.decompose()
        date.decompose()
        rel = source.relative_to(ARCHIVE)
        slug = re.sub(r"[^a-z0-9]+", "-", source.stem.lower()).strip("-")
        route = "/posts/" + "/".join(rel.parts[:3]) + "/" + slug
        old = "/ryanbeckauthor/" + rel.as_posix()
        posts.append(dict(title=title, date=date_text, iso="-".join(rel.parts[:3]),
                          route=route, old=old, body=body))
    mapping = {p["old"]: p["route"] for p in posts}
    blog_path = PUBLIC / "blog.html"
    blog = blog_path.read_text(encoding="utf-8")
    header = re.search(r'<header class="topbar">[\s\S]*?</header>', blog)[0]
    footer = re.search(r'<footer class="site-foot">[\s\S]*?</footer>', blog)[0]
    for old, new in [("index.html", "/"), ("projects.html", "/projects"),
                     ("writing.html", "/writing"), ("blog.html", "/blog"),
                     ("about.html", "/about")]:
        header = header.replace(f'href="{old}"', f'href="{new}"')
        footer = footer.replace(f'href="{old}"', f'href="{new}"')
    header = header.replace('src="assets/', 'src="/assets/')
    header = header.replace('href="/blog"', 'href="/blog" aria-current="page"')
    template = (ROOT / "tools/templates/blog-post.html").read_text(encoding="utf-8")
    redirects = []
    for i, post in enumerate(posts):
        body = post["body"]
        for element in body.find_all(True):
            for attr in ("href", "src", "poster"):
                value = element.get(attr)
                if not value or value.startswith(("#", "mailto:", "data:")):
                    continue
                resolved = urljoin(post["old"], value)
                parts = urlsplit(resolved)
                if parts.netloc in ("www.ryanbeckauthor.com", "ryanbeckauthor.com", "ryooan.github.io"):
                    resolved = "/ryanbeckauthor" + parts.path
                    if parts.query:
                        resolved += "?" + parts.query
                    if parts.fragment:
                        resolved += "#" + parts.fragment
                target = mapping.get(normalized(resolved))
                if target:
                    resolved = target + ("#" + urlsplit(resolved).fragment if urlsplit(resolved).fragment else "")
                element[attr] = resolved
        content = body.decode_contents()
        description = re.sub(r"\s+", " ", body.get_text(" ", strip=True))[:180]
        neighbors = []
        if i + 1 < len(posts):
            neighbors.append(f'<a href="{posts[i+1]["route"]}">Older: {html.escape(posts[i+1]["title"])}</a>')
        if i:
            neighbors.append(f'<a href="{posts[i-1]["route"]}">Newer: {html.escape(posts[i-1]["title"])}</a>')
        values = dict(title=html.escape(post["title"]), description=html.escape(description, quote=True),
                      canonical=ORIGIN + post["route"], origin=ORIGIN, header=header, footer=footer,
                      date=html.escape(post["date"]), iso=post["iso"], content=content,
                      original=quote(post["old"], safe="/"), neighbors="\n".join(neighbors))
        output = template
        for key, value in values.items():
            output = output.replace("{{" + key + "}}", value)
        dest = PUBLIC / (post["route"].lstrip("/") + ".html")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(output, encoding="utf-8")
        redirects.append(f'{post["route"]} {post["route"]}.html 200')

    # Existing archive entries become links to modern articles. Their text stays intact.
    def listing_link(match):
        value = match[1]
        return 'href="' + mapping.get(normalized(value), value) + '"'
    blog = re.sub(r'href="([^"]+)"', listing_link, blog)
    if 'id="old-site-link"' not in blog:
        blog = blog.replace('    <h2>Earlier writing</h2>',
            '    <h2>Earlier writing</h2>\n'
            '    <p id="old-site-link"><a href="/ryanbeckauthor/">Explore the original author site</a></p>')
    blog_path.write_text(blog, encoding="utf-8")

    path = PUBLIC / "_redirects"
    text = path.read_text(encoding="utf-8")
    for post in posts:
        incoming = post["old"].removeprefix("/ryanbeckauthor")
        # Preserve prefixed archive URLs so the old site remains explorable.
        for spelling in (incoming, quote(incoming, safe="/")):
            text = re.sub(r'^' + re.escape(spelling) + r'\s+\S+\s+301$',
                          spelling + ' ' + post["route"] + ' 301', text, flags=re.M)
    start, end = "# >>> migrated blog", "# <<< migrated blog"
    block = start + "\n" + "\n".join(redirects) + "\n" + end
    if start in text:
        text = text[:text.index(start)] + block + text[text.index(end) + len(end):]
    else:
        text += "\n" + block + "\n"
    path.write_text(text, encoding="utf-8")
    sitemap = PUBLIC / "sitemap.xml"
    xml = sitemap.read_text(encoding="utf-8")
    xml = re.sub(r'\s*<url><loc>[^<]*/posts/[^<]*</loc>[\s\S]*?</url>', '', xml)
    entries = "".join(f'  <url><loc>{ORIGIN}{p["route"]}</loc><changefreq>yearly</changefreq></url>\n' for p in posts)
    sitemap.write_text(xml.split('</urlset>')[0].rstrip() + '\n' + entries + '</urlset>\n', encoding="utf-8")
    print(f"Built {len(posts)} blog posts; listing, redirects and sitemap updated.")


if __name__ == "__main__":
    build()
