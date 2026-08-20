import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, ApiError } from '../api/client';
import { tokenStore } from './tokenStore';
import type { AuthResponse, AuthState, AuthUser } from '../types/auth';

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, adminKey?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'anonymous' });

  // On first mount, a token may already be sitting in localStorage from a
  // previous visit. It's validated against GET /auth/me rather than trusted
  // blindly - it may have expired, or the server's JWT_SECRET may have
  // rotated since - so a stale/invalid token can't silently leave the app
  // thinking it's authenticated when the backend would reject every call.
  useEffect(() => {
    const existingToken = tokenStore.getToken();
    if (!existingToken) return;

    let cancelled = false;
    setState({ status: 'authenticating' });
    apiGet<{ user: AuthUser }>('/auth/me')
      .then(({ user }) => {
        if (!cancelled) setState({ status: 'authenticated', user, token: existingToken });
      })
      .catch(() => {
        tokenStore.setToken(null);
        if (!cancelled) setState({ status: 'anonymous' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stay in sync if something outside this provider's own actions clears
  // the token - specifically, `api/client.ts` clearing it on a 401 response
  // from any authenticated request made anywhere in the app.
  useEffect(() => {
    return tokenStore.subscribe((token) => {
      if (token === null) {
        setState((prev) => (prev.status === 'authenticated' ? { status: 'anonymous' } : prev));
      }
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState({ status: 'authenticating' });
    try {
      const { user, token } = await apiPost<AuthResponse>('/auth/login', { email, password });
      tokenStore.setToken(token);
      setState({ status: 'authenticated', user, token });
    } catch (err) {
      setState({ status: 'error', error: err instanceof ApiError ? err.message : 'Login failed.' });
    }
  }, []);

  const register = useCallback(async (email: string, password: string, adminKey?: string) => {
    setState({ status: 'authenticating' });
    try {
      const { user, token } = await apiPost<AuthResponse>('/auth/register', { email, password, adminKey });
      tokenStore.setToken(token);
      setState({ status: 'authenticated', user, token });
    } catch (err) {
      setState({ status: 'error', error: err instanceof ApiError ? err.message : 'Registration failed.' });
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.setToken(null);
    setState({ status: 'anonymous' });
  }, []);

  /**
   * `useMemo` - the context value is an object literal; without memoizing
   * it, every render of `AuthProvider` would hand every consumer a new
   * object reference (even when `state` itself hasn't changed), which
   * defeats `React.memo` on any consumer and causes every component reading
   * `useAuth()` to re-render on every provider render regardless of whether
   * anything they actually use changed.
   */
  const value = useMemo<AuthContextValue>(() => ({ state, login, register, logout }), [state, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
