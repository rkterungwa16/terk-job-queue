import { useCallback, useMemo, type Dispatch } from 'react';
import type { FailedJob } from '../types/api';
import type { SelectionAction } from '../hooks/useSelection';
import { FailedJobRow } from './FailedJobRow';

interface FailedJobsTableProps {
  jobs: FailedJob[];
  selected: ReadonlySet<string>;
  dispatchSelection: Dispatch<SelectionAction>;
}

export function FailedJobsTable({ jobs, selected, dispatchSelection }: FailedJobsTableProps) {
  /**
   * `useCallback` here is what makes `React.memo` on `FailedJobRow` actually
   * pay off (see the comment in that file). `dispatchSelection` itself is
   * already stable (that's what `useReducer` guarantees), so this wrapper's
   * own identity is stable too - it only changes if `dispatchSelection`
   * itself ever changed, which it never does for the lifetime of the
   * component.
   */
  const handleToggle = useCallback((id: string) => dispatchSelection({ type: 'toggle', id }), [dispatchSelection]);

  const allIds = useMemo(() => jobs.map((job) => job._id), [jobs]);
  const allSelected = jobs.length > 0 && allIds.every((id) => selected.has(id));

  function handleToggleAll(): void {
    dispatchSelection(allSelected ? { type: 'clear' } : { type: 'selectAll', ids: allIds });
  }

  if (jobs.length === 0) {
    return <p className="empty-state">No failed jobs match the current filters.</p>;
  }

  return (
    <table className="failed-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleAll}
              aria-label="Select all failed jobs on this page"
            />
          </th>
          <th>Job</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>Error</th>
          <th>Last updated</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <FailedJobRow key={job._id} job={job} isSelected={selected.has(job._id)} onToggle={handleToggle} />
        ))}
      </tbody>
    </table>
  );
}
