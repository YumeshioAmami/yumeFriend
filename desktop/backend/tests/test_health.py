from fastapi.testclient import TestClient

from yumefriend.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version() -> None:
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    assert response.json()["protocol"] == 1
