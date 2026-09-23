from __future__ import annotations

import asyncio

from PySide6.QtCore import QThread, Signal

from src.config import DETAIL_SCRAPE_LIMIT
from src.models import SearchQuery, TableFilters
from src.scraper import scrape_search_results
from src.search_service import filter_listings


class SearchWorker(QThread):
    """Run the Playwright scraper away from the GUI thread."""

    status_changed = Signal(str)
    search_completed = Signal(object, object)
    search_failed = Signal(str)

    def __init__(self, query: SearchQuery, table_filters: TableFilters | None = None) -> None:
        super().__init__()
        self._query = query
        self._table_filters = table_filters

    def run(self) -> None:
        try:
            self.status_changed.emit("جاري الاتصال بحراج...")
            listings = asyncio.run(
                scrape_search_results(
                    self._query.keyword,
                    detail_limit=DETAIL_SCRAPE_LIMIT,
                    status_callback=self.status_changed.emit,
                )
            )
            self.status_changed.emit("جاري فلترة النتائج...")
            filtered_results = filter_listings(listings, self._query, self._table_filters)
            self.search_completed.emit(self._query, filtered_results)
        except Exception as exc:
            self.search_failed.emit(str(exc))
