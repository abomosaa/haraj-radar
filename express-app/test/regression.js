"use strict";
// Regression tests: node --test test/regression.js
// (npm test). Uses a temp SQLite file via HARAJ_DB_PATH so the real
// data/app.db is never touched.
process.env.HARAJ_DB_PATH = require("path").join(__dirname, "regression-tmp.db");
try { require("fs").unlinkSync(process.env.HARAJ_DB_PATH); } catch { /* fresh start */ }

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const { parseHarajDate, pickCategory, isBlockedResource } = require("../scraper");

describe("normalizeArabic", () => {
  it("unifies alef/hamza/ta-marbuta forms", () => {
    assert.equal(db.normalizeArabic("جدة"), "جده");
    assert.equal(db.normalizeArabic("أحمد"), "احمد");
    assert.equal(db.normalizeArabic("مؤسسة"), "موسسه");
    assert.equal(db.normalizeArabic("حائل"), "حايل");
  });
  it("strips tashkeel and nulls", () => {
    assert.equal(db.normalizeArabic("السَّلام"), "السلام");
    assert.equal(db.normalizeArabic(null), null);
  });
});

describe("cityToRegion", () => {
  it("maps major cities (any spelling)", () => {
    assert.equal(db.cityToRegion("جدة"), "منطقة مكة المكرمة");
    assert.equal(db.cityToRegion("الرياض"), "منطقة الرياض");
    assert.equal(db.cityToRegion("سكاكا"), "منطقة الجوف");
  });
  it("returns null for unknown towns", () => {
    assert.equal(db.cityToRegion("قرية صغيرة"), null);
  });
});

describe("isBlockedResource (interceptor)", () => {
  it("blocks only static assets, never scripts/data", () => {
    for (const t of ["image", "media", "font", "stylesheet"]) assert.equal(isBlockedResource(t), true);
    for (const t of ["script", "document", "xhr", "fetch", "websocket", "other"]) assert.equal(isBlockedResource(t), false);
  });
});

describe("parseHarajDate", () => {
  it("handles ISO, relative, dual and Indic digits", () => {
    assert.equal(parseHarajDate("2026-09-16T10:00:00"), "2026-09-16");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(parseHarajDate("قبل 3 أيام")));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(parseHarajDate("قبل ساعتين")));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(parseHarajDate("قبل ٢٨ دقيقة")));
    assert.equal(parseHarajDate("garbage"), null);
  });
});

describe("pickCategory", () => {
  it("prefers the deepest topical crumb", () => {
    assert.equal(
      pickCategory(["حراج العقار", "شقق للايجار", "شقق للايجار في الخبر"], "الخبر", "x"),
      "شقق للايجار"
    );
    assert.equal(pickCategory(["حراج", "الرياض"], "الرياض", "x"), null);
  });
});

describe("getListings filters (temp DB)", () => {
  it("tokenized AND search over title+description", () => {
    const d2 = require("../db");
    d2.upsertListing({ url: "t1", title: "كمبيوتر ألعاب قوي", description: "جهاز مكتبي للبيع", price: "4000", city: "الرياض" });
    d2.upsertListing({ url: "t2", title: "كمبيوتر مكتبي", description: "للألعاب والمونتاج", price: "9000", city: "جدة" });
    d2.upsertListing({ url: "t3", title: "جوال ايفون", description: "جهاز نظيف", price: "2000", city: "الدمام" });
    // Both words must match (any order/field) → t1, t2 — not t3.
    const r = d2.getListings({ q: "كمبيوتر ألعاب" });
    assert.deepEqual(r.map((x) => x.url).sort(), ["t1", "t2"]);
    // Normalized spelling matches too (ألعاب vs العاب in description).
    assert.equal(d2.getListings({ q: "العاب" }).length >= 2, true);
  });
  it("stopword-only query does not filter", () => {
    const d2 = require("../db");
    assert.equal(d2.getListings({ q: "في من" }).length, 3);
  });
  it("LIKE wildcards are escaped", () => {
    const d2 = require("../db");
    d2.upsertListing({ url: "t4", title: "خصم 100% حقيقي_تمام", description: "", price: null, city: null });
    assert.equal(d2.getListings({ q: "100%" }).length, 1);
  });
  it("maxPrice is strict, limit capped at 100", () => {
    const d2 = require("../db");
    const cheap = d2.getListings({ maxPrice: 3000 });
    assert.ok(cheap.every((x) => x.price_value == null || x.price_value <= 3000));
    assert.ok(d2.getListings({ limit: 500 }).length <= 100);
  });
  it("location key maps to region; city spelling normalized", () => {
    const d2 = require("../db");
    assert.equal(d2.getListings({ location: "SA-Riyadh" }).length, 1);
    assert.equal(d2.getListings({ city: "جدة" })[0].url, "t2"); // stored as جدة→جده
    assert.deepEqual(d2.getListings({ location: "KW" }), []); // graceful, no GCC data
  });
  it("getMeta shape", () => {
    const d2 = require("../db");
    const m = d2.getMeta();
    assert.equal(m.locations.length, 16);
    assert.ok(m.citiesByRegion["SA-Riyadh"].includes("الرياض"));
    assert.ok(Array.isArray(m.categories));
  });
});

describe("mapGraphQLItem", () => {
  const { mapGraphQLItem, mergeApiItems } = require("../scraper");
  const fixture = {
    id: 1, title: "غسالة ملابس", postDate: 1790271450,
    authorUsername: "yaya 4455", URL: "11189235245/x/",
    bodyTEXT: "للبيع <b>غسالة</b>", thumbURL: "https://x/y.jpg",
    city: "الرياض", geoNeighborhood: "العليا",
    tags: ["أجهزة", "غسالات"], price: { formattedPrice: "400 ريال" },
  };
  it("maps full post fields", () => {
    const item = mapGraphQLItem(fixture);
    assert.equal(item.title, "غسالة ملابس");
    assert.equal(item.url, "https://haraj.com.sa/11189235245/x/");
    assert.equal(item.price, "400 ريال");
    assert.equal(item.city, "الرياض");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item.date));
    assert.equal(item.seller, "yaya 4455");
    assert.equal(item.thumb, "https://x/y.jpg");
    assert.equal(item.district, "العليا");
    assert.ok(!/<[a-z]/i.test(item.description));
    // Tags run top-down: section first, then sub-sections.
    assert.equal(item.category, "أجهزة");
    assert.equal(item.subcategory, "غسالات");
  });
  it("prefers API items over DOM dupes", () => {
    const merged = mergeApiItems(
      [{ search: { items: [fixture] } }],
      [{ title: "غسالة ملابس", url: "https://haraj.com.sa/11189235245/x/" }]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].seller, "yaya 4455");
  });
  it("rejects malformed payloads", () => {
    assert.equal(mapGraphQLItem(null).url, null);
    assert.deepEqual(mergeApiItems([{ nope: 1 }], []), []);
  });
});

describe("query parsing (query.js)", () => {
  const Q = require("../query");
  it("extracts keyword, city and price range from natural Arabic", () => {
    const p = Q.parseQueryRules("ابي كامري 2020 بالرياض بين 30 الف و 50 الف");
    assert.equal(p.keyword, "كامري 2020");
    assert.equal(p.city, "الرياض");
    assert.equal(p.minPrice, 30000);
    assert.equal(p.maxPrice, 50000);
  });
  it("handles Indic digits, 'تحت' and keeps the user's spelling", () => {
    const p = Q.parseQueryRules("شقة للايجار في جدة تحت ٢٠٠٠");
    assert.equal(p.keyword, "شقة للايجار");
    assert.equal(p.city, "جدة");
    assert.equal(p.maxPrice, 2000);
  });
  it("sort hint and plain keywords", () => {
    assert.equal(Q.parseQueryRules("لاب توب ارخص شي").sort, "price_asc");
    assert.equal(Q.parseQueryRules("rtx 3090").keyword, "rtx 3090");
  });
  it("token variants cover ال and synonyms", () => {
    assert.ok(Q.tokenVariants("السيارة").includes("سياره"));
    assert.ok(Q.tokenVariants("ايفون").includes("iphone"));
  });
  it("parsePrice handles separators and no-price text", () => {
    assert.equal(Q.parsePrice("79,996"), 79996);
    assert.equal(Q.parsePrice("على السوم"), null);
    assert.equal(Q.parsePrice("١٥٠٠ ريال"), 1500);
  });
});

describe("search ranking, synonyms, reposts, watches (temp DB)", () => {
  const d2 = require("../db");
  it("synonym search: iphone finds ايفون", () => {
    d2.upsertListing({ url: "s1", title: "ايفون 13 برو نظيف", price: "2500", city: "جدة", seller: "a" });
    assert.ok(d2.getListings({ q: "iphone" }).some((x) => x.url === "s1"));
    assert.ok(d2.getListings({ q: "الايفون" }).some((x) => x.url === "s1"));
  });
  it("title matches outrank description matches", () => {
    d2.upsertListing({ url: "s2", title: "جراب جوال", description: "يناسب ايفون 13", price: "30", seller: "b" });
    const r = d2.getListings({ q: "ايفون 13" });
    assert.equal(r[0].url, "s1");
  });
  it("price change is tracked and flagged as a drop", () => {
    const r = d2.upsertListing({ url: "s1", title: "ايفون 13 برو نظيف", price: "2200", city: "جدة", seller: "a" });
    assert.equal(r.isNew, false);
    assert.equal(r.priceChanged, true);
    const row = d2.getListings({ priceDrop: 1 })[0];
    assert.equal(row.url, "s1");
    assert.equal(row.prev_price_value, 2500);
  });
  it("re-posts by the same seller collapse to the newest", () => {
    d2.upsertListing({ url: "s3", title: "كنب مجلس", price: "900", seller: "z" });
    d2.upsertListing({ url: "s4", title: "كنب مجلس", price: "850", seller: "z" });
    const r = d2.getListings({ q: "كنب مجلس" });
    assert.deepEqual(r.map((x) => x.url), ["s4"]);
    assert.equal(d2.getListings({ q: "كنب مجلس", dupes: 1 }).length, 2);
  });
  it("sorting and pagination", () => {
    const r = d2.searchListings({ sort: "price_asc", hasPrice: 1, limit: 2 });
    assert.equal(r.listings.length, 2);
    assert.ok(r.total >= 2);
    assert.ok(r.listings[0].price_value <= r.listings[1].price_value);
    const p2 = d2.searchListings({ sort: "price_asc", hasPrice: 1, limit: 2, offset: 2 });
    assert.notEqual(p2.listings[0].id, r.listings[0].id);
  });
  it("watches: hits are recorded once and filtered by price/city", () => {
    const w = d2.createWatch({ q: "ايفون", city: "جدة", maxPrice: 3000 });
    const id = d2.getListings({ q: "ايفون" })[0].id;
    assert.equal(d2.watchAccepts(w, { city: "جده", price: "2000" }), true);
    assert.equal(d2.watchAccepts(w, { city: "الرياض", price: "2000" }), false);
    assert.equal(d2.watchAccepts(w, { city: "جدة", price: "5000" }), false);
    assert.deepEqual(d2.addWatchHits(w.id, [id]), [id]);
    assert.deepEqual(d2.addWatchHits(w.id, [id]), []);
    assert.equal(d2.getWatch(w.id).unseen, 1);
    assert.equal(d2.getListings({ watch: w.id }).length, 1);
    d2.markWatchSeen(w.id);
    assert.equal(d2.getWatch(w.id).unseen, 0);
    d2.deleteWatch(w.id);
    assert.equal(d2.getWatch(w.id), null);
  });
  it("thumb file names become full image URLs", () => {
    assert.equal(d2.thumbUrl("900x506-1_-GO__abc.jpg"), "https://thumbcdn.haraj.com.sa/900x506-1_-GO__abc.jpg-400x400.webp");
    assert.equal(d2.thumbUrl("https://x/y.jpg"), "https://x/y.jpg");
  });
});

describe("hidden sellers, duplicate alerts, quiet hours (temp DB)", () => {
  const d2 = require("../db");
  const Q = require("../query");
  it("parses -words as exclusions and drops them from the keyword", () => {
    const p = Q.parseQueryRules("ايفون 13 -مكسور -قطع في جدة");
    assert.equal(p.keyword, "ايفون 13");
    assert.deepEqual(p.exclude, ["مكسور", "قطع"]);
    assert.equal(Q.parseQueryRules("غسالة 500-1500").exclude.length, 0);
  });
  it("search excludes listings containing excluded words", () => {
    d2.upsertListing({ url: "x1", title: "ايفون 11 شاشة مكسورة", price: "300", seller: "q1" });
    d2.upsertListing({ url: "x2", title: "ايفون 11 نظيف", price: "900", seller: "q2" });
    const urls = d2.getListings({ q: "ايفون 11", exclude: "مكسوره" }).map((x) => x.url);
    assert.ok(urls.includes("x2") && !urls.includes("x1"));
  });
  it("alerts with excluded words skip matching ads", () => {
    const w = d2.createWatch({ q: "ايفون", exclude: "-مكسور" });
    assert.equal(w.exclude, "مكسور");
    assert.equal(d2.watchAccepts(w, { title: "ايفون شاشة مكسورة" }), false);
    assert.equal(d2.watchAccepts(w, { title: "ايفون نظيف" }), true);
  });
  it("hidden sellers: everywhere vs. one alert only", () => {
    d2.upsertListing({ url: "x1", title: "ايفون 11 شاشة مكسورة", price: "300", seller: "q1" });
    d2.upsertListing({ url: "x2", title: "ايفون 11 نظيف", price: "900", seller: "q2" });
    const w = d2.createWatch({ q: "ايفون 11" });
    d2.addWatchHits(w.id, d2.getListings({ q: "ايفون 11" }).map((x) => x.id));
    d2.blockSeller("q2", w.id);
    assert.ok(!d2.getListings({ watch: w.id }).some((x) => x.seller === "q2"));
    assert.ok(d2.getListings({ q: "ايفون 11" }).some((x) => x.seller === "q2"));
    assert.equal(d2.watchAccepts(w, { seller: "q2", title: "x" }), false);
    d2.blockSeller("q1");
    assert.ok(!d2.getListings({ q: "ايفون 11" }).some((x) => x.seller === "q1"));
    assert.equal(d2.listBlockedSellers().length, 2);
    d2.unblockSeller("q1"); d2.unblockSeller("q2", w.id);
    assert.equal(d2.listBlockedSellers().length, 0);
  });
  it("finds an identical saved search (spelling-insensitive)", () => {
    d2.createWatch({ q: "كمبيوتر", city: "جدة", maxPrice: 5000 });
    assert.ok(d2.findSameWatch({ q: "كمبيوتر", city: "جده", maxPrice: "5000" }));
    assert.equal(d2.findSameWatch({ q: "كمبيوتر", city: "جدة", maxPrice: 6000 }), null);
  });
  it("pending hits feed one digest, then are marked notified", () => {
    const w = d2.createWatch({ q: "digest test" });
    const ids = d2.getListings({ limit: 3 }).map((x) => x.id);
    d2.addWatchHits(w.id, ids);
    assert.equal(d2.pendingHits(w.id).length, ids.length);
    d2.markNotified(w.id);
    assert.equal(d2.pendingHits(w.id).length, 0);
    const w2 = d2.createWatch({ q: "baseline test" });
    d2.addWatchHits(w2.id, ids, { seen: true });
    assert.equal(d2.pendingHits(w2.id).length, 0);
  });
  it("quiet hours wrap past midnight", () => {
    const { isQuietNow } = require("../scraper");
    d2.setSetting("quiet_on", "1"); d2.setSetting("quiet_from", 23); d2.setSetting("quiet_to", 7);
    const at = (h) => { const d = new Date(); d.setHours(h, 10, 0, 0); return d; };
    assert.equal(isQuietNow(at(2)), true);
    assert.equal(isQuietNow(at(23)), true);
    assert.equal(isQuietNow(at(12)), false);
    d2.setSetting("quiet_on", "0");
    assert.equal(isQuietNow(at(2)), false);
  });
});

describe("listing details helpers", () => {
  const { postIdFromUrl } = require("../scraper");
  it("derives Haraj post id from the ad URL (11 + id)", () => {
    assert.equal(postIdFromUrl("https://haraj.com.sa/11190510471/سيارة/"), 190510471);
    assert.equal(postIdFromUrl("https://example.com/x"), null);
  });
});
