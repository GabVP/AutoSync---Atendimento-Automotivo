from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Administrator, Employee, WorkshopBox
from app.schemas import (
    AdministratorEmployeeCreate,
    AdministratorEmployeeResponse,
    AdministratorEmployeeUpdate,
    AdministratorWorkshopBoxCreate,
    AdministratorWorkshopBoxResponse,
    AdministratorWorkshopBoxUpdate,
)
from app.security import get_current_administrator

router = APIRouter(prefix="/admin", tags=["administrator workshop resources"])


def workshop_box_label_is_already_in_use(
    session: Session,
    label: str,
    excluded_workshop_box_id: int | None = None,
) -> bool:
    statement = select(WorkshopBox.id).where(func.lower(WorkshopBox.label) == label.lower())
    if excluded_workshop_box_id is not None:
        statement = statement.where(WorkshopBox.id != excluded_workshop_box_id)
    return session.scalar(statement) is not None


def employee_name_is_already_in_use(
    session: Session,
    name: str,
    excluded_employee_id: int | None = None,
) -> bool:
    statement = select(Employee.id).where(func.lower(Employee.name) == name.lower())
    if excluded_employee_id is not None:
        statement = statement.where(Employee.id != excluded_employee_id)
    return session.scalar(statement) is not None


@router.get("/boxes", response_model=list[AdministratorWorkshopBoxResponse])
def list_administrator_workshop_boxes(
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> list[WorkshopBox]:
    return list(session.scalars(select(WorkshopBox).order_by(WorkshopBox.label)))


@router.post(
    "/boxes",
    response_model=AdministratorWorkshopBoxResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_administrator_workshop_box(
    payload: AdministratorWorkshopBoxCreate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> WorkshopBox:
    if workshop_box_label_is_already_in_use(session, payload.label):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workshop box with this label already exists.",
        )

    workshop_box = WorkshopBox(label=payload.label, is_active=True)
    session.add(workshop_box)
    session.commit()
    session.refresh(workshop_box)
    return workshop_box


@router.patch("/boxes/{workshop_box_id}", response_model=AdministratorWorkshopBoxResponse)
def update_administrator_workshop_box(
    workshop_box_id: int,
    payload: AdministratorWorkshopBoxUpdate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> WorkshopBox:
    workshop_box = session.get(WorkshopBox, workshop_box_id)
    if workshop_box is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested workshop box was not found.",
        )

    changes = payload.model_dump(exclude_unset=True)
    next_label = changes.get("label")
    if next_label and workshop_box_label_is_already_in_use(session, next_label, workshop_box.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workshop box with this label already exists.",
        )

    for field, value in changes.items():
        setattr(workshop_box, field, value)

    session.commit()
    session.refresh(workshop_box)
    return workshop_box


@router.get("/employees", response_model=list[AdministratorEmployeeResponse])
def list_administrator_employees(
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> list[Employee]:
    return list(session.scalars(select(Employee).order_by(Employee.name)))


@router.post(
    "/employees",
    response_model=AdministratorEmployeeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_administrator_employee(
    payload: AdministratorEmployeeCreate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> Employee:
    if employee_name_is_already_in_use(session, payload.name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this name already exists.",
        )

    employee = Employee(name=payload.name, is_active=True)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    return employee


@router.patch("/employees/{employee_id}", response_model=AdministratorEmployeeResponse)
def update_administrator_employee(
    employee_id: int,
    payload: AdministratorEmployeeUpdate,
    session: Session = Depends(get_session),
    _: Administrator = Depends(get_current_administrator),
) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested employee was not found.",
        )

    changes = payload.model_dump(exclude_unset=True)
    next_name = changes.get("name")
    if next_name and employee_name_is_already_in_use(session, next_name, employee.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this name already exists.",
        )

    for field, value in changes.items():
        setattr(employee, field, value)

    session.commit()
    session.refresh(employee)
    return employee
