/**
 * Wires the {@link UpdateService} to Electron: the network session, the shell,
 * relaunching, the per-user download folder, the test-only API override and the
 * background check after startup.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, session, shell } from 'electron';
import type { UpdateCheckResult, UpdateInfo, UpdateProgress } from '../shared/types';
import { openExternalSafely } from './security';
import { createHttpGet } from './services/httpClient';
import { detectInstallTarget, LATEST_RELEASE_API_URL } from './services/updateCore';
import { UpdateService } from './services/updateService';

/** Delay between the first window becoming ready and the background update check. */
export const STARTUP_CHECK_DELAY_MS = 4000;

/** In-memory session of the update requests: no cookies, cache or credentials on disk. */
export const UPDATE_SESSION_PARTITION = 'mpp-updates';

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Where the update check asks for the latest release. */
export interface UpdateApiLocation {
  readonly url: string;
  /** True when `MPP_UPDATE_API_URL` replaced the GitHub endpoint (development and E2E tests only). */
  readonly overridden: boolean;
}

/**
 * The latest-release endpoint. `MPP_UPDATE_API_URL` replaces it only in
 * unpackaged builds and only with a loopback `http(s)` URL (the local stub of the
 * E2E tests), so a packaged app can never be pointed at another server.
 */
export function resolveUpdateApiUrl(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): UpdateApiLocation {
  const raw = env.MPP_UPDATE_API_URL?.trim() ?? '';
  if (isPackaged || raw === '') return { url: LATEST_RELEASE_API_URL, overridden: false };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: LATEST_RELEASE_API_URL, overridden: false };
  }
  const loopback =
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.username === '' &&
    url.password === '';
  return loopback ? { url: url.href, overridden: true } : { url: LATEST_RELEASE_API_URL, overridden: false };
}

/** Starts `file` with `args` detached from the app, so it outlives it. */
export function spawnDetached(file: string, args: readonly string[]): void {
  const child = spawn(file, [...args], { detached: true, stdio: 'ignore' });
  child.on('error', (error) => console.error(`Could not start the update installer ${file}:`, error));
  child.unref();
}

/** Callbacks the application provides to the update service. */
export interface UpdateHooks {
  readonly onProgress: (progress: UpdateProgress) => void;
  readonly requestQuit: () => void;
}

/** Creates the update service for the running copy of the app. */
export function createUpdateService(api: UpdateApiLocation, hooks: UpdateHooks): UpdateService {
  const version = app.getVersion();
  return new UpdateService({
    currentVersion: version,
    target: detectInstallTarget({
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      runningUnderArm64Translation: app.runningUnderARM64Translation,
      env: process.env,
      execPath: process.execPath,
      fileExists: existsSync,
    }),
    httpGet: createHttpGet(() => session.fromPartition(UPDATE_SESSION_PARTITION)),
    apiUrl: api.url,
    // A folder only this app uses, inside its user data (not the shared %TEMP% or
    // $TMPDIR, where other programs of the user create and replace files). The
    // AppImage is downloaded next to itself instead, see UpdateService.
    downloadDir: join(app.getPath('userData'), 'updates'),
    userAgent: `MarkDownPlusPlus/${version} (+https://github.com/Amadudl/MarkDownPlusPlus)`,
    openPath: (path) => shell.openPath(path),
    openExternal: openExternalSafely,
    requestQuit: hooks.requestQuit,
    relaunch: (execPath) => app.relaunch({ execPath, args: [] }),
    spawnDetached,
    onProgress: hooks.onProgress,
  });
}

/** Inputs of {@link scheduleStartupUpdateCheck}. */
export interface StartupCheckOptions {
  readonly delayMs: number;
  /** Read when the timer fires, so a setting changed meanwhile is honoured. */
  readonly enabled: () => boolean;
  readonly check: () => Promise<UpdateCheckResult>;
  readonly announce: (update: UpdateInfo) => void;
}

/**
 * Runs one background update check after `delayMs`. It never blocks startup;
 * a failure is only logged (the user sees errors of manual checks only).
 * @returns a function that cancels the check if it has not started yet.
 */
export function scheduleStartupUpdateCheck(options: StartupCheckOptions): () => void {
  const timer = setTimeout(() => {
    if (!options.enabled()) return;
    options.check().then(
      (result) => {
        if (result.status === 'available') options.announce(result.update);
      },
      (error: unknown) => {
        console.warn(
          `The update check at startup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  }, options.delayMs);
  return () => clearTimeout(timer);
}
