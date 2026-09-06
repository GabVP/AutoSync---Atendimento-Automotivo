import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator, AttendanceRequest, Service
from app.security import create_access_token, hash_password


def test_administrator_request_queue_requires_a_bearer_token() -> None:
    response = TestClient(app).get("/api/v1/admin/requests")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired access token."}
    assert response.headers["www-authenticate"] == "Bearer"


def test_administrator_can_filter_search_and_paginate_the_request_queue() -> None:
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
            session.add_all(
                [
                    AttendanceRequest(
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
                        created_at=datetime(2026, 9, 1, 10, 0),
                    ),
                    AttendanceRequest(
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
                        created_at=datetime(2026, 9, 2, 10, 0),
                    ),
                    AttendanceRequest(
                        name="João Souza",
                        phone="11987654323",
                        email=None,
                        vehicle_make="Ford",
                        vehicle_model="Ka",
                        vehicle_plate="GHI3J45",
                        service_id=service.id,
                        description="Diagnóstico do motor",
                        status="CONFIRMADO",
                        tracking_code="ATS-00000003",
                        created_at=datetime(2026, 9, 3, 10, 0),
                    ),
                ]
            )
            session.commit()
            access_token = create_access_token(administrator)

        client = TestClient(app)
        headers = {"Authorization": f"Bearer {access_token}"}
        pending_response = client.get(
            "/api/v1/admin/requests?status=PENDENTE&page=2&page_size=1",
            headers=headers,
        )
        name_search_response = client.get(
            "/api/v1/admin/requests?status=CONFIRMADO&q=joão",
            headers=headers,
        )

        assert pending_response.status_code == 200
        assert pending_response.json() == {
            "items": [
                {
                    "id": 1,
                    "name": "Ana Silva",
                    "email": "ana@example.com",
                    "phone": "11987654321",
                    "service_title": "Troca de óleo",
                    "status": "PENDENTE",
                    "tracking_code": "ATS-00000001",
                    "created_at": "2026-09-01T10:00:00",
                }
            ],
            "page": 2,
            "page_size": 1,
            "total": 2,
            "total_pages": 2,
        }
        assert name_search_response.status_code == 200
        assert name_search_response.json()["items"] == [
            {
                "id": 3,
                "name": "João Souza",
                "email": None,
                "phone": "11987654323",
                "service_title": "Troca de óleo",
                "status": "CONFIRMADO",
                "tracking_code": "ATS-00000003",
                "created_at": "2026-09-03T10:00:00",
            }
        ]
    finally:
        app.dependency_overrides.clear()
