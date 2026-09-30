import { app, BrowserWindow, type Rectangle } from 'electron';
import { z } from 'zod';
import type { CommandIdValue } from '../shared/commands';
import { IpcChannel, type IpcChannelName } from '../shared/ipc';
import type { Settings } from '../shared/settings';
import { installShortcutRouting } from './keyboard';
import { readJsonFileSync, writeJsonFileSync } from './services/jsonStore';

/** Persisted position, size and maximised state of the main window. */
export interface WindowState {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized: boolean;
}

export const MIN_WINDOW_WIDTH = 640;
export const MIN_WINDOW_HEIGHT = 420;
export const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 860, isMaximized: false };
/**
 * How long the renderer has to acknowledge or answer a close request before the
 * window is force-closed (a crashed or hung renderer must never block quitting).
 */
export const CLOSE_TIMEOUT_MS = 5000;

const DARK_BACKGROUND = '#111318';
const LIGHT_BACKGROUND = '#f7f7f8';
/** Part of the window (in px) that must stay on a display so it can be grabbed. */
const MIN_VISIBLE = 64;

const windowStateSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  isMaximized: z.boolean().default(false),
});

function visibleOn(area: Rectangle, x: number, y: number, width: number): boolean {
  const overlap = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
  // The top edge (title bar) must be on the display and wide enough to grab.
  return overlap >= MIN_VISIBLE && y >= area.y && y <= area.y + area.height - MIN_VISIBLE;
}

/**
 * Validates a persisted window state against the current displays (falling
 * back to {@link DEFAULT_WINDOW_STATE}): sizes are clamped to the largest work
 * area and positions that would put the title bar off-screen (e.g. after
 * unplugging a monitor) are dropped so the window centres.
 */
export function sanitizeWindowState(raw: unknown, workAreas: readonly Rectangle[]): WindowState {
  const parsed = windowStateSchema.safeParse(raw);
  // A missing or damaged state (always the case on first launch) falls back to the
  // default size, which is clamped like a persisted one so it fits small displays.
  const state: WindowState = parsed.success ? parsed.data : DEFAULT_WINDOW_STATE;
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, ...workAreas.map((area) => area.width));
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, ...workAreas.map((area) => area.height));
  const width = Math.min(Math.max(state.width, MIN_WINDOW_WIDTH), maxWidth);
  const height = Math.min(Math.max(state.height, MIN_WINDOW_HEIGHT), maxHeight);
  const { x, y, isMaximized } = state;
  if (x !== undefined && y !== undefined && workAreas.some((area) => visibleOn(area, x, y, width))) {
    return { x, y, width, height, isMaximized };
  }
  return { width, height, isMaximized };
}

/** Reads the persisted window state (see {@link sanitizeWindowState}). */
export function loadWindowState(filePath: string, workAreas: readonly Rectangle[]): WindowState {
  return sanitizeWindowState(readJsonFileSync(filePath), workAreas);
}

/**
 * Background colour painted before the renderer's first frame, chosen from the
 * last known theme kind so the window never flashes the wrong brightness.
 */
export function initialBackgroundColor(settings: Settings, systemPrefersDark: boolean): string {
  const { appearance } = settings;
  let dark: boolean;
  if (appearance.followSystem) {
    dark = systemPrefersDark;
  } else {
    const custom = appearance.customUiThemes.find((theme) => theme.id === appearance.uiTheme);
    dark = custom ? custom.kind === 'dark' : appearance.uiTheme !== appearance.lightTheme;
  }
  return dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

/** Everything {@link AppWindow} needs from the outside. */
export interface AppWindowOptions {
  /** URL of the renderer (`mpp-app://bundle/index.html` or the dev server). */
  readonly entryUrl: string;
  readonly preloadPath: string;
  /** JSON file used to persist bounds and maximised state. */
  readonly stateFile: string;
  readonly workAreas: readonly Rectangle[];
  readonly backgroundColor: string;
  readonly platform: NodeJS.Platform;
  /** Enables the DevTools (development builds only). */
  readonly devTools: boolean;
  readonly closeTimeoutMs?: number;
  /** Called once after the window has been closed. */
  readonly onClosed?: (window: AppWindow) => void;
  /** Called when a pending close request was cancelled (the user kept the window open). */
  readonly onCloseCancelled?: (window: AppWindow) => void;
}

/**
 * True when the app runs under the automated E2E suite with
 * `MPP_E2E_BACKGROUND=1` (set by playwright.config.ts). Developers can keep
 * working while the suite runs because test windows never take focus or clicks.
 */
export function isBackgroundTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MPP_E2E_BACKGROUND === '1';
}

/**
 * Shows a window for background E2E runs: it never steals focus, is fully
 * transparent, lets mouse events pass through to whatever is underneath and
 * stays out of the taskbar. Playwright drives it through CDP, which is unaffected.
 */
export function showForBackgroundTests(win: BrowserWindow): void {
  if (process.platform === 'darwin') app.dock?.hide();
  win.setSkipTaskbar(true);
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true);
  win.showInactive();
}

/**
 * An application window: a hardened `BrowserWindow` plus its state persistence,
 * keyboard shortcut routing (see `./keyboard`), the close handshake with the
 * renderer and a queue for menu commands that arrive before the renderer is ready.
 *
 * Close handshake: a close attempt (window button, Cmd+W on the last tab,
 * `app.quit()`, Cmd+Q) is prevented and `CloseRequested` is sent. The renderer
 * then either
 * - answers `CloseReady` → the window closes for real;
 * - answers `CloseCancelled` (the user kept a document) → the close is dropped;
 * - acknowledges by asking about unsaved changes (`ConfirmUnsaved`) → the
 *   timeout is disarmed, because the user may take any time to decide.
 * A renderer that does none of this within the timeout, or that crashes, is
 * force-closed.
 */
export class AppWindow {
  private static readonly byContentsId = new Map<number, AppWindow>();

  /** Looks up the window owning a `webContents` id. */
  static fromWebContentsId(id: number): AppWindow | undefined {
    return AppWindow.byContentsId.get(id);
  }

  /** All open application windows, oldest first. */
  static all(): AppWindow[] {
    return [...AppWindow.byContentsId.values()];
  }

  readonly browserWindow: BrowserWindow;
  /** Id of the window's `webContents`, stable for the lifetime of the window. */
  readonly id: number;
  private rendererReady = false;
  private readonly queuedCommands: { command: CommandIdValue; arg: string | undefined }[] = [];
  private closeAllowed = false;
  private closePending = false;
  private rendererGone = false;
  private closeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: AppWindowOptions) {
    const state = loadWindowState(options.stateFile, options.workAreas);
    const mac = options.platform === 'darwin';
    this.browserWindow = new BrowserWindow({
      ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
      width: state.width,
      height: state.height,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      title: 'MarkDown++',
      backgroundColor: options.backgroundColor,
      ...(mac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } } : {}),
      autoHideMenuBar: false,
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        spellcheck: true,
        safeDialogs: true,
        devTools: options.devTools,
        // Invisible E2E windows must keep rendering at full speed.
        backgroundThrottling: !isBackgroundTestMode(),
      },
    });
    this.id = this.browserWindow.webContents.id;
    AppWindow.byContentsId.set(this.id, this);

    const win = this.browserWindow;
    win.once('ready-to-show', () => {
      if (isBackgroundTestMode()) {
        showForBackgroundTests(win);
        return;
      }
      if (state.isMaximized) win.maximize();
      win.show();
    });
    win.on('close', (event) => this.handleClose(event));
    win.on('closed', () => this.handleClosed());
    installShortcutRouting(win.webContents, options.platform, (command) => this.sendMenuCommand(command));
    win.webContents.on('render-process-gone', () => {
      this.rendererGone = true;
      if (this.closePending) this.forceClose();
    });
  }

  /** Starts loading the renderer. Rejects if the entry page cannot be loaded. */
  load(): Promise<void> {
    return this.browserWindow.loadURL(this.options.entryUrl);
  }

  /** Sends a message to the renderer unless the window is gone. */
  send(channel: IpcChannelName, ...args: unknown[]): void {
    if (this.browserWindow.isDestroyed()) return;
    this.browserWindow.webContents.send(channel, ...args);
  }

  /** Delivers a menu command now, or once the renderer reported that it is ready. */
  sendMenuCommand(command: CommandIdValue, arg?: string): void {
    if (this.rendererReady) this.send(IpcChannel.MenuCommand, command, arg);
    else this.queuedCommands.push({ command, arg });
  }

  /** True once the renderer pulled its pending files (it is listening for events). */
  get isRendererReady(): boolean {
    return this.rendererReady;
  }

  /** Marks the renderer as ready and flushes queued menu commands after the current turn. */
  markRendererReady(): void {
    if (this.rendererReady) return;
    this.rendererReady = true;
    setImmediate(() => {
      for (const { command, arg } of this.queuedCommands.splice(0)) this.sendMenuCommand(command, arg);
    });
  }

  /** Brings the window to the front, restoring it if minimised. */
  focus(): void {
    if (this.browserWindow.isMinimized()) this.browserWindow.restore();
    this.browserWindow.show();
    this.browserWindow.focus();
  }

  /** Updates the title and (macOS) the proxy icon of the represented file. */
  setTitle(title: string, representedPath: string | null): void {
    this.browserWindow.setTitle(title);
    if (this.options.platform === 'darwin') this.browserWindow.setRepresentedFilename(representedPath ?? '');
  }

  /** Shows the unsaved-changes indicator (macOS close button dot). */
  setDirty(dirty: boolean): void {
    if (this.options.platform === 'darwin') this.browserWindow.setDocumentEdited(dirty);
  }

  /** True while a close request waits for the renderer's answer. */
  get isClosePending(): boolean {
    return this.closePending;
  }

  /**
   * The renderer is handling the pending close request interactively (e.g. an
   * unsaved-changes dialog): disarm the force-close timeout until it answers.
   */
  acknowledgeCloseRequest(): void {
    if (this.closePending) this.clearCloseTimer();
  }

  /**
   * The renderer aborted the pending close (the user cancelled). The next close
   * attempt starts a new handshake; `onCloseCancelled` lets the application
   * abort a pending quit. Does nothing when no close is pending.
   */
  cancelClose(): void {
    if (!this.closePending) return;
    this.clearCloseTimer();
    this.closePending = false;
    this.options.onCloseCancelled?.(this);
  }

  /** The renderer finished its close handshake: close for real. */
  confirmClose(): void {
    this.clearCloseTimer();
    this.closeAllowed = true;
    if (!this.browserWindow.isDestroyed()) this.browserWindow.close();
  }

  private handleClose(event: { preventDefault(): void }): void {
    this.saveState();
    if (this.closeAllowed || this.rendererGone) return;
    event.preventDefault();
    if (this.closePending) return;
    this.closePending = true;
    this.send(IpcChannel.CloseRequested);
    const timeout = this.options.closeTimeoutMs ?? CLOSE_TIMEOUT_MS;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.forceClose();
    }, timeout);
  }

  private forceClose(): void {
    this.clearCloseTimer();
    this.closeAllowed = true;
    if (!this.browserWindow.isDestroyed()) this.browserWindow.destroy();
  }

  private handleClosed(): void {
    this.clearCloseTimer();
    AppWindow.byContentsId.delete(this.id);
    this.options.onClosed?.(this);
  }

  private clearCloseTimer(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private saveState(): void {
    const win = this.browserWindow;
    if (win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    const state: WindowState = { ...bounds, isMaximized: win.isMaximized() };
    try {
      writeJsonFileSync(this.options.stateFile, state);
    } catch (error) {
      console.warn('Could not persist the window state:', error);
    }
  }
}
