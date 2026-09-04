FROM node:26-bullseye
WORKDIR /usr/src/agent

# Install dependencies (including dev to allow ts-node)
COPY agent/package.json /usr/src/agent/package.json
COPY agent/package-lock.json* /usr/src/agent/ || true
RUN npm install --no-audit --no-fund

# Install Playwright browsers
RUN npx playwright install --with-deps || true

# Copy source
COPY agent/src /usr/src/agent/src
COPY agent/tsconfig.json /usr/src/agent/tsconfig.json
COPY agent/README.md /usr/src/agent/README.md

ENV TEST_API_URL=http://api:8000

CMD ["npx", "ts-node", "src/index.ts"]
