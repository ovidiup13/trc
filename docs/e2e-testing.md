# E2E Testing

This repo includes a Docker-based end-to-end (E2E) test that validates TRC against a real Turborepo example. The test spins up a TRC server container, runs a monorepo (currently `examples/basic`) inside a runner container, and compares artifacts between the remote cache storage and the runner's local `.turbo` cache.

## Strategy

- Build a TRC server image that compiles the server binary in a builder stage and runs it in a minimal runtime image.
- Start the server via Docker Compose and wait for readiness.
- Copy the example monorepo into a temporary workspace, patch its `turbo.json` to point at the running TRC server, and run `lint`, `test` (if defined), and `build` inside a runner container.
- Assert that hashes produced in the runner cache exist in the server storage directory.
- Preserve logs and artifacts on failure to make debugging in CI easier.

Artifacts and logs are written under `.e2e-artifacts/`:

- `server-storage/` (remote cache storage)
- `runner-cache/` (local `.turbo` cache)
- `docker-compose.log` (Docker build/run logs)

## Run locally

Requirements:

- Docker
- Bun

Run the Docker E2E test:

```sh
bun run --filter @trc/e2e test:docker
```

For more verbose output and a Vitest log file:

```sh
bun run --filter @trc/e2e test:docker -- --reporter=verbose --silent=false --outputFile=.e2e-artifacts/vitest.log
```

If the test fails, the run directory is preserved and its path is printed in the test output. The Docker compose log tail is also printed in the terminal to aid debugging.
