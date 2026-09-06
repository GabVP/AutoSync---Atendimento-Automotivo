"""Create the services and attendance request tables.

Revision ID: 20260906_0001
Revises:
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=120), nullable=False, unique=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "attendance_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("vehicle_make", sa.String(length=80), nullable=False),
        sa.Column("vehicle_model", sa.String(length=80), nullable=False),
        sa.Column("vehicle_plate", sa.String(length=10), nullable=False),
        sa.Column("service_id", sa.Integer(), sa.ForeignKey("services.id"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("preference", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("tracking_code", sa.String(length=20), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("attendance_requests")
    op.drop_table("services")
