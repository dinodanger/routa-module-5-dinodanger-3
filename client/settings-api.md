# The platform's admin settings API

Base: `http://localhost:4686`. Every call takes `Authorization: Bearer <token>`.

## GET /admin/v1/settings

```json
{
  "access": [{ "group": "ext-contractors", "apps": ["crm", "timesheets"] }],
  "policies": [{ "id": "session-length-hours", "label": "Session length in hours", "value": 24 }]
}
```

## PATCH /admin/v1/settings

Applies every change, or none if one is wrong. It doesn't preview: it applies at once.

```json
{
  "changes": [
    { "type": "access", "group": "ext-contractors", "app": "crm", "allowed": false },
    { "type": "policy", "id": "session-length-hours", "value": 8 }
  ]
}
```

It answers `{"applied": 2, "settings": { ... }}`, or a 400 with `{"status", "detail"}` for an unknown group, application or policy, or a value of the wrong type.

## GET /admin/v1/whoami

Says what scope the token has: `{"scope": "read"}` or `{"scope": "admin"}`.

## Scope

**This API checks that a token is valid, not what it may do.** Any valid token can PATCH, including a read-only one. Whatever sits in front of the API must call `whoami` and refuse. That is why the brief asks the server to check.

## The settings page

`http://localhost:4686/admin/settings` shows the same settings and takes no token. It plays the console IT is signed in to today.
