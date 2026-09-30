import type { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId } from '../shared/commands';
import { IpcChannel } from '../shared/ipc';
import { applySettingsPatch, DEFAULT_SETTINGS } from '../shared/settings';

const created = vi.hoisted(() => [] as unknown[]);

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  let nextId = 1;
  class FakeWebContents extends Emitter {
    readonly id = nextId++;
    send = vi.fn();
  }
  class BrowserWindow extends Emitter {
    readonly webContents = new FakeWebContents();
    destroyed = false;
    maximized = false;
    minimized = false;
    bounds = { x: 10, y: 20, width: 900, height: 700 };
    loadURL = vi.fn(() => Promise.resolve());
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    setTitle = vi.fn();
    setRepresentedFilename = vi.fn();
    setDocumentEdited = vi.fn();
    constructor(readonly options: Record<string, unknown>) {
      super();
      created.push(this);
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    isMaximized(): boolean {
      return this.maximized;
    }
    isMinimized(): boolean {
      return this.minimized;
    }
    maximize(): void {
      this.maximized = true;
    }
    getNormalBounds(): typeof this.bounds {
      return this.bounds;
    }
    close(): void {
      const event = { defaultPrevented: false, preventDefault: () => (event.defaultPrevented = true) };
      this.emit('close', event);
      if (!event.defaultPrevented) this.destroy();
    }
    destroy(): void {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('closed');
    }
  }
  return { BrowserWindow };
});

const {
  AppWindow,
  CLOSE_TIMEOUT_MS,
  DEFAULT_WINDOW_STATE,
  initialBackgroundColor,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  sanitizeWindowState,
} = await import('./window');

interface FakeWindow extends EventEmitter {
  options: Record<string, unknown>;
  webContents: EventEmitter & { id: number; send: ReturnType<typeof vi.fn> };
  destroyed: boolean;
  maximized: boolean;
  minimized: boolean;
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setTitle: ReturnType<typeof vi.fn>;
  setRepresentedFilename: ReturnType<typeof vi.fn>;
  setDocumentEdited: ReturnType<typeof vi.fn>;
  close(): void;
  destroy(): void;
}

const display = { x: 0, y: 0, width: 1920, height: 1080 };
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-window-'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const window of AppWindow.all()) window.browserWindow.destroy();
  created.length = 0;
  await rm(dir, { recursive: true, force: true });
});

function open(overrides: Partial<ConstructorParameters<typeof AppWindow>[0]> = {}) {
  const onClosed = vi.fn();
  const window = new AppWindow({
    entryUrl: 'mpp-app://bundle/index.html',
    preloadPath: '/app/out/preload/index.cjs',
    stateFile: join(dir, 'window-state.json'),
    workAreas: [display],
    backgroundColor: '#111318',
    platform: 'darwin',
    devTools: false,
    closeTimeoutMs: 1000,
    onClosed,
    ...overrides,
  });
  return { window, fake: created.at(-1) as FakeWindow, onClosed };
}

describe('sanitizeWindowState', () => {
  it('falls back to defaults for invalid data', () => {
    expect(sanitizeWindowState(undefined, [display])).toEqual(DEFAULT_WINDOW_STATE);
    expect(sanitizeWindowState({ width: 'big' }, [display])).toEqual(DEFAULT_WINDOW_STATE);
    expect(CLOSE_TIMEOUT_MS).toBe(5000);
  });

  it('clamps the default size to small displays (first launch on a 1366x768 laptop)', () => {
    const laptop = { x: 0, y: 0, width: 1366, height: 728 };
    expect(sanitizeWindowState(undefined, [laptop])).toEqual({
      width: 1280,
      height: 728,
      isMaximized: false,
    });
    expect(sanitizeWindowState(null, [{ x: 0, y: 0, width: 1024, height: 600 }])).toEqual({
      width: 1024,
      height: 600,
      isMaximized: false,
    });
  });

  it('keeps visible positions', () => {
    expect(
      sanitizeWindowState({ x: 100, y: 50, width: 1000, height: 800, isMaximized: true }, [display]),
    ).toEqual({
      x: 100,
      y: 50,
      width: 1000,
      height: 800,
      isMaximized: true,
    });
  });

  it('drops positions that are off-screen and clamps sizes', () => {
    expect(sanitizeWindowState({ x: 5000, y: 50, width: 100, height: 100 }, [display])).toEqual({
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
      isMaximized: false,
    });
    expect(sanitizeWindowState({ x: 10, y: -500, width: 9000, height: 9000 }, [display])).toEqual({
      width: 1920,
      height: 1080,
      isMaximized: false,
    });
    expect(sanitizeWindowState({ x: 10, width: 800, height: 600 }, [display])).toEqual({
      width: 800,
      height: 600,
      isMaximized: false,
    });
  });

  it('accepts positions on a secondary display', () => {
    const second = { x: 1920, y: -200, width: 1280, height: 1024 };
    expect(
      sanitizeWindowState({ x: 2000, y: -100, width: 800, height: 600 }, [display, second]),
    ).toMatchObject({
      x: 2000,
      y: -100,
    });
  });

  it('works without display information', () => {
    expect(sanitizeWindowState({ width: 800, height: 600 }, [])).toEqual({
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
      isMaximized: false,
    });
  });
});

describe('loadWindowState', () => {
  it('reads and validates the state file', async () => {
    const file = join(dir, 'state.json');
    expect(loadWindowState(file, [display])).toEqual(DEFAULT_WINDOW_STATE);
    await writeFile(file, JSON.stringify({ x: 1, y: 2, width: 800, height: 600, isMaximized: false }));
    expect(loadWindowState(file, [display])).toEqual({
      x: 1,
      y: 2,
      width: 800,
      height: 600,
      isMaximized: false,
    });
  });
});

describe('initialBackgroundColor', () => {
  it('follows the system when configured', () => {
    expect(initialBackgroundColor(DEFAULT_SETTINGS, true)).toBe('#111318');
    expect(initialBackgroundColor(DEFAULT_SETTINGS, false)).toBe('#f7f7f8');
  });

  it('uses the explicit theme otherwise', () => {
    const light = applySettingsPatch(DEFAULT_SETTINGS, {
      appearance: { followSystem: false, uiTheme: 'daylight' },
    });
    expect(initialBackgroundColor(light, true)).toBe('#f7f7f8');
    const dark = applySettingsPatch(DEFAULT_SETTINGS, {
      appearance: { followSystem: false, uiTheme: 'midnight' },
    });
    expect(initialBackgroundColor(dark, false)).toBe('#111318');
  });

  it('uses the kind of a custom theme', () => {
    const colorKeys = [
      'background',
      'surface',
      'surfaceElevated',
      'surfaceSunken',
      'border',
      'borderStrong',
      'text',
      'textMuted',
      'textFaint',
      'accent',
      'accentHover',
      'accentText',
      'selection',
      'focusRing',
      'danger',
      'warning',
      'success',
      'editorBackground',
      'editorText',
      'link',
      'heading',
      'quoteBar',
      'quoteBackground',
      'tableBorder',
      'tableHeaderBackground',
      'tableStripe',
      'inlineCodeBackground',
      'inlineCodeText',
      'mark',
    ];
    const colors = Object.fromEntries(colorKeys.map((key) => [key, '#ffffff'])) as never;
    const settings = applySettingsPatch(DEFAULT_SETTINGS, {
      appearance: {
        followSystem: false,
        uiTheme: 'paper',
        customUiThemes: [{ id: 'paper', name: 'Paper', kind: 'light', colors }],
      },
    });
    expect(initialBackgroundColor(settings, true)).toBe('#f7f7f8');
  });
});

describe('AppWindow', () => {
  it('creates a hardened window and registers it', () => {
    const { window, fake } = open();
    expect(fake.options).toMatchObject({
      show: false,
      backgroundColor: '#111318',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 14 },
      webPreferences: {
        preload: '/app/out/preload/index.cjs',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: true,
        devTools: false,
      },
    });
    expect(window.id).toBe(fake.webContents.id);
    expect(AppWindow.fromWebContentsId(window.id)).toBe(window);
    expect(AppWindow.all()).toContain(window);
  });

  it('keeps the native frame outside macOS and restores saved bounds', async () => {
    await writeFile(
      join(dir, 'window-state.json'),
      JSON.stringify({ x: 40, y: 30, width: 1000, height: 700, isMaximized: true }),
    );
    const { fake } = open({ platform: 'win32' });
    expect(fake.options).not.toHaveProperty('titleBarStyle');
    expect(fake.options).toMatchObject({ x: 40, y: 30, width: 1000, height: 700 });
    fake.emit('ready-to-show');
    expect(fake.maximized).toBe(true);
    expect(fake.show).toHaveBeenCalled();
  });

  it('shows without maximising by default', () => {
    const { fake } = open();
    fake.emit('ready-to-show');
    expect(fake.maximized).toBe(false);
    expect(fake.show).toHaveBeenCalled();
  });

  it('loads the entry URL', async () => {
    const { window, fake } = open({ entryUrl: 'http://localhost:5183/' });
    await window.load();
    expect(fake.loadURL).toHaveBeenCalledWith('http://localhost:5183/');
  });

  it('queues menu commands until the renderer is ready', async () => {
    const { window, fake } = open();
    window.sendMenuCommand(CommandId.FileSave);
    window.sendMenuCommand(CommandId.FileOpenRecent, '/a.md');
    expect(fake.webContents.send).not.toHaveBeenCalled();
    expect(window.isRendererReady).toBe(false);
    window.markRendererReady();
    window.markRendererReady();
    expect(window.isRendererReady).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(fake.webContents.send.mock.calls).toEqual([
      [IpcChannel.MenuCommand, CommandId.FileSave, undefined],
      [IpcChannel.MenuCommand, CommandId.FileOpenRecent, '/a.md'],
    ]);
    window.sendMenuCommand(CommandId.FileNew);
    expect(fake.webContents.send).toHaveBeenLastCalledWith(
      IpcChannel.MenuCommand,
      CommandId.FileNew,
      undefined,
    );
  });

  it('does not send to destroyed windows', () => {
    const { window, fake } = open();
    fake.destroyed = true;
    window.send(IpcChannel.OpenFiles, []);
    expect(fake.webContents.send).not.toHaveBeenCalled();
    fake.destroyed = false;
  });

  it('focuses, restoring minimised windows', () => {
    const { window, fake } = open();
    window.focus();
    expect(fake.restore).not.toHaveBeenCalled();
    fake.minimized = true;
    window.focus();
    expect(fake.restore).toHaveBeenCalled();
    expect(fake.focus).toHaveBeenCalledTimes(2);
  });

  it('sets title, represented file and edited state on macOS only', () => {
    const mac = open();
    mac.window.setTitle('a.md — MarkDown++', '/docs/a.md');
    mac.window.setTitle('Untitled', null);
    mac.window.setDirty(true);
    expect(mac.fake.setTitle).toHaveBeenCalledWith('a.md — MarkDown++');
    expect(mac.fake.setRepresentedFilename.mock.calls).toEqual([['/docs/a.md'], ['']]);
    expect(mac.fake.setDocumentEdited).toHaveBeenCalledWith(true);

    const linux = open({ platform: 'linux' });
    linux.window.setTitle('x', '/x.md');
    linux.window.setDirty(true);
    expect(linux.fake.setRepresentedFilename).not.toHaveBeenCalled();
    expect(linux.fake.setDocumentEdited).not.toHaveBeenCalled();
  });

  describe('keyboard shortcuts', () => {
    function press(fake: FakeWindow, input: Record<string, unknown>) {
      const event = { preventDefault: vi.fn() };
      fake.webContents.emit('before-input-event', event, {
        type: 'keyDown',
        isAutoRepeat: false,
        shift: false,
        control: false,
        alt: false,
        meta: false,
        ...input,
      });
      return event;
    }

    it('swallows shortcut key presses and sends their command to this window', async () => {
      const { window, fake } = open();
      window.markRendererReady();
      await new Promise((resolve) => setImmediate(resolve));
      const bold = press(fake, { key: 'b', code: 'KeyB', meta: true });
      expect(bold.preventDefault).toHaveBeenCalledTimes(1);
      expect(fake.webContents.send).toHaveBeenCalledExactlyOnceWith(
        IpcChannel.MenuCommand,
        CommandId.FormatBold,
        undefined,
      );
      const typing = press(fake, { key: 'b', code: 'KeyB' });
      expect(typing.preventDefault).not.toHaveBeenCalled();
      expect(fake.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('uses the platform of the window to resolve CmdOrCtrl', () => {
      const { window, fake } = open({ platform: 'win32' });
      expect(press(fake, { key: 'b', code: 'KeyB', meta: true }).preventDefault).not.toHaveBeenCalled();
      expect(press(fake, { key: 'b', code: 'KeyB', control: true }).preventDefault).toHaveBeenCalled();
      expect(window.isRendererReady).toBe(false);
    });
  });

  describe('close handshake', () => {
    it('asks the renderer first and closes once it confirms', async () => {
      const { window, fake, onClosed } = open();
      fake.close();
      expect(fake.destroyed).toBe(false);
      expect(window.isClosePending).toBe(true);
      expect(fake.webContents.send).toHaveBeenCalledWith(IpcChannel.CloseRequested);
      fake.close();
      expect(fake.webContents.send).toHaveBeenCalledTimes(1);
      window.confirmClose();
      expect(fake.destroyed).toBe(true);
      expect(onClosed).toHaveBeenCalledWith(window);
      expect(AppWindow.fromWebContentsId(window.id)).toBeUndefined();
      const saved = JSON.parse(await readFile(join(dir, 'window-state.json'), 'utf8')) as unknown;
      expect(saved).toEqual({ x: 10, y: 20, width: 900, height: 700, isMaximized: false });
      window.confirmClose();
    });

    it('force-closes an unresponsive renderer after the timeout', () => {
      vi.useFakeTimers();
      const { fake } = open();
      fake.close();
      vi.advanceTimersByTime(999);
      expect(fake.destroyed).toBe(false);
      vi.advanceTimersByTime(1);
      expect(fake.destroyed).toBe(true);
    });

    it('disarms the timeout once the renderer acknowledged (it is asking the user)', () => {
      vi.useFakeTimers();
      const { window, fake } = open();
      window.acknowledgeCloseRequest();
      fake.close();
      window.acknowledgeCloseRequest();
      vi.advanceTimersByTime(60_000);
      expect(fake.destroyed).toBe(false);
      expect(window.isClosePending).toBe(true);
      fake.close();
      expect(fake.webContents.send).toHaveBeenCalledTimes(1);
      window.confirmClose();
      expect(fake.destroyed).toBe(true);
    });

    it('drops the pending close when the renderer cancels and restarts on the next attempt', () => {
      vi.useFakeTimers();
      const onCloseCancelled = vi.fn();
      const { window, fake } = open({ onCloseCancelled });
      window.cancelClose();
      expect(onCloseCancelled).not.toHaveBeenCalled();
      fake.close();
      window.cancelClose();
      expect(window.isClosePending).toBe(false);
      expect(onCloseCancelled).toHaveBeenCalledExactlyOnceWith(window);
      vi.advanceTimersByTime(5000);
      expect(fake.destroyed).toBe(false);
      window.cancelClose();
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
      fake.close();
      expect(fake.webContents.send).toHaveBeenCalledTimes(2);
      expect(window.isClosePending).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(fake.destroyed).toBe(true);
    });

    it('closes immediately when the renderer process is gone', () => {
      const pending = open();
      pending.fake.close();
      pending.fake.webContents.emit('render-process-gone');
      expect(pending.fake.destroyed).toBe(true);

      const crashed = open();
      crashed.fake.webContents.emit('render-process-gone');
      crashed.fake.close();
      expect(crashed.fake.destroyed).toBe(true);
    });

    it('uses the default timeout', () => {
      vi.useFakeTimers();
      const { fake } = open({ closeTimeoutMs: undefined, onClosed: undefined });
      fake.close();
      vi.advanceTimersByTime(CLOSE_TIMEOUT_MS);
      expect(fake.destroyed).toBe(true);
    });

    it('survives a state file that cannot be written', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { window, fake } = open({ stateFile: join(dir, 'missing', 'state.json') });
      fake.close();
      window.confirmClose();
      expect(warn).toHaveBeenCalledWith('Could not persist the window state:', expect.any(Error));
      warn.mockRestore();
    });
  });
});
