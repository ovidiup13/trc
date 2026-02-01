# Local storage provider

## Overview

The local provider stores artifacts on disk using a root directory. Each artifact is stored under `rootDir/<teamId>/<slug>/` as a file named after its hash, with metadata stored in a neighboring `<hash>.json` file. Missing scope values fall back to `_`.

## Configuration

```yaml
storage:
  provider: local
  local:
    rootDir: /tmp/cache/turbo
```

Environment variables:

- `STORAGE_LOCAL_ROOT_DIR` overrides `storage.local.rootDir`.

## Examples

Full config example (trc.yaml):

```yaml
server:
  host: 0.0.0.0
  port: 3000
logging:
  level: info
auth:
  type: jwt
  jwt:
    secret: super-secret
storage:
  provider: local
  local:
    rootDir: /tmp/cache/turbo
```

Full config example (trc.json):

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000
  },
  "logging": {
    "level": "info"
  },
  "auth": {
    "type": "jwt",
    "jwt": {
      "secret": "super-secret"
    }
  },
  "storage": {
    "provider": "local",
    "local": {
      "rootDir": "/tmp/cache/turbo"
    }
  }
}
```

Required fields:

- `rootDir`: directory where artifact files and metadata will be written.

## Setup

1. Create the root directory or ensure the process can create it.
2. Point `TRC_CONFIG` to a config file that sets `storage.provider: local`.
3. Start the server: `npx trc -c /path/to/trc.yaml`.

## Local testing

Basic sanity check:

1. Run `bun run --filter @trc/server test`.
2. Run the e2e test: `bun run --filter @trc/e2e test:docker`.

Notes:

- The e2e test writes artifacts under `.e2e-artifacts/` and cleans up on success.
