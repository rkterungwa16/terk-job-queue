import { memo, useCallback } from 'react';
import type { FailedJob } from '../types/api';
import { StatusBadge } from './StatusBadge';

interface FailedJobRowProps {
  job: FailedJob;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

/**
 * `React.memo` on a table row is the single highest-leverage optimization
 * in this app: with up to 100 rows per page (the backend caps `limit` at
 * 100), toggling *one* checkbox would otherwise re-render every row and
 * re-diff every cell in the whole table on every click. Memoized, only the
 * row whose `isSelected` prop actually changed re-renders.
 *
 * That guarantee only holds if `onToggle`'s identity is stable across
 * renders - see `FailedJobsTable`, which wraps the handler passed here in
 * `useCallback` for exactly that reason. A memoized child fed a
 * newly-allocated callback prop every render gets zero benefit from `memo`.
 */
export const FailedJobRow = memo(function FailedJobRow({ job, isSelected, onToggle }: FailedJobRowProps) {
  const handleToggle = useCallback(() => onToggle(job._id), [onToggle, job._id]);

  return (
    <tr className={isSelected ? 'failed-row failed-row--selected' : 'failed-row'}>
      <td>
        <input type="checkbox" checked={isSelected} onChange={handleToggle} aria-label={`Select job ${job.name}`} />
      </td>
      <td>{job.name}</td>
      <td>
        <StatusBadge status={job.status} />
      </td>
      <td>
        {job.attempts}/{job.maxAttempts}
      </td>
      <td className="failed-row__error" title={job.errorReason ?? undefined}>
        {job.errorReason ?? '—'}
      </td>
      <td>{new Date(job.updatedAt).toLocaleString()}</td>
    </tr>
  );
});
