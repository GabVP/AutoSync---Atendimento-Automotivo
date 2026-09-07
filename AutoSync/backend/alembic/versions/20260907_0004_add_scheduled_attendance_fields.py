"""Add scheduling fields to attendance requests.

Revision ID: 20260907_0004
Revises: 20260906_0003
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0004"
down_revision = "20260906_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendance_requests",
        sa.Column("workshop_box_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "attendance_requests",
        sa.Column("employee_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "attendance_requests",
        sa.Column("scheduled_start_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "attendance_requests",
        sa.Column("scheduled_end_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "attendance_requests",
        sa.Column("operational_status", sa.String(length=16), nullable=True),
    )
    op.create_foreign_key(
        "fk_attendance_requests_workshop_box_id",
        "attendance_requests",
        "workshop_boxes",
        ["workshop_box_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_attendance_requests_employee_id",
        "attendance_requests",
        "employees",
        ["employee_id"],
        ["id"],
    )
    op.create_index(
        "ix_attendance_requests_workshop_box_schedule",
        "attendance_requests",
        ["workshop_box_id", "scheduled_start_at", "scheduled_end_at"],
    )
    op.create_index(
        "ix_attendance_requests_employee_schedule",
        "attendance_requests",
        ["employee_id", "scheduled_start_at", "scheduled_end_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_requests_employee_schedule", "attendance_requests")
    op.drop_index("ix_attendance_requests_workshop_box_schedule", "attendance_requests")
    op.drop_constraint(
        "fk_attendance_requests_employee_id", "attendance_requests", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_attendance_requests_workshop_box_id", "attendance_requests", type_="foreignkey"
    )
    op.drop_column("attendance_requests", "operational_status")
    op.drop_column("attendance_requests", "scheduled_end_at")
    op.drop_column("attendance_requests", "scheduled_start_at")
    op.drop_column("attendance_requests", "employee_id")
    op.drop_column("attendance_requests", "workshop_box_id")
