# Haraj Desktop Search

Python 3.12 desktop application that uses async Playwright + PySide6 to search Haraj through an RTL table interface.

## How to Run

- Install dependencies:

```powershell
python -m pip install -r requirements.txt
python -m playwright install chromium
```

- Run the GUI:

```powershell
python main.py
```

- Optional launcher scripts:
    - `run_gui.bat`
    - `run_gui.ps1`

If `.venv` is missing, run:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\playwright.exe install chromium
```

## Search Modes

- `بدون AI`:
    - Uses the local rule-based Arabic parser.
    - Fully supported and stable.

- `مع AI`:
    - Integration path is prepared in `src/ai/`.
    - If no API key is configured, the app shows:
        - `AI mode is not configured yet. Add your API key in settings.`
    - Current behavior does not break non-AI mode.

## What Gets Scraped

- Search page results are collected first.
- Then the app opens listing detail pages for the first `10` results only.
- Extracted fields:
    - `العنوان`
    - `السعر`
    - `المدينة`
    - `التاريخ`
    - `الوصف / المواصفات`
    - `الرابط`
- Safety constraints:
    - No phone number collection.
    - No chat/contact interactions.
    - No seller interactions.
    - No image downloads.
    - Respectful delay between listing visits.

## Run

Type your request in natural Arabic, for example:

`أبغى كمبيوتر ألعاب أقل من 5000`

Results appear in a sortable table with a `فتح الإعلان` button per row.

## Features

- Two modes: `بدون AI` and `مع AI`
- RTL-friendly table view (no raw long URLs shown)
- Clickable `فتح الإعلان` action opens system browser
- Sort by `السعر` and `التاريخ` by clicking headers
- Optional filters above table: keyword, city, max price, date range
- Rule-based Arabic parser isolation for future AI upgrade
- Saves displayed dataset to `results.json`

## Project Structure

```text
.
|-- main.py
|-- requirements.txt
|-- README.md
|-- run_gui.bat
|-- run_gui.ps1
`-- src
    |-- query_parser.py
    |-- ai
    |   |-- ai_parser.py
    |   `-- config.py
    |-- config.py
    |-- extractors.py
    |-- gui
    |   |-- main_window.py
    |   |-- results_table.py
    |   `-- worker_thread.py
    |-- models.py
    |-- parsing
    |   |-- interfaces.py
    |   `-- rule_based.py
    |-- scraper.py
    |-- search_service.py
    `-- utils.py
```

## Notes for Extension

- Parser orchestration is centralized in `src/query_parser.py`.
- AI parser/config stubs are in `src/ai/` for future model wiring.
- Haraj selectors and scraper pacing remain centralized in `src/config.py`.
- If Haraj changes its markup, adjust selectors in `src/config.py` before changing the scraper flow.
