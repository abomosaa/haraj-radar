from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(slots=True)
class Listing:
    """One public listing item with optional detail-page fields."""

    title: str | None
    price: str | None
    city: str | None
    date: str | None
    description: str | None
    url: str | None

    def to_dict(self) -> dict[str, str | None]:
        return asdict(self)


@dataclass(slots=True)
class SearchQuery:
    """Structured representation of a user request parsed from chat input."""

    keyword: str
    city: str | None
    max_price: int | None
    raw_input: str


@dataclass(slots=True)
class TableFilters:
    """Optional UI-level filters applied on top of parser query filters."""

    keyword: str | None = None
    city: str | None = None
    max_price: int | None = None
    date_from: str | None = None
    date_to: str | None = None
