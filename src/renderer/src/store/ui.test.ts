import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  errorMessage,
  initialUiState,
  systemPrefersDark,
  toastError,
  TOAST_DURATION_MS,
  useUi,
  watchSystemColorScheme,
} from './ui';

const ui = useUi.getState;

function mockMatchMedia(matches: boolean): { fire: (value: boolean) => void; removed: () => boolean } {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  let removed = false;
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => {
      listener = fn;
    },
    removeEventListener: () => {
      removed = true;
    },
  })) as unknown as typeof window.matchMedia;
  return {
    fire: (value) => listener?.({ matches: value } as MediaQueryListEvent),
    removed: () => removed,
  };
}

describe('ui store', () => {
  const original = window.matchMedia;
  beforeEach(() => useUi.setState(initialUiState()));
  afterEach(() => {
    window.matchMedia = original;
    vi.useRealTimers();
  });

  it('opens one dialog at a time and closes the palette', () => {
    ui().setPaletteOpen(true);
    ui().openDialog('settings', 'code');
    expect(ui()).toMatchObject({ dialog: 'settings', settingsSection: 'code', paletteOpen: false });
    ui().openDialog('about');
    expect(ui()).toMatchObject({ dialog: 'about', settingsSection: 'code' });
    ui().setSettingsSection('editor');
    expect(ui().settingsSection).toBe('editor');
    ui().closeDialog();
    expect(ui().dialog).toBeNull();
  });

  it('opens and closes the find bar with a fresh focus token', () => {
    ui().openFind(false);
    ui().openFind(true);
    expect(ui().findBar).toEqual({ open: true, replace: true, focusToken: 2 });
    ui().closeFind();
    expect(ui().findBar).toEqual({ open: false, replace: false, focusToken: 2 });
  });

  it('toggles panels and records environment facts', () => {
    ui().setOutlineVisible(true);
    ui().toggleFocusMode();
    ui().setToolbarCollapsed(true);
    ui().setPrefersDark(false);
    ui().setPlatform('darwin');
    ui().setDropActive(true);
    ui().setCursor('a', { line: 2, column: 3, selectionLength: 0 });
    expect(ui()).toMatchObject({
      outlineVisible: true,
      focusMode: true,
      toolbarCollapsed: true,
      prefersDark: false,
      platform: 'darwin',
      dropActive: true,
      cursors: { a: { line: 2, column: 3, selectionLength: 0 } },
    });
    const info = {
      name: 'x',
      version: '1',
      platform: 'linux',
      electron: '1',
      chrome: '1',
      node: '1',
      isPortable: true,
    } as const;
    ui().setAppInfo(info);
    expect(ui().appInfo).toBe(info);
  });

  it('auto-dismisses toasts and keeps at most five', () => {
    vi.useFakeTimers();
    const id = ui().pushToast('info', 'Hello', { detail: 'World' });
    expect(ui().toasts[0]).toEqual({ id, kind: 'info', message: 'Hello', detail: 'World' });
    vi.advanceTimersByTime(TOAST_DURATION_MS.info);
    expect(ui().toasts).toEqual([]);
    for (let index = 0; index < 7; index += 1) ui().pushToast('error', `e${index}`, { durationMs: 0 });
    expect(ui().toasts.map((toast) => toast.message)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
    vi.advanceTimersByTime(60_000);
    expect(ui().toasts).toHaveLength(5);
    ui().dismissToast(ui().toasts[0]!.id);
    expect(ui().toasts).toHaveLength(4);
  });

  it('builds error toasts from any thrown value', () => {
    toastError('Failed', new Error('boom'));
    toastError('Failed', 'text');
    toastError('Failed', 42);
    expect(ui().toasts.map((toast) => toast.detail)).toEqual(['boom', 'text', 'Unknown error']);
    expect(errorMessage(new TypeError('t'))).toBe('t');
  });

  it('reads and follows the system colour scheme', () => {
    const media = mockMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);
    const stop = watchSystemColorScheme();
    expect(ui().prefersDark).toBe(true);
    media.fire(false);
    expect(ui().prefersDark).toBe(false);
    stop();
    expect(media.removed()).toBe(true);
  });

  it('copes without matchMedia', () => {
    // @ts-expect-error simulating an environment without matchMedia
    window.matchMedia = undefined;
    expect(systemPrefersDark()).toBe(false);
    const stop = watchSystemColorScheme();
    expect(() => stop()).not.toThrow();
  });
});
