import type { IpcRenderer, IpcRendererEvent, WebUtils } from 'electron';
import { isCommandId, type CommandIdValue } from '../shared/commands';
import { IpcChannel, type IpcChannelName } from '../shared/ipc';
import { unwrapIpcResult } from '../shared/ipc-result';
import type { Settings } from '../shared/settings';
import type { FileChangedEvent, FileReadResult, MppApi, Unsubscribe } from '../shared/types';

/** The parts of `ipcRenderer` the API needs (narrow for testability). */
export type IpcRendererLike = Pick<IpcRenderer, 'invoke' | 'sendSync' | 'on' | 'removeListener'>;
/** The parts of `webUtils` the API needs. */
export type WebUtilsLike = Pick<WebUtils, 'getPathForFile'>;

/**
 * Creates the `window.mpp` API on top of `ipcRenderer`. Every method forwards
 * to exactly one IPC channel and unwraps its `IpcResult` envelope, so a failed
 * request rejects with the main process's user-facing message; event
 * subscriptions strip the `IpcRendererEvent` (which would expose `sender`) and
 * return an unsubscribe function.
 */
export function createMppApi(ipc: IpcRendererLike, webUtils: WebUtilsLike): MppApi {
  const invoke = async <T>(channel: IpcChannelName, ...args: unknown[]): Promise<T> =>
    unwrapIpcResult(await ipc.invoke(channel, ...args)) as T;

  /**
   * Resolves the path of a dropped `File` and asks main to grant it. Only the
   * preload can send this: the page has no `ipcRenderer`, and it cannot forge a
   * `File` with a disk path (`getPathForFile` returns '' for those). The call
   * is synchronous so the grant is in place before the page reads the file.
   */
  const grantDroppedFile = (file: File): string => {
    const path = webUtils.getPathForFile(file);
    if (path === '') return '';
    return ipc.sendSync(IpcChannel.FileGrantDropped, path) === true ? path : '';
  };

  const subscribe = (channel: IpcChannelName, forward: (...args: unknown[]) => void): Unsubscribe => {
    const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => forward(...args);
    ipc.on(channel, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      ipc.removeListener(channel, listener);
    };
  };

  return {
    file: {
      openDialog: () => invoke<FileReadResult[]>(IpcChannel.FileOpenDialog),
      read: (path) => invoke(IpcChannel.FileRead, path),
      save: (request) => invoke(IpcChannel.FileSave, request),
      saveAs: (request) => invoke(IpcChannel.FileSaveAsDialog, request),
      exportHtml: (request) => invoke(IpcChannel.FileExportHtml, request),
      exportPdf: (request) => invoke(IpcChannel.FileExportPdf, request),
      exportImage: (request) => invoke(IpcChannel.FileExportImage, request),
      watch: (path) => invoke(IpcChannel.FileWatch, path),
      unwatch: (path) => invoke(IpcChannel.FileUnwatch, path),
      revealInFolder: (path) => invoke(IpcChannel.FileRevealInFolder, path),
      pathForDroppedFile: grantDroppedFile,
    },
    settings: {
      get: () => invoke(IpcChannel.SettingsGet),
      set: (patch) => invoke(IpcChannel.SettingsSet, patch),
      reset: () => invoke(IpcChannel.SettingsReset),
      onChanged: (listener) =>
        subscribe(IpcChannel.SettingsChanged, (settings) => listener(settings as Settings)),
    },
    recent: {
      get: () => invoke(IpcChannel.RecentGet),
      clear: () => invoke(IpcChannel.RecentClear),
    },
    session: {
      save: (state) => invoke(IpcChannel.SessionSave, state),
      load: () => invoke(IpcChannel.SessionLoad),
    },
    app: {
      info: () => invoke(IpcChannel.AppInfo),
      openExternal: (url) => invoke(IpcChannel.OpenExternal, url),
      setTitle: (title, representedPath) =>
        representedPath === undefined
          ? invoke(IpcChannel.WindowSetTitle, title)
          : invoke(IpcChannel.WindowSetTitle, title, representedPath),
      setDirty: (dirty) => invoke(IpcChannel.WindowSetDirty, dirty),
      confirmUnsaved: (documentTitle) => invoke(IpcChannel.ConfirmUnsaved, documentTitle),
      confirmReload: (documentTitle) => invoke(IpcChannel.ConfirmReload, documentTitle),
      closeReady: () => invoke(IpcChannel.CloseReady),
      closeCancelled: () => invoke(IpcChannel.CloseCancelled),
      takePendingFiles: () => invoke(IpcChannel.TakePendingFiles),
      onMenuCommand: (listener) =>
        subscribe(IpcChannel.MenuCommand, (command, arg) => {
          // Defence in depth: only forward known commands with a string argument.
          if (!isCommandId(command)) return;
          const commandId: CommandIdValue = command;
          if (typeof arg === 'string') listener(commandId, arg);
          else listener(commandId);
        }),
      onOpenFiles: (listener) =>
        subscribe(IpcChannel.OpenFiles, (files) => {
          if (Array.isArray(files)) listener(files as FileReadResult[]);
        }),
      onFileChanged: (listener) =>
        subscribe(IpcChannel.FileChangedOnDisk, (event) => listener(event as FileChangedEvent)),
      onCloseRequested: (listener) => subscribe(IpcChannel.CloseRequested, () => listener()),
    },
  };
}
