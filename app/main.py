from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import uuid
import json
import os
from typing import Optional
from .jira import MockJira

DATA_BIN = "data/tests.bin"
DATA_JSON = "data/tests.json"
os.makedirs("data", exist_ok=True)

def _load_store():
    # Prefer binary file; fall back to json and migrate if present
    if os.path.exists(DATA_BIN):
        try:
            with open(DATA_BIN, "rb") as f:
                data = f.read()
                if not data:
                    return {}
                return json.loads(data.decode("utf-8"))
        except Exception:
            return {}
    if os.path.exists(DATA_JSON):
        try:
            with open(DATA_JSON, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

tests_store = _load_store()

def _save_store():
    # write JSON as binary bytes
    with open(DATA_BIN, "wb") as f:
        f.write(json.dumps(tests_store, indent=2).encode("utf-8"))

app = FastAPI(title="Mock Test Management API")

class TestItem(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    status: str = "draft"

jira = MockJira()

@app.get("/tests")
def list_tests():
    return list(tests_store.values())

@app.post("/tests", status_code=201)
def create_test(item: TestItem):
    tid = str(uuid.uuid4())
    data = item.dict()
    data["id"] = tid
    tests_store[tid] = data
    _save_store()
    return data

@app.get("/tests/{test_id}")
def get_test(test_id: str):
    if test_id not in tests_store:
        raise HTTPException(status_code=404, detail="Test not found")
    return tests_store[test_id]

@app.put("/tests/{test_id}")
async def update_test(test_id: str, request: Request):
    payload = await request.json()
    # If the test does not exist, create a new record (upsert).
    if test_id not in tests_store:
        data = payload.copy() if isinstance(payload, dict) else {}
        data["id"] = test_id
        tests_store[test_id] = data
    else:
        # Merge payload into existing test record
        tests_store[test_id].update(payload)
        tests_store[test_id]["id"] = test_id
    _save_store()
    return tests_store[test_id]

@app.delete("/tests/{test_id}", status_code=204)
def delete_test(test_id: str):
    if test_id not in tests_store:
        raise HTTPException(status_code=404, detail="Test not found")
    del tests_store[test_id]
    _save_store()
    return

@app.post("/tests/{test_id}/link-to-jira")
def link_to_jira(test_id: str, summary: Optional[str] = None):
    if test_id not in tests_store:
        raise HTTPException(status_code=404, detail="Test not found")
    issue = jira.create_issue(summary or tests_store[test_id]["title"], description=tests_store[test_id].get("description", ""), linked_test_id=test_id)
    tests_store[test_id]["jira_issue"] = issue
    _save_store()
    return issue

@app.get("/jira/issues")
def list_issues():
    return jira.list_issues()
