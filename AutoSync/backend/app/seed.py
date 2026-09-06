from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Service

DEMO_SERVICES = (
    ("Troca de óleo", 45),
    ("Revisão preventiva", 90),
    ("Alinhamento e balanceamento", 60),
    ("Diagnóstico eletrônico", 75),
)


def seed_demo_data(session: Session) -> None:
    existing_titles = set(session.scalars(select(Service.title)))
    session.add_all(
        Service(title=title, duration_minutes=duration_minutes, is_active=True)
        for title, duration_minutes in DEMO_SERVICES
        if title not in existing_titles
    )
    session.commit()


def main() -> None:
    with SessionLocal() as session:
        seed_demo_data(session)


if __name__ == "__main__":
    main()
