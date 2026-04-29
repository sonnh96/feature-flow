"""initial

Revision ID: 0001
Revises:
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'projects',
        sa.Column('id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description_markdown', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='active'),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_table(
        'features',
        sa.Column('id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', pg.UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('parent_id', pg.UUID(as_uuid=True), sa.ForeignKey('features.id'), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('markdown_content', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='todo'),
        sa.Column('priority', sa.String(), nullable=True),
        sa.Column('tags', pg.ARRAY(sa.String()), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_table(
        'feature_versions',
        sa.Column('id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('feature_id', pg.UUID(as_uuid=True), sa.ForeignKey('features.id'), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('content_markdown', sa.Text(), nullable=False),
        sa.Column('author_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('commit_message', sa.String(), nullable=True),
    )


def downgrade():
    op.drop_table('feature_versions')
    op.drop_table('features')
    op.drop_table('projects')
