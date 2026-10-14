// Listings Watch — vanilla JS front end.
//
// Endpoints used (served by the backend):
// - GET  /api/meta -> { locations: [{key,type,ar,en}], citiesByRegion: {key:[...]}, categories: [...] }
// - GET  /api/listings?q=&location=&region=&city=&category=&from=&to=&newOnly=1&maxPrice=
// - PUT  /api/listings/seen { ids: [...] }
// - POST /api/scrape { keyword }
// - GET  /api/history
// - GET  /api/vapid-public-key  +  POST /api/subscribe { subscription }

(function () {
  "use strict";

  // --- Single i18n dictionary: every user-visible string lives here ---

  var I18N = {
    ar: {
      docTitle: "متابعة الإعلانات",
      docDesc: "تصفح أحدث الإعلانات، صفِّ حسب المكان والوقت، وشغّل فحصاً جديداً.",
      headerTitle: "متابعة الإعلانات",
      headerSubtitle: "أحدث العناصر في جدول واحد. صفِّ، واكتشف الجديد، وأعد الفحص عند الحاجة.",
      scrapeBtn: "فحص الآن",
      scrapingBtn: "جارٍ الفحص…",
      notifyBtn: "تفعيل التنبيهات",
      enablingBtn: "جارٍ التفعيل…",
      notifyOnBtn: "التنبيهات مفعّلة",
      langBtn: "EN",
      keywordLabel: "كلمات البحث",
      keywordPh: "مثال: سيارات…",
      liveSearchBtn: "بحث",
      locationLabel: "المنطقة / الموقع",
      gccGroup: "دول الخليج",
      ksaGroup: "مناطق السعودية",
      cityLabel: "المدينة",
      cityAll: "كل المدن",
      cityPickRegion: "اختر منطقة سعودية أولاً",
      categoryLabel: "التصنيف",
      allPh: "الكل",
      timeframeLabel: "الفترة الزمنية",
      timeframeAny: "أي وقت",
      timeframeToday: "اليوم",
      timeframeWeek: "آخر 7 أيام",
      timeframeMonth: "آخر 30 يوماً",
      timeframeCustom: "مخصص",
      fromLabel: "من تاريخ",
      toLabel: "إلى تاريخ",
      maxPriceLabel: "أعلى سعر",
      maxPricePh: "بدون حد",
      newOnlyLabel: "الجديد فقط",
      applyBtn: "تصفية",
      clearBtn: "مسح",
      resultsTitle: "النتائج",
      tableSearchPh: "تصفية المعروض…",
      tableSearchLabel: "تصفية الصفوف المعروضة حالياً",
      capNote: "عرض 20 كحد أقصى",
      countZero: "لا نتائج.",
      countOne: "نتيجة 1.",
      countMany: "{n} نتائج.",
      countFiltered: "{n} من {t}",
      dash: "—",
      loading: "جارٍ التحميل…",
      statusEmpty: "لا شيء يطابق هذه الفلاتر بعد.",
      loadError: "تعذّر تحميل الإعلانات. تحقق من الاتصال وحاول مجدداً.",
      emptyTable: "لا إعلانات. امسح الفلاتر أو شغّل فحصاً.",
      badgeNew: "جديد",
      markSeenBtn: "تمت المشاهدة",
      savingBtn: "جارٍ الحفظ…",
      markSeenError: "تعذّر التحديث. حاول مجدداً.",
      markSeenAria: "تعليم كمقروء: {t}",
      untitled: "بدون عنوان",
      scrapeWithKeyword: 'جارٍ البحث في السوق عن "{kw}". قد يستغرق قليلاً…',
      scrapeStarted: "بدأ الفحص. قد يستغرق قليلاً…",
      scrapeRefreshing: "انتهى الفحص. جارٍ تحديث النتائج…",
      scrapeDone: "انتهى الفحص. النتائج محدثة.",
      scrapeError: "تعذّر بدء الفحص. حاول بعد قليل.",
      scrapeBusy: "يوجد فحص يعمل حالياً. انتظر قليلاً ثم حدّث النتائج.",
      historyTitle: "آخر الفحوصات",
      refreshBtn: "تحديث",
      historyLoading: "جارٍ التحميل…",
      historyEmpty: "لا فحوصات بعد. اضغط “فحص الآن” لبدء الأول.",
      historyError: "تعذّر تحميل السجل.",
      historyEmptyTable: "لا فحوصات لعرضها بعد.",
      running: "يعمل…",
      thTitle: "العنوان",
      thPrice: "السعر",
      thRegion: "المنطقة",
      thCity: "المدينة",
      thTime: "التاريخ",
      thCategory: "التصنيف",
      hStarted: "بدأ",
      hFinished: "انتهى",
      hFound: "الموجود",
      hNew: "الجديد",
      hStatus: "الحالة",
      hint: "العناصر الجديدة تظهر مع شارة “جديد” وزر “تمت المشاهدة” لمسحها.",
      footerPre: "البيانات من",
      footerPost: "والفحص والسجل يتحدثان من الأزرار أعلاه.",
      notifyUnsupported: "التنبيهات غير مدعومة في هذا المتصفح.",
      notifyOff: "التنبيهات متوقفة. اسمح بها في المتصفح لتصلك التنبيهات.",
      notifyNoWorker: "لا يوجد عامل خدمة. التنبيهات تحتاج عامل الخادم.",
      notifyMissingKey: "مفتاح الإشعارات مفقود.",
      notifyOn: "التنبيهات مفعّلة. ستصلك تنبيهات بالإعلانات الجديدة.",
      notifyError: "تعذّر تفعيل التنبيهات. حاول مجدداً.",
      filtersAria: "الفلاتر",
      resultsAria: "النتائج",
      historyAria: "السجل"
    },
    en: {
      docTitle: "Listings Watch",
      docDesc: "Browse latest listings, filter by place and time, and run a fresh scrape.",
      headerTitle: "Listings Watch",
      headerSubtitle: "Latest items in one table. Filter, check what is new, and scrape again when needed.",
      scrapeBtn: "Scrape now",
      scrapingBtn: "Scraping…",
      notifyBtn: "Enable notifications",
      enablingBtn: "Enabling…",
      notifyOnBtn: "Notifications on",
      langBtn: "AR",
      keywordLabel: "Keywords",
      keywordPh: "e.g. cars…",
      liveSearchBtn: "Search",
      locationLabel: "Region / Location",
      gccGroup: "Gulf countries",
      ksaGroup: "Saudi regions",
      cityLabel: "City",
      cityAll: "All cities",
      cityPickRegion: "Choose a Saudi region first",
      categoryLabel: "Category",
      allPh: "All",
      timeframeLabel: "Time range",
      timeframeAny: "Any time",
      timeframeToday: "Today",
      timeframeWeek: "Last 7 days",
      timeframeMonth: "Last 30 days",
      timeframeCustom: "Custom",
      fromLabel: "Time from",
      toLabel: "Time to",
      maxPriceLabel: "Max price",
      maxPricePh: "No limit",
      newOnlyLabel: "New only",
      applyBtn: "Apply",
      clearBtn: "Clear",
      resultsTitle: "Results",
      tableSearchPh: "Filter shown…",
      tableSearchLabel: "Filter currently shown rows",
      capNote: "Up to 20 shown",
      countZero: "No results.",
      countOne: "1 result.",
      countMany: "{n} results.",
      countFiltered: "{n} of {t}",
      dash: "—",
      loading: "Loading…",
      statusEmpty: "Nothing matches these filters yet.",
      loadError: "Could not load listings. Check your connection and try again.",
      emptyTable: "No listings found. Try clearing the filters or running a scrape.",
      badgeNew: "New",
      markSeenBtn: "Mark seen",
      savingBtn: "Saving…",
      markSeenError: "Could not update. Try again.",
      markSeenAria: "Mark as seen: {t}",
      untitled: "Untitled",
      scrapeWithKeyword: 'Searching the market for "{kw}". This can take a little while…',
      scrapeStarted: "Scrape started. This can take a little while…",
      scrapeRefreshing: "Scrape finished. Refreshing results…",
      scrapeDone: "Scrape finished. Results are up to date.",
      scrapeError: "Scrape could not start. Try again in a moment.",
      scrapeBusy: "A scrape is already running. Wait a bit, then refresh the results.",
      historyTitle: "Last runs",
      refreshBtn: "Refresh",
      historyLoading: "Loading…",
      historyEmpty: "No runs yet. Press “Scrape now” to start the first one.",
      historyError: "Could not load history.",
      historyEmptyTable: "No runs to show yet.",
      running: "Running…",
      thTitle: "Title",
      thPrice: "Price",
      thRegion: "Region",
      thCity: "City",
      thTime: "Date",
      thCategory: "Category",
      hStarted: "Started",
      hFinished: "Finished",
      hFound: "Found",
      hNew: "New",
      hStatus: "Status",
      hint: "New items show a “New” badge in the title cell with a “Mark seen” button that clears it.",
      footerPre: "Data comes from",
      footerPost: "Scraping and history update from the buttons above.",
      notifyUnsupported: "Notifications are not supported in this browser.",
      notifyOff: "Notifications are off. Allow them in the browser to get alerts.",
      notifyNoWorker: "No service worker found. Notifications need the backend worker.",
      notifyMissingKey: "Missing push key.",
      notifyOn: "Notifications are on. You will get alerts for new listings.",
      notifyError: "Could not turn on notifications. Try again.",
      filtersAria: "Filters",
      resultsAria: "Results",
      historyAria: "History"
    }
  };

  var LANG_KEY = "lw-lang";
  var lang = "ar";
  try {
    var saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "ar" || saved === "en") lang = saved;
  } catch (e) { /* storage unavailable: stay on default */ }

  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.ar[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace("{" + k + "}", vars[k]);
      });
    }
    return s;
  }

  // --- Small helpers ---

  function $(id) {
    return document.getElementById(id);
  }

  // Run a function only after the user stops typing for `wait` ms.
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  // Force Latin digits 0-9 so Arabic-Indic digits never appear.
  function latinDigits(value) {
    return String(value)
      .replace(/[٠-٩]/g, function (d) { return "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]; })
      .replace(/[۰-۹]/g, function (d) { return "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]; });
  }

  // Grouped English number formatting, always en-US.
  function fmtNum(n) {
    var num = Number(n);
    if (!Number.isFinite(num)) return t("dash");
    return new Intl.NumberFormat("en-US").format(num);
  }

  // Empty or missing values show as a dash so the table stays tidy.
  function text(value) {
    if (value === null || value === undefined || value === "") return t("dash");
    return latinDigits(String(value));
  }

  // Dates always as YYYY-MM-DD with Latin digits.
  function formatTime(value) {
    if (!value) return t("dash");
    var d = new Date(value);
    if (isNaN(d.getTime())) return latinDigits(String(value));
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  // Needed to turn the VAPID public key into the form pushManager expects.
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  // --- Elements ---

  var els = {
    form: $("filterForm"),
    q: $("q"),
    liveSearchBtn: $("liveSearchBtn"),
    location: $("location"),
    city: $("city"),
    category: $("category"),
    timeframe: $("timeframe"),
    maxPrice: $("maxPrice"),
    from: $("from"),
    to: $("to"),
    fromWrap: $("fromWrap"),
    toWrap: $("toWrap"),
    newOnly: $("newOnly"),
    clearBtn: $("clearBtn"),
    count: $("count"),
    capNote: $("capNote"),
    tableSearch: $("tableSearch"),
    status: $("status"),
    resultsBody: $("resultsBody"),
    scrapeBtn: $("scrapeBtn"),
    notifyBtn: $("notifyBtn"),
    langToggle: $("langToggle"),
    historyBody: $("historyBody"),
    historyStatus: $("historyStatus"),
    refreshHistoryBtn: $("refreshHistoryBtn"),
  };

  // --- Meta for the hierarchical filters (GET /api/meta) ---

  // Offline fallback mirrors the backend contract so the selects stay usable
  // when /api/meta cannot be reached.
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
    { key: "SA-Borders", type: "ksa", ar: "الحدود الشمالية", en: "Northern Borders" },
  ];

  var meta = { locations: FALLBACK_LOCATIONS.slice(), citiesByRegion: {}, categories: [] };

  function locName(loc) {
    if (!loc) return "";
    return lang === "ar" ? (loc.ar || loc.en || loc.key) : (loc.en || loc.ar || loc.key);
  }

  function findLocation(key) {
    for (var i = 0; i < meta.locations.length; i++) {
      if (meta.locations[i].key === key) return meta.locations[i];
    }
    return null;
  }

  function clearSelect(sel) {
    while (sel.firstChild) sel.removeChild(sel.firstChild);
  }

  function addOption(sel, value, label) {
    var opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }

  function buildLocationOptions() {
    var current = els.location.value;
    clearSelect(els.location);
    addOption(els.location, "", t("allPh"));
    var gcc = document.createElement("optgroup");
    gcc.label = t("gccGroup");
    var ksa = document.createElement("optgroup");
    ksa.label = t("ksaGroup");
    meta.locations.forEach(function (loc) {
      var opt = document.createElement("option");
      opt.value = loc.key;
      opt.textContent = locName(loc);
      if (loc.type === "gcc") gcc.appendChild(opt);
      else ksa.appendChild(opt);
    });
    if (gcc.children.length) els.location.appendChild(gcc);
    if (ksa.children.length) els.location.appendChild(ksa);
    // Keep the user's choice across language switches when still valid.
    if (current && findLocation(current)) els.location.value = current;
    else els.location.value = "";
  }

  function buildCityOptions() {
    var locKey = els.location.value;
    var loc = locKey ? findLocation(locKey) : null;
    var current = els.city.value;
    clearSelect(els.city);
    var cities = (loc && loc.type !== "gcc" && meta.citiesByRegion[locKey]) || [];
    if (!locKey) {
      addOption(els.city, "", t("cityAll"));
      els.city.disabled = true;
    } else if (!loc || loc.type === "gcc" || !cities.length) {
      addOption(els.city, "", t("cityPickRegion"));
      els.city.disabled = true;
    } else {
      addOption(els.city, "", t("cityAll"));
      cities.forEach(function (c) { addOption(els.city, c, c); });
      els.city.disabled = false;
    }
    if (!els.city.disabled && current) els.city.value = current;
    else els.city.value = "";
  }

  function buildCategoryOptions() {
    var current = els.category.value;
    clearSelect(els.category);
    addOption(els.category, "", t("allPh"));
    meta.categories.forEach(function (c) { addOption(els.category, c, c); });
    if (current && meta.categories.indexOf(current) !== -1) els.category.value = current;
    else els.category.value = "";
  }

  function refreshMetaTexts() {
    buildLocationOptions();
    buildCityOptions();
    buildCategoryOptions();
  }

  async function loadMeta() {
    try {
      var res = await fetch("/api/meta", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Server returned " + res.status);
      var data = await res.json();
      if (Array.isArray(data.locations) && data.locations.length) meta.locations = data.locations;
      if (data.citiesByRegion && typeof data.citiesByRegion === "object") meta.citiesByRegion = data.citiesByRegion;
      if (Array.isArray(data.categories)) meta.categories = data.categories;
    } catch (e) {
      // Keep the fallback locations + empty cities/categories.
    }
    refreshMetaTexts();
  }

  // --- Timeframe preset -> from/to (YYYY-MM-DD, Latin digits) ---

  function todayStr(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function updateDateVisibility() {
    var custom = els.timeframe.value === "custom";
    if (els.fromWrap) els.fromWrap.classList.toggle("is-hidden", !custom);
    if (els.toWrap) els.toWrap.classList.toggle("is-hidden", !custom);
  }

  function applyTimeframe(preset) {
    if (preset === "today") {
      var today = todayStr(0);
      els.from.value = today;
      els.to.value = today;
    } else if (preset === "week") {
      els.from.value = todayStr(-6);
      els.to.value = todayStr(0);
    } else if (preset === "month") {
      els.from.value = todayStr(-29);
      els.to.value = todayStr(0);
    } else if (preset === "any") {
      els.from.value = "";
      els.to.value = "";
    }
    // "custom" keeps whatever the user picked.
    updateDateVisibility();
  }

  // Cached server data so language switching + table filtering never need network.
  var cachedListings = [];
  var cachedCount = 0;
  var cachedRuns = [];
  var scrapeBusyLabel = null;
  var notifyBusyLabel = null;

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.classList.remove("is-error", "is-ok");
    if (kind) els.status.classList.add(kind);
  }

  function setHistoryStatus(message, kind) {
    els.historyStatus.textContent = message || "";
    els.historyStatus.classList.remove("is-error", "is-ok");
    if (kind) els.historyStatus.classList.add(kind);
  }

  // --- Filters -> query string for GET /api/listings ---

  function getFilters() {
    return {
      q: els.q.value.trim(),
      location: els.location.value,
      city: els.city.disabled ? "" : els.city.value,
      category: els.category.value,
      maxPrice: els.maxPrice.value.trim(),
      from: els.from.value,
      to: els.to.value,
      newOnly: els.newOnly.checked ? "1" : "",
    };
  }

  function buildListingsUrl() {
    var f = getFilters();
    var params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.location) params.set("location", f.location);
    if (f.city) params.set("city", f.city);
    if (f.category) params.set("category", f.category);
    if (f.maxPrice) params.set("maxPrice", f.maxPrice);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.newOnly) params.set("newOnly", "1");
    var qs = params.toString();
    return "/api/listings" + (qs ? "?" + qs : "");
  }

  // --- Count line (always Latin digits) ---

  function updateCount(displayed, total) {
    var filtering = els.tableSearch.value.trim() !== "";
    if (filtering) {
      els.count.textContent = t("countFiltered", { n: fmtNum(displayed), t: fmtNum(total) });
      return;
    }
    if (total === 0) els.count.textContent = t("countZero");
    else if (total === 1) els.count.textContent = t("countOne");
    else els.count.textContent = t("countMany", { n: fmtNum(total) });
  }

  // --- Client-side filter of currently shown rows (no network) ---

  function getVisibleListings() {
    var query = els.tableSearch.value.trim().toLowerCase();
    if (!query) return cachedListings.slice();
    var normQuery = latinDigits(query);
    return cachedListings.filter(function (item) {
      var hay = [
        item.title || "",
        item.city || "",
        item.price || "",
        item.price_value != null ? String(item.price_value) : "",
      ]
        .join(" ")
        .toLowerCase();
      return latinDigits(hay).indexOf(normQuery) !== -1;
    });
  }

  function applyTableFilter() {
    var visible = getVisibleListings();
    renderTable(visible);
    updateCount(visible.length, cachedCount);
  }

  // --- Load and render listings: GET /api/listings ---

  async function loadListings() {
    setStatus(t("loading"));
    try {
      var res = await fetch(buildListingsUrl(), { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Server returned " + res.status);
      var data = await res.json();
      var listings = Array.isArray(data.listings) ? data.listings : [];
      var count = typeof data.count === "number" ? data.count : listings.length;
      cachedListings = listings;
      cachedCount = count;
      applyTableFilter();
      setStatus(count === 0 ? t("statusEmpty") : "", "");
    } catch (err) {
      cachedListings = [];
      cachedCount = 0;
      renderTable([]);
      updateCount(0, 0);
      setStatus(t("loadError"), "is-error");
    }
  }

  function renderTable(listings) {
    els.resultsBody.textContent = "";

    if (!listings.length) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 6;
      emptyCell.textContent = t("emptyTable");
      emptyRow.appendChild(emptyCell);
      els.resultsBody.appendChild(emptyRow);
      return;
    }

    listings.forEach(function (item) {
      var row = document.createElement("tr");
      if (item.is_new) row.classList.add("is-new");

      // Title cell: link + "New" badge + "Mark seen" button for new rows.
      var titleCell = document.createElement("td");
      titleCell.className = "title-cell";
      var link = document.createElement("a");
      link.href = item.url || "#";
      link.textContent = item.title || item.url || t("untitled");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      titleCell.appendChild(link);

      if (item.is_new) {
        var meta = document.createElement("div");
        meta.className = "cell-meta";
        var badge = document.createElement("span");
        badge.className = "badge-new";
        badge.textContent = t("badgeNew");
        meta.appendChild(badge);

        var seenBtn = document.createElement("button");
        seenBtn.type = "button";
        seenBtn.className = "btn-link";
        seenBtn.textContent = t("markSeenBtn");
        seenBtn.setAttribute("aria-label", t("markSeenAria", { t: item.title || item.url || item.id }));
        seenBtn.addEventListener("click", function () {
          markSeen([item.id], row, seenBtn);
        });
        meta.appendChild(seenBtn);
        titleCell.appendChild(meta);
      }
      row.appendChild(titleCell);

      // Remaining columns in the order the table header defines.
      var priceCell = document.createElement("td");
      priceCell.className = "num";
      priceCell.setAttribute("dir", "ltr");
      priceCell.textContent = text(item.price);
      row.appendChild(priceCell);

      var regionCell = document.createElement("td");
      regionCell.textContent = text(item.region);
      row.appendChild(regionCell);

      var cityCell = document.createElement("td");
      cityCell.textContent = text(item.city);
      row.appendChild(cityCell);

      var timeCell = document.createElement("td");
      timeCell.className = "num";
      timeCell.setAttribute("dir", "ltr");
      timeCell.textContent = formatTime(item.date);
      row.appendChild(timeCell);

      var categoryCell = document.createElement("td");
      categoryCell.textContent = text(item.category);
      row.appendChild(categoryCell);

      els.resultsBody.appendChild(row);
    });
  }

  // --- Mark listings as seen: PUT /api/listings/seen ---

  async function markSeen(ids, row, button) {
    if (!ids.length) return;
    button.disabled = true;
    button.textContent = t("savingBtn");
    try {
      var res = await fetch("/api/listings/seen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids }),
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      // Clear the highlight and the badge on success.
      row.classList.remove("is-new");
      var meta = row.querySelector(".cell-meta");
      if (meta) meta.remove();
    } catch (err) {
      button.disabled = false;
      button.textContent = t("markSeenBtn");
      setStatus(t("markSeenError"), "is-error");
    }
  }

  // --- Start a scrape: POST /api/scrape ---

  async function scrapeNow() {
    if (els.scrapeBtn.disabled) return;
    var activeKeyword = els.q.value.trim();
    scrapeBusyLabel = els.scrapeBtn.textContent;
    els.scrapeBtn.disabled = true;
    els.liveSearchBtn.disabled = true;
    els.scrapeBtn.textContent = t("scrapingBtn");
    setStatus(activeKeyword ? t("scrapeWithKeyword", { kw: activeKeyword }) : t("scrapeStarted"));
    try {
      // Use the search box text as the scrape keyword; empty box keeps server default.
      var keyword = els.q.value.trim();
      var res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyword ? { keyword: keyword } : {})
      });
      if (res.status === 409) {
        setStatus(t("scrapeBusy"), "is-error");
        await loadListings();
        await loadHistory();
        return;
      }
      if (!res.ok) throw new Error("Server returned " + res.status);
      await res.json().catch(function () {
        return {};
      });
      setStatus(t("scrapeRefreshing"), "is-ok");
      await loadListings();
      await loadHistory();
      setStatus(t("scrapeDone"), "is-ok");
    } catch (err) {
      setStatus(t("scrapeError"), "is-error");
    } finally {
      els.scrapeBtn.disabled = false;
      els.liveSearchBtn.disabled = false;
      els.scrapeBtn.textContent = scrapeBusyLabel || t("scrapeBtn");
      scrapeBusyLabel = null;
    }
  }

  // --- Last runs: GET /api/history ---

  async function loadHistory() {
    setHistoryStatus(t("historyLoading"));
    try {
      var res = await fetch("/api/history", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Server returned " + res.status);
      var data = await res.json();
      var runs = Array.isArray(data.runs) ? data.runs : [];
      cachedRuns = runs;
      renderHistory(cachedRuns);
      setHistoryStatus(runs.length ? "" : t("historyEmpty"));
    } catch (err) {
      cachedRuns = [];
      renderHistory([]);
      setHistoryStatus(t("historyError"), "is-error");
    }
  }

  function renderHistory(runs) {
    els.historyBody.textContent = "";
    if (!runs.length) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 5;
      emptyCell.textContent = t("historyEmptyTable");
      emptyRow.appendChild(emptyCell);
      els.historyBody.appendChild(emptyRow);
      return;
    }
    // Show the newest runs first, keep the table short.
    runs.slice(0, 10).forEach(function (run) {
      var row = document.createElement("tr");

      var started = document.createElement("td");
      started.className = "num";
      started.setAttribute("dir", "ltr");
      started.textContent = formatTime(run.started_at);
      row.appendChild(started);

      var finished = document.createElement("td");
      finished.className = "num";
      finished.setAttribute("dir", "ltr");
      finished.textContent = run.finished_at ? formatTime(run.finished_at) : t("running");
      row.appendChild(finished);

      var found = document.createElement("td");
      found.className = "num";
      found.setAttribute("dir", "ltr");
      found.textContent = run.found == null ? t("dash") : fmtNum(run.found);
      row.appendChild(found);

      var added = document.createElement("td");
      added.className = "num";
      added.setAttribute("dir", "ltr");
      added.textContent = run.added_new == null ? t("dash") : fmtNum(run.added_new);
      row.appendChild(added);

      var statusCell = document.createElement("td");
      statusCell.textContent = text(run.status);
      row.appendChild(statusCell);

      els.historyBody.appendChild(row);
    });
  }

  // --- Push notifications: GET /api/vapid-public-key + POST /api/subscribe ---
  // Uses the backend's service worker if one is already active. Does not
  // create its own worker file — if none is found it shows a plain message.

  async function enableNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus(t("notifyUnsupported"), "is-error");
      return;
    }

    var permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(t("notifyOff"), "is-error");
      return;
    }

    notifyBusyLabel = els.notifyBtn.textContent;
    els.notifyBtn.disabled = true;
    els.notifyBtn.textContent = t("enablingBtn");

    try {
      // Reuse the backend's worker if it is already registered.
      var registration = await navigator.serviceWorker.getRegistration();

      if (!registration) {
        // No worker found — the backend owns this file, so we stop here
        // instead of creating one.
        try {
          registration = await navigator.serviceWorker.ready;
        } catch (e) {
          registration = null;
        }
      }

      if (!registration) {
        setStatus(t("notifyNoWorker"), "is-error");
        return;
      }

      // Get the public key for this server.
      var keyRes = await fetch("/api/vapid-public-key", {
        headers: { Accept: "application/json" },
      });
      if (!keyRes.ok) throw new Error("Server returned " + keyRes.status);
      var keyData = await keyRes.json();
      if (!keyData.key) throw new Error(t("notifyMissingKey"));

      // Subscribe this browser for push messages.
      var subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.key),
      });

      // Send the subscription to the backend so it can push to us.
      var subRes = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription }),
      });
      if (!subRes.ok) throw new Error("Server returned " + subRes.status);

      setStatus(t("notifyOn"), "is-ok");
      els.notifyBtn.textContent = t("notifyOnBtn");
    } catch (err) {
      setStatus(t("notifyError"), "is-error");
      els.notifyBtn.disabled = false;
      els.notifyBtn.textContent = notifyBusyLabel || t("notifyBtn");
    } finally {
      notifyBusyLabel = null;
    }
  }

  // --- Language: single-dictionary switch, persisted, RTL/LTR ---

  function applyLang(next) {
    lang = next === "en" ? "en" : "ar";
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch (e) { /* ignore */ }

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = t("docTitle");
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("docDesc"));

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      if (key && I18N[lang][key] !== undefined) node.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-ph");
      if (key && I18N[lang][key] !== undefined) node.setAttribute("placeholder", t(key));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-aria");
      if (key && I18N[lang][key] !== undefined) node.setAttribute("aria-label", t(key));
    });

    els.tableSearch.setAttribute("aria-label", t("tableSearchLabel"));
    els.langToggle.textContent = t("langBtn");

    // Rebuild dynamic select labels for the new language, keeping values.
    refreshMetaTexts();

    // Restore button labels that may be mid-busy, then re-render cached data.
    if (!els.scrapeBtn.disabled) els.scrapeBtn.textContent = t("scrapeBtn");
    if (!els.notifyBtn.disabled && els.notifyBtn.textContent !== t("notifyOnBtn")) {
      els.notifyBtn.textContent = t("notifyBtn");
    }
    applyTableFilter();
    renderHistory(cachedRuns);
    // Keep helper statuses fresh without new network calls.
    if (!els.historyBody.children.length || (cachedRuns.length === 0 && !els.historyStatus.textContent)) {
      setHistoryStatus(cachedRuns.length ? "" : t("historyEmpty"));
    }
  }

  // --- Wire everything up ---

  var debouncedLoad = debounce(loadListings, 350);

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    loadListings();
  });

  // Main keyword box: Enter behaves exactly like the Search button (live scrape).
  els.q.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      scrapeNow();
    }
  });
  els.liveSearchBtn.addEventListener("click", scrapeNow);

  [els.city, els.category].forEach(function (input) {
    input.addEventListener("change", loadListings);
  });
  els.location.addEventListener("change", function () {
    buildCityOptions();
    loadListings();
  });
  els.timeframe.addEventListener("change", function () {
    applyTimeframe(els.timeframe.value);
    loadListings();
  });
  [els.from, els.to].forEach(function (input) {
    input.addEventListener("change", loadListings);
  });
  els.maxPrice.addEventListener("input", debouncedLoad);
  els.maxPrice.addEventListener("change", loadListings);
  els.newOnly.addEventListener("change", loadListings);

  // Instant client-side filter of the rows already on screen (no network).
  els.tableSearch.addEventListener("input", applyTableFilter);

  els.clearBtn.addEventListener("click", function () {
    els.form.reset();
    els.tableSearch.value = "";
    buildCityOptions();
    applyTimeframe(els.timeframe.value);
    loadListings();
  });

  els.scrapeBtn.addEventListener("click", scrapeNow);
  els.notifyBtn.addEventListener("click", enableNotifications);
  els.refreshHistoryBtn.addEventListener("click", loadHistory);
  els.langToggle.addEventListener("click", function () {
    applyLang(lang === "ar" ? "en" : "ar");
  });

  // First paint.
  applyLang(lang);
  updateDateVisibility();
  loadMeta().then(function () {
    // Meta arrived (or fallback kept): keep any preset dates in sync.
    applyTimeframe(els.timeframe.value);
    loadListings();
  });
  loadHistory();
})();
