/**
 * Shared Playwright fixtures for the MarkDown++ end-to-end tests.
 *
 * Every test gets
 * - a fresh, isolated user data directory (`MPP_USER_DATA_DIR`),
 * - a temporary workspace with sample Markdown files (LF, CRLF + BOM, a
 *   document with a relative image, …),
 * - a `launch()` function that starts the real, built Electron app
 *   (`out/main/index.cjs`) and returns its first window, and
 * - a console collector that fails the test on any renderer console error or
 *   warning, uncaught page error, renderer crash or main-process console error.
 *
 * Teardown is guaranteed: every launched app is closed gracefully (native
 * dialogs are stubbed so a close can never block) and killed if it does not
 * exit in time, and all temporary directories are removed.
 */
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test as base,
  type ConsoleMessage,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

/** Absolute path of the built main-process bundle (`npm run build:app`). */
export const MAIN_ENTRY = resolve(import.meta.dirname, '../../out/main/index.cjs');

/**
 * The application directory passed to Electron. Its `package.json` points
 * `main` at {@link MAIN_ENTRY}; launching the directory (like `npm start`)
 * instead of the bundle file gives the app its real name and version.
 */
export const APP_DIR = resolve(import.meta.dirname, '../..');

/** True on macOS, where `CmdOrCtrl` is the Command key. */
export const IS_MAC = process.platform === 'darwin';

/** A 2×2 red PNG used as a local image. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
);

/** Sample files written into every workspace (name → content). */
export const SAMPLE_FILES: Readonly<Record<string, string | Buffer>> = {
  'notes.md': '# Notes\n\nHello **world**, this is a note.\n\n- first item\n- second item\n',
  'second.md': '# Second\n\nAnother document.\n',
  'third.md': '# Third\n\nYet another document.\n',
  'windows.md': '﻿# Windows file\r\n\r\nLine one\r\nLine two\r\n',
  'picture.md': '# Picture\n\n![A red pixel](images/pixel.png)\n',
  'images/pixel.png': PIXEL_PNG,
};

/** A temporary directory with the {@link SAMPLE_FILES}. */
export interface Workspace {
  readonly dir: string;
  /** Absolute path of a file inside the workspace. */
  path(name: string): string;
  read(name: string): Promise<string>;
  readBytes(name: string): Promise<Buffer>;
  write(name: string, content: string | Buffer): Promise<string>;
}

async function createWorkspace(): Promise<Workspace> {
  // realpath: on macOS the temp dir is a symlink (/var → /private/var).
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'mpp-e2e-ws-')));
  const workspace: Workspace = {
    dir,
    path: (name) => join(dir, name),
    read: (name) => readFile(join(dir, name), 'utf8'),
    readBytes: (name) => readFile(join(dir, name)),
    async write(name, content) {
      const target = join(dir, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      return target;
    },
  };
  for (const [name, content] of Object.entries(SAMPLE_FILES)) await workspace.write(name, content);
  return workspace;
}

/** Collects console problems of one launched app. */
export class ConsoleCollector {
  private readonly problems: string[] = [];
  private readonly allowed: RegExp[] = [];

  /** Accepts messages matching `pattern` (for tests that provoke a diagnostic on purpose). */
  allow(pattern: RegExp): void {
    this.allowed.push(pattern);
  }

  /** Records a problem unless it is allowed. */
  record(source: string, text: string): void {
    if (this.allowed.some((pattern) => pattern.test(text))) return;
    this.problems.push(`[${source}] ${text}`);
  }

  /** Problems recorded so far. */
  list(): readonly string[] {
    return [...this.problems];
  }

  /** Attaches the collector to a renderer page. */
  attachPage(page: Page): void {
    page.on('console', (message: ConsoleMessage) => {
      const type = message.type();
      if (type === 'error' || type === 'warning') {
        const location = message.location();
        this.record(`renderer ${type}`, `${message.text()} (${location.url}:${location.lineNumber})`);
      }
    });
    page.on('pageerror', (error) => this.record('pageerror', `${error.name}: ${error.message}`));
    page.on('crash', () => this.record('crash', 'The renderer process crashed'));
  }

  /** Attaches the collector to the main process console. */
  attachMain(app: ElectronApplication): void {
    app.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') this.record('main error', message.text());
    });
  }
}

/** A recorded call of a stubbed native dialog or shell function. */
export interface NativeCall {
  readonly kind: 'open' | 'save' | 'messageBox' | 'openExternal' | 'showItemInFolder';
  readonly detail: string;
}

/**
 * Replaces the native dialogs and shell functions of the main process with
 * scripted fakes and records every call. Installed on every launch: by
 * default open/save dialogs are cancelled, message boxes answer with their
 * `cancelId`, and URLs are never handed to the OS.
 */
export class NativeStubs {
  constructor(private readonly app: ElectronApplication) {}

  /** Installs the default stubs (called by `launch`). */
  async install(): Promise<void> {
    await this.app.evaluate(({ dialog, shell }) => {
      interface StubState {
        calls: { kind: string; detail: string }[];
        openPaths: string[][];
        savePaths: (string | null)[];
        responses: number[];
      }
      const holder = globalThis as unknown as { __mppStubs?: StubState };
      const state: StubState = { calls: [], openPaths: [], savePaths: [], responses: [] };
      holder.__mppStubs = state;
      const text = (value: unknown): string => (typeof value === 'string' ? value : '');
      const pickOptions = (args: unknown[]): Record<string, unknown> => {
        const last = args[args.length - 1];
        return typeof last === 'object' && last !== null ? (last as Record<string, unknown>) : {};
      };
      Object.assign(dialog, {
        showOpenDialog: (...args: unknown[]) => {
          const options = pickOptions(args);
          state.calls.push({ kind: 'open', detail: text(options.title) });
          const paths = state.openPaths.shift() ?? [];
          return Promise.resolve({ canceled: paths.length === 0, filePaths: paths });
        },
        showSaveDialog: (...args: unknown[]) => {
          const options = pickOptions(args);
          state.calls.push({
            kind: 'save',
            detail: `${text(options.title)}|${text(options.defaultPath)}`,
          });
          const path = state.savePaths.shift() ?? null;
          return Promise.resolve({ canceled: path === null, filePath: path ?? '' });
        },
        showMessageBox: (...args: unknown[]) => {
          const options = pickOptions(args);
          state.calls.push({ kind: 'messageBox', detail: text(options.message) });
          const fallback = typeof options.cancelId === 'number' ? options.cancelId : 0;
          return Promise.resolve({ response: state.responses.shift() ?? fallback, checkboxChecked: false });
        },
        showMessageBoxSync: () => 0,
        showErrorBox: (title: string, content: string) => {
          state.calls.push({ kind: 'messageBox', detail: `${title}: ${content}` });
        },
      });
      Object.assign(shell, {
        openExternal: (url: string) => {
          state.calls.push({ kind: 'openExternal', detail: url });
          return Promise.resolve();
        },
        showItemInFolder: (path: string) => {
          state.calls.push({ kind: 'showItemInFolder', detail: path });
        },
      });
    });
  }

  /** The next open dialog returns `paths` (an empty list cancels). */
  async queueOpen(paths: readonly string[]): Promise<void> {
    await this.app.evaluate(
      (_electron, value) => {
        (globalThis as unknown as { __mppStubs: { openPaths: string[][] } }).__mppStubs.openPaths.push(value);
      },
      [...paths],
    );
  }

  /** The next save dialog returns `path` (`null` cancels). */
  async queueSave(path: string | null): Promise<void> {
    await this.app.evaluate((_electron, value) => {
      (globalThis as unknown as { __mppStubs: { savePaths: (string | null)[] } }).__mppStubs.savePaths.push(
        value,
      );
    }, path);
  }

  /** The next message boxes answer with these button indices. */
  async queueMessageBox(...responses: number[]): Promise<void> {
    await this.app.evaluate((_electron, value) => {
      (globalThis as unknown as { __mppStubs: { responses: number[] } }).__mppStubs.responses.push(...value);
    }, responses);
  }

  /** Every recorded call, oldest first. */
  async calls(kind?: NativeCall['kind']): Promise<NativeCall[]> {
    const calls = await this.app.evaluate(
      () => (globalThis as unknown as { __mppStubs: { calls: NativeCall[] } }).__mppStubs.calls,
    );
    return kind === undefined ? calls : calls.filter((call) => call.kind === kind);
  }
}

/** Options of `launch()`. */
export interface LaunchOptions {
  /** Files passed on the command line. */
  readonly files?: readonly string[];
  /** Settings JSON written to `settings.json` before the launch (merged over nothing). */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Console messages the test provokes on purpose during startup (see {@link ConsoleCollector.allow}). */
  readonly allowConsole?: readonly RegExp[];
  /** Extra command-line switches for Electron/Chromium, e.g. `--no-sandbox`. */
  readonly switches?: readonly string[];
}

/** A running instance of the application. */
export interface LaunchedApp {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  readonly console: ConsoleCollector;
  readonly stubs: NativeStubs;
  /** Closes the app gracefully (answering unsaved-changes prompts with "Don't Save"). */
  close(): Promise<void>;
}

const CLOSE_TIMEOUT_MS = 15_000;

/** The Electron process, or null when Playwright already disposed it (e.g. after {@link killApp}). */
function processOf(app: ElectronApplication): ReturnType<ElectronApplication['process']> | null {
  try {
    return app.process();
  } catch {
    return null;
  }
}

async function closeApp(app: ElectronApplication, stubs: NativeStubs): Promise<void> {
  const child = processOf(app);
  // No process (already disposed) or one that already exited: nothing to close.
  if (child?.exitCode !== null || child.signalCode !== null) return;
  // Never block on a native prompt: answer "Don't Save" / "Keep My Version".
  await stubs.queueMessageBox(1, 1, 1, 1, 1, 1, 1, 1).catch(() => undefined);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolvePromise) => {
    timer = setTimeout(() => resolvePromise('timeout'), CLOSE_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([app.close().then(() => 'closed' as const), timeout]);
    if (outcome === 'timeout') child.kill('SIGKILL');
  } catch {
    child.kill('SIGKILL');
  } finally {
    clearTimeout(timer);
  }
}

/** Waits until the renderer finished its startup sequence. */
export async function waitForAppReady(window: Page): Promise<void> {
  await expect(window.locator('.app')).toBeVisible();
  await expect(window.locator('.welcome, .editor-area').first()).toBeVisible();
}

/**
 * Waits until every existing regular file passed on the command line has its tab,
 * so tests never race the asynchronous open (commands are no-ops without a document).
 */
async function waitForOpenedFiles(window: Page, files: readonly string[]): Promise<void> {
  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    await expect(tab(window, basename(file)).first()).toBeVisible();
  }
}

interface Fixtures {
  readonly userDataDir: string;
  readonly workspace: Workspace;
  readonly launch: (options?: LaunchOptions) => Promise<LaunchedApp>;
  /** The app launched without files (lazily, only for tests that use it). */
  readonly mpp: LaunchedApp;
}

/** The MarkDown++ test object (use instead of `@playwright/test`'s `test`). */
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures
  userDataDir: async ({}, use) => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), 'mpp-e2e-data-')));
    await use(dir);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures
  workspace: async ({}, use) => {
    const workspace = await createWorkspace();
    await use(workspace);
    await rm(workspace.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },

  // Depends on `workspace` (the working directory of the app) so that apps are
  // always closed before the workspace is deleted.
  launch: async ({ userDataDir, workspace }, use) => {
    const launched: LaunchedApp[] = [];
    const launch = async (options: LaunchOptions = {}): Promise<LaunchedApp> => {
      if (options.settings !== undefined) {
        await writeFile(join(userDataDir, 'settings.json'), JSON.stringify(options.settings));
      }
      if (!existsSync(MAIN_ENTRY)) throw new Error(`${MAIN_ENTRY} is missing: run "npm run build:app" first`);
      const electronApp = await electron.launch({
        args: [...(options.switches ?? []), APP_DIR, ...(options.files ?? [])],
        // Playwright adds `--no-sandbox` on Linux unless told otherwise; test the app the way
        // users run it (CI allows unprivileged user namespaces, see .github/workflows/ci.yml).
        chromiumSandbox: true,
        cwd: workspace.dir,
        env: { ...process.env, MPP_USER_DATA_DIR: userDataDir, NODE_ENV: 'test' },
      });
      const collector = new ConsoleCollector();
      for (const pattern of options.allowConsole ?? []) collector.allow(pattern);
      collector.attachMain(electronApp);
      const stubs = new NativeStubs(electronApp);
      let closed = false;
      const app: LaunchedApp = {
        electronApp,
        window: undefined as unknown as Page,
        console: collector,
        stubs,
        close: async () => {
          if (closed) return;
          closed = true;
          await closeApp(electronApp, stubs);
        },
      };
      launched.push(app);
      await stubs.install();
      const window = await electronApp.firstWindow();
      collector.attachPage(window);
      Object.assign(app, { window });
      await waitForAppReady(window);
      await waitForOpenedFiles(window, options.files ?? []);
      return app;
    };
    try {
      await use(launch);
    } finally {
      for (const app of launched) await app.close();
    }
    const problems = launched.flatMap((app) => app.console.list());
    expect(problems, 'renderer/main console errors, warnings or page errors').toEqual([]);
  },

  mpp: async ({ launch }, use) => {
    await use(await launch());
  },
});

export { expect };

// ------------------------------------------------------------------ helpers

/** Electron `sendInputEvent` modifier names. */
type Modifier = 'shift' | 'control' | 'alt' | 'meta';

/**
 * Presses an application shortcut the way a user does: through
 * `webContents.sendInputEvent`, so it passes the main process
 * `before-input-event` routing (Playwright's `page.keyboard` bypasses it).
 * `accelerator` uses Electron syntax, e.g. `CmdOrCtrl+Shift+P` or `Ctrl+Tab`.
 */
export async function pressShortcut(app: LaunchedApp, accelerator: string): Promise<void> {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const modifiers: Modifier[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl') modifiers.push(IS_MAC ? 'meta' : 'control');
    else if (lower === 'cmd') modifiers.push('meta');
    else if (lower === 'ctrl') modifiers.push('control');
    else if (lower === 'alt') modifiers.push('alt');
    else if (lower === 'shift') modifiers.push('shift');
    else throw new Error(`Unknown modifier ${part} in ${accelerator}`);
  }
  await app.electronApp.evaluate(
    ({ BrowserWindow }, input) => {
      const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (target === undefined) throw new Error('No window to send the shortcut to');
      const contents = target.webContents;
      const keyCode = input.key.length === 1 ? input.key.toUpperCase() : input.key;
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: input.modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: input.modifiers });
    },
    { key, modifiers },
  );
}

/**
 * Kills the app like an OS restart, a crash or a force quit would: no close handshake,
 * no chance to save anything on the way out.
 */
export async function killApp(app: LaunchedApp): Promise<void> {
  const child = processOf(app.electronApp);
  // No process (already disposed) or one that already exited: nothing to close.
  if (child?.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolvePromise) => child.once('exit', () => resolvePromise()));
  child.kill('SIGKILL');
  await exited;
}

/** Opens files through the stubbed "Open" dialog (toolbar-less: via the command palette command). */
export async function openViaDialog(app: LaunchedApp, paths: readonly string[]): Promise<void> {
  await app.stubs.queueOpen(paths);
  await runCommand(app, 'Open…');
}

/** Runs a command by its label from the command palette. */
export async function runCommand(app: LaunchedApp, label: string): Promise<void> {
  const { window } = app;
  await window.getByRole('button', { name: 'Command palette' }).click();
  const input = window.getByRole('combobox', { name: 'Search commands and recent files' });
  await expect(input).toBeFocused();
  await input.fill(label);
  const option = window.getByRole('option').filter({ hasText: label }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(input).toBeHidden();
}

/** The tab of a document by its title. */
export function tab(window: Page, title: string): Locator {
  return window.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name: title });
}

/** All document tabs. */
export function tabs(window: Page): Locator {
  return window.getByRole('tablist', { name: 'Open documents' }).getByRole('tab');
}

/** The visible (active) editor panel. */
export function activePanel(window: Page): Locator {
  return window.locator('.editor-panel:not([hidden])');
}

/** The WYSIWYG (ProseMirror) editable of the active document. */
export function visualEditor(window: Page): Locator {
  return activePanel(window).getByRole('textbox', { name: 'Document editor' });
}

/** The CodeMirror content element of the active document. */
export function sourceEditor(window: Page): Locator {
  return activePanel(window).getByRole('textbox', { name: 'Markdown source editor' });
}

/** Switches the active document to a mode with the mode switch. */
export async function switchMode(window: Page, mode: 'Visual' | 'Markdown'): Promise<void> {
  const option = window.getByRole('radiogroup', { name: 'Editor mode' }).getByRole('radio', { name: mode });
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await expect(mode === 'Visual' ? visualEditor(window) : sourceEditor(window)).toBeVisible();
}

/** The full text of the CodeMirror document of the active panel (not just the rendered viewport). */
export async function sourceText(window: Page): Promise<string> {
  return sourceEditor(window).evaluate((element: SourceContent) => {
    const view = element.cmTile?.root?.view;
    if (view === undefined) throw new Error('No CodeMirror view on the source editor');
    return view.state.doc.toString();
  });
}

/** CodeMirror links its content DOM element to the editor view through `cmTile.root.view`. */
interface SourceContent {
  readonly cmTile?: {
    readonly root?: { readonly view: { readonly state: { readonly doc: { toString(): string } } } };
  };
}

/** Status bar item telling whether the active document is saved. */
export function saveState(window: Page): Locator {
  return window.getByRole('contentinfo', { name: 'Status bar' }).locator('.statusbar-saved');
}
