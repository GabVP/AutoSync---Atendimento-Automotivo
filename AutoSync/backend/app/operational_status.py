from datetime import datetime


VALID_OPERATIONAL_STATUS_TRANSITIONS = {
    "AGENDADO": frozenset({"EM_ANDAMENTO"}),
    "EM_ANDAMENTO": frozenset({"CONCLUÍDO"}),
    "ATRASADO": frozenset({"CONCLUÍDO"}),
    "CONCLUÍDO": frozenset(),
}


class InvalidOperationalStatusTransition(ValueError):
    """Raised when an attendance skips an operational lifecycle step."""


def transition_operational_status(current_status: str, next_status: str) -> str:
    if next_status in VALID_OPERATIONAL_STATUS_TRANSITIONS.get(current_status, frozenset()):
        return next_status
    raise InvalidOperationalStatusTransition(
        f"Attendance cannot transition from {current_status} to {next_status}."
    )


def refresh_overdue_operational_status(
    *,
    current_status: str | None,
    scheduled_start_at: datetime | None,
    scheduled_end_at: datetime | None,
    now: datetime,
) -> str | None:
    """Return the operational state after applying the time-based delay rule."""
    if current_status in (None, "CONCLUÍDO"):
        return current_status
    if scheduled_start_at is None or scheduled_end_at is None:
        return current_status
    if current_status == "AGENDADO" and now > scheduled_start_at:
        return "ATRASADO"
    if current_status == "EM_ANDAMENTO" and now > scheduled_end_at:
        return "ATRASADO"
    return current_status
