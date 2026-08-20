# Job Queue — TypeScript port + Admin Dashboard

This is a TypeScript rewrite of the uploaded `jobqueue` app, plus a new
React + TypeScript admin dashboard (built with Vite) for the queue's admin
API. See:

- **`docs/PERFORMANCE.md`** — every performance/correctness issue found in
  the original app and exactly what changed to fix it.
- **`docs/TYPESCRIPT_DECISIONS.md`** — where and why each requested
  TypeScript concept and React performance pattern is used, with file
  references.

## Structure

```
backend/    Express + Mongoose job queue engine + admin/alert API (TypeScript)
frontend/   Vite + React + TypeScript admin dashboard
docs/       Write-ups referenced above
```

## Running it

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGO_URI / JWT_SECRET / MAILGUN_* as needed
npm run dev            # tsx watch, http://localhost:3000
```

Requires a running MongoDB instance (`MONGO_URI`, defaults to
`mongodb://127.0.0.1:27017/reminders_app_db`).

Admin routes (`/api/admin/*`) require a Bearer JWT whose payload includes
`role: "admin"`, obtained via `/api/auth/login` (see below).

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173, proxies /api to :3000
```

Set `VITE_API_BASE_URL` (see `frontend/.env.example`) if the backend isn't
reachable via the dev proxy (e.g. pointing at a deployed API).

## Authentication

The dashboard now has real registration/login, backed by
`/api/auth/register`, `/api/auth/login`, and `/api/auth/me`. Full design
notes (password hashing, JWT expiry, the admin-bootstrap mechanism, known
limitations) are in `docs/AUTH.md` — the short version for getting a
working admin account locally:

1. Set `ADMIN_REGISTRATION_KEY` in `backend/.env` to any secret string.
2. Register through the dashboard's "Need an account? Register" form,
   filling in the **Admin key** field with that same secret. That account
   is created with `role: "admin"`.
3. Leave `ADMIN_REGISTRATION_KEY` unset (or unset it again after your first
   admin exists) to stop anyone else from self-registering as admin.

Non-admin accounts can register with no admin key, but the dashboard itself
requires `role: "admin"` — a signed-in non-admin sees an "admin access
required" screen instead (see `docs/AUTH.md` for why the real enforcement
is server-side, not just this screen).

## What the dashboard shows

- Live queue counts by status (`pending`/`processing`/`completed`/`failed`/`paused`),
  polling `/api/admin/queue/stats` every 5s (paused while the tab is hidden).
- **Schedule a reminder** — creates a new job via `POST /api/alerts/schedule`
  (user ID, event ID, title, recipient email, first-run time, and
  one-time/hourly/daily/weekly recurrence). Refreshes the status counts
  immediately on success instead of waiting for the next poll.
- **Pause / resume a recurring reminder** — by event ID, via
  `POST /api/alerts/pause` / `POST /api/alerts/resume`.
- A searchable, paginated table of failed jobs
  (`/api/admin/queue/failed`), with per-row and select-all checkboxes and a
  bulk "Retry selected" action (`POST /api/admin/queue/retry/bulk`).

All of the above — including scheduling — requires an admin-role token;
`/api/alerts/*` now requires `authorizeRoles('admin')` the same as
`/api/admin/*` does, since these actions are driven from the dashboard. See
`docs/AUTH.md` for the tradeoff this implies if anything else was calling
`/api/alerts/*` unauthenticated before.
