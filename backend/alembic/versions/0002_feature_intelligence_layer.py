"""feature intelligence layer

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-26
"""

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("projects", sa.Column("external_repo_name", sa.String(), nullable=True))
    op.add_column("projects", sa.Column("source_type", sa.String(), nullable=False, server_default="manual"))
    op.create_index("ix_projects_external_repo_name", "projects", ["external_repo_name"])

    op.add_column("features", sa.Column("feature_code", sa.String(), nullable=True))
    op.add_column("features", sa.Column("short_description", sa.Text(), nullable=True))
    op.add_column("features", sa.Column("long_description", sa.Text(), nullable=True))
    op.add_column("features", sa.Column("feature_type", sa.String(), nullable=False, server_default="feature"))
    op.add_column("features", sa.Column("review_status", sa.String(), nullable=False, server_default="draft"))
    op.add_column("features", sa.Column("assignee", sa.String(), nullable=True))
    op.add_column("features", sa.Column("assignee_id", pg.UUID(as_uuid=True), nullable=True))
    op.add_column("features", sa.Column("acceptance_criteria", pg.JSONB(), nullable=True))
    op.add_column("features", sa.Column("business_rules", pg.JSONB(), nullable=True))
    op.add_column("features", sa.Column("target_date", sa.Date(), nullable=True))
    op.add_column("features", sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("features", sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("features", sa.Column("generated_by", sa.String(), nullable=True))
    op.add_column("features", sa.Column("approved_by", sa.String(), nullable=True))
    op.add_column("features", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("features", sa.Column("updated_by", sa.String(), nullable=True))
    op.add_column("features", sa.Column("metadata", pg.JSONB(), nullable=True))
    op.create_foreign_key(
        "fk_features_assignee_id_users",
        "features",
        "users",
        ["assignee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_features_project_code", "features", ["project_id", "feature_code"])
    op.create_index("ix_features_project_parent", "features", ["project_id", "parent_id"])
    op.create_index("ix_features_status_review", "features", ["status", "review_status"])

    op.add_column("feature_versions", sa.Column("summary_snapshot", pg.JSONB(), nullable=True))
    op.add_column("feature_versions", sa.Column("detail_snapshot", pg.JSONB(), nullable=True))
    op.add_column("feature_versions", sa.Column("generated_from_commit", sa.String(), nullable=True))
    op.create_unique_constraint(
        "uq_feature_version_number",
        "feature_versions",
        ["feature_id", "version_number"],
    )

    op.create_table(
        "feature_relations",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("source_feature_id", "target_feature_id", "relation_type", name="uq_feature_relation"),
    )

    op.create_table(
        "feature_evidence",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evidence_type", sa.String(), nullable=False),
        sa.Column("source_ref", sa.String(), nullable=False),
        sa.Column("source_label", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("payload", pg.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_feature_evidence_feature_type", "feature_evidence", ["feature_id", "evidence_type"])

    op.create_table(
        "feature_history",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("field_name", sa.String(), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("commit_ref", sa.String(), nullable=True),
        sa.Column("changed_by", sa.String(), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_feature_history_feature_changed", "feature_history", ["feature_id", "changed_at"])

    op.create_table(
        "review_tasks",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("reviewer", sa.String(), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_review_tasks_status", "review_tasks", ["status"])

    op.create_table(
        "project_members",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    op.create_table(
        "attachments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("artifact_type", sa.String(), nullable=False, server_default="attachment"),
        sa.Column("content_type", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("metadata", pg.JSONB(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "tags",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("project_id", "name", name="uq_project_tag_name"),
    )

    op.create_table(
        "feature_tags",
        sa.Column("feature_id", pg.UUID(as_uuid=True), sa.ForeignKey("features.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", pg.UUID(as_uuid=True), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "extraction_jobs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repo_name", sa.String(), nullable=False),
        sa.Column("repo_revision", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("pipeline_version", sa.String(), nullable=True),
        sa.Column("prompt_version", sa.String(), nullable=True),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("metrics", pg.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extraction_jobs_repo_status", "extraction_jobs", ["repo_name", "status"])

    op.create_table(
        "repository_snapshots",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_job_id", pg.UUID(as_uuid=True), sa.ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repo_name", sa.String(), nullable=False),
        sa.Column("revision", sa.String(), nullable=True),
        sa.Column("raw_snapshot", pg.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "feature_candidates",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("extraction_job_id", pg.UUID(as_uuid=True), sa.ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_key", sa.String(), nullable=False),
        sa.Column("source_signal_type", sa.String(), nullable=False),
        sa.Column("probable_name", sa.String(), nullable=False),
        sa.Column("parent_source_key", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("technical_members", pg.JSONB(), nullable=True),
        sa.Column("normalized_payload", pg.JSONB(), nullable=True),
        sa.Column("review_status", sa.String(), nullable=False, server_default="unprocessed"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_feature_candidates_job_signal", "feature_candidates", ["extraction_job_id", "source_signal_type"])


def downgrade():
    op.drop_index("ix_feature_candidates_job_signal", table_name="feature_candidates")
    op.drop_table("feature_candidates")
    op.drop_table("repository_snapshots")
    op.drop_index("ix_extraction_jobs_repo_status", table_name="extraction_jobs")
    op.drop_table("extraction_jobs")
    op.drop_table("feature_tags")
    op.drop_table("tags")
    op.drop_table("attachments")
    op.drop_table("project_members")
    op.drop_index("ix_review_tasks_status", table_name="review_tasks")
    op.drop_table("review_tasks")
    op.drop_index("ix_feature_history_feature_changed", table_name="feature_history")
    op.drop_table("feature_history")
    op.drop_index("ix_feature_evidence_feature_type", table_name="feature_evidence")
    op.drop_table("feature_evidence")
    op.drop_table("feature_relations")

    op.drop_constraint("uq_feature_version_number", "feature_versions", type_="unique")
    op.drop_column("feature_versions", "generated_from_commit")
    op.drop_column("feature_versions", "detail_snapshot")
    op.drop_column("feature_versions", "summary_snapshot")

    op.drop_index("ix_features_status_review", table_name="features")
    op.drop_index("ix_features_project_parent", table_name="features")
    op.drop_constraint("uq_features_project_code", "features", type_="unique")
    op.drop_constraint("fk_features_assignee_id_users", "features", type_="foreignkey")
    for column in [
        "metadata",
        "updated_by",
        "created_by",
        "approved_by",
        "generated_by",
        "current_version",
        "confidence_score",
        "target_date",
        "business_rules",
        "acceptance_criteria",
        "assignee_id",
        "assignee",
        "review_status",
        "feature_type",
        "long_description",
        "short_description",
        "feature_code",
    ]:
        op.drop_column("features", column)

    op.drop_index("ix_projects_external_repo_name", table_name="projects")
    op.drop_column("projects", "source_type")
    op.drop_column("projects", "external_repo_name")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
