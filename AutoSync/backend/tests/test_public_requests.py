import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Service


def test_visitor_can_create_a_pending_request_and_receive_tracking_code() -> None:
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
            service = Service(title="Troca de óleo", duration_minutes=45, is_active=True)
            session.add(service)
            session.commit()
            session.refresh(service)
            service_id = service.id

        response = TestClient(app).post(
            "/api/v1/requests",
            json={
                "name": "Ana Silva",
                "phone": "11987654321",
                "email": "ana@example.com",
                "vehicle_make": "Honda",
                "vehicle_model": "Fit",
                "vehicle_plate": "ABC1D23",
                "service_id": service_id,
                "description": "Troca de óleo e filtro",
                "preference": "Prefiro o período da manhã.",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "PENDENTE"
        assert body["tracking_code"].startswith("ATS-")
        assert body["service_title"] == "Troca de óleo"
    finally:
        app.dependency_overrides.clear()


def test_visitor_cannot_submit_a_request_with_a_blank_required_field() -> None:
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
            service = Service(title="Revisão preventiva", duration_minutes=60, is_active=True)
            session.add(service)
            session.commit()
            session.refresh(service)

            response = TestClient(app).post(
                "/api/v1/requests",
                json={
                    "name": "Ana Silva",
                    "phone": "11987654321",
                    "vehicle_make": "Honda",
                    "vehicle_model": "Fit",
                    "vehicle_plate": "ABC1D23",
                    "service_id": service.id,
                    "description": "     ",
                },
            )

        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_visitor_sees_only_active_workshop_services() -> None:
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
            session.add_all(
                [
                    Service(title="Alinhamento", duration_minutes=60, is_active=True),
                    Service(title="Serviço arquivado", duration_minutes=30, is_active=False),
                ]
            )
            session.commit()

        response = TestClient(app).get("/api/v1/services")

        assert response.status_code == 200
        assert response.json() == [
            {"id": 1, "title": "Alinhamento", "duration_minutes": 60}
        ]
    finally:
        app.dependency_overrides.clear()
