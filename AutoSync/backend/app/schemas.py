from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class AdministratorLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_in: int


class AdministratorRequestSummary(BaseModel):
    id: int
    name: str
    email: EmailStr | None
    phone: str
    service_title: str
    status: Literal["PENDENTE", "CONFIRMADO", "CANCELADO"]
    tracking_code: str
    created_at: datetime
    operational_status: Literal["AGENDADO", "EM_ANDAMENTO", "ATRASADO", "CONCLUÍDO"] | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    workshop_box_label: str | None = None
    employee_name: str | None = None


class AdministratorRequestPage(BaseModel):
    items: list[AdministratorRequestSummary]
    page: int
    page_size: int
    total: int
    total_pages: int


class AdministratorRequestStatusUpdate(BaseModel):
    status: Literal["PENDENTE", "CONFIRMADO", "CANCELADO"]


class AdministratorRequestStatusResponse(BaseModel):
    id: int
    status: Literal["PENDENTE", "CONFIRMADO", "CANCELADO"]


class AdministratorSchedulingSuggestionResponse(BaseModel):
    request_id: int
    workshop_box_id: int
    workshop_box_label: str
    employee_id: int
    employee_name: str
    scheduled_start_at: datetime
    scheduled_end_at: datetime


class AdministratorSchedulingConfirmationRequest(BaseModel):
    workshop_box_id: int = Field(ge=1)
    employee_id: int = Field(ge=1)
    scheduled_start_at: datetime

    @field_validator("scheduled_start_at")
    @classmethod
    def scheduled_start_must_use_local_minute_precision(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            raise ValueError("Use a local date and time without a timezone offset.")
        if value.second or value.microsecond:
            raise ValueError("Scheduling must start at an exact minute.")
        return value


class AdministratorSchedulingConfirmationResponse(BaseModel):
    id: int
    status: Literal["CONFIRMADO"]
    operational_status: Literal["AGENDADO"]
    workshop_box_id: int
    workshop_box_label: str
    employee_id: int
    employee_name: str
    scheduled_start_at: datetime
    scheduled_end_at: datetime


class AdministratorServiceCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    duration_minutes: int = Field(ge=1, le=480)

    @field_validator("title")
    @classmethod
    def title_cannot_be_blank(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value


class AdministratorServiceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    duration_minutes: int | None = Field(default=None, ge=1, le=480)
    is_active: bool | None = None

    @field_validator("title")
    @classmethod
    def title_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value

    @model_validator(mode="after")
    def requires_a_change(self) -> "AdministratorServiceUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one service field to update.")
        return self


class AdministratorServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    duration_minutes: int
    is_active: bool


class AdministratorWorkshopBoxCreate(BaseModel):
    label: str = Field(min_length=2, max_length=80)

    @field_validator("label")
    @classmethod
    def label_cannot_be_blank(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value


class AdministratorWorkshopBoxUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=2, max_length=80)
    is_active: bool | None = None

    @field_validator("label")
    @classmethod
    def label_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value

    @model_validator(mode="after")
    def requires_a_change(self) -> "AdministratorWorkshopBoxUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one workshop box field to update.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Workshop box fields cannot be null.")
        return self


class AdministratorWorkshopBoxResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    is_active: bool


class AdministratorEmployeeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def name_cannot_be_blank(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value


class AdministratorEmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value

    @model_validator(mode="after")
    def requires_a_change(self) -> "AdministratorEmployeeUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one employee field to update.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Employee fields cannot be null.")
        return self


class AdministratorEmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool


class PublicServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    duration_minutes: int


class PublicRequestCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    phone: str = Field(min_length=10, max_length=30, pattern=r"^[0-9()+\-\s]+$")
    email: EmailStr | None = None
    vehicle_make: str = Field(min_length=2, max_length=80)
    vehicle_model: str = Field(min_length=1, max_length=80)
    vehicle_plate: str = Field(min_length=7, max_length=10)
    service_id: int = Field(ge=1)
    description: str = Field(min_length=5, max_length=1_000)
    preference: str | None = Field(default=None, max_length=1_000)

    @field_validator(
        "name",
        "phone",
        "vehicle_make",
        "vehicle_model",
        "vehicle_plate",
        "description",
    )
    @classmethod
    def required_text_cannot_be_blank(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("This field cannot be blank.")
        return normalized_value

    @field_validator("preference")
    @classmethod
    def normalize_optional_preference(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class PublicRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    tracking_code: str
    service_title: str
    created_at: datetime


class PublicRequestTrackingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tracking_code: str
    status: str
    service_title: str
    vehicle_make: str
    vehicle_model: str
    created_at: datetime
    updated_at: datetime
