from __future__ import annotations

from datetime import date

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QHeaderView,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QWidget,
)

from src.models import Listing
from src.utils import coerce_price_to_int, parse_date_string


class _NumericItem(QTableWidgetItem):
    def __init__(self, text: str, number_value: int | None) -> None:
        super().__init__(text)
        self._number_value = number_value if number_value is not None else -1

    def __lt__(self, other: object) -> bool:
        if isinstance(other, _NumericItem):
            return self._number_value < other._number_value
        return super().__lt__(other)


class _DateItem(QTableWidgetItem):
    def __init__(self, text: str, date_value: date | None) -> None:
        super().__init__(text)
        self._ordinal = date_value.toordinal() if date_value is not None else 0

    def __lt__(self, other: object) -> bool:
        if isinstance(other, _DateItem):
            return self._ordinal < other._ordinal
        return super().__lt__(other)


class ResultsTableWidget(QTableWidget):
    """RTL-friendly listing table with hidden URL storage and open action."""

    open_link_requested = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._setup_table()

    def _setup_table(self) -> None:
        self.setColumnCount(6)
        self.setHorizontalHeaderLabels(
            ["العنوان", "السعر", "المدينة", "التاريخ", "الوصف / المواصفات", "الرابط"]
        )
        self.setSortingEnabled(True)
        self.setAlternatingRowColors(True)
        self.setWordWrap(True)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.verticalHeader().setVisible(False)

        header = self.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)

    def set_results(self, listings: list[Listing]) -> None:
        self.setSortingEnabled(False)
        self.setRowCount(0)

        for listing in listings:
            row = self.rowCount()
            self.insertRow(row)

            title_item = QTableWidgetItem(listing.title or "بدون عنوان")
            price_value = coerce_price_to_int(listing.price)
            price_text = f"{price_value:,}" if price_value is not None else (listing.price or "غير محدد")
            price_item = _NumericItem(price_text, price_value)
            city_item = QTableWidgetItem(listing.city or "غير محددة")
            parsed_date = parse_date_string(listing.date)
            date_text = parsed_date.isoformat() if parsed_date else (listing.date or "غير محدد")
            date_item = _DateItem(date_text, parsed_date)
            desc_item = QTableWidgetItem(listing.description or "-")

            for item in (title_item, price_item, city_item, date_item, desc_item):
                item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

            self.setItem(row, 0, title_item)
            self.setItem(row, 1, price_item)
            self.setItem(row, 2, city_item)
            self.setItem(row, 3, date_item)
            self.setItem(row, 4, desc_item)

            open_button = QPushButton("فتح الإعلان")
            open_button.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
            open_button.clicked.connect(lambda checked=False, r=row: self._open_row_url(r))
            self.setCellWidget(row, 5, open_button)

            # Keep real URL hidden from table text to avoid layout overflow.
            self.setRowHidden(row, False)
            self.item(row, 0).setData(Qt.ItemDataRole.UserRole, listing.url)

        self.setSortingEnabled(True)
        self.resizeRowsToContents()

    def _open_row_url(self, row: int) -> None:
        item = self.item(row, 0)
        if item is None:
            return
        url = item.data(Qt.ItemDataRole.UserRole)
        if not isinstance(url, str) or not url:
            return
        self.open_link_requested.emit(url)
        QDesktopServices.openUrl(QUrl(url))
