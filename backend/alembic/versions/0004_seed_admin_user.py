"""seed admin user

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-18
"""

import os
import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa
import bcrypt as _bcrypt


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    admin_email = os.environ.get("INITIAL_ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
    # bcrypt has a 72-byte input limit; truncate if longer to avoid backend errors
    if isinstance(admin_password, str) and len(admin_password.encode("utf-8")) > 72:
        admin_password = admin_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")

    # If user already exists, do nothing
    existing = conn.execute(sa.text("SELECT id FROM users WHERE email = :email"), {"email": admin_email}).first()
    if existing is not None:
        return

    user_id = str(uuid.uuid4())
    now = datetime.utcnow()
    try:
        pw_bytes = admin_password.encode("utf-8") if isinstance(admin_password, str) else admin_password
        hashed = _bcrypt.hashpw(pw_bytes[:72], _bcrypt.gensalt()).decode("utf-8")
    except Exception:
        hashed = os.environ.get("INITIAL_ADMIN_PASSWORD_HASH")
        if not hashed:
            raise RuntimeError(
                "Unable to hash INITIAL_ADMIN_PASSWORD in this environment. "
                "Set INITIAL_ADMIN_PASSWORD_HASH to a bcrypt hash of the desired password."
            )

    # Insert user
    conn.execute(
        sa.text(
            "INSERT INTO users (id, email, hashed_password, display_name, status, created_at, updated_at) "
            "VALUES (:id, :email, :hashed_password, :display_name, :status, :created_at, :updated_at)"
        ),
        {
            "id": user_id,
            "email": admin_email,
            "hashed_password": hashed,
            "display_name": "Administrator",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
    )

    # Find admin role id
    r = conn.execute(sa.text("SELECT id FROM roles WHERE name = :name"), {"name": "admin"}).first()
    if r is None:
        return
    role_id = str(r[0])

    # Assign role
    conn.execute(
        sa.text(
            "INSERT INTO user_roles (user_id, role_id, created_at) VALUES (:user_id, :role_id, :created_at)"
        ),
        {"user_id": user_id, "role_id": role_id, "created_at": now},
    )


def downgrade():
    conn = op.get_bind()
    admin_email = os.environ.get("INITIAL_ADMIN_EMAIL", "admin@example.com")

    r = conn.execute(sa.text("SELECT id FROM users WHERE email = :email"), {"email": admin_email}).first()
    if r is None:
        return
    user_id = str(r[0])

    conn.execute(sa.text("DELETE FROM user_roles WHERE user_id = :user_id"), {"user_id": user_id})
    conn.execute(sa.text("DELETE FROM users WHERE id = :id"), {"id": user_id})
