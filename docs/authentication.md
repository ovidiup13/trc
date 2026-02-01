# Authentication

TRC uses bearer token authentication on every route. The authentication type is configured under `auth.type`.

## Shared secret (basic)

Use a single shared secret as the bearer token.

```yaml
auth:
  type: shared-secret
  sharedSecret:
    secret: super-secret-token
```

```json
{
  "auth": {
    "type": "shared-secret",
    "sharedSecret": {
      "secret": "super-secret-token"
    }
  }
}
```

Requests must include:

```
Authorization: Bearer super-secret-token
```

## JWT

Use a JWT bearer token signed with the shared secret (HS256).

```yaml
auth:
  type: jwt
  jwt:
    secret: a-string-secret-at-least-256-bits-long
```

```json
{
  "auth": {
    "type": "jwt",
    "jwt": {
      "secret": "a-string-secret-at-least-256-bits-long"
    }
  }
}
```

Requests must include a signed JWT:

```
Authorization: Bearer <jwt>
```
