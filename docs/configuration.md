# Configuration

TRC accepts configuration in YAML or JSON, validates it with a schema, applies defaults, and then merges environment variable overrides.

## File formats and locations

Supported file formats:

- `.yaml`
- `.yml`
- `.json`

Config sources (highest precedence first):

1. `TRC_CONFIG` (raw YAML/JSON string)
2. `TRC_CONFIG_PATH` (file path)
3. CLI `--config` option
4. Default path: `./trc.yaml`

If `TRC_CONFIG` is set, it always wins. If `TRC_CONFIG_PATH` is set, it wins over `--config`.

## Override behavior

After the config is loaded, TRC applies environment variable overrides:

- TRC-specific settings are prefixed with `TRC_`.
- Storage provider settings do not use the `TRC_` prefix.

Overrides only apply when the environment variable is present.

## Schema reference

All fields are required unless marked optional. Defaults are listed explicitly.

### `server`

- `server.host` (string, optional, default: `0.0.0.0`)
- `server.port` (number, optional, default: `3000`)

### `logging`

- `logging.level` (string, optional, default: `info`)
  - Allowed values: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`

### `auth`

- `auth.jwt.secret` (string, required)

### `storage`

- `storage.provider` (string, required)
  - Allowed values: `local`, `s3`

Provider-specific configuration lives in the storage docs:

- Local filesystem: [docs/storage/local.md](./storage/local.md)
- S3-compatible: [docs/storage/s3.md](./storage/s3.md)

## Environment variables

### TRC overrides

These override the corresponding config fields:

- `TRC_SERVER_HOST` -> `server.host`
- `TRC_SERVER_PORT` -> `server.port`
- `TRC_LOGGING_LEVEL` -> `logging.level`
- `TRC_AUTH_JWT_SECRET` -> `auth.jwt.secret`
- `TRC_STORAGE_PROVIDER` -> `storage.provider`

### Storage overrides

Storage-specific env vars and examples are documented with each provider:

- Local filesystem: [docs/storage/local.md](./storage/local.md)
- S3-compatible: [docs/storage/s3.md](./storage/s3.md)

If you set storage provider env vars without setting `TRC_STORAGE_PROVIDER`, TRC will infer the provider when it is unambiguous:

- Only local vars set -> provider becomes `local`.
- Only s3 vars set -> provider becomes `s3`.
- Both local and s3 vars set -> error unless `TRC_STORAGE_PROVIDER` is set.

### Storage env interpolation in config files

Interpolation rules and examples live in the provider docs:

- Local filesystem: [docs/storage/local.md](./storage/local.md)
- S3-compatible: [docs/storage/s3.md](./storage/s3.md)
