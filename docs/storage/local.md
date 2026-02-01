# Local storage provider

## Overview

The local provider stores artifacts on disk using a root directory. Each artifact is stored as a file named after its hash, with metadata stored in a neighboring `<hash>.json` file.

## Configuration

```yaml
storage:
  provider: local
  local:
    rootDir: /tmp/cache/turbo
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
