# Haraj Express Scraper

Node.js Express app: hourly Playwright scraper → SQLite history → table UI + Web Push for new links.

## Run

```bash
cd express-app
npm install
npx playwright install chromium
npx web-push generate-vapid-keys   # once; put keys in env below
PORT=3000 HARAJ_KEYWORD="cars" VAPID_PUBLIC=... VAPID_PRIVATE=... node server.js
# open http://localhost:3000
```

One-off scrape: `node scraper.js --once "cars"`.

## How it works

- `scraper.js` — headless Chromium, blocks images/CSS/media/fonts, parses the search page in-browser, opens detail pages for the first 10 results only. New URLs get `is_new: true`.
- `server.js` — serves `public/` + JSON API; `node-cron` runs a scrape hourly (`0 * * * *`), skipping if one is running.
- `db.js` — SQLite at `data/app.db`: `listings` (url UNIQUE), `runs`, `subscriptions`.
- `push.js` — after each scrape, new links are broadcast via Web Push to saved subscriptions.
- `public/` — bilingual (AR/EN) table-only UI with hierarchical Location filter, dynamic City select, Category/Timeframe selects, search, New-only + run history.

## Tests

```bash
npm test   # node --test test/regression.js (uses a temp DB, never touches data/app.db)
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/listings?...` | Filtered listings `{listings, count}` — params: `q location region city category from to maxPrice newOnly limit` (tokenized AND text search; limit default 20, hard cap 20; `maxPrice` drops rows priced above it) |
| GET | `/api/meta` | Filter metadata `{locations, citiesByRegion, categories}` for the dropdowns |
| PUT | `/api/listings/seen` | Clear new badges `{ids}` |
| POST | `/api/scrape` | Trigger background scrape |
| GET | `/api/history` | Recent scrape runs |
| GET/POST | `/api/vapid-public-key`, `/api/subscribe` | Push setup |
