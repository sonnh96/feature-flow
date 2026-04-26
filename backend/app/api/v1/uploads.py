import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import get_current_user
from app.db import models

router = APIRouter()

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads/images")


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    # Validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # Validate extension
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File extension '{ext}' is not allowed. Allowed: {ALLOWED_EXTENSIONS}")

    # Read file and check size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 5 MB limit")

    # Build path
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    timestamp = int(datetime.utcnow().timestamp())
    random_suffix = uuid.uuid4().hex[:6]
    filename = f"{timestamp}-{random_suffix}.{ext}"
    file_path = os.path.join(user_dir, filename)

    # Write file
    with open(file_path, "wb") as f:
        f.write(contents)

    # Return URL path
    url = f"/api/v1/uploads/images/{current_user.id}/{filename}"
    return {"url": url}
