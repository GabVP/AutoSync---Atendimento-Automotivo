from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Employee, WorkshopBox


def test_inactive_workshop_resources_remain_persisted_for_future_history() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        workshop_box = WorkshopBox(label="Box 1", is_active=True)
        employee = Employee(name="Ana Martins", is_active=True)
        session.add_all([workshop_box, employee])
        session.commit()

        workshop_box_id = workshop_box.id
        employee_id = employee.id
        workshop_box.is_active = False
        employee.is_active = False
        session.commit()

        persisted_box = session.get(WorkshopBox, workshop_box_id)
        persisted_employee = session.get(Employee, employee_id)

    assert persisted_box is not None
    assert persisted_box.label == "Box 1"
    assert persisted_box.is_active is False
    assert persisted_employee is not None
    assert persisted_employee.name == "Ana Martins"
    assert persisted_employee.is_active is False
