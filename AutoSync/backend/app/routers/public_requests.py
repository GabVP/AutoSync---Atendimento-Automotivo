from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import AttendanceRequest, Service
from app.schemas import PublicRequestCreate, PublicRequestResponse

router = APIRouter(tags=["public requests"])


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
