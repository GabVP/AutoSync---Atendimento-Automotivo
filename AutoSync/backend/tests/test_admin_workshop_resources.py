import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator, Employee, WorkshopBox
from app.security import create_access_token, hash_password


def test_administrator_workshop_resources_require_a_bearer_token() -> None:
    client = TestClient(app)

    for path in ("/api/v1/admin/boxes", "/api/v1/admin/employees"):
        response = client.get(path)

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid or expired access token."}
        assert response.headers["www-authenticate"] == "Bearer"


def test_administrator_can_create_edit_list_and_deactivate_workshop_resources() -> None:
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

        created_box_response = client.post(
            "/api/v1/admin/boxes",
            headers=headers,
            json={"label": "Box de revisão"},
        )
        created_employee_response = client.post(
            "/api/v1/admin/employees",
            headers=headers,
            json={"name": "Ana Martins"},
        )

        assert created_box_response.status_code == 201
        assert created_box_response.json() == {
            "id": 1,
            "label": "Box de revisão",
            "is_active": True,
        }
        assert created_employee_response.status_code == 201
        assert created_employee_response.json() == {
            "id": 1,
            "name": "Ana Martins",
            "is_active": True,
        }
        for path, payload in (
            ("/api/v1/admin/boxes/1", {"label": None}),
            ("/api/v1/admin/boxes/1", {"is_active": None}),
            ("/api/v1/admin/employees/1", {"name": None}),
            ("/api/v1/admin/employees/1", {"is_active": None}),
        ):
            assert client.patch(path, headers=headers, json=payload).status_code == 422

        updated_box_response = client.patch(
            "/api/v1/admin/boxes/1",
            headers=headers,
            json={"label": "Box de diagnósticos"},
        )
        deactivated_box_response = client.patch(
            "/api/v1/admin/boxes/1",
            headers=headers,
            json={"is_active": False},
        )
        updated_employee_response = client.patch(
            "/api/v1/admin/employees/1",
            headers=headers,
            json={"name": "Ana Ribeiro"},
        )
        deactivated_employee_response = client.patch(
            "/api/v1/admin/employees/1",
            headers=headers,
            json={"is_active": False},
        )

        assert updated_box_response.json() == {
            "id": 1,
            "label": "Box de diagnósticos",
            "is_active": True,
        }
        assert deactivated_box_response.json() == {
            "id": 1,
            "label": "Box de diagnósticos",
            "is_active": False,
        }
        assert updated_employee_response.json() == {
            "id": 1,
            "name": "Ana Ribeiro",
            "is_active": True,
        }
        assert deactivated_employee_response.json() == {
            "id": 1,
            "name": "Ana Ribeiro",
            "is_active": False,
        }
        assert client.get("/api/v1/admin/boxes", headers=headers).json() == [
            deactivated_box_response.json()
        ]
        assert client.get("/api/v1/admin/employees", headers=headers).json() == [
            deactivated_employee_response.json()
        ]

        with Session(engine) as session:
            persisted_box = session.get(WorkshopBox, 1)
            persisted_employee = session.get(Employee, 1)

        assert persisted_box is not None
        assert persisted_box.is_active is False
        assert persisted_employee is not None
        assert persisted_employee.is_active is False
    finally:
        app.dependency_overrides.clear()
