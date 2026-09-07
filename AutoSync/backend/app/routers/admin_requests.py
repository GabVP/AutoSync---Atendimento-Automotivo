from datetime import datetime
from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator, AttendanceRequest, Employee, Service, WorkshopBox
from app.request_status import InvalidRequestStatusTransition, transition_request_status
from app.scheduling import ScheduledAllocation, find_nearest_available_slot
from app.schemas import (
    AdministratorRequestPage,
    AdministratorRequestStatusResponse,
    AdministratorRequestStatusUpdate,
    AdministratorRequestSummary,
    AdministratorSchedulingSuggestionResponse,
)
from app.security import get_current_administrator

router = APIRouter(prefix="/admin/requests", tags=["administrator requests"])


@router.get(
    "/{request_id}/scheduling-suggestion",
    response_model=AdministratorSchedulingSuggestionResponse,
)
def suggest_administrator_request_scheduling(
    request_id: int,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> AdministratorSchedulingSuggestionResponse:
    attendance_request = session.get(AttendanceRequest, request_id)
    if attendance_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested attendance request was not found.",
        )
    if attendance_request.status != "PENDENTE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending requests can receive a scheduling suggestion.",
        )

    active_boxes = list(
        session.scalars(
            select(WorkshopBox).where(WorkshopBox.is_active.is_(True)).order_by(WorkshopBox.id)
        )
    )
    active_employees = list(
        session.scalars(
            select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.id)
        )
    )
    allocations = [
        ScheduledAllocation(
            workshop_box_id=workshop_box_id,
            employee_id=employee_id,
            scheduled_start_at=scheduled_start_at,
            scheduled_end_at=scheduled_end_at,
        )
        for workshop_box_id, employee_id, scheduled_start_at, scheduled_end_at in session.execute(
            select(
                AttendanceRequest.workshop_box_id,
                AttendanceRequest.employee_id,
                AttendanceRequest.scheduled_start_at,
                AttendanceRequest.scheduled_end_at,
            ).where(
                AttendanceRequest.status == "CONFIRMADO",
                AttendanceRequest.operational_status != "CONCLUÍDO",
                AttendanceRequest.workshop_box_id.is_not(None),
                AttendanceRequest.employee_id.is_not(None),
                AttendanceRequest.scheduled_start_at.is_not(None),
                AttendanceRequest.scheduled_end_at.is_not(None),
            )
        )
    ]
    suggestion = find_nearest_available_slot(
        requested_after=datetime.now(),
        duration_minutes=attendance_request.service.duration_minutes,
        active_box_ids=(workshop_box.id for workshop_box in active_boxes),
        active_employee_ids=(employee.id for employee in active_employees),
        allocations=allocations,
    )
    if suggestion is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active workshop resources are available for scheduling.",
        )

    workshop_box = next(
        workshop_box
        for workshop_box in active_boxes
        if workshop_box.id == suggestion.workshop_box_id
    )
    employee = next(
        employee for employee in active_employees if employee.id == suggestion.employee_id
    )
    return AdministratorSchedulingSuggestionResponse(
        request_id=attendance_request.id,
        workshop_box_id=workshop_box.id,
        workshop_box_label=workshop_box.label,
        employee_id=employee.id,
        employee_name=employee.name,
        scheduled_start_at=suggestion.scheduled_start_at,
        scheduled_end_at=suggestion.scheduled_end_at,
    )


@router.patch("/{request_id}/status", response_model=AdministratorRequestStatusResponse)
def update_administrator_request_status(
    request_id: int,
    payload: AdministratorRequestStatusUpdate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> AdministratorRequestStatusResponse:
    attendance_request = session.get(AttendanceRequest, request_id)
    if attendance_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested attendance request was not found.",
        )

    try:
        attendance_request.status = transition_request_status(
            attendance_request.status,
            payload.status,
        )
    except InvalidRequestStatusTransition as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested status transition is not allowed.",
        ) from error

    session.commit()
    session.refresh(attendance_request)
    return AdministratorRequestStatusResponse(
        id=attendance_request.id,
        status=attendance_request.status,
    )


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
