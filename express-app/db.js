"use strict";
// SQLite history store — Node 24 built-in (node:sqlite, no native build needed).
// DB file: express-app/data/app.db (auto-created, git-ignored).

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Overridable for tests: HARAJ_DB_PATH points at a temp file.
const DB_PATH = process.env.HARAJ_DB_PATH || path.join(DATA_DIR, "app.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

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
  CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
  CREATE INDEX IF NOT EXISTS idx_listings_date ON listings(date);
`);

// --- Arabic normalization: أ/إ/آ→ا, ة→ه, ى/ئ→ي, ؤ→و, strip tashkeel/tatweel.
// Makes "جدة" match "جده" in search and city filters.
function normalizeArabic(s) {
  if (s == null) return null;
  let t = String(s)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[ً-ٓـ]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t || null;
}

// Major Saudi cities (normalized keys) → region. Haraj cards expose
// city but not region, so we derive it here.
const CITY_REGION = {
  "الرياض": "منطقة الرياض", "الخرج": "منطقة الرياض", "الدوادمي": "منطقة الرياض",
  "المجمعه": "منطقة الرياض", "الزلفي": "منطقة الرياض", "عفيف": "منطقة الرياض",
  "وادي الدواسر": "منطقة الرياض", "الدرعيه": "منطقة الرياض", "القويعيه": "منطقة الرياض",
  "جده": "منطقة مكة المكرمة", "مكه": "منطقة مكة المكرمة", "الطايف": "منطقة مكة المكرمة",
  "القنفذه": "منطقة مكة المكرمة", "الليث": "منطقة مكة المكرمة", "رابغ": "منطقة مكة المكرمة",
  "المدينه": "منطقة المدينة المنورة", "ينبع": "منطقة المدينة المنورة", "العلا": "منطقة المدينة المنورة",
  "الدمام": "المنطقة الشرقية", "الخبر": "المنطقة الشرقية", "الظهران": "المنطقة الشرقية",
  "الاحساء": "المنطقة الشرقية", "الجبيل": "المنطقة الشرقية", "حفر الباطن": "المنطقة الشرقية",
  "الخفجي": "المنطقة الشرقية", "القطيف": "المنطقة الشرقية",
  "ابها": "منطقة عسير", "خميس مشيط": "منطقة عسير", "بيشه": "منطقة عسير", "النماص": "منطقة عسير",
  "تبوك": "منطقة تبوك", "ضبا": "منطقة تبوك", "الوجه": "منطقة تبوك",
  "بريده": "منطقة القصيم", "عنيزه": "منطقة القصيم", "الرس": "منطقة القصيم",
  "حايل": "منطقة حائل",
  "جازان": "منطقة جازان", "صبيا": "منطقة جازان", "ابو عريش": "منطقة جازان",
  "نجران": "منطقة نجران", "شروره": "منطقة نجران",
  "الباحه": "منطقة الباحة", "بلجرشي": "منطقة الباحة",
  "سكاكا": "منطقة الجوف", "دومه الجندل": "منطقة الجوف",
  "عرعر": "منطقة الحدود الشمالية", "رفحاء": "منطقة الحدود الشمالية", "طريف": "منطقة الحدود الشمالية",
};

function cityToRegion(city) {
  const n = normalizeArabic(city);
  return (n && CITY_REGION[n]) || null;
}

// --- Migration for DBs created before norm columns existed ---
(function migrate() {
  const cols = db.prepare("PRAGMA table_info(listings)").all().map((c) => c.name);
  for (const [col, type] of [["title_norm", "TEXT"], ["city_norm", "TEXT"], ["description_norm", "TEXT"], ["seller", "TEXT"], ["thumb", "TEXT"], ["district", "TEXT"]]) {
    if (!cols.includes(col)) db.exec(`ALTER TABLE listings ADD COLUMN ${col} ${type}`);
  }
  const missing = db
    .prepare("SELECT id, title, city, description, region FROM listings WHERE title_norm IS NULL OR description_norm IS NULL")
    .all();
  const upd = db.prepare(
    "UPDATE listings SET title_norm = ?, city_norm = ?, description_norm = ?, region = COALESCE(region, ?) WHERE id = ?"
  );
  for (const r of missing) {
    upd.run(normalizeArabic(r.title), normalizeArabic(r.city), normalizeArabic(r.description), cityToRegion(r.city), r.id);
  }
})();

const toInt = (v) => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

// Insert a listing; returns true when the URL is new.
function upsertListing(item) {
  const row = db
    .prepare("SELECT id FROM listings WHERE url = ?")
    .get(item.url);
  if (row) return false;
  db.prepare(
    `INSERT INTO listings
     (url, title, title_norm, price, price_value, city, city_norm, region, country, date, category, description, description_norm, seller, thumb, district, first_seen, is_new)
     VALUES (@url, @title, @title_norm, @price, @price_value, @city, @city_norm, @region, @country, @date, @category, @description, @description_norm, @seller, @thumb, @district, @first_seen, 1)`
  ).run({
    url: item.url,
    title: item.title || null,
    title_norm: normalizeArabic(item.title),
    price: item.price || null,
    price_value: toInt(item.price),
    city: item.city || null,
    city_norm: normalizeArabic(item.city),
    region: item.region || cityToRegion(item.city) || null,
    country: item.country || null,
    date: item.date || null,
    category: item.category || null,
    description: item.description || null,
    description_norm: normalizeArabic(item.description),
    seller: item.seller || null,
    thumb: item.thumb || null,
    district: item.district || null,
    first_seen: new Date().toISOString(),
  });
  return true;
}

// Arabic stopwords (normalized forms) ignored in tokenized search.
const STOPWORDS = new Set([
  "في", "من", "علي", "و", "او", "الي", "مع", "بدون", "اقل", "تحت",
  "عن", "ابحث", "ابي", "ابغي", "ابغى", "دور", "لي", "هذا", "هذه",
  "التي", "الذي", "كم", "اي", "ما", "هو", "هي", "بين", "حتي",
  "كل", "غير", "عبر", "لدي", "لدى", "ان", "اذا", "لو", "قد",
]);

// Escape SQL LIKE wildcards in user input.
function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (m) => "\\" + m);
}

// Filtered listing query. Text search is tokenized: every meaningful word
// must appear (AND) in title OR description (raw + normalized), so
// "كمبيوتر ألعاب" matches rows containing both words in any order.
// Supported keys: q, location (key, see LOCATIONS), region (legacy exact),
// city (normalized), category, from, to, maxPrice (strict), newOnly,
// limit (default 20, hard cap 20). The legacy `country` param is ignored.
function getListings(f = {}) {
  const where = [];
  const params = {};
  if (f.q) {
    let qi = 0;
    const seen = new Set();
    for (const raw0 of String(f.q).split(/[\s،,؛;.]+/)) {
      const raw = raw0.trim();
      if (raw.length < 2) continue;
      const n = normalizeArabic(raw);
      if (!n || STOPWORDS.has(n) || seen.has(n)) continue;
      seen.add(n);
      qi += 1;
      where.push(
        `(title LIKE @q${qi} ESCAPE '\\' OR description LIKE @q${qi} ESCAPE '\\' ` +
        `OR title_norm LIKE @qn${qi} ESCAPE '\\' OR description_norm LIKE @qn${qi} ESCAPE '\\')`
      );
      params[`q${qi}`] = `%${likeEscape(raw)}%`;
      params[`qn${qi}`] = `%${likeEscape(n)}%`;
    }
    // q made only of stopwords/short tokens → no text constraint.
  }
  for (const k of ["region", "category"]) {
    if (f[k]) {
      where.push(`${k} = @${k}`);
      params[k] = f[k];
    }
  }
  if (f.city) {
    // Normalized match so "جدة" finds "جده".
    where.push("city_norm = @cityN");
    params.cityN = normalizeArabic(f.city);
  }
  if (f.from) {
    where.push("date >= @from");
    params.from = f.from;
  }
  if (f.to) {
    where.push("date <= @to");
    params.to = f.to;
  }
  const maxP = f.maxPrice != null && f.maxPrice !== "" ? Number(f.maxPrice) : null;
  if (maxP != null && Number.isFinite(maxP)) {
    where.push("(price_value IS NULL OR price_value <= @maxP)");
    params.maxP = maxP;
  }
  if (f.newOnly === "1" || f.newOnly === "true") where.push("is_new = 1");
  if (f.location) {
    const loc = LOCATIONS.find((l) => l.key === f.location);
    if (loc) {
      if (loc.type === "gcc") {
        // Graceful until multi-country scraping exists (matches nothing today).
        where.push("country = @locCountry");
        params.locCountry = loc.country;
      } else {
        where.push("region = @locRegion");
        params.locRegion = loc.region;
      }
    }
  }
  let lim = parseInt(f.limit, 10);
  if (!Number.isFinite(lim) || lim < 1) lim = 20;
  lim = Math.min(lim, 20);
  const sql =
    "SELECT * FROM listings" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    ` ORDER BY id DESC LIMIT ${lim}`;
  return db
    .prepare(sql)
    .all(params)
    .map((r) => {
      const { title_norm, city_norm, description_norm, ...pub } = r;
      return { ...pub, is_new: !!r.is_new };
    });
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

// Display city names per KSA region key (proper Arabic spelling).
const DISPLAY_CITIES = {
  "SA-Riyadh": ["الرياض", "الخرج", "الدوادمي", "المجمعة", "الزلفي", "عفيف", "وادي الدواسر", "الدرعية", "القويعية"],
  "SA-Makkah": ["جدة", "مكة", "الطائف", "القنفذة", "الليث", "رابغ"],
  "SA-Madinah": ["المدينة", "ينبع", "العلا"],
  "SA-Eastern": ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "حفر الباطن", "الخفجي", "القطيف"],
  "SA-Asir": ["أبها", "خميس مشيط", "بيشة", "النماص"],
  "SA-Tabuk": ["تبوك", "ضباء", "الوجه"],
  "SA-Qassim": ["بريدة", "عنيزة", "الرس"],
  "SA-Hail": ["حائل"],
  "SA-Jazan": ["جازان", "صبيا", "أبو عريش"],
  "SA-Najran": ["نجران", "شرورة"],
  "SA-Baha": ["الباحة", "بلجرشي"],
  "SA-Jouf": ["سكاكا", "دومة الجندل"],
  "SA-Borders": ["عرعر", "رفحاء", "طريف"],
};

// Filter metadata for the frontend dropdowns.
function getMeta() {
  const citiesByRegion = {};
  for (const [k, v] of Object.entries(DISPLAY_CITIES)) citiesByRegion[k] = [...v];
  const categories = db
    .prepare("SELECT DISTINCT category FROM listings WHERE category IS NOT NULL ORDER BY category")
    .all()
    .map((r) => r.category);
  return {
    locations: LOCATIONS.map(({ key, type, ar, en }) => ({ key, type, ar, en })),
    citiesByRegion,
    categories,
  };
}

function markSeen(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const stmt = db.prepare("UPDATE listings SET is_new = 0 WHERE id = ?");
  let n = 0;
  for (const id of ids) n += stmt.run(Number(id)).changes;
  return n;
}

function startRun(keyword) {
  const r = db
    .prepare("INSERT INTO runs (started_at, keyword) VALUES (?, ?)")
    .run(new Date().toISOString(), keyword || null);
  return Number(r.lastInsertRowid);
}

function finishRun(id, { found = 0, addedNew = 0, status = "ok" } = {}) {
  db.prepare(
    "UPDATE runs SET finished_at = ?, found = ?, added_new = ?, status = ? WHERE id = ?"
  ).run(new Date().toISOString(), found, addedNew, status, id);
}

function getRuns(limit = 20) {
  return db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit);
}

module.exports = { upsertListing, getListings, markSeen, startRun, finishRun, getRuns, getMeta, normalizeArabic, cityToRegion, db };
