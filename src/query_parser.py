from __future__ import annotations

from src.ai.ai_parser import AIQueryParser
from src.config import MODE_AI, MODE_RULE_BASED
from src.models import SearchQuery
from src.parsing.rule_based import RuleBasedArabicParser


class QueryParserService:
    """Resolve query parsing strategy from selected mode."""

    def __init__(self) -> None:
        self._rule_parser = RuleBasedArabicParser()
        self._ai_parser = AIQueryParser()

    def parse(self, user_input: str, mode_label: str) -> SearchQuery:
        if mode_label == MODE_AI:
            return self._ai_parser.parse(user_input)
        return self._rule_parser.parse(user_input)
