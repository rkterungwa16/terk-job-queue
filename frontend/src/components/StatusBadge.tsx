import { memo } from 'react';
import type { JobStatus } from '../types/api';

interface StatusBadgeProps {
  status: JobStatus;
}

/**
 * KEYOF / INDEXED ACCESS + MAPPED TYPE: `Record<JobStatus, string>` forces
 * this map to have exactly one entry per status - add a status to the
 * `JobStatus` union in types/api.ts and this object literal stops
 * compiling until a color is added for it, so the UI can never silently
 * render an unstyled/undefined badge for a status the type system claims
 * to support.
 */
const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  pending: 'badge badge--pending',
  processing: 'badge badge--processing',
  completed: 'badge badge--completed',
  failed: 'badge badge--failed',
  paused: 'badge badge--paused',
};

/**
 * `React.memo` - this badge is rendered once per row in `FailedJobsTable`
 * and its props (`status`) almost never change once a row is on screen.
 * Wrapping it means React can skip re-rendering/re-diffing this leaf
 * component when an ancestor re-renders for an unrelated reason (a
 * different row's selection checkbox toggling, a stats poll ticking),
 * because `memo` shallow-compares `status` (a primitive string) between
 * renders and bails out when it's unchanged.
 */
function StatusBadgeImpl({ status }: StatusBadgeProps) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}

export const StatusBadge = memo(StatusBadgeImpl);
