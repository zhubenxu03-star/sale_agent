from __future__ import annotations

import hashlib
import re
from typing import Any


def content_hash(card: dict[str, Any]) -> str:
    normalized = re.sub(r"\s+", "", "|".join(str(card.get(key, "")) for key in ("title", "customer_example", "salesperson_reply", "strategy_summary"))).lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_title(title: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]", "", title).lower()


def duplicate_score(left: dict[str, Any], right: dict[str, Any]) -> float:
    a = set(normalize_title(str(left.get("title", ""))))
    b = set(normalize_title(str(right.get("title", ""))))
    return len(a & b) / max(1, len(a | b))
