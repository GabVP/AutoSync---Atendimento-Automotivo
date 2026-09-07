from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Administrator(Base):
    __tablename__ = "administrators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120), unique=True)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class WorkshopBox(Base):
    __tablename__ = "workshop_boxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AttendanceRequest(Base):
    __tablename__ = "attendance_requests"
    __table_args__ = (
        Index(
            "ix_attendance_requests_workshop_box_schedule",
            "workshop_box_id",
            "scheduled_start_at",
            "scheduled_end_at",
        ),
        Index(
            "ix_attendance_requests_employee_schedule",
            "employee_id",
            "scheduled_start_at",
            "scheduled_end_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vehicle_make: Mapped[str] = mapped_column(String(80))
    vehicle_model: Mapped[str] = mapped_column(String(80))
    vehicle_plate: Mapped[str] = mapped_column(String(10))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    preference: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDENTE", nullable=False)
    workshop_box_id: Mapped[int | None] = mapped_column(
        ForeignKey("workshop_boxes.id"), nullable=True
    )
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    scheduled_start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scheduled_end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    operational_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tracking_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    service: Mapped[Service] = relationship()
    workshop_box: Mapped[WorkshopBox | None] = relationship()
    employee: Mapped[Employee | None] = relationship()
