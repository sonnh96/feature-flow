from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.schemas import ProjectSyncRequest


LOW_SIGNAL_NAMES = {"utils", "common", "shared", "helpers", "config", "styles"}


@dataclass
class EvidenceSeed:
    evidence_type: str
    source_ref: str
    source_label: str | None = None
    confidence: float = 1.0
    notes: str | None = None
    payload: dict[str, Any] | None = None


@dataclass
class FeatureSeed:
    source_key: str
    source_signal_type: str
    probable_name: str
    feature_type: str
    short_description: str
    long_description: str
    confidence: float
    parent_source_key: str | None = None
    tags: list[str] = field(default_factory=list)
    business_rules: list[dict[str, Any]] = field(default_factory=list)
    evidence: list[EvidenceSeed] = field(default_factory=list)
    related_source_keys: list[str] = field(default_factory=list)


def model_to_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value.dict()


def humanize_identifier(value: str) -> str:
    value = value.replace("_", " ").replace("-", " ").replace("/", " ")
    value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value.title() if value else "Unnamed"


def split_process_name(name: str) -> tuple[str, str | None]:
    if "->" in name:
        left, right = name.split("->", 1)
        return left.strip(), right.strip()
    if "\u2192" in name:
        left, right = name.split("\u2192", 1)
        return left.strip(), right.strip()
    return name.strip(), None


def normalize_cohesion(value: float | int | str | None) -> float:
    if value is None:
        return 0.6
    if isinstance(value, str):
        stripped = value.strip().replace("%", "")
        try:
            parsed = float(stripped)
        except ValueError:
            return 0.6
        return parsed / 100 if parsed > 1 else parsed
    return float(value) / 100 if value > 1 else float(value)


def project_prefix(name: str) -> str:
    letters = re.findall(r"[A-Za-z0-9]+", name.upper())
    if not letters:
        return "PRJ"
    if len(letters) == 1:
        return letters[0][:5].ljust(3, "X")
    return "".join(part[0] for part in letters)[:5].ljust(3, "X")


def next_feature_code(project_name: str, existing_codes: set[str], parent_code: str | None = None) -> str:
    prefix = parent_code or project_prefix(project_name)
    width = 2 if parent_code else 3
    index = 1
    while True:
        candidate = f"{prefix}-{index:0{width}d}"
        if candidate not in existing_codes:
            existing_codes.add(candidate)
            return candidate
        index += 1


def build_feature_seeds(snapshot: ProjectSyncRequest) -> list[FeatureSeed]:
    seeds: list[FeatureSeed] = []
    seed_keys: set[str] = set()

    def add(seed: FeatureSeed) -> None:
        if seed.source_key in seed_keys:
            return
        if seed.probable_name.lower() in LOW_SIGNAL_NAMES:
            return
        seed_keys.add(seed.source_key)
        seeds.append(seed)

    for cluster in snapshot.clusters:
        cohesion = normalize_cohesion(cluster.cohesion)
        symbol_count = cluster.symbols or 0
        confidence = min(0.95, 0.48 + (cohesion * 0.28) + min(symbol_count / 250, 0.19))
        display_name = humanize_identifier(cluster.name)
        add(
            FeatureSeed(
                source_key=f"cluster:{cluster.name}",
                source_signal_type="cluster",
                probable_name=display_name,
                feature_type="epic",
                short_description=f"Business capability inferred from the {display_name} GitNexus cluster.",
                long_description=(
                    f"GitNexus groups {symbol_count or 'multiple'} symbols into this cluster. "
                    "Reviewers should confirm whether the cluster maps to a product-facing capability, "
                    "a UI area, or a technical component."
                ),
                confidence=round(confidence, 2),
                tags=["gitnexus", "cluster"],
                business_rules=[
                    {
                        "text": "Generated features must remain linked to their GitNexus evidence.",
                        "confidence": 0.9,
                    }
                ],
                evidence=[
                    EvidenceSeed(
                        evidence_type="cluster",
                        source_ref=cluster.name,
                        source_label=display_name,
                        confidence=round(confidence, 2),
                        payload=model_to_dict(cluster),
                    )
                ],
            )
        )

    cluster_names = {seed.probable_name.lower(): seed.source_key for seed in seeds if seed.source_signal_type == "cluster"}
    default_parent = None
    for preferred in ("components", "app", "ui"):
        if preferred in cluster_names:
            default_parent = cluster_names[preferred]
            break
    if default_parent is None and seeds:
        default_parent = seeds[0].source_key

    process_groups: dict[str, list[str]] = {}
    for process in snapshot.processes:
        left, right = split_process_name(process.name)
        group_name = humanize_identifier(left)
        group_key = f"process-group:{left}"
        process_groups.setdefault(group_key, [])
        action_name = humanize_identifier(right or left)
        action_key = f"process:{process.name}"
        steps = process.steps or 0
        group_confidence = min(0.9, 0.62 + min(steps / 20, 0.16))
        action_confidence = min(0.88, 0.58 + min(steps / 18, 0.16))

        add(
            FeatureSeed(
                source_key=group_key,
                source_signal_type="process_group",
                probable_name=group_name,
                feature_type="feature",
                short_description=f"Workflow area inferred from GitNexus process traces for {group_name}.",
                long_description=(
                    f"GitNexus found execution flows starting from {left}. "
                    "This is a candidate feature area and should be reviewed for business naming."
                ),
                confidence=round(group_confidence, 2),
                parent_source_key=default_parent,
                tags=["gitnexus", "process"],
                evidence=[
                    EvidenceSeed(
                        evidence_type="process_group",
                        source_ref=left,
                        source_label=group_name,
                        confidence=round(group_confidence, 2),
                    )
                ],
            )
        )

        add(
            FeatureSeed(
                source_key=action_key,
                source_signal_type="process",
                probable_name=action_name,
                feature_type="sub_feature",
                short_description=f"Sub-feature inferred from the {process.name} execution flow.",
                long_description=(
                    f"The GitNexus process '{process.name}' contains {steps or 'multiple'} steps. "
                    "Use the linked process evidence to validate the actual user-facing behavior."
                ),
                confidence=round(action_confidence, 2),
                parent_source_key=group_key,
                tags=["gitnexus", "flow"],
                business_rules=[
                    {
                        "text": "Changes to this flow should create a reviewable feature history event.",
                        "confidence": 0.7,
                    }
                ],
                evidence=[
                    EvidenceSeed(
                        evidence_type="process",
                        source_ref=process.name,
                        source_label=process.name,
                        confidence=round(action_confidence, 2),
                        payload=model_to_dict(process),
                    )
                ],
            )
        )
        process_groups[group_key].append(action_key)

    for sibling_keys in process_groups.values():
        for index, source_key in enumerate(sibling_keys):
            seed = next((item for item in seeds if item.source_key == source_key), None)
            if seed is None:
                continue
            seed.related_source_keys.extend(sibling_keys[:index] + sibling_keys[index + 1 :])

    route_groups: dict[str, list[Any]] = {}
    for route in snapshot.routes:
        parts = [part for part in route.path.split("/") if part]
        group = parts[1] if parts and parts[0].lower() == "api" and len(parts) > 1 else (parts[0] if parts else "root")
        route_groups.setdefault(group, []).append(route)

    for group, routes in route_groups.items():
        route_name = f"{humanize_identifier(group)} API"
        add(
            FeatureSeed(
                source_key=f"route-group:{group}",
                source_signal_type="route_group",
                probable_name=route_name,
                feature_type="feature",
                short_description=f"API capability inferred from {len(routes)} route(s) under /{group}.",
                long_description=(
                    f"Routes under /{group} appear to support a coherent capability. "
                    "Review the endpoint evidence before approving the business feature name."
                ),
                confidence=0.72,
                parent_source_key=default_parent,
                tags=["gitnexus", "api"],
                evidence=[
                    EvidenceSeed(
                        evidence_type="route",
                        source_ref=route.path,
                        source_label=f"{route.method or 'ANY'} {route.path}",
                        confidence=0.72,
                        payload=model_to_dict(route),
                    )
                    for route in routes
                ],
            )
        )

    return seeds


async def sync_project_from_snapshot(db: AsyncSession, snapshot: ProjectSyncRequest) -> dict[str, Any]:
    project = await _get_or_create_project(db, snapshot)
    job = models.ExtractionJob(
        project_id=project.id,
        repo_name=snapshot.repo_name,
        repo_revision=snapshot.revision,
        status="running",
        pipeline_version=snapshot.pipeline_version,
        prompt_version=snapshot.prompt_version,
        model_name=snapshot.model_name,
    )
    db.add(job)
    await db.flush()

    raw_snapshot = model_to_dict(snapshot)
    repository_snapshot = models.RepositorySnapshot(
        project_id=project.id,
        extraction_job_id=job.id,
        repo_name=snapshot.repo_name,
        revision=snapshot.revision,
        raw_snapshot=raw_snapshot,
    )
    db.add(repository_snapshot)
    await db.flush()

    seeds = build_feature_seeds(snapshot)
    for seed in seeds:
        db.add(
            models.FeatureCandidate(
                extraction_job_id=job.id,
                project_id=project.id,
                source_key=seed.source_key,
                source_signal_type=seed.source_signal_type,
                probable_name=seed.probable_name,
                parent_source_key=seed.parent_source_key,
                confidence=seed.confidence,
                technical_members=[item.__dict__ for item in seed.evidence],
                normalized_payload={
                    "name": seed.probable_name,
                    "feature_type": seed.feature_type,
                    "short_description": seed.short_description,
                    "long_description": seed.long_description,
                    "tags": seed.tags,
                    "business_rules": seed.business_rules,
                    "confidence": seed.confidence,
                },
            )
        )

    existing_result = await db.execute(select(models.Feature).where(models.Feature.project_id == project.id))
    existing_features = existing_result.scalars().all()
    by_source_key = {
        (feature.metadata_json or {}).get("source_key"): feature
        for feature in existing_features
        if (feature.metadata_json or {}).get("source_key")
    }
    existing_codes = {feature.feature_code for feature in existing_features if feature.feature_code}

    created_features = 0
    updated_features = 0
    review_tasks = 0
    seed_to_feature: dict[str, models.Feature] = {}

    for seed in seeds:
        parent = seed_to_feature.get(seed.parent_source_key) or by_source_key.get(seed.parent_source_key)
        feature = by_source_key.get(seed.source_key)
        parent_code = parent.feature_code if parent else None
        if feature is None:
            feature = models.Feature(
                project_id=project.id,
                parent_id=parent.id if parent else None,
                feature_code=next_feature_code(project.name, existing_codes, parent_code),
                name=seed.probable_name,
                short_description=seed.short_description,
                long_description=seed.long_description,
                markdown_content=seed.long_description,
                feature_type=seed.feature_type,
                status="todo",
                review_status="needs_review",
                priority="medium",
                tags=seed.tags,
                business_rules=seed.business_rules,
                confidence_score=seed.confidence,
                current_version=1,
                generated_by="gitnexus:heuristic",
                created_by=snapshot.requested_by,
                updated_by=snapshot.requested_by,
                metadata_json={
                    "source_key": seed.source_key,
                    "source_signal_type": seed.source_signal_type,
                    "source_repo": snapshot.repo_name,
                    "source_revision": snapshot.revision,
                    "normalization": "deterministic",
                },
            )
            db.add(feature)
            await db.flush()
            _add_history(
                db,
                feature,
                "FeatureCreated",
                None,
                None,
                seed.probable_name,
                snapshot.revision,
                snapshot.requested_by,
                "Created from GitNexus feature seed.",
            )
            db.add(
                models.FeatureVersion(
                    feature_id=feature.id,
                    version_number=1,
                    content_markdown=seed.long_description,
                    summary_snapshot={
                        "name": seed.probable_name,
                        "short_description": seed.short_description,
                        "confidence": seed.confidence,
                    },
                    detail_snapshot={
                        "business_rules": seed.business_rules,
                        "evidence": [evidence.__dict__ for evidence in seed.evidence],
                    },
                    generated_from_commit=snapshot.revision,
                    author_id=snapshot.requested_by,
                    commit_message="Initial GitNexus extraction",
                )
            )
            created_features += 1
        else:
            changed = _update_existing_feature(feature, seed, parent, snapshot)
            if changed:
                _add_history(
                    db,
                    feature,
                    "FeatureRegenerated",
                    "generated_payload",
                    None,
                    seed.probable_name,
                    snapshot.revision,
                    snapshot.requested_by,
                    "Updated from a newer GitNexus snapshot.",
                )
                updated_features += 1

        await _upsert_evidence(db, feature, seed)
        if feature.review_status in {"needs_review", "stale"}:
            db.add(
                models.ReviewTask(
                    feature_id=feature.id,
                    issue_type="validate_generated_feature",
                    status="open",
                    reviewer=None,
                    resolution_notes=(
                        "Review generated name, hierarchy, description, evidence, and confidence score."
                    ),
                )
            )
            review_tasks += 1
        seed_to_feature[seed.source_key] = feature

    created_relations = await _create_related_feature_links(db, seeds, seed_to_feature)

    job.status = "completed"
    job.completed_at = datetime.utcnow()
    job.metrics = {
        "candidate_count": len(seeds),
        "created_features": created_features,
        "updated_features": updated_features,
        "created_relations": created_relations,
        "review_tasks": review_tasks,
    }
    await db.commit()

    return {
        "project_id": project.id,
        "extraction_job_id": job.id,
        "repository_snapshot_id": repository_snapshot.id,
        "created_features": created_features,
        "updated_features": updated_features,
        "created_relations": created_relations,
        "review_tasks": review_tasks,
        "candidates": len(seeds),
    }


async def _get_or_create_project(db: AsyncSession, snapshot: ProjectSyncRequest) -> models.Project:
    result = await db.execute(
        select(models.Project).where(models.Project.external_repo_name == snapshot.repo_name)
    )
    project = result.scalar_one_or_none()
    if project is not None:
        if snapshot.project_name and project.name != snapshot.project_name:
            project.name = snapshot.project_name
        project.updated_at = datetime.utcnow()
        return project

    project = models.Project(
        external_repo_name=snapshot.repo_name,
        name=snapshot.project_name or humanize_identifier(snapshot.repo_name),
        description_markdown=snapshot.description,
        source_type="gitnexus",
        metadata_json={
            "repo_name": snapshot.repo_name,
            "revision": snapshot.revision,
            "context": snapshot.context,
        },
    )
    db.add(project)
    await db.flush()
    return project


def _update_existing_feature(
    feature: models.Feature,
    seed: FeatureSeed,
    parent: models.Feature | None,
    snapshot: ProjectSyncRequest,
) -> bool:
    changed = False
    next_parent_id = parent.id if parent else None
    field_updates = {
        "name": seed.probable_name,
        "short_description": seed.short_description,
        "long_description": seed.long_description,
        "markdown_content": seed.long_description,
        "feature_type": seed.feature_type,
        "confidence_score": seed.confidence,
        "parent_id": next_parent_id,
    }
    for field_name, value in field_updates.items():
        if getattr(feature, field_name) != value:
            setattr(feature, field_name, value)
            changed = True
    if changed:
        feature.review_status = "stale" if feature.review_status == "approved" else "needs_review"
        feature.updated_by = snapshot.requested_by
        feature.updated_at = datetime.utcnow()
        metadata = feature.metadata_json or {}
        metadata.update({"source_revision": snapshot.revision, "last_sync_at": datetime.utcnow().isoformat()})
        feature.metadata_json = metadata
    return changed


async def _upsert_evidence(db: AsyncSession, feature: models.Feature, seed: FeatureSeed) -> None:
    result = await db.execute(
        select(models.FeatureEvidence).where(models.FeatureEvidence.feature_id == feature.id)
    )
    existing_refs = {(row.evidence_type, row.source_ref) for row in result.scalars().all()}
    for evidence in seed.evidence:
        key = (evidence.evidence_type, evidence.source_ref)
        if key in existing_refs:
            continue
        db.add(
            models.FeatureEvidence(
                feature_id=feature.id,
                evidence_type=evidence.evidence_type,
                source_ref=evidence.source_ref,
                source_label=evidence.source_label,
                confidence=evidence.confidence,
                notes=evidence.notes,
                payload=evidence.payload,
            )
        )


async def _create_related_feature_links(
    db: AsyncSession,
    seeds: list[FeatureSeed],
    seed_to_feature: dict[str, models.Feature],
) -> int:
    created = 0
    result = await db.execute(select(models.FeatureRelation))
    existing = {
        (relation.source_feature_id, relation.target_feature_id, relation.relation_type)
        for relation in result.scalars().all()
    }
    for seed in seeds:
        source = seed_to_feature.get(seed.source_key)
        if source is None:
            continue
        for target_key in seed.related_source_keys:
            target = seed_to_feature.get(target_key)
            if target is None or target.id == source.id:
                continue
            key = (source.id, target.id, "relates_to")
            if key in existing:
                continue
            db.add(
                models.FeatureRelation(
                    source_feature_id=source.id,
                    target_feature_id=target.id,
                    relation_type="relates_to",
                    confidence=0.52,
                    created_by="gitnexus:heuristic",
                )
            )
            existing.add(key)
            created += 1
    return created


def _add_history(
    db: AsyncSession,
    feature: models.Feature,
    event_type: str,
    field_name: str | None,
    old_value: Any,
    new_value: Any,
    commit_ref: str | None,
    changed_by: str | None,
    notes: str | None,
) -> None:
    db.add(
        models.FeatureHistory(
            feature_id=feature.id,
            event_type=event_type,
            field_name=field_name,
            old_value=None if old_value is None else str(old_value),
            new_value=None if new_value is None else str(new_value),
            commit_ref=commit_ref,
            changed_by=changed_by,
            notes=notes,
        )
    )
