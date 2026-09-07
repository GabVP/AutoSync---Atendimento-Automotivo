from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Employee, Service, WorkshopBox
from app.seed import seed_demo_data


def test_seed_provides_four_active_services_on_a_fresh_database() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_demo_data(session)
        services = list(session.scalars(select(Service).where(Service.is_active.is_(True))))

    assert {service.title for service in services} == {
        "Alinhamento e balanceamento",
        "Diagnóstico eletrônico",
        "Revisão preventiva",
        "Troca de óleo",
    }


def test_seed_provides_active_workshop_resources_on_a_fresh_database() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_demo_data(session)
        boxes = list(session.scalars(select(WorkshopBox).where(WorkshopBox.is_active.is_(True))))
        employees = list(session.scalars(select(Employee).where(Employee.is_active.is_(True))))

    assert {workshop_box.label for workshop_box in boxes} == {"Box 1", "Box 2"}
    assert {employee.name for employee in employees} == {
        "Ana Martins",
        "Bruno Lima",
        "Carla Souza",
    }
