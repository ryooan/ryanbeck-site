# Non-served data

These files are kept in version control for provenance, but never served by
the site. They must never be copied into `public/`, linked from the website,
or included in Cloudflare assets. The data archive page was removed at Ryan's
request on 2026-09-25 because it exposed unrelated datasets.

**The repository is public** (github.com/ryooan/ryanbeck-site, since
2026-10-20), so "non-served" does not mean secret: everything committed here
is readable there.

`forecasting/` holds the build manifest, the recovered R-session archive for
Ryan's own dashboards, and unpublished Virginia cases-by-age CSVs. Only the CSVs
explicitly listed in `tools/forecasting/public-csvs.json` may be written into
the served data folder. `npm test` checks that those files exactly match actual
dashboard download links.

`local/` is gitignored and must stay that way. It holds the four archive
folders that came from Metaculus work (`cdc-plots`, `cdc-plot-experimentation`,
`metac-cdc-data-animations-animation-scripts-r`, `expert-elicitation-plots`):
Metaculus question forecasts and an anonymized expert survey. They were
purged from the whole history before the first push, and
`forecasting/archive/MANIFEST.csv` still lists them by name. A second copy,
plus a bundle of the pre-rewrite history, is in
`%USERPROFILE%\backups\personal-website\`.
