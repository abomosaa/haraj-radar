from __future__ import annotations

from typing import Protocol

from server.src.models import SearchQuery


class QueryParser(Protocol):
    """Parser boundary that allows a future AI-backed implementation."""

    def parse(self, user_input: str) -> SearchQuery:
        ...
