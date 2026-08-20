/**
 * These mirror the backend's `backend/src/types/job.types.ts`. In a real
 * monorepo these two files would be one shared package; kept duplicated
 * here (frontend has no build-time dependency on the backend) but written
 * to stay structurally identical on purpose.
 */

/** UNION TYPE - closed set of statuses the dashboard can render/filter on. */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused';

/** MAPPED TYPE (via `Record`) - one count per status, enforced at the type level. */
export type StatusCounts = Record<JobStatus, number>;

export interface DashboardStatsResponse {
  appliedFilters: { userId?: string; date?: string };
  jobCounts: StatusCounts;
}

export interface FailedJob {
  _id: string;
  name: string;
  data: Record<string, unknown>;
  status: 'failed';
  attempts: number;
  maxAttempts: number;
  runAt: string;
  errorReason: string | null;
  errorStack: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
}

export interface FailedJobsResponse {
  pagination: Pagination;
  results: FailedJob[];
}

export interface BulkRetryResponse {
  message: string;
  itemsReset: number;
}

/**
 * ---------------------------------------------------------------------------
 * DISCRIMINATED UNION - async request lifecycle
 * ---------------------------------------------------------------------------
 * Every network-backed piece of UI state in this app (`useAsync`,
 * `useQueueStats`, `useFailedJobs`) resolves to one of these four tagged
 * variants instead of the common but error-prone pattern of three separate
 * booleans (`isLoading`, `isError`, `data`) that can drift out of sync
 * (e.g. `isLoading: true` *and* stale `data` *and* a leftover `error` all
 * true at once - a state combination that should be impossible but compiles
 * fine with separate booleans). Narrowing on `status` in a `switch` gives
 * exhaustive, compiler-checked handling of every real state a fetch can be
 * in, and each variant only carries the fields that make sense for it -
 * `data` only exists on the `success` branch, `error` only on `error`.
 */
export type AsyncState<TData> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TData }
  | { status: 'error'; error: string };

/**
 * GENERIC UTILITY TYPE built from `Pick`: the query params the failed-jobs
 * endpoint accepts, derived narrowly rather than redeclared. The index
 * signature lets this flow straight into `toQueryString`'s
 * `Record<string, ...>` parameter without a cast at the call site, while
 * the named fields above it still give autocomplete/typo-checking for the
 * params this app actually constructs.
 */
export interface FailedJobsQuery {
  page: number;
  limit: number;
  userId?: string;
  q?: string;
  [key: string]: string | number | undefined;
}
