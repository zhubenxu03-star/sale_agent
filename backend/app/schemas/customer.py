from datetime import date, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

JsonCollection = list[Any] | dict[str, Any]


class CustomerFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    company_name: str | None = Field(default=None, max_length=240)
    industry: str | None = Field(default=None, max_length=120)
    company_size: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=120)
    stage: str | None = Field(default=None, max_length=80)
    budget_min: Decimal | None = Field(default=None, ge=0)
    budget_max: Decimal | None = Field(default=None, ge=0)
    expected_amount: Decimal | None = Field(default=None, ge=0)
    expected_close_date: date | None = None
    deal_probability: Decimal | None = Field(default=None, ge=0, le=100)
    core_needs: JsonCollection | None = None
    pain_points: JsonCollection | None = None
    objections: JsonCollection | None = None
    notes: str | None = None
    owner_user_id: UUID | None = None

    @model_validator(mode="after")
    def validate_budget_range(self) -> "CustomerFields":
        if (
            self.budget_min is not None
            and self.budget_max is not None
            and self.budget_min > self.budget_max
        ):
            raise ValueError("budget_min must not exceed budget_max")
        return self


class CustomerCreate(CustomerFields):
    pass


class CustomerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    company_name: str | None = Field(default=None, max_length=240)
    industry: str | None = Field(default=None, max_length=120)
    company_size: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=120)
    stage: str | None = Field(default=None, max_length=80)
    budget_min: Decimal | None = Field(default=None, ge=0)
    budget_max: Decimal | None = Field(default=None, ge=0)
    expected_amount: Decimal | None = Field(default=None, ge=0)
    expected_close_date: date | None = None
    deal_probability: Decimal | None = Field(default=None, ge=0, le=100)
    core_needs: JsonCollection | None = None
    pain_points: JsonCollection | None = None
    objections: JsonCollection | None = None
    notes: str | None = None
    owner_user_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def name_cannot_be_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("name cannot be null")
        return value


class CustomerOut(CustomerFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime


class CustomerPage(BaseModel):
    items: list[CustomerOut]
    page: int
    page_size: int
    total: int
    total_pages: int

    @classmethod
    def build(
        cls, *, items: list[CustomerOut], page: int, page_size: int, total: int
    ) -> "CustomerPage":
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=ceil(total / page_size) if total else 0,
        )
