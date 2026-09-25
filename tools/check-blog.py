"""Verify migrated posts preserve article text and media from the local archive."""
import re
from pathlib import Path
from urllib.parse import unquote
from bs4 import BeautifulSoup

PUBLIC = Path(__file__).resolve().parents[1] / "public"
sources = list((PUBLIC / "ryanbeckauthor").glob("20*/*/*/*.html"))
pages = list((PUBLIC / "posts").rglob("*.html"))
assert sources and len(sources) == len(pages), "Missing migrated posts"

def text(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True))

for path in pages:
    page = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    original = page.select_one(".article-original a")["href"]
    source = BeautifulSoup((PUBLIC / unquote(original).lstrip("/")).read_text(encoding="utf-8"), "html.parser")
    old = source.select_one(".post")
    title = old.find("h1", recursive=False)
    date = old.find("p", recursive=False)
    assert text(title) == text(page.select_one("article h1")), path
    assert text(date) == text(page.select_one("article time")), path
    title.decompose()
    date.decompose()
    body = page.select_one(".article-body")
    assert text(body) == text(old), f"Changed article text: {path}"
    for tag in ("img", "iframe", "video", "audio", "script", "blockquote"):
        assert len(body.find_all(tag)) == len(old.find_all(tag)), f"Lost {tag}: {path}"
print(f"Verified original text, dates, and media for {len(pages)} migrated posts.")
