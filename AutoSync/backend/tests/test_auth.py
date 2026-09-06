import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_session
from app.main import app
from app.models import Administrator
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY, hash_password


def test_administrator_receives_a_bearer_token_with_their_subject() -> None:
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
            administrator_id = administrator.id

        response = TestClient(app).post(
            "/api/v1/auth/login",
            json={"email": "ADMIN@AUTOSYNC.EXAMPLE.COM", "password": "autosync-demo"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert body["expires_in"] == 3600
        assert jwt.decode(
            body["access_token"],
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )["sub"] == str(administrator_id)
    finally:
        app.dependency_overrides.clear()


def test_invalid_login_never_reveals_whether_the_administrator_exists() -> None:
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
            session.add(
                Administrator(
                    email="admin@autosync.example.com",
                    password_hash=hash_password("autosync-demo"),
                )
            )
            session.commit()

        client = TestClient(app)
        wrong_password_response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@autosync.example.com", "password": "incorrect-password"},
        )
        unknown_email_response = client.post(
            "/api/v1/auth/login",
            json={"email": "unknown@autosync.example.com", "password": "incorrect-password"},
        )

        assert wrong_password_response.status_code == 401
        assert unknown_email_response.status_code == 401
        assert wrong_password_response.json() == unknown_email_response.json() == {
            "detail": "Invalid email or password."
        }
        assert wrong_password_response.headers["www-authenticate"] == "Bearer"
    finally:
        app.dependency_overrides.clear()
