import os
from fastapi.testclient import TestClient
from app.main import app

# ensure clean data file for tests
for fn in ("data/tests.bin", "data/tests.json"):
    try:
        if os.path.exists(fn):
            os.remove(fn)
    except Exception:
        pass

client = TestClient(app)


def test_create_and_list_and_link():
    # ensure clean state
    r = client.get("/tests")
    assert r.status_code == 200
    # create
    resp = client.post("/tests", json={"title": "Sample Test", "description": "desc"})
    assert resp.status_code == 201
    t = resp.json()
    assert t["title"] == "Sample Test"

    # list
    r2 = client.get("/tests")
    assert r2.status_code == 200
    items = r2.json()
    assert any(it["id"] == t["id"] for it in items)

    # link to jira
    r3 = client.post(f"/tests/{t['id']}/link-to-jira")
    assert r3.status_code == 200
    issue = r3.json()
    assert "id" in issue and issue["linked_test_id"] == t["id"]
