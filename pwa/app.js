// بحث حراج — منطق الواجهة
// يتصل بالـ Backend على localhost:8000 ويعرض النتائج بالعربية

const API_URL = 'http://localhost:8000/api/search';
const STORAGE_KEY = 'haraj-last-search';

const form = document.getElementById('searchForm');
const queryInput = document.getElementById('queryInput');
const cityInput = document.getElementById('cityInput');
const priceInput = document.getElementById('priceInput');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const searchBtn = document.getElementById('searchBtn');
const clearFiltersBtn = document.getElementById('clearFilters');

const statusText = document.getElementById('statusText');
const errorText = document.getElementById('errorText');
const progressWrap = document.getElementById('progressWrap');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');
const cardsView = document.getElementById('cardsView');
const tableView = document.getElementById('tableView');
const resultsBody = document.getElementById('resultsBody');
const viewCardsBtn = document.getElementById('viewCards');
const viewTableBtn = document.getElementById('viewTable');

const installBtn = document.getElementById('installBtn');
const installHint = document.getElementById('installHint');
let deferredPrompt = null;

// ---------- التثبيت: Add to Home Screen ----------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
  installHint.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) {
    installHint.hidden = false;
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  installHint.hidden = true;
  setStatus('تم التثبيت. تلقاه الآن مع تطبيقات جهازك.');
});

// لو المتصفح يدعم التثبيت اليدوي (iOS غالباً) نظهر التلميح بهدوء
if (window.matchMedia('(display-mode: standalone)').matches) {
  installBtn.hidden = true;
  installHint.hidden = true;
}

// ---------- تبديل العرض ----------
function setView(which) {
  const isCards = which === 'cards';
  cardsView.hidden = !isCards;
  tableView.hidden = isCards;
  viewCardsBtn.classList.toggle('is-active', isCards);
  viewTableBtn.classList.toggle('is-active', !isCards);
}

viewCardsBtn.addEventListener('click', () => setView('cards'));
viewTableBtn.addEventListener('click', () => setView('table'));

// ---------- الحالة ----------
function setStatus(msg) {
  statusText.textContent = msg;
}

function setLoading(isLoading, msg) {
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? 'جاري البحث…' : 'بحث';
  progressWrap.hidden = !isLoading;
  if (msg) setStatus(msg);
}

function showError(msg) {
  if (!msg) {
    errorText.hidden = true;
    errorText.textContent = '';
    return;
  }
  errorText.hidden = false;
  errorText.textContent = msg;
}

function currentMode() {
  const checked = form.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : 'rule';
}

// ---------- حفظ / استرجاع آخر بحث ----------
function saveLastSearch(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* التخزين غير متاح، نكمل عادي */
  }
}

function restoreLastSearch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.q === 'string') queryInput.value = data.q;
    if (typeof data.city === 'string') cityInput.value = data.city;
    if (data.maxPrice) priceInput.value = data.maxPrice;
    if (typeof data.from === 'string') dateFrom.value = data.from;
    if (typeof data.to === 'string') dateTo.value = data.to;
    if (data.mode) {
      const radio = form.querySelector(`input[name="mode"][value="${data.mode}"]`);
      if (radio) radio.checked = true;
    }
    if (data.q) setStatus('رجّعنا لك آخر بحث. اضغط بحث لو حاب تعيده.');
  } catch {
    /* تجاهل */
  }
}

clearFiltersBtn.addEventListener('click', () => {
  cityInput.value = '';
  priceInput.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  cityInput.focus();
});

// ---------- أدوات عرض ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatPrice(p) {
  if (p === null || p === undefined || p === '') return 'غير محدد';
  const n = Number(String(p).replace(/[^0-9]/g, ''));
  if (Number.isFinite(n) && String(p).match(/[0-9]/)) return n.toLocaleString('ar-EG') + ' ر.س';
  return String(p);
}

function normalizeListings(payload) {
  // يقبل أكثر من شكل رد من الـ Backend عشان لا نكسر لو تغيرت التسمية
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.listings)) return payload.listings;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

// ---------- العرض ----------
function render(listings) {
  cardsView.innerHTML = '';
  resultsBody.innerHTML = '';

  if (!listings.length) {
    emptyState.hidden = false;
    cardsView.innerHTML = '';
    resultCount.textContent = 'لا توجد نتائج';
    return;
  }

  emptyState.hidden = true;
  resultCount.textContent = listings.length === 1 ? 'نتيجة واحدة' : `${listings.length} نتائج`;

  const fragCards = document.createDocumentFragment();
  const fragRows = document.createDocumentFragment();

  listings.forEach((item) => {
    const title = item.title || 'بدون عنوان';
    const price = formatPrice(item.price);
    const city = item.city || 'غير محددة';
    const date = item.date || 'غير محدد';
    const desc = item.description || '—';
    const url = item.url || '#';
    const safeUrl = typeof url === 'string' && url.startsWith('http') ? url : '#';

    // بطاقة
    const card = document.createElement('article');
    card.className = 'ad-card';
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <div class="meta">
        <span class="tag price">${escapeHtml(price)}</span>
        <span class="tag">${escapeHtml(city)}</span>
      </div>
      <p class="desc">${escapeHtml(desc)}</p>
      <div class="card-foot">
        <span class="date">${escapeHtml(date)}</span>
        ${safeUrl !== '#' ? `<a class="btn-open" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">فتح الإعلان</a>` : `<span class="date">لا يوجد رابط</span>`}
      </div>`;
    fragCards.appendChild(card);

    // صف جدول
    const tr = document.createElement('tr');
    const shortDesc = desc.length > 140 ? desc.slice(0, 140) + '…' : desc;
    tr.innerHTML = `
      <td>${escapeHtml(title)}</td>
      <td>${escapeHtml(price)}</td>
      <td>${escapeHtml(city)}</td>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(shortDesc)}</td>
      <td>${safeUrl !== '#' ? `<a class="btn-open" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">فتح الإعلان</a>` : '—'}</td>`;
    fragRows.appendChild(tr);
  });

  cardsView.appendChild(fragCards);
  resultsBody.appendChild(fragRows);
}

// ---------- البحث ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');

  const q = queryInput.value.trim();
  if (!q) {
    showError('اكتب كلمة البحث أولاً، مثال: شقة في جدة.');
    queryInput.focus();
    return;
  }

  const payload = {
    query: q,
    mode: currentMode(),
    filters: {
      city: cityInput.value.trim() || null,
      max_price: priceInput.value ? Number(priceInput.value) : null,
      date_from: dateFrom.value || null,
      date_to: dateTo.value || null
    }
  };

  saveLastSearch({
    q,
    mode: payload.mode,
    city: cityInput.value.trim(),
    maxPrice: priceInput.value,
    from: dateFrom.value,
    to: dateTo.value
  });

  setLoading(true, payload.mode === 'ai' ? 'جاري البحث مع AI… ياخذ وقت شوي.' : 'جاري البحث… نجيب أول النتائج.');
  resultCount.textContent = 'جاري البحث…';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error('مسار البحث غير موجود. تأكد أن الـ Backend شغال ومحدّث.');
      if (res.status >= 500) throw new Error('الخادم تعثر. جرّب بعد شوي.');
      throw new Error(`تعذر البحث (رمز ${res.status}). تأكد من تشغيل الـ Backend.`);
    }

    const data = await res.json();
    const listings = normalizeListings(data);

    // رسالة AI غير مهيأ
    if (data && typeof data.message === 'string' && /api key|AI mode is not configured/i.test(data.message)) {
      showError('وضع AI غير مهيأ بعد. أضف مفتاح API في الإعدادات، أو جرّب وضع «بدون AI».');
    }

    // فلترة خفيفة على الجهاز لو رجع Backend بدون فلترة
    const filtered = listings.filter((it) => {
      if (payload.filters.city && (it.city || '').trim() !== payload.filters.city.trim()) {
        // مطابقة مرنة: يحتوي
        if (!(it.city || '').includes(payload.filters.city.trim())) return false;
      }
      if (payload.filters.max_price != null) {
        const n = Number(String(it.price ?? '').replace(/[^0-9]/g, ''));
        if (Number.isFinite(n) && String(it.price ?? '').match(/[0-9]/) && n > payload.filters.max_price) return false;
      }
      return true;
    });

    render(filtered);
    setStatus(filtered.length ? 'وصلت النتائج. اضغط «فتح الإعلان» لعرض التفاصيل في المتصفح.' : 'ما لقينا نتائج مطابقة. جرّب تخفف الفلاتر أو تغير الكلمات.');
  } catch (err) {
    const isNetwork = err instanceof TypeError;
    showError(isNetwork
      ? 'ما قدرنا نوصل للخادم. تأكد أن الـ Backend شغال على http://localhost:8000 ثم حاول مرة ثانية.'
      : (err.message || 'صار خطأ غير متوقع. حاول مرة ثانية.'));
    setStatus('تعذر إتمام البحث.');
    resultCount.textContent = 'تعذر البحث';
  } finally {
    setLoading(false);
  }
});

// ---------- بدء ----------
restoreLastSearch();
setView('cards');
