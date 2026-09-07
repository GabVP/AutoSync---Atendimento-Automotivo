from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Administrator,
    AttendanceRequest,
    Employee,
    Service,
    WorkshopBox,
)
from app.security import hash_password

DEMO_SERVICES = (
    ("Troca de óleo", 45),
    ("Revisão preventiva", 90),
    ("Alinhamento e balanceamento", 60),
    ("Diagnóstico eletrônico", 75),
)
DEMO_WORKSHOP_BOXES = ("Box 1", "Box 2")
DEMO_EMPLOYEES = ("Ana Martins", "Bruno Lima", "Carla Souza")
DEMO_ADMIN_EMAIL = "admin@autosync.example.com"
DEMO_ADMIN_PASSWORD = "autosync-demo"
DEMO_PENDING_REQUEST_TRACKING_CODE = "ATS-0B0B0001"
DEMO_SCHEDULED_REQUEST_TRACKING_CODE = "ATS-A11CE001"


def _next_weekday_opening(now: datetime) -> datetime:
    scheduled_start_at = now.replace(hour=9, minute=0, second=0, microsecond=0)
    while scheduled_start_at.weekday() > 4 or scheduled_start_at <= now:
        scheduled_start_at = (scheduled_start_at + timedelta(days=1)).replace(
            hour=9,
            minute=0,
            second=0,
            microsecond=0,
        )
    return scheduled_start_at


def seed_demo_data(session: Session) -> None:
    existing_titles = set(session.scalars(select(Service.title)))
    session.add_all(
        Service(title=title, duration_minutes=duration_minutes, is_active=True)
        for title, duration_minutes in DEMO_SERVICES
        if title not in existing_titles
    )
    existing_box_labels = set(session.scalars(select(WorkshopBox.label)))
    session.add_all(
        WorkshopBox(label=label, is_active=True)
        for label in DEMO_WORKSHOP_BOXES
        if label not in existing_box_labels
    )
    existing_employee_names = set(session.scalars(select(Employee.name)))
    session.add_all(
        Employee(name=name, is_active=True)
        for name in DEMO_EMPLOYEES
        if name not in existing_employee_names
    )
    existing_administrator = session.scalar(
        select(Administrator).where(Administrator.email == DEMO_ADMIN_EMAIL)
    )
    if existing_administrator is None:
        session.add(
            Administrator(
                email=DEMO_ADMIN_EMAIL,
                password_hash=hash_password(DEMO_ADMIN_PASSWORD),
            )
        )

    session.flush()

    services_by_title = {
        service.title: service for service in session.scalars(select(Service))
    }
    boxes_by_label = {
        workshop_box.label: workshop_box
        for workshop_box in session.scalars(select(WorkshopBox))
    }
    employees_by_name = {
        employee.name: employee for employee in session.scalars(select(Employee))
    }
    existing_tracking_codes = set(session.scalars(select(AttendanceRequest.tracking_code)))

    if DEMO_PENDING_REQUEST_TRACKING_CODE not in existing_tracking_codes:
        session.add(
            AttendanceRequest(
                name="Mariana Costa",
                phone="11987654321",
                email="mariana.costa@example.com",
                vehicle_make="Honda",
                vehicle_model="Fit",
                vehicle_plate="BRA2E19",
                service_id=services_by_title["Troca de óleo"].id,
                description="Troca de óleo e filtro antes de uma viagem.",
                preference="Prefiro atendimento pela manhã.",
                status="PENDENTE",
                tracking_code=DEMO_PENDING_REQUEST_TRACKING_CODE,
            )
        )

    if DEMO_SCHEDULED_REQUEST_TRACKING_CODE not in existing_tracking_codes:
        scheduled_start_at = _next_weekday_opening(datetime.now())
        session.add(
            AttendanceRequest(
                name="Rafael Mendes",
                phone="11976543210",
                email="rafael.mendes@example.com",
                vehicle_make="Toyota",
                vehicle_model="Corolla",
                vehicle_plate="FDE3A45",
                service_id=services_by_title["Revisão preventiva"].id,
                description="Revisão preventiva para checar freios e fluidos.",
                status="CONFIRMADO",
                workshop_box_id=boxes_by_label["Box 1"].id,
                employee_id=employees_by_name["Ana Martins"].id,
                scheduled_start_at=scheduled_start_at,
                scheduled_end_at=scheduled_start_at + timedelta(minutes=90),
                operational_status="AGENDADO",
                tracking_code=DEMO_SCHEDULED_REQUEST_TRACKING_CODE,
            )
        )
    session.commit()


def main() -> None:
    with SessionLocal() as session:
        seed_demo_data(session)


if __name__ == "__main__":
    main()
