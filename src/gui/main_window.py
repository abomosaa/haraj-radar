from __future__ import annotations

from datetime import date

from PySide6.QtCore import QDate, Qt
from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDateEdit,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from src.ai import AIParserNotConfiguredError
from src.config import (
    AI_NOT_CONFIGURED_MESSAGE,
    GUI_WINDOW_MIN_HEIGHT,
    GUI_WINDOW_MIN_WIDTH,
    GUI_WINDOW_TITLE,
    MODE_AI,
    MODE_RULE_BASED,
)
from src.gui.results_table import ResultsTableWidget
from src.gui.worker_thread import SearchWorker
from src.models import Listing, SearchQuery, TableFilters
from src.query_parser import QueryParserService
from src.search_service import filter_listings
from src.utils import write_results_json


class HarajChatWindow(QMainWindow):
    """Desktop interface with mode selection and table-based listing results."""

    def __init__(self) -> None:
        super().__init__()
        self._parser_service = QueryParserService()
        self._worker: SearchWorker | None = None
        self._last_query: SearchQuery | None = None
        self._base_results: list[Listing] = []

        self._status_label = QLabel()
        self._summary_label = QLabel()
        self._input = QLineEdit()
        self._send_button = QPushButton("إرسال")
        self._mode_combo = QComboBox()

        self._filter_keyword = QLineEdit()
        self._filter_city = QLineEdit()
        self._filter_price = QSpinBox()
        self._date_range_checkbox = QCheckBox("تفعيل نطاق التاريخ")
        self._date_from = QDateEdit()
        self._date_to = QDateEdit()
        self._apply_filters_button = QPushButton("تطبيق الفلاتر")
        self._reset_filters_button = QPushButton("إعادة تعيين الفلاتر")

        self._results_table = ResultsTableWidget()

        self.setWindowTitle(GUI_WINDOW_TITLE)
        self.setMinimumSize(GUI_WINDOW_MIN_WIDTH, GUI_WINDOW_MIN_HEIGHT)
        self._apply_palette()
        self._build_ui()
        self._apply_styles()

    def _build_ui(self) -> None:
        root = QWidget()
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(20, 20, 20, 20)
        root_layout.setSpacing(12)

        header = QLabel("Haraj Desktop Search")
        header.setObjectName("appHeader")
        subtitle = QLabel(
            "بحث آمن في حراج مع جدول نتائج قابل للفرز. لا يتم جمع أرقام الجوالات ولا إرسال رسائل للبائعين."
        )
        subtitle.setObjectName("appSubtitle")
        subtitle.setWordWrap(True)
        subtitle.setLayoutDirection(Qt.LayoutDirection.RightToLeft)

        mode_row = QHBoxLayout()
        mode_row.setSpacing(10)
        mode_label = QLabel("وضع البحث")
        mode_label.setObjectName("sectionTitle")
        self._mode_combo.addItems([MODE_RULE_BASED, MODE_AI])
        self._mode_combo.setCurrentText(MODE_RULE_BASED)
        self._mode_combo.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        mode_row.addWidget(mode_label)
        mode_row.addWidget(self._mode_combo)
        mode_row.addStretch(1)

        query_row = QHBoxLayout()
        query_row.setSpacing(10)
        self._input.setPlaceholderText("اكتب هنا: أبغى كمبيوتر ألعاب أقل من 5000")
        self._input.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self._input.returnPressed.connect(self._submit_query)
        self._input.setMinimumHeight(44)
        self._send_button.setMinimumHeight(44)
        self._send_button.clicked.connect(self._submit_query)
        query_row.addWidget(self._send_button)
        query_row.addWidget(self._input, 1)

        filters_group = QGroupBox("فلاتر الجدول")
        filters_layout = QFormLayout(filters_group)
        filters_layout.setFormAlignment(Qt.AlignmentFlag.AlignRight)
        filters_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        self._filter_keyword.setPlaceholderText("كلمة في العنوان أو الوصف")
        self._filter_city.setPlaceholderText("مثال: الرياض")

        self._filter_price.setRange(0, 10_000_000)
        self._filter_price.setSingleStep(100)
        self._filter_price.setSpecialValueText("بدون حد أقصى")

        today = QDate.currentDate()
        self._date_from.setCalendarPopup(True)
        self._date_to.setCalendarPopup(True)
        self._date_from.setDate(QDate(today.year(), 1, 1))
        self._date_to.setDate(today)
        self._date_from.setEnabled(False)
        self._date_to.setEnabled(False)
        self._date_range_checkbox.toggled.connect(self._on_date_range_toggled)

        filters_layout.addRow("الكلمة", self._filter_keyword)
        filters_layout.addRow("المدينة", self._filter_city)
        filters_layout.addRow("الحد الأقصى للسعر", self._filter_price)
        filters_layout.addRow(self._date_range_checkbox)
        filters_layout.addRow("من", self._date_from)
        filters_layout.addRow("إلى", self._date_to)

        filter_buttons_row = QHBoxLayout()
        self._apply_filters_button.clicked.connect(self._apply_table_filters)
        self._reset_filters_button.clicked.connect(self._reset_table_filters)
        filter_buttons_row.addWidget(self._apply_filters_button)
        filter_buttons_row.addWidget(self._reset_filters_button)
        filter_buttons_row.addStretch(1)

        self._summary_label.setObjectName("summaryLabel")
        self._summary_label.setText("لا توجد نتائج بعد")
        self._summary_label.setLayoutDirection(Qt.LayoutDirection.RightToLeft)

        self._results_table.open_link_requested.connect(self._on_open_link_requested)
        self._results_table.setLayoutDirection(Qt.LayoutDirection.RightToLeft)

        self._status_label.setObjectName("statusLabel")
        self._status_label.setText("جاهز")
        self._status_label.setLayoutDirection(Qt.LayoutDirection.RightToLeft)

        root_layout.addWidget(header)
        root_layout.addWidget(subtitle)
        root_layout.addLayout(mode_row)
        root_layout.addLayout(query_row)
        root_layout.addWidget(filters_group)
        root_layout.addLayout(filter_buttons_row)
        root_layout.addWidget(self._summary_label)
        root_layout.addWidget(self._results_table, 1)
        root_layout.addWidget(self._status_label)

        self.setCentralWidget(root)
        root.setLayoutDirection(Qt.LayoutDirection.RightToLeft)

    def _on_date_range_toggled(self, enabled: bool) -> None:
        self._date_from.setEnabled(enabled)
        self._date_to.setEnabled(enabled)

    def _submit_query(self) -> None:
        if self._worker is not None and self._worker.isRunning():
            return

        raw_input = self._input.text().strip()
        if not raw_input:
            QMessageBox.information(self, "تنبيه", "اكتب طلب البحث أولاً.")
            return

        selected_mode = self._mode_combo.currentText()
        try:
            query = self._parser_service.parse(raw_input, selected_mode)
        except AIParserNotConfiguredError:
            QMessageBox.information(self, "AI", AI_NOT_CONFIGURED_MESSAGE)
            return
        except Exception as exc:
            QMessageBox.critical(self, "خطأ", f"تعذر تحليل الطلب: {exc}")
            return

        self._last_query = query
        self._summary_label.setText(self._format_query_summary(query))
        self._input.clear()
        self._set_busy(True)
        self._results_table.set_results([])

        self._worker = SearchWorker(query)
        self._worker.status_changed.connect(self._on_status_changed)
        self._worker.search_completed.connect(self._on_search_completed)
        self._worker.search_failed.connect(self._on_search_failed)
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _on_status_changed(self, status: str) -> None:
        self._status_label.setText(status)

    def _on_search_completed(self, query: SearchQuery, listings: list[Listing]) -> None:
        self._base_results = listings

        if not listings:
            self._summary_label.setText("لم يتم العثور على نتائج مطابقة لطلبك.")
            self._results_table.set_results([])
            write_results_json([])
            return

        self._apply_table_filters()
        write_results_json(self._base_results)

    def _on_search_failed(self, error_message: str) -> None:
        QMessageBox.critical(self, "خطأ البحث", f"تعذر تنفيذ البحث: {error_message}")
        self._summary_label.setText("حدث خطأ أثناء البحث")

    def _on_worker_finished(self) -> None:
        self._set_busy(False)
        self._status_label.setText("جاهز")

    def _set_busy(self, is_busy: bool) -> None:
        self._input.setEnabled(not is_busy)
        self._send_button.setEnabled(not is_busy)

    def _collect_table_filters(self) -> TableFilters:
        date_from = None
        date_to = None
        if self._date_range_checkbox.isChecked():
            date_from = self._qdate_to_iso(self._date_from.date())
            date_to = self._qdate_to_iso(self._date_to.date())

        return TableFilters(
            keyword=self._filter_keyword.text().strip() or None,
            city=self._filter_city.text().strip() or None,
            max_price=self._filter_price.value() or None,
            date_from=date_from,
            date_to=date_to,
        )

    def _apply_table_filters(self) -> None:
        if self._last_query is None:
            return

        table_filters = self._collect_table_filters()
        neutral_query = SearchQuery(keyword="", city=None, max_price=None, raw_input="")
        filtered_results = filter_listings(self._base_results, neutral_query, table_filters)
        self._results_table.set_results(filtered_results)
        self._summary_label.setText(f"عدد النتائج: {len(filtered_results)}")

    def _reset_table_filters(self) -> None:
        self._filter_keyword.clear()
        self._filter_city.clear()
        self._filter_price.setValue(0)
        self._date_range_checkbox.setChecked(False)
        if self._last_query is not None:
            self._results_table.set_results(self._base_results)
            self._summary_label.setText(f"عدد النتائج: {len(self._base_results)}")

    def _on_open_link_requested(self, _url: str) -> None:
        self._status_label.setText("تم فتح الإعلان في المتصفح")

    def _qdate_to_iso(self, value: QDate) -> str:
        return date(value.year(), value.month(), value.day()).isoformat()

    def _format_query_summary(self, query: SearchQuery) -> str:
        parts = [f"الكلمة: {query.keyword}"]
        if query.city:
            parts.append(f"المدينة: {query.city}")
        if query.max_price is not None:
            parts.append(f"الحد الأقصى: {query.max_price}")
        return "معايير البحث: " + " | ".join(parts)

    def _apply_palette(self) -> None:
        palette = self.palette()
        palette.setColor(QPalette.ColorRole.Window, QColor("#f4efe7"))
        palette.setColor(QPalette.ColorRole.Base, QColor("#fffaf5"))
        palette.setColor(QPalette.ColorRole.AlternateBase, QColor("#f2e9dc"))
        palette.setColor(QPalette.ColorRole.WindowText, QColor("#231f1a"))
        palette.setColor(QPalette.ColorRole.Text, QColor("#231f1a"))
        self.setPalette(palette)

    def _apply_styles(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow { background: #f4efe7; }
            QLabel#appHeader {
                font-size: 28px;
                font-weight: 700;
                color: #2f2a24;
            }
            QLabel#appSubtitle {
                font-size: 14px;
                color: #5b5246;
            }
            QLabel#sectionTitle {
                font-size: 14px;
                font-weight: 700;
                color: #4e463c;
            }
            QLabel#statusLabel {
                color: #7a6b58;
                font-size: 13px;
            }
            QLabel#summaryLabel {
                color: #4e463c;
                font-size: 14px;
                font-weight: 600;
            }
            QGroupBox {
                border: 1px solid #dccdbd;
                border-radius: 12px;
                margin-top: 8px;
                padding: 10px;
                font-weight: 700;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 4px;
            }
            QLineEdit {
                border: 1px solid #d8c7b1;
                border-radius: 16px;
                padding: 10px 14px;
                background: #fffaf5;
                font-size: 15px;
            }
            QComboBox, QSpinBox, QDateEdit {
                border: 1px solid #d8c7b1;
                border-radius: 10px;
                padding: 6px 10px;
                background: #fffaf5;
                min-height: 32px;
            }
            QPushButton {
                border: none;
                border-radius: 16px;
                padding: 10px 18px;
                background: #b86f3c;
                color: white;
                font-weight: 700;
            }
            QPushButton:disabled {
                background: #cbb39b;
            }
            QTableWidget {
                border: 1px solid #dccdbd;
                border-radius: 10px;
                background: #fffaf5;
                gridline-color: #eadfce;
            }
            QHeaderView::section {
                background: #efe2d3;
                color: #2f2a24;
                padding: 8px;
                border: none;
                border-right: 1px solid #e0d0bf;
            }
            """
        )
