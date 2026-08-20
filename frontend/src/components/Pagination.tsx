import { memo } from 'react';
import type { Pagination as PaginationInfo } from '../types/api';

interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  isPending: boolean;
}

/**
 * `isPending` is threaded down from `useTransition` in `Dashboard` (see
 * that file for the full explanation). Here it's just used to dim the
 * control and disable double-clicks while a page transition is in flight -
 * the component itself doesn't need to know *how* the pending state was
 * produced, only that it exists.
 */
export const PaginationControls = memo(function PaginationControls({ pagination, onPageChange, isPending }: PaginationProps) {
  const { currentPage, totalPages, totalItems } = pagination;
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  if (totalItems === 0) return null;

  return (
    <div className={`pagination${isPending ? ' pagination--pending' : ''}`}>
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={!canGoPrev}>
        Previous
      </button>
      <span className="pagination__status">
        Page {currentPage} of {totalPages} &middot; {totalItems.toLocaleString()} failed job{totalItems === 1 ? '' : 's'}
      </span>
      <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={!canGoNext}>
        Next
      </button>
    </div>
  );
});
