from datetime import timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import AttendanceRequest, Employee, Service, WorkshopBox
from app.seed import (
    DEMO_PENDING_REQUEST_TRACKING_CODE,
    DEMO_SCHEDULED_REQUEST_TRACKING_CODE,
    seed_demo_data,
)


def test_seed_provides_four_active_services_on_a_fresh_database() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_demo_data(session)
        services = list(session.scalars(select(Service).where(Service.is_active.is_(True))))

    assert {service.title for service in services} == {
        "Alinhamento e balanceamento",
        "Diagnóstico eletrônico",
        "Revisão preventiva",
        "Troca de óleo",
    }


def test_seed_provides_active_workshop_resources_on_a_fresh_database() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_demo_data(session)
        boxes = list(session.scalars(select(WorkshopBox).where(WorkshopBox.is_active.is_(True))))
        employees = list(session.scalars(select(Employee).where(Employee.is_active.is_(True))))

    assert {workshop_box.label for workshop_box in boxes} == {"Box 1", "Box 2"}
    assert {employee.name for employee in employees} == {
        "Ana Martins",
        "Bruno Lima",
        "Carla Souza",
    }


def test_seed_provides_idempotent_pending_and_scheduled_demo_requests() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_demo_data(session)
        seed_demo_data(session)
        demo_requests = {
            attendance_request.tracking_code: attendance_request
            for attendance_request in session.scalars(select(AttendanceRequest))
        }

        assert set(demo_requests) == {
            DEMO_PENDING_REQUEST_TRACKING_CODE,
            DEMO_SCHEDULED_REQUEST_TRACKING_CODE,
        }

        pending_request = demo_requests[DEMO_PENDING_REQUEST_TRACKING_CODE]
        assert pending_request.status == "PENDENTE"
        assert pending_request.operational_status is None
        assert pending_request.scheduled_start_at is None

        scheduled_request = demo_requests[DEMO_SCHEDULED_REQUEST_TRACKING_CODE]
        assert scheduled_request.status == "CONFIRMADO"
        assert scheduled_request.operational_status == "AGENDADO"
        assert scheduled_request.workshop_box is not None
        assert scheduled_request.workshop_box.label == "Box 1"
        assert scheduled_request.employee is not None
        assert scheduled_request.employee.name == "Ana Martins"
        assert scheduled_request.scheduled_start_at is not None
        assert scheduled_request.scheduled_end_at is not None
        assert scheduled_request.scheduled_end_at - scheduled_request.scheduled_start_at == timedelta(
            minutes=90
        )
