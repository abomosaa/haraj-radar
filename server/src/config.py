from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

BASE_URL = "https://haraj.com.sa"
DEFAULT_KEYWORD = "RTX 3090"
RESULTS_JSON_PATH = "results.json"
NAVIGATION_TIMEOUT_MS = 30_000
RESPECTFUL_DELAY_SECONDS = 1.5
DETAIL_SCRAPE_LIMIT = 10
AI_NOT_CONFIGURED_MESSAGE = "AI mode is not configured yet. Add your API key in settings."
MODE_RULE_BASED = "بدون AI"
MODE_AI = "مع AI"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)
SEARCH_VERB_PATTERNS: tuple[str, ...] = (
    r"ابحث\s+عن",
    r"ابغى",
    r"أبغى",
    r"ابي",
    r"أبي",
    r"دور\s+لي\s+على",
    r"دور\s+على",
    r"دور\s+لي",
    r"دور",
)
PRICE_LIMIT_PATTERNS: tuple[str, ...] = (
    r"أقل\s+من\s+(\d+[\d,]*)",
    r"اقل\s+من\s+(\d+[\d,]*)",
    r"تحت\s+(\d+[\d,]*)",
)
CITY_PATTERN = r"\bفي\s+(.+?)(?=(?:\s+(?:أقل\s+من|اقل\s+من|تحت))|$)"


@dataclass(frozen=True, slots=True)
class SelectorConfig:
    """Selectors stay centralized here so future DOM changes are localized."""

    listing_link_selector: str = 'a[href^="/"], a[href^="https://haraj.com.sa/"]'
    city_link_selector: str = 'a[href*="/city/"]'
    root_container_candidates: tuple[str, ...] = ("article", "li", "section", "div")
    listing_title_selectors: tuple[str, ...] = ("h1", "meta[property='og:title']", "title")
    listing_price_selectors: tuple[str, ...] = (
        "[data-testid*='price']",
        "[class*='price']",
        "[id*='price']",
    )
    listing_city_selectors: tuple[str, ...] = (
        "a[href*='/city/']",
        "[class*='city']",
        "[data-testid*='city']",
    )
    listing_date_selectors: tuple[str, ...] = (
        "time[datetime]",
        "time",
        "[class*='date']",
        "[data-testid*='date']",
    )
    listing_description_selectors: tuple[str, ...] = (
        "[class*='description']",
        "[class*='spec']",
        "article",
        "main",
    )


SELECTORS = SelectorConfig()


def build_search_url(keyword: str) -> str:
    """Build the first-page Haraj search URL for the user-entered keyword."""

    normalized_keyword = keyword.strip() or DEFAULT_KEYWORD
    return f"{BASE_URL}/search/{quote(normalized_keyword)}/"
