from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.config import settings


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("/", "-").replace(" ", "T"))
    except ValueError:
        return None


def segment_records(records: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    last_key: str | None = None
    last_time: datetime | None = None
    for record in records:
        if not str(record.get("content") or "").strip():
            continue
        key = str(record.get("conversation_id") or "").strip() or None
        timestamp = _parse_time(record.get("timestamp"))
        split = bool(current) and (
            (key is not None and last_key is not None and key != last_key)
            or (key is not None and last_key is None)
            or (timestamp is not None and last_time is not None and (timestamp - last_time).total_seconds() > settings.champion_session_gap_minutes * 60)
        )
        if split:
            groups.append(current)
            current = []
        current.append(record)
        last_key = key or last_key
        last_time = timestamp or last_time
        if len(current) >= settings.champion_max_messages_per_conversation:
            groups.append(current)
            current = []
            last_key = None
            last_time = None
    if current:
        groups.append(current)
    return groups[: settings.champion_max_conversations_per_source]
