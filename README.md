# TRC (Turborepo Remote Cache)

> ⚠️ This project is under active development. Use at your own risk. Breaking changes may occur. Do not use in production.

TRC is a simple, lightweight, self-hosted [Turborepo Remote Cache](https://turborepo.dev/docs/core-concepts/remote-caching) implementation.

It supports the following storage providers out of the box:

- [x] Local filesystem
- [ ] In-memory (for testing purposes)
- [x] S3-compatible object storage
- [ ] Artifactory / JFrog
- more to come...

This project is heavily inspired by [turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache) with additional features:

- [x] Support for npx / bunx usage to quickly start a cache server
- [x] Config driven via trc.yaml or environment variables
- [ ] Single binary deployment
- [ ] Support for multiple storage backends (local filesystem, S3, etc.) via a plugin system

It implements the [Turborepo Remote Cache OpenAPI specification](https://turborepo.dev/docs/openapi).

## Quickstart

Install deps:

```sh
bun install
```

Run the build:

```sh
bun build
```

Start the server:

```sh
npx trc -c apps/server/trc.example.yaml
```

This starts a TRC server at `http://localhost:3000` using the example config file located at `apps/server/trc.example.yaml`.

## Storage providers

Local filesystem:

```yaml
storage:
  provider: local
  local:
    rootDir: /tmp/cache/turbo
```

S3-compatible storage:

```yaml
storage:
  provider: s3
  s3:
    endpoint: http://localhost:9000
    region: us-east-1
    bucket: trc-cache
    accessKeyId: your-access-key
    secretAccessKey: your-secret-key
    forcePathStyle: true
```

## CLI

Options:

- `--config <path>`: Provide the config path either via an option or via `TRC_CONFIG_PATH` environment variable.
- `--print-config`: Print the resolved config with defaults applied.
- `--check-config`: Validate the config and exit.
- `--version`: Print the CLI version.

Environment variables:

- `TRC_CONFIG_PATH`: Path to a config file (same as `--config`).
- `TRC_CONFIG`: Stringified YAML/JSON config (overrides `TRC_CONFIG_PATH`).
