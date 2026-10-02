import { describe, expect, it, vi } from 'vitest';
import { CommandId } from '../shared/commands';
import { IpcChannel } from '../shared/ipc';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { createMppApi, type IpcRendererLike } from './createApi';

type Listener = (event: unknown, ...args: unknown[]) => void;

function fakeIpc() {
  const listeners = new Map<string, Set<Listener>>();
  const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve({ ok: true, value: 'result' }),
  );
  const sendSync = vi.fn<(channel: string, ...args: unknown[]) => unknown>(() => true);
  const ipc = {
    invoke,
    sendSync,
    on: vi.fn((channel: string, listener: Listener) => {
      const set = listeners.get(channel) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(channel, set);
      return ipc;
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener);
      return ipc;
    }),
  };
  const emit = (channel: string, ...args: unknown[]): void => {
    for (const listener of listeners.get(channel) ?? []) listener({ sender: 'secret' }, ...args);
  };
  const count = (channel: string): number => listeners.get(channel)?.size ?? 0;
  return { ipc: ipc as unknown as IpcRendererLike, invoke, sendSync, emit, count, raw: ipc };
}

describe('createMppApi', () => {
  it('forwards every method to its channel', async () => {
    const { ipc, invoke, sendSync } = fakeIpc();
    const getPathForFile = vi.fn(() => '/dropped.md');
    const api = createMppApi(ipc, { getPathForFile });
    const save = { path: '/a.md', content: 'x', lineEnding: 'lf', hasBom: false } as const;
    const saveAs = { suggestedName: 'a', content: 'x', lineEnding: 'lf', hasBom: false } as const;
    const exported = { suggestedName: 'a', html: '<p/>' };
    const session = { documents: [], activePath: null };

    const calls: [Promise<unknown>, string, ...unknown[]][] = [
      [api.file.openDialog(), IpcChannel.FileOpenDialog],
      [api.file.read('/a.md'), IpcChannel.FileRead, '/a.md'],
      [api.file.save(save), IpcChannel.FileSave, save],
      [api.file.saveAs(saveAs), IpcChannel.FileSaveAsDialog, saveAs],
      [api.file.exportHtml(exported), IpcChannel.FileExportHtml, exported],
      [api.file.exportPdf(exported), IpcChannel.FileExportPdf, exported],
      [
        api.file.exportImage({ ...exported, width: 892 }),
        IpcChannel.FileExportImage,
        { ...exported, width: 892 },
      ],
      [api.file.watch('/a.md'), IpcChannel.FileWatch, '/a.md'],
      [api.file.unwatch('/a.md'), IpcChannel.FileUnwatch, '/a.md'],
      [api.file.revealInFolder('/a.md'), IpcChannel.FileRevealInFolder, '/a.md'],
      [api.settings.get(), IpcChannel.SettingsGet],
      [api.settings.set({ editor: { tabSize: 4 } }), IpcChannel.SettingsSet, { editor: { tabSize: 4 } }],
      [api.settings.reset(), IpcChannel.SettingsReset],
      [api.recent.get(), IpcChannel.RecentGet],
      [api.recent.clear(), IpcChannel.RecentClear],
      [api.session.save(session), IpcChannel.SessionSave, session],
      [api.session.load(), IpcChannel.SessionLoad],
      [api.app.info(), IpcChannel.AppInfo],
      [api.app.openExternal('https://x.y'), IpcChannel.OpenExternal, 'https://x.y'],
      [api.app.setTitle('Title'), IpcChannel.WindowSetTitle, 'Title'],
      [api.app.setTitle('Title', '/a.md'), IpcChannel.WindowSetTitle, 'Title', '/a.md'],
      [api.app.setTitle('Title', null), IpcChannel.WindowSetTitle, 'Title', null],
      [api.app.setDirty(true), IpcChannel.WindowSetDirty, true],
      [api.app.confirmUnsaved('a.md'), IpcChannel.ConfirmUnsaved, 'a.md'],
      [api.app.confirmReload('a.md'), IpcChannel.ConfirmReload, 'a.md'],
      [api.app.closeReady(), IpcChannel.CloseReady],
      [api.app.closeCancelled(), IpcChannel.CloseCancelled],
      [api.app.takePendingFiles(), IpcChannel.TakePendingFiles],
    ];
    for (const [promise] of calls) await expect(promise).resolves.toBe('result');
    expect(invoke.mock.calls).toEqual(calls.map(([, channel, ...args]) => [channel, ...args]));

    const file = {} as File;
    expect(api.file.pathForDroppedFile(file)).toBe('/dropped.md');
    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(sendSync).toHaveBeenCalledWith(IpcChannel.FileGrantDropped, '/dropped.md');
  });

  it('rejects failed requests with the clean message and code of the main process', async () => {
    const { ipc, invoke } = fakeIpc();
    const api = createMppApi(ipc, { getPathForFile: vi.fn() });
    invoke.mockResolvedValueOnce({ ok: false, code: 'not-found', message: '"/a.md" does not exist.' });
    await expect(api.file.read('/a.md')).rejects.toMatchObject({
      code: 'not-found',
      message: '"/a.md" does not exist.',
    });
    invoke.mockResolvedValueOnce('not an envelope');
    await expect(api.app.info()).rejects.toThrow('The main process sent an invalid response.');
  });

  it('returns no path for dropped files that are not on disk or were refused by main', () => {
    const { ipc, sendSync } = fakeIpc();
    const getPathForFile = vi.fn(() => '');
    const api = createMppApi(ipc, { getPathForFile });
    expect(api.file.pathForDroppedFile({} as File)).toBe('');
    expect(sendSync).not.toHaveBeenCalled();
    getPathForFile.mockReturnValue('/secret.bin');
    sendSync.mockReturnValue(false);
    expect(api.file.pathForDroppedFile({} as File)).toBe('');
    sendSync.mockReturnValue(undefined);
    expect(api.file.pathForDroppedFile({} as File)).toBe('');
  });

  it('strips the IPC event from subscriptions and unsubscribes exactly once', () => {
    const { ipc, emit, count, raw } = fakeIpc();
    const api = createMppApi(ipc, { getPathForFile: vi.fn() });
    const settings = vi.fn();
    const files = vi.fn();
    const changed = vi.fn();
    const close = vi.fn();
    const unsubscribers = [
      api.settings.onChanged(settings),
      api.app.onOpenFiles(files),
      api.app.onFileChanged(changed),
      api.app.onCloseRequested(close),
    ];
    emit(IpcChannel.SettingsChanged, DEFAULT_SETTINGS);
    emit(IpcChannel.OpenFiles, [{ path: '/a.md' }]);
    emit(IpcChannel.OpenFiles, 'not an array');
    emit(IpcChannel.FileChangedOnDisk, { path: '/a.md', kind: 'deleted', mtimeMs: 0 });
    emit(IpcChannel.CloseRequested, 'ignored');
    expect(settings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    expect(files.mock.calls).toEqual([[[{ path: '/a.md' }]]]);
    expect(changed).toHaveBeenCalledWith({ path: '/a.md', kind: 'deleted', mtimeMs: 0 });
    expect(close).toHaveBeenCalledWith();

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
      unsubscribe();
    }
    expect(raw.removeListener).toHaveBeenCalledTimes(4);
    expect(count(IpcChannel.SettingsChanged) + count(IpcChannel.OpenFiles)).toBe(0);
  });

  it('forwards only valid menu commands', () => {
    const { ipc, emit } = fakeIpc();
    const api = createMppApi(ipc, { getPathForFile: vi.fn() });
    const listener = vi.fn();
    api.app.onMenuCommand(listener);
    emit(IpcChannel.MenuCommand, CommandId.FileSave, undefined);
    emit(IpcChannel.MenuCommand, CommandId.FileOpenRecent, '/a.md');
    emit(IpcChannel.MenuCommand, CommandId.FileOpenRecent, 42);
    emit(IpcChannel.MenuCommand, 'shell.exec', '/bin/sh');
    expect(listener.mock.calls).toEqual([
      [CommandId.FileSave],
      [CommandId.FileOpenRecent, '/a.md'],
      [CommandId.FileOpenRecent],
    ]);
  });
});
