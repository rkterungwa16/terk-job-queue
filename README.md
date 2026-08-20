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
`role: "admin"`, signed with `JWT_SECRET`.

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173, proxies /api to :3000
```

Set `VITE_API_BASE_URL` (see `frontend/.env.example`) if the backend isn't
reachable via the dev proxy (e.g. pointing at a deployed API).

## What the dashboard shows

- Live queue counts by status (`pending`/`processing`/`completed`/`failed`/`paused`),
  polling `/api/admin/queue/stats` every 5s (paused while the tab is hidden).
- A searchable, paginated table of failed jobs
  (`/api/admin/queue/failed`), with per-row and select-all checkboxes and a
  bulk "Retry selected" action (`POST /api/admin/queue/retry/bulk`).

Note: the dashboard calls the admin API directly and does not implement a
login flow — for local development, generate a JWT with `role: "admin"`
signed with the same `JWT_SECRET` and attach it as a Bearer token (e.g. via
a browser extension or by temporarily adding a header in `frontend/src/api/client.ts`).
