import { realpathSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { IpcChannel, type IpcChannelName } from '../shared/ipc';
import type { IpcResult } from '../shared/ipc-result';
import type { SettingsPatch } from '../shared/settings';
import type { AppInfo, FileReadResult, SessionState } from '../shared/types';
import { confirmReload, confirmUnsaved, showOpenMarkdownDialog, showSaveMarkdownDialog } from './dialogs';
import { IpcValidationError, toIpcFailure } from './ipcErrors';
import { isAppUrl, safeExternalUrl } from './security';
import { exportHtml, exportPdf } from './services/exporter';
import { isMarkdownPath, type FileService } from './services/fileService';
import type { FileWatcher } from './services/fileWatcher';
import type { PathRegistry } from './services/pathRegistry';
import type { RecentFiles } from './services/recentFiles';
import type { SessionStore } from './services/sessionStore';
import type { SettingsStore } from './services/settingsStore';
import {
  absolutePathSchema,
  describeZodError,
  exportRequestSchema,
  fileSaveRequestSchema,
  labelSchema,
  saveAsRequestSchema,
  sessionStateSchema,
  settingsPatchSchema,
} from './validation';
import { AppWindow } from './window';

/** Services and state the IPC handlers delegate to. */
export interface IpcDependencies {
  readonly registry: PathRegistry;
  readonly files: FileService;
  readonly settings: SettingsStore;
  readonly recent: RecentFiles;
  readonly session: SessionStore;
  readonly watcher: FileWatcher;
  readonly appInfo: AppInfo;
  readonly devServerUrl: string | null;
  /** Reads and clears the files queued before the renderer was ready. */
  readonly takePendingFiles: () => Promise<FileReadResult[]>;
}

/** Context passed to every handler after validation. */
interface HandlerContext {
  readonly event: IpcMainInvokeEvent;
  /** The application window that sent the request, if any. */
  readonly window: AppWindow | undefined;
  /** The `BrowserWindow` used as dialog parent. */
  readonly parent: BrowserWindow | null;
}

export { IpcValidationError } from './ipcErrors';

/**
 * True if the request comes from the top-level frame of an application page
 * (`mpp-app://bundle` or, in development, the Vite dev server).
 */
export function isTrustedSender(
  event: Pick<IpcMainInvokeEvent, 'senderFrame'>,
  devServerUrl: string | null,
): boolean {
  const frame = event.senderFrame;
  if (frame?.parent !== null) return false;
  return isAppUrl(frame.url, devServerUrl);
}

const noArgs = z.tuple([]);
const pathArg = z.tuple([absolutePathSchema]);
const labelArg = z.tuple([labelSchema]);

/** Argument schemas of every renderer → main channel (exported for tests). */
export const ipcArgumentSchemas = {
  [IpcChannel.FileOpenDialog]: noArgs,
  [IpcChannel.FileRead]: pathArg,
  [IpcChannel.FileSave]: z.tuple([fileSaveRequestSchema]),
  [IpcChannel.FileSaveAsDialog]: z.tuple([saveAsRequestSchema]),
  [IpcChannel.FileExportHtml]: z.tuple([exportRequestSchema]),
  [IpcChannel.FileExportPdf]: z.tuple([exportRequestSchema]),
  [IpcChannel.FileWatch]: pathArg,
  [IpcChannel.FileUnwatch]: pathArg,
  [IpcChannel.FileRevealInFolder]: pathArg,
  [IpcChannel.SettingsGet]: noArgs,
  [IpcChannel.SettingsSet]: z.tuple([settingsPatchSchema]),
  [IpcChannel.SettingsReset]: noArgs,
  [IpcChannel.RecentGet]: noArgs,
  [IpcChannel.RecentClear]: noArgs,
  [IpcChannel.SessionSave]: z.tuple([sessionStateSchema]),
  [IpcChannel.SessionLoad]: noArgs,
  [IpcChannel.AppInfo]: noArgs,
  [IpcChannel.OpenExternal]: z.tuple([z.string().max(8192)]),
  [IpcChannel.WindowSetTitle]: z.tuple([labelSchema, absolutePathSchema.nullish()]),
  [IpcChannel.WindowSetDirty]: z.tuple([z.boolean()]),
  [IpcChannel.ConfirmUnsaved]: labelArg,
  [IpcChannel.ConfirmReload]: labelArg,
  [IpcChannel.CloseReady]: noArgs,
  [IpcChannel.CloseCancelled]: noArgs,
  [IpcChannel.TakePendingFiles]: noArgs,
} as const;

type InvokeChannel = keyof typeof ipcArgumentSchemas;
type Args<C extends InvokeChannel> = z.output<(typeof ipcArgumentSchemas)[C]>;

function requireWindow(context: HandlerContext): AppWindow {
  if (!context.window) throw new IpcValidationError('This request must come from an application window');
  return context.window;
}

function requireGranted(registry: PathRegistry, path: string): void {
  if (!registry.has(path))
    throw new IpcValidationError(`Access to "${path}" was not granted.`, 'not-allowed');
}

/** The folder of `documentPath` if the user granted it, so dialogs can start next to the document. */
function grantedDirectory(registry: PathRegistry, documentPath: string | null | undefined): string | null {
  return documentPath !== null && documentPath !== undefined && registry.has(documentPath)
    ? dirname(documentPath)
    : null;
}

/**
 * Grants a file the user dropped onto the window. The path comes from the
 * preload (`webUtils.getPathForFile` of a real dropped `File`), never from page
 * script, and is only granted when its target — after resolving symlinks — is
 * an existing markdown or text file.
 * @returns true if the path was granted.
 */
export function grantDroppedFile(registry: PathRegistry, rawPath: unknown): boolean {
  const parsed = absolutePathSchema.safeParse(rawPath);
  if (!parsed.success) return false;
  try {
    const target = realpathSync(parsed.data);
    if (!isMarkdownPath(target) || !statSync(target).isFile()) return false;
  } catch {
    return false;
  }
  registry.add(parsed.data);
  return true;
}

/**
 * Keeps only the documents of a session the renderer may name: paths granted
 * during this run (`isAllowed`), and an active path among them.
 */
function sessionOf(state: SessionState, isAllowed: (path: string) => boolean): SessionState {
  const documents = state.documents.filter((document) => isAllowed(document.path));
  const activePath = documents.some((document) => document.path === state.activePath)
    ? state.activePath
    : null;
  return { documents, activePath };
}

/**
 * Registers a validated handler for every renderer → main channel. Each
 * request is rejected unless it comes from an application page and its
 * arguments match the channel's schema. Handlers resolve with an
 * {@link IpcResult}: expected failures (validation, policy refusals, file
 * system errors) become `{ ok: false, code, message }` instead of a rejection,
 * which Electron would log as an error with a stack trace. Only requests from
 * untrusted senders are rejected outright.
 */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const handle = <C extends InvokeChannel>(
    channel: C,
    handler: (context: HandlerContext, ...args: Args<C>) => unknown,
  ): void => {
    ipcMain.handle(channel, async (event, ...rawArgs: unknown[]): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event, deps.devServerUrl)) {
        throw new IpcValidationError(`Rejected ${channel} from an untrusted sender`);
      }
      try {
        const parsed = ipcArgumentSchemas[channel].safeParse(rawArgs);
        if (!parsed.success) {
          throw new IpcValidationError(`Invalid arguments for ${channel}: ${describeZodError(parsed.error)}`);
        }
        const window = AppWindow.fromWebContentsId(event.sender.id);
        const context: HandlerContext = {
          event,
          window,
          parent: window?.browserWindow ?? BrowserWindow.fromWebContents(event.sender),
        };
        return { ok: true, value: await Promise.resolve(handler(context, ...(parsed.data as Args<C>))) };
      } catch (error) {
        return toIpcFailure(channel, error);
      }
    });
  };

  ipcMain.on(IpcChannel.FileGrantDropped, (event, rawPath: unknown) => {
    event.returnValue = isTrustedSender(event, deps.devServerUrl) && grantDroppedFile(deps.registry, rawPath);
  });

  /** Adds a file to the recent list; a failure there must never fail opening or saving it. */
  const remember = async (path: string): Promise<void> => {
    try {
      await deps.recent.add(path);
    } catch (error) {
      console.warn(`Could not add "${path}" to the recent files: ${String(error)}`);
    }
  };

  const readAndRemember = async (path: string): Promise<FileReadResult> => {
    const result = await deps.files.read(path);
    await remember(result.path);
    return result;
  };

  handle(IpcChannel.FileOpenDialog, async ({ parent }) => {
    const paths = await showOpenMarkdownDialog(parent);
    const results: FileReadResult[] = [];
    let firstError: Error | null = null;
    for (const path of paths) {
      deps.registry.add(path);
      try {
        results.push(await readAndRemember(path));
      } catch (error) {
        firstError ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    if (results.length === 0 && firstError !== null) throw firstError;
    return results;
  });
  handle(IpcChannel.FileRead, (_context, path) => readAndRemember(path));
  handle(IpcChannel.FileSave, (_context, request) => deps.files.save(request));
  handle(IpcChannel.FileSaveAsDialog, async ({ parent }, request) => {
    const directory = grantedDirectory(deps.registry, request.documentPath);
    const target = await showSaveMarkdownDialog(parent, request.suggestedName, directory);
    if (target === null) return null;
    const { content, lineEnding, hasBom } = request;
    const result = await deps.files.saveAs(target, { content, lineEnding, hasBom });
    await remember(result.path);
    return result;
  });
  const exportOptions = (documentPath: string | null | undefined) => ({
    directory: grantedDirectory(deps.registry, documentPath),
    imagePolicy: { allowUncHost: (host: string) => deps.registry.hasUncHost(host) },
  });
  handle(IpcChannel.FileExportHtml, ({ parent }, request) =>
    exportHtml(parent, request, exportOptions(request.documentPath)),
  );
  handle(IpcChannel.FileExportPdf, ({ parent }, request) =>
    exportPdf(parent, request, exportOptions(request.documentPath)),
  );
  handle(IpcChannel.FileWatch, ({ event }, path) => {
    requireGranted(deps.registry, path);
    return deps.watcher.watch(event.sender.id, path);
  });
  handle(IpcChannel.FileUnwatch, ({ event }, path) => {
    deps.watcher.unwatch(event.sender.id, path);
  });
  handle(IpcChannel.FileRevealInFolder, (_context, path) => {
    requireGranted(deps.registry, path);
    shell.showItemInFolder(path);
  });

  handle(IpcChannel.SettingsGet, () => deps.settings.get());
  handle(IpcChannel.SettingsSet, (_context, patch) => deps.settings.set(patch as SettingsPatch));
  handle(IpcChannel.SettingsReset, () => deps.settings.reset());

  handle(IpcChannel.RecentGet, async () => {
    const files = await deps.recent.get();
    for (const file of files) deps.registry.add(file.path);
    return files;
  });
  handle(IpcChannel.RecentClear, () => deps.recent.clear());

  // A session names files to reopen; it must never grant new ones. Saving keeps only
  // granted paths; loading grants only documents of the session found at startup
  // (written by the previous run before any renderer existed).
  handle(IpcChannel.SessionSave, (_context, state) =>
    deps.session.save(sessionOf(state, (path) => deps.registry.has(path))),
  );
  handle(IpcChannel.SessionLoad, async () => {
    const state = await deps.session.load();
    if (state === null) return null;
    const restorable = sessionOf(state, (path) => deps.registry.has(path) || deps.session.isRestorable(path));
    for (const document of restorable.documents) deps.registry.add(document.path);
    return restorable;
  });

  handle(IpcChannel.AppInfo, () => deps.appInfo);
  handle(IpcChannel.OpenExternal, async (_context, url) => {
    const safe = safeExternalUrl(url);
    if (safe === null) throw new IpcValidationError('Only http, https and mailto links can be opened.');
    await shell.openExternal(safe);
  });
  handle(IpcChannel.WindowSetTitle, (context, title, representedPath) => {
    requireWindow(context).setTitle(title, representedPath ?? null);
  });
  handle(IpcChannel.WindowSetDirty, (context, dirty) => {
    requireWindow(context).setDirty(dirty);
  });
  handle(IpcChannel.ConfirmUnsaved, (context, title) => {
    // During a close handshake the renderer is alive and waiting for the user: disarm the timeout.
    // The outcome is reported separately through CloseReady / CloseCancelled.
    requireWindow(context).acknowledgeCloseRequest();
    return confirmUnsaved(context.parent, title);
  });
  handle(IpcChannel.ConfirmReload, (context, title) => confirmReload(context.parent, title));
  handle(IpcChannel.CloseReady, (context) => {
    requireWindow(context).confirmClose();
  });
  handle(IpcChannel.CloseCancelled, (context) => {
    requireWindow(context).cancelClose();
  });
  handle(IpcChannel.TakePendingFiles, (context) => {
    requireWindow(context).markRendererReady();
    return deps.takePendingFiles();
  });
}

/** `invoke` channels handled by {@link registerIpcHandlers} (used by tests to verify completeness). */
export const HANDLED_CHANNELS: readonly IpcChannelName[] = Object.keys(
  ipcArgumentSchemas,
) as IpcChannelName[];

/** Synchronous (`sendSync`) channels handled by {@link registerIpcHandlers}. */
export const SYNC_CHANNELS: readonly IpcChannelName[] = [IpcChannel.FileGrantDropped];
