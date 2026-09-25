# Non-served data

These files are retained locally and in version control for provenance. They
must never be copied into `public/`, linked from the website, or included in
Cloudflare assets. The data archive page was removed at Ryan's request on
2026-09-25 because it exposed unrelated datasets.

`forecasting/` holds the build manifest, recovered R-session archive, and
unpublished Virginia cases-by-age CSVs. Only the CSVs explicitly listed in
`tools/forecasting/public-csvs.json` may be written into the served data folder.
`npm test` checks that those files exactly match actual dashboard download links.
