import { app, BrowserWindow, dialog, nativeTheme, screen, session } from 'electron';
import { CommandId, type CommandIdValue } from '../shared/commands';
import { IpcChannel } from '../shared/ipc';
import type { AppInfo, FileReadResult } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { extractFileArgs, PendingFileQueue } from './launch';
import { installApplicationMenu } from './menu';
import { configureUserData, preloadPath, rendererDir, userDataFile } from './paths';
import { APP_ENTRY_URL, installProtocols, registerPrivilegedSchemes } from './protocol';
import {
  buildContentSecurityPolicy,
  hardenSession,
  installGlobalSecurity,
  openExternalSafely,
  type SecurityOptions,
} from './security';
import { installRemoteImageGuard } from './remoteImages';
import { SANDBOX_WARNING_FILE, warnIfSandboxDisabled } from './sandboxWarning';
import { FileService } from './services/fileService';
import { FileWatcher } from './services/fileWatcher';
import { PathRegistry } from './services/pathRegistry';
import { RecentFiles } from './services/recentFiles';
import { SessionStore } from './services/sessionStore';
import { SettingsStore } from './services/settingsStore';
import { AppWindow, initialBackgroundColor } from './window';

/** Windows taskbar grouping id; must match `appId` of the installer configuration. */
export const APP_USER_MODEL_ID = 'io.github.amadudl.markdownplusplus';

/** The long-lived services of the main process. */
interface Services {
  readonly registry: PathRegistry;
  readonly files: FileService;
  readonly settings: SettingsStore;
  readonly recent: RecentFiles;
  readonly session: SessionStore;
  readonly watcher: FileWatcher;
}

/**
 * Only honour the dev server URL in unpackaged builds, so a packaged app can
 * never be pointed at foreign content through the environment.
 */
export function resolveDevServerUrl(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): string | null {
  const url = env.MPP_DEV_SERVER_URL?.trim() ?? '';
  return !isPackaged && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The composition root of the main process: wires the services, IPC, menu and
 * windows together and reacts to application life-cycle events.
 */
export class Application {
  private readonly pending = new PendingFileQueue();
  private readonly security: SecurityOptions;
  private services: Services | null = null;
  private quitting = false;
  private isPortable = false;
  private sandboxChecked = false;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {
    this.security = { devServerUrl: resolveDevServerUrl(process.env, app.isPackaged) };
  }

  /**
   * Starts the application. Returns false if another instance is already
   * running (the file arguments are then forwarded to it and this one quits).
   */
  async start(): Promise<boolean> {
    this.isPortable = configureUserData().isPortable;
    registerPrivilegedSchemes();
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return false;
    }
    if (this.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);
    this.pending.enqueue(this.fileArgs(process.argv, process.cwd()));
    this.registerLifecycleHandlers();
    installGlobalSecurity(this.security);

    await app.whenReady();
    hardenSession(session.defaultSession, this.security);
    installProtocols(rendererDir(), buildContentSecurityPolicy(this.security.devServerUrl), {
      // Network-share images only from servers the user opened a document from (Windows).
      allowUncHost: (host) => this.services?.registry.hasUncHost(host) ?? false,
    });
    const services = await this.createServices();
    this.services = services;
    installRemoteImageGuard(session.defaultSession, {
      allowed: () => services.settings.get().rendering.loadRemoteImages,
      settled: () => services.settings.whenIdle(),
      devServerUrl: this.security.devServerUrl,
    });
    registerIpcHandlers({
      ...services,
      appInfo: this.appInfo(),
      devServerUrl: this.security.devServerUrl,
      takePendingFiles: () => {
        this.checkSandboxOnce();
        return this.readForOpening(services, this.pending.take());
      },
    });
    this.installMenu(services);
    services.recent.onChange(() => this.installMenu(services));
    services.settings.onChange((settings) => {
      for (const window of AppWindow.all()) window.send(IpcChannel.SettingsChanged, settings);
    });
    this.createWindow(services);
    return true;
  }

  /**
   * Warns (once per launch, when the first renderer is ready) if Chromium runs
   * without its sandbox, e.g. because the AppImage launcher added `--no-sandbox`.
   */
  private checkSandboxOnce(): void {
    if (this.sandboxChecked) return;
    this.sandboxChecked = true;
    const parent = AppWindow.all()[0]?.browserWindow;
    void warnIfSandboxDisabled({
      sandboxDisabled: app.commandLine.hasSwitch('no-sandbox'),
      isAppImage: Boolean(process.env.APPIMAGE),
      stateFile: userDataFile(SANDBOX_WARNING_FILE),
      showMessageBox: (options) =>
        parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options),
    }).then((outcome) => {
      if (outcome === 'quit') app.quit();
    });
  }

  private fileArgs(argv: readonly string[], cwd: string): string[] {
    return extractFileArgs(argv, { cwd, defaultApp: process.defaultApp });
  }

  private registerLifecycleHandlers(): void {
    app.on('open-file', (event, path) => {
      event.preventDefault();
      this.openPaths([path]);
    });
    app.on('second-instance', (_event, argv, workingDirectory) => {
      this.openPaths(this.fileArgs(argv, workingDirectory));
      const window = AppWindow.all()[0];
      if (window) window.focus();
      else if (this.services) this.createWindow(this.services);
    });
    app.on('before-quit', () => {
      this.quitting = true;
    });
    app.on('window-all-closed', () => {
      if (this.platform !== 'darwin' || this.quitting) app.quit();
    });
    app.on('activate', () => {
      if (this.services && AppWindow.all().length === 0) this.createWindow(this.services);
    });
  }

  private async createServices(): Promise<Services> {
    const registry = new PathRegistry(this.platform);
    const watcher = new FileWatcher({
      emit: (ownerId, event) =>
        AppWindow.fromWebContentsId(ownerId)?.send(IpcChannel.FileChangedOnDisk, event),
    });
    const files = new FileService(registry, {
      onSaved: (path, mtimeMs) => watcher.recordOwnWrite(path, mtimeMs),
    });
    const osRecent = this.platform === 'darwin' || this.platform === 'win32';
    const recent = new RecentFiles(userDataFile('recent-files.json'), {
      platform: this.platform,
      ...(osRecent
        ? {
            hooks: {
              addRecentDocument: (path: string) => app.addRecentDocument(path),
              clearRecentDocuments: () => app.clearRecentDocuments(),
            },
          }
        : {}),
    });
    const settings = new SettingsStore(userDataFile('settings.json'));
    const session = new SessionStore(userDataFile('session.json'), this.platform);
    // Captured before any window exists, so only the previous run's session is restorable.
    await Promise.all([settings.load(), recent.load(), session.captureStartupSession()]);
    return { registry, files, settings, recent, session, watcher };
  }

  private appInfo(): AppInfo {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      isPortable: this.isPortable,
    };
  }

  private installMenu(services: Services): void {
    installApplicationMenu({
      appName: app.getName(),
      platform: this.platform,
      isPackaged: app.isPackaged,
      recentFiles: services.recent.list(),
      sendCommand: (command, arg) => {
        // Clicking an Open Recent item is a user action on a path from main's own list: grant it.
        if (command === CommandId.FileOpenRecent && arg !== undefined) services.registry.add(arg);
        this.sendCommand(services, command, arg);
      },
      openExternal: (url) => void openExternalSafely(url).catch(() => undefined),
    });
  }

  private sendCommand(services: Services, command: CommandIdValue, arg?: string): void {
    const focused = BrowserWindow.getFocusedWindow();
    const target =
      (focused ? AppWindow.fromWebContentsId(focused.webContents.id) : undefined) ??
      AppWindow.all()[0] ??
      this.createWindow(services);
    target.sendMenuCommand(command, arg);
  }

  /** Creates and loads a new application window. */
  private createWindow(services: Services): AppWindow {
    const window = new AppWindow({
      entryUrl: this.security.devServerUrl ?? APP_ENTRY_URL,
      preloadPath: preloadPath(),
      stateFile: userDataFile('window-state.json'),
      workAreas: screen.getAllDisplays().map((display) => display.workArea),
      backgroundColor: initialBackgroundColor(services.settings.get(), nativeTheme.shouldUseDarkColors),
      platform: this.platform,
      devTools: !app.isPackaged,
      onClosed: (closed) => services.watcher.unwatchOwner(closed.id),
      // Keeping a window open aborts a pending quit (Cmd+Q / app.quit()).
      onCloseCancelled: () => {
        this.quitting = false;
      },
    });
    window.load().catch((error: unknown) => console.error('Failed to load the application window:', error));
    return window;
  }

  /** Opens files requested by the OS: delivered now if a renderer is ready, else queued. */
  private openPaths(paths: readonly string[]): void {
    if (paths.length === 0) return;
    const window = AppWindow.all().find((candidate) => candidate.isRendererReady);
    if (!this.services || !window) {
      this.pending.enqueue(paths);
      // macOS keeps running without windows; a document opened from Finder then needs
      // a new window, whose renderer collects the queued paths via TakePendingFiles.
      if (this.services && AppWindow.all().length === 0) this.createWindow(this.services);
      return;
    }
    void this.readForOpening(this.services, paths).then((results) => {
      if (results.length > 0) window.send(IpcChannel.OpenFiles, results);
      window.focus();
    });
  }

  /** Grants and reads files the user asked the OS to open; unreadable files are skipped. */
  private async readForOpening(services: Services, paths: readonly string[]): Promise<FileReadResult[]> {
    const results: FileReadResult[] = [];
    for (const path of paths) {
      services.registry.add(path);
      let result: FileReadResult;
      try {
        result = await services.files.read(path);
      } catch (error) {
        console.warn(`Could not open "${path}": ${String(error)}`);
        continue;
      }
      results.push(result);
      try {
        await services.recent.add(result.path);
      } catch (error) {
        // The recent list is a convenience; it must never keep a document from opening.
        console.warn(`Could not add "${result.path}" to the recent files: ${String(error)}`);
      }
    }
    return results;
  }
}
