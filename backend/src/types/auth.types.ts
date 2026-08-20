/**
 * `UserRole` is intentionally the same shape of "closed union" as
 * `JobStatus` in job.types.ts — it's what lets `authorizeRoles(...)` and
 * every downstream role check be checked at compile time instead of
 * comparing against a bare `string`.
 */
export type UserRole = 'admin' | 'user';

/** The user-facing shape returned to clients — never includes `passwordHash`. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** The shape encoded into every issued JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * DISCRIMINATED UNION - same "outcome" pattern as `JobOutcome` in
 * job.types.ts: `registerUser`/`loginUser` resolve to exactly one of these
 * two tagged variants instead of throwing for expected failures (a
 * duplicate email, a wrong password). Throwing would make "email already
 * registered" indistinguishable from an actual database outage at the
 * route-handler call site; returning a typed result makes the distinction
 * explicit and lets the route handler narrow on `.ok` to decide the HTTP
 * status without a try/catch doing double duty for both control flow and
 * genuine errors.
 */
export type AuthResult = { ok: true; user: AuthUser; token: string } | { ok: false; error: string };
