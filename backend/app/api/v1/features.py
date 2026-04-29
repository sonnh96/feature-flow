from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.rbac import require_permission
from app.db.models import User
from app.db import models
from app.schemas import (
    FeatureCreate,
    FeatureRelationCreate,
    FeatureUpdate,
    MergeAction,
    ReparentAction,
    ReviewAction,
    SplitAction,
)
from app.services.feature_intelligence import next_feature_code


router = APIRouter()

RELATION_ALIASES = {
    "related_to": "relates_to",
    "duplicates": "duplicate_of",
}
ALLOWED_RELATIONS = {"relates_to", "depends_on", "blocks", "duplicate_of", "references"}


def payload_dict(payload: Any, *, exclude_unset: bool = True) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=exclude_unset)
    return payload.dict(exclude_unset=exclude_unset)


def serialize_dt(value):
    return value.isoformat() if value else None


def normalize_relation_type(value: str) -> str:
    normalized = RELATION_ALIASES.get(value, value)
    if normalized not in ALLOWED_RELATIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported relation_type: {value}")
    return normalized


def feature_to_dict(feature: models.Feature) -> dict[str, Any]:
    code = feature.feature_code
    return {
        "id": str(feature.id),
        "project_id": str(feature.project_id),
        "parent_id": str(feature.parent_id) if feature.parent_id else None,
        "code": code,
        "feature_code": code,
        "name": feature.name,
        "short_description": feature.short_description,
        "long_description": feature.long_description,
        "markdown_content": feature.markdown_content,
        "description": feature.short_description or feature.markdown_content or "",
        "feature_type": feature.feature_type,
        "status": feature.status,
        "review_status": feature.review_status,
        "priority": feature.priority,
        "assignee": feature.assignee,
        "assignee_id": str(feature.assignee_id) if feature.assignee_id else None,
        "tags": feature.tags or [],
        "acceptance_criteria": feature.acceptance_criteria or [],
        "business_rules": feature.business_rules or [],
        "target_date": feature.target_date.isoformat() if feature.target_date else None,
        "position": feature.position,
        "confidence_score": feature.confidence_score,
        "current_version": feature.current_version,
        "generated_by": feature.generated_by,
        "approved_by": feature.approved_by,
        "created_by": feature.created_by,
        "updated_by": feature.updated_by,
        "metadata": feature.metadata_json,
        "created_at": serialize_dt(feature.created_at),
        "updated_at": serialize_dt(feature.updated_at),
    }


def relation_to_dict(relation: models.FeatureRelation) -> dict[str, Any]:
    return {
        "id": str(relation.id),
        "source_feature_id": str(relation.source_feature_id),
        "target_feature_id": str(relation.target_feature_id),
        "relation_type": relation.relation_type,
        "confidence": relation.confidence,
        "created_by": relation.created_by,
        "created_at": serialize_dt(relation.created_at),
        "updated_at": serialize_dt(relation.updated_at),
    }


def evidence_to_dict(evidence: models.FeatureEvidence) -> dict[str, Any]:
    return {
        "id": str(evidence.id),
        "feature_id": str(evidence.feature_id),
        "evidence_type": evidence.evidence_type,
        "source_ref": evidence.source_ref,
        "source_label": evidence.source_label,
        "confidence": evidence.confidence,
        "notes": evidence.notes,
        "payload": evidence.payload,
        "created_at": serialize_dt(evidence.created_at),
    }


def history_to_dict(entry: models.FeatureHistory) -> dict[str, Any]:
    return {
        "id": str(entry.id),
        "feature_id": str(entry.feature_id),
        "event_type": entry.event_type,
        "field_name": entry.field_name,
        "old_value": entry.old_value,
        "new_value": entry.new_value,
        "commit_ref": entry.commit_ref,
        "changed_by": entry.changed_by,
        "changed_at": serialize_dt(entry.changed_at),
        "notes": entry.notes,
    }


async def get_feature_or_404(db: AsyncSession, feature_id: UUID) -> models.Feature:
    feature = await db.get(models.Feature, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature


async def validate_parent(
    db: AsyncSession,
    *,
    project_id: UUID,
    feature_id: UUID | None,
    parent_id: UUID | None,
) -> None:
    if parent_id is None:
        return
    if feature_id and parent_id == feature_id:
        raise HTTPException(status_code=422, detail="A feature cannot be its own parent")
    parent = await db.get(models.Feature, parent_id)
    if not parent or parent.project_id != project_id:
        raise HTTPException(status_code=422, detail="Parent feature must belong to the same project")
    cursor = parent
    while cursor.parent_id:
        if feature_id and cursor.parent_id == feature_id:
            raise HTTPException(status_code=422, detail="Circular feature hierarchy is not allowed")
        cursor = await db.get(models.Feature, cursor.parent_id)
        if cursor is None:
            break


async def generate_code(db: AsyncSession, project: models.Project, parent_id: UUID | None) -> str:
    result = await db.execute(select(models.Feature).where(models.Feature.project_id == project.id))
    features = result.scalars().all()
    existing_codes = {feature.feature_code for feature in features if feature.feature_code}
    parent_code = None
    if parent_id:
        parent = await db.get(models.Feature, parent_id)
        parent_code = parent.feature_code if parent else None
    return next_feature_code(project.name, existing_codes, parent_code)


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return str(value)


def add_history(
    db: AsyncSession,
    feature: models.Feature,
    *,
    event_type: str,
    field_name: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
    changed_by: str | None = None,
    notes: str | None = None,
) -> None:
    db.add(
        models.FeatureHistory(
            feature_id=feature.id,
            event_type=event_type,
            field_name=field_name,
            old_value=stringify(old_value),
            new_value=stringify(new_value),
            changed_by=changed_by,
            notes=notes,
        )
    )


@router.get("/")
async def list_features(
    project_id: UUID,
    parent_id: str | None = Query(default=None),
    status: str | None = None,
    review_status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(models.Feature).where(models.Feature.project_id == project_id)
    if parent_id == "null":
        query = query.where(models.Feature.parent_id.is_(None))
    elif parent_id:
        query = query.where(models.Feature.parent_id == UUID(parent_id))
    if status:
        query = query.where(models.Feature.status == status)
    if review_status:
        query = query.where(models.Feature.review_status == review_status)
    result = await db.execute(query.order_by(models.Feature.position, models.Feature.created_at))
    return [feature_to_dict(feature) for feature in result.scalars().all()]


@router.post("/")
async def create_feature(project_id: UUID, payload: FeatureCreate, current_user: User = Depends(require_permission("feature", "create")), db: AsyncSession = Depends(get_db)):
    project = await db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = payload_dict(payload)
    parent_id = data.pop("parent_id", None)
    await validate_parent(db, project_id=project.id, feature_id=None, parent_id=parent_id)
    explicit_code = data.pop("code", None) or data.pop("feature_code", None)
    metadata = data.pop("metadata", None)
    feature = models.Feature(
        project_id=project_id,
        parent_id=parent_id,
        feature_code=explicit_code or await generate_code(db, project, parent_id),
        metadata_json=metadata,
        **data,
    )
    db.add(feature)
    await db.flush()
    add_history(
        db,
        feature,
        event_type="FeatureCreated",
        field_name="name",
        new_value=feature.name,
        changed_by=feature.created_by,
        notes="Feature created manually.",
    )
    await db.commit()
    await db.refresh(feature)
    return feature_to_dict(feature)


@router.get("/{feature_id}")
async def get_feature(feature_id: UUID, current_user: User = Depends(require_permission("feature", "read")), db: AsyncSession = Depends(get_db)):
    feature = await get_feature_or_404(db, feature_id)
    response = feature_to_dict(feature)
    evidence_result = await db.execute(
        select(models.FeatureEvidence).where(models.FeatureEvidence.feature_id == feature_id)
    )
    relation_result = await db.execute(
        select(models.FeatureRelation).where(
            (models.FeatureRelation.source_feature_id == feature_id)
            | (models.FeatureRelation.target_feature_id == feature_id)
        )
    )
    response["evidence"] = [evidence_to_dict(item) for item in evidence_result.scalars().all()]
    response["relations"] = [relation_to_dict(item) for item in relation_result.scalars().all()]
    return response


@router.patch("/{feature_id}")
async def update_feature(feature_id: UUID, payload: FeatureUpdate, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    feature = await get_feature_or_404(db, feature_id)
    data = payload_dict(payload)
    changed_by = data.pop("updated_by", None)
    change_comment = data.pop("change_comment", None)
    if "code" in data:
        data["feature_code"] = data.pop("code")
    if "metadata" in data:
        data["metadata_json"] = data.pop("metadata")
    if "parent_id" in data:
        await validate_parent(
            db,
            project_id=feature.project_id,
            feature_id=feature.id,
            parent_id=data["parent_id"],
        )
    tracked_changes = 0
    for field_name, new_value in data.items():
        if not hasattr(feature, field_name):
            continue
        old_value = getattr(feature, field_name)
        if old_value == new_value:
            continue
        setattr(feature, field_name, new_value)
        add_history(
            db,
            feature,
            event_type="FeatureFieldChanged",
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            changed_by=changed_by,
            notes=change_comment,
        )
        tracked_changes += 1
    if tracked_changes:
        feature.current_version += 1
        if changed_by:
            feature.updated_by = changed_by
    await db.commit()
    await db.refresh(feature)
    return feature_to_dict(feature)


@router.delete("/{feature_id}")
async def delete_feature(
    feature_id: UUID,
    cascade: bool = False,
    current_user: User = Depends(require_permission("feature", "delete")), db: AsyncSession = Depends(get_db),
):
    feature = await get_feature_or_404(db, feature_id)
    children_result = await db.execute(select(models.Feature).where(models.Feature.parent_id == feature_id))
    children = children_result.scalars().all()
    if children and not cascade:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a parent feature while it has children. Use cascade=true to delete the subtree.",
        )
    await db.delete(feature)
    await db.commit()
    return {"deleted": str(feature_id), "cascade": cascade}


@router.get("/{feature_id}/evidence")
async def list_feature_evidence(feature_id: UUID, current_user: User = Depends(require_permission("feature", "read")), db: AsyncSession = Depends(get_db)):
    await get_feature_or_404(db, feature_id)
    result = await db.execute(
        select(models.FeatureEvidence)
        .where(models.FeatureEvidence.feature_id == feature_id)
        .order_by(models.FeatureEvidence.created_at.desc())
    )
    return [evidence_to_dict(item) for item in result.scalars().all()]


@router.get("/{feature_id}/relations")
async def list_feature_relations(feature_id: UUID, current_user: User = Depends(require_permission("feature", "read")), db: AsyncSession = Depends(get_db)):
    await get_feature_or_404(db, feature_id)
    result = await db.execute(
        select(models.FeatureRelation).where(
            (models.FeatureRelation.source_feature_id == feature_id)
            | (models.FeatureRelation.target_feature_id == feature_id)
        )
    )
    return [relation_to_dict(item) for item in result.scalars().all()]


@router.post("/{feature_id}/relations")
async def create_feature_relation(
    feature_id: UUID,
    payload: FeatureRelationCreate,
    current_user: User = Depends(require_permission("feature", "update")),
    db: AsyncSession = Depends(get_db),
):
    source = await get_feature_or_404(db, feature_id)
    target = await get_feature_or_404(db, payload.target_feature_id)
    if source.project_id != target.project_id:
        raise HTTPException(status_code=422, detail="Related features must belong to the same project")
    if source.id == target.id:
        raise HTTPException(status_code=422, detail="A feature cannot be related to itself")
    relation_type = normalize_relation_type(payload.relation_type)
    existing_result = await db.execute(
        select(models.FeatureRelation).where(
            models.FeatureRelation.source_feature_id == source.id,
            models.FeatureRelation.target_feature_id == target.id,
            models.FeatureRelation.relation_type == relation_type,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return relation_to_dict(existing)
    relation = models.FeatureRelation(
        source_feature_id=source.id,
        target_feature_id=target.id,
        relation_type=relation_type,
        confidence=payload.confidence,
        created_by=payload.created_by,
    )
    db.add(relation)
    add_history(
        db,
        source,
        event_type="RelationAdded",
        field_name="relation",
        new_value=f"{relation_type}:{target.id}",
        changed_by=payload.created_by,
    )
    await db.commit()
    await db.refresh(relation)
    return relation_to_dict(relation)


@router.delete("/relations/{relation_id}")
async def delete_feature_relation(relation_id: UUID, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    relation = await db.get(models.FeatureRelation, relation_id)
    if not relation:
        raise HTTPException(status_code=404, detail="Relation not found")
    source_id = relation.source_feature_id
    await db.delete(relation)
    source = await db.get(models.Feature, source_id)
    if source:
        add_history(
            db,
            source,
            event_type="RelationRemoved",
            field_name="relation",
            old_value=str(relation_id),
        )
    await db.commit()
    return {"deleted": str(relation_id)}


@router.get("/{feature_id}/history")
async def list_feature_history(
    feature_id: UUID,
    event_type: str | None = None,
    field_name: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    await get_feature_or_404(db, feature_id)
    query = select(models.FeatureHistory).where(models.FeatureHistory.feature_id == feature_id)
    if event_type:
        query = query.where(models.FeatureHistory.event_type == event_type)
    if field_name:
        query = query.where(models.FeatureHistory.field_name == field_name)
    result = await db.execute(query.order_by(models.FeatureHistory.changed_at.desc()))
    return [history_to_dict(item) for item in result.scalars().all()]


@router.post("/{feature_id}/approve")
async def approve_feature(feature_id: UUID, payload: ReviewAction, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    feature = await get_feature_or_404(db, feature_id)
    feature.review_status = "approved"
    feature.approved_by = payload.reviewer
    add_history(
        db,
        feature,
        event_type="FeatureApproved",
        field_name="review_status",
        old_value="needs_review",
        new_value="approved",
        changed_by=payload.reviewer,
        notes=payload.notes,
    )
    tasks_result = await db.execute(
        select(models.ReviewTask).where(
            models.ReviewTask.feature_id == feature_id,
            models.ReviewTask.status == "open",
        )
    )
    for task in tasks_result.scalars().all():
        task.status = "resolved"
        task.reviewer = payload.reviewer
        task.resolution_notes = payload.notes
    await db.commit()
    await db.refresh(feature)
    return feature_to_dict(feature)


@router.post("/{feature_id}/reject")
async def reject_feature(feature_id: UUID, payload: ReviewAction, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    feature = await get_feature_or_404(db, feature_id)
    old_status = feature.review_status
    feature.review_status = "rejected"
    add_history(
        db,
        feature,
        event_type="FeatureRejected",
        field_name="review_status",
        old_value=old_status,
        new_value="rejected",
        changed_by=payload.reviewer,
        notes=payload.notes,
    )
    await db.commit()
    await db.refresh(feature)
    return feature_to_dict(feature)


@router.post("/{feature_id}/reparent")
async def reparent_feature(feature_id: UUID, payload: ReparentAction, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    feature = await get_feature_or_404(db, feature_id)
    await validate_parent(
        db,
        project_id=feature.project_id,
        feature_id=feature.id,
        parent_id=payload.parent_id,
    )
    old_parent = feature.parent_id
    feature.parent_id = payload.parent_id
    feature.review_status = "needs_review"
    add_history(
        db,
        feature,
        event_type="FeatureReparented",
        field_name="parent_id",
        old_value=old_parent,
        new_value=payload.parent_id,
        changed_by=payload.reviewer,
        notes=payload.notes,
    )
    await db.commit()
    await db.refresh(feature)
    return feature_to_dict(feature)


@router.post("/{feature_id}/merge")
async def merge_feature(feature_id: UUID, payload: MergeAction, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    source = await get_feature_or_404(db, feature_id)
    target = await get_feature_or_404(db, payload.target_feature_id)
    if source.project_id != target.project_id:
        raise HTTPException(status_code=422, detail="Features must belong to the same project")
    source.review_status = "rejected"
    source.status = "deprecated"
    relation = models.FeatureRelation(
        source_feature_id=source.id,
        target_feature_id=target.id,
        relation_type="duplicate_of",
        confidence=1.0,
        created_by=payload.reviewer,
    )
    db.add(relation)
    add_history(
        db,
        source,
        event_type="FeatureMerged",
        field_name="merged_into",
        new_value=target.id,
        changed_by=payload.reviewer,
        notes=payload.notes,
    )
    await db.commit()
    return {"source": feature_to_dict(source), "target": feature_to_dict(target)}


@router.post("/{feature_id}/split")
async def split_feature(feature_id: UUID, payload: SplitAction, current_user: User = Depends(require_permission("feature", "update")), db: AsyncSession = Depends(get_db)):
    parent = await get_feature_or_404(db, feature_id)
    project = await db.get(models.Project, parent.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    created = []
    for item in payload.items:
        feature = models.Feature(
            project_id=parent.project_id,
            parent_id=parent.id,
            feature_code=await generate_code(db, project, parent.id),
            name=item.name,
            short_description=item.short_description,
            long_description=item.short_description,
            markdown_content=item.short_description,
            feature_type=item.feature_type,
            review_status="needs_review",
            generated_by="review:split",
            created_by=payload.reviewer,
        )
        db.add(feature)
        await db.flush()
        add_history(
            db,
            feature,
            event_type="FeatureCreated",
            field_name="split_from",
            new_value=parent.id,
            changed_by=payload.reviewer,
            notes=payload.notes,
        )
        created.append(feature_to_dict(feature))
    add_history(
        db,
        parent,
        event_type="FeatureSplit",
        field_name="children",
        new_value=[item["id"] for item in created],
        changed_by=payload.reviewer,
        notes=payload.notes,
    )
    await db.commit()
    return {"parent": feature_to_dict(parent), "created": created}
