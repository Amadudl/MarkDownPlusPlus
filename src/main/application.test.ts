import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId } from '../shared/commands';
import { IpcChannel } from '../shared/ipc';
import type { IpcDependencies } from './ipc';
import type { MenuContext } from './menu';
import type * as WindowModule from './window';
import type { AppWindowOptions } from './window';

const h = vi.hoisted(() => {
  const state = {
    userData: '',
    focused: null as { webContents: { id: number } } | null,
    ipcDeps: null as unknown,
    menus: [] as unknown[],
    portable: false,
  };
  return { state };
});

const app = await vi.hoisted(async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  const emitter = new Emitter();
  return Object.assign(emitter, {
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    setAppUserModelId: vi.fn(),
    getName: vi.fn(() => 'MarkDown++'),
    getVersion: vi.fn(() => '1.0.0'),
    addRecentDocument: vi.fn(),
    clearRecentDocuments: vi.fn(),
  });
});

vi.mock('electron', () => ({
  app,
  BrowserWindow: { getFocusedWindow: () => h.state.focused },
  nativeTheme: { shouldUseDarkColors: true },
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }] },
  session: { defaultSession: { id: 'default' } },
}));

const windows = vi.hoisted(() => {
  let nextId = 100;
  class FakeAppWindow {
    static list: FakeAppWindow[] = [];
    static loadError: Error | null = null;
    static fromWebContentsId(id: number): FakeAppWindow | undefined {
      return FakeAppWindow.list.find((window) => window.id === id);
    }
    static all(): FakeAppWindow[] {
      return [...FakeAppWindow.list];
    }
    readonly id = nextId++;
    isRendererReady = false;
    send = vi.fn();
    focus = vi.fn();
    sendMenuCommand = vi.fn();
    load = vi.fn(() =>
      FakeAppWindow.loadError ? Promise.reject(FakeAppWindow.loadError) : Promise.resolve(),
    );
    constructor(readonly options: AppWindowOptions) {
      FakeAppWindow.list.push(this);
    }
    close(): void {
      FakeAppWindow.list = FakeAppWindow.list.filter((window) => window !== this);
      this.options.onClosed?.(this as never);
    }
  }
  return { FakeAppWindow };
});

vi.mock('./window', async (importOriginal) => ({
  ...(await importOriginal<typeof WindowModule>()),
  AppWindow: windows.FakeAppWindow,
}));
vi.mock('./ipc', () => ({
  registerIpcHandlers: (deps: unknown) => {
    h.state.ipcDeps = deps;
  },
}));
vi.mock('./menu', () => ({
  installApplicationMenu: (context: unknown) => h.state.menus.push(context),
}));
vi.mock('./paths', () => ({
  configureUserData: () => ({ dir: h.state.userData, isPortable: h.state.portable }),
  userDataFile: (name: string) => join(h.state.userData, name),
  rendererDir: () => '/app/out/renderer',
  preloadPath: () => '/app/out/preload/index.cjs',
}));
const protocol = vi.hoisted(() => ({
  APP_ENTRY_URL: 'mpp-app://bundle/index.html',
  installProtocols: vi.fn(),
  registerPrivilegedSchemes: vi.fn(),
}));
vi.mock('./protocol', () => protocol);
const security = vi.hoisted(() => ({
  buildContentSecurityPolicy: vi.fn(() => 'csp'),
  hardenSession: vi.fn(),
  installGlobalSecurity: vi.fn(),
  openExternalSafely: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('./security', () => security);
const remoteImages = vi.hoisted(() => ({ installRemoteImageGuard: vi.fn() }));
vi.mock('./remoteImages', () => remoteImages);

const { Application, APP_USER_MODEL_ID, resolveDevServerUrl } = await import('./application');

const originalArgv = process.argv;
const originalEnv = process.env.MPP_DEV_SERVER_URL;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-app-'));
  h.state.userData = join(dir, 'user-data');
  h.state.focused = null;
  h.state.menus = [];
  h.state.ipcDeps = null;
  h.state.portable = false;
  windows.FakeAppWindow.list = [];
  app.removeAllListeners();
  app.requestSingleInstanceLock.mockReturnValue(true);
  app.quit.mockClear();
  app.setAppUserModelId.mockClear();
  app.addRecentDocument.mockClear();
  process.argv = ['/electron'];
  delete process.env.MPP_DEV_SERVER_URL;
});

afterEach(async () => {
  process.argv = originalArgv;
  if (originalEnv === undefined) delete process.env.MPP_DEV_SERVER_URL;
  else process.env.MPP_DEV_SERVER_URL = originalEnv;
  await rm(dir, { recursive: true, force: true });
});

const deps = (): IpcDependencies => h.state.ipcDeps as IpcDependencies;
const lastMenu = (): MenuContext => h.state.menus.at(-1) as MenuContext;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

async function doc(name: string, content = '# doc'): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

describe('resolveDevServerUrl', () => {
  it('only honours http(s) URLs in unpackaged builds', () => {
    expect(resolveDevServerUrl({ MPP_DEV_SERVER_URL: ' http://localhost:5183/ ' }, false)).toBe(
      'http://localhost:5183/',
    );
    expect(resolveDevServerUrl({ MPP_DEV_SERVER_URL: 'http://localhost:5183/' }, true)).toBeNull();
    expect(resolveDevServerUrl({ MPP_DEV_SERVER_URL: 'file:///evil' }, false)).toBeNull();
    expect(resolveDevServerUrl({}, false)).toBeNull();
  });
});

describe('Application', () => {
  it('quits when another instance holds the lock', async () => {
    app.requestSingleInstanceLock.mockReturnValue(false);
    expect(await new Application('linux').start()).toBe(false);
    expect(app.quit).toHaveBeenCalled();
    expect(protocol.registerPrivilegedSchemes).toHaveBeenCalled();
    expect(windows.FakeAppWindow.list).toHaveLength(0);
  });

  it('wires services, protocols, menu and the first window', async () => {
    process.env.MPP_DEV_SERVER_URL = 'http://localhost:5183/';
    const file = await doc('arg.md');
    process.argv = ['/electron', file, '--inspect'];
    h.state.portable = true;
    expect(await new Application('linux').start()).toBe(true);

    expect(security.installGlobalSecurity).toHaveBeenCalledWith({ devServerUrl: 'http://localhost:5183/' });
    expect(security.hardenSession).toHaveBeenCalledWith(
      { id: 'default' },
      { devServerUrl: 'http://localhost:5183/' },
    );
    expect(remoteImages.installRemoteImageGuard).toHaveBeenCalledWith(
      { id: 'default' },
      {
        allowed: expect.any(Function) as unknown,
        settled: expect.any(Function) as unknown,
        devServerUrl: 'http://localhost:5183/',
      },
    );
    const guard = remoteImages.installRemoteImageGuard.mock.calls.at(-1) as unknown as
      [unknown, { allowed: () => boolean; settled: () => Promise<void> }] | undefined;
    // Remote images are off by default.
    expect(guard?.[1].allowed()).toBe(false);
    await expect(guard?.[1].settled()).resolves.toBeUndefined();
    expect(protocol.installProtocols).toHaveBeenCalledWith('/app/out/renderer', 'csp', {
      allowUncHost: expect.any(Function) as unknown,
    });
    expect(app.setAppUserModelId).not.toHaveBeenCalled();
    expect(deps().appInfo).toMatchObject({ name: 'MarkDown++', version: '1.0.0', isPortable: true });
    expect(deps().devServerUrl).toBe('http://localhost:5183/');

    const [window] = windows.FakeAppWindow.list;
    expect(window?.options).toMatchObject({
      entryUrl: 'http://localhost:5183/',
      preloadPath: '/app/out/preload/index.cjs',
      stateFile: join(h.state.userData, 'window-state.json'),
      workAreas: [{ x: 0, y: 0, width: 1440, height: 900 }],
      backgroundColor: '#111318',
      platform: 'linux',
      devTools: true,
    });
    expect(window?.load).toHaveBeenCalled();

    const pending = await deps().takePendingFiles();
    expect(pending.map((result) => result.path)).toEqual([file]);
    expect(await deps().takePendingFiles()).toEqual([]);
    expect(deps().registry.has(file)).toBe(true);
    expect(lastMenu().recentFiles.map((entry) => entry.path)).toEqual([file]);
    expect(app.addRecentDocument).not.toHaveBeenCalled();
  });

  it('uses the Windows integration and the bundled entry page', async () => {
    await new Application('win32').start();
    expect(app.setAppUserModelId).toHaveBeenCalledWith(APP_USER_MODEL_ID);
    expect(windows.FakeAppWindow.list[0]?.options.entryUrl).toBe('mpp-app://bundle/index.html');
    const file = await doc('w.md');
    await deps().recent.add(file);
    expect(app.addRecentDocument).toHaveBeenCalledWith(file);
    await deps().recent.clear();
    expect(app.clearRecentDocuments).toHaveBeenCalled();
  });

  it('queues open-file requests until the renderer is ready, then delivers directly', async () => {
    const early = await doc('early.md');
    const application = new Application('darwin');
    const started = application.start();
    const preventDefault = vi.fn();
    app.emit('open-file', { preventDefault }, early);
    expect(preventDefault).toHaveBeenCalled();
    await started;
    const [window] = windows.FakeAppWindow.list;
    expect((await deps().takePendingFiles()).map((result) => result.path)).toEqual([early]);

    if (!window) throw new Error('window expected');
    window.isRendererReady = true;
    const later = await doc('later.md');
    app.emit('open-file', { preventDefault }, later);
    await vi.waitFor(() => expect(window.focus).toHaveBeenCalled());
    expect(window.send).toHaveBeenCalledWith(IpcChannel.OpenFiles, [
      expect.objectContaining({ path: later }),
    ]);
    expect(window.focus).toHaveBeenCalled();
  });

  it('skips unreadable files and still focuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await new Application('darwin').start();
    const [window] = windows.FakeAppWindow.list;
    if (!window) throw new Error('window expected');
    window.isRendererReady = true;
    app.emit('open-file', { preventDefault: vi.fn() }, join(dir, 'missing.md'));
    await vi.waitFor(() => expect(window.focus).toHaveBeenCalled());
    expect(window.send).not.toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing.md'));

    const binary = await doc('binary.png', 'x');
    app.emit('open-file', { preventDefault: vi.fn() }, binary);
    await vi.waitFor(() => expect(window.focus).toHaveBeenCalledTimes(2));
    expect(window.send).toHaveBeenCalledWith(IpcChannel.OpenFiles, [
      expect.objectContaining({ path: binary }),
    ]);
    warn.mockRestore();
  });

  it('opens a window for a file opened from Finder while no window is open (macOS)', async () => {
    await new Application('darwin').start();
    windows.FakeAppWindow.list[0]?.close();
    expect(windows.FakeAppWindow.list).toHaveLength(0);
    const file = await doc('finder.md');
    app.emit('open-file', { preventDefault: vi.fn() }, file);
    expect(windows.FakeAppWindow.list).toHaveLength(1);
    // The new renderer collects the file through TakePendingFiles.
    expect((await deps().takePendingFiles()).map((result) => result.path)).toEqual([file]);
    // A window that exists but is still loading picks the file up itself; no second window.
    app.emit('open-file', { preventDefault: vi.fn() }, file);
    expect(windows.FakeAppWindow.list).toHaveLength(1);
  });

  it('still opens OS-requested files when the recent list cannot be updated', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await new Application('linux').start();
      const file = await doc('ok.md');
      const add = vi.spyOn(deps().recent, 'add').mockRejectedValue(new Error('EROFS'));
      app.emit('second-instance', {}, ['/electron', file], dir);
      expect((await deps().takePendingFiles()).map((result) => result.path)).toEqual([file]);
      expect(add).toHaveBeenCalledWith(file);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('to the recent files'));
    } finally {
      warn.mockRestore();
    }
  });

  it('forwards files from a second instance and focuses or recreates the window', async () => {
    await new Application('darwin').start();
    const first = windows.FakeAppWindow.list[0];
    const file = await doc('second.md');
    app.emit('second-instance', {}, ['/electron', file], dir);
    expect(first?.focus).toHaveBeenCalled();
    expect((await deps().takePendingFiles()).map((result) => result.path)).toEqual([file]);

    first?.close();
    app.emit('second-instance', {}, ['/electron'], dir);
    expect(windows.FakeAppWindow.list).toHaveLength(1);
  });

  it('leaves window creation to startup while services are still loading', async () => {
    let release: () => void = () => undefined;
    app.whenReady.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const started = new Application('darwin').start();
    app.emit('second-instance', {}, ['/electron'], dir);
    expect(windows.FakeAppWindow.list).toHaveLength(0);
    release();
    await started;
    expect(windows.FakeAppWindow.list).toHaveLength(1);
  });

  it('keeps running on macOS when the last window closes, unless quitting', async () => {
    await new Application('darwin').start();
    app.emit('window-all-closed');
    expect(app.quit).not.toHaveBeenCalled();
    app.emit('before-quit');
    const window = windows.FakeAppWindow.list[0];
    window?.options.onCloseCancelled?.(window as never);
    app.emit('window-all-closed');
    expect(app.quit).not.toHaveBeenCalled();
    app.emit('before-quit');
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it('quits on other platforms when the last window closes', async () => {
    await new Application('linux').start();
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalled();
  });

  it('re-creates a window on activate', async () => {
    await new Application('darwin').start();
    app.emit('activate');
    expect(windows.FakeAppWindow.list).toHaveLength(1);
    windows.FakeAppWindow.list[0]?.close();
    app.emit('activate');
    expect(windows.FakeAppWindow.list).toHaveLength(1);
  });

  it('ignores activate before startup finished', () => {
    const application = new Application('darwin');
    void application.start();
    app.emit('activate');
    expect(windows.FakeAppWindow.list).toHaveLength(0);
  });

  it('routes menu commands to the focused, first or a new window', async () => {
    await new Application('linux').start();
    const [first] = windows.FakeAppWindow.list;
    if (!first) throw new Error('window expected');
    const second = new windows.FakeAppWindow({} as AppWindowOptions);

    h.state.focused = { webContents: { id: second.id } };
    lastMenu().sendCommand(CommandId.FileSave);
    expect(second.sendMenuCommand).toHaveBeenCalledWith(CommandId.FileSave, undefined);

    h.state.focused = { webContents: { id: 9999 } };
    expect(deps().registry.has('/x.md')).toBe(false);
    lastMenu().sendCommand(CommandId.FileOpenRecent, '/x.md');
    expect(first.sendMenuCommand).toHaveBeenCalledWith(CommandId.FileOpenRecent, '/x.md');
    // Clicking Open Recent grants the entry, so non-markdown recent files open too.
    expect(deps().registry.has('/x.md')).toBe(true);
    lastMenu().sendCommand(CommandId.FileClearRecent);
    expect(deps().registry.size).toBe(1);

    h.state.focused = null;
    windows.FakeAppWindow.list = [];
    lastMenu().sendCommand(CommandId.FileNew);
    expect(windows.FakeAppWindow.list[0]?.sendMenuCommand).toHaveBeenCalledWith(CommandId.FileNew, undefined);

    lastMenu().openExternal('https://example.com');
    expect(security.openExternalSafely).toHaveBeenCalledWith('https://example.com');
    security.openExternalSafely.mockRejectedValueOnce(new Error('no browser'));
    lastMenu().openExternal('https://example.com');
    await flush();
  });

  it('rebuilds the menu on recent changes and broadcasts settings', async () => {
    await new Application('linux').start();
    const menus = h.state.menus.length;
    await deps().recent.add(await doc('r.md'));
    expect(h.state.menus.length).toBe(menus + 1);

    const [window] = windows.FakeAppWindow.list;
    const settings = await deps().settings.set({ editor: { tabSize: 4 } });
    expect(window?.send).toHaveBeenCalledWith(IpcChannel.SettingsChanged, settings);
  });

  it('delivers watcher events to the owning window and cleans up on close', async () => {
    await new Application('linux').start();
    const [window] = windows.FakeAppWindow.list;
    if (!window) throw new Error('window expected');
    const file = await doc('watched.md');
    await deps().watcher.watch(window.id, file);
    await deps().watcher.watch(424242, file);
    const { writeFile: write, utimes } = await import('node:fs/promises');
    await write(file, 'changed');
    const later = new Date(Date.now() + 60_000);
    await utimes(file, later, later);
    await vi.waitFor(
      () =>
        expect(window.send).toHaveBeenCalledWith(
          IpcChannel.FileChangedOnDisk,
          expect.objectContaining({ path: file }),
        ),
      { timeout: 3000 },
    );
    deps().watcher.unwatch(424242, file);
    window.close();
    expect(deps().watcher.isWatching(file)).toBe(false);
  });

  it('records own saves so the watcher ignores them', async () => {
    await new Application('linux').start();
    const [window] = windows.FakeAppWindow.list;
    if (!window) throw new Error('window expected');
    const file = await doc('own.md');
    deps().registry.add(file);
    const read = await deps().files.read(file);
    await deps().watcher.watch(window.id, file);
    await deps().files.save({ path: read.path, content: 'mine', lineEnding: 'lf', hasBom: false });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(window.send).not.toHaveBeenCalledWith(IpcChannel.FileChangedOnDisk, expect.anything());
    window.close();
  });

  it('captures the previous session before any window exists', async () => {
    await mkdir(h.state.userData, { recursive: true });
    await writeFile(
      join(h.state.userData, 'session.json'),
      JSON.stringify({ documents: [{ path: '/prev/a.md', mode: 'source' }], activePath: null }),
    );
    await new Application('linux').start();
    expect(deps().session.isRestorable('/prev/a.md')).toBe(true);
    expect(deps().session.isRestorable('/other.md')).toBe(false);
  });

  it('allows network-share images only from servers of granted documents', async () => {
    let beforeServices: boolean | undefined;
    protocol.installProtocols.mockImplementationOnce(
      (_root: string, _csp: string, policy: { allowUncHost: (host: string) => boolean }) => {
        beforeServices = policy.allowUncHost('files');
      },
    );
    await new Application('win32').start();
    expect(beforeServices).toBe(false);
    const policy = protocol.installProtocols.mock.calls.at(-1)?.[2] as {
      allowUncHost: (host: string) => boolean;
    };
    expect(policy.allowUncHost('files')).toBe(false);
    deps().registry.add('\\\\files\\share\\doc.md');
    expect(policy.allowUncHost('files')).toBe(true);
  });

  it('logs windows that fail to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    windows.FakeAppWindow.loadError = new Error('boom');
    await new Application('linux').start();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(error).toHaveBeenCalledWith(
      'Failed to load the application window:',
      windows.FakeAppWindow.loadError,
    );
    windows.FakeAppWindow.loadError = null;
    error.mockRestore();
  });

  it('uses a light first paint when the settings ask for it', async () => {
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ appearance: { followSystem: false, uiTheme: 'daylight' } }),
    );
    h.state.userData = dir;
    await new Application('darwin').start();
    windows.FakeAppWindow.list[0]?.close();
    app.emit('activate');
    expect(windows.FakeAppWindow.list[0]?.options.backgroundColor).toBe('#f7f7f8');
  });
});
