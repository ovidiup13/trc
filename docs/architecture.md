# Architecture Overview

TRC is a lightweight, self-hosted Turborepo Remote Cache server. The current implementation focuses on the core API, JWT or shared-secret auth, local storage, config loading, and CLI orchestration.

## Server and API

The server uses Hono and implements the Turborepo Remote Cache API endpoints with a `/v8` compatibility prefix.

**Implemented endpoints**

- `GET /artifacts/status` and `GET /v8/artifacts/status` return `{ "status": "enabled" }`
- `HEAD /artifacts/:hash` returns artifact metadata headers
- `GET /artifacts/:hash` streams the artifact body
- `PUT /artifacts/:hash` stores an artifact stream plus metadata
- `POST /artifacts` batch query for metadata by hash
- `POST /artifacts/events` accepts cache hit/miss events (validated, no-op response)

**Hash validation**

- Hashes must be non-empty hex strings; invalid hashes return `400`.

**Error format**

```json
{
  "code": "bad_request",
  "message": "Missing Content-Length"
}
```

**Example: upload and fetch an artifact**

```sh
curl -X PUT "http://localhost:3000/artifacts/abc123" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Length: 5" \
  -H "x-artifact-duration: 120" \
  -H "x-artifact-tag: build" \
  --data-binary "hello"

curl -X GET "http://localhost:3000/artifacts/abc123" \
  -H "Authorization: Bearer <token>"
```

## Auth

All routes require a bearer token. The auth type is configured in `auth.type`:

- `jwt`: JWT bearer token signed with a shared secret (HS256).
- `shared-secret`: Bearer token must exactly match the configured shared secret.

In both cases:

- Header: `Authorization: Bearer <token>`
- Missing token -> `401` with `code: "unauthorized"`
- Invalid token -> `401` with `code: "unauthorized"`

JWT verification is implemented via `jose` and applied globally to the Hono app.

## Config

Config is YAML or JSON with schema validation (zod). It supports defaults, env overrides, and rich error reporting.

**Config sources and precedence**

1. `TRC_CONFIG` (raw YAML/JSON string)
2. `TRC_CONFIG_PATH` (file path)
3. CLI `--config` option
4. Default path: `./trc.yaml`

**Overrides**

- `TRC_*` overrides for TRC settings (server/logging/auth/storage provider).
- `STORAGE_*` overrides for storage provider settings.

**Schema highlights**

- `server.host` (default `0.0.0.0`)
- `server.port` (default `3000`)
- `logging.level` (enum `fatal|error|warn|info|debug|trace|silent`)
- `auth.type` (`jwt` or `shared-secret`)
- `auth.jwt.secret` (required when `auth.type` is `jwt`)
- `auth.sharedSecret.secret` (required when `auth.type` is `shared-secret`)
- `storage.provider` (`local` or `s3`)
- `storage.local.rootDir` (required)
- `storage.s3` fields for S3-compatible storage

**Example config**

```yaml
server:
  host: 0.0.0.0
  port: 3000
logging:
  level: info
auth:
  type: jwt
  jwt:
    secret: a-string-secret-at-least-256-bits-long
storage:
  provider: local
  local:
    rootDir: /tmp/cache/turbo
```

## Storage

A storage provider contract is defined in `@trc/storage-core`:

```ts
interface StorageProvider {
  head(hash): Promise<ArtifactMetadata | null>;
  get(hash): Promise<ArtifactInfo | null>;
  put(hash, options): Promise<void>;
  query(hashes): Promise<ArtifactQueryResult>;
}
```

**Local provider**

- Stores artifact data at `<rootDir>/<hash>`
- Stores metadata at `<rootDir>/<hash>.json`
- Writes are atomic using temporary files and renames
- Metadata fields: `size`, optional `durationMs`, optional `tag`

**Not yet implemented**

- `@trc/provider-s3` (placeholder)
- `@trc/provider-artifactory` (placeholder)

## CLI

The CLI (`trc`) is a thin wrapper that loads config and starts the server.

**Options**

- `-c, --config <path>`: config file path
- `--print-config`: print resolved config and exit
- `--check-config`: validate config and exit
- `-v, --version`: print CLI version

**Environment variables**

- `TRC_CONFIG`: raw config string
- `TRC_CONFIG_PATH`: config file path

**Example usage**

```sh
npx trc -c apps/server/trc.example.yaml
npx trc --print-config
npx trc --check-config
```

## Logging

The server uses Pino with a config-driven log level.

Each request logs:

- HTTP method
- path
- status code
- duration in milliseconds

## Runtimes

`startServer` supports multiple runtimes:

- Bun via `Bun.serve`
- Deno via `Deno.serve`
- Node.js via `@hono/node-server`

The function returns `{ hostname, port, url }` so callers can surface the resolved address.

## Tests

Testing is built around `vitest` with targeted unit, integration, and smoke tests.

**Coverage highlights**

- `packages/server`:
  - JWT and shared-secret auth middleware tests
  - logging level setup
  - storage provider wiring
  - full API integration flow
- `packages/config`:
  - YAML parsing with defaults
  - error reporting and config file loading
- `packages/cli`:
  - config resolution and env precedence
- `packages/provider-local`:
  - artifact write/read/query behavior
- `packages/e2e`:
  - Docker smoke test (skips if Docker unavailable)

**Example test command**

```sh
bun test
```
