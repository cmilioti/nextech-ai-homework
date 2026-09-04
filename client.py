import os
import sys
import argparse
import json
import httpx

BASE_URL = os.environ.get("TEST_API_URL", "http://localhost:8000")

def pretty(v):
    print(json.dumps(v, indent=2))

def list_tests():
    with httpx.Client(base_url=BASE_URL) as c:
        r = c.get("/tests")
        r.raise_for_status()
        pretty(r.json())

def get_test(test_id):
    with httpx.Client(base_url=BASE_URL) as c:
        r = c.get(f"/tests/{test_id}")
        if r.status_code == 404:
            print("Not found", file=sys.stderr)
            sys.exit(2)
        r.raise_for_status()
        pretty(r.json())

def create_test(title, description=None, status="draft", typeOfTest=None):
    payload = {"title": title, "description": description or "", "status": status}
    if typeOfTest:
        payload["typeOfTest"] = typeOfTest
    with httpx.Client(base_url=BASE_URL) as c:
        r = c.post("/tests", json=payload)
        r.raise_for_status()
        pretty(r.json())

def link_to_jira(test_id, summary=None):
    params = {}
    if summary:
        params['summary'] = summary
    with httpx.Client(base_url=BASE_URL) as c:
        r = c.post(f"/tests/{test_id}/link-to-jira", params=params)
        if r.status_code == 404:
            print("Test not found", file=sys.stderr)
            sys.exit(2)
        r.raise_for_status()
        pretty(r.json())

def list_issues():
    with httpx.Client(base_url=BASE_URL) as c:
        r = c.get("/jira/issues")
        r.raise_for_status()
        pretty(r.json())

def main():
    p = argparse.ArgumentParser(description="Simple client for Mock Test Management API")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("list")

    g = sub.add_parser("get")
    g.add_argument("id")

    c = sub.add_parser("create")
    c.add_argument("title")
    c.add_argument("--description", "-d", default="")
    c.add_argument("--status", default="draft")
    c.add_argument("--type", dest="typeOfTest")

    l = sub.add_parser("link")
    l.add_argument("id")
    l.add_argument("--summary")

    sub.add_parser("issues")

    args = p.parse_args()
    if args.cmd == "list":
        list_tests()
    elif args.cmd == "get":
        get_test(args.id)
    elif args.cmd == "create":
        create_test(args.title, args.description, args.status, getattr(args, "typeOfTest", None))
    elif args.cmd == "link":
        link_to_jira(args.id, getattr(args, "summary", None))
    elif args.cmd == "issues":
        list_issues()
    else:
        p.print_help()

if __name__ == "__main__":
    main()
