from typing import Dict, List
import uuid

class MockJira:
    def __init__(self):
        self.issues = {}

    def create_issue(self, summary: str, description: str = "", linked_test_id: str = None) -> Dict:
        iid = "JIRA-" + str(uuid.uuid4())[:8]
        issue = {"id": iid, "summary": summary, "description": description, "linked_test_id": linked_test_id}
        self.issues[iid] = issue
        return issue

    def get_issue(self, iid: str) -> Dict:
        return self.issues.get(iid)

    def list_issues(self) -> List[Dict]:
        return list(self.issues.values())
