from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta


WORKDAY_START = time(8, 0)
WORKDAY_END = time(18, 0)


@dataclass(frozen=True)
class ScheduledAllocation:
    workshop_box_id: int
    employee_id: int
    scheduled_start_at: datetime
    scheduled_end_at: datetime


@dataclass(frozen=True)
class SchedulingSuggestion:
    workshop_box_id: int
    employee_id: int
    scheduled_start_at: datetime
    scheduled_end_at: datetime


def find_nearest_available_slot(
    *,
    requested_after: datetime,
    duration_minutes: int,
    active_box_ids: Iterable[int],
    active_employee_ids: Iterable[int],
    allocations: Iterable[ScheduledAllocation],
) -> SchedulingSuggestion | None:
    """Find the earliest weekday interval that keeps one box and employee free.

    The workshop does not impose fixed-length slots: every suggestion begins at
    the first available minute and reserves exactly the service duration.
    """
    if duration_minutes <= 0:
        raise ValueError("The service duration must be positive.")

    box_ids = sorted(set(active_box_ids))
    employee_ids = sorted(set(active_employee_ids))
    if not box_ids or not employee_ids:
        return None

    normalized_requested_after = _ceil_to_minute(requested_after)
    recorded_allocations = tuple(allocations)
    latest_allocation_end = max(
        (allocation.scheduled_end_at for allocation in recorded_allocations),
        default=normalized_requested_after,
    )
    last_search_day = max(normalized_requested_after, latest_allocation_end).date() + timedelta(
        days=7
    )
    duration = timedelta(minutes=duration_minutes)
    current_day = normalized_requested_after.date()

    while current_day <= last_search_day:
        first_start = _first_possible_start(current_day, normalized_requested_after, duration)
        if first_start is not None:
            suggestions = []
            for workshop_box_id in box_ids:
                for employee_id in employee_ids:
                    suggestion = _suggest_for_resource_pair(
                        workshop_box_id=workshop_box_id,
                        employee_id=employee_id,
                        first_start=first_start,
                        duration=duration,
                        allocations=recorded_allocations,
                    )
                    if suggestion is not None:
                        suggestions.append(suggestion)
            if suggestions:
                return min(
                    suggestions,
                    key=lambda suggestion: (
                        suggestion.scheduled_start_at,
                        suggestion.workshop_box_id,
                        suggestion.employee_id,
                    ),
                )

        current_day += timedelta(days=1)

    return None


def _first_possible_start(
    day: date,
    requested_after: datetime,
    duration: timedelta,
) -> datetime | None:
    if day.weekday() >= 5:
        return None

    workday_start = datetime.combine(day, WORKDAY_START)
    workday_end = datetime.combine(day, WORKDAY_END)
    candidate_start = max(workday_start, requested_after)
    if candidate_start + duration > workday_end:
        return None
    return candidate_start


def _suggest_for_resource_pair(
    *,
    workshop_box_id: int,
    employee_id: int,
    first_start: datetime,
    duration: timedelta,
    allocations: Iterable[ScheduledAllocation],
) -> SchedulingSuggestion | None:
    candidate_start = first_start
    relevant_allocations = sorted(
        (
            allocation
            for allocation in allocations
            if allocation.workshop_box_id == workshop_box_id
            or allocation.employee_id == employee_id
        ),
        key=lambda allocation: (allocation.scheduled_start_at, allocation.scheduled_end_at),
    )

    for allocation in relevant_allocations:
        if allocation.scheduled_end_at <= candidate_start:
            continue
        if allocation.scheduled_start_at >= candidate_start + duration:
            break
        candidate_start = _ceil_to_minute(allocation.scheduled_end_at)

    candidate_end = candidate_start + duration
    if candidate_end > datetime.combine(candidate_start.date(), WORKDAY_END):
        return None

    return SchedulingSuggestion(
        workshop_box_id=workshop_box_id,
        employee_id=employee_id,
        scheduled_start_at=candidate_start,
        scheduled_end_at=candidate_end,
    )


def _ceil_to_minute(value: datetime) -> datetime:
    normalized_value = value.replace(second=0, microsecond=0)
    if normalized_value == value:
        return normalized_value
    return normalized_value + timedelta(minutes=1)
