import { useEffect, useState } from 'react';

/**
 * GENERIC over `T` so it works for the search string here today and for any
 * other debounced value later without a rewrite.
 *
 * NOTE ON `useDeferredValue` vs. debouncing: React's built-in
 * `useDeferredValue` is a *rendering-priority* tool - it lets an expensive
 * re-render (e.g. filtering a large in-memory list) happen at low priority
 * so keystrokes stay responsive, but the *value itself* still changes on
 * every keystroke, so it would not reduce the number of network requests
 * fired. What this dashboard needs for the failed-jobs search box is fewer
 * network round trips while typing, which needs a genuine time-based delay -
 * hence a small `setTimeout`-based debounce here instead.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
