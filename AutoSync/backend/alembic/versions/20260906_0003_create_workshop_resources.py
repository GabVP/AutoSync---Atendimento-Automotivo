"""Create workshop resource tables.

Revision ID: 20260906_0003
Revises: 20260906_0002
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_0003"
down_revision = "20260906_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workshop_boxes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("label", sa.String(length=80), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_table("employees")
    op.drop_table("workshop_boxes")
