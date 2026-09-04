# Nextech Agentic AI Take-Home Assessment
# nextech-ai-homework

Repository demonstrating a mock Test Management System (FastAPI) and a TypeScript test-execution agent (Playwright + LLM decision flow). Designed as a take-home assessment reference for Agentic AI in Test Automation.

## Quick summary

- `app/` — FastAPI mock Test Management System (TMS) and a fake Jira connector.
- `agent/` — TypeScript agent that fetches tests, chooses execution strategy, runs tests (Playwright or simulated), and publishes results.
- `data/` — test fixtures (`tests.json`) and runtime store (`tests.bin`).
- `tests/` — pytest tests and fixtures used to validate the API.

## Quick start

Prerequisites: Python 3.10+, Node 26 (recommended via nvm), `npm`.

Install and run the API:

```bash
make install-api
make run-api
```

Run the agent (with Playwright browsers):

```bash
make run-agent-playwright
```

Or run the agent manually from `agent/`:

```bash
cd agent
npm install
npx playwright install --with-deps
npx ts-node src/index.ts
```

Important: start the TMS before running the agent. The TMS default in this repo is `http://localhost:8000`, but for demos you may run it on another port (example below). If you run the TMS on a non-default port, set `TEST_API_URL` when starting the agent:

```bash
# start the TMS on port 8001
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload

# then start the agent pointing at that URL
cd agent
TEST_API_URL=http://127.0.0.1:8001 npx ts-node src/index.ts
```

## Project structure

- `app/` — FastAPI mock Test Management System (TMS) and Jira stub
	- `app/main.py`: the FastAPI application that implements the mock TMS. Key routes used by the agent:
		- `GET /tests` — list available tests
		- `POST /tests` — create a new test definition
		- `GET /tests/{id}` — retrieve a single test
		- `PUT /tests/{id}` — update a test (used by the agent to publish execution results)
		- `POST /tests/{id}/link-to-jira` — create a linked Jira issue for a test (uses the mock connector)
	- `app/jira.py`: `MockJira` connector that emulates creating/listing Jira issues for demo purposes.
	- Persistence: the TMS loads seeded tests from `data/tests.json` and persists runtime state to `data/tests.bin`.

- `agent/` — TypeScript agent that orchestrates fetching tests from the TMS, deciding execution strategy, running tests (Playwright or simulated), and publishing results. Source files are under `agent/src/` (e.g., `index.ts`, `playwrightRunner.ts`, `changeDetector.ts`, `resultQueue.ts`).
- `data/` — source test definitions (`tests.json`) and the runtime persisted store (`tests.bin`).
- `tests/` — pytest-based API tests and fixture JSON files used for local validation (e.g., `tests/fixtures/test_case.json`).
- `docs/` — diagrams and other documentation (e.g., `docs/architecture.mmd`).
- `Makefile` — convenience targets such as `run-api`, `run-agent-playwright`, and `test`.

## Agent overview

The agent implements this flow:

1. Fetch tests from the TMS (`GET /tests`).
2. If a test object contains an inline `steps` array, run it directly with Playwright (`agent/src/playwrightRunner.ts`).
3. If no inline steps, call `decideExecutionStrategy()` (LLM placeholder with heuristic fallback) to choose an executor.
4. Execute using a simulated runner (`executor.ts`) or Playwright, and `PUT /tests/{id}` with the result.

Key environment variables (agent):
- `TEST_API_URL` — API base URL (default `http://localhost:8000`).
- `SIMULATE_TMS_OFFLINE` — if `1`, the agent simulates the TMS being down and enqueues results instead of publishing.
- `SIMULATE_TMS_OFFLINE_TIMEOUT` — optional seconds to expire the simulation automatically.
- `RUN_FIXTURE` — path to a local fixture JSON to run once and publish the result.
- `REPO_URL` / `REPO_PATH`, `BASE_REF` / `HEAD_REF` — for change detection and selective test runs.

Additional useful environment variables:
- `VERBOSE_AGENT=1` — print verbose strategy/decision logs useful when debugging heuristics or LLM prompts.
- `RUN_MODE=sample|all` — `sample` runs a sampled subset per strategy (useful for quick demos), `all` runs everything.
- `SAMPLE_SIZE` — when `RUN_MODE=sample`, the number of tests to pick per strategy.
- `QUEUE_MAX_ATTEMPTS` — maximum delivery attempts before moving an item to the dead-letter queue (default shown in code).
- `DEAD_LETTER_WEBHOOK` — optional webhook URL to notify when items are moved to the dead-letter file.

## Playwright runner

- The Playwright runner supports `goto`, `eval`, and `screenshot` step actions inside fixtures. Example fixture: `tests/fixtures/test_case.json`.
- To run a fixture directly:

```bash
cd agent
npx ts-node src/playwrightRunner.ts ../tests/fixtures/test_case.json
```

Note about Playwright native dependencies: some hosts (especially minimal Debian/Ubuntu images) may be missing shared libraries like `libnspr4`/`libnss3` that Chromium needs. For local demos use `SKIP_PLAYWRIGHT=1` to simulate runs quickly, or run the agent inside a container that already includes Playwright deps. Example (Docker):

```bash
# from repo root -- runs agent in Node container with host networking
docker run --rm --network=host -v "$PWD":/work -w /work/agent node:22-bullseye bash -lc "npm install && npx playwright install --with-deps && TEST_API_URL=http://127.0.0.1:8001 npx ts-node src/index.ts"
```

## Offline handling and retries

- When the TMS is unavailable, the agent enqueues results into `agent/offline_queue.json` via `agent/src/resultQueue.ts`.
- A background flusher periodically retries delivery; there is also a manual CLI: `npm run flush` (from `agent/`) which calls `src/flush.ts`.

Manual flush example:

```bash
cd agent
# Attempt to deliver queued results to the TEST_API_URL (default http://localhost:8000)
npm run flush
# or run directly
npx ts-node src/flush.ts
```

If you ran the TMS on a custom port, include `TEST_API_URL` in the flush command. Example:

```bash
cd agent
TEST_API_URL=http://127.0.0.1:8001 npm run flush
# or
TEST_API_URL=http://127.0.0.1:8001 npx ts-node src/flush.ts
```

Behavior notes: items that exceed `QUEUE_MAX_ATTEMPTS` are moved to `agent/offline_queue_deadletter.json`. Inspect that file for failed items and (optionally) use `DEAD_LETTER_WEBHOOK` to receive notifications when this happens.

## Development notes

- Node: use Node 26 for best compatibility with Playwright in this repo.
- To install Playwright browsers: `npx playwright install --with-deps`.
- Python deps are listed in `requirements.txt`.

## Troubleshooting

- If the API fails to start (port in use), stop the conflicting process or run the API on another port and point the agent with `TEST_API_URL`.
- If the agent enqueues results, inspect `agent/offline_queue.json` and run `cd agent && npm run flush` after bringing the API back up.

## Next steps (optional)

- Add CI workflow for running tests and linting.
- Persist per-item retry counts and drop policy for the offline queue.
- Add more robust LLM integration (Copilot SDK) behind a feature flag.

## Assumptions & Tradeoffs

- **Assumptions:**
	- This repository is a demo/stub Test Management System intended for local development and demos, not a hardened production service.
	- Contributors will run the agent in simulated mode (`SKIP_PLAYWRIGHT=1`) for quick iteration, or in a container that provides Playwright browser dependencies.
	- Test identifiers are expected to be stable between the TMS and agent; the agent updates tests via `PUT /tests/{id}`.

- **Tradeoffs:**
	- Simulation vs. real browsers: `SKIP_PLAYWRIGHT` makes demos fast and low-friction but may hide browser-specific failures that only appear in full Playwright runs.
	- PUT upsert behavior (agent can create/update tests) is forgiving for demos but may mask contract mismatches that a stricter API would catch.
	- Native Playwright dependencies complicate local setup; the repo favors simulation and documents Docker/container alternatives to avoid altering host packages.
	- LLM integration is a placeholder to keep the repo runnable without credentials; integrating a real SDK requires secret management and additional error handling.

- **Operational notes:**
	- The offline queue persists results to `agent/offline_queue.json` and retries delivery; items exceeding `QUEUE_MAX_ATTEMPTS` are moved to `agent/offline_queue_deadletter.json` for manual inspection.
	- Logs are console-based for simplicity; consider structured logging and metrics if this becomes a long-running service.

## Additional docs

- Agent specifics: see `agent/README.md` for detailed examples and advanced usage.
- API tests: see `tests/` for pytest-based API tests.
