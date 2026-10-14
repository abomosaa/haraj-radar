# haraj-playwright-stealth

Stock Playwright + JS-injection stealth (`playwright-extra` + `puppeteer-extra-plugin-stealth`) with live GraphQL interception + auto-scroll.

```bash
npm install
npx playwright install chromium
node scrape.js "غسالة" --limit 20   # JSON on stdout
```

Idea: hide automation flags in-page while the SPA's own search-API payloads
are captured via `page.on('response')`; DOM parsing is only a fallback.
Note: the stealth plugin tracks 2023-era evasions — for hardened targets see
`../haraj-patchright`.
