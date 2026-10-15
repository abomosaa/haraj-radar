"use strict";
// SQLite history store — Node built-in (node:sqlite, no native build needed).
// DB file: express-app/data/app.db (auto-created, git-ignored).

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const Q = require("./query");
const { normalizeArabic, cityToRegion, tokenize, tokenVariants, parsePrice } = Q;

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Overridable for tests: HARAJ_DB_PATH points at a temp file.
const DB_PATH = process.env.HARAJ_DB_PATH || path.join(DATA_DIR, "app.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    price TEXT,
    price_value INTEGER,
    city TEXT,
    region TEXT,
    country TEXT,
    date TEXT,
    category TEXT,
    description TEXT,
    first_seen TEXT NOT NULL,
    is_new INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    keyword TEXT,
    found INTEGER DEFAULT 0,
    added_new INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running'
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY,
    keys TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    q TEXT NOT NULL,
    label TEXT,
    city TEXT,
    min_price INTEGER,
    max_price INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_run_at TEXT,
    last_status TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS watch_hits (
    watch_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (watch_id, listing_id)
  );
`);

// --- Migrations (additive; old DBs keep working) ---
(function migrate() {
  const cols = db.prepare("PRAGMA table_info(listings)").all().map((c) => c.name);
  const add = [
    ["title_norm", "TEXT"], ["city_norm", "TEXT"], ["description_norm", "TEXT"],
    ["seller", "TEXT"], ["thumb", "TEXT"], ["district", "TEXT"],
    ["subcategory", "TEXT"], ["last_seen", "TEXT"], ["prev_price_value", "INTEGER"],
    ["price_changed_at", "TEXT"], ["starred", "INTEGER NOT NULL DEFAULT 0"],
    ["hidden", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [col, type] of add) {
    if (!cols.includes(col)) db.exec(`ALTER TABLE listings ADD COLUMN ${col} ${type}`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_norm);
    CREATE INDEX IF NOT EXISTS idx_listings_date ON listings(date);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price_value);
    CREATE INDEX IF NOT EXISTS idx_hits_listing ON watch_hits(listing_id);
    CREATE INDEX IF NOT EXISTS idx_listings_repost ON listings(title_norm, seller);
  `);
  // v2: normalization now also lowercases Latin + maps Indic digits, and
  // prices like "1,200.50" parse correctly → recompute derived columns once.
  const ver = db.prepare("PRAGMA user_version").get().user_version;
  if (ver < 2) {
    const rows = db.prepare("SELECT id, title, city, description, region, price FROM listings").all();
    const upd = db.prepare(
      "UPDATE listings SET title_norm = ?, city_norm = ?, description_norm = ?, region = COALESCE(?, region), price_value = ? WHERE id = ?"
    );
    db.exec("BEGIN");
    for (const r of rows) {
      upd.run(normalizeArabic(r.title), normalizeArabic(r.city), normalizeArabic(r.description),
        cityToRegion(r.city), parsePrice(r.price), r.id);
    }
    db.exec("COMMIT");
    db.exec("PRAGMA user_version = 2");
  }
  // v3: drop junk cities scraped from the login widget, and move model-level
  // tags (old GraphQL rows stored the deepest tag, e.g. "اكسنت,GL") from
  // category to subcategory so the category filter lists real sections.
  if (ver < 3) {
    db.exec("BEGIN");
    db.exec("UPDATE listings SET city = NULL, city_norm = NULL WHERE city LIKE '%(AR)%' OR city LIKE '%login%' OR length(city) > 30");
    db.exec(`UPDATE listings SET subcategory = category, category = NULL
             WHERE seller IS NOT NULL AND category IS NOT NULL AND category NOT LIKE 'حراج %'`);
    db.exec("COMMIT");
    db.exec("PRAGMA user_version = 3");
  }
  // v4: excluded words per saved search, notification bookkeeping (quiet
  // hours digest), blocked sellers, and removal of duplicate saved searches.
  const wcols = db.prepare("PRAGMA table_info(watches)").all().map((c) => c.name);
  if (!wcols.includes("exclude")) db.exec("ALTER TABLE watches ADD COLUMN exclude TEXT");
  const hcols = db.prepare("PRAGMA table_info(watch_hits)").all().map((c) => c.name);
  if (!hcols.includes("notified")) db.exec("ALTER TABLE watch_hits ADD COLUMN notified INTEGER NOT NULL DEFAULT 1");
  db.exec(`CREATE TABLE IF NOT EXISTS blocked_sellers (
    seller TEXT NOT NULL,
    watch_id INTEGER NOT NULL DEFAULT 0,   -- 0 = everywhere
    created_at TEXT NOT NULL,
    PRIMARY KEY (seller, watch_id)
  )`);
  if (ver < 4) {
    const dupes = db.prepare(`SELECT w.id, (SELECT MIN(id) FROM watches k WHERE k.q = w.q
        AND COALESCE(k.city,'') = COALESCE(w.city,'') AND COALESCE(k.min_price,-1) = COALESCE(w.min_price,-1)
        AND COALESCE(k.max_price,-1) = COALESCE(w.max_price,-1)) AS keep FROM watches w`).all().filter((r) => r.keep !== r.id);
    for (const d of dupes) {
      db.prepare("INSERT OR IGNORE INTO watch_hits (watch_id, listing_id, created_at, seen, notified) SELECT ?, listing_id, created_at, seen, notified FROM watch_hits WHERE watch_id = ?").run(d.keep, d.id);
      db.prepare("DELETE FROM watch_hits WHERE watch_id = ?").run(d.id);
      db.prepare("DELETE FROM watches WHERE id = ?").run(d.id);
    }
    db.exec("PRAGMA user_version = 4");
  }
})();

// Haraj returns bare thumbnail file names ("900x506-1_-GO__x.jpg"); its
// site serves them resized from thumbcdn as "<file>-<size>.webp"
// (140x140 and 400x400 exist — checked on haraj.com.sa).
const IMG_BASE = process.env.HARAJ_IMG_BASE || "https://thumbcdn.haraj.com.sa/";
const IMG_SIZE = "400x400";
function thumbUrl(t) {
  if (!t) return null;
  const s = String(t);
  if (/^https?:\/\//i.test(s)) return s;
  return IMG_BASE + s.replace(/^\/+/, "") + `-${IMG_SIZE}.webp`;
}

const nowIso = () => new Date().toISOString();

// Insert or refresh a listing.
// Returns { id, isNew, priceChanged, oldPrice } — isNew when the URL is unseen.
function upsertListing(item) {
  const row = db.prepare("SELECT id, price_value, thumb, seller, date, category FROM listings WHERE url = ?").get(item.url);
  const priceValue = parsePrice(item.price);
  if (row) {
    const res = { id: row.id, isNew: false, priceChanged: false, oldPrice: row.price_value };
    const sets = ["last_seen = @now"];
    const p = { now: nowIso(), id: row.id };
    if (!row.thumb && item.thumb) { sets.push("thumb = @thumb"); p.thumb = item.thumb; }
    if (!row.seller && item.seller) { sets.push("seller = @seller"); p.seller = item.seller; }
    if (!row.date && item.date) { sets.push("date = @date"); p.date = item.date; }
    if (!row.category && item.category) { sets.push("category = @category"); p.category = item.category; }
    if (priceValue != null && row.price_value != null && priceValue !== row.price_value) {
      sets.push("prev_price_value = price_value", "price_value = @pv", "price = @price", "price_changed_at = @now");
      p.pv = priceValue; p.price = item.price;
      res.priceChanged = true;
    } else if (priceValue != null && row.price_value == null) {
      sets.push("price_value = @pv", "price = @price");
      p.pv = priceValue; p.price = item.price;
    }
    db.prepare(`UPDATE listings SET ${sets.join(", ")} WHERE id = @id`).run(p);
    return res;
  }
  const r = db.prepare(
    `INSERT INTO listings
     (url, title, title_norm, price, price_value, city, city_norm, region, country, date, category, subcategory,
      description, description_norm, seller, thumb, district, first_seen, last_seen, is_new)
     VALUES (@url, @title, @title_norm, @price, @price_value, @city, @city_norm, @region, @country, @date, @category, @subcategory,
      @description, @description_norm, @seller, @thumb, @district, @first_seen, @first_seen, 1)`
  ).run({
    url: item.url,
    title: item.title || null,
    title_norm: normalizeArabic(item.title),
    price: item.price || null,
    price_value: priceValue,
    city: item.city || null,
    city_norm: normalizeArabic(item.city),
    region: item.region || cityToRegion(item.city) || null,
    country: item.country || null,
    date: item.date || null,
    category: item.category || null,
    subcategory: item.subcategory || null,
    description: item.description || null,
    description_norm: normalizeArabic(item.description),
    seller: item.seller || null,
    thumb: item.thumb || null,
    district: item.district || null,
    first_seen: nowIso(),
  });
  return { id: Number(r.lastInsertRowid), isNew: true, priceChanged: false, oldPrice: null };
}

// Escape SQL LIKE wildcards in user input.
function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (m) => "\\" + m);
}

// Build the text-search part: every token must match (AND) in title or
// description; each token matches any of its variants (OR): without "ال",
// synonyms (ايفون ↔ iphone). Also returns a relevance score expression.
function textSearch(q, params) {
  const tokens = tokenize(q);
  const conds = [];
  const scores = [];
  tokens.forEach((tok, ti) => {
    const vars = tokenVariants(tok);
    if (!vars.length) return;
    const titleOr = [];
    const descOr = [];
    vars.forEach((v, vi) => {
      const k = `t${ti}_${vi}`;
      params[k] = `%${likeEscape(v)}%`;
      titleOr.push(`title_norm LIKE @${k} ESCAPE '\\'`);
      descOr.push(`description_norm LIKE @${k} ESCAPE '\\'`);
    });
    conds.push(`(${titleOr.join(" OR ")} OR ${descOr.join(" OR ")})`);
    scores.push(`(CASE WHEN ${titleOr.join(" OR ")} THEN 3 ELSE 0 END)`, `(CASE WHEN ${descOr.join(" OR ")} THEN 1 ELSE 0 END)`);
  });
  const phrase = normalizeArabic(q);
  if (tokens.length > 1 && phrase) {
    params.phrase = `%${likeEscape(phrase)}%`;
    scores.push(`(CASE WHEN title_norm LIKE @phrase ESCAPE '\\' THEN 5 ELSE 0 END)`);
  }
  return { cond: conds.length ? conds.join(" AND ") : null, score: scores.length ? scores.join(" + ") : "0", tokens };
}

const SORTS = {
  newest: "COALESCE(date, substr(first_seen, 1, 10)) DESC, id DESC",
  oldest: "COALESCE(date, substr(first_seen, 1, 10)) ASC, id ASC",
  price_asc: "price_value IS NULL, price_value ASC, id DESC",
  price_desc: "price_value IS NULL, price_value DESC, id DESC",
  added: "id DESC",
};

// "مكسور, قطع" / ["مكسور"] → normalized words (and their ال-less forms).
function excludeTerms(v) {
  const list = Array.isArray(v) ? v : String(v || "").split(/[,،\s]+/);
  const out = new Set();
  for (const w of list) {
    const n = normalizeArabic(String(w).replace(/^-+/, ""));
    if (!n || n.length < 2) continue;
    out.add(n);
    if (/^ال/.test(n) && n.length >= 5) out.add(n.slice(2));
  }
  return [...out];
}

const truthy = (v) => v === true || v === 1 || v === "1" || v === "true";

// Filtered, ranked, paginated listing query.
// Keys: q, location, region, city, category, minPrice, maxPrice, hasPrice,
// hasImage, from, to, newOnly, starred, priceDrop, watch, dupes (1 = keep re-posts), includeIds (array of
// ids that match regardless of text), sort (relevance|newest|price_asc|
// price_desc|added), limit (default 24, max 100), offset.
function searchListings(f = {}) {
  const where = ["hidden = 0"];
  const params = {};
  let score = "0";

  if (f.q) {
    const ts = textSearch(f.q, params);
    score = ts.score;
    const ids = Array.isArray(f.includeIds) ? f.includeIds.map(Number).filter(Number.isFinite) : [];
    if (ts.cond && ids.length) {
      where.push(`((${ts.cond}) OR id IN (${ids.join(",")}))`);
      score = `(${score}) + (CASE WHEN id IN (${ids.join(",")}) THEN 2 ELSE 0 END)`;
    } else if (ts.cond) {
      where.push(`(${ts.cond})`);
    }
  }
  // Excluded words ("-مكسور" in the query, or the panel field).
  excludeTerms(f.exclude).forEach((v, i) => {
    params[`ex${i}`] = `%${likeEscape(v)}%`;
    where.push(`NOT (COALESCE(title_norm,'') LIKE @ex${i} ESCAPE '\\' OR COALESCE(description_norm,'') LIKE @ex${i} ESCAPE '\\')`);
  });
  // Blocked sellers: everywhere, plus the ones blocked for this saved search.
  where.push(`(seller IS NULL OR seller NOT IN (SELECT seller FROM blocked_sellers WHERE watch_id = 0${f.watch ? " OR watch_id = @bw" : ""}))`);
  if (f.watch) params.bw = Number(f.watch);
  for (const k of ["region", "category"]) {
    if (f[k]) { where.push(`${k} = @${k}`); params[k] = f[k]; }
  }
  if (f.city) {
    where.push("city_norm = @cityN");
    params.cityN = normalizeArabic(f.city);
  }
  if (f.from) { where.push("COALESCE(date, substr(first_seen,1,10)) >= @from"); params.from = f.from; }
  if (f.to) { where.push("COALESCE(date, substr(first_seen,1,10)) <= @to"); params.to = f.to; }
  const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const minP = num(f.minPrice);
  const maxP = num(f.maxPrice);
  const strictPrice = truthy(f.hasPrice);
  if (strictPrice) where.push("price_value IS NOT NULL");
  if (maxP != null) { where.push("(price_value IS NULL OR price_value <= @maxP)"); params.maxP = maxP; }
  if (minP != null) { where.push("(price_value IS NULL OR price_value >= @minP)"); params.minP = minP; }
  if (truthy(f.hasImage)) where.push("thumb IS NOT NULL AND thumb != ''");
  if (truthy(f.newOnly)) where.push("is_new = 1");
  if (truthy(f.starred)) where.push("starred = 1");
  if (truthy(f.priceDrop)) where.push("prev_price_value IS NOT NULL AND price_value < prev_price_value");
  // Sellers re-post the same ad; show only the newest copy (same title + seller).
  if (!truthy(f.dupes) && !f.watch && !truthy(f.starred)) {
    where.push("NOT EXISTS (SELECT 1 FROM listings d WHERE d.title_norm = listings.title_norm AND d.seller = listings.seller AND d.hidden = 0 AND d.id > listings.id)");
  }
  if (f.watch) {
    where.push(`id IN (SELECT listing_id FROM watch_hits WHERE watch_id = @watchId${truthy(f.unseenOnly) ? " AND seen = 0" : ""})`);
    params.watchId = Number(f.watch);
  }
  if (f.location) {
    const loc = LOCATIONS.find((l) => l.key === f.location);
    if (loc) {
      if (loc.type === "gcc") { where.push("country = @locCountry"); params.locCountry = loc.country; }
      else { where.push("region = @locRegion"); params.locRegion = loc.region; }
    }
  }

  let lim = parseInt(f.limit, 10);
  if (!Number.isFinite(lim) || lim < 1) lim = 24;
  lim = Math.min(lim, 100);
  let off = parseInt(f.offset, 10);
  if (!Number.isFinite(off) || off < 0) off = 0;

  let sort = f.sort && (SORTS[f.sort] || f.sort === "relevance") ? f.sort : (f.q ? "relevance" : "newest");
  if (sort === "relevance" && score === "0") sort = "newest";
  const order = sort === "relevance" ? `score DESC, ${SORTS.newest}` : SORTS[sort];

  const whereSql = " WHERE " + where.join(" AND ");
  // node:sqlite rejects unknown named params → bind only those each SQL uses.
  const bind = (sql) => Object.fromEntries(Object.entries(params).filter(([k]) => new RegExp(`@${k}\\b`).test(sql)));
  const countSql = "SELECT COUNT(*) AS n FROM listings" + whereSql;
  const total = db.prepare(countSql).get(bind(countSql)).n;
  const rowsSql = `SELECT *, (${score}) AS score FROM listings${whereSql} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`;
  const rows = db.prepare(rowsSql).all(bind(rowsSql));
  return { listings: rows.map(publicRow), total, limit: lim, offset: off, sort };
}

// Back-compat helper: just the rows.
function getListings(f = {}) {
  return searchListings(f).listings;
}

function publicRow(r) {
  const { title_norm, city_norm, description_norm, score, hidden, ...pub } = r;
  return {
    ...pub,
    thumb: thumbUrl(r.thumb),
    description: r.description ? r.description.slice(0, 400) : null,
    is_new: !!r.is_new,
    starred: !!r.starred,
    price_drop: r.prev_price_value != null && r.price_value != null && r.price_value < r.prev_price_value,
  };
}

function getListingsByIds(ids) {
  const list = (ids || []).map(Number).filter(Number.isFinite);
  if (!list.length) return [];
  return db.prepare(`SELECT * FROM listings WHERE id IN (${list.join(",")})`).all().map(publicRow);
}

// --- Location hierarchy: GCC countries + KSA regions (stable keys) ---
const LOCATIONS = [
  { key: "KW", type: "gcc", ar: "الكويت", en: "Kuwait", country: "Kuwait" },
  { key: "AE", type: "gcc", ar: "الإمارات", en: "UAE", country: "UAE" },
  { key: "BH", type: "gcc", ar: "البحرين", en: "Bahrain", country: "Bahrain" },
  { key: "SA-Riyadh", type: "ksa", ar: "منطقة الرياض", en: "Riyadh Region", region: "منطقة الرياض" },
  { key: "SA-Makkah", type: "ksa", ar: "منطقة مكة المكرمة", en: "Makkah Region", region: "منطقة مكة المكرمة" },
  { key: "SA-Madinah", type: "ksa", ar: "منطقة المدينة المنورة", en: "Madinah Region", region: "منطقة المدينة المنورة" },
  { key: "SA-Eastern", type: "ksa", ar: "المنطقة الشرقية", en: "Eastern Province", region: "المنطقة الشرقية" },
  { key: "SA-Asir", type: "ksa", ar: "منطقة عسير", en: "Asir Region", region: "منطقة عسير" },
  { key: "SA-Tabuk", type: "ksa", ar: "منطقة تبوك", en: "Tabuk Region", region: "منطقة تبوك" },
  { key: "SA-Qassim", type: "ksa", ar: "منطقة القصيم", en: "Qassim Region", region: "منطقة القصيم" },
  { key: "SA-Hail", type: "ksa", ar: "منطقة حائل", en: "Hail Region", region: "منطقة حائل" },
  { key: "SA-Jazan", type: "ksa", ar: "منطقة جازان", en: "Jazan Region", region: "منطقة جازان" },
  { key: "SA-Najran", type: "ksa", ar: "منطقة نجران", en: "Najran Region", region: "منطقة نجران" },
  { key: "SA-Baha", type: "ksa", ar: "منطقة الباحة", en: "Al-Baha Region", region: "منطقة الباحة" },
  { key: "SA-Jouf", type: "ksa", ar: "منطقة الجوف", en: "Al-Jouf Region", region: "منطقة الجوف" },
  { key: "SA-Borders", type: "ksa", ar: "منطقة الحدود الشمالية", en: "Northern Borders", region: "منطقة الحدود الشمالية" },
];

// Filter metadata for the frontend dropdowns: cities per region key
// (from the shared city map) and categories with counts.
function getMeta() {
  const citiesByRegion = {};
  for (const loc of LOCATIONS) {
    if (loc.type !== "ksa") continue;
    citiesByRegion[loc.key] = Object.entries(Q.CITY_REGION)
      .filter(([c, r]) => r === loc.region && c !== "الشرقية" && c !== "القصيم" && c !== "الجوف")
      .map(([c]) => c);
  }
  const categories = db
    .prepare("SELECT category, COUNT(*) AS n FROM listings WHERE category IS NOT NULL AND hidden = 0 GROUP BY category ORDER BY n DESC, category LIMIT 60")
    .all()
    .map((r) => r.category);
  const topCities = db
    .prepare("SELECT city, COUNT(*) AS n FROM listings WHERE city IS NOT NULL AND hidden = 0 GROUP BY city_norm ORDER BY n DESC LIMIT 12")
    .all()
    .map((r) => r.city);
  return {
    locations: LOCATIONS.map(({ key, type, ar, en }) => ({ key, type, ar, en })),
    citiesByRegion,
    categories,
    topCities,
    ai: Q.aiEnabled(),
  };
}

function markSeen(ids) {
  if (ids === "all") return Number(db.prepare("UPDATE listings SET is_new = 0 WHERE is_new = 1").run().changes);
  if (!Array.isArray(ids) || !ids.length) return 0;
  const stmt = db.prepare("UPDATE listings SET is_new = 0 WHERE id = ?");
  let n = 0;
  for (const id of ids) n += Number(stmt.run(Number(id)).changes);
  db.prepare(`UPDATE watch_hits SET seen = 1 WHERE listing_id IN (${ids.map(Number).filter(Number.isFinite).join(",") || "NULL"})`).run();
  return n;
}

function setFlag(id, flag, value) {
  if (!["starred", "hidden"].includes(flag)) throw new Error("bad flag");
  return Number(db.prepare(`UPDATE listings SET ${flag} = ? WHERE id = ?`).run(value ? 1 : 0, Number(id)).changes);
}

function startRun(keyword) {
  const r = db.prepare("INSERT INTO runs (started_at, keyword) VALUES (?, ?)").run(nowIso(), keyword || null);
  return Number(r.lastInsertRowid);
}

function finishRun(id, { found = 0, addedNew = 0, status = "ok" } = {}) {
  db.prepare("UPDATE runs SET finished_at = ?, found = ?, added_new = ?, status = ? WHERE id = ?")
    .run(nowIso(), found, addedNew, status, id);
}

function getRuns(limit = 20) {
  return db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit);
}

// --- Watches (saved searches that alert on new matches) ---
function watchRow(w) {
  if (!w) return null;
  const c = db.prepare("SELECT COUNT(*) AS total, SUM(seen = 0) AS unseen FROM watch_hits WHERE watch_id = ?").get(w.id);
  return { ...w, enabled: !!w.enabled, total: c.total || 0, unseen: c.unseen || 0 };
}

function listWatches() {
  return db.prepare("SELECT * FROM watches ORDER BY id DESC").all().map(watchRow);
}

function getWatch(id) {
  return watchRow(db.prepare("SELECT * FROM watches WHERE id = ?").get(Number(id)));
}

// Same keyword (normalized) + city + price range + exclusions = same alert.
function findSameWatch({ q, city, minPrice, maxPrice, exclude }) {
  const n = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const key = (w) => [normalizeArabic(w.q), normalizeArabic(w.city) || "", w.min ?? "", w.max ?? "", excludeTerms(w.ex).sort().join(",")].join("|");
  const want = key({ q, city, min: n(minPrice), max: n(maxPrice), ex: exclude });
  const hit = db.prepare("SELECT * FROM watches").all()
    .find((w) => key({ q: w.q, city: w.city, min: w.min_price, max: w.max_price, ex: w.exclude }) === want);
  return hit ? watchRow(hit) : null;
}

function createWatch({ q, label, city, minPrice, maxPrice, exclude }) {
  const text = String(q || "").trim();
  if (!text) throw new Error("q required");
  const n = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const exText = (Array.isArray(exclude) ? exclude : String(exclude || "").split(/[,،\s]+/))
    .map((w) => String(w).replace(/^-+/, "").trim()).filter((w) => w.length >= 2).join("، ") || null;
  const r = db.prepare(
    "INSERT INTO watches (q, label, city, min_price, max_price, exclude, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
  ).run(text.slice(0, 120), label ? String(label).slice(0, 80) : null, city || null, n(minPrice), n(maxPrice), exText, nowIso());
  return getWatch(Number(r.lastInsertRowid));
}

function updateWatch(id, patch = {}) {
  const sets = [];
  const p = { id: Number(id) };
  if ("enabled" in patch) { sets.push("enabled = @enabled"); p.enabled = patch.enabled ? 1 : 0; }
  if ("label" in patch) { sets.push("label = @label"); p.label = patch.label || null; }
  if (sets.length) db.prepare(`UPDATE watches SET ${sets.join(", ")} WHERE id = @id`).run(p);
  return getWatch(id);
}

function deleteWatch(id) {
  db.prepare("DELETE FROM watch_hits WHERE watch_id = ?").run(Number(id));
  db.prepare("DELETE FROM blocked_sellers WHERE watch_id = ?").run(Number(id));
  return Number(db.prepare("DELETE FROM watches WHERE id = ?").run(Number(id)).changes);
}

// Does a listing satisfy a watch's city/price filters?
function isBlockedSeller(seller, watchId) {
  if (!seller) return false;
  return !!db.prepare("SELECT 1 FROM blocked_sellers WHERE seller = ? AND (watch_id = 0 OR watch_id = ?)").get(seller, Number(watchId) || -1);
}

function watchAccepts(w, item) {
  if (w.city && normalizeArabic(item.city) !== normalizeArabic(w.city)) return false;
  if (isBlockedSeller(item.seller, w.id)) return false;
  const text = (normalizeArabic(item.title) || "") + " " + (normalizeArabic(item.description) || "");
  if (excludeTerms(w.exclude).some((x) => text.includes(x))) return false;
  const pv = parsePrice(item.price);
  if (w.max_price != null && pv != null && pv > w.max_price) return false;
  if (w.min_price != null && pv != null && pv < w.min_price) return false;
  return true;
}

// Record hits; returns ids that are new for this watch.
function addWatchHits(watchId, listingIds, { seen = false } = {}) {
  // Baseline hits are born seen + notified; real hits wait for a notification.
  const ins = db.prepare("INSERT OR IGNORE INTO watch_hits (watch_id, listing_id, created_at, seen, notified) VALUES (?, ?, ?, ?, ?)");
  const fresh = [];
  for (const id of listingIds) {
    if (Number(ins.run(watchId, id, nowIso(), seen ? 1 : 0, seen ? 1 : 0).changes)) fresh.push(id);
  }
  return fresh;
}

// Hits not yet announced (new ones + those held back during quiet hours).
function pendingHits(watchId) {
  return db.prepare(`SELECT l.* FROM watch_hits h JOIN listings l ON l.id = h.listing_id
    WHERE h.watch_id = ? AND h.notified = 0 AND h.seen = 0 AND l.hidden = 0 ORDER BY l.id DESC`).all(Number(watchId)).map(publicRow);
}
function markNotified(watchId) {
  db.prepare("UPDATE watch_hits SET notified = 1 WHERE watch_id = ? AND notified = 0").run(Number(watchId));
}

// --- Blocked sellers ---
function blockSeller(seller, watchId = 0) {
  if (!seller) throw new Error("seller required");
  db.prepare("INSERT OR IGNORE INTO blocked_sellers (seller, watch_id, created_at) VALUES (?, ?, ?)").run(String(seller), Number(watchId) || 0, nowIso());
}
function unblockSeller(seller, watchId = 0) {
  return Number(db.prepare("DELETE FROM blocked_sellers WHERE seller = ? AND watch_id = ?").run(String(seller), Number(watchId) || 0).changes);
}
function listBlockedSellers() {
  return db.prepare(`SELECT b.seller, b.watch_id, b.created_at, w.label, w.q FROM blocked_sellers b
    LEFT JOIN watches w ON w.id = b.watch_id ORDER BY b.created_at DESC`).all()
    .map((r) => ({ seller: r.seller, watchId: r.watch_id, watchLabel: r.watch_id ? (r.label || r.q) : null, created_at: r.created_at }));
}

function markWatchSeen(watchId) {
  const ids = db.prepare("SELECT listing_id FROM watch_hits WHERE watch_id = ? AND seen = 0").all(Number(watchId)).map((r) => r.listing_id);
  db.prepare("UPDATE watch_hits SET seen = 1 WHERE watch_id = ?").run(Number(watchId));
  if (ids.length) db.prepare(`UPDATE listings SET is_new = 0 WHERE id IN (${ids.join(",")})`).run();
  return ids.length;
}

function finishWatchRun(id, status) {
  db.prepare("UPDATE watches SET last_run_at = ?, last_status = ? WHERE id = ?").run(nowIso(), status, Number(id));
}

function getSetting(key, fallback = null) {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return r ? r.value : fallback;
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value == null ? null : String(value));
}

function getStats() {
  const s = db.prepare(
    "SELECT COUNT(*) AS total, SUM(is_new = 1) AS fresh, SUM(starred = 1) AS starred, SUM(prev_price_value IS NOT NULL AND price_value < prev_price_value) AS drops FROM listings WHERE hidden = 0"
  ).get();
  const unseen = db.prepare("SELECT COUNT(*) AS n FROM watch_hits h JOIN watches w ON w.id = h.watch_id WHERE h.seen = 0").get().n;
  const last = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").get() || null;
  return {
    total: s.total || 0, fresh: s.fresh || 0, starred: s.starred || 0, drops: s.drops || 0,
    watches: db.prepare("SELECT COUNT(*) AS n FROM watches").get().n, unseenHits: unseen, lastRun: last,
  };
}

module.exports = {
  db, upsertListing, searchListings, getListings, getListingsByIds, markSeen, setFlag,
  startRun, finishRun, getRuns, getMeta, getStats, normalizeArabic, cityToRegion, thumbUrl,
  listWatches, getWatch, createWatch, updateWatch, deleteWatch, watchAccepts, addWatchHits,
  markWatchSeen, finishWatchRun, getSetting, setSetting, LOCATIONS, findSameWatch, excludeTerms,
  pendingHits, markNotified, blockSeller, unblockSeller, listBlockedSellers, isBlockedSeller,
};
