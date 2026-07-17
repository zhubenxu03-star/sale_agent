from __future__ import annotations

import hashlib
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import AppException

MIME_TYPES = {
    "pdf": {"application/pdf", "application/octet-stream"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
        "application/octet-stream",
    },
    "xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "application/octet-stream",
    },
    "txt": {"text/plain", "application/octet-stream"},
    "md": {"text/markdown", "text/plain", "application/octet-stream"},
    "csv": {"text/csv", "application/csv", "text/plain", "application/octet-stream"},
}


@dataclass(slots=True)
class StoredUpload:
    original_filename: str
    display_name: str
    extension: str
    mime_type: str
    size_bytes: int
    storage_key: str
    sha256: str
    absolute_path: Path


def sanitize_filename(filename: str | None) -> str:
    name = Path(filename or "file").name
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", name).strip(" .")
    return name[:255] or "file"


def resolve_storage_key(storage_key: str) -> Path:
    root = Path(settings.knowledge_storage_path).resolve()
    path = (root / storage_key).resolve()
    if root != path and root not in path.parents:
        raise AppException(400, "文件路径不安全", "UNSAFE_STORAGE_PATH")
    return path


def _validate_zip(path: Path, extension: str) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            total = sum(info.file_size for info in infos)
            max_size = settings.knowledge_office_max_uncompressed_mb * 1024 * 1024
            if len(infos) > 10_000 or total > max_size:
                raise AppException(413, "Office文件解压后体积超过限制", "OFFICE_ARCHIVE_TOO_LARGE")
            names = {item.filename for item in infos}
            required = "word/document.xml" if extension == "docx" else "xl/workbook.xml"
            if required not in names:
                raise AppException(415, "Office文件真实格式不正确", "INVALID_OFFICE_FORMAT")
    except zipfile.BadZipFile as exc:
        raise AppException(415, "Office文件真实格式不正确", "INVALID_OFFICE_FORMAT") from exc


def validate_file_format(path: Path, extension: str) -> None:
    header = path.read_bytes()[:16]
    if extension == "pdf" and not header.startswith(b"%PDF-"):
        raise AppException(415, "PDF文件真实格式不正确", "INVALID_PDF_FORMAT")
    if extension in {"docx", "xlsx"}:
        _validate_zip(path, extension)
    if extension in {"txt", "md", "csv"} and b"\x00" in path.read_bytes()[:8192]:
        raise AppException(415, "文本文件包含无效二进制内容", "INVALID_TEXT_FORMAT")


async def save_upload(upload: UploadFile, tenant_id: UUID) -> StoredUpload:
    original = sanitize_filename(upload.filename)
    extension = Path(original).suffix.lower().lstrip(".")
    if extension not in settings.knowledge_extension_set:
        raise AppException(415, "不支持该文件类型", "UNSUPPORTED_FILE_TYPE")
    mime_type = (upload.content_type or "application/octet-stream").lower()
    if mime_type not in MIME_TYPES[extension]:
        raise AppException(415, "文件MIME类型与扩展名不匹配", "INVALID_MIME_TYPE")

    storage_key = f"{tenant_id}/{uuid4().hex}.{extension}"
    path = resolve_storage_key(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    digest = hashlib.sha256()
    maximum = settings.knowledge_max_file_size_mb * 1024 * 1024
    try:
        with path.open("xb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > maximum:
                    raise AppException(413, "文件大小超过限制", "FILE_TOO_LARGE")
                digest.update(chunk)
                output.write(chunk)
        if size == 0:
            raise AppException(422, "不能上传空文件", "EMPTY_FILE")
        validate_file_format(path, extension)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
    return StoredUpload(
        original_filename=original,
        display_name=Path(original).stem[:255],
        extension=extension,
        mime_type=mime_type,
        size_bytes=size,
        storage_key=storage_key,
        sha256=digest.hexdigest(),
        absolute_path=path,
    )


def delete_stored_file(storage_key: str) -> None:
    resolve_storage_key(storage_key).unlink(missing_ok=True)
