import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import get_current_user
from app.db import models

router = APIRouter()

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
BLOCKED_EXTENSIONS = {"exe", "bat", "sh", "cmd", "com", "scr", "ps1", "vbs", "js", "jar", "msi"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "./uploads/images")).resolve()
FILES_DIR = Path(os.environ.get("FILES_DIR", "./uploads/files")).resolve()


def _safe_write(base_dir: Path, user_id: str, filename: str, contents: bytes) -> Path:
    user_dir = base_dir / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / filename
    if not file_path.resolve().is_relative_to(base_dir):
        raise HTTPException(status_code=400, detail="Invalid file path")
    try:
        file_path.write_bytes(contents)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to save uploaded file") from exc
    return file_path


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, str]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' is not allowed. Allowed: {sorted(ALLOWED_IMAGE_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image size exceeds 5 MB limit")

    timestamp = int(datetime.now(timezone.utc).timestamp())
    random_suffix = uuid.uuid4().hex[:6]
    filename = f"{timestamp}-{random_suffix}.{ext}"
    _safe_write(UPLOAD_DIR, str(current_user.id), filename, contents)

    url = f"/api/v1/uploads/images/{current_user.id}/{filename}"
    return {"url": url}


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, str | int]:
    original_name = file.filename or "upload"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit")

    timestamp = int(datetime.now(timezone.utc).timestamp())
    random_suffix = uuid.uuid4().hex[:6]
    safe_name = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original_name)
    filename = f"{timestamp}-{random_suffix}-{safe_name}"
    _safe_write(FILES_DIR, str(current_user.id), filename, contents)

    url = f"/api/v1/uploads/files/{current_user.id}/{filename}"
    return {
        "url": url,
        "name": original_name,
        "size": len(contents),
        "mimeType": file.content_type or "application/octet-stream",
    }
