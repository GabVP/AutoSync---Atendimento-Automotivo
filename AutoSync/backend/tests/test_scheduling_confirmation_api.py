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
        frozen_time = cls(2026, 9, 7, 7, 30)
        return frozen_time.replace(tzinfo=tz) if tz else frozen_time


def test_scheduling_confirmation_requires_an_administrator_token() -> None:
    response = TestClient(app).post(
        "/api/v1/admin/requests/1/schedule",
        json={
            "workshop_box_id": 1,
            "employee_id": 1,
            "scheduled_start_at": "2026-09-07T08:00:00",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token."}


def test_administrator_can_confirm_a_request_with_a_valid_manual_schedule(monkeypatch) -> None:
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
                status="PENDENTE",
                tracking_code="ATS-00000001",
            )
            session.add(attendance_request)
            session.commit()
            request_id = attendance_request.id
            workshop_box_id = workshop_box.id
            employee_id = employee.id
            access_token = create_access_token(administrator)

        response = TestClient(app).post(
            f"/api/v1/admin/requests/{request_id}/schedule",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "workshop_box_id": workshop_box_id,
                "employee_id": employee_id,
                "scheduled_start_at": "2026-09-07T08:00:00",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "id": request_id,
            "status": "CONFIRMADO",
            "operational_status": "AGENDADO",
            "workshop_box_id": workshop_box_id,
            "workshop_box_label": "Box 1",
            "employee_id": employee_id,
            "employee_name": "Ana Martins",
            "scheduled_start_at": "2026-09-07T08:00:00",
            "scheduled_end_at": "2026-09-07T08:45:00",
        }
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == request_id)
            )

        assert persisted_request is not None
        assert persisted_request.status == "CONFIRMADO"
        assert persisted_request.operational_status == "AGENDADO"
        assert persisted_request.workshop_box_id == workshop_box_id
        assert persisted_request.employee_id == employee_id
    finally:
        app.dependency_overrides.clear()


def test_scheduling_confirmation_rejects_overlapping_box_or_employee_allocations(monkeypatch) -> None:
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
            first_box = WorkshopBox(label="Box 1", is_active=True)
            second_box = WorkshopBox(label="Box 2", is_active=True)
            first_employee = Employee(name="Ana Martins", is_active=True)
            second_employee = Employee(name="Bruno Lima", is_active=True)
            session.add_all(
                [
                    administrator,
                    service,
                    first_box,
                    second_box,
                    first_employee,
                    second_employee,
                ]
            )
            session.commit()
            existing_request = AttendanceRequest(
                name="Bruna Lima",
                phone="11987654322",
                email="bruna@example.com",
                vehicle_make="Toyota",
                vehicle_model="Yaris",
                vehicle_plate="DEF2G34",
                service_id=service.id,
                description="Revisão preventiva",
                status="CONFIRMADO",
                tracking_code="ATS-00000002",
                workshop_box_id=first_box.id,
                employee_id=first_employee.id,
                scheduled_start_at=datetime(2026, 9, 7, 8, 0),
                scheduled_end_at=datetime(2026, 9, 7, 9, 0),
                operational_status="AGENDADO",
            )
            pending_request = AttendanceRequest(
                name="Ana Silva",
                phone="11987654321",
                email="ana@example.com",
                vehicle_make="Honda",
                vehicle_model="Fit",
                vehicle_plate="ABC1D23",
                service_id=service.id,
                description="Troca de óleo e filtro",
                status="PENDENTE",
                tracking_code="ATS-00000001",
            )
            session.add_all([existing_request, pending_request])
            session.commit()
            request_id = pending_request.id
            first_box_id = first_box.id
            second_box_id = second_box.id
            first_employee_id = first_employee.id
            second_employee_id = second_employee.id
            access_token = create_access_token(administrator)

        client = TestClient(app)
        headers = {"Authorization": f"Bearer {access_token}"}
        box_conflict_response = client.post(
            f"/api/v1/admin/requests/{request_id}/schedule",
            headers=headers,
            json={
                "workshop_box_id": first_box_id,
                "employee_id": second_employee_id,
                "scheduled_start_at": "2026-09-07T08:30:00",
            },
        )
        employee_conflict_response = client.post(
            f"/api/v1/admin/requests/{request_id}/schedule",
            headers=headers,
            json={
                "workshop_box_id": second_box_id,
                "employee_id": first_employee_id,
                "scheduled_start_at": "2026-09-07T08:30:00",
            },
        )

        assert box_conflict_response.status_code == 409
        assert employee_conflict_response.status_code == 409
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == request_id)
            )

        assert persisted_request is not None
        assert persisted_request.status == "PENDENTE"
        assert persisted_request.workshop_box_id is None
        assert persisted_request.employee_id is None
    finally:
        app.dependency_overrides.clear()
