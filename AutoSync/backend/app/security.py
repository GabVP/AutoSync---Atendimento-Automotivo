import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator

JWT_ALGORITHM = "HS256"
JWT_SECRET_KEY = (
    os.getenv("JWT_SECRET_KEY", "").strip()
    or "local-development-secret-change-before-deploying"
)
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60") or "60"
)

password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("not-a-real-password")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(administrator: Administrator) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {"sub": str(administrator.id), "exp": expires_at},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def invalid_token_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_administrator(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    session: Session = Depends(get_session),
) -> Administrator:
    if credentials is None:
        raise invalid_token_exception()

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        administrator_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        raise invalid_token_exception() from None

    administrator = session.get(Administrator, administrator_id)
    if administrator is None:
        raise invalid_token_exception()

    return administrator
