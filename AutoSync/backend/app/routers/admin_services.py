from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator, Service
from app.schemas import (
    AdministratorServiceCreate,
    AdministratorServiceResponse,
    AdministratorServiceUpdate,
)
from app.security import get_current_administrator

router = APIRouter(prefix="/admin/services", tags=["administrator services"])


def service_title_is_already_in_use(
    session: Session,
    title: str,
    excluded_service_id: int | None = None,
) -> bool:
    statement = select(Service.id).where(func.lower(Service.title) == title.lower())
    if excluded_service_id is not None:
        statement = statement.where(Service.id != excluded_service_id)
    return session.scalar(statement) is not None


@router.get("", response_model=list[AdministratorServiceResponse])
def list_administrator_services(
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> list[Service]:
    return list(session.scalars(select(Service).order_by(Service.title)))


@router.post(
    "",
    response_model=AdministratorServiceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_administrator_service(
    payload: AdministratorServiceCreate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> Service:
    if service_title_is_already_in_use(session, payload.title):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A service with this title already exists.",
        )

    service = Service(title=payload.title, duration_minutes=payload.duration_minutes, is_active=True)
    session.add(service)
    session.commit()
    session.refresh(service)
    return service


@router.patch("/{service_id}", response_model=AdministratorServiceResponse)
def update_administrator_service(
    service_id: int,
    payload: AdministratorServiceUpdate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> Service:
    service = session.get(Service, service_id)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested service was not found.",
        )

    changes = payload.model_dump(exclude_unset=True)
    next_title = changes.get("title")
    if next_title and service_title_is_already_in_use(session, next_title, service.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A service with this title already exists.",
        )

    for field, value in changes.items():
        setattr(service, field, value)

    session.commit()
    session.refresh(service)
    return service
