import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import AttendanceRequest, Employee, Service, WorkshopBox


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
