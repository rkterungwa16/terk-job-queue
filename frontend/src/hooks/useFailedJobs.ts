import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, toQueryString } from '../api/client';
import type { AsyncState, FailedJobsQuery, FailedJobsResponse } from '../types/api';
import { useAsync } from './useAsync';
import { useDebouncedValue } from './useDebouncedValue';

export interface UseFailedJobsResult {
  state: AsyncState<FailedJobsResponse>;
  page: number;
  setPage: (page: number) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  refetch: () => void;
}

export function useFailedJobs(pageSize = 10): UseFailedJobsResult {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText, 350);

  // Jumping back to page 1 is keyed off the *debounced* term, not every
  // keystroke - otherwise the page number would reset mid-typing, before
  // the user has even finished the word they're searching for.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  /**
   * `useMemo` here is what makes the whole chain below cheap: `params` is
   * a plain object literal, which - without memoization - would be a *new*
   * object reference every render (objects compare by reference, not
   * value). `fetchFailedJobs`'s `useCallback` depends on `params`, and
   * `useAsync`'s effect depends on `fetchFailedJobs`'s identity through
   * `deps`; a fresh `params` object every render would cascade into a
   * fresh fetch every render. Memoizing on the actual primitive inputs
   * (`page`, `pageSize`, `debouncedSearch`) means the object - and
   * everything downstream of it - only changes when one of those does.
   */
  const params = useMemo<FailedJobsQuery>(
    () => ({ page, limit: pageSize, q: debouncedSearch || undefined }),
    [page, pageSize, debouncedSearch],
  );

  const fetchFailedJobs = useCallback(
    (signal: AbortSignal) => apiGet<FailedJobsResponse>(`/admin/queue/failed${toQueryString(params)}`, signal),
    [params],
  );

  const { refetch, ...state } = useAsync(fetchFailedJobs, [params]);

  return { state, page, setPage, searchText, setSearchText, refetch };
}
