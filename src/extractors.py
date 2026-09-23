from __future__ import annotations

import re
from collections.abc import Iterable
from urllib.parse import urljoin
from datetime import date

from .config import BASE_URL
from .models import Listing
from .utils import parse_date_string

LISTING_PATH_RE = re.compile(r"^/(\d{8,})/", re.IGNORECASE)
ABSOLUTE_LISTING_RE = re.compile(r"^https://haraj\.com\.sa/(\d{8,})/", re.IGNORECASE)
PRICE_WITH_CURRENCY_RE = re.compile(
    r"(?:\b\d[\d,\.]*\b\s*(?:ريال|ر\.س|SAR)|(?:ريال|ر\.س|SAR)\s*\b\d[\d,\.]*\b)",
    re.IGNORECASE,
)
ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
PHONE_PATTERN = re.compile(r"(?:\+?966|0)?\s*\d(?:[\s\-]?\d){7,}")


def normalize_text(value: str | None) -> str | None:
    """Collapse whitespace and return None for blank values."""

    if value is None:
        return None

    collapsed = " ".join(value.split())
    return collapsed or None


def is_listing_url(url: str | None) -> bool:
    if not url:
        return False

    return bool(LISTING_PATH_RE.match(url) or ABSOLUTE_LISTING_RE.match(url))


def normalize_listing_url(url: str | None) -> str | None:
    """Convert relative URLs to absolute Haraj listing URLs and filter non-listings."""

    if not url:
        return None

    absolute_url = urljoin(f"{BASE_URL}/", url)
    return absolute_url if is_listing_url(absolute_url) else None


def normalize_price(value: str | None) -> str | None:
    cleaned = normalize_text(value)
    if cleaned is None:
        return None

    return cleaned.translate(ARABIC_INDIC_DIGITS)


def extract_price_from_text(context_text: str | None) -> str | None:
    """Use a conservative heuristic so missing or noisy prices stay optional."""

    normalized = normalize_price(context_text)
    if normalized is None:
        return None

    currency_match = PRICE_WITH_CURRENCY_RE.search(normalized)
    if currency_match:
        return currency_match.group(0).strip()

    return None


def sanitize_description(value: str | None) -> str | None:
    """Keep plain text description and remove phone-like patterns."""

    cleaned = normalize_text(value)
    if cleaned is None:
        return None

    redacted = PHONE_PATTERN.sub("[محذوف]", cleaned)
    return normalize_text(redacted)


def normalize_date(value: str | None) -> str | None:
    parsed = parse_date_string(value)
    if parsed is None:
        return normalize_text(value)
    return parsed.isoformat()


def build_listing(raw_item: dict[str, str | None]) -> Listing | None:
    """Normalize one browser-extracted result record into a Listing."""

    url = normalize_listing_url(raw_item.get("url"))
    title = normalize_text(raw_item.get("title"))
    city = normalize_text(raw_item.get("city"))
    price = normalize_price(raw_item.get("price")) or extract_price_from_text(raw_item.get("context_text"))
    date = normalize_date(raw_item.get("date"))
    description = sanitize_description(raw_item.get("description") or raw_item.get("context_text"))

    if not url or not title:
        return None

    return Listing(title=title, price=price, city=city, date=date, description=description, url=url)


def merge_listing_detail(base: Listing, detail: Listing) -> Listing:
    """Merge detail-page extraction into base listing without losing known fields."""

    return Listing(
        title=detail.title or base.title,
        price=detail.price or base.price,
        city=detail.city or base.city,
        date=detail.date or base.date,
        description=detail.description or base.description,
        url=base.url,
    )


def build_listings(raw_items: Iterable[dict[str, str | None]]) -> list[Listing]:
    """Normalize and deduplicate the browser-extracted records by listing URL."""

    listings: list[Listing] = []
    seen_urls: set[str] = set()

    for raw_item in raw_items:
        listing = build_listing(raw_item)
        if listing is None or listing.url is None or listing.url in seen_urls:
            continue

        seen_urls.add(listing.url)
        listings.append(listing)

    return listings
