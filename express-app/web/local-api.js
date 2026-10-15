// رادار حراج — browser-only engine.
//
// Runs the whole app inside the browser (page AND service worker): searches
// Haraj's GraphQL directly (it allows cross-origin requests), keeps listings,
// saved searches, favourites and settings in IndexedDB on this device, and
// answers the same "/api/..." routes the Node server does, so app.js works
// unchanged. Needs query.js (self.HQ) loaded first.
(function (G) {
  "use strict";
  var HQ = G.HQ;
  var GQL = "https://graphql.haraj.com.sa/?queryName=";
  var BASE = "https://haraj.com.sa";
  var IMG_BASE = "https://thumbcdn.haraj.com.sa/";
  var MAX_LISTINGS = 4000;
  var INTERVALS = [10, 15, 30, 60, 120];

  // ------------------------------------------------------------------ storage
  // One IndexedDB store holding a few JSON documents; the working copy lives
  // in memory and is written back (debounced) after each change.
  var DBNAME = "haraj-radar", STORE = "kv";
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBNAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(db, key) {
    return new Promise(function (res, rej) {
      var q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  function idbPut(db, key, val) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  }
  var KEYS = ["listings", "watches", "hits", "runs", "settings", "blocked", "seq"];
  var S = null, dbh = null, loading = null, dirty = {}, saveTimer = null;

  function load(force) {
    if (S && !force) return Promise.resolve(S);
    if (loading && !force) return loading;
    loading = (dbh ? Promise.resolve(dbh) : idb()).then(function (db) {
      dbh = db;
      return Promise.all(KEYS.map(function (k) { return idbGet(db, k); }));
    }).then(function (vals) {
      S = {
        listings: vals[0] || [], watches: vals[1] || [], hits: vals[2] || [], runs: vals[3] || [],
        settings: vals[4] || {}, blocked: vals[5] || [], seq: vals[6] || { listing: 0, watch: 0, run: 0 }
      };
      reindex();
      loading = null;
      return S;
    });
    return loading;
  }
  var byUrl = new Map(), byId = new Map();
  function reindex() {
    byUrl = new Map(); byId = new Map();
    S.listings.forEach(function (r) { byUrl.set(r.url, r); byId.set(r.id, r); });
  }
  function touch() {
    for (var i = 0; i < arguments.length; i++) dirty[arguments[i]] = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }
  function flush() {
    clearTimeout(saveTimer);
    var keys = Object.keys(dirty);
    dirty = {};
    if (!keys.length || !dbh) return Promise.resolve();
    keys.push("seq");
    return Promise.all(keys.map(function (k) { return idbPut(dbh, k, S[k]); }));
  }

  // ------------------------------------------------------------------ helpers
  var norm = HQ.normalizeArabic;
  var nowIso = function () { return new Date().toISOString(); };
  var truthy = function (v) { return v === true || v === 1 || v === "1" || v === "true"; };
  var num = function (v) { return v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null; };
  var day10 = function (r) { return r.date || (r.first_seen || "").slice(0, 10); };
  function setting(k, d) { return S.settings[k] != null ? S.settings[k] : d; }
  function setSetting(k, v) { S.settings[k] = v; touch("settings"); }

  function thumbUrl(t) {
    if (!t) return null;
    t = String(t);
    if (/^https?:\/\//i.test(t)) return t;
    return IMG_BASE + t.replace(/^\/+/, "") + "-400x400.webp";
  }
  function publicRow(r) {
    var o = {};
    for (var k in r) if (!/_norm$/.test(k) && k !== "hidden") o[k] = r[k];
    o.thumb = thumbUrl(r.thumb);
    o.description = r.description ? r.description.slice(0, 400) : null;
    o.is_new = !!r.is_new; o.starred = !!r.starred;
    o.price_drop = r.prev_price_value != null && r.price_value != null && r.price_value < r.prev_price_value;
    return o;
  }
  function excludeTerms(v) {
    var list = Array.isArray(v) ? v : String(v || "").split(/[,،\s]+/);
    var out = [];
    list.forEach(function (w) {
      var n = norm(String(w).replace(/^-+/, ""));
      if (!n || n.length < 2) return;
      if (out.indexOf(n) < 0) out.push(n);
      if (/^ال/.test(n) && n.length >= 5 && out.indexOf(n.slice(2)) < 0) out.push(n.slice(2));
    });
    return out;
  }
  function err(status, msg) { var e = new Error(msg); e.status = status; return e; }

  // ------------------------------------------------------------------ listings
  function upsertListing(item) {
    var pv = HQ.parsePrice(item.price);
    var row = byUrl.get(item.url);
    if (row) {
      var res = { id: row.id, isNew: false, priceChanged: false, oldPrice: row.price_value };
      row.last_seen = nowIso();
      ["thumb", "seller", "date", "category", "district"].forEach(function (k) { if (!row[k] && item[k]) row[k] = item[k]; });
      if (pv != null && row.price_value != null && pv !== row.price_value) {
        row.prev_price_value = row.price_value; row.price_value = pv; row.price = item.price; row.price_changed_at = nowIso();
        res.priceChanged = true;
      } else if (pv != null && row.price_value == null) { row.price_value = pv; row.price = item.price; }
      touch("listings");
      return res;
    }
    var id = ++S.seq.listing;
    var desc = item.description ? String(item.description).slice(0, 1500) : null;
    row = {
      id: id, url: item.url, title: item.title || null, title_norm: norm(item.title),
      price: item.price || null, price_value: pv, city: item.city || null, city_norm: norm(item.city),
      region: item.region || HQ.cityToRegion(item.city) || null, country: "Saudi Arabia",
      date: item.date || null, category: item.category || null, subcategory: item.subcategory || null,
      description: desc, description_norm: norm(desc), seller: item.seller || null, thumb: item.thumb || null,
      district: item.district || null, first_seen: nowIso(), last_seen: nowIso(), is_new: 1,
      prev_price_value: null, price_changed_at: null, starred: 0, hidden: 0
    };
    S.listings.push(row); byUrl.set(row.url, row); byId.set(id, row);
    if (S.listings.length > MAX_LISTINGS) prune();
    touch("listings");
    return { id: id, isNew: true, priceChanged: false, oldPrice: null };
  }
  // Keep storage small: drop the oldest listings nobody kept.
  function prune() {
    var keep = new Set(S.hits.map(function (h) { return h.listing_id; }));
    var extra = S.listings.length - MAX_LISTINGS;
    S.listings = S.listings.filter(function (r) {
      if (extra > 0 && !r.starred && !keep.has(r.id)) { extra--; return false; }
      return true;
    });
    reindex();
  }

  var LOCATIONS = [
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
    { key: "SA-Borders", type: "ksa", ar: "منطقة الحدود الشمالية", en: "Northern Borders", region: "منطقة الحدود الشمالية" }
  ];

  function blockedFor(watchId) {
    var s = new Set();
    S.blocked.forEach(function (b) { if (b.watchId === 0 || (watchId && b.watchId === Number(watchId))) s.add(b.seller); });
    return s;
  }

  // Same behaviour as db.js searchListings (tokens AND, variants OR,
  // relevance score, re-post collapse, filters, sort, paging).
  function searchListings(f) {
    f = f || {};
    var rows = S.listings.filter(function (r) { return !r.hidden; });
    var scores = new Map();
    var include = new Set((Array.isArray(f.includeIds) ? f.includeIds : String(f.includeIds || "").split(",")).map(Number).filter(isFinite));
    var hasScore = false;
    if (f.q) {
      var tokens = HQ.tokenize(f.q).map(function (t) { return HQ.tokenVariants(t); }).filter(function (v) { return v.length; });
      var phrase = norm(f.q);
      if (tokens.length) {
        hasScore = true;
        rows = rows.filter(function (r) {
          var tn = r.title_norm || "", dn = r.description_norm || "", sc = 0, ok = true;
          tokens.forEach(function (vars) {
            var inT = vars.some(function (v) { return tn.indexOf(v) >= 0; });
            var inD = vars.some(function (v) { return dn.indexOf(v) >= 0; });
            if (!inT && !inD) ok = false;
            sc += (inT ? 3 : 0) + (inD ? 1 : 0);
          });
          if (tokens.length > 1 && phrase && tn.indexOf(phrase) >= 0) sc += 5;
          if (include.has(r.id)) { sc += 2; ok = true; }
          scores.set(r.id, sc);
          return ok;
        });
      }
    }
    var ex = excludeTerms(f.exclude);
    if (ex.length) rows = rows.filter(function (r) { var t = (r.title_norm || "") + " " + (r.description_norm || ""); return !ex.some(function (x) { return t.indexOf(x) >= 0; }); });
    var bl = blockedFor(f.watch);
    if (bl.size) rows = rows.filter(function (r) { return !r.seller || !bl.has(r.seller); });
    if (f.region) rows = rows.filter(function (r) { return r.region === f.region; });
    if (f.category) rows = rows.filter(function (r) { return r.category === f.category; });
    if (f.city) { var cn = norm(f.city); rows = rows.filter(function (r) { return r.city_norm === cn; }); }
    if (f.from) rows = rows.filter(function (r) { return day10(r) >= f.from; });
    if (f.to) rows = rows.filter(function (r) { return day10(r) <= f.to; });
    var minP = num(f.minPrice), maxP = num(f.maxPrice);
    if (truthy(f.hasPrice)) rows = rows.filter(function (r) { return r.price_value != null; });
    if (maxP != null) rows = rows.filter(function (r) { return r.price_value == null || r.price_value <= maxP; });
    if (minP != null) rows = rows.filter(function (r) { return r.price_value == null || r.price_value >= minP; });
    if (truthy(f.hasImage)) rows = rows.filter(function (r) { return !!r.thumb; });
    if (truthy(f.newOnly)) rows = rows.filter(function (r) { return r.is_new; });
    if (truthy(f.starred)) rows = rows.filter(function (r) { return r.starred; });
    if (truthy(f.priceDrop)) rows = rows.filter(function (r) { return r.prev_price_value != null && r.price_value < r.prev_price_value; });
    if (!truthy(f.dupes) && !f.watch && !truthy(f.starred)) {
      var newest = new Map();
      S.listings.forEach(function (r) {
        if (r.hidden || !r.seller) return;
        var k = r.title_norm + "\u0001" + r.seller;
        if (!newest.has(k) || newest.get(k) < r.id) newest.set(k, r.id);
      });
      rows = rows.filter(function (r) { return !r.seller || newest.get(r.title_norm + "\u0001" + r.seller) === r.id; });
    }
    if (f.watch) {
      var wid = Number(f.watch), ids = new Set();
      S.hits.forEach(function (h) { if (h.watch_id === wid && (!truthy(f.unseenOnly) || !h.seen)) ids.add(h.listing_id); });
      rows = rows.filter(function (r) { return ids.has(r.id); });
    }
    if (f.location) {
      var loc = LOCATIONS.filter(function (l) { return l.key === f.location; })[0];
      if (loc) rows = rows.filter(function (r) { return loc.type === "gcc" ? r.country === loc.country : r.region === loc.region; });
    }
    var lim = parseInt(f.limit, 10); if (!isFinite(lim) || lim < 1) lim = 24; lim = Math.min(lim, 100);
    var off = parseInt(f.offset, 10); if (!isFinite(off) || off < 0) off = 0;
    var sort = f.sort && (f.sort === "relevance" || ["newest", "oldest", "price_asc", "price_desc", "added"].indexOf(f.sort) >= 0) ? f.sort : (f.q ? "relevance" : "newest");
    if (sort === "relevance" && !hasScore) sort = "newest";
    var newestCmp = function (a, b) { var x = day10(b).localeCompare(day10(a)); return x || b.id - a.id; };
    var cmp = {
      relevance: function (a, b) { return (scores.get(b.id) || 0) - (scores.get(a.id) || 0) || newestCmp(a, b); },
      newest: newestCmp,
      oldest: function (a, b) { return -newestCmp(a, b); },
      price_asc: function (a, b) { return (a.price_value == null) - (b.price_value == null) || (a.price_value - b.price_value) || b.id - a.id; },
      price_desc: function (a, b) { return (a.price_value == null) - (b.price_value == null) || (b.price_value - a.price_value) || b.id - a.id; },
      added: function (a, b) { return b.id - a.id; }
    }[sort];
    rows.sort(cmp);
    return { listings: rows.slice(off, off + lim).map(publicRow), total: rows.length, limit: lim, offset: off, sort: sort };
  }

  function getMeta() {
    var citiesByRegion = {};
    LOCATIONS.forEach(function (l) {
      if (l.type !== "ksa") return;
      citiesByRegion[l.key] = Object.keys(HQ.CITY_REGION).filter(function (c) {
        return HQ.CITY_REGION[c] === l.region && ["الشرقية", "القصيم", "الجوف"].indexOf(c) < 0;
      });
    });
    var cat = {}, city = {}, cityName = {};
    S.listings.forEach(function (r) {
      if (r.hidden) return;
      if (r.category) cat[r.category] = (cat[r.category] || 0) + 1;
      if (r.city_norm) { city[r.city_norm] = (city[r.city_norm] || 0) + 1; cityName[r.city_norm] = cityName[r.city_norm] || r.city; }
    });
    var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); };
    return {
      locations: LOCATIONS.map(function (l) { return { key: l.key, type: l.type, ar: l.ar, en: l.en }; }),
      citiesByRegion: citiesByRegion,
      categories: top(cat, 60),
      topCities: top(city, 12).map(function (k) { return cityName[k]; }),
      ai: false, mode: "web"
    };
  }

  // ------------------------------------------------------------------ runs, watches, hits
  function startRun(kw) {
    var r = { id: ++S.seq.run, started_at: nowIso(), finished_at: null, keyword: kw || null, found: 0, added_new: 0, status: "running" };
    S.runs.unshift(r); S.runs = S.runs.slice(0, 60); touch("runs");
    return r;
  }
  function finishRun(r, o) { r.finished_at = nowIso(); r.found = o.found || 0; r.added_new = o.addedNew || 0; r.status = o.status || "ok"; touch("runs"); }

  function watchRow(w) {
    var total = 0, unseen = 0;
    S.hits.forEach(function (h) { if (h.watch_id === w.id) { total++; if (!h.seen) unseen++; } });
    var o = {}; for (var k in w) o[k] = w[k];
    o.enabled = !!w.enabled; o.total = total; o.unseen = unseen;
    return o;
  }
  function getWatch(id) { var w = S.watches.filter(function (x) { return x.id === Number(id); })[0]; return w ? watchRow(w) : null; }
  function watchKey(q, city, min, max, ex) { return [norm(q), norm(city) || "", min == null ? "" : min, max == null ? "" : max, excludeTerms(ex).sort().join(",")].join("|"); }
  function exText(exclude) {
    var list = Array.isArray(exclude) ? exclude : String(exclude || "").split(/[,،\s]+/);
    var out = list.map(function (w) { return String(w).replace(/^-+/, "").trim(); }).filter(function (w) { return w.length >= 2; });
    return out.length ? out.join("، ") : null;
  }
  function createWatch(spec) {
    var n = function (v) { return v != null && v !== "" && isFinite(Number(v)) ? Math.round(Number(v)) : null; };
    var key = watchKey(spec.q, spec.city, n(spec.minPrice), n(spec.maxPrice), spec.exclude);
    var same = S.watches.filter(function (w) { return watchKey(w.q, w.city, w.min_price, w.max_price, w.exclude) === key; })[0];
    if (same) { var e = err(409, "duplicate"); e.data = { watch: watchRow(same) }; throw e; }
    var w = {
      id: ++S.seq.watch, q: String(spec.q).slice(0, 120), label: spec.label ? String(spec.label).slice(0, 80) : null,
      city: spec.city || null, min_price: n(spec.minPrice), max_price: n(spec.maxPrice), exclude: exText(spec.exclude),
      enabled: 1, created_at: nowIso(), last_run_at: null, last_status: null
    };
    S.watches.unshift(w); touch("watches");
    return w;
  }
  function watchAccepts(w, item) {
    if (w.city && norm(item.city) !== norm(w.city)) return false;
    if (item.seller && blockedFor(w.id).has(item.seller)) return false;
    var text = (norm(item.title) || "") + " " + (norm(item.description) || "");
    if (excludeTerms(w.exclude).some(function (x) { return text.indexOf(x) >= 0; })) return false;
    var pv = HQ.parsePrice(item.price);
    if (w.max_price != null && pv != null && pv > w.max_price) return false;
    if (w.min_price != null && pv != null && pv < w.min_price) return false;
    return true;
  }
  function addHits(wid, ids, seen) {
    var have = new Set(S.hits.filter(function (h) { return h.watch_id === wid; }).map(function (h) { return h.listing_id; }));
    var fresh = [];
    ids.forEach(function (id) {
      if (have.has(id)) return;
      S.hits.push({ watch_id: wid, listing_id: id, created_at: nowIso(), seen: seen ? 1 : 0, notified: seen ? 1 : 0 });
      fresh.push(id);
    });
    if (fresh.length) touch("hits");
    return fresh;
  }

  // ------------------------------------------------------------------ Haraj
  var SEARCH_Q = "query Search($search: String!, $city: String, $page: Int, $limit: Int) { search(search: $search, city: $city, page: $page, limit: $limit) { items { id title postDate updateDate authorUsername authorId URL bodyTEXT thumbURL city geoCity geoNeighborhood tags price { formattedPrice inputPrice } commentCount status } pageInfo { hasNextPage } } }";
  var POST_Q = "query Posts($ids: [Int]) { posts(id: $ids) { items { id title bodyTEXT imagesList city geoNeighborhood postDate authorUsername URL price { formattedPrice } commentCount tags } } }";

  function gql(name, query, variables, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 15000) : null;
    return fetch(GQL + name, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, variables: variables }), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error("Haraj HTTP " + res.status);
      return res.text();
    }).then(function (text) {
      text = text.trim();
      if (text === "...") throw new Error("Haraj rejected the query");
      return JSON.parse(text).data;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  function mapItem(g) {
    g = g || {};
    var epoch = Number(g.postDate || g.updateDate);
    var tags = Array.isArray(g.tags) ? g.tags.map(function (t) { return typeof t === "string" ? t : t && t.name; }).filter(Boolean) : [];
    var url = g.URL ? (/^http/.test(g.URL) ? g.URL : BASE + "/" + String(g.URL).replace(/^\//, "")) : null;
    return {
      title: g.title || null, url: url,
      price: (g.price && (g.price.formattedPrice || (g.price.inputPrice != null ? String(g.price.inputPrice) : null))) || null,
      city: g.city || g.geoCity || null,
      date: isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString().slice(0, 10) : null,
      description: String(g.bodyTEXT || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500) || null,
      category: tags[0] || null, subcategory: tags.slice(1).join(" / ") || null,
      seller: g.authorUsername || null, thumb: g.thumbURL || null, district: g.geoNeighborhood || null
    };
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function fetchPage(kw, page, city) {
    var v = { search: kw, page: page, limit: 20 };
    if (city) v.city = city;
    return gql("search", SEARCH_Q, v).then(function (d) {
      var s = d && d.search;
      if (!s || !Array.isArray(s.items)) throw new Error("Haraj unexpected response");
      var items = s.items.map(mapItem).filter(function (i) { return i.url && i.title; });
      items.hasNext = !!(s.pageInfo && s.pageInfo.hasNextPage);
      return items;
    });
  }
  // Pages startPage..startPage+pages-1; a city that yields nothing is retried without it.
  function fetchPages(kw, opts) {
    var pages = opts.pages || 1, start = opts.startPage || 1, city = opts.city || null;
    var all = [], hasMore = false, p = start;
    function step() {
      if (p >= start + pages) return Promise.resolve();
      return fetchPage(kw, p, city).then(function (batch) {
        if (!batch.length && city && p === start) { city = null; return fetchPage(kw, p, null); }
        return batch;
      }).then(function (batch) {
        all = all.concat(batch); hasMore = batch.hasNext;
        p++;
        if (!batch.hasNext || !batch.length) return;
        return sleep(350).then(step);
      });
    }
    return step().then(function () {
      var seen = new Set();
      var out = all.filter(function (i) { if (seen.has(i.url)) return false; seen.add(i.url); return true; });
      out.hasMore = hasMore;
      return out;
    });
  }
  function storeAll(items) { return items.map(function (it) { var r = upsertListing(it); r.item = it; return r; }); }

  function liveSearch(kw, opts) {
    var run = startRun(kw);
    return fetchPages(kw, opts).then(function (items) {
      var stored = storeAll(items);
      var newIds = stored.filter(function (r) { return r.isNew; }).map(function (r) { return r.id; });
      finishRun(run, { found: items.length, addedNew: newIds.length });
      return { ids: stored.map(function (r) { return r.id; }), newIds: newIds, found: items.length, added: newIds.length, source: "graphql", hasMore: !!items.hasMore };
    }, function (e) { finishRun(run, { status: "error: " + e.message }); throw e; });
  }

  function postIdFromUrl(url) { var m = String(url || "").match(/haraj\.com\.sa\/11(\d+)/); return m ? Number(m[1]) : null; }
  function maskPhones(text) {
    return String(text || "").replace(/(?:\+|00)?(?:9\s?6\s?6|٩\s?٦\s?٦)?[\s-]?[0٠]?[5٥](?:[\s-]?[0-9٠-٩]){8}(?![0-9٠-٩])/g,
      function (m) { return (/^\s/.test(m) ? " " : "") + "‹رقم مخفي›"; });
  }
  function details(id) {
    var row = byId.get(Number(id));
    if (!row) return Promise.reject(err(404, "not-found"));
    var pid = postIdFromUrl(row.url);
    var base = function (live, removed, error) {
      var images = live && live.imagesList && live.imagesList.length ? live.imagesList.filter(function (u) { return /^https:\/\//.test(u); }).slice(0, 20) : row.thumb ? [thumbUrl(row.thumb)] : [];
      var tags = live && Array.isArray(live.tags) ? live.tags.map(function (t) { return typeof t === "string" ? t : t && t.name; }).filter(Boolean) : [];
      return {
        listing: publicRow(row), images: images,
        description: maskPhones((live && live.bodyTEXT) || row.description || ""),
        district: (live && live.geoNeighborhood) || row.district, comments: live ? Number(live.commentCount) || 0 : 0,
        tags: tags, removed: !!removed, error: error || null
      };
    };
    if (!pid) return Promise.resolve(base(null, false, null));
    return gql("posts", POST_Q, { ids: [pid] }, 12000).then(function (d) {
      var it = d && d.posts && d.posts.items && d.posts.items[0];
      if (!it) return base(null, true, null);
      var p = it.price && it.price.formattedPrice;
      if (p) upsertListing({ url: row.url, price: p });
      return base(it, false, null);
    }, function (e) { return base(null, false, e.message); });
  }

  // ------------------------------------------------------------------ alerts
  function isQuietNow(now) {
    now = now || new Date();
    if (!setting("quiet_on", false)) return false;
    var from = Number(setting("quiet_from", 0)), to = Number(setting("quiet_to", 7)), h = now.getHours();
    if (from === to) return false;
    return from < to ? (h >= from && h < to) : (h >= from || h < to);
  }
  function arCount(n) {
    if (n === 1) return "إعلان جديد";
    if (n === 2) return "إعلانان جديدان";
    if (n <= 10) return n + " إعلانات جديدة";
    return n + " إعلاناً جديداً";
  }
  var notifier = null; // function({title, body, url, tag})
  function notify(n) { return notifier ? Promise.resolve(notifier(n)).catch(function () {}) : Promise.resolve(); }

  function runWatch(w, opts) {
    opts = opts || {};
    var baseline = !!opts.baseline;
    var items = [], stored = [];
    function page(p) {
      return fetchPages(w.q, { city: w.city, pages: 1, startPage: p }).then(function (batch) {
        var st = storeAll(batch);
        items = items.concat(batch); stored = stored.concat(st);
        if (baseline || p >= 3 || !batch.hasMore || !st.length || st.some(function (r) { return !r.isNew; })) return;
        return sleep(500).then(function () { return page(p + 1); });
      });
    }
    return page(1).then(function () {
      var accepted = stored.filter(function (r) { return watchAccepts(w, r.item); });
      var fresh = addHits(w.id, accepted.map(function (r) { return r.id; }), baseline);
      var drops = accepted.filter(function (r) { return r.priceChanged && r.oldPrice != null && HQ.parsePrice(r.item.price) < r.oldPrice; });
      var raw = S.watches.filter(function (x) { return x.id === w.id; })[0];
      if (raw) { raw.last_run_at = nowIso(); raw.last_status = "ok: " + items.length + " found, " + (baseline ? 0 : fresh.length) + " new"; touch("watches"); }
      var jobs = [];
      if (!baseline && opts.notify !== false && !isQuietNow()) {
        var label = w.label || w.q;
        var pending = S.hits.filter(function (h) { return h.watch_id === w.id && !h.notified && !h.seen; })
          .map(function (h) { return byId.get(h.listing_id); }).filter(function (r) { return r && !r.hidden; })
          .sort(function (a, b) { return b.id - a.id; });
        if (pending.length) {
          jobs.push(notify({
            title: pending.length === 1 ? "جديد في «" + label + "»" : arCount(pending.length) + " في «" + label + "»",
            body: pending.slice(0, 3).map(function (r) { return r.title + (r.price ? " — " + r.price : ""); }).join("\n"),
            url: pending.length === 1 ? pending[0].url : "./?watch=" + w.id, tag: "watch-" + w.id
          }));
          S.hits.forEach(function (h) { if (h.watch_id === w.id) h.notified = 1; });
          touch("hits");
        }
        drops.forEach(function (r) {
          jobs.push(notify({ title: "نزل السعر: " + r.item.title, body: r.oldPrice + " ← " + r.item.price, url: r.item.url, tag: "drop-" + r.id }));
        });
      }
      return Promise.all(jobs).then(function () { return { found: items.length, fresh: baseline ? 0 : fresh.length, drops: drops.length }; });
    }, function (e) {
      var raw = S.watches.filter(function (x) { return x.id === w.id; })[0];
      if (raw) { raw.last_run_at = nowIso(); raw.last_status = "error: " + e.message; touch("watches"); }
      throw e;
    });
  }

  var running = false;
  // Only one tab / the service worker checks at a time.
  function withLock(fn) {
    if (G.navigator && G.navigator.locks && G.navigator.locks.request) {
      return G.navigator.locks.request("haraj-radar-check", { ifAvailable: true }, function (lock) { return lock ? fn() : { started: false }; });
    }
    return fn();
  }
  function runAll(source) {
    if (running) return Promise.resolve({ started: false });
    return withLock(function () {
      running = true;
      var sum = { started: true, checked: 0, fresh: 0 };
      return load(true).then(function () {
        var list = S.watches.filter(function (w) { return w.enabled; });
        var i = 0;
        function next() {
          if (i >= list.length) return Promise.resolve();
          var w = list[i++];
          return runWatch(watchRow(w)).then(function (r) { sum.checked++; sum.fresh += r.fresh; }, function () {})
            .then(function () { return sleep(1200); }).then(next);
        }
        return next();
      }).then(function () {
        setSetting("last_check_at", nowIso());
        return flush();
      }).then(function () { return sum; }).finally(function () { running = false; });
    });
  }

  function intervalMin() { var n = Number(setting("check_every", 30)); return INTERVALS.indexOf(n) >= 0 ? n : 30; }
  function nextCheckAt() {
    var last = setting("last_check_at", null);
    var t = last ? new Date(last).getTime() + intervalMin() * 60000 : Date.now();
    return new Date(Math.max(t, Date.now()));
  }
  function scheduleInfo() {
    return { everyMinutes: intervalMin(), fixedCron: null, lastCheckAt: setting("last_check_at", null), nextCheckAt: nextCheckAt().toISOString(), running: running, options: INTERVALS, mode: "web" };
  }
  function quietInfo() { return { on: !!setting("quiet_on", false), from: Number(setting("quiet_from", 0)), to: Number(setting("quiet_to", 7)), now: isQuietNow() }; }

  // Background checks while the app is open (or minimised).
  var schedTimer = null, onChecked = null;
  function startScheduler(cb) {
    onChecked = cb;
    if (schedTimer) return;
    var tick = function () {
      load().then(function () {
        var due = S.watches.some(function (w) { return w.enabled; }) && Date.now() >= nextCheckAt().getTime() - 1000;
        if (!due) return;
        return runAll("timer").then(function (r) { if (r && r.started && onChecked) onChecked(r); });
      }).catch(function () {});
    };
    schedTimer = setInterval(tick, 30000);
    setTimeout(tick, 4000);
  }

  // ------------------------------------------------------------------ router
  function parse(path) {
    var i = path.indexOf("?");
    var q = {};
    if (i >= 0) new URLSearchParams(path.slice(i + 1)).forEach(function (v, k) { q[k] = v; });
    return { p: i >= 0 ? path.slice(0, i) : path, q: q };
  }
  function m(re, p) { return p.match(re); }

  function handle(method, path, body) {
    var r = parse(path), p = r.p, q = r.q, x;
    body = body || {};
    if (method === "GET" && p === "/api/listings") {
      var res = searchListings(q); res.count = res.listings.length; return res;
    }
    if (method === "POST" && p === "/api/search") {
      var text = String(body.q || "").trim().slice(0, 200), f = Object.assign({}, body.filters || {});
      var parsed = text ? HQ.parseQueryRules(text) : { keyword: "", exclude: [] };
      if (!parsed.keyword && text) parsed.keyword = parsed.city || parsed.minPrice || parsed.maxPrice ? "" : text;
      parsed.source = "rules"; parsed.alternatives = [];
      var pick = function (a, b) { return a != null && a !== "" ? a : b; };
      var filters = Object.assign({}, f, {
        q: parsed.keyword, city: pick(f.city, parsed.city), minPrice: pick(f.minPrice, parsed.minPrice),
        maxPrice: pick(f.maxPrice, parsed.maxPrice), sort: pick(f.sort, parsed.sort),
        exclude: [].concat(parsed.exclude || [], f.exclude ? String(f.exclude).split(/[,،\s]+/) : [])
      });
      var live = body.live === false || !parsed.keyword ? Promise.resolve(null) :
        liveSearch(parsed.keyword, { city: filters.city || null, pages: Math.min(Number(body.pages) || 2, 4), startPage: Math.max(Number(body.harajPage) || 1, 1) })
          .then(function (l) { filters.includeIds = [].concat(Array.isArray(f.includeIds) ? f.includeIds.slice(0, 400) : [], l.ids); return l; }, function (e) { return { error: e.message }; });
      return live.then(function (l) {
        var res2 = searchListings(filters), fresh = new Set((l && l.newIds) || []);
        return {
          parsed: parsed,
          filters: { city: filters.city || null, minPrice: filters.minPrice != null ? filters.minPrice : null, maxPrice: filters.maxPrice != null ? filters.maxPrice : null, sort: res2.sort, exclude: parsed.exclude || [] },
          live: l && { found: l.found, added: l.added, source: l.source, hasMore: l.hasMore, error: l.error, ids: l.ids },
          listings: res2.listings.map(function (o) { o.just_added = fresh.has(o.id); return o; }),
          total: res2.total, limit: res2.limit, offset: res2.offset, sort: res2.sort, count: res2.listings.length
        };
      });
    }
    if (method === "GET" && (x = m(/^\/api\/listings\/(\d+)\/details$/, p))) return details(x[1]);
    if (method === "PUT" && p === "/api/listings/seen") {
      var n = 0, ids = body.all ? null : new Set((body.ids || []).map(Number));
      S.listings.forEach(function (r2) { if (r2.is_new && (!ids || ids.has(r2.id))) { r2.is_new = 0; n++; } });
      if (ids) S.hits.forEach(function (h) { if (ids.has(h.listing_id)) h.seen = 1; });
      touch("listings", "hits");
      return { updated: n };
    }
    if (method === "PUT" && (x = m(/^\/api\/listings\/(\d+)$/, p))) {
      var row = byId.get(Number(x[1]));
      if (!row) throw err(404, "not-found");
      if ("starred" in body) row.starred = body.starred ? 1 : 0;
      if ("hidden" in body) row.hidden = body.hidden ? 1 : 0;
      touch("listings");
      return { updated: 1 };
    }
    if (method === "GET" && p === "/api/meta") return getMeta();
    if (method === "GET" && p === "/api/stats") {
      var st = { total: 0, fresh: 0, starred: 0, drops: 0 };
      S.listings.forEach(function (r3) {
        if (r3.hidden) return;
        st.total++; if (r3.is_new) st.fresh++; if (r3.starred) st.starred++;
        if (r3.prev_price_value != null && r3.price_value < r3.prev_price_value) st.drops++;
      });
      st.watches = S.watches.length; st.lastRun = S.runs[0] || null; st.schedule = scheduleInfo(); st.push = true;
      return st;
    }
    if (method === "GET" && p === "/api/history") return { runs: S.runs.slice(0, 30) };
    if (method === "GET" && p === "/api/status") return { scraping: false, watchesRunning: running };
    if (method === "GET" && p === "/api/settings") return { schedule: scheduleInfo(), quiet: quietInfo(), push: true, ai: false };
    if (method === "PUT" && p === "/api/settings") {
      if (body.quiet) {
        var hr = function (v, d) { v = Number(v); return v >= 0 && v <= 23 && Math.round(v) === v ? v : d; };
        if ("on" in body.quiet) setSetting("quiet_on", !!body.quiet.on);
        if ("from" in body.quiet) setSetting("quiet_from", hr(body.quiet.from, 0));
        if ("to" in body.quiet) setSetting("quiet_to", hr(body.quiet.to, 7));
      }
      if (body.checkEvery) {
        if (INTERVALS.indexOf(Number(body.checkEvery)) < 0) throw err(400, "bad-interval");
        setSetting("check_every", Number(body.checkEvery));
        api.registerPeriodic();
      }
      return { schedule: scheduleInfo(), quiet: quietInfo() };
    }
    if (method === "GET" && p === "/api/watches") return { watches: S.watches.map(watchRow) };
    if (method === "POST" && p === "/api/watches") {
      var qt = String(body.q || "").trim();
      if (!qt) throw err(400, "q required");
      var pq = HQ.parseQueryRules(qt);
      var w = createWatch({
        q: pq.keyword || qt, label: body.label || qt, city: body.city || pq.city,
        minPrice: body.minPrice != null ? body.minPrice : pq.minPrice, maxPrice: body.maxPrice != null ? body.maxPrice : pq.maxPrice,
        exclude: [].concat(pq.exclude || [], body.exclude ? String(body.exclude).split(/[,،\s]+/) : [])
      });
      runWatch(watchRow(w), { baseline: true }).then(flush).catch(function () {});
      return { watch: watchRow(w) };
    }
    if (method === "POST" && p === "/api/watches/run-all") return runAll("manual");
    if ((x = m(/^\/api\/watches\/(\d+)(\/run|\/seen)?$/, p))) {
      var wid = Number(x[1]), wr = S.watches.filter(function (y) { return y.id === wid; })[0];
      if (!wr) throw err(404, "not-found");
      if (method === "POST" && x[2] === "/run") return runWatch(watchRow(wr)).then(function (res3) { res3.watch = watchRow(wr); return res3; });
      if (method === "PUT" && x[2] === "/seen") {
        var cnt = 0, seenIds = new Set();
        S.hits.forEach(function (h) { if (h.watch_id === wid && !h.seen) { h.seen = 1; cnt++; seenIds.add(h.listing_id); } });
        S.listings.forEach(function (r4) { if (seenIds.has(r4.id)) r4.is_new = 0; });
        touch("hits", "listings");
        return { updated: cnt };
      }
      if (method === "PATCH") {
        if ("enabled" in body) wr.enabled = body.enabled ? 1 : 0;
        if ("label" in body) wr.label = body.label || null;
        touch("watches");
        return { watch: watchRow(wr) };
      }
      if (method === "DELETE") {
        S.watches = S.watches.filter(function (y) { return y.id !== wid; });
        S.hits = S.hits.filter(function (h) { return h.watch_id !== wid; });
        S.blocked = S.blocked.filter(function (b) { return b.watchId !== wid; });
        touch("watches", "hits", "blocked");
        return { deleted: 1 };
      }
    }
    if (p === "/api/blocked") {
      if (method === "GET") {
        return { sellers: S.blocked.map(function (b) {
          var ww = b.watchId ? S.watches.filter(function (y) { return y.id === b.watchId; })[0] : null;
          return { seller: b.seller, watchId: b.watchId, watchLabel: ww ? (ww.label || ww.q) : null, created_at: b.created_at };
        }) };
      }
      var wId = Number(body.watchId) || 0;
      if (!body.seller) throw err(400, "seller required");
      S.blocked = S.blocked.filter(function (b) { return !(b.seller === body.seller && b.watchId === wId); });
      if (method === "POST") S.blocked.unshift({ seller: String(body.seller), watchId: wId, created_at: nowIso() });
      touch("blocked");
      return { ok: true };
    }
    if (method === "POST" && p === "/api/push-test") return notify({ title: "رادار حراج", body: "التنبيهات تعمل ✓", url: "./" }).then(function () { return { sent: 1 }; });
    throw err(404, "unknown route " + method + " " + p);
  }

  var api = {
    request: function (method, path, body) {
      return load().then(function () { return handle(method || "GET", path, body); }).then(function (res) {
        return Promise.resolve(res).then(function (v) { flush(); return v; });
      });
    },
    reload: function () { return load(true); },
    setNotifier: function (fn) { notifier = fn; },
    startScheduler: startScheduler,
    runAll: runAll,
    // Installed apps on Chrome/Edge (Android + desktop) may also wake the
    // service worker now and then while closed; the browser picks the timing.
    registerPeriodic: function () {
      if (!G.navigator || !G.navigator.serviceWorker) return Promise.resolve(false);
      return G.navigator.serviceWorker.ready.then(function (reg) {
        if (!reg.periodicSync) return false;
        return reg.periodicSync.register("haraj-radar-check", { minInterval: intervalMin() * 60000 }).then(function () { return true; });
      }).catch(function () { return false; });
    },
    _internals: { searchListings: searchListings, upsertListing: upsertListing, mapItem: mapItem, maskPhones: maskPhones, isQuietNow: isQuietNow, setSetting: setSetting, state: function () { return S; } }
  };
  G.LocalAPI = api;
})(typeof self !== "undefined" ? self : this);
