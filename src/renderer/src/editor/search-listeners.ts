import type { SearchController, SearchListener, SearchState } from './types';

/**
 * The listeners of one {@link SearchController}. Both editors notify it from
 * their update hooks so the find bar reflects edits made while it is open.
 */
export class SearchListeners {
  private readonly listeners = new Set<SearchListener>();

  /** Adds a listener; the returned function removes it again. */
  subscribe(listener: SearchListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** True while at least one listener is registered (lets editors skip computing unused states). */
  get active(): boolean {
    return this.listeners.size > 0;
  }

  /** Calls every listener with `state`; listeners added or removed during the call do not affect it. */
  emit(state: SearchState): void {
    for (const listener of [...this.listeners]) listener(state);
  }
}

const CLEARED: SearchState = { total: 0, current: 0, error: null };

/**
 * Completes an editor's search operations into a {@link SearchController}
 * whose listeners are notified with the result of every operation (including
 * errors such as an invalid regular expression and the empty state after
 * `clear`). The editor itself emits the changes it detects on its own, such
 * as edits that add or remove matches.
 */
export function notifyingSearchController(
  operations: Omit<SearchController, 'subscribe'>,
  listeners: SearchListeners,
): SearchController {
  const report = (state: SearchState): SearchState => {
    listeners.emit(state);
    return state;
  };
  return {
    setQuery: (query) => report(operations.setQuery(query)),
    findNext: () => report(operations.findNext()),
    findPrevious: () => report(operations.findPrevious()),
    replaceCurrent: (replacement) => report(operations.replaceCurrent(replacement)),
    replaceAll: (replacement) => report(operations.replaceAll(replacement)),
    clear() {
      operations.clear();
      listeners.emit(CLEARED);
    },
    subscribe: (listener) => listeners.subscribe(listener),
  };
}
