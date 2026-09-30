import { vi } from 'vitest';
import type { CommandIdValue } from '@shared/commands';
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings';
import type {
  AppInfo,
  ExportHtmlRequest,
  ExportPdfRequest,
  FileSaveRequest,
  SaveAsRequest,
  FileChangedEvent,
  FileReadResult,
  MppApi,
  RecentFile,
  SessionState,
  UnsavedChoice,
} from '@shared/types';

type Listener<T extends unknown[]> = (...args: T) => void;

function emitter<T extends unknown[]>(): {
  subscribe: (listener: Listener<T>) => () => void;
  emit: (...args: T) => void;
  count: () => number;
} {
  const listeners = new Set<Listener<T>>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (...args) => {
      for (const listener of [...listeners]) listener(...args);
    },
    count: () => listeners.size,
  };
}

/** Mutable state behind the fake API, inspectable by tests. */
export interface FakeApiState {
  settings: Settings;
  files: Map<string, FileReadResult>;
  recent: RecentFile[];
  session: SessionState | null;
  pending: FileReadResult[];
  openDialogResult: FileReadResult[];
  saveAsPath: string | null;
  unsavedChoice: UnsavedChoice;
  info: AppInfo;
  mtime: number;
}

/** A complete in-memory `MppApi` with `vi.fn` spies and event emitters. */
export interface FakeApi extends MppApi {
  readonly state: FakeApiState;
  readonly emit: {
    menuCommand(command: CommandIdValue, arg?: string): void;
    openFiles(files: FileReadResult[]): void;
    fileChanged(event: FileChangedEvent): void;
    closeRequested(): void;
    settingsChanged(settings: Settings): void;
  };
  readonly listenerCounts: () => Record<string, number>;
}

/** Builds a file as the main process would return it. */
export function fakeFile(
  path: string,
  content = '# Hello\n',
  overrides: Partial<FileReadResult> = {},
): FileReadResult {
  return { path, content, lineEnding: 'lf', hasBom: false, mtimeMs: 1000, ...overrides };
}

export const FAKE_APP_INFO: AppInfo = {
  name: 'MarkDown++',
  version: '1.0.0',
  platform: 'linux',
  electron: '44.4.5',
  chrome: '140.0.0',
  node: '22.20.0',
  isPortable: false,
};

/** Creates a fake API. Pass files to pre-populate the in-memory file system. */
export function createFakeApi(files: readonly FileReadResult[] = []): FakeApi {
  const state: FakeApiState = {
    settings: DEFAULT_SETTINGS,
    files: new Map(files.map((file) => [file.path, file])),
    recent: [],
    session: null,
    pending: [],
    openDialogResult: [],
    saveAsPath: null,
    unsavedChoice: 'discard',
    info: FAKE_APP_INFO,
    mtime: 1000,
  };
  const menu = emitter<[CommandIdValue, string | undefined]>();
  const open = emitter<[FileReadResult[]]>();
  const changed = emitter<[FileChangedEvent]>();
  const close = emitter<[]>();
  const settingsChanged = emitter<[Settings]>();

  const write = (
    path: string,
    content: string,
    lineEnding: FileReadResult['lineEnding'],
    hasBom: boolean,
  ): number => {
    state.mtime += 1;
    state.files.set(path, { path, content, lineEnding, hasBom, mtimeMs: state.mtime });
    return state.mtime;
  };

  const api: FakeApi = {
    state,
    file: {
      openDialog: vi.fn(() => Promise.resolve(state.openDialogResult)),
      read: vi.fn((path: string) => {
        const file = state.files.get(path);
        return file === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(file);
      }),
      save: vi.fn((request: FileSaveRequest) =>
        Promise.resolve({
          path: request.path,
          mtimeMs: write(request.path, request.content, request.lineEnding, request.hasBom),
        }),
      ),
      saveAs: vi.fn((request: SaveAsRequest) => {
        const path = state.saveAsPath;
        if (path === null) return Promise.resolve(null);
        return Promise.resolve({
          path,
          mtimeMs: write(path, request.content, request.lineEnding, request.hasBom),
        });
      }),
      exportHtml: vi.fn((request: ExportHtmlRequest) => Promise.resolve(`/exports/${request.suggestedName}`)),
      exportPdf: vi.fn((request: ExportPdfRequest) => Promise.resolve(`/exports/${request.suggestedName}`)),
      watch: vi.fn(() => Promise.resolve()),
      unwatch: vi.fn(() => Promise.resolve()),
      revealInFolder: vi.fn(() => Promise.resolve()),
      pathForDroppedFile: vi.fn((file: File) => `/dropped/${file.name}`),
    },
    settings: {
      get: vi.fn(() => Promise.resolve(state.settings)),
      set: vi.fn((patch: SettingsPatch) => {
        state.settings = applySettingsPatch(state.settings, patch);
        return Promise.resolve(state.settings);
      }),
      reset: vi.fn(() => {
        state.settings = DEFAULT_SETTINGS;
        return Promise.resolve(state.settings);
      }),
      onChanged: vi.fn((listener: (settings: Settings) => void) => settingsChanged.subscribe(listener)),
    },
    recent: {
      get: vi.fn(() => Promise.resolve(state.recent)),
      clear: vi.fn(() => {
        state.recent = [];
        return Promise.resolve();
      }),
    },
    session: {
      save: vi.fn((session: SessionState) => {
        state.session = session;
        return Promise.resolve();
      }),
      load: vi.fn(() => Promise.resolve(state.session)),
    },
    app: {
      info: vi.fn(() => Promise.resolve(state.info)),
      openExternal: vi.fn(() => Promise.resolve()),
      setTitle: vi.fn(() => Promise.resolve()),
      setDirty: vi.fn(() => Promise.resolve()),
      confirmUnsaved: vi.fn(() => Promise.resolve(state.unsavedChoice)),
      confirmReload: vi.fn(() => Promise.resolve(true)),
      closeReady: vi.fn(() => Promise.resolve()),
      closeCancelled: vi.fn(() => Promise.resolve()),
      takePendingFiles: vi.fn(() => {
        const pending = state.pending;
        state.pending = [];
        return Promise.resolve(pending);
      }),
      onMenuCommand: vi.fn((listener: (command: CommandIdValue, arg?: string) => void) =>
        menu.subscribe((command, arg) => listener(command, arg)),
      ),
      onOpenFiles: vi.fn((listener: (files: FileReadResult[]) => void) => open.subscribe(listener)),
      onFileChanged: vi.fn((listener: (event: FileChangedEvent) => void) => changed.subscribe(listener)),
      onCloseRequested: vi.fn((listener: () => void) => close.subscribe(listener)),
    },
    emit: {
      menuCommand: (command, arg) => menu.emit(command, arg),
      openFiles: (items) => open.emit(items),
      fileChanged: (event) => changed.emit(event),
      closeRequested: () => close.emit(),
      settingsChanged: (settings) => settingsChanged.emit(settings),
    },
    listenerCounts: () => ({
      menu: menu.count(),
      openFiles: open.count(),
      fileChanged: changed.count(),
      closeRequested: close.count(),
      settingsChanged: settingsChanged.count(),
    }),
  };
  return api;
}

/** Creates a fake API and exposes it as `window.mpp`. */
export function installFakeApi(files: readonly FileReadResult[] = []): FakeApi {
  const api = createFakeApi(files);
  (window as unknown as { mpp?: MppApi }).mpp = api;
  return api;
}

/** Removes `window.mpp`. */
export function uninstallFakeApi(): void {
  delete (window as unknown as { mpp?: MppApi }).mpp;
}
