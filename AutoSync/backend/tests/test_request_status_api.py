import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator, AttendanceRequest, Service
from app.security import create_access_token, hash_password


def test_request_status_update_requires_an_administrator_token() -> None:
    response = TestClient(app).patch(
        "/api/v1/admin/requests/1/status",
        json={"status": "CONFIRMADO"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token."}


def test_status_endpoint_requires_scheduling_for_confirmation() -> None:
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
    try:
        with Session(engine) as session:
            administrator = Administrator(
                email="admin@autosync.example.com",
                password_hash=hash_password("autosync-demo"),
            )
            service = Service(title="Troca de óleo", duration_minutes=45, is_active=True)
            session.add_all([administrator, service])
            session.commit()
            session.refresh(administrator)
            session.refresh(service)
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
            session.refresh(attendance_request)
            access_token = create_access_token(administrator)

        client = TestClient(app)
        response = client.patch(
            f"/api/v1/admin/requests/{attendance_request.id}/status",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"status": "CONFIRMADO"},
        )

        assert response.status_code == 409
        assert response.json() == {
            "detail": "Requests must be scheduled before they can be confirmed."
        }
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == attendance_request.id)
            )
            assert persisted_request is not None
            assert persisted_request.status == "PENDENTE"
    finally:
        app.dependency_overrides.clear()


def test_invalid_request_status_transition_returns_conflict_without_persisting() -> None:
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
    try:
        with Session(engine) as session:
            administrator = Administrator(
                email="admin@autosync.example.com",
                password_hash=hash_password("autosync-demo"),
            )
            service = Service(title="Troca de óleo", duration_minutes=45, is_active=True)
            session.add_all([administrator, service])
            session.commit()
            session.refresh(administrator)
            session.refresh(service)
            attendance_request = AttendanceRequest(
                name="Bruna Lima",
                phone="11987654322",
                email=None,
                vehicle_make="Toyota",
                vehicle_model="Yaris",
                vehicle_plate="DEF2G34",
                service_id=service.id,
                description="Revisão preventiva",
                status="CONFIRMADO",
                tracking_code="ATS-00000002",
            )
            session.add(attendance_request)
            session.commit()
            session.refresh(attendance_request)
            access_token = create_access_token(administrator)

        client = TestClient(app)
        response = client.patch(
            f"/api/v1/admin/requests/{attendance_request.id}/status",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"status": "PENDENTE"},
        )

        assert response.status_code == 409
        assert response.json() == {"detail": "The requested status transition is not allowed."}
        with Session(engine) as session:
            persisted_request = session.scalar(
                select(AttendanceRequest).where(AttendanceRequest.id == attendance_request.id)
            )
            assert persisted_request is not None
            assert persisted_request.status == "CONFIRMADO"
    finally:
        app.dependency_overrides.clear()
