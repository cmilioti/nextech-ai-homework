# Test Execution Agent (LangGraph + Copilot SDK)

This folder contains a minimal TypeScript agent scaffold that demonstrates the required workflow from the assessment:

- Retrieve test cases from a test management API
- Decide execution strategy (uses a small LLM wrapper; Copilot SDK placeholder)
- Execute tests (simulated executors)
- Publish results back to the test management API

Notes:
- The agent is intentionally lightweight and uses heuristic fallbacks so it can run without the Copilot SDK.
- To run against the mock Python API in this repo:

```bash
# from repo root
cd agent
npm install
# start the Python API in another terminal:
uvicorn app.main:app --reload
# then run the agent
npx ts-node src/index.ts
```

Configuration (env vars):
- `TEST_API_URL` — base URL for the test management API (default http://localhost:8000)
- `COPILOT_API_KEY` — optional Copilot SDK API key (if set, the code will attempt to call the SDK)

Playwright runner
-----------------
This repo includes a small Playwright fixture runner at `agent/src/playwrightRunner.ts`.

Install the Playwright browsers and run a fixture locally:

```bash
# from agent/
npm install
npx playwright install --with-deps
npx ts-node src/playwrightRunner.ts ../tests/fixtures/test_case.json
```

The runner will execute the steps in the fixture, save screenshots to the path specified in the fixture (`artifacts/...`), and print a PASS/FAIL result.

Run a single fixture and publish result to the API
-------------------------------------------------
You can run a single local fixture and have the agent publish the result back to the API by setting `RUN_FIXTURE` before running the agent. Example:

```bash
# run single fixture and publish
RUN_FIXTURE=../tests/fixtures/test_case.json npx ts-node src/index.ts
```

When running in Docker, mount the repo into the container so the agent can access fixtures and produce artifacts:

```bash
docker run --rm -v "$PWD":/work -w /work/agent -e RUN_FIXTURE=/work/tests/fixtures/test_case.json -e TEST_API_URL=http://host.docker.internal:8000 node:26-bullseye npx ts-node src/index.ts
```

Detect changes in another repo and run affected tests
---------------------------------------------------
You can point the agent at another repository (local path or Git URL). The agent will detect changed files between `BASE_REF` (default `origin/main`) and `HEAD_REF` (default `HEAD`), infer test types from paths, select tests from the test management API that match those types, and run them.

Environment variables:
- `REPO_URL` — git URL to clone and detect changes from (optional)
- `REPO_PATH` — local path to a git repo to inspect (optional)
- `BASE_REF` — base ref for diff (default `origin/main`)
- `HEAD_REF` — head ref for diff (default `HEAD`)

Example (local repo):

```bash
# run agent and detect changes in a local repo
REPO_PATH=../some-other-repo BASE_REF=origin/main HEAD_REF=HEAD npx ts-node src/index.ts
```

Example (remote repo):

```bash
REPO_URL=https://github.com/yourorg/yourrepo.git BASE_REF=origin/main HEAD_REF=feature-branch npx ts-node src/index.ts
```

The mapping between changed file paths and test types is heuristic-based (e.g., paths containing `perf` map to `performance` tests). You can refine the `changeDetector.ts` logic to suit your repo conventions.



