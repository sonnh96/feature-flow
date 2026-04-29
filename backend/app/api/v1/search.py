from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.features import feature_to_dict
from app.db import models
from app.db.session import get_db


router = APIRouter()


def score_feature(feature: dict, terms: list[str]) -> tuple[float, list[str]]:
    if not terms:
        return 0.1, []
    weighted_fields = [
        ("name", 5.0),
        ("code", 4.0),
        ("short_description", 2.5),
        ("long_description", 1.5),
        ("markdown_content", 1.5),
        ("tags", 2.0),
        ("feature_type", 1.0),
    ]
    score = 0.0
    matched_fields: set[str] = set()
    for field_name, weight in weighted_fields:
        value = feature.get(field_name)
        if isinstance(value, list):
            haystack = " ".join(str(item) for item in value).lower()
        else:
            haystack = str(value or "").lower()
        hits = sum(1 for term in terms if term in haystack)
        if hits:
            score += weight * hits
            matched_fields.add(field_name)
    if feature.get("review_status") == "approved":
        score += 1.0
    score += min(float(feature.get("confidence_score") or 0), 1.0)
    return score, sorted(matched_fields)


@router.get("")
@router.get("/")
async def global_search(
    q: str = Query(default=""),
    project_id: UUID | None = None,
    status: str | None = None,
    review_status: str | None = None,
    feature_type: str | None = None,
    min_confidence: float | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(models.Feature)
    if project_id:
        query = query.where(models.Feature.project_id == project_id)
    if status:
        query = query.where(models.Feature.status == status)
    if review_status:
        query = query.where(models.Feature.review_status == review_status)
    if feature_type:
        query = query.where(models.Feature.feature_type == feature_type)
    if min_confidence is not None:
        query = query.where(models.Feature.confidence_score >= min_confidence)

    result = await db.execute(query)
    terms = [term.lower() for term in q.split() if term.strip()]
    ranked = []
    for feature in result.scalars().all():
        row = feature_to_dict(feature)
        score, matched_fields = score_feature(row, terms)
        if terms and score <= min(float(row.get("confidence_score") or 0), 1.0):
            continue
        row["matched_fields"] = matched_fields
        row["score"] = round(score, 3)
        ranked.append(row)

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return {
        "query": q,
        "scope": "project" if project_id else "all",
        "total": len(ranked),
        "results": ranked[:limit],
    }
