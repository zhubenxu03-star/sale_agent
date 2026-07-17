from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Any

import tiktoken

from app.core.config import settings
from app.services.knowledge.errors import KnowledgeProcessingError
from app.services.knowledge.parser import DocumentSection


@dataclass(slots=True)
class TextChunk:
    content: str
    content_hash: str
    token_count: int
    page_number: int | None
    sheet_name: str | None
    row_start: int | None
    row_end: int | None
    section_title: str | None
    metadata: dict[str, Any]


try:
    TOKENIZER = tiktoken.get_encoding("cl100k_base")
except Exception:
    TOKENIZER = None


def estimate_tokens(text: str) -> int:
    if TOKENIZER is not None:
        return len(TOKENIZER.encode(text))
    return max(1, math.ceil(len(text) / 2))


def clean_text(value: str) -> str:
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def split_long_text(text: str, target: int, overlap: int) -> list[str]:
    if len(text) <= target:
        return [text]
    sentences = [
        part.strip() for part in re.split(r"(?<=[。！？!?；;\.])\s*", text) if part.strip()
    ]
    if len(sentences) <= 1:
        step = max(1, target - overlap)
        return [text[index : index + target] for index in range(0, len(text), step)]
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) > target:
            chunks.append(current)
            current = current[-overlap:] + sentence
        else:
            current += sentence
    if current:
        chunks.append(current)
    return chunks


def build_chunks(
    sections: list[DocumentSection],
    target_size: int | None = None,
    overlap: int | None = None,
    min_size: int | None = None,
) -> list[TextChunk]:
    target = target_size or settings.chunk_target_size
    overlap_size = overlap if overlap is not None else settings.chunk_overlap
    minimum = min_size or settings.chunk_min_size
    if overlap_size >= target:
        raise ValueError("chunk overlap must be smaller than target size")

    chunks: list[TextChunk] = []
    seen: set[str] = set()
    for section in sections:
        text = clean_text(section.text)
        if not text:
            continue
        prefix = f"{section.section_title}\n" if section.section_title else ""
        for piece in split_long_text(prefix + text, target, overlap_size):
            piece = clean_text(piece)
            if len(piece) < minimum and len(sections) > 1:
                continue
            digest = hashlib.sha256(piece.encode("utf-8")).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            chunks.append(
                TextChunk(
                    content=piece,
                    content_hash=digest,
                    token_count=estimate_tokens(piece),
                    page_number=section.page_number,
                    sheet_name=section.sheet_name,
                    row_start=section.row_start,
                    row_end=section.row_end,
                    section_title=section.section_title,
                    metadata=section.metadata,
                )
            )
    if not chunks:
        # Spreadsheet rows and other structured sections are often individually short.
        # Preserve their order and provenance instead of discarding the whole document.
        non_empty_sections = [section for section in sections if clean_text(section.text)]
        combined = clean_text("\n".join(section.text for section in non_empty_sections))
        if combined:
            first = non_empty_sections[0]
            last = non_empty_sections[-1]
            for piece in split_long_text(combined, target, overlap_size):
                piece = clean_text(piece)
                if not piece:
                    continue
                digest = hashlib.sha256(piece.encode("utf-8")).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                chunks.append(
                    TextChunk(
                        content=piece,
                        content_hash=digest,
                        token_count=estimate_tokens(piece),
                        page_number=first.page_number,
                        sheet_name=first.sheet_name,
                        row_start=first.row_start,
                        row_end=last.row_end,
                        section_title=first.section_title,
                        metadata={**first.metadata, "combined_sections": len(non_empty_sections)},
                    )
                )
    if not chunks:
        raise KnowledgeProcessingError("NO_VALID_CHUNKS", "文档没有生成有效知识片段")
    return chunks
