from datetime import datetime

import pytest

from app.operational_status import refresh_overdue_operational_status
from app.operational_status import (
    InvalidOperationalStatusTransition,
    transition_operational_status,
)


@pytest.mark.parametrize(
    ("current_status", "now"),
    [
        ("AGENDADO", datetime(2026, 9, 7, 8, 1)),
        ("EM_ANDAMENTO", datetime(2026, 9, 7, 8, 46)),
    ],
)
def test_marks_a_scheduled_or_in_progress_attendance_as_delayed_when_its_time_passes(
    current_status: str,
    now: datetime,
) -> None:
    assert (
        refresh_overdue_operational_status(
            current_status=current_status,
            scheduled_start_at=datetime(2026, 9, 7, 8, 0),
            scheduled_end_at=datetime(2026, 9, 7, 8, 45),
            now=now,
        )
        == "ATRASADO"
    )


def test_keeps_a_scheduled_attendance_on_time_until_its_start_has_passed() -> None:
    assert (
        refresh_overdue_operational_status(
            current_status="AGENDADO",
            scheduled_start_at=datetime(2026, 9, 7, 8, 0),
            scheduled_end_at=datetime(2026, 9, 7, 8, 45),
            now=datetime(2026, 9, 7, 8, 0),
        )
        == "AGENDADO"
    )


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [
        ("AGENDADO", "EM_ANDAMENTO"),
        ("EM_ANDAMENTO", "CONCLUÍDO"),
        ("ATRASADO", "CONCLUÍDO"),
    ],
)
def test_allows_the_operational_status_transitions_that_release_resources_only_on_completion(
    current_status: str,
    next_status: str,
) -> None:
    assert transition_operational_status(current_status, next_status) == next_status


def test_rejects_operational_status_transitions_that_skip_the_attendance_lifecycle() -> None:
    with pytest.raises(InvalidOperationalStatusTransition):
        transition_operational_status("AGENDADO", "CONCLUÍDO")
