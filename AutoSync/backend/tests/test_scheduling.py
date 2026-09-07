import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import AttendanceRequest, Employee, Service, WorkshopBox
from app.scheduling import (
    ScheduledAllocation,
    SchedulingSuggestion,
    find_nearest_available_slot,
)


def test_scheduled_request_persists_its_resource_allocation_and_operational_state() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    scheduled_start_at = datetime(2026, 9, 8, 8, 0)
    scheduled_end_at = datetime(2026, 9, 8, 8, 45)

    with Session(engine) as session:
        service = Service(title="Troca de óleo", duration_minutes=45, is_active=True)
        workshop_box = WorkshopBox(label="Box 1", is_active=True)
        employee = Employee(name="Ana Martins", is_active=True)
        session.add_all([service, workshop_box, employee])
        session.commit()
        workshop_box_id = workshop_box.id
        employee_id = employee.id

        attendance_request = AttendanceRequest(
            name="Ana Silva",
            phone="11987654321",
            email="ana@example.com",
            vehicle_make="Honda",
            vehicle_model="Fit",
            vehicle_plate="ABC1D23",
            service_id=service.id,
            description="Troca de óleo e filtro",
            status="CONFIRMADO",
            tracking_code="ATS-00000001",
            workshop_box_id=workshop_box_id,
            employee_id=employee_id,
            scheduled_start_at=scheduled_start_at,
            scheduled_end_at=scheduled_end_at,
            operational_status="AGENDADO",
        )
        session.add(attendance_request)
        session.commit()
        request_id = attendance_request.id

    with Session(engine) as session:
        persisted_request = session.get(AttendanceRequest, request_id)

    assert persisted_request is not None
    assert persisted_request.workshop_box_id == workshop_box_id
    assert persisted_request.employee_id == employee_id
    assert persisted_request.scheduled_start_at == scheduled_start_at
    assert persisted_request.scheduled_end_at == scheduled_end_at
    assert persisted_request.operational_status == "AGENDADO"


def test_suggests_the_nearest_free_minute_for_the_first_active_resource_pair() -> None:
    suggestion = find_nearest_available_slot(
        requested_after=datetime(2026, 9, 7, 8, 7),
        duration_minutes=45,
        active_box_ids={1},
        active_employee_ids={2},
        allocations=(),
    )

    assert suggestion == SchedulingSuggestion(
        workshop_box_id=1,
        employee_id=2,
        scheduled_start_at=datetime(2026, 9, 7, 8, 7),
        scheduled_end_at=datetime(2026, 9, 7, 8, 52),
    )


def test_suggestion_selects_another_free_box_and_employee_without_waiting() -> None:
    suggestion = find_nearest_available_slot(
        requested_after=datetime(2026, 9, 7, 8, 0),
        duration_minutes=45,
        active_box_ids={1, 2},
        active_employee_ids={3, 4},
        allocations=(
            ScheduledAllocation(
                workshop_box_id=1,
                employee_id=3,
                scheduled_start_at=datetime(2026, 9, 7, 8, 0),
                scheduled_end_at=datetime(2026, 9, 7, 9, 0),
            ),
        ),
    )

    assert suggestion == SchedulingSuggestion(
        workshop_box_id=2,
        employee_id=4,
        scheduled_start_at=datetime(2026, 9, 7, 8, 0),
        scheduled_end_at=datetime(2026, 9, 7, 8, 45),
    )


def test_suggestion_waits_when_the_only_active_employee_is_occupied() -> None:
    suggestion = find_nearest_available_slot(
        requested_after=datetime(2026, 9, 7, 8, 0),
        duration_minutes=45,
        active_box_ids={1, 2},
        active_employee_ids={3},
        allocations=(
            ScheduledAllocation(
                workshop_box_id=1,
                employee_id=3,
                scheduled_start_at=datetime(2026, 9, 7, 8, 0),
                scheduled_end_at=datetime(2026, 9, 7, 9, 0),
            ),
        ),
    )

    assert suggestion == SchedulingSuggestion(
        workshop_box_id=1,
        employee_id=3,
        scheduled_start_at=datetime(2026, 9, 7, 9, 0),
        scheduled_end_at=datetime(2026, 9, 7, 9, 45),
    )


def test_suggestion_skips_to_the_next_weekday_when_today_cannot_fit_the_service() -> None:
    suggestion = find_nearest_available_slot(
        requested_after=datetime(2026, 9, 11, 17, 30),
        duration_minutes=45,
        active_box_ids={1},
        active_employee_ids={2},
        allocations=(),
    )

    assert suggestion == SchedulingSuggestion(
        workshop_box_id=1,
        employee_id=2,
        scheduled_start_at=datetime(2026, 9, 14, 8, 0),
        scheduled_end_at=datetime(2026, 9, 14, 8, 45),
    )
