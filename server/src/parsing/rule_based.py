from __future__ import annotations

import re

from server.src.config import CITY_PATTERN, DEFAULT_KEYWORD, PRICE_LIMIT_PATTERNS, SEARCH_VERB_PATTERNS
from server.src.models import SearchQuery
from server.src.utils import coerce_price_to_int


class RuleBasedArabicParser:
    """Deterministic parser for natural Arabic shopping-style requests."""

    def parse(self, user_input: str) -> SearchQuery:
        raw_input = user_input.strip()
        normalized = self._normalize_text(raw_input)

        max_price, normalized = self._extract_max_price(normalized)
        city, normalized = self._extract_city(normalized)
        keyword = self._extract_keyword(normalized)

        return SearchQuery(
            keyword=keyword or DEFAULT_KEYWORD,
            city=city,
            max_price=max_price,
            raw_input=raw_input,
        )

    def _normalize_text(self, value: str) -> str:
        collapsed = " ".join(value.split())
        return collapsed.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))

    def _extract_max_price(self, value: str) -> tuple[int | None, str]:
        for pattern in PRICE_LIMIT_PATTERNS:
            match = re.search(pattern, value, flags=re.IGNORECASE)
            if match is None:
                continue

            max_price = coerce_price_to_int(match.group(1))
            cleaned = self._remove_span(value, match.span())
            return max_price, cleaned

        return None, value

    def _extract_city(self, value: str) -> tuple[str | None, str]:
        match = re.search(CITY_PATTERN, value, flags=re.IGNORECASE)
        if match is None:
            return None, value

        city = self._clean_fragment(match.group(1))
        cleaned = self._remove_span(value, match.span())
        return city or None, cleaned

    def _extract_keyword(self, value: str) -> str:
        keyword = value
        for verb_pattern in SEARCH_VERB_PATTERNS:
            keyword = re.sub(rf"^{verb_pattern}\s+", "", keyword, flags=re.IGNORECASE)

        keyword = self._clean_fragment(keyword)
        return keyword or DEFAULT_KEYWORD

    def _clean_fragment(self, value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip(" ،,.-")
        return cleaned

    def _remove_span(self, value: str, span: tuple[int, int]) -> str:
        start, end = span
        combined = f"{value[:start]} {value[end:]}"
        return self._clean_fragment(combined)
