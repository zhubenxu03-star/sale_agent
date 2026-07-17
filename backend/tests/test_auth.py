import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole, UserStatus
from tests.helpers import DEFAULT_PASSWORD, auth_headers, login, register_tenant


def test_register_tenant_success(client, session_factory):
    response = register_tenant(client, "alpha")
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["tenant"]["code"] == "alpha"
    assert body["data"]["user"]["role"] == "admin"

    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == "admin@alpha.com"))
        assert user is not None
        assert user.password_hash != DEFAULT_PASSWORD


def test_duplicate_tenant_code_registration_fails(client):
    assert register_tenant(client, "alpha").status_code == 201
    response = register_tenant(client, "alpha", email="another@example.com")
    assert response.status_code == 409
    assert response.json()["error_code"] == "TENANT_CODE_CONFLICT"


def test_duplicate_email_in_same_tenant_is_rejected(client, session_factory):
    assert register_tenant(client, "alpha").status_code == 201
    with session_factory() as db:
        original = db.scalar(select(User).where(User.email == "admin@alpha.com"))
        duplicate = User(
            tenant_id=original.tenant_id,
            name="重复用户",
            email=original.email,
            password_hash=original.password_hash,
            role=UserRole.SALES,
            status=UserStatus.ACTIVE,
        )
        db.add(duplicate)
        with pytest.raises(IntegrityError):
            db.commit()


def test_same_email_is_allowed_in_different_tenants(client):
    shared_email = "shared@example.com"
    first = register_tenant(client, "alpha", email=shared_email)
    second = register_tenant(client, "beta", email=shared_email)
    assert first.status_code == 201
    assert second.status_code == 201


def test_user_login_success(client):
    register_tenant(client, "alpha")
    response = login(client, "alpha")
    assert response.status_code == 200
    assert response.json()["data"]["token_type"] == "bearer"
    assert response.json()["data"]["access_token"]


def test_wrong_password_login_fails_without_email_disclosure(client):
    register_tenant(client, "alpha")
    response = login(client, "alpha", password="WrongPassword123")
    assert response.status_code == 401
    assert response.json()["error_code"] == "LOGIN_FAILED"
    assert "不存在" not in response.json()["message"]


def test_me_returns_current_tenant_context(client):
    register_tenant(client, "alpha")
    response = client.get("/api/v1/auth/me", headers=auth_headers(client, "alpha"))
    assert response.status_code == 200
    assert response.json()["data"]["tenant"]["code"] == "alpha"


def test_disabled_user_cannot_login(client, session_factory):
    register_tenant(client, "alpha")
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == "admin@alpha.com"))
        user.status = UserStatus.DISABLED
        db.commit()
    assert login(client, "alpha").status_code == 401


def test_disabled_tenant_user_cannot_login(client, session_factory):
    register_tenant(client, "alpha")
    with session_factory() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.code == "alpha"))
        tenant.status = TenantStatus.DISABLED
        db.commit()
    assert login(client, "alpha").status_code == 401
