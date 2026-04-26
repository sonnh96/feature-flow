from datetime import date, datetime
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.types import CHAR, TypeDecorator


Base = declarative_base()


class GUID(TypeDecorator):
    """Platform-independent UUID type for PostgreSQL in prod and SQLite in tests."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pg.UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None or isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


class StringList(TypeDecorator):
    """Use native text arrays on PostgreSQL and JSON arrays elsewhere."""

    impl = sa.JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pg.ARRAY(sa.String()))
        return dialect.type_descriptor(sa.JSON())

    def process_bind_param(self, value, dialect):
        if value is None:
            return []
        return list(value)

    def process_result_value(self, value, dialect):
        return value or []


feature_tags = sa.Table(
    "feature_tags",
    Base.metadata,
    sa.Column("feature_id", GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("tag_id", GUID(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

user_roles = sa.Table(
    "user_roles",
    Base.metadata,
    sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("role_id", GUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
)

role_permissions = sa.Table(
    "role_permissions",
    Base.metadata,
    sa.Column("role_id", GUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("permission_id", GUID(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Project(Base):
    __tablename__ = "projects"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    external_repo_name = sa.Column(sa.String, nullable=True, index=True)
    name = sa.Column(sa.String, nullable=False)
    description_markdown = sa.Column(sa.Text, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="active")
    source_type = sa.Column(sa.String, nullable=False, default="manual")
    # 'metadata' is reserved by SQLAlchemy declarative classes.
    metadata_json = sa.Column("metadata", sa.JSON, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    features = relationship("Feature", back_populates="project", cascade="all, delete-orphan")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="project", cascade="all, delete-orphan")
    extraction_jobs = relationship("ExtractionJob", back_populates="project", cascade="all, delete-orphan")


class Feature(Base):
    __tablename__ = "features"
    __table_args__ = (
        sa.UniqueConstraint("project_id", "feature_code", name="uq_features_project_code"),
        sa.Index("ix_features_project_parent", "project_id", "parent_id"),
        sa.Index("ix_features_status_review", "status", "review_status"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    parent_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="SET NULL"), nullable=True)

    feature_code = sa.Column(sa.String, nullable=True)
    name = sa.Column(sa.String, nullable=False)
    short_description = sa.Column(sa.Text, nullable=True)
    long_description = sa.Column(sa.Text, nullable=True)
    markdown_content = sa.Column(sa.Text, nullable=True)
    feature_type = sa.Column(sa.String, nullable=False, default="feature")
    status = sa.Column(sa.String, nullable=False, default="todo")
    review_status = sa.Column(sa.String, nullable=False, default="draft")
    priority = sa.Column(sa.String, nullable=True, default="medium")
    assignee = sa.Column(sa.String, nullable=True)
    assignee_id = sa.Column(GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tags = sa.Column(StringList, nullable=True)
    acceptance_criteria = sa.Column(sa.JSON, nullable=True, default=list)
    business_rules = sa.Column(sa.JSON, nullable=True, default=list)
    target_date = sa.Column(sa.Date, nullable=True)
    position = sa.Column(sa.Integer, default=0)

    confidence_score = sa.Column(sa.Float, nullable=False, default=0.0)
    current_version = sa.Column(sa.Integer, nullable=False, default=1)
    generated_by = sa.Column(sa.String, nullable=True)
    approved_by = sa.Column(sa.String, nullable=True)
    created_by = sa.Column(sa.String, nullable=True)
    updated_by = sa.Column(sa.String, nullable=True)
    metadata_json = sa.Column("metadata", sa.JSON, nullable=True)

    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="features")
    parent = relationship("Feature", remote_side=[id], backref="children")
    assignee_user = relationship("User")
    tag_records = relationship("Tag", secondary=feature_tags, back_populates="features")
    evidence = relationship("FeatureEvidence", back_populates="feature", cascade="all, delete-orphan")
    versions = relationship("FeatureVersion", back_populates="feature", cascade="all, delete-orphan")
    history = relationship("FeatureHistory", back_populates="feature", cascade="all, delete-orphan")
    review_tasks = relationship("ReviewTask", back_populates="feature", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="feature", cascade="all, delete-orphan")
    outgoing_relations = relationship(
        "FeatureRelation",
        foreign_keys="FeatureRelation.source_feature_id",
        back_populates="source_feature",
        cascade="all, delete-orphan",
    )
    incoming_relations = relationship(
        "FeatureRelation",
        foreign_keys="FeatureRelation.target_feature_id",
        back_populates="target_feature",
        cascade="all, delete-orphan",
    )


class FeatureRelation(Base):
    __tablename__ = "feature_relations"
    __table_args__ = (
        sa.UniqueConstraint(
            "source_feature_id",
            "target_feature_id",
            "relation_type",
            name="uq_feature_relation",
        ),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    source_feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    target_feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    relation_type = sa.Column(sa.String, nullable=False)
    confidence = sa.Column(sa.Float, nullable=False, default=1.0)
    created_by = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_feature = relationship("Feature", foreign_keys=[source_feature_id], back_populates="outgoing_relations")
    target_feature = relationship("Feature", foreign_keys=[target_feature_id], back_populates="incoming_relations")


class FeatureEvidence(Base):
    __tablename__ = "feature_evidence"
    __table_args__ = (
        sa.Index("ix_feature_evidence_feature_type", "feature_id", "evidence_type"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    evidence_type = sa.Column(sa.String, nullable=False)
    source_ref = sa.Column(sa.String, nullable=False)
    source_label = sa.Column(sa.String, nullable=True)
    confidence = sa.Column(sa.Float, nullable=False, default=1.0)
    notes = sa.Column(sa.Text, nullable=True)
    payload = sa.Column(sa.JSON, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    feature = relationship("Feature", back_populates="evidence")


class FeatureVersion(Base):
    __tablename__ = "feature_versions"
    __table_args__ = (
        sa.UniqueConstraint("feature_id", "version_number", name="uq_feature_version_number"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    version_number = sa.Column(sa.Integer, nullable=False, default=1)
    content_markdown = sa.Column(sa.Text, nullable=False)
    summary_snapshot = sa.Column(sa.JSON, nullable=True)
    detail_snapshot = sa.Column(sa.JSON, nullable=True)
    generated_from_commit = sa.Column(sa.String, nullable=True)
    author_id = sa.Column(sa.String, nullable=True)
    commit_message = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    feature = relationship("Feature", back_populates="versions")


class FeatureHistory(Base):
    __tablename__ = "feature_history"
    __table_args__ = (
        sa.Index("ix_feature_history_feature_changed", "feature_id", "changed_at"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    event_type = sa.Column(sa.String, nullable=False)
    field_name = sa.Column(sa.String, nullable=True)
    old_value = sa.Column(sa.Text, nullable=True)
    new_value = sa.Column(sa.Text, nullable=True)
    commit_ref = sa.Column(sa.String, nullable=True)
    changed_by = sa.Column(sa.String, nullable=True)
    changed_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    notes = sa.Column(sa.Text, nullable=True)

    feature = relationship("Feature", back_populates="history")


class ReviewTask(Base):
    __tablename__ = "review_tasks"
    __table_args__ = (
        sa.Index("ix_review_tasks_status", "status"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    issue_type = sa.Column(sa.String, nullable=False)
    status = sa.Column(sa.String, nullable=False, default="open")
    reviewer = sa.Column(sa.String, nullable=True)
    resolution_notes = sa.Column(sa.Text, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    resolved_at = sa.Column(sa.DateTime, nullable=True)

    feature = relationship("Feature", back_populates="review_tasks")


class Role(Base):
    __tablename__ = "roles"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = sa.Column(sa.String(50), unique=True, nullable=False)
    description = sa.Column(sa.String(255), nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles", lazy="selectin")


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    resource = sa.Column(sa.String(50), nullable=False)
    action = sa.Column(sa.String(50), nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")


class User(Base):
    __tablename__ = "users"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = sa.Column(sa.String, nullable=False, unique=True, index=True)
    hashed_password = sa.Column(sa.String, nullable=False, default="")
    display_name = sa.Column(sa.String, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="active")
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")
    roles = relationship("Role", secondary=user_roles, back_populates="users", lazy="selectin")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = sa.Column(GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = sa.Column(sa.String, nullable=False, default="viewer")
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")


class Attachment(Base):
    __tablename__ = "attachments"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    feature_id = sa.Column(GUID(), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False)
    file_name = sa.Column(sa.String, nullable=False)
    artifact_type = sa.Column(sa.String, nullable=False, default="attachment")
    content_type = sa.Column(sa.String, nullable=True)
    url = sa.Column(sa.String, nullable=True)
    metadata_json = sa.Column("metadata", sa.JSON, nullable=True)
    created_by = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    feature = relationship("Feature", back_populates="attachments")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        sa.UniqueConstraint("project_id", "name", name="uq_project_tag_name"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = sa.Column(sa.String, nullable=False)
    color = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="tags")
    features = relationship("Feature", secondary=feature_tags, back_populates="tag_records")


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"
    __table_args__ = (
        sa.Index("ix_extraction_jobs_repo_status", "repo_name", "status"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    repo_name = sa.Column(sa.String, nullable=False)
    repo_revision = sa.Column(sa.String, nullable=True)
    status = sa.Column(sa.String, nullable=False, default="pending")
    pipeline_version = sa.Column(sa.String, nullable=True)
    prompt_version = sa.Column(sa.String, nullable=True)
    model_name = sa.Column(sa.String, nullable=True)
    metrics = sa.Column(sa.JSON, nullable=True)
    error_message = sa.Column(sa.Text, nullable=True)
    started_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    completed_at = sa.Column(sa.DateTime, nullable=True)

    project = relationship("Project", back_populates="extraction_jobs")
    snapshots = relationship("RepositorySnapshot", back_populates="extraction_job", cascade="all, delete-orphan")
    candidates = relationship("FeatureCandidate", back_populates="extraction_job", cascade="all, delete-orphan")


class RepositorySnapshot(Base):
    __tablename__ = "repository_snapshots"

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    extraction_job_id = sa.Column(GUID(), sa.ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    repo_name = sa.Column(sa.String, nullable=False)
    revision = sa.Column(sa.String, nullable=True)
    raw_snapshot = sa.Column(sa.JSON, nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    extraction_job = relationship("ExtractionJob", back_populates="snapshots")


class FeatureCandidate(Base):
    __tablename__ = "feature_candidates"
    __table_args__ = (
        sa.Index("ix_feature_candidates_job_signal", "extraction_job_id", "source_signal_type"),
    )

    id = sa.Column(GUID(), primary_key=True, default=uuid.uuid4)
    extraction_job_id = sa.Column(GUID(), sa.ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    project_id = sa.Column(GUID(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_key = sa.Column(sa.String, nullable=False)
    source_signal_type = sa.Column(sa.String, nullable=False)
    probable_name = sa.Column(sa.String, nullable=False)
    parent_source_key = sa.Column(sa.String, nullable=True)
    confidence = sa.Column(sa.Float, nullable=False, default=0.0)
    technical_members = sa.Column(sa.JSON, nullable=True)
    normalized_payload = sa.Column(sa.JSON, nullable=True)
    review_status = sa.Column(sa.String, nullable=False, default="unprocessed")
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    extraction_job = relationship("ExtractionJob", back_populates="candidates")
