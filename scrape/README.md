# Museum data scraper

Collects **opening hours** and **admission prices** for every museum in
`../src/data/museums.json` and writes them back into that file. Built so the
data can be refreshed automatically in future.

## Setup

```bash
cd scrape
npm install        # installs Playwright + downloads Chromium
```

> Run this on a machine with normal internet access. The museum sites are not
> reachable from the project's sandbox, so the scraper must run locally.

## Usage

```bash
npm run scrape            # scrape all museums, write report to output/results.json
npm run scrape:merge      # scrape all + write opening_hours/price into museums.json
node scrape.mjs --ids tate-modern,science-museum   # just these
node scrape.mjs --limit 10                          # first 10 (quick test)
node scrape.mjs --merge --concurrency 6
```

## How it works

For each museum the scraper opens a page (a per-museum URL from `config.json`
if set, otherwise the museum's `website`) and extracts data in three layers,
most reliable first:

1. **CSS selectors** — `config.json` can give `selectors.hours` / `selectors.price`.
2. **schema.org JSON-LD** — `openingHoursSpecification` / `openingHours` / `offers`.
3. **Text heuristics** — regex over the visible text for day/time ranges and `£` prices.

It also records the page title and meta description, blocks images/fonts for
speed, runs a small concurrency pool, and is polite with a descriptive
user-agent.

## Files

| File | Purpose |
|------|---------|
| `scrape.mjs` | Main scraper (run this). |
| `extract.mjs` | Pure extraction helpers (JSON-LD, text, day-range collapsing). |
| `config.json` | Per-museum overrides: visit-page `url`, `selectors`, `skip`. |
| `merge.mjs` | One-off enrichment that authored descriptions + editorial hours/prices and merged the first batch of live-scraped data. Kept for reference. |
| `output/results.json` | Latest scrape report. |
| `output/chrome_results.jsonl` | The first hours/price pass collected via the browser. |
| `museums.backup.json` | Copy of `museums.json` before enrichment. |

## Maintaining `config.json`

When a site is redesigned and a museum stops returning data, add or fix its
entry in `config.json` — point `url` at the current opening-times page and, if
needed, add `selectors`. No code changes required.

## Data fields added to `museums.json`

- `description` — short factual summary of the museum.
- `opening_hours` — human-readable hours string.
- `price` — adult admission as a number (`0` = free).
- `price_text` — fuller pricing detail.
- `hours_source` — `"scraped"` (read live from the site) or `"editorial"`
  (filled from authoritative knowledge where the site blocked automation; the
  scraper will overwrite these on its next run).
- `last_verified` — date the hours/price were last set.
