import { afterEach, describe, expect, it, vi } from 'vitest';

const dockHide = vi.fn();
vi.mock('electron', () => ({ app: { dock: { hide: dockHide } }, BrowserWindow: vi.fn() }));

const { isBackgroundTestMode, showForBackgroundTests } = await import('./window');

function fakeWindow() {
  return {
    setSkipTaskbar: vi.fn(),
    setOpacity: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
  };
}

describe('background E2E mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    dockHide.mockClear();
  });

  it('is enabled only by MPP_E2E_BACKGROUND=1', () => {
    expect(isBackgroundTestMode({ MPP_E2E_BACKGROUND: '1' })).toBe(true);
    expect(isBackgroundTestMode({ MPP_E2E_BACKGROUND: 'true' })).toBe(false);
    expect(isBackgroundTestMode({})).toBe(false);
  });

  it('shows the window invisibly, without focus or mouse capture', () => {
    const win = fakeWindow();
    showForBackgroundTests(win as never);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(win.setOpacity).toHaveBeenCalledWith(0);
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(win.showInactive).toHaveBeenCalledOnce();
    expect(dockHide).toHaveBeenCalledTimes(process.platform === 'darwin' ? 1 : 0);
  });

  it('hides the dock icon on macOS only', () => {
    const original = process.platform;
    for (const platform of ['darwin', 'linux'] as const) {
      Object.defineProperty(process, 'platform', { value: platform });
      dockHide.mockClear();
      showForBackgroundTests(fakeWindow() as never);
      expect(dockHide).toHaveBeenCalledTimes(platform === 'darwin' ? 1 : 0);
    }
    Object.defineProperty(process, 'platform', { value: original });
  });
});
