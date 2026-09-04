PY ?= python3
PIP ?= pip

.PHONY: help install-api run-api install-agent run-agent run-agent-playwright test

help:
	@echo "Makefile targets:"
	@echo "  install-api           Install Python deps for API"
	@echo "  run-api               Start the FastAPI mock TMS (uvicorn)"
	@echo "  install-agent         Install Node deps for the agent"
	@echo "  run-agent             Run the TypeScript agent (requires node & npx)"
	@echo "  run-agent-playwright  Run agent after installing Playwright browsers"
	@echo "  test                  Run pytest tests"

install-api:
	${PIP} install -r requirements.txt

run-api:
	uvicorn app.main:app --reload

install-agent:
	cd agent && npm install

run-agent:
	cd agent && npx ts-node src/index.ts

run-agent-playwright:
	cd agent && npm install && npx playwright install --with-deps && npx ts-node src/index.ts

test:
	${PY} -m pytest -q
