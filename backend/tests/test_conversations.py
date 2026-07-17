from tests.helpers import (
    auth_headers,
    create_conversation,
    create_customer,
    register_tenant,
)


def setup_tenant_conversations(client):
    register_tenant(client, "alpha")
    register_tenant(client, "beta")
    alpha_headers = auth_headers(client, "alpha")
    beta_headers = auth_headers(client, "beta")
    beta_customer = create_customer(client, beta_headers)
    beta_conversation = create_conversation(client, beta_headers, beta_customer["id"])
    return alpha_headers, beta_headers, beta_conversation


def test_tenant_a_cannot_read_tenant_b_conversation(client):
    alpha_headers, _, beta_conversation = setup_tenant_conversations(client)
    response = client.get(f"/api/v1/conversations/{beta_conversation['id']}", headers=alpha_headers)
    assert response.status_code == 404
    assert response.json()["error_code"] == "CONVERSATION_NOT_FOUND"


def test_tenant_a_cannot_write_to_tenant_b_conversation(client):
    alpha_headers, beta_headers, beta_conversation = setup_tenant_conversations(client)
    response = client.post(
        f"/api/v1/conversations/{beta_conversation['id']}/messages",
        headers=alpha_headers,
        json={"sender_type": "assistant", "content": "越权消息"},
    )
    assert response.status_code == 404

    messages = client.get(
        f"/api/v1/conversations/{beta_conversation['id']}/messages",
        headers=beta_headers,
    )
    assert messages.json()["data"] == []


def test_messages_are_returned_in_created_at_order(client):
    register_tenant(client, "alpha")
    headers = auth_headers(client, "alpha")
    customer = create_customer(client, headers)
    conversation = create_conversation(client, headers, customer["id"])
    conversation_id = conversation["id"]

    expected = ["第一条", "第二条", "第三条"]
    sender_types = ["customer", "sales", "assistant"]
    for content, sender_type in zip(expected, sender_types, strict=True):
        response = client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=headers,
            json={"sender_type": sender_type, "content": content},
        )
        assert response.status_code == 201

    response = client.get(f"/api/v1/conversations/{conversation_id}/messages", headers=headers)
    assert response.status_code == 200
    assert [item["content"] for item in response.json()["data"]] == expected


def test_conversations_can_be_filtered_by_customer(client):
    register_tenant(client, "alpha")
    headers = auth_headers(client, "alpha")
    first = create_customer(client, headers, name="客户甲")
    second = create_customer(client, headers, name="客户乙")
    first_conversation = create_conversation(client, headers, first["id"])
    create_conversation(client, headers, second["id"])

    response = client.get(
        f"/api/v1/conversations?customer_id={first['id']}", headers=headers
    )
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert [item["id"] for item in items] == [first_conversation["id"]]


def test_tenant_cannot_filter_conversations_by_other_tenant_customer(client):
    alpha_headers, beta_headers, _ = setup_tenant_conversations(client)
    beta_customer = create_customer(client, beta_headers, name="企业B客户")
    response = client.get(
        f"/api/v1/conversations?customer_id={beta_customer['id']}",
        headers=alpha_headers,
    )
    assert response.status_code == 404
    assert response.json()["error_code"] == "CUSTOMER_NOT_FOUND"
