import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { AsyncState, DashboardStatsResponse } from '../types/api';
import { useAsync } from './useAsync';

/**
 * Polls `/admin/queue/stats` on an interval so the dashboard's counters stay
 * live without a manual refresh.
 *
 * PERFORMANCE DECISION - Page Visibility API: the poll interval is only
 * armed while `document.visibilityState === 'visible'`. A dashboard left
 * open in a background tab has no user watching it; polling it anyway wastes
 * network requests, wakes the tab's JS engine on a timer indefinitely, and
 * (at fleet scale, with many analysts leaving dashboards open) adds
 * needless load to the very admin API this app is trying to keep fast. When
 * the tab regains visibility, an immediate `refetch()` gets the counters
 * current again right away rather than waiting for the next tick.
 */
export function useQueueStats(pollMs = 5000): AsyncState<DashboardStatsResponse> {
  const fetchStats = useCallback((signal: AbortSignal) => apiGet<DashboardStatsResponse>('/admin/queue/stats', signal), []);
  const { refetch, ...state } = useAsync(fetchStats, []);
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    function handleVisibilityChange(): void {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) refetch();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetch]);

  useEffect(() => {
    if (!isVisible) return;
    const id = window.setInterval(refetch, pollMs);
    return () => window.clearInterval(id);
  }, [isVisible, refetch, pollMs]);

  return state;
}
