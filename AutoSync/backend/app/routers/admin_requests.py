from datetime import datetime
from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator, AttendanceRequest, Employee, Service, WorkshopBox
from app.operational_status import (
    InvalidOperationalStatusTransition,
    refresh_overdue_operational_status,
    transition_operational_status,
)
from app.request_status import InvalidRequestStatusTransition, transition_request_status
from app.scheduling import (
    InvalidScheduleInterval,
    ScheduledAllocation,
    calculate_scheduled_end_at,
    find_nearest_available_slot,
)
from app.schemas import (
    AdministratorOperationalStatusResponse,
    AdministratorOperationalStatusUpdate,
    AdministratorSchedulingConfirmationRequest,
    AdministratorSchedulingConfirmationResponse,
    AdministratorRequestPage,
    AdministratorRequestStatusResponse,
    AdministratorRequestStatusUpdate,
    AdministratorRequestSummary,
    AdministratorSchedulingSuggestionResponse,
)
from app.security import get_current_administrator

router = APIRouter(prefix="/admin/requests", tags=["administrator requests"])


def _confirmed_allocation_filters() -> tuple:
    return (
        AttendanceRequest.status == "CONFIRMADO",
        AttendanceRequest.operational_status != "CONCLUÍDO",
        AttendanceRequest.workshop_box_id.is_not(None),
        AttendanceRequest.employee_id.is_not(None),
        AttendanceRequest.scheduled_start_at.is_not(None),
        AttendanceRequest.scheduled_end_at.is_not(None),
    )


def _is_eligible_for_rescheduling(attendance_request: AttendanceRequest) -> bool:
    return (
        attendance_request.status == "CONFIRMADO"
        and attendance_request.operational_status == "AGENDADO"
    )


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
    is_rescheduling = _is_eligible_for_rescheduling(attendance_request)
    if attendance_request.status != "PENDENTE" and not is_rescheduling:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending requests or scheduled confirmed requests can receive a scheduling suggestion.",
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
    allocation_query = select(
        AttendanceRequest.workshop_box_id,
        AttendanceRequest.employee_id,
        AttendanceRequest.scheduled_start_at,
        AttendanceRequest.scheduled_end_at,
    ).where(*_confirmed_allocation_filters())
    if is_rescheduling:
        allocation_query = allocation_query.where(AttendanceRequest.id != attendance_request.id)
    allocations = [
        ScheduledAllocation(
            workshop_box_id=workshop_box_id,
            employee_id=employee_id,
            scheduled_start_at=scheduled_start_at,
            scheduled_end_at=scheduled_end_at,
        )
        for workshop_box_id, employee_id, scheduled_start_at, scheduled_end_at in session.execute(allocation_query)
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


def _persist_administrator_request_schedule(
    request_id: int,
    payload: AdministratorSchedulingConfirmationRequest,
    session: Session,
    *,
    is_rescheduling: bool,
) -> AdministratorSchedulingConfirmationResponse:
    attendance_request = session.get(AttendanceRequest, request_id)
    if attendance_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested attendance request was not found.",
        )
    if is_rescheduling:
        if not _is_eligible_for_rescheduling(attendance_request):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only scheduled confirmed requests can be rescheduled.",
            )
    elif attendance_request.status != "PENDENTE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending requests can be scheduled.",
        )
    if payload.scheduled_start_at < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected interval must start in the future.",
        )

    try:
        scheduled_end_at = calculate_scheduled_end_at(
            payload.scheduled_start_at,
            attendance_request.service.duration_minutes,
        )
    except InvalidScheduleInterval as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    workshop_box = session.scalar(
        select(WorkshopBox).where(WorkshopBox.id == payload.workshop_box_id).with_for_update()
    )
    employee = session.scalar(
        select(Employee).where(Employee.id == payload.employee_id).with_for_update()
    )
    if workshop_box is None or employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The selected workshop resources were not found.",
        )
    if not workshop_box.is_active or not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected workshop resources must be active.",
        )

    conflict_query = select(AttendanceRequest.id).where(
        *_confirmed_allocation_filters(),
        AttendanceRequest.scheduled_start_at < scheduled_end_at,
        AttendanceRequest.scheduled_end_at > payload.scheduled_start_at,
        or_(
            AttendanceRequest.workshop_box_id == workshop_box.id,
            AttendanceRequest.employee_id == employee.id,
        ),
    )
    if is_rescheduling:
        conflict_query = conflict_query.where(AttendanceRequest.id != attendance_request.id)
    conflicting_request_id = session.scalar(conflict_query.limit(1))
    if conflicting_request_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected workshop resources are already allocated in this interval.",
        )

    if not is_rescheduling:
        attendance_request.status = transition_request_status(
            attendance_request.status,
            "CONFIRMADO",
        )
    attendance_request.operational_status = "AGENDADO"
    attendance_request.workshop_box_id = workshop_box.id
    attendance_request.employee_id = employee.id
    attendance_request.scheduled_start_at = payload.scheduled_start_at
    attendance_request.scheduled_end_at = scheduled_end_at
    session.commit()
    session.refresh(attendance_request)

    return AdministratorSchedulingConfirmationResponse(
        id=attendance_request.id,
        status="CONFIRMADO",
        operational_status="AGENDADO",
        workshop_box_id=workshop_box.id,
        workshop_box_label=workshop_box.label,
        employee_id=employee.id,
        employee_name=employee.name,
        scheduled_start_at=attendance_request.scheduled_start_at,
        scheduled_end_at=attendance_request.scheduled_end_at,
    )


@router.post(
    "/{request_id}/schedule",
    response_model=AdministratorSchedulingConfirmationResponse,
)
def confirm_administrator_request_schedule(
    request_id: int,
    payload: AdministratorSchedulingConfirmationRequest,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> AdministratorSchedulingConfirmationResponse:
    return _persist_administrator_request_schedule(
        request_id,
        payload,
        session,
        is_rescheduling=False,
    )


@router.patch(
    "/{request_id}/schedule",
    response_model=AdministratorSchedulingConfirmationResponse,
)
def reschedule_administrator_request(
    request_id: int,
    payload: AdministratorSchedulingConfirmationRequest,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> AdministratorSchedulingConfirmationResponse:
    return _persist_administrator_request_schedule(
        request_id,
        payload,
        session,
        is_rescheduling=True,
    )


@router.patch(
    "/{request_id}/operational-status",
    response_model=AdministratorOperationalStatusResponse,
)
def update_administrator_operational_status(
    request_id: int,
    payload: AdministratorOperationalStatusUpdate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> AdministratorOperationalStatusResponse:
    attendance_request = session.get(AttendanceRequest, request_id)
    if attendance_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested attendance request was not found.",
        )
    if (
        attendance_request.status != "CONFIRMADO"
        or attendance_request.operational_status is None
        or attendance_request.scheduled_start_at is None
        or attendance_request.scheduled_end_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only scheduled confirmed requests can update their operational status.",
        )

    now = datetime.now()
    refreshed_operational_status = refresh_overdue_operational_status(
        current_status=attendance_request.operational_status,
        scheduled_start_at=attendance_request.scheduled_start_at,
        scheduled_end_at=attendance_request.scheduled_end_at,
        now=now,
    )
    if refreshed_operational_status != attendance_request.operational_status:
        attendance_request.operational_status = refreshed_operational_status
        session.commit()
        session.refresh(attendance_request)

    if (
        payload.operational_status == "EM_ANDAMENTO"
        and now < attendance_request.scheduled_start_at
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "O atendimento só pode ser iniciado a partir de "
                f"{attendance_request.scheduled_start_at.strftime('%d/%m/%Y às %H:%M')}."
            ),
        )

    try:
        attendance_request.operational_status = transition_operational_status(
            attendance_request.operational_status,
            payload.operational_status,
        )
    except InvalidOperationalStatusTransition as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested operational status transition is not allowed.",
        ) from error

    session.commit()
    session.refresh(attendance_request)
    return AdministratorOperationalStatusResponse(
        id=attendance_request.id,
        status="CONFIRMADO",
        operational_status=attendance_request.operational_status,
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

    if payload.status == "CONFIRMADO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Requests must be scheduled before they can be confirmed.",
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
        select(
            AttendanceRequest,
            Service.title,
            WorkshopBox.label,
            Employee.name,
        )
        .join(Service, AttendanceRequest.service_id == Service.id)
        .outerjoin(WorkshopBox, AttendanceRequest.workshop_box_id == WorkshopBox.id)
        .outerjoin(Employee, AttendanceRequest.employee_id == Employee.id)
        .where(*filters)
        .order_by(AttendanceRequest.created_at.desc(), AttendanceRequest.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    now = datetime.now()
    has_operational_status_updates = False
    for attendance_request, _, _, _ in rows:
        if attendance_request.status != "CONFIRMADO":
            continue
        next_operational_status = refresh_overdue_operational_status(
            current_status=attendance_request.operational_status,
            scheduled_start_at=attendance_request.scheduled_start_at,
            scheduled_end_at=attendance_request.scheduled_end_at,
            now=now,
        )
        if next_operational_status != attendance_request.operational_status:
            attendance_request.operational_status = next_operational_status
            has_operational_status_updates = True
    if has_operational_status_updates:
        session.commit()

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
                operational_status=attendance_request.operational_status,
                scheduled_start_at=attendance_request.scheduled_start_at,
                scheduled_end_at=attendance_request.scheduled_end_at,
                workshop_box_label=workshop_box_label,
                employee_name=employee_name,
            )
            for attendance_request, service_title, workshop_box_label, employee_name in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=ceil(total / page_size) if total else 0,
    )
