from __future__ import annotations

import sys

from PySide6.QtWidgets import QApplication

from src.gui.main_window import HarajChatWindow


def main() -> int:
    """Start the desktop GUI application."""
    app = QApplication(sys.argv)
    window = HarajChatWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
