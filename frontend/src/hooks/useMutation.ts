import { useCallback, useState } from 'react';
import type { AsyncState } from '../types/api';

export interface UseMutationResult<TInput, TOutput> {
  state: AsyncState<TOutput>;
  mutate: (input: TInput) => Promise<TOutput | undefined>;
  reset: () => void;
}

/**
 * GENERICS - `useMutation<TInput, TOutput>` reuses the same `AsyncState<T>`
 * discriminated union `useAsync` uses for reads, because a write operation
 * has the exact same lifecycle shape (idle → loading → success/error) -
 * there's no reason for a second, parallel state type just because the
 * request is a POST instead of a GET. The difference from `useAsync` is
 * only *when* the request fires: `useAsync` fires from a `useEffect` as
 * soon as its dependencies are ready; `mutate` here is only ever called
 * from an explicit event handler (a form submit, a button click) - it has
 * no dependency array and nothing runs until the caller invokes it.
 *
 * `mutate` resolves to the response data on success and `undefined` on
 * failure (rather than re-throwing) so call sites can use a plain
 * `if (result) { ... }` after awaiting it, instead of a try/catch, while
 * the full error detail is still available via `state.error` for
 * rendering.
 */
export function useMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>): UseMutationResult<TInput, TOutput> {
  const [state, setState] = useState<AsyncState<TOutput>>({ status: 'idle' });

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput | undefined> => {
      setState({ status: 'loading' });
      try {
        const data = await fn(input);
        setState({ status: 'success', data });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed.';
        setState({ status: 'error', error: message });
        return undefined;
      }
    },
    [fn],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, mutate, reset };
}
