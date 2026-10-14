"use strict";
// Variant 2: Patchright (undetected-Chromium Playwright fork) + live API interception.
// Usage: node scrape.js "غسالة" [--limit 20]   → JSON on stdout
// NOTE: page.on('console') is disabled by design in Patchright and
// page.evaluate runs in an isolated context — neither is used here.
const { chromium } = require("patchright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = "https://haraj.com.sa";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const keyword = args[0] || "غسالة";
const li = process.argv.indexOf("--limit");
const limit = (li >= 0 ? Number(process.argv[li + 1]) : NaN) || 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mapApi(g) {
  const epoch = Number(g.postDate || g.updateDate);
  return {
    id: g.id ?? null,
    title: g.title || null,
    price: g?.price?.formattedPrice ?? (g?.price?.inputPrice != null ? String(g.price.inputPrice) : null),
    city: g.city || g.geoCity || null,
    date: Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString().slice(0, 10) : null,
    seller: g.authorUsername || null,
    url: g.URL ? `${BASE}/${String(g.URL).replace(/^\//, "")}` : null,
  };
}

(async () => {
  const t0 = Date.now();
  // Undetected config per Patchright docs: persistent context, no custom
  // userAgent/viewport injection. (Use channel:'chrome' with real Chrome
  // for maximum stealth on hardened targets.)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "patchright-"));
  const context = await chromium.launchPersistentContext(profile, { headless: true });
  try {
    const page = await context.newPage();
    const apiItems = [];
    page.on("response", async (res) => {
      try {
        const ct = res.headers()["content-type"] || "";
        if (!ct.includes("application/json") || !res.url().includes("graphql.haraj.com.sa")) return;
        const body = await res.json().catch(() => null);
        const arr = body?.data?.search?.items;
        if (Array.isArray(arr)) apiItems.push(...arr);
      } catch { /* ignore */ }
    });
    await page.goto(`${BASE}/search/${encodeURIComponent(keyword)}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await sleep(700);
    }
    const dom = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href^="/"], a[href^="https://haraj.com.sa/"]')) {
        const href = a.getAttribute("href") || "";
        if (!/^https:\/\/haraj\.com\.sa\/\d{8,}\//.test(new URL(href, location.origin).href)) continue;
        const t = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (t) out.push({ title: t, url: new URL(href, location.origin).href });
      }
      return out;
    });
    const seen = new Set();
    const items = [];
    for (const g of apiItems.map(mapApi)) {
      if (g.url && !seen.has(g.url)) { seen.add(g.url); items.push(g); }
    }
    for (const d of dom) {
      if (d.url && !seen.has(d.url)) { seen.add(d.url); items.push({ id: null, price: null, city: null, date: null, seller: null, ...d }); }
    }
    console.log(JSON.stringify({ source: "patchright", keyword, ms: Date.now() - t0, count: items.slice(0, limit).length, items: items.slice(0, limit) }));
  } finally {
    await context.close();
  }
})().catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
