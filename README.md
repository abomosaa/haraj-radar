# بحث حراج — Haraj Search (PWA + Backend)

تطبيق بحث في إعلانات حراج بواجهة عربية (RTL) تعمل على الجوال والديسكتوب.
يتكوّن المشروع من طرفين فقط:

<img width="1861" height="867" alt="image" src="https://github.com/user-attachments/assets/11312e62-d028-4740-b455-c06f0b31c348" />
<img width="252" height="571" alt="image" src="https://github.com/user-attachments/assets/156c0d2a-b89d-4d69-8b57-50f03b9d56c9" />

- **`server/`** — الواجهة الخلفية (FastAPI + سكرابر Playwright) تعمل على الخادم.
- **`pwa/`** — واجهة الويب والتطبيق التقدمي (PWA) التي تتثبت من المتصفح بزر «إضافة إلى الشاشة الرئيسية».

> ملاحظة: تم إسقاط واجهة PySide6 المكتبية نهائياً (`main.py` و`run_gui.*` ومجلد `src/gui` حُذفت).
> السكرابر يعيش على الخادم فقط — لا يُشحَن أي متصفح مع الجوال.

## هيكلية المجلدات

```text
scrapper/
├── server/                 # الـ Backend (يعمل بـ: uvicorn server.app:app)
│   ├── app.py              # تطبيق FastAPI: ‏/health‏ و‎/api/search‎ و‎/api/history‎
│   ├── requirements.txt    # اعتماديات الخادم (fastapi + uvicorn + playwright)
│   └── src/                # منطق البحث والسكرابر (منقول من src/ القديم)
│       ├── scraper.py      # جلب صفحة البحث + تفاصيل أول 10 إعلانات (Playwright)
│       ├── extractors.py   # بناء كائنات Listing من البيانات الخام
│       ├── search_service.py # فلترة النتائج (مدينة/سعر/تاريخ)
│       ├── query_parser.py # توجيه التحليل: قواعدي أو AI
│       ├── parsing/        # المحلل القواعدي العربي + الواجهات
│       ├── ai/             # محلل AI (يحتاج HARAJ_AI_API_KEY) + إعداداته
│       ├── models.py       # Listing / SearchQuery / TableFilters
│       ├── utils.py        # أسعار/تواريخ/كتابة JSON
│       └── config.py       # الثوابت: الروابط، المحددات، الحدود
├── pwa/                    # الواجهة والتطبيق التقدمي
│   ├── index.html          # الصفحة (lang=ar dir=rtl): بحث + فلاتر + نتائج
│   ├── app.js              # منطق الواجهة: ينادي API ويعرض النتائج
│   ├── styles.css          # تصميم موبايل-أول (بطاقات + جدول)
│   ├── manifest.json       # بيانات التثبيت (الاسم، الأيقونات، standalone)
│   ├── service-worker.js   # تخزين الملفات المحلية فقط (طلبات API لا تُخزَّن)
│   └── icons/              # أيقونات SVG (حوّلها لـ PNG 192/512 عند رفع Play)
├── requirements.txt        # نفس اعتماديات الخادم (للتثبيت من الجذر)
├── results.json            # ناتج اختياري قديم (مهجور، لا يُتتبَّع في Git)
└── .gitignore              # .venv/ + ‎__pycache__‎ + results.json + .opencode/
```

## تشغيل الـ Backend

المتطلب: Python 3.12 (الـ `.venv` الحالي مكسور — أعد إنشاءه كما below).

```powershell
# 1) إنشاء البيئة
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\playwright.exe install chromium

# 2) التشغيل من جذر المشروع
.\.venv\Scripts\uvicorn.exe server.app:app --port 8000

# 3) تحقق
# افتح http://localhost:8000/health → {"ok": true}
```

متغيرات البيئة الاختيارية:

| المتغير | الافتراضي | الوظيفة |
|---|---|---|
| `HARAJ_AI_API_KEY` | فارغ | تفعيل وضع «مع AI» (بدونه يرد API برسالة تهيئة) |
| `HARAJ_SEARCH_TIMEOUT_SECONDS` | `90` | مهلة البحث الكلية بالثواني |

## تشغيل الـ PWA ومعاينتها

الـ PWA صفحة ستاتيكية تتصل بالـ Backend — تحتاج الاثنين شغالَين معاً:

```powershell
# نافذة 1: الـ Backend (من الجذر)
.\.venv\Scripts\uvicorn.exe server.app:app --port 8000

# نافذة 2: سيرفر ستاتيكي للـ PWA (من داخل pwa/)
Set-Location pwa
..\.venv\Scripts\python.exe -m http.server 5173
# افتح http://localhost:5173
```

- **التثبيت من المتصفح:** في كروم على الجوال اختر ⋮ ثم «إضافة إلى الشاشة الرئيسية» — يظهر زر «تثبيت التطبيق» تلقائياً عندما يعرض المتصفح `beforeinstallprompt`.
- فتح `index.html` مباشرة يعمل للبحث (طالما الـ Backend شغال)، لكن prompt التثبيت يحتاج `localhost` أو `HTTPS`.
- عنوان الـ Backend مضبوط في أعلى `pwa/app.js` (`API_URL`) — غيّره لرابط خادمك عند النشر.

## كيف يعمل التطبيق (PWA ↔ Backend)

```text
المستخدم يكتب «كمبيوتر ألعاب أقل من 5000 في الرياض»
        │  pwa/app.js: POST /api/search {query, mode, filters}
        ▼
server/app.py
  ├─ QueryParserService: استخراج {keyword, city, max_price}
  ├─ scrape_search_results: صفحة البحث أولاً، ثم تفاصيل أول 10 إعلانات
  │   (حظر الصور/الفيديو، فاصل مهذب بين الطلبات، بدون أرقام تواصل)
  ├─ filter_listings: تطبيق فلاتر المدينة/السعر/التاريخ
        │  {query, parsed, listings[{title,price,price_value,city,date,description,url}], count}
        ▼
pwa/app.js: بطاقات (موبايل) أو جدول + زر «فتح الإعلان» يفتح الرابط في المتصفح
```

مثال طلب:

```json
POST http://localhost:8000/api/search
{
  "query": "كمبيوتر ألعاب أقل من 5000 في الرياض",
  "mode": "rule",
  "filters": { "city": "الرياض", "max_price": 5000, "date_from": null, "date_to": null },
  "limit": 10
}
```

مثال رد:

```json
{
  "query": "كمبيوتر ألعاب أقل من 5000 في الرياض",
  "parsed": { "keyword": "كمبيوتر ألعاب", "city": "الرياض", "max_price": 5000 },
  "listings": [
    {
      "title": "كمبيوتر ألعاب ...",
      "price": "4500 ريال",
      "price_value": 4500,
      "city": "الرياض",
      "date": "2024-05-01",
      "description": "...",
      "url": "https://haraj.com.sa/..."
    }
  ],
  "count": 1
}
```


## قيود السلامة

- أول 10 نتائج فقط تُفتح تفاصيلها.
- لا جمع لأرقام التواصل، لا رسائل/تفاعل مع البائعين.
