"""FastAPI backend exposing the Haraj search pipeline over HTTP.

Run from the project root:
    uvicorn server.app:app --port 8000
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.ai.ai_parser import AIParserNotConfiguredError
from src.config import DETAIL_SCRAPE_LIMIT, MODE_AI, MODE_RULE_BASED, RESULTS_JSON_PATH
from src.models import Listing, SearchQuery, TableFilters
from src.query_parser import QueryParserService
from src.utils import coerce_price_to_int

logger = logging.getLogger("haraj-server")

SEARCH_TIMEOUT_SECONDS = int(os.getenv("HARAJ_SEARCH_TIMEOUT_SECONDS", "90"))
MAX_LIMIT = DETAIL_SCRAPE_LIMIT

app = FastAPI(title="Haraj Search API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query_text: str = Field(min_length=1)
    mode: str = MODE_RULE_BASED
    city: str | None = None
    max_price: int | None = None
    limit: int = 10


def _playwright_available() -> bool:
    """True when the Playwright package can be imported later on demand."""

    return importlib.util.find_spec("playwright") is not None


def _resolve_mode_label(mode: str) -> str:
    normalized = (mode or "").strip().lower()
    if normalized in {"ai", "مع ai", "معai"}:
        return MODE_AI
    return MODE_RULE_BASED


def _listing_to_payload(item: Listing) -> dict[str, object]:
    """Serialize a Listing with an extra numeric price_value field."""

    return {
        "title": item.title,
        "price": item.price,
        "price_value": coerce_price_to_int(item.price),
        "city": item.city,
        "date": item.date,
        "description": item.description,
        "url": item.url,
    }


def _parsed_to_dict(parsed: SearchQuery) -> dict[str, object]:
    return {
        "keyword": parsed.keyword,
        "city": parsed.city,
        "max_price": parsed.max_price,
        "raw_input": parsed.raw_input,
    }


def _ignore_progress(message: str) -> None:
    """status_callback hook: progress updates are intentionally dropped."""


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/search")
async def api_search(body: SearchRequest) -> dict[str, object]:
    query_text = (body.query_text or "").strip()
    if not query_text:
        raise HTTPException(status_code=422, detail="اكتب كلمة البحث أولاً.")

    limit = max(1, min(body.limit or MAX_LIMIT, MAX_LIMIT))
    mode_label = _resolve_mode_label(body.mode)

    try:
        parser = QueryParserService()
        parsed = parser.parse(query_text, mode_label)
    except AIParserNotConfiguredError:
        logger.warning("AI mode requested but not configured")
        raise HTTPException(
            status_code=400,
            detail="وضع AI غير مهيأ بعد. أضف مفتاح API في الإعدادات، أو جرّب وضع «بدون AI».",
        ) from None
    except Exception:  # noqa: BLE001
        logger.exception("query parsing failed")
        raise HTTPException(
            status_code=400,
            detail="تعذر فهم طلب البحث. جرّب صيغة مثل: «ابحث عن آيبود في الرياض تحت 2000».",
        ) from None

    if not _playwright_available():
        raise HTTPException(
            status_code=503,
            detail="خدمة البحث غير متاحة: متصفح Playwright غير مثبت على الخادم. "
            "ثبّت المتصفح عبر: pip install playwright ثم playwright install chromium.",
        )

    try:
        from src.scraper import scrape_search_results
    except Exception:  # noqa: BLE001
        logger.exception("scraper import failed")
        raise HTTPException(
            status_code=503,
            detail="خدمة البحث غير متاحة: فشل تحميل وحدة السكرابر على الخادم.",
        ) from None

    try:
        listings = await asyncio.wait_for(
            scrape_search_results(
                parsed.keyword,
                detail_limit=limit,
                status_callback=_ignore_progress,
            ),
            timeout=SEARCH_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("search timed out after %ss", SEARCH_TIMEOUT_SECONDS)
        raise HTTPException(
            status_code=504,
            detail=f"انتهت مهلة البحث ({SEARCH_TIMEOUT_SECONDS} ثانية). جرّب مرة أخرى لاحقاً.",
        ) from None
    except RuntimeError as exc:
        logger.exception("scrape failed")
        raise HTTPException(
            status_code=502,
            detail="تعذر تحميل نتائج حراج: " + str(exc),
        ) from exc
    except Exception:  # noqa: BLE001
        logger.exception("scrape failed")
        raise HTTPException(
            status_code=500,
            detail="حدث خطأ غير متوقع أثناء جلب النتائج. حاول مرة أخرى.",
        ) from None

    request_filters = TableFilters(city=body.city, max_price=body.max_price)
    from src.search_service import filter_listings

    filtered = filter_listings(listings, parsed, request_filters)

    return {
        "query": query_text,
        "parsed": _parsed_to_dict(parsed),
        "listings": [_listing_to_payload(item) for item in filtered],
        "count": len(filtered),
    }


@app.get("/api/history")
def api_history() -> dict[str, object]:
    """Return previously persisted results from results.json when present."""

    output_path = Path(RESULTS_JSON_PATH)
    if not output_path.exists():
        return {"items": [], "count": 0, "message": "لا يوجد ملف نتائج محفوظ بعد."}

    try:
        data = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception("failed reading results.json")
        raise HTTPException(
            status_code=500,
            detail="تعذر قراءة ملف النتائج results.json.",
        ) from None

    items = data if isinstance(data, list) else []
    enriched: list[dict[str, object]] = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        row = dict(entry)
        row["price_value"] = coerce_price_to_int(row.get("price"))
        enriched.append(row)

    return {"items": enriched, "count": len(enriched)}
