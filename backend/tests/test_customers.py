from tests.helpers import auth_headers, create_customer, register_tenant


def setup_two_tenants(client):
    register_tenant(client, "alpha")
    register_tenant(client, "beta")
    return auth_headers(client, "alpha"), auth_headers(client, "beta")


def test_unauthenticated_user_cannot_access_customers(client):
    response = client.get("/api/v1/customers")
    assert response.status_code == 401


def test_create_customer_binds_current_tenant(client):
    register = register_tenant(client, "alpha")
    tenant_id = register.json()["data"]["tenant"]["id"]
    customer = create_customer(client, auth_headers(client, "alpha"))
    assert customer["tenant_id"] == tenant_id


def test_customer_request_cannot_inject_tenant_id(client):
    alpha_registration = register_tenant(client, "alpha")
    beta_registration = register_tenant(client, "beta")
    beta_tenant_id = beta_registration.json()["data"]["tenant"]["id"]
    response = client.post(
        "/api/v1/customers",
        headers=auth_headers(client, "alpha"),
        json={"name": "越权客户", "tenant_id": beta_tenant_id},
    )
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert alpha_registration.status_code == 201


def test_list_and_search_only_returns_current_tenant_customers(client):
    alpha_headers, beta_headers = setup_two_tenants(client)
    create_customer(client, alpha_headers, name="周明远")
    create_customer(client, beta_headers, name="林舒雅")

    response = client.get("/api/v1/customers?search=周&stage=proposal", headers=alpha_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 1
    assert [item["name"] for item in data["items"]] == ["周明远"]


def test_tenant_a_cannot_read_tenant_b_customer(client):
    alpha_headers, beta_headers = setup_two_tenants(client)
    beta_customer = create_customer(client, beta_headers)
    response = client.get(f"/api/v1/customers/{beta_customer['id']}", headers=alpha_headers)
    assert response.status_code == 404
    assert response.json()["error_code"] == "CUSTOMER_NOT_FOUND"


def test_tenant_a_cannot_update_tenant_b_customer(client):
    alpha_headers, beta_headers = setup_two_tenants(client)
    beta_customer = create_customer(client, beta_headers)
    response = client.put(
        f"/api/v1/customers/{beta_customer['id']}",
        headers=alpha_headers,
        json={"name": "越权修改"},
    )
    assert response.status_code == 404

    original = client.get(f"/api/v1/customers/{beta_customer['id']}", headers=beta_headers)
    assert original.json()["data"]["name"] == "周明远"


def test_tenant_a_cannot_delete_tenant_b_customer(client):
    alpha_headers, beta_headers = setup_two_tenants(client)
    beta_customer = create_customer(client, beta_headers)
    response = client.delete(f"/api/v1/customers/{beta_customer['id']}", headers=alpha_headers)
    assert response.status_code == 404
    assert (
        client.get(f"/api/v1/customers/{beta_customer['id']}", headers=beta_headers).status_code
        == 200
    )


def test_owner_user_id_cannot_reference_another_tenant(client):
    alpha_registration = register_tenant(client, "alpha")
    beta_registration = register_tenant(client, "beta")
    assert alpha_registration.status_code == 201
    beta_user_id = beta_registration.json()["data"]["user"]["id"]

    response = client.post(
        "/api/v1/customers",
        headers=auth_headers(client, "alpha"),
        json={"name": "越权负责人客户", "owner_user_id": beta_user_id},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "INVALID_OWNER"
