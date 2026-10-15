"use strict";
// Express server: static frontend + JSON API + scheduled saved-search checks.
//
//   npm install
//   npx playwright install chromium     (only needed for the browser fallback)
//   node server.js                      → http://localhost:3000
//
// Env:
//   PORT (3000), HOST (0.0.0.0 — reachable from your phone on the same Wi-Fi)
//   HARAJ_CRON     optional fixed cron for saved-search checks (otherwise set in the app: 10–120 min, default 30)
//   HARAJ_KEYWORD  optional legacy keyword scraped on schedule when no saved searches exist
//   APP_PASSWORD   optional; protects the app with a password (user name: anything)
//   ANTHROPIC_API_KEY (+ HARAJ_AI_MODEL) optional; enables the AI query helper
//   VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT  web push

const path = require("path");
const express = require("express");
const cron = require("node-cron");
const DB = require("./db");
const { runScrape, liveSearch, runWatch, isQuietNow, fetchPost, postIdFromUrl } = require("./scraper");
const { parseQuery } = require("./query");
const push = require("./push");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const app = express();
app.use(express.json({ limit: "100kb" }));

// --- Optional password (HTTP Basic) ---
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const h = req.headers.authorization || "";
    const pass = h.startsWith("Basic ") ? Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":") : null;
    if (pass === process.env.APP_PASSWORD) return next();
    res.set("WWW-Authenticate", 'Basic realm="Haraj Radar"').status(401).send("Password required");
  });
}

// --- Static frontend ---
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, file) {
    if (file.endsWith("sw.js")) res.set("Cache-Control", "no-cache");
  },
}));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error("[api]", req.method, req.path, e.message);
    res.status(500).json({ error: e.message || "server-error" });
  });

// --- Listings ---
// GET /api/listings?q=&location=&city=&category=&minPrice=&maxPrice=&hasPrice=1&hasImage=1
//   &from=&to=&newOnly=1&starred=1&priceDrop=1&watch=<id>&sort=&limit=&offset=
app.get("/api/listings", (req, res) => {
  const f = { ...req.query };
  if (typeof f.includeIds === "string") f.includeIds = f.includeIds.split(",").slice(0, 500);
  const r = DB.searchListings(f);
  res.json({ ...r, count: r.listings.length });
});

// POST /api/search {q, live, ai, harajPage, filters:{...same keys as /api/listings}}
// Parses natural Arabic ("ايفون في جدة اقل من 2000"), searches Haraj live
// (GraphQL, browser fallback), stores results, then returns ranked matches.
app.post("/api/search", wrap(async (req, res) => {
  const body = req.body || {};
  const q = String(body.q || "").trim().slice(0, 200);
  const f = { ...(body.filters || {}) };
  const parsed = q ? await parseQuery(q, { ai: !!body.ai }) : { keyword: "", source: "none" };
  // Values the user set explicitly in the filter panel win over parsed ones.
  const pick = (explicit, fromText) => (explicit != null && explicit !== "" ? explicit : fromText);
  const filters = {
    ...f,
    q: parsed.keyword,
    city: pick(f.city, parsed.city),
    minPrice: pick(f.minPrice, parsed.minPrice),
    maxPrice: pick(f.maxPrice, parsed.maxPrice),
    sort: pick(f.sort, parsed.sort),
    exclude: [].concat(parsed.exclude || [], f.exclude ? String(f.exclude).split(/[,،\s]+/) : []),
  };
  let live = null;
  if (body.live !== false && parsed.keyword) {
    try {
      live = await liveSearch(parsed.keyword, {
        city: filters.city || null,
        pages: Math.min(Number(body.pages) || 2, 4),
        startPage: Math.max(Number(body.harajPage) || 1, 1),
      });
      const prev = Array.isArray(f.includeIds) ? f.includeIds.slice(0, 400) : [];
      filters.includeIds = prev.concat(live.ids);
    } catch (e) {
      live = { error: e.message };
    }
  }
  const r = DB.searchListings(filters);
  const newSet = new Set((live && live.newIds) || []);
  res.json({
    parsed,
    filters: { city: filters.city || null, minPrice: filters.minPrice ?? null, maxPrice: filters.maxPrice ?? null, sort: r.sort, exclude: parsed.exclude || [] },
    live: live && { found: live.found, added: live.added, source: live.source, hasMore: live.hasMore, error: live.error, ids: live.ids },
    ...r,
    listings: r.listings.map((l) => ({ ...l, just_added: newSet.has(l.id) })),
    count: r.listings.length,
  });
}));

// GET /api/parse?q=&ai=1 — preview how a sentence is understood.
app.get("/api/parse", wrap(async (req, res) => {
  res.json(await parseQuery(String(req.query.q || ""), { ai: req.query.ai === "1" }));
}));

// Hide phone numbers that sellers type into the description — contact
// happens on Haraj itself, the app never shows or stores numbers.
function maskPhones(text) {
  return String(text || "").replace(/(?:\+|00)?(?:9\s?6\s?6|٩\s?٦\s?٦)?[\s-]?[0٠]?[5٥](?:[\s-]?[0-9٠-٩]){8}(?![0-9٠-٩])/g,
    (m) => (/^\s/.test(m) ? " " : "") + "‹رقم مخفي›");
}

// GET /api/listings/:id/details — all photos + full text, fetched live from Haraj.
app.get("/api/listings/:id/details", wrap(async (req, res) => {
  const row = DB.getListingsByIds([req.params.id])[0];
  if (!row) return res.status(404).json({ error: "not-found" });
  const full = DB.db.prepare("SELECT description FROM listings WHERE id = ?").get(row.id);
  let live = null;
  let removed = false;
  const pid = postIdFromUrl(row.url);
  if (pid) {
    try { live = await fetchPost(pid); removed = live === null; } catch (e) { live = { error: e.message }; }
  }
  if (live && !live.error && live.price) DB.upsertListing({ url: row.url, price: live.price }); // keep price fresh
  const images = live && live.images && live.images.length ? live.images : row.thumb ? [row.thumb] : [];
  res.json({
    listing: DB.getListingsByIds([row.id])[0],
    images,
    description: maskPhones((live && live.descriptionFull) || (full && full.description) || ""),
    district: (live && live.district) || row.district,
    comments: live ? live.comments || 0 : 0,
    tags: live && live.category ? [live.category].concat(live.subcategory ? live.subcategory.split(" / ") : []) : [],
    removed,
    error: live && live.error ? live.error : null,
  });
}));

// PUT /api/listings/seen {ids:[...]} or {all:true} — clear "new" badges
app.put("/api/listings/seen", (req, res) => {
  const b = req.body || {};
  res.json({ updated: DB.markSeen(b.all ? "all" : b.ids) });
});

// PUT /api/listings/:id {starred?, hidden?}
app.put("/api/listings/:id", (req, res) => {
  const b = req.body || {};
  let n = 0;
  if ("starred" in b) n += DB.setFlag(req.params.id, "starred", !!b.starred);
  if ("hidden" in b) n += DB.setFlag(req.params.id, "hidden", !!b.hidden);
  res.json({ updated: n });
});

// --- Legacy background scrape (one keyword) ---
let scraping = false;
async function triggerScrape(keyword, source) {
  if (scraping) return { started: false, reason: "already-running" };
  scraping = true;
  const kw = keyword || process.env.HARAJ_KEYWORD || "cars";
  console.log(`[scrape] started (${source}, keyword="${kw}")`);
  runScrape(kw).then(
    (r) => console.log(`[scrape] done: found=${r.found} new=${r.addedNew} via ${r.source}`),
    (e) => console.error("[scrape] failed:", e.message)
  ).finally(() => { scraping = false; });
  return { started: true };
}
app.post("/api/scrape", wrap(async (req, res) => {
  const r = await triggerScrape(req.body && req.body.keyword, "manual");
  res.status(r.started ? 202 : 409).json(r);
}));

// --- Saved searches (watches) ---
let watchesRunning = false;
async function runAllWatches(source) {
  if (watchesRunning) return { started: false };
  watchesRunning = true;
  const summary = { checked: 0, fresh: 0 };
  try {
    const list = DB.listWatches().filter((w) => w.enabled);
    if (!list.length && process.env.HARAJ_KEYWORD && source === "cron") {
      await triggerScrape(null, "cron");
    }
    for (const w of list) {
      try {
        const r = await runWatch(w);
        summary.checked++;
        summary.fresh += r.fresh;
      } catch (e) {
        console.error(`[watch ${w.id}] failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 1500)); // be polite to Haraj
    }
    if (list.length) console.log(`[watches] ${source}: checked=${summary.checked} new=${summary.fresh}`);
    DB.setSetting("last_check_at", new Date().toISOString());
  } finally {
    watchesRunning = false;
  }
  return { started: true, ...summary };
}

app.get("/api/watches", (req, res) => res.json({ watches: DB.listWatches() }));

// POST /api/watches {q, label?, city?, minPrice?, maxPrice?}
// Text like "ايفون 13 في جدة اقل من 2000" is parsed into filters.
app.post("/api/watches", wrap(async (req, res) => {
  const b = req.body || {};
  const q = String(b.q || "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  const p = await parseQuery(q, { ai: !!b.ai });
  const spec = {
    q: p.keyword || q,
    label: b.label || q,
    city: b.city || p.city,
    minPrice: b.minPrice ?? p.minPrice,
    maxPrice: b.maxPrice ?? p.maxPrice,
    exclude: [].concat(p.exclude || [], b.exclude ? String(b.exclude).split(/[,،\s]+/) : []),
  };
  const same = DB.findSameWatch(spec);
  if (same) return res.status(409).json({ error: "duplicate", watch: same });
  const w = DB.createWatch(spec);
  // Baseline in the background: today's matches are marked seen so you
  // only get alerted about ads posted from now on.
  runWatch(w, { baseline: true }).catch((e) => console.error("[watch baseline]", e.message));
  res.status(201).json({ watch: w });
}));

app.patch("/api/watches/:id", (req, res) => {
  const w = DB.updateWatch(req.params.id, req.body || {});
  if (!w) return res.status(404).json({ error: "not-found" });
  res.json({ watch: w });
});

app.delete("/api/watches/:id", (req, res) => res.json({ deleted: DB.deleteWatch(req.params.id) }));

app.post("/api/watches/:id/run", wrap(async (req, res) => {
  const w = DB.getWatch(req.params.id);
  if (!w) return res.status(404).json({ error: "not-found" });
  const r = await runWatch(w);
  res.json({ ...r, watch: DB.getWatch(w.id) });
}));

app.put("/api/watches/:id/seen", (req, res) => res.json({ updated: DB.markWatchSeen(req.params.id) }));

app.post("/api/watches/run-all", wrap(async (req, res) => {
  const r = await runAllWatches("manual");
  res.status(r.started ? 200 : 409).json(r);
}));

// --- Meta / stats / history / status ---
app.get("/api/meta", (req, res) => res.json(DB.getMeta()));
app.get("/api/stats", (req, res) => res.json({ ...DB.getStats(), scraping, watchesRunning, push: push.isConfigured(), schedule: scheduleInfo() }));
app.get("/api/history", (req, res) => res.json({ runs: DB.getRuns(30) }));
app.get("/api/status", (req, res) => res.json({ scraping, watchesRunning }));

// --- Push ---
app.get("/api/vapid-public-key", (req, res) => res.json({ key: push.getPublicKey() }));
app.post("/api/subscribe", (req, res) => {
  try {
    if (!push.isConfigured()) return res.status(503).json({ error: "push-not-configured" });
    push.saveSubscription(req.body && req.body.subscription);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/push-test", wrap(async (req, res) => {
  const r = await push.sendToAll({ title: "رادار حراج", body: "التنبيهات تعمل ✓", url: "/" });
  res.json(r);
}));

// --- Schedule: check saved searches ---
// Interval comes from the app settings (10/15/30/60/120 min, default 30)
// unless HARAJ_CRON pins a custom cron expression.
const INTERVALS = [10, 15, 30, 60, 120];
let task = null;
let everyMin = null;
function cronFor(min) {
  if (min < 60) return `*/${min} * * * *`;
  return min === 60 ? "0 * * * *" : `0 */${min / 60} * * *`;
}
// Next clock-aligned run (cron "*/30" fires at :00 and :30).
function nextRunAt(min, from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  if (min < 60) {
    d.setMinutes(Math.floor(d.getMinutes() / min) * min + min);
  } else {
    const hrs = min / 60;
    d.setMinutes(0);
    d.setHours(Math.floor(d.getHours() / hrs) * hrs + hrs);
  }
  return d;
}
function schedule() {
  if (task) task.stop();
  const expr = process.env.HARAJ_CRON || cronFor(everyMin);
  task = cron.schedule(expr, () => {
    runAllWatches("cron").then((r) => { if (!r.started) console.log("[cron] skipped: previous check still running"); });
  });
  return expr;
}
everyMin = Number(DB.getSetting("check_every", 30));
if (!INTERVALS.includes(everyMin)) everyMin = 30;
const SCHEDULE = schedule();

function scheduleInfo() {
  return {
    everyMinutes: process.env.HARAJ_CRON ? null : everyMin,
    fixedCron: process.env.HARAJ_CRON || null,
    lastCheckAt: DB.getSetting("last_check_at"),
    nextCheckAt: process.env.HARAJ_CRON ? null : nextRunAt(everyMin).toISOString(),
    running: watchesRunning,
    options: INTERVALS,
  };
}
function quietInfo() {
  return {
    on: DB.getSetting("quiet_on", "0") === "1",
    from: Number(DB.getSetting("quiet_from", 0)),
    to: Number(DB.getSetting("quiet_to", 7)),
    now: isQuietNow(),
  };
}
app.get("/api/settings", (req, res) => res.json({ schedule: scheduleInfo(), quiet: quietInfo(), push: push.isConfigured(), ai: !!process.env.ANTHROPIC_API_KEY }));
app.put("/api/settings", (req, res) => {
  const b = req.body || {};
  if (b.quiet && typeof b.quiet === "object") {
    const hr = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : d);
    if ("on" in b.quiet) DB.setSetting("quiet_on", b.quiet.on ? "1" : "0");
    if ("from" in b.quiet) DB.setSetting("quiet_from", hr(b.quiet.from, 0));
    if ("to" in b.quiet) DB.setSetting("quiet_to", hr(b.quiet.to, 7));
  }
  const n = Number(b.checkEvery);
  if (n) {
    if (process.env.HARAJ_CRON) return res.status(409).json({ error: "fixed-by-HARAJ_CRON" });
    if (!INTERVALS.includes(n)) return res.status(400).json({ error: "bad-interval" });
    everyMin = n;
    DB.setSetting("check_every", n);
    schedule();
  }
  res.json({ schedule: scheduleInfo(), quiet: quietInfo() });
});

// --- Blocked sellers: everywhere (watchId 0) or for one saved search ---
app.get("/api/blocked", (req, res) => res.json({ sellers: DB.listBlockedSellers() }));
app.post("/api/blocked", (req, res) => {
  const b = req.body || {};
  if (!b.seller) return res.status(400).json({ error: "seller required" });
  DB.blockSeller(b.seller, b.watchId || 0);
  res.status(201).json({ ok: true });
});
app.delete("/api/blocked", (req, res) => {
  const b = req.body || {};
  res.json({ deleted: DB.unblockSeller(b.seller, b.watchId || 0) });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const os = require("os");
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => `http://${i.address}:${PORT}`);
    console.log(`Haraj Radar on http://localhost:${PORT}${lan.length ? "  (phone on same Wi-Fi: " + lan.join(", ") + ")" : ""}`);
    console.log(`Saved searches checked on "${SCHEDULE}", push ${push.isConfigured() ? "configured" : "NOT configured (set VAPID_* env)"}, AI helper ${process.env.ANTHROPIC_API_KEY ? "on" : "off"}`);
  });
}

module.exports = { app, nextRunAt, cronFor };
