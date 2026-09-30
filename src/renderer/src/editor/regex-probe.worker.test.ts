import { describe, expect, it, vi } from 'vitest';

describe('regex probe worker', () => {
  it('answers every request with the probe result', async () => {
    const post = vi.spyOn(globalThis, 'postMessage').mockImplementation(() => undefined);
    await import('./regex-probe.worker');
    globalThis.dispatchEvent(
      new MessageEvent('message', { data: { id: 3, source: 'a', flags: 'gu', text: 'aaa', limit: 10 } }),
    );
    expect(post).toHaveBeenCalledWith({ id: 3, elapsedMs: expect.any(Number) });
    post.mockRestore();
  });
});
