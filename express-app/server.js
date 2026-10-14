"use strict";
// Express server: static frontend + JSON API + hourly cron scrape.
//
//   npm install
//   npx playwright install chromium
//   node server.js            → http://localhost:3000
//
// Env: PORT (default 3000), HARAJ_KEYWORD (default keyword for cron),
//      VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT (web push).

const path = require("path");
const express = require("express");
const cron = require("node-cron");
const { getListings, markSeen, getRuns, getMeta } = require("./db");
const { runScrape } = require("./scraper");
const push = require("./push");

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json());

// --- Static frontend (table view) ---
app.use(express.static(path.join(__dirname, "public")));

// --- API ---
// GET /api/listings?q=&location=&region=&city=&category=&from=&to=&maxPrice=&limit=&newOnly=1
// (limit default 20, hard cap 20; maxPrice drops rows priced above it;
// `location` is a key from /api/meta; legacy `country` is ignored)
app.get("/api/listings", (req, res) => {
  const listings = getListings(req.query);
  res.json({ listings, count: listings.length });
});

// PUT /api/listings/seen {ids:[...]} — clear "new" badges
app.put("/api/listings/seen", (req, res) => {
  const n = markSeen(req.body && req.body.ids);
  res.json({ updated: n });
});

// POST /api/scrape — run a scrape in the background (409 if busy)
let scraping = false;
async function triggerScrape(keyword, source) {
  if (scraping) return { started: false, reason: "already-running" };
  scraping = true;
  const kw = keyword || process.env.HARAJ_KEYWORD || "cars";
  console.log(`[scrape] started (${source}, keyword="${kw}")`);
  runScrape(kw).then(
    (r) => console.log(`[scrape] done: found=${r.found} new=${r.addedNew}`),
    (e) => console.error("[scrape] failed:", e.message)
  ).finally(() => { scraping = false; });
  return { started: true };
}
app.post("/api/scrape", async (req, res) => {
  const r = await triggerScrape(req.body && req.body.keyword, "manual");
  res.status(r.started ? 202 : 409).json(r);
});

// GET /api/meta — locations hierarchy, cities per KSA region, known categories
app.get("/api/meta", (req, res) => {
  res.json(getMeta());
});

// GET /api/history — recent scrape runs, newest first
app.get("/api/history", (req, res) => {
  res.json({ runs: getRuns(20) });
});

// Push subscription endpoints
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ key: push.getPublicKey() });
});
app.post("/api/subscribe", (req, res) => {
  try {
    if (!push.isConfigured()) return res.status(503).json({ error: "push-not-configured" });
    push.saveSubscription(req.body && req.body.subscription);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Hourly cron: scrape in the background, skip if one is running ---
cron.schedule("0 * * * *", () => {
  triggerScrape(null, "cron").then((r) => {
    if (!r.started) console.log("[cron] skipped: previous scrape still running");
  });
});

app.listen(PORT, () => {
  console.log(`Haraj Express app on http://localhost:${PORT}`);
  console.log(`Cron: hourly scrape ${process.env.HARAJ_KEYWORD ? `(keyword="${process.env.HARAJ_KEYWORD}")` : "(default keyword)"}, push ${push.isConfigured() ? "configured" : "NOT configured (set VAPID_* env)"}`);
});
