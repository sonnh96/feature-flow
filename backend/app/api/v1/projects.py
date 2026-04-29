from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.features import feature_to_dict
from app.db.session import get_db
from app.core.rbac import require_permission
from app.db.models import User
from app.db import models
from app.schemas import GitNexusIngestRequest, ProjectCreate, ProjectSyncRequest, ProjectUpdate
from app.services.feature_intelligence import sync_project_from_snapshot
from app.services.gitnexus_reader import GitNexusReaderError, build_project_sync_request_from_gitnexus


router = APIRouter()


def project_to_dict(project: models.Project) -> dict:
    meta = getattr(project, "metadata_json", None)
    if isinstance(meta, sa.MetaData):
        meta = None
    if not isinstance(meta, dict):
        try:
            meta = dict(meta) if meta is not None else None
        except Exception:
            meta = None

    return {
        "id": str(project.id),
        "external_repo_name": project.external_repo_name,
        "name": project.name,
        "description_markdown": project.description_markdown,
        "status": project.status,
        "source_type": project.source_type,
        "metadata": meta,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def review_task_to_dict(task: models.ReviewTask) -> dict:
    return {
        "id": str(task.id),
        "feature_id": str(task.feature_id),
        "issue_type": task.issue_type,
        "status": task.status,
        "reviewer": task.reviewer,
        "resolution_notes": task.resolution_notes,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "resolved_at": task.resolved_at.isoformat() if task.resolved_at else None,
    }


@router.get("/")
async def list_projects(current_user: User = Depends(require_permission("project", "read")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).order_by(models.Project.updated_at.desc()))
    projects = result.scalars().all()
    return [project_to_dict(project) for project in projects]


@router.post("/")
async def create_project(payload: ProjectCreate, current_user: User = Depends(require_permission("project", "create")), db: AsyncSession = Depends(get_db)):
    project = models.Project(
        name=payload.name,
        description_markdown=payload.description_markdown,
        external_repo_name=payload.external_repo_name,
        source_type=payload.source_type,
        metadata_json=payload.metadata,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project_to_dict(project)


@router.post("/sync")
async def sync_project(payload: ProjectSyncRequest, current_user: User = Depends(require_permission("project", "update")), db: AsyncSession = Depends(get_db)):
    return await sync_project_from_snapshot(db, payload)


@router.post("/sync/gitnexus")
async def sync_project_from_gitnexus(payload: GitNexusIngestRequest, current_user: User = Depends(require_permission("project", "update")), db: AsyncSession = Depends(get_db)):
    try:
        snapshot = build_project_sync_request_from_gitnexus(payload)
    except GitNexusReaderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await sync_project_from_snapshot(db, snapshot)


@router.get("/{project_id}")
async def get_project(project_id: UUID, current_user: User = Depends(require_permission("project", "read")), db: AsyncSession = Depends(get_db)):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_to_dict(project)


@router.patch("/{project_id}")
async def update_project(project_id: UUID, payload: ProjectUpdate, current_user: User = Depends(require_permission("project", "update")), db: AsyncSession = Depends(get_db)):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    if "metadata" in data:
        data["metadata_json"] = data.pop("metadata")
    for field_name, value in data.items():
        if hasattr(project, field_name):
            setattr(project, field_name, value)
    await db.commit()
    await db.refresh(project)
    return project_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(project_id: UUID, current_user: User = Depends(require_permission("project", "delete")), db: AsyncSession = Depends(get_db)):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
    return {"deleted": str(project_id)}


@router.get("/{project_id}/features")
async def list_project_features(
    project_id: UUID,
    hierarchy: bool = False,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    result = await db.execute(
        select(models.Feature)
        .where(models.Feature.project_id == project_id)
        .order_by(models.Feature.position, models.Feature.created_at)
    )
    features = [feature_to_dict(feature) for feature in result.scalars().all()]
    if not hierarchy:
        return features
    by_id = {feature["id"]: {**feature, "children": []} for feature in features}
    roots = []
    for feature in by_id.values():
        parent_id = feature["parent_id"]
        if parent_id and parent_id in by_id:
            by_id[parent_id]["children"].append(feature)
        else:
            roots.append(feature)
    return roots


@router.get("/{project_id}/review-tasks")
async def list_project_review_tasks(
    project_id: UUID,
    status: str | None = "open",
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    query = (
        select(models.ReviewTask)
        .join(models.Feature, models.Feature.id == models.ReviewTask.feature_id)
        .where(models.Feature.project_id == project_id)
        .order_by(models.ReviewTask.created_at.desc())
    )
    if status:
        query = query.where(models.ReviewTask.status == status)
    result = await db.execute(query)
    return [review_task_to_dict(task) for task in result.scalars().all()]
