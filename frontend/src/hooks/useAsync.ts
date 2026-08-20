import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncState } from '../types/api';

/**
 * ---------------------------------------------------------------------------
 * GENERIC DATA-FETCHING HOOK
 * ---------------------------------------------------------------------------
 * `useAsync<T>` is generic over the resolved data type `T`, inferred from
 * whatever `fetcher` returns - every caller (`useQueueStats`,
 * `useFailedJobs`) gets a fully-typed `AsyncState<T>` back with zero
 * repetition of the response shape.
 *
 * PERFORMANCE / CORRECTNESS DECISIONS:
 *
 * 1. `AbortController` + `useEffect` cleanup. Every fetch gets its own
 *    controller; the effect's cleanup function aborts it. Without this, a
 *    fast page-change or search keystroke fires request A, then request B
 *    before A resolves - if A resolves *after* B (out-of-order network
 *    responses are common), A's `setState` would clobber B's fresher data
 *    with stale results ("race condition" bugs that are notoriously hard to
 *    reproduce). Aborting on every re-run/unmount makes only the latest
 *    request's result ever reach `setState`.
 *
 * 2. `fetcherRef` (a `useRef`, not a dependency). Callers routinely pass an
 *    inline arrow function as `fetcher` (see `useQueueStats`/`useFailedJobs`
 *    below) - a fresh function identity on every render. If `fetcher` were
 *    listed in the effect's dependency array directly, the effect would
 *    re-run (re-fetch over the network) on *every single render* of the
 *    calling component, regardless of whether anything meaningful actually
 *    changed. Stashing it in a ref and reading `fetcherRef.current` inside
 *    the effect means the effect only depends on the caller-supplied `deps`
 *    array (the values that should actually trigger a new request), while
 *    still always calling the latest version of the function.
 *
 * 3. `useCallback` for `refetch`. Returning a new `refetch` function identity
 *    on every render would break `React.memo`/dependency-array memoization
 *    for any component or effect that receives it as a prop or lists it as
 *    a dependency (e.g. the polling `setInterval` in `useQueueStats`).
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(
    () => {
      const controller = new AbortController();
      setState({ status: 'loading' });

      fetcherRef
        .current(controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setState({ status: 'success', data });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return; // expected during cleanup/refetch races, not a real failure
          const message = err instanceof Error ? err.message : 'Unknown error';
          setState({ status: 'error', error: message });
        });

      return () => controller.abort();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's explicit dependency list by design
    [...deps, tick],
  );

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, refetch };
}
