"""add RBAC tables and update users for JWT auth

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-26
"""

import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# Default permissions
DEFAULT_PERMISSIONS = [
    ("project", "create"), ("project", "read"), ("project", "update"), ("project", "delete"),
    ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
    ("version", "create"), ("version", "read"), ("version", "delete"),
    ("upload", "create"),
    ("user", "read"), ("user", "update"), ("user", "delete"),
    ("role", "create"), ("role", "read"), ("role", "update"), ("role", "delete"),
]

DEFAULT_ROLES = {
    "admin": {
        "description": "Full access to all resources",
        "permissions": None,  # all
    },
    "editor": {
        "description": "Can create and edit projects, features, versions, and upload images",
        "permissions": [
            ("project", "create"), ("project", "read"), ("project", "update"),
            ("feature", "create"), ("feature", "read"), ("feature", "update"), ("feature", "delete"),
            ("version", "create"), ("version", "read"), ("version", "delete"),
            ("upload", "create"),
        ],
    },
    "viewer": {
        "description": "Read-only access to projects, features, and versions",
        "permissions": [
            ("project", "read"), ("feature", "read"), ("version", "read"),
        ],
    },
}


def upgrade():
    # 1. Create roles table
    op.create_table(
        "roles",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
    )

    # 2. Create permissions table
    op.create_table(
        "permissions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("resource", sa.String(50), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
        sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),
    )

    # 3. Create user_roles join table
    op.create_table(
        "user_roles",
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", pg.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
    )

    # 4. Create role_permissions join table
    op.create_table(
        "role_permissions",
        sa.Column("role_id", pg.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", pg.UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # 5. Add hashed_password to users table (nullable initially for existing rows)
    op.add_column("users", sa.Column("hashed_password", sa.String, nullable=True, server_default=""))

    # 6. Remove the old 'role' string column from users
    # Use batch mode for SQLite compatibility
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("role")

    # 7. Seed default permissions
    permissions_table = sa.table(
        "permissions",
        sa.column("id", pg.UUID(as_uuid=True)),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    perm_ids = {}
    now = datetime.utcnow()
    for resource, action in DEFAULT_PERMISSIONS:
        pid = str(uuid.uuid4())
        perm_ids[(resource, action)] = pid
        op.execute(
            permissions_table.insert().values(
                id=pid, resource=resource, action=action, created_at=now
            )
        )

    # 8. Seed default roles
    roles_table = sa.table(
        "roles",
        sa.column("id", pg.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", pg.UUID(as_uuid=True)),
        sa.column("permission_id", pg.UUID(as_uuid=True)),
    )
    for role_name, role_data in DEFAULT_ROLES.items():
        rid = str(uuid.uuid4())
        op.execute(
            roles_table.insert().values(
                id=rid, name=role_name, description=role_data["description"], created_at=now
            )
        )
        # Assign permissions
        if role_data["permissions"] is None:
            # Admin: all permissions
            for perm_key, perm_id in perm_ids.items():
                op.execute(
                    role_permissions_table.insert().values(role_id=rid, permission_id=perm_id)
                )
        else:
            for perm_key in role_data["permissions"]:
                if perm_key in perm_ids:
                    op.execute(
                        role_permissions_table.insert().values(
                            role_id=rid, permission_id=perm_ids[perm_key]
                        )
                    )


def downgrade():
    # Add back old role column
    op.add_column("users", sa.Column("role", sa.String, nullable=False, server_default="viewer"))

    # Remove hashed_password
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("hashed_password")

    # Drop tables in reverse order
    op.drop_table("role_permissions")
    op.drop_table("user_roles")
    op.drop_table("permissions")
    op.drop_table("roles")
