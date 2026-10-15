// رادار حراج — vanilla JS front end (no build step).
//
// API used:
//   POST /api/search {q, ai, filters}         live Haraj search + ranked results
//   GET  /api/listings?...                    local filtering / paging / favorites / watch hits
//   PUT  /api/listings/:id {starred|hidden}   PUT /api/listings/seen {ids|all}
//   GET/POST/PATCH/DELETE /api/watches...     saved searches (alerts)
//   GET  /api/meta, /api/stats, /api/history
//   GET  /api/vapid-public-key, POST /api/subscribe, POST /api/push-test

(function () {
  "use strict";

  // ---------------------------------------------------------------- i18n
  var I18N = {
    ar: {
      brand: "رادار حراج", skip: "تخطَّ إلى النتائج", searchLabel: "ماذا تبحث عنه؟",
      searchPh: "ايفون 15 في جدة أقل من 3000", searchBtn: "ابحث في حراج", aiTitle: "فهم الطلب بالذكاء الاصطناعي",
      themeAria: "تبديل الوضع الليلي", close: "إغلاق",
      tabResults: "الإعلانات", tabWatches: "تنبيهاتي", tabStarred: "المفضلة", tabHistory: "السجل",
      filtersTitle: "تصفية", locationLabel: "المنطقة", cityLabel: "المدينة", categoryLabel: "القسم",
      priceLabel: "السعر (ريال)", minPh: "من", maxPh: "إلى", timeLabel: "تاريخ الإعلان",
      tAny: "أي وقت", tToday: "اليوم", t3: "آخر 3 أيام", t7: "آخر أسبوع", t30: "آخر شهر",
      hasPrice: "بسعر محدد فقط", hasImage: "بصور فقط", newOnly: "الجديد فقط", priceDrop: "نزل سعرها",
      clearFilters: "مسح التصفية", showResults: "عرض النتائج", filtersBtn: "تصفية",
      all: "الكل", allCities: "كل المدن", pickRegion: "اختر المنطقة أولاً", gcc: "دول الخليج", ksa: "مناطق السعودية",
      sortLabel: "الترتيب", sortAuto: "الأنسب", sortNewest: "الأحدث", sortCheap: "الأرخص", sortExpensive: "الأغلى",
      viewAria: "طريقة العرض", gridView: "بطاقات", listView: "قائمة",
      latest: "أحدث ما رصدناه", resultsFor: "نتائج «{q}»", watchResults: "تنبيه «{q}»",
      count: "{n}", countOf: "{shown} من {n}",
      examplesLead: "اكتب طلبك كما تقوله لصاحبك، ونفهم منه المدينة والسعر:",
      more: "عرض المزيد", moreHaraj: "جلب المزيد من حراج", seenAll: "اعتبر الكل مشاهَداً",
      watchThis: "نبّهني بالجديد", watchAdded: "أضفنا التنبيه. سنخبرك بكل إعلان جديد.",
      chipWord: "الكلمة", chipCity: "المدينة", chipMax: "حتى {n}", chipMin: "من {n}", chipRange: "{a} – {b}",
      chipSort: "الأرخص أولاً", chipAI: "فهمها الذكاء الاصطناعي",
      searching: "نبحث في حراج عن «{q}»…", liveDone: "جلبنا {found} من حراج: {fresh}.",
      liveNone: "حراج لم يُرجع نتائج لهذه الكلمة. جرّب كلمة أعم أو تهجئة أخرى.",
      liveFail: "تعذّر الوصول إلى حراج الآن، فعرضنا ما عندنا محفوظاً.",
      loadFail: "تعذّر تحميل الإعلانات. تأكد أن الخادم يعمل ثم حدّث الصفحة.",
      emptyTitle: "لا إعلانات بهذه الشروط", emptyText: "خفّف التصفية أو جرّب كلمة أخرى.",
      emptyStart: "ابدأ ببحث", emptyStartText: "اكتب ما تبحث عنه في الأعلى ونجلبه من حراج مباشرة.",
      soom: "على السوم", sar: "ريال", newBadge: "جديد", dropFrom: "نزل من {n}",
      star: "أضف للمفضلة", unstar: "أزل من المفضلة", hide: "إخفاء هذا الإعلان",
      hidden: "أخفينا الإعلان.", undo: "تراجع", seenDone: "تم. لا إعلانات جديدة الآن.",
      watchesTitle: "تنبيهاتي",
      watchesLead: "احفظ أي بحث، ونفحص حراج كل نصف ساعة. يصلك إشعار بالإعلانات الجديدة فقط، وإذا نزل سعر إعلان تتابعه.",
      watchQLabel: "نبّهني عن", watchPh: "مثال: كامري 2020 في الرياض بين 40 و 60 ألف", addWatch: "أضف التنبيه",
      savedSearches: "عمليات البحث المحفوظة", runAll: "افحص الكل الآن", running: "نفحص…",
      noWatches: "لا تنبيهات بعد. اكتب بحثك في الأعلى، أو اضغط «نبّهني بالجديد» بعد أي بحث.",
      wTotal: "رُصد {n}", wUnseen: "{n} جديد", wChecked: "آخر فحص {t}", wNever: "لم يُفحص بعد",
      wShow: "اعرض", wRun: "افحص الآن", wDelete: "احذف", wEnabled: "التنبيه مفعّل",
      wDeleted: "حذفنا التنبيه.", wRunDone: "فحصنا «{q}»: {fresh}.", wAll: "انتهى الفحص: {fresh}.",
      dOpen: "افتح في حراج للتواصل", dPrivacy: "أرقام التواصل مخفية. للتواصل مع البائع افتح الإعلان في حراج.",
      dLoading: "نجلب الصور والوصف من حراج…", dRemoved: "يبدو أن هذا الإعلان حُذف من حراج.", dFail: "تعذّر جلب التفاصيل الآن، فعرضنا المحفوظ.",
      dComments: "{n} رد", dStar: "★ في المفضلة", dUnstar: "☆ أضف للمفضلة",
      install: "ثبّت التطبيق", installed: "تم تثبيت التطبيق.", installIOS: "على الآيفون: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية».",
      wDuplicate: "هذا التنبيه محفوظ من قبل.", excludeLabel: "استبعد كلمات", excludePh: "مثال: مكسور، قطع", chipExclude: "بدون", wExclude: "بدون: {w}",
      more: "خيارات", hideAd: "أخفِ هذا الإعلان", hideSeller: "أخفِ كل إعلانات «{s}»",
      hideSellerWatch: "أخفِ «{s}» من هذا التنبيه فقط", sellerHidden: "أخفينا إعلانات «{s}».",
      blockedTitle: "البائعون المخفيون", blockedNone: "لم تُخفِ أي بائع.", blockedEverywhere: "في كل مكان", blockedIn: "في «{w}» فقط", unblock: "إظهار",
      quietLabel: "ساعات الهدوء", quietFrom: "من", quietTo: "إلى", quietHint: "لا تصلك إشعارات في هذه الساعات، ويصلك ملخص بما فاتك بعدها.", quietSaved: "تم حفظ ساعات الهدوء.",
      wBusy: "يوجد فحص يعمل الآن، انتظر قليلاً.", wErr: "تعذّر الفحص: {e}",
      pushTitle: "إشعارات هذا الجهاز", pushOffText: "فعّلها ليصلك التنبيه حتى والتطبيق مغلق.",
      pushOnText: "مفعّلة على هذا الجهاز. ستصلك الإعلانات الجديدة فور ظهورها.",
      pushInsecure: "المتصفح يسمح بالإشعارات فقط على https أو localhost. على الجوال افتح التطبيق عبر رابط https (انظر الملف README).",
      pushUnsupported: "هذا المتصفح لا يدعم الإشعارات. على الآيفون: أضف التطبيق للشاشة الرئيسية أولاً من زر المشاركة.",
      pushDenied: "الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم أعد المحاولة.",
      pushNoServer: "الخادم لم يجهّز مفاتيح الإشعارات.",
      pushOn: "فعّل الإشعارات", pushEnabling: "نفعّل…", pushEnabled: "مفعّلة ✓", pushTest: "أرسل إشعار تجربة",
      pushTestSent: "أرسلنا إشعار تجربة.", pushErr: "تعذّر تفعيل الإشعارات: {e}",
      starredTitle: "المفضلة", starredLead: "الإعلانات التي حفظتها بالنجمة. نتابع أسعارها كلما ظهرت في البحث.",
      noStarred: "لم تحفظ أي إعلان بعد. اضغط النجمة على أي إعلان ليظهر هنا.",
      historyTitle: "السجل", runsTitle: "آخر عمليات الجلب من حراج", refresh: "تحديث",
      sTotal: "إعلان محفوظ", sFresh: "لم تُشاهَد بعد", sStar: "في المفضلة", sDrops: "نزل سعرها", sWatches: "تنبيه",
      runOk: "{found} إعلان، {n} جديد", runErr: "خطأ", runRunning: "يعمل…", noRuns: "لا عمليات بعد.",
      today: "اليوم", yesterday: "أمس",
      appearance: "المظهر", colorLabel: "اللون", modeLabel: "الوضع", mAuto: "تلقائي", mLight: "فاتح", mDark: "داكن",
      cBlue: "أزرق", cViolet: "بنفسجي", cMaroon: "عنابي", cOrange: "برتقالي", cTeal: "فيروزي", cGraphite: "رمادي",
      checkEvery: "افحص حراج كل", m10: "10 دقائق", m15: "15 دقيقة", m30: "30 دقيقة", m60: "ساعة", m120: "ساعتين",
      schedNext: "الفحص القادم {t}", schedLast: "آخر فحص {t}", schedFixed: "الجدول مضبوط من HARAJ_CRON: {c}",
      radarNext: "الفحص القادم {t}", radarBusy: "يفحص الآن…", radarNone: "لا تنبيهات مفعّلة",
      intervalSaved: "تم. سنفحص كل {n}.",
      howTitle: "كيف تعمل التنبيهات؟",
      how1: "إذا حفظت بحث، نحفظ الإعلانات الموجودة حالياً عشان ما توصلك تنبيهات عن القديم.",
      how2: "وقت الفحص، نبحث عن الجديد ونكمل حتى 3 صفحات إذا لسه الإعلانات جديدة.",
      how3: "أي إعلان جديد يناسب مدينتك وسعرك يوصلك عنه تنبيه، وحتى لو نزل سعر إعلان تتابعه. وتقدر تشوف كل التنبيهات في «تنبيهاتي».",
      how4: "الفحص يصير على جهازك، فلازم تخلي نافذة «تشغيل رادار حراج» مفتوحة والجهاز شغال وما يدخل وضع السكون.",
      examples: ["ايفون 15 برو في الرياض أقل من 3500", "كامري 2020 بين 40 و 60 ألف", "كنب مستعمل في جدة", "بلايستيشن 5 تحت 1500", "مكيف سبليت في الدمام"]
    },
    en: {
      brand: "Haraj Radar", skip: "Skip to results", searchLabel: "What are you looking for?",
      searchPh: "iPhone 15 in Jeddah under 3000", searchBtn: "Search Haraj", aiTitle: "Understand the request with AI",
      themeAria: "Toggle dark mode", close: "Close",
      tabResults: "Listings", tabWatches: "My alerts", tabStarred: "Saved", tabHistory: "History",
      filtersTitle: "Filters", locationLabel: "Region", cityLabel: "City", categoryLabel: "Section",
      priceLabel: "Price (SAR)", minPh: "Min", maxPh: "Max", timeLabel: "Posted",
      tAny: "Any time", tToday: "Today", t3: "Last 3 days", t7: "Last week", t30: "Last month",
      hasPrice: "With a price only", hasImage: "With photos only", newOnly: "New only", priceDrop: "Price dropped",
      clearFilters: "Clear filters", showResults: "Show results", filtersBtn: "Filters",
      all: "All", allCities: "All cities", pickRegion: "Pick a region first", gcc: "Gulf countries", ksa: "Saudi regions",
      sortLabel: "Sort", sortAuto: "Best match", sortNewest: "Newest", sortCheap: "Cheapest", sortExpensive: "Most expensive",
      viewAria: "View", gridView: "Cards", listView: "List",
      latest: "Latest finds", resultsFor: "Results for “{q}”", watchResults: "Alert “{q}”",
      count: "{n}", countOf: "{shown} of {n}",
      examplesLead: "Type it the way you'd say it — we pick out the city and price:",
      more: "Show more", moreHaraj: "Fetch more from Haraj", seenAll: "Mark all as seen",
      watchThis: "Alert me to new ones", watchAdded: "Alert added. We'll tell you about every new listing.",
      chipWord: "Keyword", chipCity: "City", chipMax: "up to {n}", chipMin: "from {n}", chipRange: "{a} – {b}",
      chipSort: "Cheapest first", chipAI: "Understood by AI",
      searching: "Searching Haraj for “{q}”…", liveDone: "Fetched {found} from Haraj: {fresh}.",
      liveNone: "Haraj returned nothing for this word. Try a broader word or another spelling.",
      liveFail: "Couldn't reach Haraj right now, so these are saved results.",
      loadFail: "Couldn't load listings. Make sure the server is running, then refresh.",
      emptyTitle: "No listings match", emptyText: "Loosen the filters or try another word.",
      emptyStart: "Start with a search", emptyStartText: "Type what you want above and we'll fetch it from Haraj.",
      soom: "Open offer", sar: "SAR", newBadge: "New", dropFrom: "Down from {n}",
      star: "Save", unstar: "Remove from saved", hide: "Hide this listing",
      hidden: "Listing hidden.", undo: "Undo", seenDone: "Done. Nothing new right now.",
      watchesTitle: "My alerts",
      watchesLead: "Save any search and we check Haraj every 30 minutes. You only get notified about new listings — and when a tracked price drops.",
      watchQLabel: "Alert me about", watchPh: "e.g. Camry 2020 in Riyadh between 40 and 60 thousand", addWatch: "Add alert",
      savedSearches: "Saved searches", runAll: "Check all now", running: "Checking…",
      noWatches: "No alerts yet. Type a search above, or press “Alert me to new ones” after any search.",
      wTotal: "{n} tracked", wUnseen: "{n} new", wChecked: "Checked {t}", wNever: "Not checked yet",
      wShow: "Show", wRun: "Check now", wDelete: "Delete", wEnabled: "Alert on",
      wDeleted: "Alert deleted.", wRunDone: "Checked “{q}”: {fresh}.", wAll: "Check finished: {fresh}.",
      dOpen: "Open on Haraj to contact", dPrivacy: "Phone numbers are hidden. To contact the seller, open the listing on Haraj.",
      dLoading: "Fetching photos and description from Haraj…", dRemoved: "This listing seems to have been removed from Haraj.", dFail: "Couldn't fetch details right now; showing what we saved.",
      dComments: "{n} replies", dStar: "★ Saved", dUnstar: "☆ Save",
      install: "Install app", installed: "App installed.", installIOS: "On iPhone: tap Share in Safari, then “Add to Home Screen”.",
      wDuplicate: "This alert already exists.", excludeLabel: "Exclude words", excludePh: "e.g. broken, parts", chipExclude: "without", wExclude: "without: {w}",
      more: "Options", hideAd: "Hide this listing", hideSeller: "Hide all listings from “{s}”",
      hideSellerWatch: "Hide “{s}” from this alert only", sellerHidden: "Listings from “{s}” hidden.",
      blockedTitle: "Hidden sellers", blockedNone: "You haven't hidden any seller.", blockedEverywhere: "everywhere", blockedIn: "in “{w}” only", unblock: "Show again",
      quietLabel: "Quiet hours", quietFrom: "from", quietTo: "to", quietHint: "No notifications during these hours; you get a summary of what you missed afterwards.", quietSaved: "Quiet hours saved.",
      wBusy: "A check is already running, wait a moment.", wErr: "Check failed: {e}",
      pushTitle: "Notifications on this device", pushOffText: "Turn them on to get alerts even when the app is closed.",
      pushOnText: "On for this device. New listings reach you as soon as they appear.",
      pushInsecure: "Browsers only allow notifications on https or localhost. On your phone, open the app through an https link (see README).",
      pushUnsupported: "This browser doesn't support notifications. On iPhone, add the app to the Home Screen first.",
      pushDenied: "Notifications are blocked for this site. Allow them in browser settings and try again.",
      pushNoServer: "The server has no push keys set up.",
      pushOn: "Turn on notifications", pushEnabling: "Turning on…", pushEnabled: "On ✓", pushTest: "Send a test",
      pushTestSent: "Test notification sent.", pushErr: "Couldn't turn on notifications: {e}",
      starredTitle: "Saved", starredLead: "Listings you starred. We keep tracking their prices whenever they show up.",
      noStarred: "Nothing saved yet. Tap the star on any listing to keep it here.",
      historyTitle: "History", runsTitle: "Recent fetches from Haraj", refresh: "Refresh",
      sTotal: "listings stored", sFresh: "not seen yet", sStar: "saved", sDrops: "price drops", sWatches: "alerts",
      runOk: "{found} listings, {n} new", runErr: "Error", runRunning: "Running…", noRuns: "No runs yet.",
      today: "Today", yesterday: "Yesterday",
      appearance: "Appearance", colorLabel: "Color", modeLabel: "Mode", mAuto: "Auto", mLight: "Light", mDark: "Dark",
      cBlue: "Blue", cViolet: "Violet", cMaroon: "Maroon", cOrange: "Orange", cTeal: "Teal", cGraphite: "Graphite",
      checkEvery: "Check Haraj every", m10: "10 minutes", m15: "15 minutes", m30: "30 minutes", m60: "hour", m120: "2 hours",
      schedNext: "Next check {t}", schedLast: "Last check {t}", schedFixed: "Schedule fixed by HARAJ_CRON: {c}",
      radarNext: "Next check {t}", radarBusy: "Checking now…", radarNone: "No active alerts",
      intervalSaved: "Done. We'll check every {n}.",
      howTitle: "How do alerts work?",
      how1: "When you save a search, the listings already there are recorded silently so you're not alerted about old ones.",
      how2: "At each check we ask Haraj for the newest listings of every active search. If they're all new, we keep going up to 3 pages so nothing slips through.",
      how3: "Every new listing that matches the city and price sends a notification and shows in the “My alerts” counter. A price drop on a tracked listing notifies you too.",
      how4: "Checks run in the server on your computer, so keep the “تشغيل رادار حراج” window open and the computer awake.",
      examples: ["iPhone 15 Pro in Riyadh under 3500", "Camry 2020 between 40 and 60 thousand", "used sofa in Jeddah", "PS5 under 1500", "split AC in Dammam"]
    }
  };

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  // Browser-only build (web-app/): local-api.js answers every /api route on
  // this device — no server, no console window.
  var WEB = !!window.LocalAPI;
  if (WEB) {
    Object.assign(I18N.ar, {
      pushTitle: "التنبيهات على هذا الجهاز",
      pushOffText: "فعّلها عشان يوصلك تنبيه بالإعلانات الجديدة على هذا الجهاز.",
      pushOnText: "مفعّلة. يوصلك التنبيه والتطبيق مفتوح أو مصغّر.",
      pushUnsupported: "هذا المتصفح لا يدعم التنبيهات. على الآيفون: أضف التطبيق للشاشة الرئيسية أولاً من زر المشاركة.",
      pushInsecure: "التنبيهات تحتاج فتح التطبيق من رابطه على الإنترنت (https).",
      how4: "الفحص يصير في التطبيق نفسه بدون أي سيرفر: يشتغل والتطبيق مفتوح أو مصغّر. إذا قفلته تماماً يوقف الفحص، وأول ما تفتحه يفحص ويعرض لك الجديد. وعلى أندرويد والكمبيوتر قد يفحص المتصفح أحياناً والتطبيق مقفول، لكن بدون موعد مضمون."
    });
    Object.assign(I18N.en, {
      pushTitle: "Alerts on this device",
      pushOffText: "Turn them on to get alerts about new listings on this device.",
      pushOnText: "On. Alerts arrive while the app is open or minimised.",
      pushInsecure: "Alerts need the app opened from its https link.",
      how4: "Checks run inside the app itself with no server: while it is open or minimised. Fully closed, checks stop and run again as soon as you open it. On Android and desktop the browser may also check now and then while closed, without a guaranteed time."
    });
  }

  var lang = store.get("hr-lang") === "en" ? "en" : "ar";
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) != null ? I18N[lang][key] : (I18N.ar[key] != null ? I18N.ar[key] : key);
    if (vars && typeof s === "string") Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return new Intl.NumberFormat("en-US").format(Number(n)); }
  // "21 إعلاناً" / "إعلانان" / "لا إعلانات" — Arabic number agreement.
  function ads(n) {
    n = Number(n) || 0;
    if (lang !== "ar") return n === 0 ? "no listings" : n === 1 ? "1 listing" : fmt(n) + " listings";
    if (n === 0) return "لا إعلانات";
    if (n === 1) return "إعلان واحد";
    if (n === 2) return "إعلانان";
    if (n <= 10) return fmt(n) + " إعلانات";
    return fmt(n) + " إعلاناً";
  }
  function newAds(n) {
    n = Number(n) || 0;
    if (lang !== "ar") return n === 0 ? "no new listings" : n === 1 ? "1 new listing" : fmt(n) + " new listings";
    if (n === 0) return "لا يوجد إعلان جديد";
    if (n === 1) return "إعلان جديد واحد";
    if (n === 2) return "إعلانان جديدان";
    if (n <= 10) return fmt(n) + " إعلانات جديدة";
    return fmt(n) + " إعلاناً جديداً";
  }
  function latin(s) { return String(s).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); }
  function debounce(fn, ms) { var tm; return function () { var a = arguments; clearTimeout(tm); tm = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  function api(path, opts) {
    opts = opts || {};
    if (WEB) return window.LocalAPI.request(opts.method || "GET", path, opts.body);
    var init = { method: opts.method || "GET", headers: { Accept: "application/json" } };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || data.reason || ("HTTP " + res.status)); e.status = res.status; e.data = data; throw e; }
        return data;
      });
    });
  }

  var rtf = null;
  function relDays(n) {
    try {
      if (!rtf || rtf.lang !== lang) { rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en", { numeric: "auto" }); rtf.lang = lang; }
      if (Math.abs(n) >= 30) return rtf.format(Math.round(n / 30), "month");
      if (Math.abs(n) >= 7) return rtf.format(Math.round(n / 7), "week");
      return rtf.format(n, "day");
    } catch (e) { return String(-n); }
  }
  function ago(iso) {
    if (!iso) return "";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    if (isNaN(d)) return latin(iso);
    if (iso.length === 10) {
      var today = new Date(); today.setHours(12, 0, 0, 0);
      var diff = Math.round((d - today) / 864e5);
      if (diff === 0) return t("today");
      if (diff === -1) return t("yesterday");
      return relDays(diff);
    }
    var mins = Math.round((d - Date.now()) / 6e4);
    try {
      var f = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en", { numeric: "auto" });
      if (Math.abs(mins) < 60) return f.format(mins, "minute");
      if (Math.abs(mins) < 1440) return f.format(Math.round(mins / 60), "hour");
      return f.format(Math.round(mins / 1440), "day");
    } catch (e) { return iso.slice(0, 16).replace("T", " "); }
  }
  function isoDay(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  var toastTimer;
  function toast(msg, action) {
    var n = $("toast");
    n.textContent = msg;
    if (action) {
      var b = el("button", "btn btn-ghost", action.label);
      b.style.cssText = "min-height:30px;margin-inline-start:10px;color:inherit;text-decoration:underline";
      b.onclick = function () { n.hidden = true; action.fn(); };
      n.appendChild(b);
    }
    n.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { n.hidden = true; }, action ? 6000 : 3800);
  }

  // ---------------------------------------------------------------- elements & state
  var els = {
    form: $("searchForm"), q: $("q"), searchBtn: $("searchBtn"), aiToggle: $("aiToggle"),
    filters: $("filters"), filterForm: $("filterForm"), location: $("location"), city: $("city"), category: $("category"),
    minPrice: $("minPrice"), maxPrice: $("maxPrice"), timeframe: $("timeframe"), exclude: $("exclude"),
    quietOn: $("quietOn"), quietFrom: $("quietFrom"), quietTo: $("quietTo"), blockedList: $("blockedList"),
    hasPrice: $("hasPrice"), hasImage: $("hasImage"), newOnly: $("newOnly"), priceDrop: $("priceDrop"),
    sort: $("sort"), grid: $("grid"), status: $("status"), title: $("resultsTitle"), count: $("resultCount"),
    queryBar: $("queryBar"), chips: $("chips"), watchThis: $("watchThis"), examples: $("examples"),
    moreBtn: $("moreBtn"), moreHarajBtn: $("moreHarajBtn"), seenAllBtn: $("seenAllBtn"),
    openFilters: $("openFilters"), closeFilters: $("closeFilters"), applyFilters: $("applyFilters"),
    clearFilters: $("clearFilters"), scrim: $("scrim"), filterCount: $("filterCount"),
    watchForm: $("watchForm"), watchQ: $("watchQ"), watchList: $("watchList"), watchBadge: $("watchBadge"),
    runAllBtn: $("runAllBtn"), pushCard: $("pushCard"), pushText: $("pushText"), pushBtn: $("pushBtn"), pushTestBtn: $("pushTestBtn"),
    starGrid: $("starGrid"), stats: $("stats"), runList: $("runList"), refreshHistory: $("refreshHistory"),
    appearanceBtn: $("appearanceBtn"), appearanceMenu: $("appearanceMenu"), radarPill: $("radarPill"), radarText: $("radarText"),
    checkEvery: $("checkEvery"), scheduleText: $("scheduleText"),
    langBtn: $("langBtn"), installBtn: $("installBtn"), tpl: $("cardTpl")
  };

  var meta = { locations: [], citiesByRegion: {}, categories: [], ai: false };
  var S = {
    mode: "latest",       // latest | search | watch
    rawQ: "",             // what the user typed
    keyword: "",          // parsed keyword used for local text search
    parsed: null, live: null,
    liveIds: [], harajPage: 1,
    watch: null,
    listings: [], total: 0, offset: 0,
    autoFields: {},       // panel fields filled from the sentence (cleared on next search)
    busy: false,
    viewMode: store.get("hr-view") === "list" ? "list" : "grid",
    ai: store.get("hr-ai") === "1"
  };
  var PAGE = 24;

  // ---------------------------------------------------------------- filters panel
  function opt(sel, value, label) { var o = el("option", null, label); o.value = value; sel.appendChild(o); return o; }
  function locName(l) { return lang === "ar" ? l.ar : l.en; }
  function regionKeyOfCity(city) {
    var keys = Object.keys(meta.citiesByRegion);
    for (var i = 0; i < keys.length; i++) if (meta.citiesByRegion[keys[i]].indexOf(city) !== -1) return keys[i];
    return "";
  }

  function buildLocation() {
    var cur = els.location.value;
    els.location.textContent = "";
    opt(els.location, "", t("all"));
    var ksa = el("optgroup"); ksa.label = t("ksa");
    var gcc = el("optgroup"); gcc.label = t("gcc");
    meta.locations.forEach(function (l) { var o = el("option", null, locName(l)); o.value = l.key; (l.type === "gcc" ? gcc : ksa).appendChild(o); });
    els.location.appendChild(ksa);
    if (gcc.children.length) els.location.appendChild(gcc);
    els.location.value = cur;
  }
  function buildCity(keep) {
    var cur = keep != null ? keep : els.city.value;
    els.city.textContent = "";
    var key = els.location.value;
    var list = meta.citiesByRegion[key] || [];
    if (!key) {
      // No region: offer the cities that actually have listings.
      opt(els.city, "", t("allCities"));
      (meta.topCities || []).forEach(function (c) { opt(els.city, c, c); });
    } else if (!list.length) {
      opt(els.city, "", t("pickRegion"));
    } else {
      opt(els.city, "", t("allCities"));
      list.forEach(function (c) { opt(els.city, c, c); });
    }
    if (cur && ![].some.call(els.city.options, function (o) { return o.value === cur; })) opt(els.city, cur, cur);
    els.city.value = cur || "";
    els.city.disabled = els.city.options.length <= 1;
  }
  function buildCategory() {
    var cur = els.category.value;
    els.category.textContent = "";
    opt(els.category, "", t("all"));
    meta.categories.forEach(function (c) { opt(els.category, c, c); });
    els.category.value = cur;
  }

  function panelFilters() {
    var f = {
      location: els.location.value, city: els.city.value, category: els.category.value,
      minPrice: els.minPrice.value.trim(), maxPrice: els.maxPrice.value.trim(), exclude: els.exclude.value.trim(),
      hasPrice: els.hasPrice.checked ? "1" : "", hasImage: els.hasImage.checked ? "1" : "",
      newOnly: els.newOnly.checked ? "1" : "", priceDrop: els.priceDrop.checked ? "1" : "",
      sort: els.sort.value
    };
    var tf = els.timeframe.value;
    if (tf === "today") f.from = isoDay(0);
    else if (tf !== "any") f.from = isoDay(-Number(tf) + 1);
    return f;
  }
  function activeFilterCount() {
    var f = panelFilters(), n = 0;
    ["location", "city", "category", "minPrice", "maxPrice", "exclude", "hasPrice", "hasImage", "newOnly", "priceDrop", "from"].forEach(function (k) { if (f[k]) n++; });
    return n;
  }
  function updateFilterBadge() {
    var n = activeFilterCount();
    els.filterCount.hidden = !n;
    els.filterCount.textContent = n;
  }

  function setAuto(field, value) {
    // Only fill fields the user hasn't set themselves.
    if (value == null || value === "") return;
    if (field === "city") {
      if (els.city.value && !S.autoFields.city) return;
      var rk = regionKeyOfCity(value);
      if (rk && els.location.value !== rk && (!els.location.value || S.autoFields.location)) {
        els.location.value = rk; S.autoFields.location = true;
      }
      buildCity(value);
      S.autoFields.city = true;
    } else if (field === "exclude") {
      if (els.exclude.value && !S.autoFields.exclude) return;
      els.exclude.value = [].concat(value).join("، "); S.autoFields.exclude = true;
    } else {
      var inp = field === "minPrice" ? els.minPrice : els.maxPrice;
      if (inp.value && !S.autoFields[field]) return;
      inp.value = value; S.autoFields[field] = true;
    }
  }
  function clearAuto() {
    if (S.autoFields.location) els.location.value = "";
    if (S.autoFields.city || S.autoFields.location) buildCity("");
    if (S.autoFields.minPrice) els.minPrice.value = "";
    if (S.autoFields.maxPrice) els.maxPrice.value = "";
    if (S.autoFields.sort) els.sort.value = "";
    if (S.autoFields.exclude) els.exclude.value = "";
    S.autoFields = {};
  }

  // ---------------------------------------------------------------- cards
  function priceTag(tag, item) {
    var txt = tag.querySelector(".tag-text");
    txt.textContent = "";
    if (item.price_value) {
      txt.appendChild(document.createTextNode(fmt(item.price_value) + " "));
      txt.appendChild(el("small", null, t("sar")));
      tag.classList.remove("is-soom");
    } else {
      txt.textContent = t("soom");
      tag.classList.add("is-soom");
    }
  }

  function renderCard(item) {
    var node = els.tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    if (item.is_new) node.classList.add("is-new");
    var media = node.querySelector(".card-media");
    var img = media.querySelector("img");
    var titleA = node.querySelector(".card-title");
    media.href = titleA.href = item.url;
    media.setAttribute("aria-hidden", "true");
    media.tabIndex = -1;
    titleA.textContent = item.title || item.url;
    titleA.title = item.title || "";
    node.querySelector(".media-fallback").textContent = ((item.category || item.title || "؟").replace(/^حراج\s+/, "").trim()[0] || "؟");
    if (item.thumb) {
      img.src = item.thumb;
      img.onerror = function () {
        // Haraj's CDN serves 400x400 and 140x140; try the small one before giving up.
        if (/-400x400\.webp$/.test(img.src)) { img.src = img.src.replace(/-400x400\.webp$/, "-140x140.webp"); return; }
        img.hidden = true; media.classList.add("no-img");
      };
    } else { img.hidden = true; media.classList.add("no-img"); }
    priceTag(node.querySelector(".tag"), item);
    node.querySelector(".badge-new").textContent = t("newBadge");

    if (item.price_drop && item.prev_price_value) {
      var drop = node.querySelector(".drop");
      drop.hidden = false;
      drop.textContent = "↓ " + t("dropFrom", { n: fmt(item.prev_price_value) });
    }
    var place = [item.city, item.district].filter(Boolean).join("، ");
    node.querySelector(".m-place").textContent = place;
    node.querySelector(".m-time").textContent = ago(item.date || item.first_seen);
    node.querySelector(".m-cat").textContent = item.category || item.subcategory || "";
    node.querySelector(".m-seller").textContent = item.seller || "";

    var star = node.querySelector(".star");
    function paintStar() {
      star.setAttribute("aria-pressed", item.starred ? "true" : "false");
      star.setAttribute("aria-label", item.starred ? t("unstar") : t("star"));
      star.title = star.getAttribute("aria-label");
    }
    paintStar();
    star.onclick = function () {
      item.starred = !item.starred; paintStar();
      api("/api/listings/" + item.id, { method: "PUT", body: { starred: item.starred } })
        .catch(function () { item.starred = !item.starred; paintStar(); });
    };
    var moreBtn = node.querySelector(".hide");
    moreBtn.setAttribute("aria-label", t("more")); moreBtn.title = t("more");
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.onclick = function (e) {
      e.stopPropagation();
      var opts = [{ label: t("hideAd"), fn: function () { hideAd(item, node); } }];
      if (item.seller) {
        opts.push({ label: t("hideSeller", { s: item.seller }), fn: function () { hideSeller(item.seller, 0); } });
        if (S.mode === "watch" && S.watch) opts.push({ label: t("hideSellerWatch", { s: item.seller }), fn: function () { hideSeller(item.seller, S.watch.id); } });
      }
      openCardMenu(moreBtn, opts);
    };
    // Opening an ad counts as seeing it.
    function seen() {
      if (!node.classList.contains("is-new")) return;
      node.classList.remove("is-new"); item.is_new = false;
      api("/api/listings/seen", { method: "PUT", body: { ids: [item.id] } }).catch(function () {});
    }
    // Plain click opens the in-app details; Ctrl/middle-click still opens Haraj.
    function openHere(e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) { seen(); return; }
      e.preventDefault(); seen();
      openDetails(item, function () { paintStar(); });
    }
    media.addEventListener("click", openHere);
    titleA.addEventListener("click", openHere);
    titleA.addEventListener("auxclick", seen);
    return node;
  }

  // ---------------------------------------------------------------- details dialog
  var D = {
    dlg: $("details"), track: $("dTrack"), counter: $("dCounter"), prev: $("dPrev"), next: $("dNext"),
    tag: $("dTag"), title: $("dTitle"), drop: $("dDrop"), place: $("dPlace"), time: $("dTime"), seller: $("dSeller"),
    tags: $("dTags"), status: $("dStatus"), desc: $("dDesc"), open: $("dOpen"), star: $("dStar"), close: $("dClose")
  };
  var dItem = null, dOnChange = null, dSeq = 0;
  function dPaintStar() { D.star.textContent = dItem && dItem.starred ? t("dStar") : t("dUnstar"); }
  function dSetImages(urls, fallbackChar) {
    D.track.textContent = "";
    if (!urls.length) { var f = el("span", "media-fallback", fallbackChar); D.track.appendChild(f); }
    urls.forEach(function (u, i) {
      var im = el("img"); im.alt = ""; im.referrerPolicy = "no-referrer"; im.loading = i < 2 ? "eager" : "lazy"; im.src = u;
      im.onerror = function () { im.remove(); dCount(); };
      D.track.appendChild(im);
    });
    D.track.scrollLeft = 0;
    dCount();
  }
  function dIndex() { var w = D.track.clientWidth || 1; return Math.round(Math.abs(D.track.scrollLeft) / w); }
  function dCount() {
    var n = D.track.querySelectorAll("img").length;
    D.counter.hidden = D.prev.hidden = D.next.hidden = n < 2;
    D.counter.textContent = (dIndex() + 1) + " / " + n;
  }
  function dGo(step) {
    var w = D.track.clientWidth, dir = document.documentElement.dir === "rtl" ? -1 : 1;
    D.track.scrollBy({ left: step * w * dir, behavior: "smooth" });
  }
  D.track.addEventListener("scroll", debounce(dCount, 80));
  D.prev.addEventListener("click", function () { dGo(-1); });
  D.next.addEventListener("click", function () { dGo(1); });
  D.close.addEventListener("click", function () { D.dlg.close(); });
  D.dlg.addEventListener("click", function (e) { if (e.target === D.dlg) D.dlg.close(); });
  D.dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") dGo(document.documentElement.dir === "rtl" ? 1 : -1);
    if (e.key === "ArrowRight") dGo(document.documentElement.dir === "rtl" ? -1 : 1);
  });
  D.star.addEventListener("click", function () {
    if (!dItem) return;
    dItem.starred = !dItem.starred; dPaintStar();
    api("/api/listings/" + dItem.id, { method: "PUT", body: { starred: dItem.starred } }).then(function () { if (dOnChange) dOnChange(); });
  });

  function openDetails(item, onChange) {
    var seq = ++dSeq;
    dItem = item; dOnChange = onChange;
    priceTag(D.tag, item);
    D.title.textContent = item.title || "";
    D.drop.hidden = !(item.price_drop && item.prev_price_value);
    if (!D.drop.hidden) D.drop.textContent = "↓ " + t("dropFrom", { n: fmt(item.prev_price_value) });
    D.place.textContent = [item.city, item.district].filter(Boolean).join("، ");
    D.time.textContent = ago(item.date || item.first_seen);
    D.seller.textContent = item.seller || "";
    D.tags.textContent = "";
    D.open.href = item.url;
    D.status.hidden = false; D.status.textContent = t("dLoading");
    D.desc.textContent = item.description || ""; D.desc.classList.add("is-loading");
    dPaintStar();
    var fb = ((item.category || item.title || "؟").replace(/^حراج\s+/, "").trim()[0] || "؟");
    dSetImages(item.thumb ? [item.thumb] : [], fb);
    if (!D.dlg.open) D.dlg.showModal();
    D.close.focus();
    api("/api/listings/" + item.id + "/details").then(function (d) {
      if (seq !== dSeq) return;
      D.desc.classList.remove("is-loading");
      D.desc.textContent = d.description || "";
      if (d.images && d.images.length) dSetImages(d.images, fb);
      if (d.district && !item.district) D.place.textContent = [item.city, d.district].filter(Boolean).join("، ");
      (d.tags || []).forEach(function (tg) { D.tags.appendChild(el("span", null, tg)); });
      if (d.comments) D.tags.appendChild(el("span", null, t("dComments", { n: fmt(d.comments) })));
      if (d.listing) { priceTag(D.tag, d.listing); }
      D.status.hidden = !(d.removed || d.error);
      D.status.textContent = d.removed ? t("dRemoved") : d.error ? t("dFail") : "";
    }).catch(function () {
      if (seq !== dSeq) return;
      D.desc.classList.remove("is-loading");
      D.status.textContent = t("dFail");
    });
  }

  function hideAd(item, node) {
    node.hidden = true;
    api("/api/listings/" + item.id, { method: "PUT", body: { hidden: true } }).then(function () {
      S.total = Math.max(0, S.total - 1); updateCount();
      toast(t("hidden"), { label: t("undo"), fn: function () {
        api("/api/listings/" + item.id, { method: "PUT", body: { hidden: false } }).then(function () { node.hidden = false; S.total++; updateCount(); });
      } });
    }).catch(function () { node.hidden = false; });
  }
  function hideSeller(seller, watchId) {
    api("/api/blocked", { method: "POST", body: { seller: seller, watchId: watchId } }).then(function () {
      toast(t("sellerHidden", { s: seller }), { label: t("undo"), fn: function () {
        api("/api/blocked", { method: "DELETE", body: { seller: seller, watchId: watchId } }).then(function () { refresh(); });
      } });
      refresh();
    });
  }
  var cardMenu = null;
  function closeCardMenu() { if (cardMenu) { cardMenu.remove(); cardMenu = null; } }
  function openCardMenu(anchor, opts) {
    closeCardMenu();
    var m = el("div", "card-menu"); m.setAttribute("role", "menu");
    opts.forEach(function (o) {
      var b = el("button", null, o.label); b.type = "button"; b.setAttribute("role", "menuitem");
      b.onclick = function (e) { e.stopPropagation(); closeCardMenu(); o.fn(); };
      m.appendChild(b);
    });
    (anchor.closest(".card") || anchor.parentElement).appendChild(m);
    cardMenu = m;
    m.querySelector("button").focus();
  }
  document.addEventListener("click", closeCardMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCardMenu(); });

  function skeletons(container, n) {
    container.textContent = "";
    for (var i = 0; i < n; i++) {
      var c = el("div", "card skeleton");
      c.appendChild(el("div", "card-media"));
      var b = el("div", "card-body");
      b.appendChild(el("div", "sk")); var s2 = el("div", "sk"); s2.style.width = "60%"; b.appendChild(s2);
      c.appendChild(b);
      container.appendChild(c);
    }
  }

  function emptyState(container, title, text, withExamples) {
    var box = el("div", "empty");
    box.appendChild(el("h3", null, title));
    box.appendChild(el("p", null, text));
    if (withExamples) {
      var b = el("button", "btn btn-soft", t("clearFilters"));
      b.onclick = function () { resetFilters(); refresh(); };
      box.appendChild(b);
    }
    container.appendChild(box);
  }

  function renderGrid(append) {
    if (!append) els.grid.textContent = "";
    els.grid.classList.toggle("is-list", S.viewMode === "list");
    var frag = document.createDocumentFragment();
    var start = append ? S.listings.length - S.lastBatch : 0;
    S.listings.slice(start).forEach(function (it) { frag.appendChild(renderCard(it)); });
    els.grid.appendChild(frag);
    if (!S.listings.length) {
      if (S.mode === "latest" && !activeFilterCount()) emptyState(els.grid, t("emptyStart"), t("emptyStartText"));
      else emptyState(els.grid, t("emptyTitle"), t("emptyText"), activeFilterCount() > 0);
    }
    els.moreBtn.hidden = S.listings.length >= S.total;
    els.moreHarajBtn.hidden = !(S.mode === "search" && S.live && S.live.hasMore);
    els.seenAllBtn.hidden = !S.listings.some(function (l) { return l.is_new; });
    updateCount();
  }

  function updateCount() {
    els.count.textContent = S.listings.length < S.total
      ? t("countOf", { shown: fmt(S.listings.length), n: ads(S.total) })
      : t("count", { n: ads(S.total) });
  }

  function setStatus(msg, isError) {
    els.status.hidden = !msg;
    els.status.textContent = msg || "";
    els.status.classList.toggle("is-error", !!isError);
  }

  function setTitle() {
    if (S.mode === "search") els.title.textContent = t("resultsFor", { q: S.rawQ });
    else if (S.mode === "watch" && S.watch) els.title.textContent = t("watchResults", { q: S.watch.label || S.watch.q });
    else els.title.textContent = t("latest");
    els.examples.hidden = S.mode !== "latest";
  }

  // ---------------------------------------------------------------- chips (what we understood)
  function renderChips() {
    els.chips.textContent = "";
    var show = S.mode === "search" && S.parsed;
    els.queryBar.hidden = !show;
    if (!show) return;
    var p = S.parsed;
    function chip(label, value, onRemove) {
      var c = el("span", "chip");
      if (label) { c.appendChild(document.createTextNode(label + ": ")); }
      c.appendChild(el("b", null, value));
      if (onRemove) {
        var x = el("button", null, "×"); x.type = "button"; x.setAttribute("aria-label", t("close") + " " + value);
        x.onclick = onRemove; c.appendChild(x);
      }
      els.chips.appendChild(c);
    }
    if (p.keyword) chip(t("chipWord"), p.keyword);
    var city = els.city.value;
    if (city) chip(t("chipCity"), city, function () {
      if (S.autoFields.location) els.location.value = "";
      delete S.autoFields.location; delete S.autoFields.city;
      buildCity(""); refresh(); renderChips();
    });
    var mn = els.minPrice.value, mx = els.maxPrice.value;
    if (mn || mx) {
      var v = mn && mx ? t("chipRange", { a: fmt(mn), b: fmt(mx) }) : mx ? t("chipMax", { n: fmt(mx) }) : t("chipMin", { n: fmt(mn) });
      chip(null, v + " " + t("sar"), function () {
        els.minPrice.value = ""; els.maxPrice.value = "";
        delete S.autoFields.minPrice; delete S.autoFields.maxPrice;
        refresh(); renderChips();
      });
    }
    if (els.exclude.value) chip(t("chipExclude"), els.exclude.value, function () {
      els.exclude.value = ""; delete S.autoFields.exclude; refresh(); renderChips();
    });
    if (els.sort.value === "price_asc" && S.autoFields.sort) chip(null, t("chipSort"));
    if (p.source === "ai") els.chips.appendChild(el("span", "chip-note", t("chipAI")));
  }

  // ---------------------------------------------------------------- loading
  function listingParams(extra) {
    var f = panelFilters();
    var p = new URLSearchParams();
    if (S.mode === "search" && S.keyword) p.set("q", S.keyword);
    if (S.mode === "search" && S.liveIds.length) p.set("includeIds", S.liveIds.slice(0, 300).join(","));
    if (S.mode === "watch" && S.watch) p.set("watch", S.watch.id);
    Object.keys(f).forEach(function (k) { if (f[k]) p.set(k, f[k]); });
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return p;
  }

  var reqSeq = 0;
  function refresh(append) {
    var seq = ++reqSeq;
    updateFilterBadge();
    if (!append) { S.offset = 0; skeletons(els.grid, 8); }
    els.grid.setAttribute("aria-busy", "true");
    var p = listingParams({ limit: PAGE, offset: append ? S.listings.length : 0 });
    return api("/api/listings?" + p.toString()).then(function (data) {
      if (seq !== reqSeq) return;
      S.total = data.total || 0;
      S.lastBatch = (data.listings || []).length;
      S.listings = append ? S.listings.concat(data.listings || []) : (data.listings || []);
      setTitle(); renderGrid(append);
    }).catch(function () {
      if (seq !== reqSeq) return;
      setStatus(t("loadFail"), true);
      if (!append) { S.listings = []; S.total = 0; renderGrid(); }
    }).finally(function () { if (seq === reqSeq) els.grid.setAttribute("aria-busy", "false"); });
  }

  function search(q, opts) {
    opts = opts || {};
    q = (q || "").trim();
    if (!q) { goLatest(); return; }
    showTab("results");
    if (!opts.more) {
      clearAuto();
      S.mode = "search"; S.rawQ = q; S.watch = null; S.harajPage = 1; S.liveIds = [];
      setTitle();
      skeletons(els.grid, 8);
      els.queryBar.hidden = true;
      els.moreBtn.hidden = els.moreHarajBtn.hidden = true;
      els.count.textContent = "";
    }
    setStatus(t("searching", { q: q }));
    els.searchBtn.disabled = true;
    els.moreHarajBtn.disabled = true;
    var seq = ++reqSeq;
    var f = panelFilters();
    return api("/api/search", {
      method: "POST",
      body: { q: q, ai: S.ai && meta.ai, harajPage: S.harajPage, pages: 2, filters: Object.assign(f, { includeIds: S.liveIds, limit: opts.more ? Math.min(S.listings.length + PAGE, 100) : PAGE }) }
    }).then(function (data) {
      if (seq !== reqSeq) return;
      S.parsed = data.parsed; S.keyword = data.parsed.keyword || "";
      S.live = data.live;
      if (data.live && data.live.ids) S.liveIds = S.liveIds.concat(data.live.ids);
      if (data.filters) {
        setAuto("city", data.filters.city);
        setAuto("minPrice", data.filters.minPrice);
        setAuto("maxPrice", data.filters.maxPrice);
        if (data.filters.exclude && data.filters.exclude.length) setAuto("exclude", data.filters.exclude);
        if (data.parsed && data.parsed.sort && !els.sort.value) { els.sort.value = data.parsed.sort; S.autoFields.sort = true; }
      }
      S.listings = data.listings || []; S.total = data.total || 0;
      setTitle(); renderChips(); renderGrid(); updateFilterBadge();
      var live = data.live;
      if (live && live.error) setStatus(t("liveFail"), true);
      else if (live && !live.found) setStatus(t("liveNone"));
      else if (live) setStatus(t("liveDone", { found: ads(live.found), fresh: newAds(live.added) }));
      else setStatus("");
      try { history.replaceState(null, "", "?q=" + encodeURIComponent(q)); } catch (e) { /* ignore */ }
    }).catch(function (e) {
      if (seq !== reqSeq) return;
      setStatus(t("loadFail") + " (" + e.message + ")", true);
      S.listings = []; S.total = 0; renderGrid();
    }).finally(function () {
      els.searchBtn.disabled = false; els.moreHarajBtn.disabled = false;
    });
  }

  function goLatest() {
    clearAuto();
    S.mode = "latest"; S.rawQ = ""; S.keyword = ""; S.parsed = null; S.watch = null; S.live = null; S.liveIds = [];
    els.q.value = "";
    setStatus(""); renderChips(); setTitle();
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
    return refresh();
  }

  function showWatchResults(w) {
    clearAuto();
    S.mode = "watch"; S.watch = w; S.parsed = null; S.rawQ = "";
    els.q.value = "";
    showTab("results"); setStatus(""); renderChips(); setTitle();
    return refresh().then(function () {
      if (w.unseen) api("/api/watches/" + w.id + "/seen", { method: "PUT" }).then(loadWatchBadge).catch(function () {});
    });
  }

  function resetFilters() {
    els.filterForm.reset();
    S.autoFields = {};
    buildCity("");
    updateFilterBadge();
  }

  // ---------------------------------------------------------------- watches
  function loadWatchBadge() {
    return api("/api/watches").then(function (d) {
      var unseen = (d.watches || []).reduce(function (a, w) { return a + (w.enabled ? w.unseen : 0); }, 0);
      activeWatches = (d.watches || []).filter(function (w) { return w.enabled; }).length;
      paintSchedule();
      els.watchBadge.hidden = !unseen; els.watchBadge.textContent = unseen > 99 ? "99+" : unseen;
      return d.watches || [];
    }).catch(function () { return []; });
  }

  function loadWatches() {
    return loadWatchBadge().then(renderWatches);
  }

  function renderWatches(list) {
    els.watchList.textContent = "";
    if (!list.length) { var li = el("li", "empty"); li.appendChild(el("p", null, t("noWatches"))); els.watchList.appendChild(li); return; }
    list.forEach(function (w) {
      var li = el("li", "watch" + (w.enabled ? "" : " is-off"));
      var info = el("div");
      var name = el("p", "watch-name", w.label || w.q);
      if (w.unseen) name.appendChild(el("span", "count-pill", t("wUnseen", { n: fmt(w.unseen) })));
      info.appendChild(name);
      var facts = el("p", "watch-facts");
      if (w.label && w.label !== w.q) facts.appendChild(el("span", "fact", "🔎 " + w.q));
      if (w.city) facts.appendChild(el("span", "fact", "📍 " + w.city));
      if (w.min_price != null || w.max_price != null) {
        var v = w.min_price != null && w.max_price != null ? t("chipRange", { a: fmt(w.min_price), b: fmt(w.max_price) })
          : w.max_price != null ? t("chipMax", { n: fmt(w.max_price) }) : t("chipMin", { n: fmt(w.min_price) });
        facts.appendChild(el("span", "fact", v + " " + t("sar")));
      }
      if (w.exclude) facts.appendChild(el("span", "fact", t("wExclude", { w: w.exclude })));
      facts.appendChild(el("span", "fact", t("wTotal", { n: ads(w.total) })));
      facts.appendChild(el("span", "fact", w.last_run_at ? t("wChecked", { t: ago(w.last_run_at) }) : t("wNever")));
      info.appendChild(facts);
      li.appendChild(info);

      var acts = el("div", "watch-actions");
      var show = el("button", "btn btn-soft", t("wShow")); show.type = "button";
      show.onclick = function () { showWatchResults(w); };
      var run = el("button", "btn btn-ghost", t("wRun")); run.type = "button";
      run.onclick = function () {
        run.disabled = true; run.textContent = t("running");
        api("/api/watches/" + w.id + "/run", { method: "POST" }).then(function (r) {
          toast(t("wRunDone", { q: w.label || w.q, fresh: newAds(r.fresh) })); loadWatches();
        }).catch(function (e) { toast(t("wErr", { e: e.message })); run.disabled = false; run.textContent = t("wRun"); });
      };
      var sw = el("label", "switch"); sw.title = t("wEnabled");
      var cb = el("input"); cb.type = "checkbox"; cb.checked = w.enabled; cb.setAttribute("aria-label", t("wEnabled") + ": " + (w.label || w.q));
      cb.onchange = function () { api("/api/watches/" + w.id, { method: "PATCH", body: { enabled: cb.checked } }).then(loadWatches); };
      sw.appendChild(cb); sw.appendChild(el("span"));
      var del = el("button", "btn btn-ghost btn-danger", t("wDelete")); del.type = "button";
      del.onclick = function () { api("/api/watches/" + w.id, { method: "DELETE" }).then(function () { toast(t("wDeleted")); loadWatches(); }); };
      [show, run, sw, del].forEach(function (n) { acts.appendChild(n); });
      li.appendChild(acts);
      els.watchList.appendChild(li);
    });
  }

  function addWatch(q, extra) {
    var body = Object.assign({ q: q, ai: S.ai && meta.ai }, extra || {});
    return api("/api/watches", { method: "POST", body: body }).then(function () {
      toast(t("watchAdded"));
      loadWatches();
      setTimeout(loadWatches, 4000); // baseline finishes in the background
    }).catch(function (e) {
      if (e.status === 409) { toast(t("wDuplicate")); loadWatches(); return; }
      toast(t("wErr", { e: e.message }));
    });
  }

  // ---------------------------------------------------------------- push notifications
  var swReg = null;
  function registerSW() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register("./sw.js").then(function (r) { swReg = r; return r; }).catch(function () { return null; });
  }
  function pushState() {
    if (!window.isSecureContext) return Promise.resolve("insecure");
    if (WEB) {
      if (!("Notification" in window)) return Promise.resolve("unsupported");
      return Promise.resolve({ granted: "on", denied: "denied" }[Notification.permission] || "off");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return Promise.resolve("unsupported");
    if (Notification.permission === "denied") return Promise.resolve("denied");
    return (swReg ? Promise.resolve(swReg) : navigator.serviceWorker.ready).then(function (r) {
      return r.pushManager.getSubscription().then(function (s) { return s ? "on" : "off"; });
    }).catch(function () { return "off"; });
  }
  function paintPush() {
    return pushState().then(function (st) {
      els.pushCard.classList.toggle("is-on", st === "on");
      els.pushBtn.hidden = st === "on" || st === "insecure" || st === "unsupported";
      els.pushTestBtn.hidden = st !== "on";
      els.pushBtn.disabled = false;
      els.pushBtn.textContent = t("pushOn");
      els.pushText.textContent = {
        on: t("pushOnText"), off: t("pushOffText"), insecure: t("pushInsecure"), unsupported: t("pushUnsupported"), denied: t("pushDenied")
      }[st];
    });
  }
  function b64ToBytes(s) {
    var pad = "=".repeat((4 - (s.length % 4)) % 4);
    var raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function enablePush() {
    els.pushBtn.disabled = true; els.pushBtn.textContent = t("pushEnabling");
    if (WEB) {
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") throw new Error(t("pushDenied"));
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        return window.LocalAPI.registerPeriodic();
      }).then(function () { toast(t("pushEnabled")); })
        .catch(function (e) { toast(t("pushErr", { e: e.message })); })
        .finally(paintPush);
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error(t("pushDenied"));
      return Promise.all([swReg ? swReg : navigator.serviceWorker.ready, api("/api/vapid-public-key")]);
    }).then(function (r) {
      if (!r[1].key) throw new Error(t("pushNoServer"));
      return r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(r[1].key) });
    }).then(function (sub) {
      return api("/api/subscribe", { method: "POST", body: { subscription: sub.toJSON() } });
    }).then(function () {
      toast(t("pushEnabled"));
    }).catch(function (e) {
      toast(t("pushErr", { e: e.message }));
    }).finally(paintPush);
  }

  // ---------------------------------------------------------------- starred & history
  function loadStarred() {
    skeletons(els.starGrid, 4);
    api("/api/listings?starred=1&limit=100&sort=added").then(function (d) {
      els.starGrid.textContent = "";
      els.starGrid.classList.toggle("is-list", S.viewMode === "list");
      if (!d.listings.length) { emptyState(els.starGrid, t("starredTitle"), t("noStarred")); return; }
      d.listings.forEach(function (it) { els.starGrid.appendChild(renderCard(it)); });
    }).catch(function () { els.starGrid.textContent = ""; emptyState(els.starGrid, t("loadFail"), ""); });
  }

  function loadHistory() {
    api("/api/stats").then(function (s) {
      els.stats.textContent = "";
      [["total", "sTotal"], ["fresh", "sFresh"], ["starred", "sStar"], ["drops", "sDrops"], ["watches", "sWatches"]].forEach(function (p) {
        var c = el("div", "stat"); c.appendChild(el("strong", "num", fmt(s[p[0]] || 0))); c.appendChild(el("span", null, t(p[1])));
        els.stats.appendChild(c);
      });
    }).catch(function () {});
    api("/api/history").then(function (d) {
      els.runList.textContent = "";
      if (!d.runs.length) { els.runList.appendChild(el("li", "empty", t("noRuns"))); return; }
      d.runs.forEach(function (r) {
        var err = /^error/.test(r.status || "");
        var li = el("li", "run" + (err ? " is-error" : ""));
        li.appendChild(el("span", "run-kw", r.keyword || "—"));
        li.appendChild(el("span", "run-res", !r.finished_at ? t("runRunning") : err ? t("runErr") : t("runOk", { found: fmt(r.found), n: fmt(r.added_new) })));
        var when = el("span", "run-when", ago(r.started_at)); when.title = r.started_at;
        li.appendChild(when);
        if (err) { var m = el("span", "run-when", r.status.replace(/^error:\s*/, "")); li.appendChild(m); }
        els.runList.appendChild(li);
      });
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- tabs / sheet / theme / lang
  var currentTab = "results";
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll(".tab").forEach(function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.dataset.view !== name; v.classList.toggle("is-active", v.dataset.view === name); });
    if (name === "watches") { loadWatches(); paintPush(); loadSchedule(); loadBlocked(); }
    if (name === "starred") loadStarred();
    if (name === "history") loadHistory();
    closeSheet();
  }
  function openSheet() { els.filters.classList.add("is-open"); els.scrim.hidden = false; els.closeFilters.focus(); }
  function closeSheet() {
    if (!els.filters.classList.contains("is-open")) return;
    els.filters.classList.remove("is-open"); els.scrim.hidden = true; els.openFilters.focus();
  }

  function applyTheme(th) {
    if (th === "dark" || th === "light") document.documentElement.setAttribute("data-theme", th);
    // "auto" (or nothing) follows the system setting.
    else document.documentElement.removeAttribute("data-theme");
  }

  function applyLang(next) {
    lang = next === "en" ? "en" : "ar";
    store.set("hr-lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = t("brand");
    document.querySelectorAll("[data-i18n]").forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (n) { n.placeholder = t(n.getAttribute("data-i18n-ph")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (n) { n.setAttribute("aria-label", t(n.getAttribute("data-i18n-aria"))); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (n) { n.title = t(n.getAttribute("data-i18n-title")); });
    els.langBtn.textContent = lang === "ar" ? "EN" : "ع";
    buildLocation(); buildCity(); buildCategory();
    var ex = els.examples.querySelector(".example-list"); ex.textContent = "";
    t("examples").forEach(function (s) {
      var b = el("button", "example", s); b.type = "button";
      b.onclick = function () { els.q.value = s; search(s); };
      ex.appendChild(b);
    });
    setTitle(); renderChips(); paintSchedule();
    if (S.listings.length || S.total === 0) renderGrid();
    if (currentTab !== "results") showTab(currentTab);
  }

  // ---------------------------------------------------------------- wiring
  els.form.addEventListener("submit", function (e) { e.preventDefault(); els.q.blur(); search(els.q.value); });
  els.q.addEventListener("search", function () { if (!els.q.value && S.mode === "search") goLatest(); });

  var refreshSoon = debounce(function () { refresh(); renderChips(); }, 450);
  els.location.addEventListener("change", function () { delete S.autoFields.location; delete S.autoFields.city; buildCity(""); refresh(); renderChips(); });
  els.city.addEventListener("change", function () { delete S.autoFields.city; refresh(); renderChips(); });
  [els.category, els.timeframe, els.hasPrice, els.hasImage, els.newOnly, els.priceDrop].forEach(function (n) { n.addEventListener("change", function () { refresh(); }); });
  [els.minPrice, els.maxPrice, els.exclude].forEach(function (n) { n.addEventListener("input", function () { delete S.autoFields[n.id]; refreshSoon(); }); });
  els.sort.addEventListener("change", function () { delete S.autoFields.sort; refresh(); renderChips(); });
  els.clearFilters.addEventListener("click", function () { resetFilters(); refresh(); renderChips(); });
  els.openFilters.addEventListener("click", openSheet);
  els.closeFilters.addEventListener("click", closeSheet);
  els.applyFilters.addEventListener("click", closeSheet);
  els.scrim.addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSheet();
    if (e.key === "/" && document.activeElement && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); els.q.focus(); }
  });

  els.moreBtn.addEventListener("click", function () { refresh(true); });
  els.moreHarajBtn.addEventListener("click", function () { S.harajPage += 2; search(S.rawQ, { more: true }); });
  els.seenAllBtn.addEventListener("click", function () {
    var ids = S.listings.filter(function (l) { return l.is_new; }).map(function (l) { return l.id; });
    var body = S.mode === "latest" && !activeFilterCount() ? { all: true } : { ids: ids };
    api("/api/listings/seen", { method: "PUT", body: body }).then(function () {
      S.listings.forEach(function (l) { l.is_new = false; });
      els.grid.querySelectorAll(".card.is-new").forEach(function (c) { c.classList.remove("is-new"); });
      els.seenAllBtn.hidden = true; toast(t("seenDone"));
    });
  });
  els.watchThis.addEventListener("click", function () {
    if (!S.rawQ) return;
    addWatch(S.keyword || S.rawQ, {
      label: S.rawQ, city: els.city.value || null,
      minPrice: els.minPrice.value || null, maxPrice: els.maxPrice.value || null,
      exclude: els.exclude.value || null
    }).then(function () { showTab("watches"); });
  });
  els.watchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = els.watchQ.value.trim();
    if (!q) { els.watchQ.focus(); return; }
    addWatch(q).then(function () { els.watchQ.value = ""; });
  });
  els.runAllBtn.addEventListener("click", function () {
    els.runAllBtn.disabled = true; els.runAllBtn.textContent = t("running");
    api("/api/watches/run-all", { method: "POST" }).then(function (r) { toast(t("wAll", { fresh: newAds(r.fresh || 0) })); })
      .catch(function (e) { toast(e.status === 409 ? t("wBusy") : t("wErr", { e: e.message })); })
      .finally(function () { els.runAllBtn.disabled = false; els.runAllBtn.textContent = t("runAll"); loadWatches(); loadSchedule(); });
  });
  els.pushBtn.addEventListener("click", enablePush);
  els.pushTestBtn.addEventListener("click", function () { api("/api/push-test", { method: "POST" }).then(function () { toast(t("pushTestSent")); }); });
  els.refreshHistory.addEventListener("click", loadHistory);

  document.querySelectorAll(".tab").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
  document.querySelectorAll("[data-view-mode]").forEach(function (b) {
    b.classList.toggle("is-active", b.dataset.viewMode === S.viewMode);
    b.addEventListener("click", function () {
      S.viewMode = b.dataset.viewMode; store.set("hr-view", S.viewMode);
      document.querySelectorAll("[data-view-mode]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      els.grid.classList.toggle("is-list", S.viewMode === "list");
      els.starGrid.classList.toggle("is-list", S.viewMode === "list");
    });
  });
  // Appearance menu: accent color + light/dark/auto.
  function paintAppearance() {
    var acc = store.get("hr-accent") || "blue";
    var th = store.get("hr-theme") || "auto";
    document.querySelectorAll("[data-accent]").forEach(function (b) { if (b.tagName === "BUTTON") b.setAttribute("aria-checked", b.dataset.accent === acc ? "true" : "false"); });
    document.querySelectorAll("[data-theme-opt]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.themeOpt === th ? "true" : "false"); });
  }
  function applyAccent(a) {
    if (a && a !== "blue") document.documentElement.setAttribute("data-accent", a);
    else document.documentElement.removeAttribute("data-accent");
  }
  function toggleMenu(open) {
    var show = open != null ? open : els.appearanceMenu.hidden;
    els.appearanceMenu.hidden = !show;
    els.appearanceBtn.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) paintAppearance();
  }
  els.appearanceBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(); });
  els.appearanceMenu.addEventListener("click", function (e) {
    e.stopPropagation();
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.accent) { store.set("hr-accent", b.dataset.accent); applyAccent(b.dataset.accent); }
    if (b.dataset.themeOpt) { store.set("hr-theme", b.dataset.themeOpt); applyTheme(b.dataset.themeOpt); }
    paintAppearance();
  });
  document.addEventListener("click", function () { if (!els.appearanceMenu.hidden) toggleMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !els.appearanceMenu.hidden) { toggleMenu(false); els.appearanceBtn.focus(); } });

  // Alert schedule: interval select, next/last check, header status pill.
  var sched = null, activeWatches = 0;
  function clock(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function intervalLabel(n) { return t("m" + n); }
  function paintSchedule() {
    if (!sched) return;
    els.checkEvery.disabled = !sched.everyMinutes;
    if (sched.everyMinutes) els.checkEvery.value = String(sched.everyMinutes);
    var parts = [];
    if (sched.fixedCron) parts.push(t("schedFixed", { c: sched.fixedCron }));
    else if (sched.nextCheckAt) parts.push(t("schedNext", { t: clock(sched.nextCheckAt) }));
    if (sched.lastCheckAt) parts.push(t("schedLast", { t: ago(sched.lastCheckAt) }));
    els.scheduleText.textContent = parts.join(" — ");
    els.radarPill.hidden = false;
    els.radarPill.classList.toggle("is-busy", !!sched.running);
    els.radarPill.classList.toggle("is-off", !activeWatches);
    els.radarText.textContent = sched.running ? t("radarBusy") : !activeWatches ? t("radarNone")
      : sched.nextCheckAt ? t("radarNext", { t: clock(sched.nextCheckAt) }) : t("schedFixed", { c: sched.fixedCron || "" });
  }
  var quiet = null;
  function hourLabel(h) { return String(h).padStart(2, "0") + ":00"; }
  (function fillHours() {
    for (var h = 0; h < 24; h++) { opt(els.quietFrom, String(h), hourLabel(h)); opt(els.quietTo, String(h), hourLabel(h)); }
  })();
  function paintQuiet() {
    if (!quiet) return;
    els.quietOn.checked = quiet.on;
    els.quietFrom.value = String(quiet.from); els.quietTo.value = String(quiet.to);
    els.quietFrom.disabled = els.quietTo.disabled = !quiet.on;
  }
  function saveQuiet() {
    api("/api/settings", { method: "PUT", body: { quiet: { on: els.quietOn.checked, from: Number(els.quietFrom.value), to: Number(els.quietTo.value) } } })
      .then(function (d) { quiet = d.quiet; paintQuiet(); toast(t("quietSaved")); })
      .catch(function (e) { toast(t("wErr", { e: e.message })); });
  }
  [els.quietOn, els.quietFrom, els.quietTo].forEach(function (n) { n.addEventListener("change", saveQuiet); });

  function loadBlocked() {
    return api("/api/blocked").then(function (d) {
      els.blockedList.textContent = "";
      if (!d.sellers.length) { els.blockedList.appendChild(el("li", "muted", t("blockedNone"))); return; }
      d.sellers.forEach(function (b) {
        var li = el("li");
        li.appendChild(el("span", null, b.seller));
        li.appendChild(el("small", null, b.watchId ? t("blockedIn", { w: b.watchLabel || "" }) : t("blockedEverywhere")));
        var u = el("button", null, t("unblock")); u.type = "button";
        u.onclick = function () { api("/api/blocked", { method: "DELETE", body: { seller: b.seller, watchId: b.watchId } }).then(loadBlocked); };
        li.appendChild(u);
        els.blockedList.appendChild(li);
      });
    }).catch(function () {});
  }

  function loadSchedule() {
    return api("/api/settings").then(function (d) { sched = d.schedule; quiet = d.quiet; paintSchedule(); paintQuiet(); }).catch(function () {});
  }
  els.checkEvery.addEventListener("change", function () {
    var n = Number(els.checkEvery.value);
    api("/api/settings", { method: "PUT", body: { checkEvery: n } }).then(function (d) {
      sched = d.schedule; paintSchedule(); toast(t("intervalSaved", { n: intervalLabel(n) }));
    }).catch(function (e) { toast(t("wErr", { e: e.message })); loadSchedule(); });
  });
  els.radarPill.addEventListener("click", function () { showTab("watches"); });

  els.langBtn.addEventListener("click", function () { applyLang(lang === "ar" ? "en" : "ar"); });
  els.aiToggle.addEventListener("click", function () {
    S.ai = !S.ai; store.set("hr-ai", S.ai ? "1" : "0");
    els.aiToggle.setAttribute("aria-pressed", S.ai ? "true" : "false");
  });

  // ---------------------------------------------------------------- install as app
  var installEvt = null;
  var isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); installEvt = e; els.installBtn.hidden = false;
  });
  window.addEventListener("appinstalled", function () { els.installBtn.hidden = true; installEvt = null; toast(t("installed")); });
  if (isIOS && !isStandalone) els.installBtn.hidden = false;
  els.installBtn.addEventListener("click", function () {
    if (installEvt) {
      installEvt.prompt();
      installEvt.userChoice.finally(function () { installEvt = null; els.installBtn.hidden = true; });
    } else if (isIOS) {
      toast(t("installIOS"));
    }
  });

  // ---------------------------------------------------------------- boot
  applyTheme(store.get("hr-theme"));
  applyAccent(store.get("hr-accent"));
  applyLang(lang);
  registerSW();
  setInterval(function () { loadWatchBadge(); loadSchedule(); }, 60000);
  if (WEB) {
    // Alerts as system notifications through the service worker.
    window.LocalAPI.setNotifier(function (n) {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.showNotification(n.title, { body: n.body || "", icon: "./icons/icon-192.png", badge: "./icons/badge-72.png", tag: n.tag, dir: "rtl", lang: "ar", data: { url: n.url || "./" } });
      }).catch(function () { try { new Notification(n.title, { body: n.body || "", icon: "./icons/icon-192.png" }); } catch (e) { /* ignore */ } });
    });
    window.LocalAPI.startScheduler(function () {
      loadWatchBadge(); loadSchedule();
      if (S.mode === "watch") refresh();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") window.LocalAPI.reload().then(function () { loadWatchBadge(); loadSchedule(); });
    });
  }
  loadSchedule();

  api("/api/meta").then(function (m) { meta = m; }).catch(function () {}).then(function () {
    buildLocation(); buildCity(); buildCategory();
    els.aiToggle.hidden = !meta.ai;
    els.aiToggle.setAttribute("aria-pressed", S.ai ? "true" : "false");
    var params = new URLSearchParams(location.search);
    var tab = (location.hash || "").replace("#", "");
    loadWatchBadge().then(function (watches) {
      var wid = params.get("watch");
      if (wid) {
        var w = watches.filter(function (x) { return String(x.id) === wid; })[0];
        if (w) return showWatchResults(w);
      }
      if (params.get("q")) { els.q.value = params.get("q"); return search(params.get("q")); }
      if (/^(watches|starred|history)$/.test(tab)) { refresh(); return showTab(tab); }
      return goLatest();
    });
  });
})();
