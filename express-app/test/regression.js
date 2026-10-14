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
  it("maxPrice is strict, limit capped at 20", () => {
    const d2 = require("../db");
    const cheap = d2.getListings({ maxPrice: 3000 });
    assert.ok(cheap.every((x) => x.price_value == null || x.price_value <= 3000));
    assert.ok(d2.getListings({ limit: 100 }).length <= 20);
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
