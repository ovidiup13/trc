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
- `logging.pretty` (boolean, optional, default: `true` when not `CI=true` and not `NODE_ENV=production`)
- `logging.file` (string, optional)
  - If set, logs are also written to this file path.

### `auth`

- `auth.type` (string, required)
  - Allowed values: `jwt`, `shared-secret`
- `auth.jwt.secret` (string, required when `auth.type` is `jwt`)
- `auth.sharedSecret.secret` (string, required when `auth.type` is `shared-secret`)

See [docs/authentication.md](./authentication.md) for details and examples.

### `storage`

- `storage.provider` (string, required)
  - Allowed values: `local`, `s3`

Provider-specific configuration lives in the storage docs:

- Local filesystem: [docs/storage/local.md](./storage/local.md)
- S3-compatible: [docs/storage/s3.md](./storage/s3.md)

## Environment variables

### Env interpolation in config files

Any string value in `trc.yaml` or `trc.json` can reference an environment variable using `$NAME`.
Interpolation happens before schema validation and env overrides.

Example:

```yaml
auth:
  type: jwt
  jwt:
    secret: $TRC_AUTH_JWT_SECRET
```

If an interpolated env var is missing, config parsing fails with a clear error.

### TRC overrides

These override the corresponding config fields:

- `TRC_SERVER_HOST` -> `server.host`
- `TRC_SERVER_PORT` -> `server.port`
- `TRC_LOGGING_LEVEL` -> `logging.level`
- `TRC_LOGGING_PRETTY` -> `logging.pretty`
- `TRC_LOGGING_FILE` -> `logging.file`
- `TRC_AUTH_TYPE` -> `auth.type`
- `TRC_AUTH_JWT_SECRET` -> `auth.jwt.secret`
- `TRC_AUTH_SHARED_SECRET` -> `auth.sharedSecret.secret`
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

Storage config fields follow the same `$NAME` interpolation rules described above.
