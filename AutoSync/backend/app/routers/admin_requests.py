from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator, AttendanceRequest, Service
from app.schemas import AdministratorRequestPage, AdministratorRequestSummary
from app.security import get_current_administrator

router = APIRouter(prefix="/admin/requests", tags=["administrator requests"])


@router.get("", response_model=AdministratorRequestPage)
def list_administrator_requests(
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
    request_status: Annotated[
        Literal["PENDENTE", "CONFIRMADO", "CANCELADO"] | None,
        Query(alias="status"),
    ] = None,
    search: Annotated[str | None, Query(alias="q", max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> AdministratorRequestPage:
    filters = []
    if request_status is not None:
        filters.append(AttendanceRequest.status == request_status)

    normalized_search = search.strip().lower() if search else ""
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        filters.append(
            or_(
                func.lower(AttendanceRequest.name).like(search_pattern),
                func.lower(AttendanceRequest.email).like(search_pattern),
            )
        )

    total = session.scalar(
        select(func.count()).select_from(AttendanceRequest).where(*filters)
    ) or 0
    rows = session.execute(
        select(AttendanceRequest, Service.title)
        .join(Service, AttendanceRequest.service_id == Service.id)
        .where(*filters)
        .order_by(AttendanceRequest.created_at.desc(), AttendanceRequest.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return AdministratorRequestPage(
        items=[
            AdministratorRequestSummary(
                id=attendance_request.id,
                name=attendance_request.name,
                email=attendance_request.email,
                phone=attendance_request.phone,
                service_title=service_title,
                status=attendance_request.status,
                tracking_code=attendance_request.tracking_code,
                created_at=attendance_request.created_at,
            )
            for attendance_request, service_title in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=ceil(total / page_size) if total else 0,
    )
