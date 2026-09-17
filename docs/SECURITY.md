# Security and operating boundaries

## Controls

- Google OAuth state protects the sign-in callback. Only verified Google email identities become users.
- MongoDB-backed sessions keep identity server-side; cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Mutations require a session-bound CSRF token. Supplied Origin headers must match the configured origin.
- Every file read and write authorizes against its current owner/share relationship. IDs are not authorization tokens.
- Users cannot set ownership, lifecycle state, storage identifiers, or quota counters through request bodies.
- Zod validates requests. JSON payloads, filenames, query lengths, upload sizes, and file counts are bounded.
- Per-IP rate limiting covers the API, sign-in initiation, and upload requests. It is process-local and intended for a single instance.
- Files stream with backpressure. Local paths use server-generated IDs under a private directory, which is never exposed as static content.
- Content is downloaded as an attachment with `nosniff`. Client-provided MIME values are metadata hints only.
- Helmet supplies security headers and a same-origin content security policy. The UI does not render uploaded file contents.
- Error responses omit stack traces and storage paths. Request IDs allow correlation with server logs.
- Production images run as a non-root user. Secrets, test fixtures, Beads state, and uploads are excluded from the Docker build context.

## Limits

Files are not scanned for malware. Downloaded files should be handled as untrusted content. There are no public anonymous links, content previews, inline HTML rendering, or executable document integrations.

Revocation blocks future requests. It cannot erase a downloaded copy or stop a response already authorized and streaming. Permanent deletion has no undo; the UI explicitly confirms this behavior.

Free hosting and database plans are capacity-limited and do not imply backup or availability guarantees. The application does not implement encryption with per-user keys, file version history, resumable transfers, or a durable external job queue.

The session expiry is seven days. The app does not currently offer account deletion, an administrative console, or sign-out from every device. These are separate features that should be designed before opening the service to a broad audience.

## Secrets and reporting

Keep credentials in local ignored `.env` files or provider-managed environment settings. Use a database user scoped to this application's database, rotate exposed secrets, and review dependencies regularly.

Report suspected issues privately to the repository owner with reproduction steps. Avoid including real file content, session cookies, Google secrets, or database credentials in issues or logs.
