from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Service
from app.schemas import PublicServiceResponse

router = APIRouter(tags=["public services"])


@router.get("/services", response_model=list[PublicServiceResponse])
def list_active_services(
    session: Session = Depends(get_session),
) -> list[Service]:
    return list(
        session.scalars(
            select(Service).where(Service.is_active.is_(True)).order_by(Service.title)
        )
    )
