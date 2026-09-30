import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import {
  adaptersVersion,
  clearAdapters,
  getActiveAdapter,
  getAdapter,
  setAdapter,
  subscribeAdapters,
} from './adapters';
import { INITIAL_DOCUMENTS_STATE, useDocuments } from './documents';

describe('adapter registry', () => {
  beforeEach(() => {
    clearAdapters();
    useDocuments.setState({ ...INITIAL_DOCUMENTS_STATE });
  });

  it('registers, notifies and removes adapters', () => {
    const listener = vi.fn();
    const stop = subscribeAdapters(listener);
    const adapter = createFakeAdapter('wysiwyg', '');
    const version = adaptersVersion();
    setAdapter('a', adapter);
    setAdapter('a', adapter);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(adaptersVersion()).toBe(version + 1);
    expect(getAdapter('a')).toBe(adapter);
    setAdapter('a', null);
    setAdapter('a', null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getAdapter('a')).toBeUndefined();
    stop();
    setAdapter('b', adapter);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns the adapter of the active document', () => {
    expect(getActiveAdapter()).toBeUndefined();
    const id = useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    expect(getActiveAdapter()).toBeUndefined();
    const adapter = createFakeAdapter('wysiwyg', '');
    setAdapter(id, adapter);
    expect(getActiveAdapter()).toBe(adapter);
    clearAdapters();
    expect(getActiveAdapter()).toBeUndefined();
  });
});
