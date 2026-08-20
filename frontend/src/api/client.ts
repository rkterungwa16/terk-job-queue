import { tokenStore } from '../auth/tokenStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * ---------------------------------------------------------------------------
 * GENERICS + UNKNOWN
 * ---------------------------------------------------------------------------
 * `apiGet`/`apiPost` are generic over the *response* shape `TResponse` -
 * callers decide what they expect back (`apiGet<DashboardStatsResponse>(...)`),
 * and every call site downstream gets a fully typed result with no casting
 * at the call site itself. `response.json()` from the DOM `fetch` API is
 * typed `Promise<any>` in lib.dom.d.ts - immediately widening that to
 * `unknown` (rather than letting `any` leak into the rest of the app) means
 * the compiler forces an explicit, deliberate assertion at exactly one
 * place (the generic cast below) instead of silently allowing `any` to
 * infect every caller.
 */
async function request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const token = tokenStore.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    // Token missing/expired/invalid server-side - clear it so the UI falls
    // back to the login screen instead of repeatedly failing every request
    // with a token that will never start working again on its own.
    tokenStore.setToken(null);
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message = isErrorBody(body) ? body.error : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  const body: unknown = await res.json();
  return body as TResponse;
}

/** TYPE NARROWING on `unknown` - the only way `body.error` is legal below. */
function isErrorBody(body: unknown): body is { error: string } {
  return typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string';
}

export function apiGet<TResponse>(path: string, signal?: AbortSignal): Promise<TResponse> {
  return request<TResponse>(path, { method: 'GET', signal });
}

export function apiPost<TResponse, TBody = unknown>(path: string, body: TBody, signal?: AbortSignal): Promise<TResponse> {
  return request<TResponse>(path, { method: 'POST', body: JSON.stringify(body), signal });
}

/** Small helper for building `?a=1&b=2` query strings from a params object without `any`. */
export function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
