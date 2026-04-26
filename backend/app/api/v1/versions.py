from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.features import add_history
from app.db.session import get_db
from app.core.rbac import require_permission
from app.db.models import User
from app.db import models
from app.schemas import FeatureVersionCreate


router = APIRouter()


def version_to_dict(version: models.FeatureVersion) -> dict:
    return {
        "id": str(version.id),
        "feature_id": str(version.feature_id),
        "version": version.version_number,
        "version_number": version.version_number,
        "content_markdown": version.content_markdown,
        "summary_snapshot": version.summary_snapshot,
        "detail_snapshot": version.detail_snapshot,
        "generated_from_commit": version.generated_from_commit,
        "author_id": version.author_id,
        "commit_message": version.commit_message,
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }


@router.post("/")
async def create_version(
    feature_id: UUID,
    payload: FeatureVersionCreate,
    current_user: User = Depends(require_permission("version", "create")), db: AsyncSession = Depends(get_db),
):
    feature = await db.get(models.Feature, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")
    result = await db.execute(
        select(models.FeatureVersion)
        .where(models.FeatureVersion.feature_id == feature_id)
        .order_by(models.FeatureVersion.version_number.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    next_version = (last.version_number + 1) if last else 1
    version = models.FeatureVersion(
        feature_id=feature_id,
        version_number=next_version,
        content_markdown=payload.content,
        author_id=payload.author_id,
        commit_message=payload.commit_message,
        summary_snapshot=payload.summary_snapshot,
        detail_snapshot=payload.detail_snapshot,
        generated_from_commit=payload.generated_from_commit,
    )
    db.add(version)
    feature.markdown_content = payload.content
    feature.current_version = next_version
    add_history(
        db,
        feature,
        event_type="FeatureVersionCreated",
        field_name="current_version",
        old_value=(next_version - 1) if next_version > 1 else None,
        new_value=next_version,
        changed_by=payload.author_id,
        notes=payload.commit_message,
    )
    await db.commit()
    await db.refresh(version)
    return version_to_dict(version)


@router.get("/")
async def list_versions(feature_id: UUID, current_user: User = Depends(require_permission("version", "read")), db: AsyncSession = Depends(get_db)):
    feature = await db.get(models.Feature, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")
    result = await db.execute(
        select(models.FeatureVersion)
        .where(models.FeatureVersion.feature_id == feature_id)
        .order_by(models.FeatureVersion.version_number.desc())
    )
    return [version_to_dict(row) for row in result.scalars().all()]
