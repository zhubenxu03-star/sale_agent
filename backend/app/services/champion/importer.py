"""Public import orchestration API for champion knowledge sources."""

from app.services.champion.processing import process_champion_source, process_champion_source_async

__all__ = ["process_champion_source", "process_champion_source_async"]
