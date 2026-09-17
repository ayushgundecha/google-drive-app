# HTTP API

All application endpoints are same-origin and session authenticated. File IDs and recipient IDs are 24-character MongoDB ObjectId strings. There is no bearer token interface.

## Requests and errors

Before mutations, request `GET /api/csrf` and send its `token` as `X-CSRF-Token`, together with the session cookie. JSON bodies use `Content-Type: application/json`. Uploads use `multipart/form-data` with exactly one `file` field.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "fields": { "name": ["Enter a filename."] }
  }
}
```

Errors use 400 for malformed input, 401 for unauthenticated access, 403 for invalid CSRF, 404 for absent/inaccessible resources, 409 for quota exhaustion, 413 for oversized content, 429 for rate limiting, and 500 for unexpected failures. Responses include `X-Request-Id` for log correlation. API/auth responses are not cached.

## Authentication and account

| Method | Path                    | Result                                    |
| ------ | ----------------------- | ----------------------------------------- |
| GET    | `/auth/google`          | Redirect to Google                        |
| GET    | `/auth/google/callback` | Validate OAuth and redirect to `/drive`   |
| POST   | `/auth/logout`          | Destroy session; 204                      |
| GET    | `/api/csrf`             | `{ "token": "…" }`                        |
| GET    | `/api/me`               | Identity, usage, quota, maximum file size |

`/api/me` returns `id`, `name`, `email`, optional `avatar`, `usedBytes`, `quotaBytes`, and `maxFileBytes`. Usage includes active reservations.

## File operations

| Method | Path                      | Input / result                                          |
| ------ | ------------------------- | ------------------------------------------------------- |
| GET    | `/api/files`              | `scope=owned\|shared`, `q`, `page`; paginated metadata  |
| POST   | `/api/files`              | One multipart `file`; 201 file metadata                 |
| GET    | `/api/files/:id`          | Owner/viewer metadata                                   |
| GET    | `/api/files/:id/download` | Owner/viewer attachment stream                          |
| PATCH  | `/api/files/:id`          | Owner only; `{ "name": "Notes.txt" }`; updated metadata |
| DELETE | `/api/files/:id`          | Owner only; permanent deletion; 204                     |

Filename validation: trimmed, 1–180 characters, no slashes, backslashes, control characters, or `.`/`..` names. Identical names are permitted. Rename accepts no additional body properties.

Search is literal, case-insensitive, and limited to 100 characters. Pages start at 1; page size is fixed at 25. Pagination is offset based; concurrent uploads/deletes may shift page boundaries.

```json
{
  "files": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Notes.txt",
      "originalName": "Notes.txt",
      "size": 240,
      "mimeType": "text/plain",
      "createdAt": "2026-01-01T12:00:00.000Z",
      "updatedAt": "2026-01-01T12:00:00.000Z",
      "ownerId": "507f191e810c19729de860ea",
      "ownerName": "Alex",
      "isOwner": true
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25
}
```

## Sharing

All share-management routes are owner-only. Email input is trimmed and lowercased, and the recipient must already have signed in. No email is sent.

| Method | Path                                 | Input / result                                             |
| ------ | ------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/files/:id/shares`              | Array of recipient ID, name, email, created time           |
| POST   | `/api/files/:id/shares`              | `{ "email": "person@example.com" }`; idempotent grant; 204 |
| DELETE | `/api/files/:id/shares/:recipientId` | Idempotent revocation; 204                                 |

Self-sharing returns 400. Unknown recipients return 404. Viewers cannot enumerate a file's other recipients. Shared files appear under `scope=shared`; they do not consume the recipient's quota.

## Health

`GET /healthz` checks the process. `GET /readyz` pings MongoDB. Neither requires authentication. Render should use `/readyz` as its health-check endpoint.
