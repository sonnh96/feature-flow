from datetime import date, datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, validate_by_name=True)


class ProjectBase(ApiModel):
    name: str
    description_markdown: Optional[str] = None
    external_repo_name: Optional[str] = None
    source_type: str = "manual"
    metadata: Optional[dict[str, Any]] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ApiModel):
    name: Optional[str] = None
    description_markdown: Optional[str] = None
    external_repo_name: Optional[str] = None
    source_type: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class Project(ProjectBase):
    id: UUID
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


class AcceptanceCriterion(ApiModel):
    id: Optional[str] = None
    text: str
    done: bool = False


class FeatureBase(ApiModel):
    name: str
    code: Optional[str] = None
    feature_code: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    markdown_content: Optional[str] = None
    feature_type: str = "feature"
    status: str = "todo"
    review_status: str = "draft"
    priority: Optional[str] = "medium"
    assignee: Optional[str] = None
    assignee_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    acceptance_criteria: Optional[List[dict[str, Any]]] = None
    business_rules: Optional[List[dict[str, Any]] | str] = None
    target_date: Optional[date] = None
    confidence_score: float = 0.0
    generated_by: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class FeatureCreate(FeatureBase):
    parent_id: Optional[UUID] = None
    position: Optional[int] = None


class FeatureUpdate(ApiModel):
    parent_id: Optional[UUID] = None
    name: Optional[str] = None
    code: Optional[str] = None
    feature_code: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    markdown_content: Optional[str] = None
    feature_type: Optional[str] = None
    status: Optional[str] = None
    review_status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    assignee_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    acceptance_criteria: Optional[List[dict[str, Any]]] = None
    business_rules: Optional[List[dict[str, Any]] | str] = None
    target_date: Optional[date] = None
    position: Optional[int] = None
    confidence_score: Optional[float] = None
    approved_by: Optional[str] = None
    updated_by: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    change_comment: Optional[str] = None


class Feature(ApiModel):
    id: UUID
    project_id: UUID
    parent_id: Optional[UUID]
    code: Optional[str] = None
    feature_code: Optional[str] = None
    name: str
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    markdown_content: Optional[str] = None
    feature_type: str
    status: str
    review_status: str
    priority: Optional[str] = None
    assignee: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    acceptance_criteria: List[dict[str, Any]] = Field(default_factory=list)
    business_rules: List[dict[str, Any]] | str | None = None
    target_date: Optional[date] = None
    position: Optional[int] = None
    confidence_score: float = 0.0
    current_version: int = 1
    generated_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    metadata: Optional[dict[str, Any]] = None


class FeatureRelationCreate(ApiModel):
    target_feature_id: UUID
    relation_type: str = "relates_to"
    confidence: float = 1.0
    created_by: Optional[str] = None


class FeatureRelation(ApiModel):
    id: UUID
    source_feature_id: UUID
    target_feature_id: UUID
    relation_type: str
    confidence: float
    created_by: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


class FeatureEvidence(ApiModel):
    id: UUID
    feature_id: UUID
    evidence_type: str
    source_ref: str
    source_label: Optional[str] = None
    confidence: float
    notes: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    created_at: Optional[datetime]


class FeatureHistory(ApiModel):
    id: UUID
    feature_id: UUID
    event_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    commit_ref: Optional[str] = None
    changed_by: Optional[str] = None
    changed_at: Optional[datetime]
    notes: Optional[str] = None


class FeatureVersionCreate(ApiModel):
    content: str
    author_id: Optional[str] = None
    commit_message: Optional[str] = None
    summary_snapshot: Optional[dict[str, Any]] = None
    detail_snapshot: Optional[dict[str, Any]] = None
    generated_from_commit: Optional[str] = None


class ReviewTask(ApiModel):
    id: UUID
    feature_id: UUID
    issue_type: str
    status: str
    reviewer: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: Optional[datetime]
    resolved_at: Optional[datetime] = None


class ReviewAction(ApiModel):
    reviewer: Optional[str] = None
    notes: Optional[str] = None


class ReparentAction(ApiModel):
    parent_id: Optional[UUID] = None
    reviewer: Optional[str] = None
    notes: Optional[str] = None


class MergeAction(ApiModel):
    target_feature_id: UUID
    reviewer: Optional[str] = None
    notes: Optional[str] = None


class SplitFeatureItem(ApiModel):
    name: str
    short_description: Optional[str] = None
    feature_type: str = "sub_feature"


class SplitAction(ApiModel):
    items: list[SplitFeatureItem]
    reviewer: Optional[str] = None
    notes: Optional[str] = None


class GitNexusCluster(ApiModel):
    name: str
    symbols: Optional[int] = None
    cohesion: Optional[float | str] = None
    members: Optional[list[dict[str, Any]]] = None


class GitNexusProcess(ApiModel):
    name: str
    type: Optional[str] = None
    steps: Optional[int] = None
    symbols: Optional[list[dict[str, Any]]] = None


class GitNexusRoute(ApiModel):
    method: Optional[str] = None
    path: str
    handler: Optional[str] = None
    consumers: Optional[list[dict[str, Any]]] = None


class ProjectSyncRequest(ApiModel):
    repo_name: str
    project_name: Optional[str] = None
    description: Optional[str] = None
    revision: Optional[str] = None
    context: Optional[dict[str, Any]] = None
    clusters: list[GitNexusCluster] = Field(default_factory=list)
    processes: list[GitNexusProcess] = Field(default_factory=list)
    routes: list[GitNexusRoute] = Field(default_factory=list)
    symbols: list[dict[str, Any]] = Field(default_factory=list)
    changed_files: list[str] = Field(default_factory=list)
    pipeline_version: str = "feature-intelligence-v1"
    prompt_version: Optional[str] = None
    model_name: Optional[str] = None
    requested_by: Optional[str] = None


class GitNexusIngestRequest(ApiModel):
    repo_name: Optional[str] = None
    repo_path: Optional[str] = None
    project_name: Optional[str] = None
    description: Optional[str] = None
    sqlite_path: Optional[str] = None
    lbug_path: Optional[str] = None
    auto_convert: bool = False
    convert_command: Optional[str] = None
    requested_by: Optional[str] = None
    include_symbols_limit: int = 500
    pipeline_version: str = "feature-intelligence-gitnexus-worker-v1"
    prompt_version: Optional[str] = None
    model_name: Optional[str] = None


class ProjectSyncResponse(ApiModel):
    project_id: UUID
    extraction_job_id: UUID
    repository_snapshot_id: UUID
    created_features: int
    updated_features: int
    created_relations: int
    review_tasks: int
    candidates: int


class SearchResult(ApiModel):
    id: UUID
    project_id: UUID
    code: Optional[str] = None
    name: str
    feature_type: str
    status: str
    review_status: str
    confidence_score: float
    short_description: Optional[str] = None
    matched_fields: list[str] = Field(default_factory=list)
    score: float


class SearchResponse(ApiModel):
    query: str
    scope: str
    total: int
    results: list[SearchResult]


# ── Auth & RBAC schemas ──


class UserRegister(ApiModel):
    email: str
    password: str
    display_name: Optional[str] = None


class UserLogin(ApiModel):
    email: str
    password: str


class TokenResponse(ApiModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(ApiModel):
    refresh_token: str


class PermissionResponse(ApiModel):
    id: UUID
    resource: str
    action: str


class RoleResponse(ApiModel):
    id: UUID
    name: str
    description: Optional[str] = None
    permissions: list[PermissionResponse] = []


class UserResponse(ApiModel):
    id: UUID
    email: str
    display_name: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    roles: list[RoleResponse] = []


class RoleAssign(ApiModel):
    user_id: UUID
    role_name: str


class RoleCreate(ApiModel):
    name: str
    description: Optional[str] = None


class PermissionAssign(ApiModel):
    role_name: str
    resource: str
    action: str
