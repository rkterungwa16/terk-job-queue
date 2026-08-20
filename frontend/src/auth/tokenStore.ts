const STORAGE_KEY = 'jobqueue.token';

type TokenListener = (token: string | null) => void;

/**
 * `api/client.ts` needs to read the current auth token on every request,
 * but it's a plain module with no React dependency (by design - it's
 * usable from anywhere, not just components). Rather than threading the
 * token through every `apiGet`/`apiPost` call site as a parameter, this is
 * a tiny observable singleton: a single source of truth for "what's the
 * current token", readable synchronously from non-React code, and
 * subscribable from React (`AuthContext`) so UI state stays in sync when
 * something outside a component's control changes it - specifically, a 401
 * response clearing the token from inside `client.ts` itself.
 */
function readInitialToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw in some private-browsing modes - treat as logged out.
    return null;
  }
}

let currentToken: string | null = readInitialToken();
const listeners = new Set<TokenListener>();

export const tokenStore = {
  getToken(): string | null {
    return currentToken;
  },
  setToken(token: string | null): void {
    currentToken = token;
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort persistence only; the in-memory value above is still authoritative for this tab.
    }
    for (const listener of listeners) listener(token);
  },
  subscribe(listener: TokenListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
