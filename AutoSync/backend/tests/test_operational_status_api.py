import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator, AttendanceRequest, Employee, Service, WorkshopBox
from app.security import create_access_token, hash_password


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        frozen_time = cls(2026, 9, 7, 9, 0)
        return frozen_time.replace(tzinfo=tz) if tz else frozen_time


def test_request_queue_persists_the_delayed_status_for_an_attendance_that_did_not_start(
    monkeypatch,
) -> None:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    monkeypatch.setattr("app.routers.admin_requests.datetime", FrozenDateTime, raising=False)
    try:
        with Session(engine) as session:
            administrator = Administrator(
                email="admin@autosync.example.com",
                password_hash=hash_password("autosync-demo"),
            )
            service = Service(title="Troca de óleo", duration_minutes=45, is_active=True)
            workshop_box = WorkshopBox(label="Box 1", is_active=True)
            employee = Employee(name="Ana Martins", is_active=True)
            session.add_all([administrator, service, workshop_box, employee])
            session.commit()
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
                workshop_box_id=workshop_box.id,
                employee_id=employee.id,
                scheduled_start_at=datetime(2026, 9, 7, 8, 0),
                scheduled_end_at=datetime(2026, 9, 7, 8, 45),
                operational_status="AGENDADO",
            )
            session.add(attendance_request)
            session.commit()
            request_id = attendance_request.id
            access_token = create_access_token(administrator)

        response = TestClient(app).get(
            "/api/v1/admin/requests",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        assert response.json()["items"][0]["operational_status"] == "ATRASADO"
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == request_id)
            )

        assert persisted_request is not None
        assert persisted_request.operational_status == "ATRASADO"
    finally:
        app.dependency_overrides.clear()
