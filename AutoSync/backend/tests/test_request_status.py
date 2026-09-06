import pytest

from app.request_status import (
    InvalidRequestStatusTransition,
    transition_request_status,
)


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [
        ("PENDENTE", "CONFIRMADO"),
        ("PENDENTE", "CANCELADO"),
        ("CONFIRMADO", "CANCELADO"),
    ],
)
def test_request_status_allows_the_confirmed_transitions(
    current_status: str,
    next_status: str,
) -> None:
    assert transition_request_status(current_status, next_status) == next_status


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [
        ("PENDENTE", "PENDENTE"),
        ("CONFIRMADO", "PENDENTE"),
        ("CANCELADO", "CONFIRMADO"),
        ("CANCELADO", "CANCELADO"),
        ("DESCONHECIDO", "CANCELADO"),
    ],
)
def test_request_status_rejects_invalid_transitions(
    current_status: str,
    next_status: str,
) -> None:
    with pytest.raises(InvalidRequestStatusTransition):
        transition_request_status(current_status, next_status)
