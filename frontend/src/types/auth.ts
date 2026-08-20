export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

/**
 * DISCRIMINATED UNION - same pattern as `AsyncState<T>` in types/api.ts,
 * kept as its own type rather than reusing `AsyncState` directly because
 * the states mean something different here: `'anonymous'` is a long-lived
 * resting state (not "hasn't started fetching yet"), and `'authenticated'`
 * always carries both `user` and `token` together rather than one generic
 * `data` blob.
 */
export type AuthState =
  | { status: 'anonymous' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; user: AuthUser; token: string }
  | { status: 'error'; error: string };
