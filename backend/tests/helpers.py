from fastapi.testclient import TestClient

DEFAULT_PASSWORD = "Test123456"


def register_tenant(
    client: TestClient,
    code: str,
    *,
    email: str | None = None,
    name: str | None = None,
    password: str = DEFAULT_PASSWORD,
):
    return client.post(
        "/api/v1/auth/register-tenant",
        json={
            "tenant_name": name or f"{code}科技有限公司",
            "tenant_code": code,
            "admin_name": "管理员",
            "email": email or f"admin@{code}.com",
            "password": password,
        },
    )


def login(
    client: TestClient,
    code: str,
    *,
    email: str | None = None,
    password: str = DEFAULT_PASSWORD,
):
    return client.post(
        "/api/v1/auth/login",
        json={
            "tenant_code": code,
            "email": email or f"admin@{code}.com",
            "password": password,
        },
    )


def auth_headers(client: TestClient, code: str, email: str | None = None) -> dict[str, str]:
    response = login(client, code, email=email)
    assert response.status_code == 200, response.text
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_customer(client: TestClient, headers: dict[str, str], *, name: str = "周明远") -> dict:
    response = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": name,
            "company_name": f"{name}所在企业",
            "stage": "proposal",
            "core_needs": ["CRM 集成", "销售提效"],
            "deal_probability": 68,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def create_conversation(client: TestClient, headers: dict[str, str], customer_id: str) -> dict:
    response = client.post(
        "/api/v1/conversations",
        headers=headers,
        json={"customer_id": customer_id, "title": "方案评估沟通"},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]
