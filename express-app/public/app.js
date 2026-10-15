// Haraj Radar front end — cards UI with tabs, favorites and demo fallback.
//
// Endpoints used (served by the backend):
// - GET  /api/meta -> { locations, citiesByRegion, categories }
// - GET  /api/listings?q=&location=&city=&category=&from=&to=&maxPrice=&newOnly=
// - PUT  /api/listings/seen { ids: [...] }
// - POST /api/scrape { keyword }
// - GET  /api/history
// - GET  /api/vapid-public-key  +  POST /api/subscribe { subscription }
//
// Server filters (q/location/city/category/dates/maxPrice/newOnly) run in the
// backend; extra refinements (min price, excluded words, images-only,
// price-drops, sort, favorites tab) run client-side on the returned rows.
// Without a backend (static hosting) the UI falls back to ./demo-data.json.

(function () {
  "use strict";

  var I18N = {
    ar: {
      brand: "رادار حراج",
      searchPh: "ايفون 15 في جدة أقل من 3000",
      searchBtn: "ابحث في حراج",
      notifyOff: "لا تنبيهات مفعّلة",
      notifyOnPill: "التنبيهات مفعّلة",
      tabAds: "الإعلانات", tabAlerts: "تنبيهاتي", tabFavs: "المفضلة", tabHistory: "السجل",
      latestTitle: "أحدث ما رصدناه",
      countAds: "{n} إعلاناً", capNote: "عرض 20 كحد أقصى",
      helper: "اكتب طلبك كما تقوله لصاحبك، ونفهم منه المدينة والسعر:",
      sortBest: "الأنسب", sortNew: "الأحدث", sortCheap: "الأرخص", sortExp: "الأغلى",
      filtersTitle: "تصفية", locationLabel: "المنطقة", cityLabel: "المدينة",
      categoryLabel: "القسم", allPh: "الكل",
      gccGroup: "دول الخليج", ksaGroup: "مناطق السعودية",
      cityAll: "كل المدن", cityPickRegion: "اختر منطقة سعودية أولاً",
      priceLabel: "السعر (ريال)", priceFromPh: "من", priceToPh: "إلى",
      excludeLabel: "استبعد كلمات", excludePh: "مثال: مكسور، قطع",
      timeframeLabel: "تاريخ الإعلان", timeframeAny: "أي وقت",
      timeframeToday: "اليوم", timeframeWeek: "آخر 7 أيام", timeframeMonth: "آخر 30 يوماً",
      fixedPrice: "بسعر محدد فقط", withImages: "بصور فقط",
      newOnly: "الجديد فقط", dropped: "نزل سعرها",
      tableSearchPh: "تصفية المعروض…", clearBtn: "مسح التصفية",
      emptyTitle: "لا إعلانات مطابقة.", emptyHint: "جرّب تخفيف الفلاتر أو ابحث بكلمات مختلفة.",
      badgeNew: "جديد", markSeenBtn: "تمت المشاهدة", favAria: "مفضلة",
      askPrice: "على السوم", untitled: "بدون عنوان", dash: "—",
      favsTitle: "إعلاناتك المفضلة", favEmpty: "لا مفضلة بعد — اضغط ☆ على أي إعلان لحفظه هنا.",
      alertsTitle: "تنبيهاتي", alertsDesc: "فعّل تنبيهات المتصفح لتصلك الإعلانات الجديدة فور رصدها.",
      notifyBtn: "تفعيل التنبيهات", enablingBtn: "جارٍ التفعيل…", notifyOnBtn: "التنبيهات مفعّلة",
      historyTitle: "السجل", refreshBtn: "تحديث",
      hStarted: "بدأ", hFound: "الموجود", hNew: "الجديد", hStatus: "الحالة",
      historyEmptyTable: "لا فحوصات لعرضها بعد.", running: "يعمل…",
      loading: "جارٍ التحميل…", statusEmpty: "لا شيء يطابق هذه الفلاتر بعد.",
      loadError: "تعذّر تحميل الإعلانات. تحقق من الاتصال وحاول مجدداً.",
      scrapeBusy: "يوجد فحص يعمل حالياً. انتظر قليلاً.",
      scrapeError: "تعذّر بدء الفحص. حاول بعد قليل.",
      scrapeSearching: 'جارٍ البحث في السوق عن "{kw}"…',
      scrapeDone: "انتهى الفحص. النتائج محدثة.",
      demoNotice: "وضع العرض التجريبي — البيانات عينة وليست حية.",
      demoBlocked: "غير متاح في وضع العرض التجريبي.",
      notifyUnsupported: "التنبيهات غير مدعومة في هذا المتصفح.",
      notifyOffMsg: "التنبيهات متوقفة. اسمح بها في المتصفح لتصلك التنبيهات.",
      notifyNoWorker: "لا يوجد عامل خدمة. التنبيهات تحتاج عامل الخادم.",
      notifyMissingKey: "مفتاح الإشعارات مفقود.",
      notifyOnMsg: "التنبيهات مفعّلة. ستصلك تنبيهات بالإعلانات الجديدة.",
      notifyError: "تعذّر تفعيل التنبيهات. حاول مجدداً."
    },
    en: {
      brand: "Haraj Radar",
      searchPh: "iPhone 15 in Jeddah under 3000",
      searchBtn: "Search Haraj",
      notifyOff: "Notifications off",
      notifyOnPill: "Notifications on",
      tabAds: "Ads", tabAlerts: "My alerts", tabFavs: "Favorites", tabHistory: "History",
      latestTitle: "Fresh finds",
      countAds: "{n} ads", capNote: "Up to 20 shown",
      helper: "Type your request like you would tell a friend — city and price included:",
      sortBest: "Best match", sortNew: "Newest", sortCheap: "Cheapest", sortExp: "Priciest",
      filtersTitle: "Filters", locationLabel: "Region", cityLabel: "City",
      categoryLabel: "Category", allPh: "All",
      gccGroup: "Gulf countries", ksaGroup: "Saudi regions",
      cityAll: "All cities", cityPickRegion: "Choose a Saudi region first",
      priceLabel: "Price (SAR)", priceFromPh: "From", priceToPh: "To",
      excludeLabel: "Exclude words", excludePh: "e.g. broken, parts",
      timeframeLabel: "Ad date", timeframeAny: "Any time",
      timeframeToday: "Today", timeframeWeek: "Last 7 days", timeframeMonth: "Last 30 days",
      fixedPrice: "Priced only", withImages: "With images only",
      newOnly: "New only", dropped: "Price dropped",
      tableSearchPh: "Filter shown…", clearBtn: "Clear filters",
      emptyTitle: "No matching ads.", emptyHint: "Loosen the filters or try different words.",
      badgeNew: "New", markSeenBtn: "Mark seen", favAria: "Favorite",
      askPrice: "Ask price", untitled: "Untitled", dash: "—",
      favsTitle: "Your favorites", favEmpty: "No favorites yet — tap ☆ on any ad to save it here.",
      alertsTitle: "My alerts", alertsDesc: "Turn on browser notifications to hear about new ads as they are found.",
      notifyBtn: "Enable notifications", enablingBtn: "Enabling…", notifyOnBtn: "Notifications on",
      historyTitle: "History", refreshBtn: "Refresh",
      hStarted: "Started", hFound: "Found", hNew: "New", hStatus: "Status",
      historyEmptyTable: "No runs to show yet.", running: "Running…",
      loading: "Loading…", statusEmpty: "Nothing matches these filters yet.",
      loadError: "Could not load listings. Check your connection and try again.",
      scrapeBusy: "A scrape is already running. Wait a bit.",
      scrapeError: "Scrape could not start. Try again in a moment.",
      scrapeSearching: 'Searching the market for "{kw}"…',
      scrapeDone: "Scrape finished. Results are up to date.",
      demoNotice: "Demo mode — sample data, not live.",
      demoBlocked: "Unavailable in demo mode.",
      notifyUnsupported: "Notifications are not supported in this browser.",
      notifyOffMsg: "Notifications are off. Allow them in the browser to get alerts.",
      notifyNoWorker: "No service worker found. Notifications need the backend worker.",
      notifyMissingKey: "Missing push key.",
      notifyOnMsg: "Notifications are on. You will get alerts for new listings.",
      notifyError: "Could not turn on notifications. Try again."
    }
  };

  var CHIPS = [
    "ايفون 15 برو في الرياض أقل من 3500",
    "كامري 2020 بين 40 و 60 ألف",
    "كنب مستعمل في جدة",
    "بلايستيشن 5 تحت 1500",
    "مكيف سبليت في الدمام"
  ];

  var LANG_KEY = "hr-lang", THEME_KEY = "hr-theme",
      FAV_KEY = "hr-favs", PRICE_KEY = "hr-prices";
  var lang = "ar";
  try {
    var savedLang = window.localStorage.getItem(LANG_KEY);
    if (savedLang === "ar" || savedLang === "en") lang = savedLang;
  } catch (e) {}

  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.ar[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }
  function $(id) { return document.getElementById(id); }
  function latinDigits(v) {
    return String(v).replace(/[٠-٩]/g, function (d) { return "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]; });
  }
  function fmtNum(n) {
    var num = Number(n);
    if (!Number.isFinite(num)) return t("dash");
    return new Intl.NumberFormat("en-US").format(num);
  }
  function text(v) {
    if (v === null || v === undefined || v === "") return t("dash");
    return latinDigits(String(v));
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function formatPrice(p, pv) {
    if (pv != null && pv !== "") return fmtNum(pv) + " " + (lang === "ar" ? "ريال" : "SAR");
    if (p) return latinDigits(String(p));
    return "";
  }
  function formatDate(v) {
    if (!v) return t("dash");
    var d = new Date(v);
    if (isNaN(d.getTime())) return latinDigits(String(v));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function urlBase64ToUint8Array(s) {
    var padding = "=".repeat((4 - (s.length % 4)) % 4);
    var raw = window.atob((s + padding).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function loadJSON(k, fb) {
    try {
      var v = JSON.parse(window.localStorage.getItem(k));
      return v == null ? fb : v;
    } catch (e) { return fb; }
  }
  function saveJSON(k, v) {
    try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var els = {
    q: $("q"), searchBtn: $("searchBtn"), notifyPill: $("notifyPill"),
    themeBtn: $("themeBtn"), langToggle: $("langToggle"),
    location: $("location"), city: $("city"), category: $("category"),
    priceFrom: $("priceFrom"), priceTo: $("priceTo"), exclude: $("exclude"),
    timeframe: $("timeframe"), fixedPrice: $("fixedPrice"), withImages: $("withImages"),
    newOnly: $("newOnly"), dropped: $("dropped"), tableSearch: $("tableSearch"),
    clearBtn: $("clearBtn"), chips: $("chips"), status: $("status"),
    count: $("count"), cards: $("cards"), listWrap: $("listWrap"), listBody: $("listBody"),
    emptyState: $("emptyState"), gridBtn: $("gridBtn"), listBtn: $("listBtn"),
    sortSel: $("sortSel"), favCount: $("favCount"), favCount2: $("favCount2"),
    favCards: $("favCards"), favEmpty: $("favEmpty"),
    notifyBtn: $("notifyBtn"), alertStatus: $("alertStatus"),
    historyBody: $("historyBody"), historyStatus: $("historyStatus"),
    refreshHistoryBtn: $("refreshHistoryBtn")
  };

  // Demo mode: static hosting without backend falls back to sample data.
  var DEMO = false, demoItems = [], demoRuns = [];
  var cachedListings = [], cachedCount = 0, cachedRuns = [];
  var favs = loadJSON(FAV_KEY, []);
  var priceMem = loadJSON(PRICE_KEY, {});
  var currentTab = "ads", viewMode = "grid";

  var FALLBACK_LOCATIONS = [
    { key: "KW", type: "gcc", ar: "الكويت", en: "Kuwait" },
    { key: "AE", type: "gcc", ar: "الإمارات", en: "UAE" },
    { key: "BH", type: "gcc", ar: "البحرين", en: "Bahrain" },
    { key: "SA-Riyadh", type: "ksa", ar: "الرياض", en: "Riyadh" },
    { key: "SA-Makkah", type: "ksa", ar: "مكة المكرمة", en: "Makkah" },
    { key: "SA-Madinah", type: "ksa", ar: "المدينة المنورة", en: "Madinah" },
    { key: "SA-Eastern", type: "ksa", ar: "الشرقية", en: "Eastern Province" },
    { key: "SA-Asir", type: "ksa", ar: "عسير", en: "Asir" },
    { key: "SA-Tabuk", type: "ksa", ar: "تبوك", en: "Tabuk" },
    { key: "SA-Qassim", type: "ksa", ar: "القصيم", en: "Qassim" },
    { key: "SA-Hail", type: "ksa", ar: "حائل", en: "Hail" },
    { key: "SA-Jazan", type: "ksa", ar: "جازان", en: "Jazan" },
    { key: "SA-Najran", type: "ksa", ar: "نجران", en: "Najran" },
    { key: "SA-Baha", type: "ksa", ar: "الباحة", en: "Al-Baha" },
    { key: "SA-Jouf", type: "ksa", ar: "الجوف", en: "Al-Jouf" },
    { key: "SA-Borders", type: "ksa", ar: "الحدود الشمالية", en: "Northern Borders" }
  ];
  var meta = { locations: FALLBACK_LOCATIONS.slice(), citiesByRegion: {}, categories: [] };
  function locName(l) { return lang === "ar" ? (l.ar || l.en || l.key) : (l.en || l.ar || l.key); }
  function findLocation(key) {
    for (var i = 0; i < meta.locations.length; i++) if (meta.locations[i].key === key) return meta.locations[i];
    return null;
  }
  function clearSelect(s) { while (s.firstChild) s.removeChild(s.firstChild); }
  function addOption(s, v, label) {
    var o = document.createElement("option"); o.value = v; o.textContent = label; s.appendChild(o);
  }
  function buildLocationOptions() {
    var cur = els.location.value;
    clearSelect(els.location); addOption(els.location, "", t("allPh"));
    var gcc = document.createElement("optgroup"); gcc.label = t("gccGroup");
    var ksa = document.createElement("optgroup"); ksa.label = t("ksaGroup");
    meta.locations.forEach(function (l) {
      var o = document.createElement("option"); o.value = l.key; o.textContent = locName(l);
      (l.type === "gcc" ? gcc : ksa).appendChild(o);
    });
    if (gcc.children.length) els.location.appendChild(gcc);
    if (ksa.children.length) els.location.appendChild(ksa);
    els.location.value = (cur && findLocation(cur)) ? cur : "";
  }
  function buildCityOptions() {
    var key = els.location.value, loc = key ? findLocation(key) : null, cur = els.city.value;
    clearSelect(els.city);
    var cities = (loc && loc.type !== "gcc" && meta.citiesByRegion[key]) || [];
    if (!key) { addOption(els.city, "", t("cityAll")); els.city.disabled = true; }
    else if (!loc || loc.type === "gcc" || !cities.length) { addOption(els.city, "", t("cityPickRegion")); els.city.disabled = true; }
    else { addOption(els.city, "", t("cityAll")); cities.forEach(function (c) { addOption(els.city, c, c); }); els.city.disabled = false; }
    els.city.value = (!els.city.disabled && cur) ? cur : "";
  }
  function buildCategoryOptions() {
    var cur = els.category.value;
    clearSelect(els.category); addOption(els.category, "", t("allPh"));
    meta.categories.forEach(function (c) { addOption(els.category, c, c); });
    els.category.value = (cur && meta.categories.indexOf(cur) !== -1) ? cur : "";
  }
  function refreshMetaTexts() { buildLocationOptions(); buildCityOptions(); buildCategoryOptions(); }

  async function loadMeta() {
    try {
      var res = await fetch("/api/meta", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("no api");
      var data = await res.json();
      if (Array.isArray(data.locations) && data.locations.length) meta.locations = data.locations;
      if (data.citiesByRegion) meta.citiesByRegion = data.citiesByRegion;
      if (Array.isArray(data.categories)) meta.categories = data.categories;
    } catch (e) {
      try {
        var dr = await fetch("./demo-data.json", { headers: { Accept: "application/json" } });
        var demo = await dr.json();
        if (!Array.isArray(demo.listings)) throw new Error("bad demo");
        DEMO = true; demoItems = demo.listings; demoRuns = demo.runs || [];
        if (demo.citiesByRegion) meta.citiesByRegion = demo.citiesByRegion;
        if (Array.isArray(demo.categories)) meta.categories = demo.categories;
      } catch (e2) { /* offline with no demo file: selects stay basic */ }
    }
    refreshMetaTexts();
  }

  // --- Filters: server params + client-side refinements ---

  function getFilters() {
    return {
      q: els.q.value.trim(), location: els.location.value,
      city: els.city.disabled ? "" : els.city.value, category: els.category.value,
      priceFrom: els.priceFrom.value.trim(), priceTo: els.priceTo.value.trim(),
      exclude: els.exclude.value.trim(),
      timeframe: els.timeframe.value, newOnly: els.newOnly.checked,
      fixedPrice: els.fixedPrice.checked, withImages: els.withImages.checked,
      dropped: els.dropped.checked
    };
  }
  function dateRange() {
    var tf = els.timeframe.value, to = new Date(), from = null;
    function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    if (tf === "today") from = new Date(to);
    else if (tf === "week") { from = new Date(to); from.setDate(from.getDate() - 6); }
    else if (tf === "month") { from = new Date(to); from.setDate(from.getDate() - 29); }
    return { from: from ? iso(from) : "", to: (tf === "any") ? "" : iso(to) };
  }
  function buildListingsUrl() {
    var f = getFilters(), r = dateRange(), p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.location) p.set("location", f.location);
    if (f.city) p.set("city", f.city);
    if (f.category) p.set("category", f.category);
    if (f.priceTo) p.set("maxPrice", f.priceTo);
    if (r.from) p.set("from", r.from);
    if (r.to) p.set("to", r.to);
    if (f.newOnly) p.set("newOnly", "1");
    var qs = p.toString();
    return "/api/listings" + (qs ? "?" + qs : "");
  }

  // Client-side refinements over server/demo rows (same code both modes).
  function refine(items) {
    var f = getFilters();
    var excl = f.exclude.split(/[،,;\s]+/).map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean);
    var out = items.filter(function (it) {
      if (f.priceFrom !== "") {
        var mn = Number(f.priceFrom);
        if (Number.isFinite(mn) && (it.price_value == null || it.price_value < mn)) return false;
      }
      if (excl.length) {
        var hay = ((it.title || "") + " " + (it.description || "")).toLowerCase();
        for (var i = 0; i < excl.length; i++) if (hay.indexOf(excl[i]) !== -1) return false;
      }
      if (f.withImages && !isFullUrl(it.thumb)) return false;
      if (f.dropped && !(it.price_value != null && priceMem[it.url] != null && it.price_value < priceMem[it.url])) return false;
      return true;
    });
    // Remember prices for future drop detection.
    var changed = false;
    out.forEach(function (it) {
      if (it.price_value != null && priceMem[it.url] !== it.price_value) { priceMem[it.url] = it.price_value; changed = true; }
    });
    if (changed) saveJSON(PRICE_KEY, priceMem);
    // Sort (best = server/demo order).
    var mode = els.sortSel.value;
    if (mode !== "best") {
      out = out.slice().sort(function (a, b) {
        if (mode === "new") return String(b.date || "").localeCompare(String(a.date || ""));
        var ap = a.price_value, bp = b.price_value;
        if (ap == null) return 1; if (bp == null) return -1;
        return mode === "cheap" ? ap - bp : bp - ap;
      });
    }
    return out.slice(0, 20);
  }
  function demoFilter(items) {
    var f = getFilters(), r = dateRange();
    var words = f.q.split(/[\s،,؛;.]+/).map(function (w) { return w.trim().toLowerCase(); }).filter(function (w) { return w.length >= 2; });
    return items.filter(function (it) {
      if (words.length) {
        var hay = ((it.title || "") + " " + (it.description || "")).toLowerCase();
        for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
      }
      if (f.city && it.city !== f.city) return false;
      if (f.category && it.category !== f.category) return false;
      if (f.priceTo !== "") {
        var mx = Number(f.priceTo);
        if (Number.isFinite(mx) && it.price_value != null && it.price_value > mx) return false;
      }
      if (r.from && (it.date || "") < r.from) return false;
      if (r.to && (it.date || "") > r.to) return false;
      if (f.newOnly && !it.is_new) return false;
      if (f.location) {
        var loc = findLocation(f.location);
        if (!loc || loc.type === "gcc") return false;
        var name = lang === "ar" ? (loc.ar || "") : (loc.en || loc.ar || "");
        if (!it.region || (it.region.indexOf(name) === -1 && name.indexOf(it.region) === -1)) return false;
      }
      return true;
    });
  }

  function isFullUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u); }
  function isFav(url) { return favs.indexOf(url) !== -1; }
  function toggleFav(url) {
    var i = favs.indexOf(url);
    if (i === -1) favs.push(url); else favs.splice(i, 1);
    saveJSON(FAV_KEY, favs);
    updateFavCounts(); renderCurrent();
  }
  function updateFavCounts() {
    var n = favs.length;
    els.favCount.hidden = !n; els.favCount.textContent = n ? fmtNum(n) : "";
    els.favCount2.textContent = n ? t("countAds", { n: fmtNum(n) }) : "";
  }

  function thumbHtml(it) {
    var inner;
    if (isFullUrl(it.thumb)) {
      inner = '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove();" />';
    } else {
      inner = '<span class="ph" aria-hidden="true">📱</span>';
    }
    return '<span class="thumb">' + inner +
      (it.is_new ? '<span class="badge-new">' + esc(t("badgeNew")) + '</span>' : '') +
      '<button class="fav-btn' + (isFav(it.url) ? ' faved' : '') + '" data-fav="' + esc(it.url || "") + '" aria-label="' + esc(t("favAria")) + '">' + (isFav(it.url) ? "★" : "☆") + '</button>' +
      pricePill(it) + '</span>';
  }
  function pricePill(it) {
    var p = formatPrice(it.price, it.price_value);
    if (p) return '<span class="price-pill">' + esc(p) + '</span>';
    return '<span class="price-pill ask">' + esc(t("askPrice")) + '</span>';
  }
  function cardHtml(it) {
    var seen = it.is_new ? '<div><button class="mark-seen" data-seen="' + esc(String(it.id == null ? "" : it.id)) + '">' + esc(t("markSeenBtn")) + '</button></div>' : '';
    return '<article class="card' + (it.is_new ? ' is-new' : '') + '">' + thumbHtml(it) +
      '<div class="card-body"><h3><a href="' + esc(it.url || "#") + '" target="_blank" rel="noopener">' + esc(it.title || it.url || t("untitled")) + '</a></h3>' +
      '<div class="card-meta"><span>' + esc(text(it.city)) + '</span><span dir="ltr">' + esc(formatDate(it.date)) + '</span>' + seen + '</div></div></article>';
  }

  function renderCurrent() {
    var items = refine(cachedListings);
    // Instant table search over the refined rows.
    var q = els.tableSearch.value.trim().toLowerCase();
    if (q) {
      items = items.filter(function (it) {
        return ((it.title || "") + " " + (it.city || "") + " " + (it.price || "")).toLowerCase().indexOf(q) !== -1;
      });
    }
    els.count.textContent = t("countAds", { n: fmtNum(items.length) });
    els.emptyState.hidden = items.length > 0;
    if (viewMode === "grid") {
      els.cards.innerHTML = items.map(cardHtml).join("");
      els.cards.hidden = false; els.listWrap.hidden = true;
    } else {
      els.listBody.innerHTML = items.map(function (it) {
        var img = isFullUrl(it.thumb)
          ? '<img class="mini-thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.remove();" />'
          : '<span class="mini-thumb"></span>';
        return '<tr><td>' + img + '</td><td><a href="' + esc(it.url || "#") + '" target="_blank" rel="noopener">' + esc(it.title || t("untitled")) + '</a>' +
          (it.is_new ? ' <span class="badge-new inline">' + esc(t("badgeNew")) + '</span>' : '') + '</td>' +
          '<td class="num">' + esc(formatPrice(it.price, it.price_value) || t("dash")) + '</td>' +
          '<td>' + esc(text(it.city)) + '</td><td class="num">' + esc(formatDate(it.date)) + '</td></tr>';
      }).join("");
      els.cards.hidden = true; els.listWrap.hidden = false;
    }
    bindCardButtons(els.cards);
    renderFavs();
  }
  function bindCardButtons(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll("[data-fav]"), function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); toggleFav(b.getAttribute("data-fav")); });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-seen]"), function (b) {
      b.addEventListener("click", function () { markSeen([b.getAttribute("data-seen")]); });
    });
  }
  function renderFavs() {
    var items = cachedListings.filter(function (it) { return isFav(it.url); });
    els.favCards.innerHTML = items.map(cardHtml).join("");
    els.favEmpty.hidden = items.length > 0;
    bindCardButtons(els.favCards);
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.classList.remove("is-error", "is-ok");
    if (kind) els.status.classList.add(kind);
  }
  function setHistoryStatus(msg, kind) {
    els.historyStatus.textContent = msg || "";
    els.historyStatus.classList.remove("is-error", "is-ok");
    if (kind) els.historyStatus.classList.add(kind);
  }

  async function loadListings() {
    setStatus(t("loading"));
    try {
      var rows;
      if (DEMO) { rows = demoFilter(demoItems); }
      else {
        var res = await fetch(buildListingsUrl(), { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("bad status");
        var data = await res.json();
        rows = Array.isArray(data.listings) ? data.listings : [];
      }
      cachedListings = rows; cachedCount = rows.length;
      renderCurrent();
      if (!rows.length) setStatus(t("statusEmpty"));
      else if (DEMO) setStatus(t("demoNotice"), "is-ok");
      else setStatus("", "");
    } catch (err) {
      cachedListings = []; cachedCount = 0; renderCurrent();
      setStatus(t("loadError"), "is-error");
    }
  }

  async function markSeen(ids) {
    if (DEMO) {
      cachedListings.forEach(function (it) { if (ids.indexOf(String(it.id)) !== -1) it.is_new = false; });
      renderCurrent(); return;
    }
    try {
      var res = await fetch("/api/listings/seen", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids })
      });
      if (!res.ok) throw new Error("bad");
      cachedListings.forEach(function (it) { if (ids.indexOf(String(it.id)) !== -1 || ids.indexOf(it.id) !== -1) it.is_new = false; });
      renderCurrent();
    } catch (err) { setStatus(t("loadError"), "is-error"); }
  }

  async function scrapeNow() {
    if (DEMO) { setStatus(t("demoBlocked"), "is-error"); return; }
    var kw = els.q.value.trim();
    setStatus(t("scrapeSearching", { kw: kw || "…" }));
    try {
      var res = await fetch("/api/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kw ? { keyword: kw } : {})
      });
      if (res.status === 409) { setStatus(t("scrapeBusy"), "is-error"); await loadListings(); return; }
      if (!res.ok) throw new Error("bad");
      await loadListings(); await loadHistory();
      setStatus(t("scrapeDone"), "is-ok");
    } catch (err) { setStatus(t("scrapeError"), "is-error"); }
  }

  function renderHistory(runs) {
    els.historyBody.textContent = "";
    if (!runs.length) {
      var er = document.createElement("tr"); er.className = "empty-row";
      var ec = document.createElement("td"); ec.colSpan = 4; ec.textContent = t("historyEmptyTable");
      er.appendChild(ec); els.historyBody.appendChild(er); return;
    }
    runs.slice(0, 10).forEach(function (r) {
      var tr = document.createElement("tr");
      [["started_at", 1], ["found", 0], ["added_new", 0]].forEach(function (spec) {
        var td = document.createElement("td"); td.className = "num"; td.setAttribute("dir", "ltr");
        var v = r[spec[0]];
        td.textContent = spec[1] ? formatDate(v) : (v == null ? t("dash") : fmtNum(v));
        tr.appendChild(td);
      });
      var st = document.createElement("td"); st.textContent = text(r.status); tr.appendChild(st);
      els.historyBody.appendChild(tr);
    });
  }
  async function loadHistory() {
    try {
      var runs;
      if (DEMO) { runs = demoRuns.slice(); }
      else {
        var res = await fetch("/api/history", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("bad");
        var data = await res.json();
        runs = Array.isArray(data.runs) ? data.runs : [];
      }
      cachedRuns = runs; renderHistory(runs);
      setHistoryStatus(runs.length ? "" : t("historyEmptyTable"));
    } catch (err) { cachedRuns = []; renderHistory([]); setHistoryStatus(t("loadError"), "is-error"); }
  }

  async function enableNotifications() {
    if (DEMO) { setStatus(t("demoBlocked"), "is-error"); switchTab("alerts"); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      els.alertStatus.textContent = t("notifyUnsupported"); return;
    }
    var perm = await Notification.requestPermission();
    if (perm !== "granted") { els.alertStatus.textContent = t("notifyOffMsg"); return; }
    els.notifyBtn.disabled = true; els.notifyBtn.textContent = t("enablingBtn");
    try {
      var reg = await navigator.serviceWorker.getRegistration().catch(function () { return null; })
        || await navigator.serviceWorker.ready.catch(function () { return null; });
      if (!reg) throw new Error(t("notifyNoWorker"));
      var kr = await fetch("/api/vapid-public-key", { headers: { Accept: "application/json" } });
      if (!kr.ok) throw new Error("bad");
      var kd = await kr.json();
      if (!kd.key) throw new Error(t("notifyMissingKey"));
      var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(kd.key) });
      var sr = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub })
      });
      if (!sr.ok) throw new Error("bad");
      els.alertStatus.textContent = t("notifyOnMsg");
      els.notifyBtn.textContent = t("notifyOnBtn");
      refreshPill(true);
    } catch (err) {
      els.alertStatus.textContent = t("notifyError");
      els.notifyBtn.disabled = false; els.notifyBtn.textContent = t("notifyBtn");
    }
  }
  function refreshPill(on) {
    els.notifyPill.classList.toggle("on", !!on);
    els.notifyPill.querySelector("[data-i18n]").textContent = on ? t("notifyOnPill") : t("notifyOff");
  }

  // --- Tabs ---

  function switchTab(name) {
    currentTab = name;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    ["ads", "favs", "alerts", "history"].forEach(function (n) {
      $("view-" + n).hidden = n !== name;
    });
    if (name === "favs") renderFavs();
    if (name === "history") loadHistory();
  }

  // --- Language + theme ---

  function applyLang(next) {
    lang = next === "en" ? "en" : "ar";
    try { window.localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = t("brand");
    document.querySelectorAll("[data-i18n]").forEach(function (n) {
      var k = n.getAttribute("data-i18n");
      if (k && I18N[lang][k] !== undefined) n.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (n) {
      var k = n.getAttribute("data-i18n-ph");
      if (k && I18N[lang][k] !== undefined) n.setAttribute("placeholder", t(k));
    });
    els.langToggle.textContent = lang === "ar" ? "EN" : "AR";
    refreshMetaTexts();
    buildChips();
    renderCurrent(); renderFavs();
  }
  function applyTheme(next) {
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) {}
    document.documentElement.setAttribute("data-theme", next === "dark" ? "dark" : "light");
  }

  function buildChips() {
    els.chips.textContent = "";
    CHIPS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = c;
      b.addEventListener("click", function () { els.q.value = c; scrapeNow(); });
      els.chips.appendChild(b);
    });
  }

  // --- Wire up ---

  var debounced = null;
  function debounceLoad() {
    if (debounced) clearTimeout(debounced);
    debounced = setTimeout(loadListings, 350);
  }

  els.searchBtn.addEventListener("click", scrapeNow);
  els.q.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); scrapeNow(); }
  });
  [els.location, els.city, els.category, els.timeframe, els.newOnly, els.fixedPrice, els.withImages, els.dropped].forEach(function (el) {
    el.addEventListener("change", function () {
      if (el === els.location) buildCityOptions();
      loadListings();
    });
  });
  [els.priceFrom, els.priceTo, els.exclude].forEach(function (el) {
    el.addEventListener("input", debounceLoad);
    el.addEventListener("change", loadListings);
  });
  els.tableSearch.addEventListener("input", renderCurrent);
  els.sortSel.addEventListener("change", renderCurrent);
  els.gridBtn.addEventListener("click", function () {
    viewMode = "grid";
    els.gridBtn.classList.add("is-active"); els.listBtn.classList.remove("is-active");
    renderCurrent();
  });
  els.listBtn.addEventListener("click", function () {
    viewMode = "list";
    els.listBtn.classList.add("is-active"); els.gridBtn.classList.remove("is-active");
    renderCurrent();
  });
  els.clearBtn.addEventListener("click", function () {
    els.q.value = ""; els.location.value = ""; els.category.value = "";
    els.priceFrom.value = ""; els.priceTo.value = ""; els.exclude.value = "";
    els.timeframe.value = "any"; els.tableSearch.value = "";
    [els.newOnly, els.fixedPrice, els.withImages, els.dropped].forEach(function (c) { c.checked = false; });
    buildCityOptions(); loadListings();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
    b.addEventListener("click", function () { switchTab(b.getAttribute("data-tab")); });
  });
  els.notifyBtn.addEventListener("click", enableNotifications);
  els.notifyPill.addEventListener("click", enableNotifications);
  els.refreshHistoryBtn.addEventListener("click", loadHistory);
  els.langToggle.addEventListener("click", function () { applyLang(lang === "ar" ? "en" : "ar"); });
  els.themeBtn.addEventListener("click", function () {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // Boot: theme, language, then meta → listings → history.
  var savedTheme = null;
  try { savedTheme = window.localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(savedTheme === "dark" ? "dark" : "light");
  applyLang(lang);
  buildChips();
  updateFavCounts();
  loadMeta().then(function () { loadListings(); loadHistory(); });
})();
