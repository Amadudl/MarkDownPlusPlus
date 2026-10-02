/**
 * The single source of truth for every IPC channel between the main process and
 * the renderer. Both sides import these constants so a typo becomes a compile error.
 * Every `invoke` channel resolves with an `IpcResult` envelope (`./ipc-result`).
 */
export const IpcChannel = {
  // renderer -> main (invoke / handle)
  FileOpenDialog: 'file:open-dialog',
  FileRead: 'file:read',
  FileSave: 'file:save',
  FileSaveAsDialog: 'file:save-as-dialog',
  FileExportHtml: 'file:export-html',
  FileExportPdf: 'file:export-pdf',
  FileExportImage: 'file:export-image',
  FileWatch: 'file:watch',
  FileUnwatch: 'file:unwatch',
  FileRevealInFolder: 'file:reveal',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsReset: 'settings:reset',
  RecentGet: 'recent:get',
  RecentClear: 'recent:clear',
  SessionSave: 'session:save',
  SessionLoad: 'session:load',
  AppInfo: 'app:info',
  OpenExternal: 'app:open-external',
  WindowSetTitle: 'window:set-title',
  WindowSetDirty: 'window:set-dirty',
  ConfirmUnsaved: 'dialog:confirm-unsaved',
  ConfirmReload: 'dialog:confirm-reload',
  CloseReady: 'window:close-ready',
  CloseCancelled: 'window:close-cancelled',
  TakePendingFiles: 'app:take-pending-files',
  // renderer -> main (sendSync / on), only sent by the preload itself
  FileGrantDropped: 'file:grant-dropped',
  // main -> renderer (send / on)
  MenuCommand: 'menu:command',
  OpenFiles: 'app:open-files',
  FileChangedOnDisk: 'file:changed-on-disk',
  CloseRequested: 'window:close-requested',
  SettingsChanged: 'settings:changed',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
