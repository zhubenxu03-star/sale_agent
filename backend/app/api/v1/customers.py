from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.customer import Customer
from app.models.user import User
from app.schemas.common import APIResponse, success_response
from app.schemas.customer import (
    CustomerCreate,
    CustomerOut,
    CustomerPage,
    CustomerUpdate,
)

router = APIRouter()


def find_customer_or_404(db: Session, customer_id: UUID, tenant_id: UUID) -> Customer:
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )
    if customer is None:
        raise AppException(404, "客户不存在", "CUSTOMER_NOT_FOUND")
    return customer


def validate_owner(db: Session, owner_user_id: UUID, tenant_id: UUID) -> None:
    owner_exists = db.scalar(
        select(User.id).where(User.id == owner_user_id, User.tenant_id == tenant_id)
    )
    if owner_exists is None:
        raise AppException(400, "负责人不属于当前企业", "INVALID_OWNER")


@router.get("", response_model=APIResponse[CustomerPage])
def list_customers(
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=120),
    stage: str | None = Query(default=None, max_length=80),
) -> dict[str, object]:
    filters = [Customer.tenant_id == current_user.tenant_id]
    if search:
        keyword = f"%{search.strip()}%"
        filters.append(or_(Customer.name.ilike(keyword), Customer.company_name.ilike(keyword)))
    if stage:
        filters.append(Customer.stage == stage)

    total = db.scalar(select(func.count()).select_from(Customer).where(*filters)) or 0
    customers = list(
        db.scalars(
            select(Customer)
            .where(*filters)
            .order_by(Customer.created_at.desc(), Customer.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return success_response(
        CustomerPage.build(
            items=[CustomerOut.model_validate(item) for item in customers],
            page=page,
            page_size=page_size,
            total=total,
        )
    )


@router.post("", response_model=APIResponse[CustomerOut], status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    values = payload.model_dump()
    owner_user_id = values.pop("owner_user_id") or current_user.id
    validate_owner(db, owner_user_id, current_user.tenant_id)

    customer = Customer(
        **values,
        tenant_id=current_user.tenant_id,
        owner_user_id=owner_user_id,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return success_response(CustomerOut.model_validate(customer), "客户创建成功")


@router.get("/{customer_id}", response_model=APIResponse[CustomerOut])
def get_customer(customer_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    customer = find_customer_or_404(db, customer_id, current_user.tenant_id)
    return success_response(CustomerOut.model_validate(customer))


@router.put("/{customer_id}", response_model=APIResponse[CustomerOut])
def update_customer(
    customer_id: UUID,
    payload: CustomerUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    customer = find_customer_or_404(db, customer_id, current_user.tenant_id)
    values = payload.model_dump(exclude_unset=True)

    if "owner_user_id" in values and values["owner_user_id"] is not None:
        validate_owner(db, values["owner_user_id"], current_user.tenant_id)

    next_budget_min = values.get("budget_min", customer.budget_min)
    next_budget_max = values.get("budget_max", customer.budget_max)
    if (
        next_budget_min is not None
        and next_budget_max is not None
        and next_budget_min > next_budget_max
    ):
        raise AppException(422, "预算下限不能高于预算上限", "INVALID_BUDGET_RANGE")

    for field, value in values.items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return success_response(CustomerOut.model_validate(customer), "客户更新成功")


@router.delete("/{customer_id}", response_model=APIResponse[dict[str, UUID]])
def delete_customer(
    customer_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    customer = find_customer_or_404(db, customer_id, current_user.tenant_id)
    db.delete(customer)
    db.commit()
    return success_response({"id": customer_id}, "客户删除成功")
