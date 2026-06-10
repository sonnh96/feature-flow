from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import re
from typing import Any
from uuid import UUID
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.services.feature_intelligence import next_feature_code


SUPPORTED_EXTENSIONS = {".md", ".markdown", ".txt"}
ZIP_EXTENSIONS = {".zip"}
MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024
MAX_IMPORT_TOTAL_BYTES = 50 * 1024 * 1024
MAX_IMPORT_FILES = 1000


@dataclass(frozen=True)
class ImportDocument:
    path: PurePosixPath
    content: str


@dataclass
class ImportResult:
    created: list[models.Feature]
    skipped: list[dict[str, str]]
    total_documents: int


def _safe_path(value: str) -> PurePosixPath:
    normalized = value.replace("\\", "/").strip("/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=400, detail=f"Invalid import path: {value}")
    return path


def _repair_zip_name(value: str) -> str:
    try:
        repaired = value.encode("cp437").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    return repaired if repaired != value and "\ufffd" not in repaired else value


def _decode_text(contents: bytes, source_name: str) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            return contents.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail=f"Unable to decode text file: {source_name}")


def _strip_common_root(documents: list[ImportDocument]) -> list[ImportDocument]:
    if not documents:
        return documents
    first_parts = [doc.path.parts[0] for doc in documents if len(doc.path.parts) > 1]
    if len(first_parts) != len(documents):
        return documents
    common = first_parts[0]
    if any(part != common for part in first_parts):
        return documents
    return [
        ImportDocument(path=PurePosixPath(*doc.path.parts[1:]), content=doc.content)
        for doc in documents
    ]


def _clean_name(value: str) -> str:
    value = re.sub(r"\.(md|markdown|txt)$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"^\s*\d+(?:\.\d+)*\s*[-._)]?\s*", "", value)
    value = value.replace("_", " ").strip()
    value = re.sub(r"\s+", " ", value)
    return value or "Untitled"


def _title_from_markdown(content: str, fallback: str) -> str:
    for line in content.splitlines():
        match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if match:
            title = match.group(1).strip()
            title = re.sub(r"^Feature\s+SRS\s*[—:-]\s*", "", title, flags=re.IGNORECASE)
            return _clean_name(title)
    return _clean_name(fallback)


def _first_paragraph(content: str) -> str | None:
    lines: list[str] = []
    in_code = False
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not line:
            if lines:
                break
            continue
        if line.startswith("#") or line.startswith("|") or line.startswith("---"):
            continue
        if re.match(r"^[-*]\s+", line) or re.match(r"^\d+\.\s+", line):
            if lines:
                break
            continue
        lines.append(line)
    paragraph = " ".join(lines).strip()
    return paragraph or None


def _document_info(content: str) -> dict[str, str]:
    info: dict[str, str] = {}
    for line in content.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        key = cells[0].lower()
        value = cells[1].strip()
        if key in {"feature name", "feature id", "domain", "status"} and value and set(value) != {"-"}:
            info[key] = value
    return info


def _section_lines(content: str, heading_words: tuple[str, ...]) -> list[str]:
    lines = content.splitlines()
    selected: list[str] = []
    collecting = False
    heading_level = 0
    for line in lines:
        heading = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).lower()
            if collecting and level <= heading_level:
                break
            if all(word in title for word in heading_words):
                collecting = True
                heading_level = level
                continue
        if collecting:
            selected.append(line)
    return selected


def _list_items(lines: list[str], limit: int = 20) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in lines:
        stripped = line.strip()
        match = re.match(r"^(?:[-*]|\d+[.)])\s+(.+)$", stripped)
        if match:
            items.append({"text": match.group(1).strip(), "done": False})
        elif stripped.startswith("|") and "Rule" not in stripped and "---" not in stripped:
            cells = [cell.strip() for cell in stripped.strip("|").split("|")]
            if len(cells) >= 2 and cells[1]:
                items.append({"text": cells[1], "done": False})
        if len(items) >= limit:
            break
    return items


def _business_rules(content: str) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for item in _list_items(_section_lines(content, ("business", "rules")), limit=50):
        rules.append({"rule": item["text"]})
    return rules


def _acceptance_criteria(content: str) -> list[dict[str, Any]]:
    criteria = _list_items(_section_lines(content, ("acceptance", "criteria")), limit=30)
    if criteria:
        return criteria
    return _list_items(_section_lines(content, ("success", "criteria")), limit=30)


async def read_import_documents(files: list[UploadFile]) -> list[ImportDocument]:
    documents: list[ImportDocument] = []
    total_bytes = 0

    for upload in files:
        filename = upload.filename or "upload"
        upload_path = _safe_path(filename)
        suffix = upload_path.suffix.lower()
        contents = await upload.read()
        total_bytes += len(contents)
        if total_bytes > MAX_IMPORT_TOTAL_BYTES:
            raise HTTPException(status_code=400, detail="Import payload exceeds 50 MB limit")

        if suffix in ZIP_EXTENSIONS:
            documents.extend(_documents_from_zip(contents, filename))
            continue
        if suffix not in SUPPORTED_EXTENSIONS:
            continue
        if len(contents) > MAX_IMPORT_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"Import file exceeds 5 MB limit: {filename}")
        documents.append(ImportDocument(path=upload_path, content=_decode_text(contents, filename)))

    if len(documents) > MAX_IMPORT_FILES:
        raise HTTPException(status_code=400, detail=f"Import supports at most {MAX_IMPORT_FILES} documents")
    if not documents:
        raise HTTPException(status_code=400, detail="No supported SRS documents found. Upload .md, .txt, or .zip files.")
    return _strip_common_root(sorted(documents, key=lambda item: str(item.path).lower()))


def _documents_from_zip(contents: bytes, filename: str) -> list[ImportDocument]:
    documents: list[ImportDocument] = []
    try:
        with ZipFile(BytesIO(contents)) as archive:
            for info in archive.infolist():
                if info.is_dir() or info.filename.startswith("__MACOSX/"):
                    continue
                path = _safe_path(_repair_zip_name(info.filename))
                if path.name in {".DS_Store", "Thumbs.db"}:
                    continue
                if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue
                if info.file_size > MAX_IMPORT_FILE_BYTES:
                    raise HTTPException(status_code=400, detail=f"Import file exceeds 5 MB limit: {info.filename}")
                documents.append(
                    ImportDocument(
                        path=path,
                        content=_decode_text(archive.read(info), info.filename),
                    )
                )
    except BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ZIP file: {filename}") from exc
    return documents


async def import_srs_documents(
    db: AsyncSession,
    *,
    project: models.Project,
    documents: list[ImportDocument],
    requested_by: str | None,
    skip_existing: bool = True,
) -> ImportResult:
    existing_result = await db.execute(
        select(models.Feature).where(models.Feature.project_id == project.id)
    )
    existing_features = existing_result.scalars().all()
    existing_codes = {feature.feature_code for feature in existing_features if feature.feature_code}
    feature_by_parent_name: dict[tuple[str | None, str], models.Feature] = {
        (str(feature.parent_id) if feature.parent_id else None, feature.name.lower()): feature
        for feature in existing_features
    }

    dir_features: dict[tuple[str, ...], models.Feature] = {}
    created: list[models.Feature] = []
    skipped: list[dict[str, str]] = []

    async def ensure_directory(parts: tuple[str, ...]) -> models.Feature | None:
        parent: models.Feature | None = None
        current_parts: list[str] = []
        for depth, part in enumerate(parts):
            current_parts.append(part)
            key = tuple(current_parts)
            if key in dir_features:
                parent = dir_features[key]
                continue
            parent_key = str(parent.id) if parent else None
            name = _clean_name(part)
            lookup = (parent_key, name.lower())
            existing = feature_by_parent_name.get(lookup)
            if existing:
                dir_features[key] = existing
                parent = existing
                continue
            parent_code = parent.feature_code if parent else None
            feature = models.Feature(
                project_id=project.id,
                parent_id=parent.id if parent else None,
                feature_code=next_feature_code(project.name, existing_codes, parent_code),
                name=name,
                short_description=f"Imported SRS group for {name}.",
                long_description=f"Imported from SRS folder: {'/'.join(current_parts)}",
                markdown_content=f"# {name}\n\nImported SRS group.",
                feature_type="epic" if depth == 0 else "feature",
                status="todo",
                review_status="draft",
                priority="medium",
                tags=["srs-import"],
                generated_by="srs-import",
                created_by=requested_by,
                metadata_json={"import": {"source_type": "srs_folder", "source_path": "/".join(current_parts)}},
            )
            db.add(feature)
            await db.flush()
            _add_history(db, feature, requested_by=requested_by, source_path="/".join(current_parts))
            feature_by_parent_name[lookup] = feature
            dir_features[key] = feature
            created.append(feature)
            parent = feature
        return parent

    for index, document in enumerate(documents):
        parent = await ensure_directory(tuple(document.path.parts[:-1]))
        parent_key = str(parent.id) if parent else None
        info = _document_info(document.content)
        name = _clean_name(info.get("feature name") or _title_from_markdown(document.content, document.path.stem))
        lookup = (parent_key, name.lower())
        if skip_existing and lookup in feature_by_parent_name:
            skipped.append({"path": str(document.path), "reason": "Feature already exists under the same parent"})
            continue
        explicit_code = info.get("feature id")
        feature_code = explicit_code if explicit_code and explicit_code not in existing_codes else None
        if feature_code:
            existing_codes.add(feature_code)
        else:
            feature_code = next_feature_code(project.name, existing_codes, parent.feature_code if parent else None)
        short_description = _first_paragraph(document.content)
        feature = models.Feature(
            project_id=project.id,
            parent_id=parent.id if parent else None,
            feature_code=feature_code,
            name=name,
            short_description=short_description,
            long_description=short_description,
            markdown_content=document.content,
            feature_type="sub_feature" if parent else "feature",
            status="todo",
            review_status="draft",
            priority="medium",
            position=index,
            tags=["srs-import", *[_clean_name(part).lower() for part in document.path.parts[:-1]]],
            acceptance_criteria=_acceptance_criteria(document.content),
            business_rules=_business_rules(document.content),
            generated_by="srs-import",
            created_by=requested_by,
            metadata_json={
                "import": {
                    "source_type": "srs_document",
                    "source_path": str(document.path),
                    "domain": info.get("domain"),
                    "status": info.get("status"),
                }
            },
        )
        db.add(feature)
        await db.flush()
        _add_history(db, feature, requested_by=requested_by, source_path=str(document.path))
        db.add(
            models.FeatureEvidence(
                feature_id=feature.id,
                evidence_type="srs_document",
                source_ref=str(document.path),
                source_label=document.path.name,
                confidence=1.0,
                notes="Imported from SRS document.",
                payload={"path": str(document.path), "domain": info.get("domain")},
            )
        )
        feature_by_parent_name[lookup] = feature
        created.append(feature)

    await db.commit()
    return ImportResult(created=created, skipped=skipped, total_documents=len(documents))


def _add_history(
    db: AsyncSession,
    feature: models.Feature,
    *,
    requested_by: str | None,
    source_path: str,
) -> None:
    db.add(
        models.FeatureHistory(
            feature_id=feature.id,
            event_type="FeatureImported",
            field_name="import_source",
            new_value=source_path,
            changed_by=requested_by,
            notes="Feature created from SRS import.",
        )
    )
