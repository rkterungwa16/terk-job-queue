import { useMemo } from 'react';
import type { AsyncState, DashboardStatsResponse, JobStatus } from '../types/api';
import { StatCard } from './StatCard';
import { assertNever } from '../types/utils';

const STATUS_ORDER: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'paused'];

interface StatsPanelProps {
  state: AsyncState<DashboardStatsResponse>;
}

export function StatsPanel({ state }: StatsPanelProps) {
  /**
   * TYPE NARROWING: switching on `state.status` narrows `state` to exactly
   * the union member that string identifies for the rest of that branch -
   * `state.data` only exists (and is only accessible without a cast) inside
   * the `'success'` case, `state.error` only inside `'error'`. The `default`
   * branch calling `assertNever` is what makes this exhaustive: if
   * `AsyncState` ever gains a fifth variant, this stops compiling until a
   * case is added here.
   */
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <StatsPanelSkeleton />;
    case 'error':
      return <p className="error-banner">Couldn&apos;t load queue stats: {state.error}</p>;
    case 'success':
      return <StatsPanelGrid counts={state.data.jobCounts} />;
    default:
      return assertNever(state, 'StatsPanel');
  }
}

function StatsPanelGrid({ counts }: { counts: DashboardStatsResponse['jobCounts'] }) {
  /**
   * `useMemo` - deriving the total from the five counts is trivial work,
   * but memoizing it means the derived value only recomputes when `counts`
   * itself changes (a new object from a fresh poll), not on every render
   * this component participates in for unrelated reasons (e.g. a parent
   * re-render triggered by the search box). Cheap here, but it's the same
   * pattern used for genuinely expensive derived values elsewhere in the
   * app (`params` in `useFailedJobs`), kept consistent so the codebase has
   * one idiom for "derive this from props/state, only when it changes".
   */
  const total = useMemo(() => Object.values(counts).reduce((sum, n) => sum + n, 0), [counts]);

  return (
    <section className="stats-panel" aria-label="Queue status overview">
      {STATUS_ORDER.map((status) => (
        <StatCard key={status} status={status} count={counts[status]} />
      ))}
      <div className="stats-panel__total">Total: {total.toLocaleString()}</div>
    </section>
  );
}

function StatsPanelSkeleton() {
  return (
    <section className="stats-panel" aria-busy="true">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="stat-card stat-card--skeleton" />
      ))}
    </section>
  );
}
