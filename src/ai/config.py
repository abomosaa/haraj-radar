from __future__ import annotations

import os


AI_API_KEY_ENV = "HARAJ_AI_API_KEY"


def get_ai_api_key() -> str | None:
    value = os.getenv(AI_API_KEY_ENV, "").strip()
    return value or None


def is_ai_configured() -> bool:
    return get_ai_api_key() is not None
