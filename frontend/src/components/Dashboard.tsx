import { useCallback, useState, useTransition } from 'react';
import { apiPost } from '../api/client';
import type { AsyncState, BulkRetryResponse, FailedJobsResponse } from '../types/api';
import { useFailedJobs } from '../hooks/useFailedJobs';
import { useQueueStats } from '../hooks/useQueueStats';
import { useSelection } from '../hooks/useSelection';
import { useAuth } from '../auth/AuthContext';
import { assertNever } from '../types/utils';
import { StatsPanel } from './StatsPanel';
import { SchedulePanel } from './SchedulePanel';
import { SearchBar } from './SearchBar';
import { FailedJobsTable } from './FailedJobsTable';
import { PaginationControls } from './Pagination';
import { BulkRetryBar } from './BulkRetryBar';

export function Dashboard() {
  const { state: authState, logout } = useAuth();
  const { refetch: refetchStats, ...statsState } = useQueueStats(5000);
  const { state: failedState, setPage, searchText, setSearchText, refetch: refetchFailed } = useFailedJobs(10);
  const [selected, dispatchSelection] = useSelection();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  /**
   * `useTransition` marks the page-change state update as non-urgent. A
   * page click triggers both a synchronous `setPage` (used by `useMemo`/
   * `useCallback` inside `useFailedJobs` to build the next request) and a
   * network round trip. Without a transition, React would treat this like
   * any other urgent update - the previous table content would disappear
   * behind a loading state immediately, causing a jarring blank flash for
   * what's often a sub-200ms fetch. With `startTransition`, React keeps
   * rendering the *current* page's rows on screen (they're still valid,
   * just about to be superseded) while the new page loads in the
   * background, and exposes `isPending` so the UI can show a subtle "this
   * is updating" affordance instead of a full unmount/remount.
   */
  const [isPending, startTransition] = useTransition();

  const handlePageChange = useCallback(
    (nextPage: number) => {
      startTransition(() => setPage(nextPage));
    },
    [setPage],
  );

  const handleClearSelection = useCallback(() => dispatchSelection({ type: 'clear' }), [dispatchSelection]);

  const handleBulkRetry = useCallback(async () => {
    setIsRetrying(true);
    setRetryError(null);
    try {
      await apiPost<BulkRetryResponse>('/admin/queue/retry/bulk', { jobIds: Array.from(selected) });
      dispatchSelection({ type: 'clear' });
      refetchFailed();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setIsRetrying(false);
    }
  }, [selected, dispatchSelection, refetchFailed]);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>Job Queue Dashboard</h1>
        {authState.status === 'authenticated' && (
          <div className="dashboard__user">
            <span>{authState.user.email}</span>
            <button type="button" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </header>

      <StatsPanel state={statsState} />

      <SchedulePanel onScheduled={refetchStats} />

      <section className="dashboard__failed-jobs">
        <div className="dashboard__toolbar">
          <SearchBar value={searchText} onChange={setSearchText} />
        </div>

        {retryError && <p className="error-banner">{retryError}</p>}

        <BulkRetryBar selectedCount={selected.size} isRetrying={isRetrying} onRetry={() => void handleBulkRetry()} onClear={handleClearSelection} />

        <FailedJobsBody state={failedState} selected={selected} dispatchSelection={dispatchSelection} isPending={isPending} onPageChange={handlePageChange} />
      </section>
    </div>
  );
}

interface FailedJobsBodyProps {
  state: AsyncState<FailedJobsResponse>;
  selected: ReadonlySet<string>;
  dispatchSelection: ReturnType<typeof useSelection>[1];
  isPending: boolean;
  onPageChange: (page: number) => void;
}

/**
 * Kept as a separate component (rather than inline branching inside
 * `Dashboard`) purely so the `switch` over `state.status` narrows cleanly
 * without the rest of `Dashboard`'s JSX in the way - same exhaustiveness
 * pattern as `StatsPanel`.
 */
function FailedJobsBody({ state, selected, dispatchSelection, isPending, onPageChange }: FailedJobsBodyProps) {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <p className="loading-state">Loading failed jobs…</p>;
    case 'error':
      return <p className="error-banner">Couldn&apos;t load failed jobs: {state.error}</p>;
    case 'success':
      return (
        <>
          <FailedJobsTable jobs={state.data.results} selected={selected} dispatchSelection={dispatchSelection} />
          <PaginationControls pagination={state.data.pagination} onPageChange={onPageChange} isPending={isPending} />
        </>
      );
    default:
      return assertNever(state, 'FailedJobsBody');
  }
}
