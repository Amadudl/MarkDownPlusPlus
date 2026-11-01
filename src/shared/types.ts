import type { CommandIdValue } from './commands';
import type { Settings, SettingsPatch } from './settings';

export type EditorMode = 'wysiwyg' | 'source';
export type LineEnding = 'lf' | 'crlf';

/** A markdown file as read from disk. */
export interface FileReadResult {
  readonly path: string;
  readonly content: string;
  /** Detected line ending of the file on disk; preserved on save. */
  readonly lineEnding: LineEnding;
  /** True if the file started with a UTF-8 byte-order mark; preserved on save. */
  readonly hasBom: boolean;
  /** Modification time in epoch milliseconds, used for external change detection. */
  readonly mtimeMs: number;
}

export interface FileSaveRequest {
  readonly path: string;
  readonly content: string;
  readonly lineEnding: LineEnding;
  readonly hasBom: boolean;
}

export interface FileSaveResult {
  readonly path: string;
  readonly mtimeMs: number;
}

export interface SaveAsRequest {
  readonly suggestedName: string;
  /**
   * Current path of the document, if it has one. The dialog then starts in its
   * folder (only honoured for paths the user granted).
   */
  readonly documentPath?: string | null;
  readonly content: string;
  readonly lineEnding: LineEnding;
  readonly hasBom: boolean;
}

export interface ExportHtmlRequest {
  readonly suggestedName: string;
  /** Path of the exported document, if saved; the dialog then starts in its folder. */
  readonly documentPath?: string | null;
  /** Complete, self-contained, already sanitised HTML document. */
  readonly html: string;
}

export interface ExportPdfRequest {
  readonly suggestedName: string;
  /** Path of the exported document, if saved; the dialog then starts in its folder. */
  readonly documentPath?: string | null;
  /** Complete, self-contained, already sanitised HTML document to print. */
  readonly html: string;
}

/** Smallest and largest page width (CSS pixels) of an exported image. */
export const EXPORT_IMAGE_WIDTH_RANGE = { min: 320, max: 4000 } as const;

export interface ExportImageRequest {
  readonly suggestedName: string;
  /** Path of the exported document, if saved; the dialog then starts in its folder. */
  readonly documentPath?: string | null;
  /** Complete, self-contained, already sanitised HTML document to render. */
  readonly html: string;
  /**
   * Page width in CSS pixels (the theme's content width plus the export page padding),
   * within {@link EXPORT_IMAGE_WIDTH_RANGE}. The image is rendered at 2× this width.
   */
  readonly width: number;
}

export interface RecentFile {
  readonly path: string;
  readonly openedAt: number;
}

export interface SessionDocument {
  readonly path: string;
  readonly mode: EditorMode;
}

export interface SessionState {
  readonly documents: readonly SessionDocument[];
  readonly activePath: string | null;
}

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform:
    | 'darwin'
    | 'win32'
    | 'linux'
    | 'freebsd'
    | 'openbsd'
    | 'sunos'
    | 'aix'
    | 'android'
    | 'haiku'
    | 'cygwin'
    | 'netbsd';
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
  readonly isPortable: boolean;
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

export interface FileChangedEvent {
  readonly path: string;
  readonly kind: 'changed' | 'deleted';
  readonly mtimeMs: number;
}

export type Unsubscribe = () => void;

/**
 * How the running installation can be updated in place:
 * - `installer`: Windows NSIS installation; the new setup runs silently after the app quit;
 * - `disk-image`: macOS; the new `.dmg` is opened and the user drags the app into Applications;
 * - `appimage`: Linux AppImage; the AppImage file is replaced and the app restarts;
 * - `manual`: anything else (Windows portable, `.deb`, `.rpm`, `.tar.gz`, development
 *   builds, unknown architectures); the release page is opened in the browser.
 */
export type UpdateInstallMode = 'installer' | 'disk-image' | 'appimage' | 'manual';

/** A newer release found by the update check. Every URL was validated by the main process. */
export interface UpdateInfo {
  /** Version of the release (`major.minor.patch`). */
  readonly version: string;
  /** Version of the running app. */
  readonly currentVersion: string;
  /** Title of the GitHub release. */
  readonly releaseName: string;
  /** Release page on github.com (release notes and all downloads). */
  readonly releaseUrl: string;
  /** Publication time (ISO 8601), if GitHub reported one. */
  readonly publishedAt: string | null;
  readonly installMode: UpdateInstallMode;
  /** Size in bytes of the file that will be downloaded, or `null` for `manual`. */
  readonly downloadSize: number | null;
}

/** Result of `update.check()`. */
export type UpdateCheckResult =
  | { readonly status: 'up-to-date'; readonly currentVersion: string; readonly latestVersion: string }
  | { readonly status: 'available'; readonly update: UpdateInfo };

/**
 * What `update.install()` did: `restarting` means the app quits now to finish the update
 * (and starts again); `disk-image-opened` means the macOS disk image was opened;
 * `release-page-opened` means the release page was opened in the browser.
 */
export type UpdateInstallOutcome = 'restarting' | 'disk-image-opened' | 'release-page-opened';

/** Progress of `update.install()`, sent while it runs (and if a pending install is cancelled). */
export type UpdateProgress =
  | { readonly phase: 'downloading'; readonly receivedBytes: number; readonly totalBytes: number }
  | { readonly phase: 'verifying' }
  /** The app did not quit (a document was kept open), so the update was not finished. */
  | { readonly phase: 'cancelled'; readonly message: string };

/**
 * The complete API exposed to the renderer through `contextBridge` as
 * `window.mpp`. Every method validates its inputs on the main side as well.
 * A failed request rejects with an `Error` whose message is written for the
 * user (no Electron "Error invoking remote method" prefix).
 */
export interface MppApi {
  readonly file: {
    openDialog(): Promise<FileReadResult[]>;
    read(path: string): Promise<FileReadResult>;
    save(request: FileSaveRequest): Promise<FileSaveResult>;
    saveAs(request: SaveAsRequest): Promise<FileSaveResult | null>;
    exportHtml(request: ExportHtmlRequest): Promise<string | null>;
    exportPdf(request: ExportPdfRequest): Promise<string | null>;
    /** Exports the document as one PNG image of the whole page; returns the path or `null`. */
    exportImage(request: ExportImageRequest): Promise<string | null>;
    watch(path: string): Promise<void>;
    unwatch(path: string): Promise<void>;
    revealInFolder(path: string): Promise<void>;
    /**
     * Absolute path of a dropped `File` (Electron `webUtils.getPathForFile`),
     * and grants read/write access to it when it is a markdown or text file on
     * disk. Returns `''` for anything else (not a file on disk, not markdown).
     * Only a real `File` from a drop or file input yields a path, so the page
     * cannot grant itself arbitrary paths through it.
     */
    pathForDroppedFile(file: File): string;
  };
  readonly settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<Settings>;
    reset(): Promise<Settings>;
    onChanged(listener: (settings: Settings) => void): Unsubscribe;
  };
  readonly recent: {
    get(): Promise<RecentFile[]>;
    clear(): Promise<void>;
  };
  readonly session: {
    save(state: SessionState): Promise<void>;
    load(): Promise<SessionState | null>;
  };
  readonly app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    /**
     * Sets the window title. `representedPath` (absolute) is shown as the macOS
     * title-bar proxy icon; omit it or pass `null` for untitled documents.
     */
    setTitle(title: string, representedPath?: string | null): Promise<void>;
    setDirty(dirty: boolean): Promise<void>;
    confirmUnsaved(documentTitle: string): Promise<UnsavedChoice>;
    confirmReload(documentTitle: string): Promise<boolean>;
    /** Signals that the renderer finished its close handshake and the window may close. */
    closeReady(): Promise<void>;
    /**
     * Signals that the renderer aborted a requested close (the user kept a
     * document open), so the window stays open and a pending quit is cancelled.
     */
    closeCancelled(): Promise<void>;
    /**
     * Returns (and clears) files the OS asked us to open before the renderer was
     * ready: command-line arguments, macOS `open-file`, second-instance launches.
     */
    takePendingFiles(): Promise<FileReadResult[]>;
    onMenuCommand(listener: (command: CommandIdValue, arg?: string) => void): Unsubscribe;
    onOpenFiles(listener: (files: FileReadResult[]) => void): Unsubscribe;
    onFileChanged(listener: (event: FileChangedEvent) => void): Unsubscribe;
    onCloseRequested(listener: () => void): Unsubscribe;
  };
  /**
   * In-app updates from the GitHub releases of the project. The main process
   * decides what is downloaded; the renderer never passes a URL.
   */
  readonly update: {
    /** Asks GitHub for the latest release. Rejects with a user-facing message on failure. */
    check(): Promise<UpdateCheckResult>;
    /**
     * Downloads, verifies (SHA-256) and installs the release found by the last
     * {@link check}; `version` must be the version it reported.
     */
    install(version: string): Promise<UpdateInstallOutcome>;
    /** Fires when the background check at startup found a newer release. */
    onAvailable(listener: (update: UpdateInfo) => void): Unsubscribe;
    onProgress(listener: (progress: UpdateProgress) => void): Unsubscribe;
  };
}
