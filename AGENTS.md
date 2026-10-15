# AGENTS.md

Multi-app repo (no shared code, no CI, no lint/typecheck). Active app is `express-app/`; `server/`+`pwa/` is the legacy Python path.

## Layout

- `express-app/` — active Node app (Express + Playwright + `node:sqlite` + vanilla-JS UI in `public/`). Entrypoints: `server.js`, `scraper.js`, `db.js`, `query.js` (Arabic NL parsing), `build-web.js`.
- `web-app/` — **the deployed website**: browser-only build of the same UI (`node build-web.js` copies it out of `express-app/public` + `express-app/web`). No server: it queries Haraj's GraphQL straight from the browser, so it also works on static hosting. This is what GitHub Pages serves.
- `server/` + `pwa/` — legacy Python FastAPI backend + static PWA. Imports are `from server.src.*`; run uvicorn from repo root.
- `haraj-playwright-stealth/`, `haraj-patchright/`, `haraj-curl-cffi/` — standalone comparison prototypes, each with its own README. Don't touch unless asked to compare.

## Commands

- Express: `cd express-app && npm install && npx playwright install chromium && node server.js` (port 3000). One-off scrape: `node scraper.js --once "cars"`.
- Tests (safe — temp DB via `HARAJ_DB_PATH`, never touches `data/app.db`): `cd express-app && npm test`.
- Syntax check: `node --check <file>` (no linter configured). Frontend bundle check: `bun build public/app.js --minify` (bun.lock exists; serving stays static, no build step).
- Python: `.\.venv\Scripts\python.exe` (3.14, venv in repo root), `.\.venv\Scripts\uvicorn.exe server.app:app --port 8000`, `.\.venv\Scripts\playwright.exe install chromium`.

## Gotchas

- SQLite is Node's built-in `node:sqlite` (`DatabaseSync`) — do NOT add `better-sqlite3` (fails to compile on Node 24, no build tools here).
- Scraper tries Haraj GraphQL directly first, browser fallback second. Haraj returns HTTP 200 with literal `"..."` for rejected query shapes — always validate `data.search.items`.
- Never block scripts/XHR in the Playwright interceptor (only image/media/font/stylesheet); blocking JS starves SPA hydration.
- Arabic POST bodies from PowerShell: `Invoke-WebRequest` mangles UTF-8 — send bytes via `[Text.Encoding]::UTF8.GetBytes(...)` with `application/json; charset=utf-8`, else junk rows land in the DB.
- Search is tokenized AND over title+description (raw + `*_norm` columns); `LIMIT` hard-capped at 20 in `db.js`; `GET /api/meta` feeds the location/city/category dropdowns (`location` keys like `SA-Riyadh`, `KW`).
- Git-ignored, never commit: `.venv/`, `node_modules/`, `express-app/data/` (live DB), `express-app/test/*.db`, `results.json`.
- Pages deploy: `gh-pages` is a subtree of `web-app/` — republish with `git subtree split --prefix web-app -b gh-pages` (delete + recreate the branch to drop old files) then `git push origin gh-pages`. Live at https://abomosaa.github.io/haraj-radar/. Rebuild `web-app/` from source with `cd express-app && node build-web.js` before republishing.
