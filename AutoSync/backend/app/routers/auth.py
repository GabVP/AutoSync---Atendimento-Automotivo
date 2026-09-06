from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator
from app.schemas import AccessTokenResponse, AdministratorLoginRequest
from app.security import (
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    dummy_password_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=AccessTokenResponse)
def login_administrator(
    payload: AdministratorLoginRequest,
    session: Session = Depends(get_session),
) -> AccessTokenResponse:
    administrator = session.scalar(
        select(Administrator).where(Administrator.email == payload.email.lower())
    )
    if administrator is None:
        verify_password(payload.password, dummy_password_hash)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(payload.password, administrator.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AccessTokenResponse(
        access_token=create_access_token(administrator),
        token_type="bearer",
        expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
