"use strict";
// Playwright scraper, optimized for speed:
// - headless chromium, images/CSS/media/fonts blocked via route abort
// - search page parsed in-page; detail pages for first N results only
// - polite 1s gap between detail visits
//
// Run once:  node scraper.js --once [keyword]
// Library:   const { runScrape } = require("./scraper");

const { chromium } = require("playwright");
const { upsertListing, startRun, finishRun } = require("./db");
const { sendToAll } = require("./push");

const BASE = "https://haraj.com.sa";
const DETAIL_LIMIT = 10;
const DETAIL_GAP_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Haraj GraphQL fast path (no browser) ---
// The SPA itself fetches search results from this endpoint, so asking it
// directly returns the same dataset as a real user session — full fields
// (seller, thumbnails, district, body text) in <1s. The server answers
// HTTP 200 with a literal "..." body for malformed queries, hence the
// strict shape validation below.
const GRAPHQL_URL = "https://graphql.haraj.com.sa/?queryName=search";
const SEARCH_QUERY = `query Search($search: String!, $city: String, $page: Int, $limit: Int) {
  search(search: $search, city: $city, page: $page, limit: $limit) {
    items {
      id title postDate updateDate authorUsername authorId URL bodyTEXT
      thumbURL city geoCity geoNeighborhood tags
      price { formattedPrice inputPrice }
      commentCount status
    }
    pageInfo { hasNextPage }
  }
}`;
const GQL_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://haraj.com.sa",
  Referer: "https://haraj.com.sa/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

async function fetchGraphQL(keyword, { limit = 20 } = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: GQL_HEADERS,
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: keyword, page: 1, limit } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (text === "...") throw new Error("GraphQL rejected query shape");
  const items = JSON.parse(text)?.data?.search?.items;
  if (!Array.isArray(items)) throw new Error("GraphQL unexpected shape");
  return items.map(mapGraphQLItem).filter((i) => i.url && i.title);
}

// Map one GraphQL Post to our listing shape (same fields as the DOM path,
// plus seller/thumb/district that DOM parsing cannot see).
function mapGraphQLItem(g) {
  const src = g && typeof g === "object" ? g : {};
  const epoch = Number(src.postDate || src.updateDate);
  const date =
    Number.isFinite(epoch) && epoch > 0
      ? new Date(epoch * 1000).toISOString().slice(0, 10)
      : null;
  const rawUrl = src.URL ? String(src.URL) : null;
  const tags = Array.isArray(src.tags)
    ? src.tags.map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean)
    : [];
  const body = String(src.bodyTEXT || src.bodyHTML || "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
  return {
    title: src.title || null,
    url: rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `${BASE}/${rawUrl.replace(/^\//, "")}`) : null,
    price: src?.price?.formattedPrice || (src?.price?.inputPrice != null ? String(src.price.inputPrice) : null),
    city: src.city || src.geoCity || null,
    date,
    description: body || null,
    category: pickCategory(tags, src.city, src.title),
    country: "Saudi Arabia",
    region: null, // derived from the city map in db.js
    seller: src.authorUsername || null,
    thumb: src.thumbURL || (Array.isArray(src.imagesList) ? src.imagesList[0] : null) || null,
    district: src.geoNeighborhood || null,
  };
}

// Resource types blocked for speed. Scripts, documents and data fetches
// (xhr/fetch/websocket) are NEVER blocked — Haraj hydrates content via JS,
// and blocking scripts is what starved dynamic content in earlier versions.
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet"]);
function isBlockedResource(type) {
  return BLOCKED_RESOURCE_TYPES.has(type);
}

// Block everything that isn't document/script/data.
async function fastContext(browser) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    locale: "ar-SA",
  });
  await context.route("**/*", (route) =>
    isBlockedResource(route.request().resourceType()) ? route.abort() : route.continue()
  );
  return context;
}

// Extract result cards from the search page inside the browser.
async function extractSearchItems(page) {
  return page.evaluate(() => {
    const norm = (v) => (v ? v.replace(/\s+/g, " ").trim() : null);
    const abs = (h) => {
      try {
        return new URL(h, location.origin).href;
      } catch {
        return null;
      }
    };
    const isAd = (h) => /^https:\/\/haraj\.com\.sa\/\d{8,}\//i.test(h || "");
    const priceRe = /^(?:\d[\d,.]{2,}\s*(?:ريال|ر\.س|SAR)?|(?:ريال|ر\.س|SAR)\s*\d[\d,.]*)$/i;
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href^="/"], a[href^="https://haraj.com.sa/"]')) {
      const href = abs(a.getAttribute("href"));
      if (!isAd(href) || seen.has(href)) continue;
      const title = norm(a.textContent);
      if (!title) continue;
      seen.add(href);
      let root = a;
      while (root.parentElement) root = root.parentElement; // card root fallback
      const lines = (a.closest("article,li,section,div")?.innerText || "")
        .split("\n").map(norm).filter(Boolean);
      let price = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (priceRe.test(lines[i])) { price = lines[i]; break; }
      }
      const cityEl = a.closest("article,li,section,div")?.querySelector('a[href*="/city/"]');
      out.push({ title, url: href, price, city: norm(cityEl?.textContent), date: null, description: null });
    }
    return out;
  });
}

// Pull title/price/city/date/full-description from an ad detail page.
// Waits for hydrated body content; description keeps full deep text.
async function extractDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("article, main, h1", { timeout: 8000 }).catch(() => {});
  return page.evaluate(() => {
    const norm = (v) => (v ? v.replace(/\s+/g, " ").trim() : null);
    const pick = (sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        const t = norm(el?.textContent || el?.innerText);
        if (t) return t;
      }
      return null;
    };
    // Date: <time> is rare on Haraj — fall back to scanning small
    // elements for relative-date text ("قبل ٢٨ دقيقة", "أمس", ...).
    const dateFromText = (() => {
      const els = document.querySelectorAll("span, div, p, li, small, td");
      for (const el of els) {
        const t = norm(el.textContent);
        if (!t || t.length > 40) continue;
        const m = t.match(/(قبل|منذ)\s*[٠-٩\d]+\s*\S+|أمس|امس|اليوم/);
        if (m) return m[0];
      }
      return null;
    })();
    // Category: Haraj embeds a JSON-LD BreadcrumbList (tags path).
    const ldCrumbs = (() => {
      const out = [];
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(s.textContent || "null");
          const blocks = Array.isArray(data) ? data : [data];
          for (const b of blocks) {
            if (b && b["@type"] === "BreadcrumbList" && Array.isArray(b.itemListElement)) {
              for (const li of b.itemListElement) {
                const name = norm(li?.item?.name || li?.name);
                if (name) out.push(name);
              }
            }
          }
        } catch { /* ignore malformed blocks */ }
      }
      return out;
    })();
    // City: the first [class*='city'] match is often a login widget
    // ("دخول عربي(AR)"), and detail pages show districts ("العليا")
    // rather than cities — the search card city wins later in Node.
    const isJunkCity = (t) =>
      !t || /دخول|login|تسجيل|^AR$|\(AR\)/i.test(t) || t.length > 30;
    const cityOf = (() => {
      const link = document.querySelector("a[href*='/city/']");
      const lt = norm(link?.textContent);
      if (lt && !isJunkCity(lt)) return lt;
      for (const el of document.querySelectorAll("[class*='city']")) {
        const t = norm(el.textContent || el.innerText);
        if (t && !isJunkCity(t)) return t;
      }
      return null;
    })();
    return {
      title: pick(["h1", "meta[property='og:title']"]) || document.title,
      price: pick(["[class*='price']", "[data-testid*='price']"]),
      city: cityOf,
      date: norm(document.querySelector("time[datetime]")?.getAttribute("datetime"))
        || dateFromText
        || pick(["time", "[class*='date']"]),
      description: (pick(["[class*='description']", "article", "main"]) || "").slice(0, 8000),
      // Breadcrumb trails for category heuristics (picked in Node, not stored raw).
      ldCrumbs,
      crumbs: [...document.querySelectorAll("nav a, [class*='breadcrumb'] a")]
        .map((a) => norm(a.textContent)).filter(Boolean).slice(0, 8),
    };
  });
}

// Heuristic category from breadcrumb trails like
// ["حراج العقار", "شقق للايجار", "شقق للايجار في الخبر"].
// Location-qualified crumbs ("... في الخبر", "حي ...") refine place,
// not category — the deepest topical crumb wins. Null when unknown.
function pickCategory(crumbs, city, title) {
  if (!Array.isArray(crumbs)) return null;
  const noise = new Set(["حراج", "الرئيسية", "الرئيسيه", "home", "الرئيسية حراج"]);
  const cityN = (city || "").replace(/\s+/g, " ").trim();
  const titleN = (title || "").replace(/\s+/g, " ").trim();
  const clean = [];
  for (const c of crumbs) {
    if (!c || noise.has(c) || c === cityN || c === titleN) continue;
    clean.push(c);
  }
  if (!clean.length) return null;
  const topical = clean.filter((c) => !/ في /.test(c) && !/^حي /.test(c));
  const pool = topical.length ? topical : clean;
  return pool[pool.length - 1];
}

// Normalize Haraj date strings to YYYY-MM-DD:
// ISO passthrough, DD/MM/YYYY flip, "اليوم"/"أمس",
// "قبل/منذ N دقيقة/ساعة/يوم/أسبوع/شهر/سنة". Else null.
function parseHarajDate(raw) {
  if (!raw) return null;
  // Haraj mixes Western and Arabic-Indic digits ("قبل ٢٨ دقيقة").
  const digits = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim().replace(/[٠-٩]/g, (d) => digits.indexOf(d));
  s = s.replace(/\s+/g, " ");
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const now = new Date();
  const day = (d) => d.toISOString().slice(0, 10);
  if (/اليوم/.test(s)) return day(now);
  if (/أمس|امس/.test(s)) return day(new Date(now.getTime() - 864e5));
  // Dual forms without a digit ("قبل ساعتين" = 2 hours ago).
  m = s.match(/(?:قبل|منذ)\s*(ساعتين|يومين|أسبوعين|اسبوعين|شهرين|سنتين|عامين|دقيقتين)/);
  const dualUnit = m ? m[1] : null;
  m = s.match(/(?:قبل|منذ)\s*(\d+)\s*(\S+)/);
  const n = m ? parseInt(m[1], 10) : dualUnit ? 2 : null;
  const u = m ? m[2] : dualUnit || "";
  if (n != null) {
    const d = new Date(now);
    if (/دقيق|دقائق|دقايق|ثاني|ثوان/.test(u)) d.setMinutes(d.getMinutes() - n);
    else if (/ساع/.test(u)) d.setHours(d.getHours() - n);
    else if (/يوم|أيام|ايام/.test(u)) d.setDate(d.getDate() - n);
    else if (/سبوع/.test(u)) d.setDate(d.getDate() - 7 * n);
    else if (/شهر|شهور|أشهر|اشهر/.test(u)) d.setMonth(d.getMonth() - n);
    else if (/سن|عام/.test(u)) d.setFullYear(d.getFullYear() - n);
    else return null;
    return day(d);
  }
  return null;
}

// Prefer intercepted API items (full fields); fill gaps with DOM cards.
function mergeApiItems(payloads, domItems) {
  const seen = new Set();
  const out = [];
  for (const p of payloads) {
    const arr = p?.search?.items;
    if (!Array.isArray(arr)) continue;
    for (const g of arr) {
      const m = mapGraphQLItem(g);
      if (m.url && m.title && !seen.has(m.url)) { seen.add(m.url); out.push(m); }
    }
  }
  for (const d of domItems) {
    if (d.url && !seen.has(d.url)) { seen.add(d.url); out.push(d); }
  }
  return out;
}

async function runScrape(keyword, { detailLimit = DETAIL_LIMIT } = {}) {
  const kw = (keyword || process.env.HARAJ_KEYWORD || "").trim();
  if (!kw) throw new Error("Missing keyword (arg or HARAJ_KEYWORD)");
  const fresh = []; // newly-seen listings (for push)
  // Fast path first: GraphQL returns the full session dataset in <1s.
  try {
    const gqlItems = await fetchGraphQL(kw, { limit: Math.max(detailLimit, 20) });
    if (gqlItems.length) {
      const runId0 = startRun(kw);
      let added = 0;
      for (const it of gqlItems) {
        if (upsertListing(it)) { fresh.push(it); added++; }
      }
      finishRun(runId0, { found: gqlItems.length, addedNew: added, status: "ok" });
      for (const it of fresh) {
        sendToAll({ title: "New ad: " + (it.title || kw), body: it.price || "", url: it.url }).catch(() => {});
      }
      return { found: gqlItems.length, addedNew: added, source: "graphql" };
    }
  } catch (e) {
    console.warn("[scrape] GraphQL fast path failed, falling back to browser:", e.message);
  }
  // Browser fallback (DOM parsing + intercepted API payloads).
  const runId = startRun(kw);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await fastContext(browser);
    const page = await context.newPage();
    // Network over HTML: capture the SPA's own search-API payloads live.
    // Attached before navigation; filtered to Haraj GraphQL JSON only.
    const apiPayloads = [];
    page.on("response", async (res) => {
      try {
        const ct = res.headers()["content-type"] || "";
        if (!ct.includes("application/json") || !res.url().includes("graphql.haraj.com.sa")) return;
        const body = await res.json().catch(() => null);
        if (body && body.data) apiPayloads.push(body.data);
      } catch { /* ignore aborted/non-JSON */ }
    });
    await page.goto(`${BASE}/search/${encodeURIComponent(kw)}/`, {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    // Let hydration settle (bounded): scripts already ran at domcontentloaded.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('a[href^="/"]', { timeout: 15000 }).catch(() => {});
    const items = mergeApiItems(apiPayloads, await extractSearchItems(page));

    const detailPage = await context.newPage();
    const enriched = [];
    for (const item of items.slice(0, detailLimit)) {
      try {
        const d = await extractDetail(detailPage, item.url);
        const merged = { ...item };
        for (const [k, v] of Object.entries(d)) {
          if (k !== "crumbs" && k !== "ldCrumbs" && v) merged[k] = v;
        }
        // Search-card city (from /city/ links) is the real city;
        // detail pages often show a district ("العليا") instead.
        if (item.city) merged.city = item.city;
        // Normalize date (relative Arabic dates → YYYY-MM-DD) and
        // derive category from JSON-LD breadcrumbs (DOM crumbs fallback).
        // Region is derived in db.js from the city map when missing.
        merged.date = parseHarajDate(d.date || item.date) || null;
        merged.category = pickCategory(d.ldCrumbs?.length ? d.ldCrumbs : d.crumbs, merged.city, merged.title);
        enriched.push(merged);
      } catch {
        enriched.push(item); // detail failed → keep search-card data
      }
      await sleep(DETAIL_GAP_MS);
    }
    await detailPage.close();
    const rest = items.slice(detailLimit);
    const all = [...enriched, ...rest];

    for (const it of all) {
      // region/category survive when present; db.js derives region from city map as fallback.
      if (upsertListing({ country: "Saudi Arabia", ...it })) fresh.push(it);
    }
    finishRun(runId, { found: all.length, addedNew: fresh.length, status: "ok" });

    // Notify subscribers about new links (fire-and-forget).
    for (const it of fresh) {
      sendToAll({ title: "New ad: " + (it.title || kw), body: it.price || "", url: it.url }).catch(() => {});
    }
    await context.close();
    return { found: all.length, addedNew: fresh.length };
  } catch (err) {
    finishRun(runId, { status: "error: " + String(err.message || err).slice(0, 200) });
    throw err;
  } finally {
    await browser.close();
  }
}

if (require.main === module && process.argv.includes("--once")) {
  const kw = process.argv[process.argv.indexOf("--once") + 1] || process.env.HARAJ_KEYWORD;
  runScrape(kw).then(
    (r) => { console.log(`done: found=${r.found} new=${r.addedNew}`); process.exit(0); },
    (e) => { console.error("scrape failed:", e.message); process.exit(1); }
  );
}

module.exports = { runScrape, fetchGraphQL, mapGraphQLItem, mergeApiItems, parseHarajDate, pickCategory, isBlockedResource };
