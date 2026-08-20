# Authentication — Design Decisions

## Backend

- **Password hashing**: `bcryptjs` (pure JS, no native build step) with 10
  salt rounds, `backend/src/domain/auth/authService.ts`. Only the hash is
  ever persisted (`UserModel.passwordHash`) or included in any response.
- **Sessions**: stateless JWTs (`jsonwebtoken`), signed with `JWT_SECRET`,
  default 2h expiry (`JWT_EXPIRES_IN`). The payload
  (`{ sub, email, role }`) is intentionally minimal — no session storage in
  Mongo, no revocation list. That means **a token can't be invalidated
  server-side before it expires** (e.g. there's no "log out everywhere"
  button) — acceptable for a 2-hour-lifetime internal admin tool, but worth
  knowing if this is adapted for something with higher stakes.
- **Admin bootstrap**: there's no seed script or admin UI to promote users,
  so `ADMIN_REGISTRATION_KEY` (backend `.env.example`) is a shared-secret
  env var — set it, and a registration request that includes a matching
  `adminKey` field creates an `admin` account instead of the default
  `user`. Leave it unset in any environment where self-service admin
  signup shouldn't be possible at all; once you have your first admin,
  there's no code-level reason to keep the env var set.
- **User enumeration**: login returns the same "Invalid email or password"
  message whether the account doesn't exist or the password is wrong
  (`authService.ts`, `loginUser`) — distinguishing the two would let an
  attacker discover which emails are registered.
- **`GET /api/auth/me`**: lets a client validate a token it already has
  (used by the frontend on page load) without a matching write-side effect.
  Uses the new `authenticate` middleware directly — no role restriction —
  which `authorizeRoles(...)` is now built on top of, so token verification
  exists in exactly one place in the codebase.
- **`/api/alerts/*` is now admin-gated too.** These routes (schedule/pause/
  resume a reminder) had no auth at all before the dashboard existed. Now
  that scheduling is a dashboard action, `alert.routes.ts` runs
  `router.use(authorizeRoles('admin'))` the same as `admin.routes.ts`
  always has. This is a deliberate behavior change worth calling out: if
  anything else in a real deployment was calling `/api/alerts/schedule`
  unauthenticated (e.g. another internal service creating reminders on
  users' behalf), it will now get a 401/403 and needs its own path to a
  valid admin token — or, better, a separate non-admin "service" role and
  route scoped to just that one action, rather than reusing the dashboard's
  admin auth for a machine-to-machine caller.

### Known limitations (explicitly out of scope for this pass)

- **No rate limiting** on `/auth/login` or `/auth/register` — both are
  brute-forceable as written. A production deployment would want something
  like `express-rate-limit` in front of both routes.
- **No refresh tokens** — sessions just expire after `JWT_EXPIRES_IN` and
  the user has to log in again. Fine for a 2h admin-tool session; a
  longer-lived product would want a refresh-token rotation scheme.
- **No email verification / password reset flow** — registration is
  immediate and there's no way to recover a forgotten password short of an
  admin resetting it directly in the database.

## Frontend

- **Token storage**: `localStorage`, via a small singleton
  (`frontend/src/auth/tokenStore.ts`), not `sessionStorage` or an in-memory
  variable — the tradeoff is deliberate: `localStorage` persists across
  page reloads/tab closes (so an admin doesn't have to log back in on every
  refresh), at the cost of being readable by any JS that runs on the page,
  i.e. vulnerable to token theft via XSS. An httpOnly cookie would close
  that hole but requires backend changes (`SameSite`/CORS/CSRF handling)
  beyond this pass's scope; noted here rather than silently accepted.
- **Why a plain singleton and not just React Context for the token**:
  `api/client.ts` has no React dependency by design (it's callable from
  anywhere, not just components), so it can't read a token out of a
  Context. The singleton is a plain module-level store that both
  `client.ts` (reads synchronously on every request) and `AuthContext.tsx`
  (subscribes, to stay in sync when `client.ts` clears the token on a 401)
  can share without either depending on the other.
- **Startup validation**: a token found in `localStorage` on load is
  checked against `GET /auth/me` before the app treats the user as
  authenticated (`AuthContext.tsx`), rather than trusted blindly — it may
  have expired, or the backend's `JWT_SECRET` may have rotated, since the
  last visit.
- **Auto-logout on 401**: any authenticated request that comes back `401`
  clears the token (`api/client.ts`) and the auth state reactively follows
  (`AuthContext`'s subscription to `tokenStore`), dropping the user back to
  the login screen instead of the app silently retrying a token that will
  never start working again.
- **Client-side role gate**: `App.tsx`'s `AppShell` shows a distinct
  "admin access required" screen for authenticated non-admin users rather
  than rendering the dashboard and letting every request fail with a 403.
  This is UX only — the real enforcement is entirely server-side
  (`authorizeRoles('admin')` in `backend/src/routes/admin.routes.ts`); a
  user could still hit the API directly and would still get rejected.

See `docs/TYPESCRIPT_DECISIONS.md` for how the auth code fits the
codebase's existing TypeScript patterns (the `AuthResult`/`AuthState`
discriminated unions follow the same "outcome"/"async lifecycle" shapes as
`JobOutcome` and `AsyncState<T>` elsewhere in the app).
