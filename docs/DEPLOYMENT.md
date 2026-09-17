# Deployment on Render

## Before deploying

Use [the GitHub repository](https://github.com/ayushgundecha/google-drive-app), an Atlas cluster, and a Google Cloud project with an OAuth web client. Keep `.env` local. The Render environment is configured separately from your local machine.

The service uses one application origin. Render runs the Docker image and Atlas stores users, sessions, metadata, and GridFS content. No persistent Render disk is required when `STORAGE_BACKEND=gridfs`.

## 1. Configure MongoDB Atlas

1. Create a free cluster or select an existing cluster.
2. Create a dedicated database user with `readWrite` access to the application's `drive` database. Do not use an Atlas account password as the database password.
3. Copy the driver connection URI, URL-encoding special characters in its credentials.
4. Add your development IP to the Atlas IP access list for local use.
5. Once a Render service exists, find its outbound IP ranges in the dashboard and add those ranges to Atlas. Prefer those ranges over allowing every address.

Set `MONGODB_URI` and `MONGODB_DB=drive`. The app creates its indexes and initial quota ledger on startup. Atlas persists the data independently of Render deployments.

## 2. Configure Google OAuth

In Google Cloud's Google Auth Platform configuration:

1. Configure the app's name, support email, audience, and contact information.
2. Request only `profile` and `email` identity scopes.
3. Create an OAuth client of type **Web application**.
4. Register exact authorized redirect URIs for the environments you use:

```text
http://localhost:5173/auth/google/callback
http://localhost:3000/auth/google/callback
https://YOUR-SERVICE.onrender.com/auth/google/callback
```

If Google requests authorized JavaScript origins, add the corresponding origins without paths. This app initiates OAuth server-side; the redirect URI is the critical setting.

For an app in Google's testing mode, configure the intended users as test users where required by the current console settings. For access beyond that audience, review Google's publishing requirements in the console. Both users in a sharing test must be allowed to sign in.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never expose the client secret in a Vite variable or frontend code.

## 3. Create the Render service

Recommended: open **New → Blueprint**, connect `ayushgundecha/google-drive-app`, select branch `main`, and use `render.yaml`. Keep the Free plan. Enter the three prompted secrets: `MONGODB_URI`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Render generates `SESSION_SECRET`; all other required values are in the Blueprint.

The application automatically uses Render's `RENDER_EXTERNAL_URL` for its origin. You do not need to guess a hostname before the first deployment. After Render assigns the URL, add that exact URL plus `/auth/google/callback` to the Google web client's authorized redirect URIs. For a custom domain, set `APP_ORIGIN` explicitly to its HTTPS origin.

Alternatively, create **New → Web Service**, connect the same repository, choose branch `main`, leave Root Directory blank, and select the Docker runtime:

- Repository root: this monorepo's root.
- Dockerfile: `./Dockerfile`.
- Instance: Free.
- Health-check path: `/readyz`.
- No separate frontend deployment.

Configure:

```text
NODE_ENV=production
STORAGE_BACKEND=gridfs
MONGODB_DB=drive
MONGODB_URI=<Atlas connection URI>
GOOGLE_CLIENT_ID=<web client ID>
GOOGLE_CLIENT_SECRET=<web client secret>
SESSION_SECRET=<random value of at least 32 characters>
```

The Blueprint generates `SESSION_SECRET`. For a manually created Web Service, generate a new secret with `openssl rand -hex 32` and save it in Render. Leave `PORT` to Render; the app reads it and binds to `0.0.0.0`. Leave Docker Command blank to use the image's startup command. Register exactly the Google callback matching the service URL.

Do not bulk-import local development settings: `NODE_ENV=development`, `STORAGE_BACKEND=local`, or a localhost `APP_ORIGIN` would be wrong for Render. Local `.env` values are never committed or automatically transferred to Render.

Keep the default 10 MiB file / 50 MiB user / 300 MiB application limits unless you deliberately provision more capacity. The app's totals measure file bytes; Atlas also stores indexes, sessions, users, and metadata. Observe actual cluster storage and bandwidth in Atlas.

## 4. Verify the live service

1. Check `/healthz` and `/readyz` return 200.
2. Visit the root URL and complete Google sign-in.
3. Upload a small text file, rename it, search for it, and download it; compare the downloaded contents.
4. Sign in as a second Google user, then share from the first account to that email.
5. Confirm the recipient sees the file under Shared with me and can download it but cannot rename or delete it.
6. Revoke the share and confirm a subsequent download request is rejected.
7. Restart/redeploy the app and confirm files remain accessible through GridFS.
8. Delete the file and confirm usage decreases.
9. Check logs for unexpected errors and confirm the public URL uses HTTPS.

Record the verified URL in the README after completing these checks. Automated tests cannot prove that a live Google client or Atlas network allowlist is configured correctly.

## Operations

- Render free instances sleep after inactivity; allow for a cold start.
- Monitor `/readyz`, Render logs, database capacity, and recurring cleanup errors.
- API errors include a request ID; server error logs contain the matching ID without file contents or credentials.
- Keep the session secret stable across normal deploys. Rotating it logs everyone out.
- Do not switch hosted uploads to `local` without provisioning a persistent disk.
- Changing storage adapters does not migrate old file bytes.
- A database outage makes API requests fail; the app returns an error rather than pretending a write succeeded.
- Recovery retries pending deletion and removes stale uploads. It is performed on startup and at minute intervals while the service is awake.
- Maintain database backups separately if the files matter. GridFS and metadata must be backed up consistently. Local storage deployments also require backups of the private upload directory.
- To roll back code, redeploy a previously verified commit. Do not delete the database or volumes as part of a code rollback.

## Troubleshooting

| Symptom                            | Check                                                            |
| ---------------------------------- | ---------------------------------------------------------------- |
| Google `redirect_uri_mismatch`     | Exact scheme, hostname, port, and callback path                  |
| Google denies access               | OAuth audience/test-user configuration and verified email        |
| Login returns to signed-out screen | HTTPS origin, secure cookies, proxy configuration, session store |
| Database connection timeout        | Atlas IP allowlist, database credentials, URI encoding           |
| File disappears after a deploy     | `STORAGE_BACKEND` must be `gridfs` on a free Render instance     |
| Upload receives 409                | Byte quota, reserved capacity, or file-count limit               |
| Upload receives 413                | File exceeds the configured maximum                              |
| Sharing cannot find someone        | Recipient must first sign in with that exact Google email        |
| First request is slow              | Free service cold start; inspect readiness before retrying       |

Provider references: [Render Docker](https://render.com/docs/docker), [Render free services](https://render.com/docs/free), [MongoDB Atlas](https://www.mongodb.com/docs/atlas/), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server).
