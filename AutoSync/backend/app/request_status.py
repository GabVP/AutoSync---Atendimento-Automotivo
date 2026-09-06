from typing import Final


VALID_STATUS_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "PENDENTE": frozenset({"CONFIRMADO", "CANCELADO"}),
    "CONFIRMADO": frozenset({"CANCELADO"}),
    "CANCELADO": frozenset(),
}


class InvalidRequestStatusTransition(ValueError):
    """Raised when a request status cannot move to the requested state."""


def transition_request_status(current_status: str, next_status: str) -> str:
    if next_status in VALID_STATUS_TRANSITIONS.get(current_status, frozenset()):
        return next_status

    raise InvalidRequestStatusTransition(
        f"Request status cannot transition from {current_status} to {next_status}."
    )
