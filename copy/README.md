# The site's copy, for review

Every word on the site is in the numbered files next to this one. Edit them,
then one command puts your edits back where they came from.

## How to use it

1. **Edit the text** under each `##` heading in `01-*.md` through `10-*.md`.
2. **Leave the `<!-- id: ... -->` comments alone.** They are how each block
   finds its way home. Everything else is yours.
3. When you are done:

```bash
node tools/copy.mjs apply && python tools/forecasting/build_page.py && npm test
```

That is it. There is no separate "final copy" step — what is in these files
becomes what is on the site.

## What to know while editing

- **A blank line is a paragraph break.** Most blocks are a single paragraph
  and will say so if you add one; a few (the dashboard page introductions and
  the longer chart notes) take as many as you like.
- **Inline `<a>`, `<em>` and `<strong>` are real markup.** They render.
  Markdown `*stars*` will not — use `<em>` if you want emphasis.
- **Punctuation is real.** Em dashes, curly quotes and `·` are typed as
  themselves; you do not need HTML entities.
- **Deleting a block's text empties it on the site.** To leave something
  alone, leave it alone.
- **US English**, per the house style — color, center, gray, labeled.

## What is NOT here, on purpose

- **Anything computed from data.** Chart titles carry a "data to 15 August
  2026" subtitle, the sidebar carries a status word, the index carries row
  counts. Those are read from the data every time the site is built, which is
  the point — a hand-written "updated weekly" is a claim that rots.
- **Navigation labels, button text and form fields.** Say the word and they
  can be added; they were left out to keep this a prose review.
- **The blog's post titles from Substack.** Those come from the feed.

## The two pages that must agree

`05-about.md` and `06-about-plain.md` are the same words twice — the book
version of the about page and the plain-HTML version linked from its
colophon. **Nothing keeps them in sync.** Change a sentence in one and change
it in the other.

## If something goes wrong

`node tools/copy.mjs check` says whether these files still match the site.

If you see *"has changed since the copy was extracted"*, a source file was
edited after this folder was generated. Re-run `node tools/copy.mjs extract`
to start fresh — **that discards edits here that were not applied yet** — or
put the source file back the way it was.

`.copy-lock.json` records where every block came from, byte for byte. Do not
edit it, and do not delete it: without it these files cannot be put back.

## How it works, briefly

Extraction reads the HTML and the dashboard generator and records, for each
block, its exact file, byte range and original text. Applying never parses
anything — it splices new text into the recorded ranges. **A block you did
not touch is written back byte for byte**, so running `apply` never churns
copy nobody edited.
