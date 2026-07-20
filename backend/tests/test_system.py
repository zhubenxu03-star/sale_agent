def test_health_check_reports_database_connection(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "sales-agent-api",
        "database": "connected",
        "redis": "connected",
    }


def test_swagger_documentation_is_available(client):
    response = client.get("/docs")
    assert response.status_code == 200
    assert "Sales Agent API" in response.text
