from app.main import app
from fastapi.testclient import TestClient

def test_excpected_health_return_status():
    client = TestClient(app)

    response = client.get("/health")

    print(response)
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": "0.1.0",
    }
    