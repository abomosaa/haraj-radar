from __future__ import annotations

from server.src.config import AI_NOT_CONFIGURED_MESSAGE
from server.src.models import SearchQuery
from server.src.parsing.interfaces import QueryParser
from server.src.parsing.rule_based import RuleBasedArabicParser

from .config import is_ai_configured


class AIParserNotConfiguredError(RuntimeError):
    """Raised when AI mode is selected without an API key."""


class AIQueryParser(QueryParser):
    """Placeholder AI parser with clean interface for future model integration."""

    def __init__(self) -> None:
        self._fallback_parser = RuleBasedArabicParser()

    def parse(self, user_input: str) -> SearchQuery:
        if not is_ai_configured():
            raise AIParserNotConfiguredError(AI_NOT_CONFIGURED_MESSAGE)

        # Placeholder behavior: keep parsing flow stable until model integration is added.
        return self._fallback_parser.parse(user_input)
