# haraj-patchright

Patchright (patched, undetected Chromium fork of Playwright) with live GraphQL interception.

```bash
npm install
npx patchright install chromium   # or: npx patchright install chrome (recommended channel)
node scrape.js "غسالة" --limit 20   # JSON on stdout
```

Idea: erase CDP leaks natively (no `Runtime.enable`, no `--enable-automation`)
instead of JS-injection stealth; the SPA's own search-API payloads are
captured via `page.on('response')`, DOM parsing is only a fallback.
Caveats: `page.on('console')` is disabled by design; `page.evaluate` runs
isolated by default.
