from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Service
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
