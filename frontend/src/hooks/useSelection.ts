import { useReducer } from 'react';
import { assertNever } from '../types/utils';

/**
 * ---------------------------------------------------------------------------
 * DISCRIMINATED UNION - reducer actions, and `useReducer` over `useState`
 * ---------------------------------------------------------------------------
 * The bulk-retry checkbox selection has more than one *kind* of transition
 * (toggle one row, select every row on the page, clear everything) and the
 * next state always depends on the previous state, never on a value handed
 * in from outside. That combination is exactly what `useReducer` is for:
 * centralizing "given this action, what's the next state" in one place
 * that's easy to unit test, instead of three separate `setSelected(...)`
 * call sites scattered across event handlers, each re-deriving the same
 * "am I toggling into or out of the set" logic.
 *
 * It also has a performance side-benefit here: `dispatch` returned by
 * `useReducer` has a *stable identity for the lifetime of the component* -
 * no `useCallback` wrapping is needed to pass it to memoized children,
 * unlike a `setState` setter captured inside a locally-defined handler.
 *
 * The action type itself is a discriminated union (tag: `type`), so the
 * reducer's `switch` narrows `action` to exactly the fields each variant
 * carries, and `assertNever` in the `default` case makes the switch
 * exhaustive-checked - add a new action kind and forget a case, and this
 * file stops compiling.
 */
export type SelectionAction = { type: 'toggle'; id: string } | { type: 'selectAll'; ids: string[] } | { type: 'clear' };

function selectionReducer(state: ReadonlySet<string>, action: SelectionAction): ReadonlySet<string> {
  switch (action.type) {
    case 'toggle': {
      const next = new Set(state);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return next;
    }
    case 'selectAll':
      return new Set(action.ids);
    case 'clear':
      return new Set();
    default:
      return assertNever(action, 'selectionReducer');
  }
}

export function useSelection(): [ReadonlySet<string>, React.Dispatch<SelectionAction>] {
  return useReducer(selectionReducer, new Set<string>());
}
