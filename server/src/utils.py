from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import date, datetime

from .config import RESULTS_JSON_PATH
from .models import Listing

ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
NON_DIGIT_PATTERN = re.compile(r"[^\d]")
DATE_PATTERNS: tuple[str, ...] = (
    r"(\d{4}-\d{2}-\d{2})",
    r"(\d{4}/\d{2}/\d{2})",
    r"(\d{2}/\d{2}/\d{4})",
)


def coerce_price_to_int(value: str | None) -> int | None:
    """Convert a price string to an integer when possible."""
    if not value:
        return None

    normalized = value.translate(ARABIC_INDIC_DIGITS)
    digits_only = NON_DIGIT_PATTERN.sub("", normalized)
    if not digits_only:
        return None

    return int(digits_only)


def write_results_json(listings: list[Listing]) -> Path:
    """Persist results to the project-root JSON output file."""

    output_path = Path(RESULTS_JSON_PATH)
    payload = [item.to_dict() for item in listings]
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_path


def parse_date_string(value: str | None) -> date | None:
    """Parse common Haraj date formats to a Python date object."""

    if not value:
        return None

    normalized = value.translate(ARABIC_INDIC_DIGITS).strip()

    for pattern in DATE_PATTERNS:
        match = re.search(pattern, normalized)
        if not match:
            continue

        token = match.group(1)
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(token, fmt).date()
            except ValueError:
                continue

    return None


def date_to_iso(value: date | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()