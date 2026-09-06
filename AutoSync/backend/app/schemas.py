from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
