import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  webUtils: { getPathForFile: vi.fn() },
}));
vi.mock('electron', () => electron);

describe('preload entry', () => {
  it('exposes the API as window.mpp', async () => {
    await import('./index');
    expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [key, api] = electron.contextBridge.exposeInMainWorld.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(key).toBe('mpp');
    expect(Object.keys(api).sort()).toEqual(['app', 'file', 'recent', 'session', 'settings']);
  });
});
