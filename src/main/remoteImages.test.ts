import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { on: vi.fn() }, shell: { openExternal: vi.fn() } }));

const { installRemoteImageGuard } = await import('./remoteImages');

interface Details {
  url: string;
  resourceType: string;
}
type Handler = (details: Details, callback: (response: { cancel: boolean }) => void) => void;

function setup(
  allowed: () => boolean,
  devServerUrl: string | null = null,
  settled: () => Promise<void> = () => Promise.resolve(),
) {
  let filter: { urls: string[] } | null = null;
  let handler: Handler = () => undefined;
  const ses = {
    webRequest: {
      onBeforeRequest: (requestFilter: { urls: string[] }, requestHandler: Handler) => {
        filter = requestFilter;
        handler = requestHandler;
      },
    },
  };
  installRemoteImageGuard(ses as never, { allowed, settled, devServerUrl });
  const decide = async (url: string, resourceType = 'image'): Promise<boolean> => {
    const callback = vi.fn();
    handler({ url, resourceType }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    return (callback.mock.calls[0]?.[0] as { cancel: boolean }).cancel;
  };
  return { filter: () => filter, decide };
}

describe('installRemoteImageGuard', () => {
  it('watches every http and https request', () => {
    const { filter } = setup(() => false);
    expect(filter()).toEqual({ urls: ['http://*/*', 'https://*/*'] });
  });

  it('cancels remote images while they are disabled and follows setting changes', async () => {
    let allowed = false;
    const { decide } = setup(() => allowed);
    expect(await decide('https://tracker.example/pixel.gif?u=1')).toBe(true);
    expect(await decide('http://tracker.example/pixel.gif')).toBe(true);
    allowed = true;
    expect(await decide('https://tracker.example/pixel.gif?u=1')).toBe(false);
  });

  it('never cancels other request types (e.g. spell-checker dictionaries)', async () => {
    const { decide } = setup(() => false);
    expect(await decide('https://redirector.gvt1.com/dict.bdic', 'other')).toBe(false);
    expect(await decide('https://example.com/data', 'xhr')).toBe(false);
  });

  it('never cancels images of the dev server', async () => {
    const { decide } = setup(() => false, 'http://localhost:5183/');
    expect(await decide('http://localhost:5183/src/assets/logo.png')).toBe(false);
    expect(await decide('http://localhost:9999/logo.png')).toBe(true);
  });

  it('waits for pending settings writes before cancelling', async () => {
    let allowed = false;
    let finishWrite: () => void = () => undefined;
    const settled = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            allowed = true;
            resolve();
          };
        }),
    );
    const { decide } = setup(() => allowed, null, settled);
    const decision = decide('https://example.com/enabled.png');
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    finishWrite();
    expect(await decision).toBe(false);
  });

  it('cancels when waiting for the settings fails', async () => {
    const { decide } = setup(
      () => false,
      null,
      () => Promise.reject(new Error('write failed')),
    );
    expect(await decide('https://example.com/x.png')).toBe(true);
  });
});
