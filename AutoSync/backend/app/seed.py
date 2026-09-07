from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Administrator, Employee, Service, WorkshopBox
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
    session.commit()


def main() -> None:
    with SessionLocal() as session:
        seed_demo_data(session)


if __name__ == "__main__":
    main()
