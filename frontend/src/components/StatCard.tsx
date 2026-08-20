import { memo } from 'react';
import type { JobStatus } from '../types/api';

interface StatCardProps {
  status: JobStatus;
  count: number;
}

const LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
};

/**
 * `React.memo` - the dashboard re-renders `StatCard` five times (once per
 * status) every poll tick. Without `memo`, every card would re-render
 * whenever *any* of them changes, or whenever an unrelated parent state
 * update happens (e.g. the search box's `searchText` on every keystroke),
 * even though four of the five counts almost always stay the same between
 * polls. `memo`'s default shallow-props comparison is enough here because
 * `status` is a string literal and `count` is a number - both compare
 * correctly with `Object.is`, no custom comparator needed.
 */
export const StatCard = memo(function StatCard({ status, count }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${status}`}>
      <span className="stat-card__count">{count.toLocaleString()}</span>
      <span className="stat-card__label">{LABELS[status]}</span>
    </div>
  );
});
