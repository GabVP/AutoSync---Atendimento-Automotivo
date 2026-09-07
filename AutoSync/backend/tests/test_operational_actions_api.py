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
    current = datetime(2026, 9, 7, 8, 0)

    @classmethod
    def now(cls, tz=None):
        return cls.current.replace(tzinfo=tz) if tz else cls.current


def test_operational_status_update_requires_an_administrator_token() -> None:
    response = TestClient(app).patch(
        "/api/v1/admin/requests/1/operational-status",
        json={"operational_status": "EM_ANDAMENTO"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token."}


def test_administrator_can_start_and_conclude_an_attendance_to_release_its_resources(
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
    FrozenDateTime.current = datetime(2026, 9, 7, 8, 0)
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
            active_request = AttendanceRequest(
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
            pending_request = AttendanceRequest(
                name="Bruna Lima",
                phone="11987654322",
                email="bruna@example.com",
                vehicle_make="Toyota",
                vehicle_model="Yaris",
                vehicle_plate="DEF2G34",
                service_id=service.id,
                description="Revisão preventiva",
                status="PENDENTE",
                tracking_code="ATS-00000002",
            )
            session.add_all([active_request, pending_request])
            session.commit()
            active_request_id = active_request.id
            pending_request_id = pending_request.id
            access_token = create_access_token(administrator)

        client = TestClient(app)
        headers = {"Authorization": f"Bearer {access_token}"}
        start_response = client.patch(
            f"/api/v1/admin/requests/{active_request_id}/operational-status",
            headers=headers,
            json={"operational_status": "EM_ANDAMENTO"},
        )
        occupied_suggestion_response = client.get(
            f"/api/v1/admin/requests/{pending_request_id}/scheduling-suggestion",
            headers=headers,
        )

        assert start_response.status_code == 200
        assert start_response.json() == {
            "id": active_request_id,
            "status": "CONFIRMADO",
            "operational_status": "EM_ANDAMENTO",
        }
        assert occupied_suggestion_response.status_code == 200
        assert occupied_suggestion_response.json()["scheduled_start_at"] == "2026-09-07T08:45:00"

        FrozenDateTime.current = datetime(2026, 9, 7, 8, 30)
        completion_response = client.patch(
            f"/api/v1/admin/requests/{active_request_id}/operational-status",
            headers=headers,
            json={"operational_status": "CONCLUÍDO"},
        )
        suggestion_response = client.get(
            f"/api/v1/admin/requests/{pending_request_id}/scheduling-suggestion",
            headers=headers,
        )

        assert completion_response.status_code == 200
        assert completion_response.json() == {
            "id": active_request_id,
            "status": "CONFIRMADO",
            "operational_status": "CONCLUÍDO",
        }
        assert suggestion_response.status_code == 200
        assert suggestion_response.json()["scheduled_start_at"] == "2026-09-07T08:30:00"
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == active_request_id)
            )

        assert persisted_request is not None
        assert persisted_request.operational_status == "CONCLUÍDO"
    finally:
        app.dependency_overrides.clear()
