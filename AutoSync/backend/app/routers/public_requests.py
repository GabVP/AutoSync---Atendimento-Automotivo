import re
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import AttendanceRequest, Service
from app.schemas import (
    PublicRequestCreate,
    PublicRequestResponse,
    PublicRequestTrackingResponse,
)

router = APIRouter(tags=["public requests"])

TRACKING_CODE_PATTERN = re.compile(r"^ATS-[A-F0-9]{8}$")
TRACKING_NOT_FOUND_DETAIL = "No request was found for this tracking code."


@router.post(
    "/requests",
    response_model=PublicRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_public_request(
    payload: PublicRequestCreate,
    session: Session = Depends(get_session),
) -> PublicRequestResponse:
    service = session.scalar(
        select(Service).where(Service.id == payload.service_id, Service.is_active.is_(True))
    )
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected service is unavailable.",
        )

    request = AttendanceRequest(
        **payload.model_dump(),
        status="PENDENTE",
        tracking_code=f"ATS-{token_hex(4).upper()}",
    )
    session.add(request)
    session.commit()
    session.refresh(request)

    return PublicRequestResponse(
        id=request.id,
        status=request.status,
        tracking_code=request.tracking_code,
        service_title=service.title,
        created_at=request.created_at,
    )


@router.get(
    "/requests/{tracking_code}",
    response_model=PublicRequestTrackingResponse,
)
def get_public_request_tracking(
    tracking_code: str,
    session: Session = Depends(get_session),
) -> PublicRequestTrackingResponse:
    normalized_tracking_code = tracking_code.strip().upper()
    if not TRACKING_CODE_PATTERN.fullmatch(normalized_tracking_code):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TRACKING_NOT_FOUND_DETAIL,
        )

    attendance_request = session.scalar(
        select(AttendanceRequest).where(
            AttendanceRequest.tracking_code == normalized_tracking_code
        )
    )
    if attendance_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TRACKING_NOT_FOUND_DETAIL,
        )

    return PublicRequestTrackingResponse(
        tracking_code=attendance_request.tracking_code,
        status=attendance_request.status,
        service_title=attendance_request.service.title,
        vehicle_make=attendance_request.vehicle_make,
        vehicle_model=attendance_request.vehicle_model,
        created_at=attendance_request.created_at,
        updated_at=attendance_request.updated_at,
    )
