import { describe, expect, it, vi } from 'vitest';
import { SearchListeners } from './search-listeners';

const STATE = { total: 2, current: 1, error: null };

describe('SearchListeners', () => {
  it('notifies subscribed listeners until they unsubscribe', () => {
    const listeners = new SearchListeners();
    expect(listeners.active).toBe(false);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = listeners.subscribe(first);
    listeners.subscribe(second);
    expect(listeners.active).toBe(true);
    listeners.emit(STATE);
    expect(first).toHaveBeenCalledWith(STATE);
    expect(second).toHaveBeenCalledWith(STATE);
    unsubscribeFirst();
    unsubscribeFirst();
    listeners.emit(STATE);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('is not affected by listeners that unsubscribe while being notified', () => {
    const listeners = new SearchListeners();
    const calls: string[] = [];
    const unsubscribe = listeners.subscribe(() => {
      calls.push('a');
      unsubscribe();
    });
    listeners.subscribe(() => calls.push('b'));
    listeners.emit(STATE);
    listeners.emit(STATE);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
