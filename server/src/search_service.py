from __future__ import annotations

from datetime import date

from server.src.models import Listing, SearchQuery, TableFilters
from server.src.utils import coerce_price_to_int, parse_date_string


def filter_listings(
    listings: list[Listing],
    query: SearchQuery,
    table_filters: TableFilters | None = None,
) -> list[Listing]:
    """Apply parser filters first, then optional UI table filters."""

    filtered_results = listings

    if query.city:
        target_city = _normalize_text(query.city)
        filtered_results = [
            item
            for item in filtered_results
            if item.city and target_city in _normalize_text(item.city)
        ]

    if query.max_price is not None:
        filtered_results = [
            item
            for item in filtered_results
            if (price_value := coerce_price_to_int(item.price)) is not None
            and price_value <= query.max_price
        ]

    if table_filters is None:
        return filtered_results

    if table_filters.keyword:
        keyword_token = _normalize_text(table_filters.keyword)
        filtered_results = [
            item
            for item in filtered_results
            if _contains(item.title, keyword_token) or _contains(item.description, keyword_token)
        ]

    if table_filters.city:
        city_token = _normalize_text(table_filters.city)
        filtered_results = [
            item for item in filtered_results if item.city and city_token in _normalize_text(item.city)
        ]

    if table_filters.max_price is not None:
        filtered_results = [
            item
            for item in filtered_results
            if (price_value := coerce_price_to_int(item.price)) is not None
            and price_value <= table_filters.max_price
        ]

    date_from = parse_date_string(table_filters.date_from)
    date_to = parse_date_string(table_filters.date_to)
    if date_from is not None or date_to is not None:
        filtered_results = [
            item
            for item in filtered_results
            if _is_date_in_range(parse_date_string(item.date), date_from, date_to)
        ]

    return filtered_results


def _normalize_text(value: str) -> str:
    return " ".join(value.split()).strip().lower()


def _contains(source: str | None, token: str) -> bool:
    if not source:
        return False
    return token in _normalize_text(source)


def _is_date_in_range(value: date | None, date_from: date | None, date_to: date | None) -> bool:
    if value is None:
        return False
    if date_from is not None and value < date_from:
        return False
    if date_to is not None and value > date_to:
        return False
    return True
