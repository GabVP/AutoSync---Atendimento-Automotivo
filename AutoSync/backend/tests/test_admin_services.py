import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator, AttendanceRequest, Service
from app.security import create_access_token, hash_password


def test_administrator_services_require_a_bearer_token() -> None:
    response = TestClient(app).get("/api/v1/admin/services")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token."}
    assert response.headers["www-authenticate"] == "Bearer"


def test_administrator_can_create_edit_list_and_deactivate_a_service() -> None:
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
            session.add(administrator)
            session.commit()
            session.refresh(administrator)
            access_token = create_access_token(administrator)

        client = TestClient(app)
        headers = {"Authorization": f"Bearer {access_token}"}
        create_response = client.post(
            "/api/v1/admin/services",
            headers=headers,
            json={"title": "Higienização interna", "duration_minutes": 75},
        )

        assert create_response.status_code == 201
        created_service = create_response.json()
        assert created_service == {
            "id": 1,
            "title": "Higienização interna",
            "duration_minutes": 75,
            "is_active": True,
        }

        update_response = client.patch(
            "/api/v1/admin/services/1",
            headers=headers,
            json={"title": "Higienização completa", "duration_minutes": 90},
        )
        deactivate_response = client.patch(
            "/api/v1/admin/services/1",
            headers=headers,
            json={"is_active": False},
        )

        assert update_response.status_code == 200
        assert update_response.json() == {
            "id": 1,
            "title": "Higienização completa",
            "duration_minutes": 90,
            "is_active": True,
        }
        assert deactivate_response.status_code == 200
        assert deactivate_response.json() == {
            "id": 1,
            "title": "Higienização completa",
            "duration_minutes": 90,
            "is_active": False,
        }
        assert client.get("/api/v1/admin/services", headers=headers).json() == [
            deactivate_response.json()
        ]
        assert client.get("/api/v1/services").json() == []
    finally:
        app.dependency_overrides.clear()


def test_service_deactivation_preserves_request_history() -> None:
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
                status="CONFIRMADO",
                tracking_code="ATS-00000001",
            )
            session.add(attendance_request)
            session.commit()
            session.refresh(attendance_request)
            service_id = service.id
            request_id = attendance_request.id
            access_token = create_access_token(administrator)

        response = TestClient(app).patch(
            f"/api/v1/admin/services/{service_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"is_active": False},
        )

        assert response.status_code == 200
        with Session(engine) as session:
            persisted_service = session.get(Service, service_id)
            persisted_request = session.get(AttendanceRequest, request_id)
            assert persisted_service is not None
            assert persisted_service.is_active is False
            assert persisted_request is not None
            assert persisted_request.service_id == service_id
    finally:
        app.dependency_overrides.clear()
