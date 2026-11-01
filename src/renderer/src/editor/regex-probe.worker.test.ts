import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('regex probe worker', () => {
  it('answers every valid request with the probe result', async () => {
    const post = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined);
    await import('./regex-probe.worker');
    globalThis.dispatchEvent(
      new MessageEvent('message', { data: { id: 3, source: 'a', flags: 'gu', text: 'aaa', limit: 10 } }),
    );
    expect(post).toHaveBeenCalledWith({ id: 3, elapsedMs: expect.any(Number) });
  });

  it.each([
    ['no data', undefined],
    ['a string', 'a'],
    ['a missing field', { id: 1, source: 'a', flags: 'g', text: 'a' }],
    ['an unknown field', { id: 1, source: 'a', flags: 'g', text: 'a', limit: 1, extra: true }],
    ['invalid flags', { id: 1, source: 'a', flags: 'gx', text: 'a', limit: 1 }],
    ['a non-positive limit', { id: 1, source: 'a', flags: 'g', text: 'a', limit: 0 }],
    ['a fractional id', { id: 1.5, source: 'a', flags: 'g', text: 'a', limit: 1 }],
    [
      'a non-string pattern',
      { id: 1, source: { toString: (): string => 'a' }, flags: 'g', text: 'a', limit: 1 },
    ],
  ])('drops a malformed request (%s) without running it', async (_label, data) => {
    const post = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('./regex-probe.worker');
    globalThis.dispatchEvent(new MessageEvent('message', { data }));
    expect(post).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('The regular expression probe ignored a malformed request');
  });
});
